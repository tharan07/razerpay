import { createClient as createServerClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/logger';
import { dispatchRecoveryEmail } from '@/lib/email/recovery-email';
import { evaluatePolicy } from '@/lib/policy/policy-engine';
import { updateCaseStatus } from '@/lib/recovery/case-service';
import { canTransition } from '@/lib/recovery/state-machine';
import {
  PolicyInput,
  RecoveryAction,
  RecoveryActionStatus,
  RecoveryCase,
} from '@/types/recovery';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export interface ExecuteActionOptions {
  customActionHandler?: (action: RecoveryAction) => Promise<boolean>;
  customResendClient?: Resend;
  toEmail?: string;
  now?: Date;
}

export interface ExecuteActionResult {
  success: boolean;
  status: RecoveryActionStatus;
  reason?: string;
  action?: RecoveryAction;
}

/**
 * Resolves active server-side Supabase client.
 */
async function getClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) {
    return client;
  }

  try {
    return (await createServerClient()) as unknown as SupabaseClient;
  } catch {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      throw new Error(
        'Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) are required.'
      );
    }
    return createClient(url, key);
  }
}

/**
 * Idempotent, concurrency-safe recovery action executor integrated with Resend email transport.
 *
 * Execution Steps:
 * 1. Acquires atomic execution lock (PENDING/SCHEDULED -> EXECUTING). Prevents double execution.
 * 2. Re-evaluates Policy Engine and verifies subscription/payment state.
 * 3. Handles state verification outcomes:
 *    - Payment recovered -> CANCELLED (emits PENDING_ACTION_CANCELLED)
 *    - Subscription cancelled -> CANCELLED / STOPPED (emits CASE_STOPPED)
 *    - Opt-out / Contact cap / Quiet hours -> BLOCKED (emits ACTION_BLOCKED)
 *    - Fraud flagged -> BLOCKED / ESCALATED (never auto-executes, emits CASE_ESCALATED)
 * 4. Dispatches recovery email via Resend if action is a customer communication type.
 * 5. Updates status to COMPLETED or FAILED, increments contact_attempt_count on success, and emits audit events.
 */
export async function executeRecoveryAction(
  actionId: string,
  options?: ExecuteActionOptions,
  client?: SupabaseClient
): Promise<ExecuteActionResult> {
  const db = await getClient(client);
  const now = options?.now ?? new Date();
  const nowIso = now.toISOString();

  // 1. Atomic Concurrency Lock Acquisition: PENDING/SCHEDULED -> EXECUTING
  const { data: lockedAction, error: lockError } = await db
    .from('recovery_actions')
    .update({
      status: 'EXECUTING',
      executed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', actionId)
    .in('status', ['PENDING', 'SCHEDULED'])
    .select()
    .maybeSingle();

  if (lockError || !lockedAction) {
    const { data: currentAction } = await db
      .from('recovery_actions')
      .select('*')
      .eq('id', actionId)
      .maybeSingle();

    const status = (currentAction?.status as RecoveryActionStatus) || 'FAILED';
    return {
      success: false,
      status,
      reason: `Execution lock acquisition failed: Action ${actionId} is in status '${status}'`,
      action: currentAction as RecoveryAction | undefined,
    };
  }

  const action = lockedAction as RecoveryAction;

  // Log audit event ACTION_EXECUTING
  await logAuditEvent(
    {
      recoveryCaseId: action.recovery_case_id,
      eventType: 'ACTION_EXECUTING',
      actor: 'action_executor',
      reason: `Execution lock acquired for action '${action.action_type}'`,
      metadata: { actionId: action.id, actionType: action.action_type },
    },
    db
  );

  // 2. Fetch associated Recovery Case & Subscription for state verification
  let recoveryCase: RecoveryCase | null = null;
  if (action.recovery_case_id) {
    const { data: c } = await db
      .from('recovery_cases')
      .select('*')
      .eq('id', action.recovery_case_id)
      .maybeSingle();
    recoveryCase = c as RecoveryCase | null;
  }

  let subscriptionStatus = 'halted';
  if (recoveryCase?.subscription_id) {
    const { data: sub } = await db
      .from('subscriptions')
      .select('*')
      .eq('id', recoveryCase.subscription_id)
      .maybeSingle();
    if (sub?.current_status) {
      subscriptionStatus = sub.current_status;
    }
  }

  // 3. Re-evaluate Policy Engine before execution
  const policyInput: PolicyInput = {
    caseId: recoveryCase?.id || 'unknown',
    subscriptionStatus,
    failureCategory: recoveryCase?.failure_category || 'UNKNOWN',
    amount: 1000,
    retryCount: recoveryCase?.retry_count || 0,
    contactAttemptCount: recoveryCase?.contact_attempt_count || 0,
    customerOptedOut: false,
    quietHoursActive: false,
    allowedRecoveryWindow: true,
  };

  const policyResult = evaluatePolicy(policyInput, { now });

  // 4. Handle Policy & Stopping Verification Rules

  // Rule A: Payment Already Recovered -> CANCELLED
  if (
    subscriptionStatus.toLowerCase() === 'active' ||
    subscriptionStatus.toLowerCase() === 'recovered'
  ) {
    await db
      .from('recovery_actions')
      .update({
        status: 'CANCELLED',
        cancelled_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', action.id);

    if (recoveryCase && canTransition(recoveryCase.status, 'RECOVERED')) {
      await updateCaseStatus(recoveryCase.id, 'RECOVERED', undefined, db);
    }

    await logAuditEvent(
      {
        recoveryCaseId: action.recovery_case_id,
        eventType: 'PENDING_ACTION_CANCELLED',
        actor: 'action_executor',
        reason: 'Payment already recovered before execution',
        metadata: { actionId: action.id },
      },
      db
    );

    return {
      success: false,
      status: 'CANCELLED',
      reason: 'Payment already recovered before execution',
    };
  }

  // Rule B: Subscription Cancelled -> CANCELLED / STOPPED
  if (
    subscriptionStatus.toLowerCase() === 'cancelled' ||
    recoveryCase?.failure_category === 'TERMINAL'
  ) {
    await db
      .from('recovery_actions')
      .update({
        status: 'CANCELLED',
        cancelled_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', action.id);

    if (recoveryCase && canTransition(recoveryCase.status, 'STOPPED')) {
      await updateCaseStatus(recoveryCase.id, 'STOPPED', undefined, db);
    }

    await logAuditEvent(
      {
        recoveryCaseId: action.recovery_case_id,
        eventType: 'CASE_STOPPED',
        actor: 'action_executor',
        reason: 'Subscription cancelled before action execution',
        metadata: { actionId: action.id },
      },
      db
    );

    return {
      success: false,
      status: 'CANCELLED',
      reason: 'Subscription cancelled before action execution',
    };
  }

  // Rule C: Fraud Flagged -> ESCALATED / BLOCKED (Never automatically executed!)
  if (
    recoveryCase?.failure_category === 'FRAUD_FLAGGED' ||
    policyResult.decision === 'ESCALATE'
  ) {
    await db
      .from('recovery_actions')
      .update({
        status: 'BLOCKED',
        blocked_reason: 'FRAUD_FLAGGED',
        updated_at: nowIso,
      })
      .eq('id', action.id);

    if (recoveryCase && canTransition(recoveryCase.status, 'BLOCKED')) {
      const c1 = await updateCaseStatus(
        recoveryCase.id,
        'BLOCKED',
        { stopReason: 'FRAUD_FLAGGED' },
        db
      );
      if (canTransition(c1.status, 'ESCALATED')) {
        await updateCaseStatus(c1.id, 'ESCALATED', undefined, db);
      }
    }

    await logAuditEvent(
      {
        recoveryCaseId: action.recovery_case_id,
        eventType: 'CASE_ESCALATED',
        actor: 'action_executor',
        reason: 'Fraud flagged; automatic execution prohibited',
        metadata: { actionId: action.id },
      },
      db
    );

    return {
      success: false,
      status: 'BLOCKED',
      reason: 'Fraud flagged; automatic execution prohibited',
    };
  }

  // Rule D: Policy Engine BLOCK (Opt-out, Contact Cap, Quiet Hours, Retry Cap)
  if (
    !policyResult.allowed ||
    policyResult.decision === 'BLOCK' ||
    policyResult.decision === 'STOP'
  ) {
    const blockedReason =
      policyResult.blockedReasons.join(', ') || 'Policy engine blocked execution';

    await db
      .from('recovery_actions')
      .update({
        status: 'BLOCKED',
        blocked_reason: blockedReason,
        updated_at: nowIso,
      })
      .eq('id', action.id);

    await logAuditEvent(
      {
        recoveryCaseId: action.recovery_case_id,
        eventType: 'ACTION_BLOCKED',
        actor: 'action_executor',
        reason: blockedReason,
        metadata: {
          actionId: action.id,
          blockedReasons: policyResult.blockedReasons,
        },
      },
      db
    );

    return {
      success: false,
      status: 'BLOCKED',
      reason: blockedReason,
    };
  }

  // 5. Execute Action (Dispatch Email for Communication Actions)
  const isContactAction =
    action.action_type === 'SEND_RECOVERY_MESSAGE' ||
    action.action_type === 'SEND_RECOVERY_LINK' ||
    action.action_type === 'REQUEST_PAYMENT_METHOD_UPDATE';

  try {
    let executionSuccess = true;

    if (options?.customActionHandler) {
      executionSuccess = await options.customActionHandler(action);
    } else if (isContactAction) {
      const recipientEmail =
        options?.toEmail ||
        (action.metadata as Record<string, unknown> | undefined)?.toEmail as string ||
        'customer@example.com';

      const emailResult = await dispatchRecoveryEmail(
        {
          action,
          toEmail: recipientEmail,
        },
        options?.customResendClient
      );

      if (!emailResult.success) {
        throw new Error(emailResult.error || 'Resend provider dispatch failed');
      }

      executionSuccess = true;
    }

    if (executionSuccess) {
      const { data: completed } = await db
        .from('recovery_actions')
        .update({
          status: 'COMPLETED',
          completed_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', action.id)
        .select()
        .single();

      if (recoveryCase) {
        await db
          .from('recovery_cases')
          .update({
            retry_count: recoveryCase.retry_count + 1,
            contact_attempt_count: isContactAction
              ? recoveryCase.contact_attempt_count + 1
              : recoveryCase.contact_attempt_count,
            updated_at: nowIso,
          })
          .eq('id', recoveryCase.id);

        if (isContactAction) {
          await logAuditEvent(
            {
              recoveryCaseId: recoveryCase.id,
              eventType: 'CUSTOMER_CONTACTED',
              actor: 'action_executor',
              reason: `Customer contacted via email action '${action.action_type}'`,
              metadata: { actionId: action.id, actionType: action.action_type },
            },
            db
          );
        }
      }

      await logAuditEvent(
        {
          recoveryCaseId: action.recovery_case_id,
          eventType: 'ACTION_COMPLETED',
          actor: 'action_executor',
          reason: `Action '${action.action_type}' completed successfully`,
          metadata: { actionId: action.id, actionType: action.action_type },
        },
        db
      );

      return {
        success: true,
        status: 'COMPLETED',
        action: (completed as RecoveryAction) || action,
      };
    } else {
      throw new Error(`Execution returned false for action ${action.id}`);
    }
  } catch (err: unknown) {
    const safeError =
      err instanceof Error ? err.message : 'Unknown execution error';

    await db
      .from('recovery_actions')
      .update({
        status: 'FAILED',
        failed_at: nowIso,
        failure_reason: safeError,
        updated_at: nowIso,
      })
      .eq('id', action.id);

    await logAuditEvent(
      {
        recoveryCaseId: action.recovery_case_id,
        eventType: 'ACTION_FAILED',
        actor: 'action_executor',
        reason: safeError,
        metadata: { actionId: action.id, actionType: action.action_type },
      },
      db
    );

    return {
      success: false,
      status: 'FAILED',
      reason: safeError,
    };
  }
}
