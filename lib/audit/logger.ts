import { createClient as createServerClient } from '@/lib/supabase/server';
import { RecoveryCaseStatus } from '@/types/recovery';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type AuditEventType =
  | 'WEBHOOK_RECEIVED'
  | 'WEBHOOK_DUPLICATE_IGNORED'
  | 'WEBHOOK_SIGNATURE_VERIFIED'
  | 'PAYMENT_FAILURE_DETECTED'
  | 'CASE_CREATED'
  | 'STATE_VERIFIED'
  | 'FAILURE_CLASSIFIED'
  | 'POLICY_EVALUATED'
  | 'ACTION_BLOCKED'
  | 'ACTION_PLANNED'
  | 'ACTION_SCHEDULED'
  | 'ACTION_EXECUTING'
  | 'ACTION_COMPLETED'
  | 'ACTION_FAILED'
  | 'CUSTOMER_CONTACTED'
  | 'CUSTOMER_OPTED_OUT'
  | 'SUBSCRIPTION_RECOVERED'
  | 'PENDING_ACTION_CANCELLED'
  | 'CASE_ESCALATED'
  | 'CASE_STOPPED'
  | 'AI_RECOMMENDATION_GENERATED'
  | 'AI_RECOMMENDATION_REJECTED'
  | 'AI_FALLBACK_USED'
  | 'AI_MESSAGE_GENERATED'
  | 'AI_MESSAGE_REJECTED'
  | 'AI_DECISION_EXPLAINED'
  | 'AI_EXCEPTION_SUMMARY_GENERATED';

export interface LogAuditEventInput {
  recoveryCaseId?: string | null;
  eventType: AuditEventType;
  actor: string;
  previousState?: RecoveryCaseStatus | string | null;
  newState?: RecoveryCaseStatus | string | null;
  decision?: Record<string, unknown> | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditLogRecord {
  id: string;
  recovery_case_id: string | null;
  event_type: AuditEventType;
  actor: string;
  previous_state: string | null;
  new_state: string | null;
  decision: Record<string, unknown> | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Resolves an active Supabase client instance.
 * Prefers explicitly provided client, then server-side SSR client, then process.env fallback.
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
 * Appends a single audit event entry to the audit_log table.
 * Audit logging is strictly append-only.
 *
 * @param input Audit event payload matching audit_log schema
 * @param client Optional SupabaseClient instance
 * @returns Inserted AuditLogRecord
 */
export async function logAuditEvent(
  input: LogAuditEventInput,
  client?: SupabaseClient
): Promise<AuditLogRecord> {
  const db = await getClient(client);

  const payload = {
    recovery_case_id: input.recoveryCaseId ?? null,
    event_type: input.eventType,
    actor: input.actor,
    previous_state: input.previousState ?? null,
    new_state: input.newState ?? null,
    decision: input.decision ?? null,
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
  };

  const { data, error } = await db
    .from('audit_log')
    .insert(payload)
    .select()
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to log audit event '${input.eventType}': ${
        error?.message || 'Unknown database error'
      }`
    );
  }

  return {
    id: data.id as string,
    recovery_case_id: (data.recovery_case_id as string) || null,
    event_type: data.event_type as AuditEventType,
    actor: data.actor as string,
    previous_state: (data.previous_state as string) || null,
    new_state: (data.new_state as string) || null,
    decision: (data.decision as Record<string, unknown>) || null,
    reason: (data.reason as string) || null,
    metadata: (data.metadata as Record<string, unknown>) || null,
    created_at: (data.created_at as string) || new Date().toISOString(),
  };
}
