import { createClient as createServerClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/logger';
import { RecoveryAction } from '@/types/recovery';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
 * Scans for PENDING recovery actions that are due (scheduled_for <= now) and transitions them to SCHEDULED.
 * Updates next_eligible_action_at on the associated recovery case and logs ACTION_SCHEDULED audit events.
 *
 * @param now Reference timestamp (defaults to current Date)
 * @param client Optional SupabaseClient instance
 * @returns Array of transitioned SCHEDULED RecoveryAction objects
 */
export async function schedulePendingActions(
  now?: Date,
  client?: SupabaseClient
): Promise<RecoveryAction[]> {
  const db = await getClient(client);
  const cutoff = (now ?? new Date()).toISOString();

  // 1. Fetch PENDING actions where scheduled_for <= cutoff
  const { data: pendingActions, error: fetchError } = await db
    .from('recovery_actions')
    .select('*')
    .eq('status', 'PENDING')
    .lte('scheduled_for', cutoff);

  if (fetchError) {
    throw new Error(
      `Failed to fetch pending actions for scheduling: ${fetchError.message}`
    );
  }

  if (!pendingActions || pendingActions.length === 0) {
    return [];
  }

  const scheduledActions: RecoveryAction[] = [];

  for (const action of pendingActions) {
    // Transition PENDING -> SCHEDULED
    const { data: updatedAction, error: updateError } = await db
      .from('recovery_actions')
      .update({
        status: 'SCHEDULED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', action.id)
      .eq('status', 'PENDING') // Concurrency check
      .select()
      .maybeSingle();

    if (updateError) {
      continue;
    }

    if (updatedAction) {
      const scheduled = updatedAction as RecoveryAction;
      scheduledActions.push(scheduled);

      // Update next_eligible_action_at on recovery_cases
      if (scheduled.recovery_case_id) {
        await db
          .from('recovery_cases')
          .update({
            next_eligible_action_at: scheduled.scheduled_for,
            updated_at: new Date().toISOString(),
          })
          .eq('id', scheduled.recovery_case_id);
      }

      // Log audit event ACTION_SCHEDULED
      await logAuditEvent(
        {
          recoveryCaseId: scheduled.recovery_case_id,
          eventType: 'ACTION_SCHEDULED',
          actor: 'action_scheduler',
          reason: `Action '${scheduled.action_type}' scheduled for execution`,
          metadata: {
            actionId: scheduled.id,
            actionType: scheduled.action_type,
            scheduledFor: scheduled.scheduled_for,
          },
        },
        db
      );
    }
  }

  return scheduledActions;
}

/**
 * Fetches all SCHEDULED recovery actions that are due for execution (scheduled_for <= now).
 *
 * @param now Reference timestamp (defaults to current Date)
 * @param client Optional SupabaseClient instance
 * @returns Array of due SCHEDULED RecoveryAction objects
 */
export async function getDueScheduledActions(
  now?: Date,
  client?: SupabaseClient
): Promise<RecoveryAction[]> {
  const db = await getClient(client);
  const cutoff = (now ?? new Date()).toISOString();

  const { data, error } = await db
    .from('recovery_actions')
    .select('*')
    .in('status', ['PENDING', 'SCHEDULED'])
    .lte('scheduled_for', cutoff);

  if (error) {
    throw new Error(
      `Failed to fetch due scheduled actions: ${error.message}`
    );
  }

  return (data || []) as RecoveryAction[];
}
