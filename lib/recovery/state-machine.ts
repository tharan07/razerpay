import { RecoveryCaseStatus } from '@/types/recovery';

/**
 * Deterministic transition map for RecoveryCaseStatus.
 *
 * Primary flow & branches strictly based on RecoverAI Specification Section 6:
 *
 * 1.  NEW                      -> CLASSIFIED
 * 2.  CLASSIFIED               -> VERIFYING
 * 3.  VERIFYING                -> RECOVERED (if already recovered)
 *                              -> STOPPED (if subscription cancelled)
 *                              -> POLICY_PENDING (if proceeding to policy engine)
 * 4.  POLICY_PENDING           -> BLOCKED (if policy engine blocks)
 *                              -> ACTION_PLANNED (if policy engine allows)
 *                              -> EXPIRED (if case timeout occurs)
 * 5.  BLOCKED                  -> ESCALATED (requires human intervention)
 *                              -> STOPPED (case permanently terminated)
 * 6.  ACTION_PLANNED           -> WAITING (scheduled for execution window)
 *                              -> RECOVERED (payment succeeded out-of-band)
 *                              -> STOPPED (cancelled/capped out-of-band)
 *                              -> EXPIRED (case window elapsed)
 * 7.  WAITING                  -> ACTION_EXECUTING (execution started)
 *                              -> RECOVERED (payment succeeded out-of-band)
 *                              -> STOPPED (cancelled/capped out-of-band)
 *                              -> EXPIRED (case window elapsed)
 * 8.  ACTION_EXECUTING         -> AWAITING_OUTCOME (action executed, waiting signal)
 *                              -> CUSTOMER_ACTION_REQUIRED (needs customer input)
 *                              -> ESCALATED (execution requires human review)
 *                              -> RECOVERED / STOPPED / EXPIRED (out-of-band resolution)
 * 9.  CUSTOMER_ACTION_REQUIRED -> AWAITING_OUTCOME (customer responded or retry triggered)
 *                              -> RECOVERED (payment succeeded)
 *                              -> ACTION_PLANNED (re-planning next intervention)
 *                              -> ESCALATED (customer action timed out to human)
 *                              -> STOPPED / EXPIRED (capped or window closed)
 * 10. AWAITING_OUTCOME         -> RECOVERED (payment succeeds)
 *                              -> STOPPED (retry/contact cap reached or cancelled)
 *                              -> ACTION_PLANNED (unresolved, next action loop)
 *                              -> EXPIRED (case window expired)
 *                              -> ESCALATED (unresolved issue escalated)
 * 11. RECOVERED                -> (Terminal State)
 * 12. ESCALATED                -> (Terminal State)
 * 13. STOPPED                  -> (Terminal State)
 * 14. EXPIRED                  -> (Terminal State)
 */
export const VALID_TRANSITIONS: Record<
  RecoveryCaseStatus,
  readonly RecoveryCaseStatus[]
> = {
  NEW: ['CLASSIFIED'],
  CLASSIFIED: ['VERIFYING'],
  VERIFYING: ['RECOVERED', 'STOPPED', 'POLICY_PENDING'],
  POLICY_PENDING: ['BLOCKED', 'ACTION_PLANNED', 'EXPIRED'],
  BLOCKED: ['ESCALATED', 'STOPPED'],
  ACTION_PLANNED: ['WAITING', 'RECOVERED', 'STOPPED', 'EXPIRED'],
  WAITING: ['ACTION_EXECUTING', 'RECOVERED', 'STOPPED', 'EXPIRED'],
  ACTION_EXECUTING: [
    'AWAITING_OUTCOME',
    'CUSTOMER_ACTION_REQUIRED',
    'ESCALATED',
    'RECOVERED',
    'STOPPED',
    'EXPIRED',
  ],
  CUSTOMER_ACTION_REQUIRED: [
    'AWAITING_OUTCOME',
    'RECOVERED',
    'ACTION_PLANNED',
    'ESCALATED',
    'STOPPED',
    'EXPIRED',
  ],
  AWAITING_OUTCOME: [
    'RECOVERED',
    'STOPPED',
    'ACTION_PLANNED',
    'EXPIRED',
    'ESCALATED',
  ],
  RECOVERED: [],
  ESCALATED: [],
  STOPPED: [],
  EXPIRED: [],
};

/**
 * Checks whether transitioning from one status to another is valid.
 *
 * @param from The current RecoveryCaseStatus
 * @param to The target RecoveryCaseStatus
 * @returns boolean true if allowed, false otherwise
 */
export function canTransition(
  from: RecoveryCaseStatus,
  to: RecoveryCaseStatus
): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

/**
 * Performs a deterministic state transition for a recovery case.
 *
 * @param from The current RecoveryCaseStatus
 * @param to The target RecoveryCaseStatus
 * @returns The target RecoveryCaseStatus if valid
 * @throws Error if the transition is invalid
 */
export function transition(
  from: RecoveryCaseStatus,
  to: RecoveryCaseStatus
): RecoveryCaseStatus {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid recovery case state transition from '${from}' to '${to}'.`
    );
  }
  return to;
}
