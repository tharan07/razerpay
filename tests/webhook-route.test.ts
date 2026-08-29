import assert from 'node:assert';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import { processWebhookRequest } from '@/app/api/webhooks/razorpay/route';

function createMockDatabase() {
  const webhookEvents = new Map<string, Record<string, unknown>>();
  const webhookEventsById = new Map<string, Record<string, unknown>>();
  const subscriptions = new Map<string, Record<string, unknown>>();
  const paymentAttempts = new Map<string, Record<string, unknown>>();
  const recoveryCases = new Map<string, Record<string, unknown>>();
  const auditLogs: Record<string, unknown>[] = [];

  const mockClient = {
    from: (table: string) => {
      let currentEqCol: string | null = null;
      let currentEqVal: string | null = null;
      let insertData: Record<string, unknown> | null = null;
      let updateData: Record<string, unknown> | null = null;

      const builder = {
        select: () => builder,
        eq: (col: string, val: string) => {
          currentEqCol = col;
          currentEqVal = val;
          return builder;
        },
        not: () => builder,
        in: () => builder,
        maybeSingle: async () => {
          if (table === 'webhook_events' && currentEqCol === 'provider_event_id') {
            const found = webhookEvents.get(currentEqVal || '');
            return { data: found || null, error: null };
          }
          if (table === 'subscriptions' && currentEqCol === 'razorpay_subscription_id') {
            const found = subscriptions.get(currentEqVal || '');
            return { data: found || null, error: null };
          }
          return { data: null, error: null };
        },
        insert: (data: Record<string, unknown>) => {
          insertData = data;
          return builder;
        },
        update: (data: Record<string, unknown>) => {
          updateData = data;
          return builder;
        },
        single: async () => {
          if (insertData) {
            const id = `${table.substring(0, 3)}-uuid-${Math.random().toString(36).substring(2, 8)}`;
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
                    message: 'duplicate key value violates unique constraint "webhook_events_provider_event_id_key"',
                  },
                };
              }
              webhookEvents.set(pEvtId, rec);
              webhookEventsById.set(id, rec);
            } else if (table === 'payment_attempts') {
              paymentAttempts.set(id, rec);
            } else if (table === 'recovery_cases') {
              recoveryCases.set(id, rec);
            } else if (table === 'audit_log') {
              auditLogs.push(rec);
            }
            return { data: rec, error: null };
          }

          if (updateData && currentEqCol === 'id') {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (resolve: any) => {
          return resolve({ data: [], count: 0, error: null });
        },
      };

      return builder;
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { mockClient: mockClient as any, store: webhookEvents };
}

describe('Razorpay Webhook Endpoint (Storage & Idempotency)', () => {
  const TEST_SECRET = 'test_webhook_secret_key_12345';
  process.env.RAZORPAY_WEBHOOK_SECRET = TEST_SECRET;

  function computeHmac(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  function createSignedRequest(
    body: string,
    signature?: string | null
  ): Request {
    const headers = new Headers();
    if (signature !== null) {
      headers.set(
        'x-razorpay-signature',
        signature ?? computeHmac(body, TEST_SECRET)
      );
    }

    return new Request('http://localhost:3000/api/webhooks/razorpay', {
      method: 'POST',
      headers,
      body,
    });
  }

  it('rejects request with missing x-razorpay-signature header with HTTP 400', async () => {
    const { mockClient, store } = createMockDatabase();
    const req = createSignedRequest('{"event":"test"}', null);
    const res = await processWebhookRequest(req, mockClient);
    assert.strictEqual(res.status, 400);

    const json = await res.json();
    assert.strictEqual(json.error, 'Missing webhook signature header');
    assert.strictEqual(store.size, 0);
  });

  it('rejects request with invalid signature with HTTP 400 without touching database', async () => {
    const { mockClient, store } = createMockDatabase();
    const req = createSignedRequest('{"event":"test"}', 'invalid_signature_hash');
    const res = await processWebhookRequest(req, mockClient);
    assert.strictEqual(res.status, 400);

    const json = await res.json();
    assert.strictEqual(json.error, 'Invalid webhook signature');
    assert.strictEqual(store.size, 0);
  });

  it('handles malformed JSON payload after valid signature verification safely without touching database', async () => {
    const { mockClient, store } = createMockDatabase();
    const malformedBody = '{ event: "subscription.charged", invalid_json ';
    const req = createSignedRequest(malformedBody);
    const res = await processWebhookRequest(req, mockClient);
    assert.strictEqual(res.status, 400);

    const json = await res.json();
    assert.strictEqual(json.error, 'Invalid JSON payload');
    assert.strictEqual(store.size, 0);
  });

  it('rejects payload missing provider event ID with HTTP 400', async () => {
    const { mockClient, store } = createMockDatabase();
    const body = JSON.stringify({
      event: 'subscription.charged',
      payload: {},
    });
    const req = createSignedRequest(body);
    const res = await processWebhookRequest(req, mockClient);
    assert.strictEqual(res.status, 400);

    const json = await res.json();
    assert.strictEqual(json.error, 'Missing provider event ID');
    assert.strictEqual(store.size, 0);
  });

  it('stores valid signed webhook event in PENDING/PROCESSED status and returns HTTP 200', async () => {
    const { mockClient, store } = createMockDatabase();
    const body = JSON.stringify({
      event_id: 'evt_test_100',
      event: 'subscription.charged',
      payload: { subscription: { entity: { id: 'sub_100' } } },
    });

    const req = createSignedRequest(body);
    const res = await processWebhookRequest(req, mockClient);
    assert.strictEqual(res.status, 200);

    const json = await res.json();
    assert.strictEqual(json.status, 'ok');
    assert.strictEqual(json.received, true);
    assert.strictEqual(json.duplicate, false);
    assert.strictEqual(json.event, 'subscription.charged');

    assert.strictEqual(store.size, 1);
    const saved = store.get('evt_test_100');
    assert.notStrictEqual(saved, undefined);
    assert.strictEqual(saved?.provider, 'razorpay');
    assert.strictEqual(saved?.signature_valid, true);
  });

  it('ignores duplicate webhook event with same provider_event_id and does not create a second record', async () => {
    const { mockClient, store } = createMockDatabase();
    const body = JSON.stringify({
      event_id: 'evt_duplicate_200',
      event: 'subscription.charged',
      payload: { subscription: { entity: { id: 'sub_200' } } },
    });

    // 1st request
    const req1 = createSignedRequest(body);
    const res1 = await processWebhookRequest(req1, mockClient);
    assert.strictEqual(res1.status, 200);
    const json1 = await res1.json();
    assert.strictEqual(json1.duplicate, false);
    assert.strictEqual(store.size, 1);

    // 2nd duplicate request
    const req2 = createSignedRequest(body);
    const res2 = await processWebhookRequest(req2, mockClient);
    assert.strictEqual(res2.status, 200);
    const json2 = await res2.json();
    assert.strictEqual(json2.status, 'ok');
    assert.strictEqual(json2.received, true);
    assert.strictEqual(json2.duplicate, true);
    assert.strictEqual(json2.message, 'Duplicate event ignored');

    // Store count MUST remain 1
    assert.strictEqual(store.size, 1);
  });
});
