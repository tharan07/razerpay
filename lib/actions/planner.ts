import { createClient as createServerClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/logger';
import {
  generateActionIdempotencyKey,
  verifyActionIdempotency,
} from '@/lib/actions/idempotency';
import {
  PolicyDecisionResult,
  RecoveryAction,
  RecoveryCase,
  RecoveryStrategy,
} from '@/types/recovery';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface PlanActionInput {
  recoveryCase: RecoveryCase;
  policyResult: PolicyDecisionResult;
  preferredStrategy?: RecoveryStrategy;
  now?: Date;
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
 * Plans a new recovery action for a recovery case strictly constrained by the Policy Engine.
 *
 * Requirements:
 * - Only plans strategies permitted in policyResult.allowedActions.
 * - Rejects planning if policy decision is BLOCK, STOP, or ESCALATE with no executable actions.
 * - Generates a deterministic idempotency_key for the planned action.
 * - Prevents duplicate pending/scheduled actions for the same case & strategy.
 * - Sets scheduled_for to earliestExecutionTime if quiet hours/frequency limits apply.
 * - Logs audit event ACTION_PLANNED.
 */
export async function planRecoveryAction(
  input: PlanActionInput,
  client?: SupabaseClient
): Promise<RecoveryAction | null> {
  const db = await getClient(client);
  const { recoveryCase, policyResult } = input;
  const now = input.now ?? new Date();

  // 1. Verify policy decision allows action planning
  if (
    !policyResult.allowedActions ||
    policyResult.allowedActions.length === 0
  ) {
    return null;
  }

  // 2. Select strategy from allowedActions
  let selectedStrategy = input.preferredStrategy;
  if (
    !selectedStrategy ||
    !policyResult.allowedActions.includes(selectedStrategy)
  ) {
    selectedStrategy = policyResult.allowedActions[0] as RecoveryStrategy;
  }

  // Do not plan automatic execution for fraud escalation or stop recovery
  if (
    selectedStrategy === 'ESCALATE_TO_HUMAN' ||
    selectedStrategy === 'STOP_RECOVERY'
  ) {
    return null;
  }

  // 3. Check if there is an existing PENDING or SCHEDULED action for this case and strategy
  const { data: existingPending } = await db
    .from('recovery_actions')
    .select('*')
    .eq('recovery_case_id', recoveryCase.id)
    .eq('action_type', selectedStrategy)
    .in('status', ['PENDING', 'SCHEDULED'])
    .maybeSingle();

  if (existingPending) {
    return existingPending as RecoveryAction;
  }

  // 4. Count existing actions for this case to determine sequence
  const { count } = await db
    .from('recovery_actions')
    .select('*', { count: 'exact', head: true })
    .eq('recovery_case_id', recoveryCase.id);

  const sequence = (count ?? 0) + 1;
  const idempotencyKey = generateActionIdempotencyKey(
    recoveryCase.id,
    selectedStrategy,
    sequence
  );

  // 5. Verify idempotency
  const alreadyExists = await verifyActionIdempotency(idempotencyKey, db);
  if (alreadyExists) {
    const { data: existingAction } = await db
      .from('recovery_actions')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .single();
    return existingAction as RecoveryAction;
  }

  // 6. Determine scheduled_for time
  const scheduledFor =
    policyResult.earliestExecutionTime &&
    policyResult.earliestExecutionTime > now
      ? policyResult.earliestExecutionTime.toISOString()
      : now.toISOString();

  // 7. Insert action with PENDING status
  const insertPayload = {
    recovery_case_id: recoveryCase.id,
    action_type: selectedStrategy,
    status: 'PENDING',
    scheduled_for: scheduledFor,
    idempotency_key: idempotencyKey,
    metadata: {
      plannedBy: 'policy_engine',
      sequence,
      allowedActions: policyResult.allowedActions,
    },
  };

  const { data: createdAction, error } = await db
    .from('recovery_actions')
    .insert(insertPayload)
    .select()
    .single();

  if (error || !createdAction) {
    throw new Error(
      `Failed to plan recovery action for case ${recoveryCase.id}: ${
        error?.message || 'Unknown database error'
      }`
    );
  }

  // 8. Log audit event ACTION_PLANNED
  await logAuditEvent(
    {
      recoveryCaseId: recoveryCase.id,
      eventType: 'ACTION_PLANNED',
      actor: 'action_planner',
      previousState: recoveryCase.status,
      newState: recoveryCase.status,
      reason: `Action '${selectedStrategy}' planned with idempotency key ${idempotencyKey}`,
      metadata: {
        actionId: createdAction.id,
        actionType: selectedStrategy,
        idempotencyKey,
        scheduledFor,
      },
    },
    db
  );

  return createdAction as RecoveryAction;
}
