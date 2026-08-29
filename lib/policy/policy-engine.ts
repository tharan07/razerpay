import { evaluateContactPolicy } from '@/lib/policy/contact-policy';
import { DEFAULT_POLICY_CONFIG } from '@/lib/policy/policy-config';
import { evaluateStoppingRules } from '@/lib/policy/stopping-rules';
import {
  FailureCategory,
  PolicyDecisionResult,
  PolicyInput,
  RecoveryStrategy,
} from '@/types/recovery';

export interface EvaluatePolicyOptions {
  maxRetries?: number;
  maxContactAttempts?: number;
  maxContactFrequencyHours?: number;
  now?: Date;
}

/**
 * Central deterministic policy and compliance engine.
 *
 * Combines stopping rules, contact policy, failure category, subscription state,
 * retry/contact caps, and recovery window into a single deterministic decision.
 *
 * Priority Order:
 * 1. Already recovered -> STOP
 * 2. Cancelled/terminal subscription -> STOP
 * 3. Fraud flagged -> ESCALATE (never allows automatic recovery actions)
 * 4. Recovery window expired -> STOP
 * 5. Retry cap reached -> STOP
 * 6. Customer opt-out -> BLOCK
 * 7. Contact cap reached -> BLOCK
 * 8. Quiet hours / contact frequency -> BLOCK (with earliestExecutionTime)
 * 9. Otherwise -> ALLOW
 *
 * @param input PolicyInput matching types/recovery.ts
 * @param options Optional policy limit overrides
 * @returns PolicyDecisionResult
 */
export function evaluatePolicy(
  input: PolicyInput,
  options?: EvaluatePolicyOptions
): PolicyDecisionResult {
  const maxRetries = options?.maxRetries ?? DEFAULT_POLICY_CONFIG.maxRetries;
  const maxContacts =
    options?.maxContactAttempts ?? DEFAULT_POLICY_CONFIG.maxContactAttempts;
  const maxFreqHours =
    options?.maxContactFrequencyHours ??
    DEFAULT_POLICY_CONFIG.maxContactFrequencyHours;
  const now = options?.now ?? new Date();

  const retryCapRemaining = Math.max(0, maxRetries - input.retryCount);
  const contactCapRemaining = Math.max(
    0,
    maxContacts - input.contactAttemptCount
  );

  const blockedReasons: string[] = [];

  // Priority 1: Stopping Rules (Recovered, Cancelled, Fraud, Expired, Retry Cap)
  const stopping = evaluateStoppingRules({
    subscriptionStatus: input.subscriptionStatus,
    failureCategory: input.failureCategory,
    retryCount: input.retryCount,
    maxRetries,
    allowedRecoveryWindow: input.allowedRecoveryWindow,
  });

  if (stopping.shouldStop && stopping.decision) {
    if (stopping.decision === 'ESCALATE') {
      return {
        allowed: false,
        decision: 'ESCALATE',
        allowedActions: ['ESCALATE_TO_HUMAN'],
        blockedReasons: [stopping.reason || 'FRAUD_FLAGGED'],
        retryCapRemaining,
        contactCapRemaining,
      };
    }

    if (stopping.decision === 'STOP') {
      const isCancelled =
        input.subscriptionStatus.toLowerCase() === 'cancelled' ||
        input.failureCategory === 'TERMINAL';
      return {
        allowed: false,
        decision: 'STOP',
        allowedActions: isCancelled ? ['STOP_RECOVERY'] : [],
        blockedReasons: [stopping.reason || 'STOP_RECOVERY'],
        retryCapRemaining,
        contactCapRemaining,
      };
    }
  }

  // Priority 2: Contact Policy (Opt-out, Contact Cap, Frequency Limit, Quiet Hours)
  const contactPolicy = evaluateContactPolicy({
    customerOptedOut: input.customerOptedOut,
    contactAttemptCount: input.contactAttemptCount,
    maxContactAttempts: maxContacts,
    lastContactAt: input.lastContactAt,
    maxContactFrequencyHours: maxFreqHours,
    quietHoursActive: input.quietHoursActive,
    now,
  });

  const category = input.failureCategory as FailureCategory;

  if (!contactPolicy.allowed) {
    if (contactPolicy.blockedReason) {
      blockedReasons.push(contactPolicy.blockedReason);
    }

    // If blocked due to Opt-out or Contact Cap
    if (
      contactPolicy.blockedReason === 'CUSTOMER_OPTED_OUT' ||
      contactPolicy.blockedReason === 'MAX_CONTACT_ATTEMPTS_REACHED'
    ) {
      const allowedActions: RecoveryStrategy[] =
        category === 'RETRYABLE' ? ['WAIT_AND_MONITOR'] : [];

      return {
        allowed: false,
        decision: 'BLOCK',
        allowedActions,
        blockedReasons,
        retryCapRemaining,
        contactCapRemaining,
      };
    }

    // If delayed due to Quiet Hours or Contact Frequency Limit
    if (
      contactPolicy.blockedReason === 'QUIET_HOURS_ACTIVE' ||
      contactPolicy.blockedReason === 'CONTACT_FREQUENCY_LIMIT'
    ) {
      let allowedActions: RecoveryStrategy[] = ['WAIT_AND_MONITOR'];
      if (category === 'NEEDS_CUSTOMER_ACTION') {
        allowedActions = [
          'REQUEST_PAYMENT_METHOD_UPDATE',
          'SEND_RECOVERY_MESSAGE',
          'SEND_RECOVERY_LINK',
          'CUSTOMER_ACTION_REQUIRED',
        ];
      }

      return {
        allowed: false,
        decision: 'BLOCK',
        allowedActions,
        blockedReasons,
        earliestExecutionTime: contactPolicy.earliestAllowedAt,
        retryCapRemaining,
        contactCapRemaining,
      };
    }
  }

  // Priority 3: Otherwise ALLOW
  let allowedActions: RecoveryStrategy[] = [];
  if (category === 'RETRYABLE') {
    allowedActions = [
      'WAIT_AND_MONITOR',
      'SEND_RECOVERY_MESSAGE',
      'SEND_RECOVERY_LINK',
    ];
  } else if (category === 'NEEDS_CUSTOMER_ACTION') {
    allowedActions = [
      'REQUEST_PAYMENT_METHOD_UPDATE',
      'SEND_RECOVERY_MESSAGE',
      'SEND_RECOVERY_LINK',
      'CUSTOMER_ACTION_REQUIRED',
    ];
  } else if (category === 'FRAUD_FLAGGED') {
    allowedActions = ['ESCALATE_TO_HUMAN'];
  } else {
    allowedActions = ['WAIT_AND_MONITOR'];
  }

  return {
    allowed: true,
    decision: 'ALLOW',
    allowedActions,
    blockedReasons: [],
    retryCapRemaining,
    contactCapRemaining,
  };
}
