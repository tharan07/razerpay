import { FailureCategory } from '@/types/recovery';

export interface FailureInput {
  failureCode?: string | null;
  failureDescription?: string | null;
}

export interface FailureMappingRule {
  category: FailureCategory;
  codes?: string[];
  keywords?: string[];
}

/**
 * Centralized configurable failure mapping rules.
 * Rules are evaluated in priority order.
 */
export const FAILURE_MAPPING_RULES: FailureMappingRule[] = [
  {
    category: 'FRAUD_FLAGGED',
    codes: [
      'FRAUD_SUSPECTED',
      'SECURITY_FLAG',
      'HIGH_RISK_TRANSACTION',
      'STOLEN_CARD',
      'BLACKLISTED',
    ],
    keywords: [
      'fraud flag',
      'security flag',
      'fraud/security flag',
      'fraud suspected',
      'high risk transaction',
      'stolen card',
      'suspicious activity',
    ],
  },
  {
    category: 'TERMINAL',
    codes: [
      'SUBSCRIPTION_CANCELLED',
      'SUBSCRIPTION_COMPLETED',
      'ACCOUNT_CLOSED',
      'PERMANENT_FAILURE',
      'CARD_BLOCKED_PERMANENTLY',
    ],
    keywords: [
      'subscription cancelled',
      'subscription revoked',
      'subscription terminated',
      'account closed',
      'permanently blocked',
    ],
  },
  {
    category: 'NEEDS_CUSTOMER_ACTION',
    codes: [
      'EXPIRED_CARD',
      'CARD_EXPIRED',
      'INVALID_CARD',
      'MANDATE_EXPIRED',
      'MANDATE_INACTIVE',
      'MANDATE_REVOKED',
      'AUTHENTICATION_FAILED',
      'CUSTOMER_ACTION_REQUIRED',
      'PAYMENT_METHOD_INVALID',
    ],
    keywords: [
      'expired payment method',
      'card expired',
      'expired card',
      'mandate issue',
      'mandate expired',
      'invalid mandate',
      'payment method issue',
      'customer action required',
      'authentication failed',
    ],
  },
  {
    category: 'RETRYABLE',
    codes: [
      'BAD_REQUEST_PAYMENT_FAILED',
      'INSUFFICIENT_FUNDS',
      'GATEWAY_ERROR',
      'BANK_ERROR',
      'GATEWAY_TIMEOUT',
      'SERVER_ERROR',
      'TEMPORARY_FAILURE',
      'NETWORK_ERROR',
      'TIMED_OUT',
    ],
    keywords: [
      'insufficient funds',
      'insufficient balance',
      'low balance',
      'temporary bank issue',
      'temporary bank failure',
      'bank issue',
      'bank timeout',
      'bank server down',
      'gateway timeout',
      'gateway error',
      'timed out',
    ],
  },
];

/**
 * Classifies a failure into a FailureCategory based on failure code and/or description.
 *
 * Matching is normalized (case-insensitive and trimmed).
 * If no known failure pattern is matched, returns 'UNKNOWN'.
 *
 * @param input Object containing optional failureCode and failureDescription
 * @returns FailureCategory
 */
export function classifyFailure(input: FailureInput): FailureCategory {
  const codeNormalized = input.failureCode
    ? input.failureCode.trim().toLowerCase()
    : '';
  const descNormalized = input.failureDescription
    ? input.failureDescription.trim().toLowerCase()
    : '';

  if (!codeNormalized && !descNormalized) {
    return 'UNKNOWN';
  }

  for (const rule of FAILURE_MAPPING_RULES) {
    // 1. Check exact/normalized code match
    if (codeNormalized && rule.codes) {
      if (rule.codes.some((c) => c.toLowerCase() === codeNormalized)) {
        return rule.category;
      }
    }

    // 2. Check keyword/substring match in description or code
    if (rule.keywords) {
      for (const keyword of rule.keywords) {
        const kwLower = keyword.toLowerCase();
        if (
          (descNormalized && descNormalized.includes(kwLower)) ||
          (codeNormalized && codeNormalized.includes(kwLower))
        ) {
          return rule.category;
        }
      }
    }
  }

  return 'UNKNOWN';
}
