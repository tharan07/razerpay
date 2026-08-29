import { createClient as createServerClient } from '@/lib/supabase/server';
import { canTransition } from '@/lib/recovery/state-machine';
import {
  FailureCategory,
  RecoveryCase,
  RecoveryCaseStatus,
  RecoveryStrategy,
} from '@/types/recovery';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface CreateRecoveryCaseInput {
  subscriptionId?: string | null;
  paymentAttemptId?: string | null;
  customerId?: string | null;
  failureCategory?: FailureCategory | null;
  recoveryStrategy?: RecoveryStrategy | null;
  maxRetries?: number;
  maxContactAttempts?: number;
  attributionWindowHours?: number;
}

/**
 * Helper to resolve an active Supabase client.
 * Prefers explicitly supplied client, then server-side SSR client, then process.env fallback.
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
 * Maps database row to domain type RecoveryCase.
 */
function mapRowToRecoveryCase(row: Record<string, unknown>): RecoveryCase {
  return {
    id: row.id as string,
    subscription_id: (row.subscription_id as string) || null,
    payment_attempt_id: (row.payment_attempt_id as string) || null,
    customer_id: (row.customer_id as string) || null,
    status: row.status as RecoveryCaseStatus,
    failure_category: (row.failure_category as FailureCategory) || null,
    recovery_strategy: (row.recovery_strategy as RecoveryStrategy) || null,
    retry_count: Number(row.retry_count ?? 0),
    contact_attempt_count: Number(row.contact_attempt_count ?? 0),
    max_retries: Number(row.max_retries ?? 3),
    max_contact_attempts: Number(row.max_contact_attempts ?? 3),
    next_eligible_action_at: (row.next_eligible_action_at as string) || null,
    attribution_window_hours: Number(row.attribution_window_hours ?? 72),
    opened_at: (row.opened_at as string) || new Date().toISOString(),
    resolved_at: (row.resolved_at as string) || null,
    stop_reason: (row.stop_reason as string) || null,
    created_at: (row.created_at as string) || new Date().toISOString(),
    updated_at: (row.updated_at as string) || new Date().toISOString(),
  };
}

/**
 * Creates a new Recovery Case in the database.
 * Initial status MUST begin as 'NEW' with retry_count: 0 and contact_attempt_count: 0.
 */
export async function createRecoveryCase(
  input: CreateRecoveryCaseInput,
  client?: SupabaseClient
): Promise<RecoveryCase> {
  const db = await getClient(client);

  const insertPayload = {
    subscription_id: input.subscriptionId ?? null,
    payment_attempt_id: input.paymentAttemptId ?? null,
    customer_id: input.customerId ?? null,
    status: 'NEW',
    failure_category: input.failureCategory ?? null,
    recovery_strategy: input.recoveryStrategy ?? null,
    retry_count: 0,
    contact_attempt_count: 0,
    ...(input.maxRetries !== undefined && { max_retries: input.maxRetries }),
    ...(input.maxContactAttempts !== undefined && {
      max_contact_attempts: input.maxContactAttempts,
    }),
    ...(input.attributionWindowHours !== undefined && {
      attribution_window_hours: input.attributionWindowHours,
    }),
  };

  const { data, error } = await db
    .from('recovery_cases')
    .insert(insertPayload)
    .select()
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to create recovery case: ${error?.message || 'Unknown database error'}`
    );
  }

  return mapRowToRecoveryCase(data);
}

/**
 * Retrieves a Recovery Case by ID.
 */
export async function getRecoveryCaseById(
  caseId: string,
  client?: SupabaseClient
): Promise<RecoveryCase | null> {
  const db = await getClient(client);

  const { data, error } = await db
    .from('recovery_cases')
    .select('*')
    .eq('id', caseId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch recovery case ${caseId}: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapRowToRecoveryCase(data);
}

/**
 * Updates a Recovery Case status strictly validating the transition using the state machine.
 */
export async function updateCaseStatus(
  caseId: string,
  newStatus: RecoveryCaseStatus,
  options?: { stopReason?: string | null; recoveryStrategy?: RecoveryStrategy | null },
  client?: SupabaseClient
): Promise<RecoveryCase> {
  const existingCase = await getRecoveryCaseById(caseId, client);

  if (!existingCase) {
    throw new Error(`Recovery case not found: ${caseId}`);
  }

  if (!canTransition(existingCase.status, newStatus)) {
    throw new Error(
      `Invalid recovery case state transition from '${existingCase.status}' to '${newStatus}' for case ${caseId}`
    );
  }

  const db = await getClient(client);

  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (options?.stopReason !== undefined) {
    updatePayload.stop_reason = options.stopReason;
  }

  if (options?.recoveryStrategy !== undefined) {
    updatePayload.recovery_strategy = options.recoveryStrategy;
  }

  if (
    newStatus === 'RECOVERED' ||
    newStatus === 'STOPPED' ||
    newStatus === 'EXPIRED'
  ) {
    updatePayload.resolved_at = new Date().toISOString();
  }

  const { data, error } = await db
    .from('recovery_cases')
    .update(updatePayload)
    .eq('id', caseId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to update recovery case status: ${error?.message || 'Unknown database error'}`
    );
  }

  return mapRowToRecoveryCase(data);
}
