import { DEFAULT_POLICY_CONFIG } from '@/lib/policy/policy-config';
import { FailureCategory, PolicyDecision } from '@/types/recovery';

export interface StoppingRulesInput {
  subscriptionStatus: string;
  failureCategory: FailureCategory | string;
  retryCount: number;
  maxRetries?: number;
  allowedRecoveryWindow: boolean;
}

export interface StoppingRulesResult {
  shouldStop: boolean;
  decision?: PolicyDecision;
  reason?: string;
}

/**
 * Pure, deterministic stopping rules evaluator.
 *
 * Evaluates core stopping condition priorities:
 * 1. Already recovered -> STOP
 * 2. Cancelled/terminal subscription -> STOP
 * 3. Fraud flagged -> ESCALATE
 * 4. Recovery window expired -> EXPIRE
 * 5. Retry cap reached -> STOP
 */
export function evaluateStoppingRules(
  input: StoppingRulesInput
): StoppingRulesResult {
  const statusLower = input.subscriptionStatus.toLowerCase().trim();
  const maxRetries = input.maxRetries ?? DEFAULT_POLICY_CONFIG.maxRetries;

  // 1. Payment Already Recovered -> STOP
  if (statusLower === 'active' || statusLower === 'recovered' || statusLower === 'completed') {
    return {
      shouldStop: true,
      decision: 'STOP',
      reason: 'Subscription payment already recovered or active',
    };
  }

  // 2. Subscription Cancelled / Terminal -> STOP
  if (
    statusLower === 'cancelled' ||
    statusLower === 'terminated' ||
    input.failureCategory === 'TERMINAL'
  ) {
    return {
      shouldStop: true,
      decision: 'STOP',
      reason: 'Subscription is cancelled or in terminal failure state',
    };
  }

  // 3. Fraud Flagged -> ESCALATE
  if (input.failureCategory === 'FRAUD_FLAGGED') {
    return {
      shouldStop: true,
      decision: 'ESCALATE',
      reason: 'Fraud or high-risk flag detected; requires human escalation',
    };
  }

  // 4. Recovery Window Expired -> EXPIRE (or STOP)
  if (!input.allowedRecoveryWindow) {
    return {
      shouldStop: true,
      decision: 'STOP', // or EXPIRE in case status
      reason: 'Allowed recovery time window has expired',
    };
  }

  // 5. Retry Cap Reached -> STOP
  if (input.retryCount >= maxRetries) {
    return {
      shouldStop: true,
      decision: 'STOP',
      reason: `Maximum retry attempts limit (${maxRetries}) reached`,
    };
  }

  return {
    shouldStop: false,
  };
}
