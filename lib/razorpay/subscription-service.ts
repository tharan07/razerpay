import { createClient as createServerClient } from '@/lib/supabase/server';
import { RazorpaySubscriptionEntity } from '@/types/razorpay';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface LocalSubscription {
  id: string;
  razorpay_subscription_id: string;
  customer_id: string | null;
  plan_id: string | null;
  amount: number | null;
  currency: string;
  current_status: string | null;
  latest_verified_status: string | null;
  last_state_verified_at: string | null;
  created_at: string;
  updated_at: string;
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
 * Retrieves a local subscription by Razorpay subscription ID.
 */
export async function getSubscriptionByRazorpayId(
  razorpaySubscriptionId: string,
  client?: SupabaseClient
): Promise<LocalSubscription | null> {
  const db = await getClient(client);

  const { data, error } = await db
    .from('subscriptions')
    .select('*')
    .eq('razorpay_subscription_id', razorpaySubscriptionId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to fetch subscription by Razorpay ID ${razorpaySubscriptionId}: ${error.message}`
    );
  }

  return data as LocalSubscription | null;
}

/**
 * Synchronizes local subscription record state from a Razorpay subscription entity payload.
 *
 * Updates current_status, latest_verified_status, last_state_verified_at, and updated_at.
 * Never overwrites razorpay_subscription_id.
 * Safely handles unknown/non-existent subscriptions.
 */
export async function syncSubscriptionState(
  razorpaySubscription: RazorpaySubscriptionEntity,
  client?: SupabaseClient
): Promise<LocalSubscription | null> {
  if (!razorpaySubscription || !razorpaySubscription.id) {
    return null;
  }

  const existing = await getSubscriptionByRazorpayId(
    razorpaySubscription.id,
    client
  );

  if (!existing) {
    // Non-existent subscription - handled safely without crashing
    return null;
  }

  const db = await getClient(client);
  const now = new Date().toISOString();

  const updatePayload = {
    current_status: razorpaySubscription.status,
    latest_verified_status: razorpaySubscription.status,
    last_state_verified_at: now,
    updated_at: now,
  };

  const { data, error } = await db
    .from('subscriptions')
    .update(updatePayload)
    .eq('id', existing.id)
    .select()
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to update subscription state for ${existing.id}: ${
        error?.message || 'Unknown database error'
      }`
    );
  }

  return data as LocalSubscription;
}
