import assert from 'node:assert';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import { processWebhookRequest } from '@/app/api/webhooks/razorpay/route';

function createMockDatabase() {
  const webhookEvents = new Map<string, Record<string, unknown>>(); // key: provider_event_id
  const webhookEventsById = new Map<string, Record<string, unknown>>(); // key: id
  const subscriptions = new Map<string, Record<string, unknown>>(); // key: id
  const subscriptionsByRazorpayId = new Map<string, Record<string, unknown>>();
  const paymentAttempts = new Map<string, Record<string, unknown>>(); // key: id
  const paymentAttemptsByRazorpayId = new Map<string, Record<string, unknown>>();
  const recoveryCases = new Map<string, Record<string, unknown>>(); // key: id
  const recoveryOutcomes = new Map<string, Record<string, unknown>>(); // key: id
  const recoveryActions = new Map<string, Record<string, unknown>>(); // key: id
  const auditLogs: Record<string, unknown>[] = [];

  // Seed default subscription
  const defaultSub = {
    id: 'sub_uuid_001',
    razorpay_subscription_id: 'sub_razorpay_100',
    customer_id: 'cust_uuid_001',
    plan_id: 'plan_pro',
    amount: 1000,
    currency: 'INR',
    current_status: 'authenticated',
    latest_verified_status: 'authenticated',
    last_state_verified_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  subscriptions.set(defaultSub.id, defaultSub);
  subscriptionsByRazorpayId.set(
    defaultSub.razorpay_subscription_id,
    defaultSub
  );

  const mockClient = {
    from: (table: string) => {
      let currentEqCol: string | null = null;
      let currentEqVal: string | null = null;
      let notFilterCol: string | null = null;
      let inFilterVals: string[] = [];
      let insertData: Record<string, unknown> | null = null;
      let updateData: Record<string, unknown> | null = null;
      let isCountQuery = false;

      const builder = {
        select: (cols?: string, options?: { count?: string; head?: boolean }) => {
          if (options?.count === 'exact') {
            isCountQuery = true;
          }
          return builder;
        },
        eq: (col: string, val: string) => {
          currentEqCol = col;
          currentEqVal = val;
          return builder;
        },
        not: (col: string) => {
          notFilterCol = col;
          return builder;
        },
        in: (col: string, vals: string[]) => {
          inFilterVals = vals;
          return builder;
        },
        maybeSingle: async () => {
          if (table === 'webhook_events' && currentEqCol === 'provider_event_id') {
            const found = webhookEvents.get(currentEqVal || '');
            return { data: found || null, error: null };
          }
          if (
            table === 'subscriptions' &&
            currentEqCol === 'razorpay_subscription_id'
          ) {
            const found = subscriptionsByRazorpayId.get(currentEqVal || '');
            return { data: found || null, error: null };
          }
          if (
            table === 'payment_attempts' &&
            currentEqCol === 'razorpay_payment_id'
          ) {
            const found = paymentAttemptsByRazorpayId.get(currentEqVal || '');
            return { data: found || null, error: null };
          }
          if (table === 'recovery_cases' && currentEqCol === 'id') {
            const found = recoveryCases.get(currentEqVal || '');
            return { data: found || null, error: null };
          }
          if (
            table === 'recovery_outcomes' &&
            currentEqCol === 'recovery_case_id'
          ) {
            const found = Array.from(recoveryOutcomes.values()).find(
              (o) => o.recovery_case_id === currentEqVal
            );
            return { data: found || null, error: null };
          }
          return { data: null, error: null };
        },
        single: async () => {
          if (insertData) {
            const id = `${table.substring(0, 3)}-uuid-${Math.random()
              .toString(36)
              .substring(2, 8)}`;
            const rec: Record<string, unknown> = {
              ...insertData,
              id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            if (table === 'webhook_events') {
              const pEvtId = rec.provider_event_id as string;
              if (webhookEvents.has(pEvtId)) {
                return {
                  data: null,
                  error: {
                    code: '23505',
                    message:
                      'duplicate key value violates unique constraint "webhook_events_provider_event_id_key"',
                  },
                };
              }
              webhookEvents.set(pEvtId, rec);
              webhookEventsById.set(id, rec);
            } else if (table === 'payment_attempts') {
              const pId = rec.razorpay_payment_id as string;
              paymentAttempts.set(id, rec);
              if (pId) paymentAttemptsByRazorpayId.set(pId, rec);
            } else if (table === 'recovery_cases') {
              recoveryCases.set(id, rec);
            } else if (table === 'recovery_outcomes') {
              recoveryOutcomes.set(id, rec);
            } else if (table === 'audit_log') {
              auditLogs.push(rec);
            }
            return { data: rec, error: null };
          }

          if (updateData && currentEqCol === 'id') {
            if (table === 'subscriptions') {
              const existing = subscriptions.get(currentEqVal || '');
              if (existing) {
                Object.assign(existing, updateData);
                return { data: existing, error: null };
              }
            }
            if (table === 'recovery_cases') {
              const existing = recoveryCases.get(currentEqVal || '');
              if (existing) {
                Object.assign(existing, updateData);
                return { data: existing, error: null };
              }
            }
            if (table === 'webhook_events') {
              const existing = webhookEventsById.get(currentEqVal || '');
              if (existing) {
                Object.assign(existing, updateData);
                return { data: existing, error: null };
              }
            }
          }
          return { data: null, error: { message: 'Item not found' } };
        },
        insert: (data: Record<string, unknown>) => {
          insertData = data;
          return builder;
        },
        update: (data: Record<string, unknown>) => {
          updateData = data;
          return builder;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (resolve: any) => {
          if (insertData) {
            const id = `${table.substring(0, 3)}-uuid-${Math.random()
              .toString(36)
              .substring(2, 8)}`;
            const rec: Record<string, unknown> = {
              ...insertData,
              id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            if (table === 'recovery_outcomes') {
              recoveryOutcomes.set(id, rec);
            } else if (table === 'audit_log') {
              auditLogs.push(rec);
            }
            return resolve({ data: rec, error: null });
          }

          if (
            isCountQuery &&
            table === 'payment_attempts' &&
            currentEqCol === 'subscription_id'
          ) {
            const count = Array.from(paymentAttempts.values()).filter(
              (p) => p.subscription_id === currentEqVal
            ).length;
            return resolve({ count, data: null, error: null });
          }

          if (
            table === 'recovery_cases' &&
            currentEqCol === 'subscription_id' &&
            notFilterCol === 'status'
          ) {
            const openCases = Array.from(recoveryCases.values()).filter(
              (c) =>
                c.subscription_id === currentEqVal &&
                !['RECOVERED', 'STOPPED', 'EXPIRED'].includes(
                  c.status as string
                )
            );
            return resolve({ data: openCases, error: null });
          }

          if (
            table === 'recovery_actions' &&
            currentEqCol === 'recovery_case_id'
          ) {
            const actions = Array.from(recoveryActions.values()).filter(
              (a) =>
                a.recovery_case_id === currentEqVal &&
                inFilterVals.includes(a.status as string)
            );
            return resolve({ data: actions, error: null });
          }

          if (updateData && currentEqCol && table === 'recovery_actions') {
            for (const act of recoveryActions.values()) {
              if (act.id === currentEqVal) {
                Object.assign(act, updateData);
              }
            }
            return resolve({ data: null, error: null });
          }

          return resolve({ data: [], error: null });
        },
      };

      return builder;
    },
  };

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient: mockClient as any,
    webhookEvents,
    subscriptions,
    paymentAttempts,
    recoveryCases,
    recoveryOutcomes,
    recoveryActions,
    auditLogs,
  };
}

describe('Phase 3.6 — Duplicate Webhook Testing & Processing Verification', () => {
  const TEST_SECRET = 'test_webhook_secret_key_999';
  process.env.RAZORPAY_WEBHOOK_SECRET = TEST_SECRET;

  function computeHmac(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  function createSignedRequest(body: string): Request {
    const headers = new Headers();
    headers.set('x-razorpay-signature', computeHmac(body, TEST_SECRET));
    return new Request('http://localhost:3000/api/webhooks/razorpay', {
      method: 'POST',
      headers,
      body,
    });
  }

  it('Test 1 — Same webhook twice: 1st creates records, 2nd is ignored with duplicate=true', async () => {
    const db = createMockDatabase();
    const payload = JSON.stringify({
      event_id: 'evt_dup_001',
      event: 'payment.failed',
      payload: {
        subscription: {
          entity: {
            id: 'sub_razorpay_100',
            status: 'halted',
          },
        },
        payment: {
          entity: {
            id: 'pay_failed_100',
            amount: 10000,
            status: 'failed',
            error_code: 'INSUFFICIENT_FUNDS',
            error_description: 'Insufficient funds in account',
            subscription_id: 'sub_razorpay_100',
          },
        },
      },
    });

    // 1st request
    const req1 = createSignedRequest(payload);
    const res1 = await processWebhookRequest(req1, db.mockClient);
    assert.strictEqual(res1.status, 200);
    const json1 = await res1.json();
    assert.strictEqual(json1.duplicate, false);

    assert.strictEqual(db.webhookEvents.size, 1);
    assert.strictEqual(db.paymentAttempts.size, 1);
    assert.strictEqual(db.recoveryCases.size, 1);

    // 2nd request with exact same webhook payload and event_id
    const req2 = createSignedRequest(payload);
    const res2 = await processWebhookRequest(req2, db.mockClient);
    assert.strictEqual(res2.status, 200);
    const json2 = await res2.json();
    assert.strictEqual(json2.duplicate, true);

    // Counts MUST remain unchanged!
    assert.strictEqual(db.webhookEvents.size, 1);
    assert.strictEqual(db.paymentAttempts.size, 1);
    assert.strictEqual(db.recoveryCases.size, 1);
  });

  it('Test 2 — Concurrent duplicate protection: Unique constraint prevents duplicate inserts', async () => {
    const db = createMockDatabase();
    const payload = JSON.stringify({
      event_id: 'evt_concurrent_002',
      event: 'payment.failed',
      payload: {
        subscription: { entity: { id: 'sub_razorpay_100', status: 'halted' } },
        payment: { entity: { id: 'pay_failed_200', amount: 10000, status: 'failed', error_code: 'GATEWAY_TIMEOUT', subscription_id: 'sub_razorpay_100' } },
      },
    });

    // Manually pre-seed webhook_events with this event_id to simulate concurrent insert
    db.webhookEvents.set('evt_concurrent_002', {
      id: 'wh-existing-002',
      provider_event_id: 'evt_concurrent_002',
      processing_status: 'PENDING',
    });

    const req = createSignedRequest(payload);
    const res = await processWebhookRequest(req, db.mockClient);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.duplicate, true);

    assert.strictEqual(db.webhookEvents.size, 1);
    assert.strictEqual(db.paymentAttempts.size, 0);
    assert.strictEqual(db.recoveryCases.size, 0);
  });

  it('Test 3 — Duplicate success webhook: Case becomes RECOVERED once, no duplicate outcomes', async () => {
    const db = createMockDatabase();

    // First trigger failure to open a recovery case
    const failPayload = JSON.stringify({
      event_id: 'evt_fail_300',
      event: 'payment.failed',
      payload: {
        subscription: { entity: { id: 'sub_razorpay_100', status: 'halted' } },
        payment: { entity: { id: 'pay_fail_300', amount: 10000, status: 'failed', error_code: 'INSUFFICIENT_FUNDS', subscription_id: 'sub_razorpay_100' } },
      },
    });

    await processWebhookRequest(createSignedRequest(failPayload), db.mockClient);
    assert.strictEqual(db.recoveryCases.size, 1);

    const openCase = Array.from(db.recoveryCases.values())[0];
    assert.strictEqual(openCase.status, 'ACTION_PLANNED');

    // Send payment success webhook
    const successPayload = JSON.stringify({
      event_id: 'evt_success_301',
      event: 'subscription.charged',
      payload: {
        subscription: { entity: { id: 'sub_razorpay_100', status: 'active' } },
        payment: { entity: { id: 'pay_success_301', amount: 10000, status: 'captured', subscription_id: 'sub_razorpay_100' } },
      },
    });

    // First success webhook
    const resSuccess1 = await processWebhookRequest(createSignedRequest(successPayload), db.mockClient);
    assert.strictEqual(resSuccess1.status, 200);
    const jsonSuccess1 = await resSuccess1.json();
    assert.strictEqual(jsonSuccess1.duplicate, false);

    assert.strictEqual(openCase.status, 'RECOVERED');
    assert.strictEqual(db.recoveryOutcomes.size, 1);

    // Duplicate success webhook (same event_id)
    const resSuccess2 = await processWebhookRequest(createSignedRequest(successPayload), db.mockClient);
    assert.strictEqual(resSuccess2.status, 200);
    const jsonSuccess2 = await resSuccess2.json();
    assert.strictEqual(jsonSuccess2.duplicate, true);

    // No duplicate outcomes or case status changes
    assert.strictEqual(openCase.status, 'RECOVERED');
    assert.strictEqual(db.recoveryOutcomes.size, 1);
  });

  it('Test 4 — Failure followed by duplicate: DB counts remain unchanged on duplicate', async () => {
    const db = createMockDatabase();
    const payload = JSON.stringify({
      event_id: 'evt_fail_400',
      event: 'payment.failed',
      payload: {
        subscription: { entity: { id: 'sub_razorpay_100', status: 'halted' } },
        payment: { entity: { id: 'pay_fail_400', amount: 10000, status: 'failed', error_code: 'BANK_ERROR', subscription_id: 'sub_razorpay_100' } },
      },
    });

    await processWebhookRequest(createSignedRequest(payload), db.mockClient);
    const pCount1 = db.paymentAttempts.size;
    const cCount1 = db.recoveryCases.size;
    assert.strictEqual(pCount1, 1);
    assert.strictEqual(cCount1, 1);

    // Duplicate call
    await processWebhookRequest(createSignedRequest(payload), db.mockClient);
    assert.strictEqual(db.paymentAttempts.size, pCount1);
    assert.strictEqual(db.recoveryCases.size, cCount1);
  });

  it('Test 5 — Different webhook IDs: Separate legitimate events are processed independently', async () => {
    const db = createMockDatabase();

    const payload1 = JSON.stringify({
      event_id: 'evt_legit_501',
      event: 'payment.failed',
      payload: {
        subscription: { entity: { id: 'sub_razorpay_100', status: 'halted' } },
        payment: { entity: { id: 'pay_fail_501', amount: 10000, status: 'failed', error_code: 'INSUFFICIENT_FUNDS', subscription_id: 'sub_razorpay_100' } },
      },
    });

    const payload2 = JSON.stringify({
      event_id: 'evt_legit_502',
      event: 'payment.failed',
      payload: {
        subscription: { entity: { id: 'sub_razorpay_100', status: 'halted' } },
        payment: { entity: { id: 'pay_fail_502', amount: 10000, status: 'failed', error_code: 'BANK_ERROR', subscription_id: 'sub_razorpay_100' } },
      },
    });

    const res1 = await processWebhookRequest(createSignedRequest(payload1), db.mockClient);
    assert.strictEqual(res1.status, 200);

    const res2 = await processWebhookRequest(createSignedRequest(payload2), db.mockClient);
    assert.strictEqual(res2.status, 200);

    assert.strictEqual(db.webhookEvents.size, 2);
    assert.strictEqual(db.paymentAttempts.size, 2);
    // Open recovery case was reused for same subscription
    assert.strictEqual(db.recoveryCases.size, 1);
  });
});
