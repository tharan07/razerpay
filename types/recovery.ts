/**
 * RecoverAI — Recovery Domain Types
 * Authoritative Specification: RecoverAI-Specification.md
 */

// 1. FailureCategory
export type FailureCategory =
  | 'RETRYABLE'
  | 'NEEDS_CUSTOMER_ACTION'
  | 'TERMINAL'
  | 'FRAUD_FLAGGED'
  | 'UNKNOWN';

// 2. RecoveryCaseStatus
export type RecoveryCaseStatus =
  | 'NEW'
  | 'CLASSIFIED'
  | 'VERIFYING'
  | 'POLICY_PENDING'
  | 'BLOCKED'
  | 'ACTION_PLANNED'
  | 'WAITING'
  | 'ACTION_EXECUTING'
  | 'AWAITING_OUTCOME'
  | 'RECOVERED'
  | 'CUSTOMER_ACTION_REQUIRED'
  | 'ESCALATED'
  | 'STOPPED'
  | 'EXPIRED';

// 3. RecoveryActionStatus
export type RecoveryActionStatus =
  | 'PENDING'
  | 'SCHEDULED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'BLOCKED';

// 4. RecoveryOutcome
export type RecoveryOutcome =
  | 'RECOVERED'
  | 'NOT_RECOVERED'
  | 'ESCALATED'
  | 'STOPPED'
  | 'EXPIRED';

// 5. AttributionStatus
export type AttributionStatus =
  | 'AGENT_ATTRIBUTED'
  | 'BASELINE_ATTRIBUTED'
  | 'CUSTOMER_INDEPENDENT'
  | 'UNKNOWN';

// 6. RecoveryStrategy
export type RecoveryStrategy =
  | 'WAIT_AND_MONITOR'
  | 'SEND_RECOVERY_MESSAGE'
  | 'REQUEST_PAYMENT_METHOD_UPDATE'
  | 'SEND_RECOVERY_LINK'
  | 'CUSTOMER_ACTION_REQUIRED'
  | 'ESCALATE_TO_HUMAN'
  | 'STOP_RECOVERY';

// 7. PolicyDecision
export type PolicyDecision =
  | 'ALLOW'
  | 'BLOCK'
  | 'ESCALATE'
  | 'STOP';

// 8. PolicyInput interface matching the specification
export interface PolicyInput {
  caseId: string;
  subscriptionStatus: string;
  failureCategory: FailureCategory | string;
  amount: number;
  retryCount: number;
  contactAttemptCount: number;
  customerOptedOut: boolean;
  quietHoursActive: boolean;
  lastContactAt?: Date;
  allowedRecoveryWindow: boolean;
}

// 9. PolicyDecisionResult interface matching the specification's PolicyDecision output structure
export interface PolicyDecisionResult {
  allowed: boolean;
  decision: PolicyDecision;
  allowedActions: string[];
  blockedReasons: string[];
  earliestExecutionTime?: Date;
  retryCapRemaining: number;
  contactCapRemaining: number;
}

// 10. Basic domain interfaces for RecoveryCase, RecoveryAction, and RecoveryOutcome
export interface RecoveryCase {
  id: string;
  subscription_id?: string | null;
  payment_attempt_id?: string | null;
  customer_id?: string | null;
  status: RecoveryCaseStatus;
  failure_category?: FailureCategory | null;
  recovery_strategy?: RecoveryStrategy | null;
  retry_count: number;
  contact_attempt_count: number;
  max_retries: number;
  max_contact_attempts: number;
  next_eligible_action_at?: string | Date | null;
  attribution_window_hours: number;
  opened_at: string | Date;
  resolved_at?: string | Date | null;
  stop_reason?: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface RecoveryAction {
  id: string;
  recovery_case_id?: string | null;
  action_type: string;
  status: RecoveryActionStatus;
  scheduled_for?: string | Date | null;
  executed_at?: string | Date | null;
  completed_at?: string | Date | null;
  cancelled_at?: string | Date | null;
  failed_at?: string | Date | null;
  failure_reason?: string | null;
  blocked_reason?: string | null;
  idempotency_key: string;
  metadata?: Record<string, unknown> | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface RecoveryOutcomeRecord {
  id: string;
  recovery_case_id?: string | null;
  outcome: RecoveryOutcome;
  recovered_amount?: number | null;
  attribution_status?: AttributionStatus | null;
  attribution_reason?: string | null;
  recovered_at?: string | Date | null;
  created_at: string | Date;
}
