import { DEFAULT_POLICY_CONFIG } from '@/lib/policy/policy-config';

export interface ContactPolicyInput {
  customerOptedOut: boolean;
  contactAttemptCount: number;
  maxContactAttempts?: number;
  lastContactAt?: Date;
  maxContactFrequencyHours?: number;
  quietHoursActive?: boolean;
  now?: Date;
}

export interface ContactPolicyResult {
  allowed: boolean;
  reason?: string;
  blockedReason?: string;
  earliestAllowedAt?: Date;
}

/**
 * Pure, deterministic contact policy evaluator.
 *
 * Enforces customer contact fatigue rules:
 * - OPTED OUT -> BLOCK
 * - CONTACT CAP REACHED -> BLOCK
 * - RECENT CONTACT (frequency limit) -> WAIT (delayed execution)
 * - QUIET HOURS -> WAIT (delayed execution)
 * - OTHERWISE -> ALLOW
 */
export function evaluateContactPolicy(
  input: ContactPolicyInput
): ContactPolicyResult {
  const maxContacts =
    input.maxContactAttempts ?? DEFAULT_POLICY_CONFIG.maxContactAttempts;
  const maxFreqHours =
    input.maxContactFrequencyHours ??
    DEFAULT_POLICY_CONFIG.maxContactFrequencyHours;
  const now = input.now ?? new Date();

  // 1. Customer Opted Out -> BLOCK
  if (input.customerOptedOut) {
    return {
      allowed: false,
      reason: 'Customer opted out of communications',
      blockedReason: 'CUSTOMER_OPTED_OUT',
    };
  }

  // 2. Contact Cap Reached -> BLOCK
  if (input.contactAttemptCount >= maxContacts) {
    return {
      allowed: false,
      reason: `Maximum contact attempts limit (${maxContacts}) reached`,
      blockedReason: 'MAX_CONTACT_ATTEMPTS_REACHED',
    };
  }

  // 3. Contact Frequency Limit -> WAIT
  if (input.lastContactAt) {
    const nextEligibleTime = new Date(
      input.lastContactAt.getTime() + maxFreqHours * 60 * 60 * 1000
    );
    if (now < nextEligibleTime) {
      return {
        allowed: false,
        reason: `Contact frequency limit (${maxFreqHours}h) has not elapsed since last contact`,
        blockedReason: 'CONTACT_FREQUENCY_LIMIT',
        earliestAllowedAt: nextEligibleTime,
      };
    }
  }

  // 4. Quiet Hours -> WAIT
  if (input.quietHoursActive) {
    // Delay until end of quiet hours (default 8 AM next morning)
    const nextWindow = new Date(now);
    if (now.getHours() >= DEFAULT_POLICY_CONFIG.quietHoursStartHour) {
      nextWindow.setDate(nextWindow.getDate() + 1);
    }
    nextWindow.setHours(DEFAULT_POLICY_CONFIG.quietHoursEndHour, 0, 0, 0);

    return {
      allowed: false,
      reason: 'Quiet hours are active for customer',
      blockedReason: 'QUIET_HOURS_ACTIVE',
      earliestAllowedAt: nextWindow,
    };
  }

  // 5. Otherwise -> ALLOW
  return {
    allowed: true,
    reason: 'Contact policy passed',
  };
}
