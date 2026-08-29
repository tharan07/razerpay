import { createClient as createServerClient } from '@/lib/supabase/server';
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
 * Generates a deterministic idempotency key for a recovery action.
 * Format: case_${caseId}_action_${actionType}_seq_${sequence}
 *
 * @param caseId UUID of the recovery case
 * @param actionType Recovery strategy/action type
 * @param sequence Sequence or attempt index (1-based)
 * @returns Deterministic string idempotency key
 */
export function generateActionIdempotencyKey(
  caseId: string,
  actionType: string,
  sequence: number
): string {
  const cleanCaseId = caseId.trim().toLowerCase();
  const cleanAction = actionType.trim().toLowerCase();
  return `case_${cleanCaseId}_action_${cleanAction}_seq_${sequence}`;
}

/**
 * Checks whether an action with the given idempotency key already exists in the database.
 *
 * @param idempotencyKey Deterministic idempotency key string
 * @param client Optional SupabaseClient instance
 * @returns boolean true if action exists, false otherwise
 */
export async function verifyActionIdempotency(
  idempotencyKey: string,
  client?: SupabaseClient
): Promise<boolean> {
  const db = await getClient(client);

  const { data, error } = await db
    .from('recovery_actions')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to verify action idempotency key '${idempotencyKey}': ${error.message}`
    );
  }

  return Boolean(data);
}
