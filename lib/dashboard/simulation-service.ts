import { createClient as createServerClient } from '@/lib/supabase/server';
import { executeRecoveryAction } from '@/lib/actions/executor';
import { schedulePendingActions } from '@/lib/actions/scheduler';
import { processStoredWebhookEvent, storeWebhookEvent } from '@/lib/razorpay/webhook-service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

async function getClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  try {
    return (await createServerClient()) as unknown as SupabaseClient;
  } catch {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Supabase env required.');
    return createClient(url, key);
  }
}

/**
 * Executes a deterministic recovery simulation for demo purposes.
 * Seeds subscriptions, processes payment failure webhooks, evaluates policy engine,
 * schedules & executes actions, and processes recovery outcomes.
 */
export async function runRecoverySimulation(client?: SupabaseClient) {
  const db = await getClient(client);

  const seedSubscriptions = [
    {
      id: 'sub_sim_101',
      razorpay_subscription_id: 'sub_rzp_sim_101',
      customer_id: 'cust_rahul_sharma',
      plan_id: 'plan_pro_monthly',
      amount: 4999,
      currency: 'INR',
      current_status: 'halted',
    },
    {
      id: 'sub_sim_102',
      razorpay_subscription_id: 'sub_rzp_sim_102',
      customer_id: 'cust_priya_patel',
      plan_id: 'plan_enterprise_annual',
      amount: 15000,
      currency: 'INR',
      current_status: 'halted',
    },
    {
      id: 'sub_sim_103',
      razorpay_subscription_id: 'sub_rzp_sim_103',
      customer_id: 'cust_amit_verma',
      plan_id: 'plan_starter_monthly',
      amount: 1999,
      currency: 'INR',
      current_status: 'halted',
    },
    {
      id: 'sub_sim_104',
      razorpay_subscription_id: 'sub_rzp_sim_104',
      customer_id: 'cust_ananya_singh',
      plan_id: 'plan_growth_monthly',
      amount: 7999,
      currency: 'INR',
      current_status: 'halted',
    },
    {
      id: 'sub_sim_105',
      razorpay_subscription_id: 'sub_rzp_sim_105',
      customer_id: 'cust_high_risk_fraud',
      plan_id: 'plan_pro_monthly',
      amount: 4999,
      currency: 'INR',
      current_status: 'halted',
    },
  ];

  for (const s of seedSubscriptions) {
    const { data: existing } = await db
      .from('subscriptions')
      .select('id')
      .eq('id', s.id)
      .maybeSingle();

    if (!existing) {
      await db.from('subscriptions').insert(s);
    }
  }

  // Simulate Webhook Events
  const events = [
    {
      event_id: `evt_sim_${Date.now()}_1`,
      event: 'payment.failed',
      payload: {
        subscription: { entity: { id: 'sub_rzp_sim_101', status: 'halted' } },
        payment: {
          entity: {
            id: `pay_sim_101_${Date.now()}`,
            amount: 499900,
            status: 'failed',
            error_code: 'INSUFFICIENT_FUNDS',
            error_description: 'Insufficient balance in account',
            subscription_id: 'sub_rzp_sim_101',
          },
        },
      },
    },
    {
      event_id: `evt_sim_${Date.now()}_2`,
      event: 'payment.failed',
      payload: {
        subscription: { entity: { id: 'sub_rzp_sim_102', status: 'halted' } },
        payment: {
          entity: {
            id: `pay_sim_102_${Date.now()}`,
            amount: 1500000,
            status: 'failed',
            error_code: 'EXPIRED_CARD',
            error_description: 'Card has expired',
            subscription_id: 'sub_rzp_sim_102',
          },
        },
      },
    },
    {
      event_id: `evt_sim_${Date.now()}_3`,
      event: 'payment.failed',
      payload: {
        subscription: { entity: { id: 'sub_rzp_sim_103', status: 'halted' } },
        payment: {
          entity: {
            id: `pay_sim_103_${Date.now()}`,
            amount: 199900,
            status: 'failed',
            error_code: 'BAD_REQUEST_ERROR',
            error_description: 'Temporary bank gateway timeout',
            subscription_id: 'sub_rzp_sim_103',
          },
        },
      },
    },
    {
      event_id: `evt_sim_${Date.now()}_4`,
      event: 'payment.failed',
      payload: {
        subscription: { entity: { id: 'sub_rzp_sim_105', status: 'halted' } },
        payment: {
          entity: {
            id: `pay_sim_105_${Date.now()}`,
            amount: 499900,
            status: 'failed',
            error_code: 'SECURITY_FLAG',
            error_description: 'Fraudulent transaction risk flagged',
            subscription_id: 'sub_rzp_sim_105',
          },
        },
      },
    },
  ];

  for (const evt of events) {
    const storeRes = await storeWebhookEvent(
      {
        providerEventId: evt.event_id,
        eventType: evt.event,
        payload: evt.payload,
      },
      db
    );

    if (storeRes.eventId) {
      await processStoredWebhookEvent(storeRes.eventId, evt.payload, db);
    }
  }

  // Schedule & Execute Pending Actions
  await schedulePendingActions(new Date(), db);
  const dueActions = await db
    .from('recovery_actions')
    .select('id')
    .in('status', ['PENDING', 'SCHEDULED']);

  for (const act of dueActions.data || []) {
    await executeRecoveryAction(act.id as string, undefined, db);
  }

  // Simulate Subsequent Payment Success for sub_rzp_sim_101 (Recovery Event)
  const successEvt = {
    event_id: `evt_sim_charged_${Date.now()}`,
    event: 'subscription.charged',
    payload: {
      subscription: { entity: { id: 'sub_rzp_sim_101', status: 'active' } },
      payment: {
        entity: {
          id: `pay_success_101_${Date.now()}`,
          amount: 499900,
          status: 'captured',
          subscription_id: 'sub_rzp_sim_101',
        },
      },
    },
  };

  const succStore = await storeWebhookEvent(
    {
      providerEventId: successEvt.event_id,
      eventType: successEvt.event,
      payload: successEvt.payload,
    },
    db
  );

  if (succStore.eventId) {
    await processStoredWebhookEvent(succStore.eventId, successEvt.payload, db);
  }

  return {
    casesProcessed: events.length,
    status: 'success',
  };
}
