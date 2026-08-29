import { createClient as createServerClient } from '@/lib/supabase/server';
import { classifyFailure } from '@/lib/recovery/classifier';
import {
  getSubscriptionByRazorpayId,
  LocalSubscription,
} from '@/lib/razorpay/subscription-service';
import { FailureCategory } from '@/types/recovery';
import { RazorpayPaymentEntity } from '@/types/razorpay';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface PaymentAttemptRecord {
  id: string;
  razorpay_payment_id: string | null;
  subscription_id: string | null;
  failure_code: string | null;
  failure_description: string | null;
  failure_category: FailureCategory | null;
  amount: number | null;
  attempt_number: number | null;
  occurred_at: string | null;
  created_at: string;
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
 * Processes a Razorpay payment entity from a webhook event.
 * Creates a payment_attempts record with deterministic failure classification.
 */
export async function processPaymentAttempt(
  payment: RazorpayPaymentEntity,
  subscriptionIdFromWebhook?: string | null,
  client?: SupabaseClient
): Promise<{
  attempt: PaymentAttemptRecord;
  subscription: LocalSubscription | null;
  failureCategory: FailureCategory;
  isNew: boolean;
}> {
  const db = await getClient(client);

  const razorpaySubId =
    payment.subscription_id || subscriptionIdFromWebhook || null;
  let localSub: LocalSubscription | null = null;

  if (razorpaySubId) {
    localSub = await getSubscriptionByRazorpayId(razorpaySubId, db);
  }

  // 1. Check if payment attempt already exists by razorpay_payment_id
  const { data: existing } = await db
    .from('payment_attempts')
    .select('*')
    .eq('razorpay_payment_id', payment.id)
    .maybeSingle();

  const failureCategory = classifyFailure({
    failureCode: payment.error_code || payment.error_reason || null,
    failureDescription: payment.error_description || null,
  });

  const occurredAt = payment.created_at
    ? new Date(payment.created_at * 1000).toISOString()
    : new Date().toISOString();

  const amount = typeof payment.amount === 'number' ? payment.amount / 100 : null;

  if (existing) {
    return {
      attempt: existing as PaymentAttemptRecord,
      subscription: localSub,
      failureCategory,
      isNew: false,
    };
  }

  // Determine attempt number for this subscription
  let attemptNumber = 1;
  if (localSub) {
    const { count } = await db
      .from('payment_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_id', localSub.id);

    if (count) {
      attemptNumber = count + 1;
    }
  }

  const insertPayload = {
    razorpay_payment_id: payment.id,
    subscription_id: localSub ? localSub.id : null,
    failure_code: payment.error_code || payment.error_reason || null,
    failure_description: payment.error_description || null,
    failure_category: failureCategory,
    amount: amount,
    attempt_number: attemptNumber,
    occurred_at: occurredAt,
  };

  const { data: inserted, error } = await db
    .from('payment_attempts')
    .insert(insertPayload)
    .select()
    .single();

  if (error || !inserted) {
    throw new Error(
      `Failed to create payment attempt record for ${payment.id}: ${
        error?.message || 'Unknown database error'
      }`
    );
  }

  return {
    attempt: inserted as PaymentAttemptRecord,
    subscription: localSub,
    failureCategory,
    isNew: true,
  };
}
