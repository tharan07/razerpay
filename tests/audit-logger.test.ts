import assert from 'node:assert';
import { describe, it } from 'node:test';
import { logAuditEvent, AuditEventType, LogAuditEventInput } from '@/lib/audit/logger';

// Lightweight mock Supabase client for testing audit log insertion
function createMockSupabaseClient() {
  const store: Record<string, unknown>[] = [];

  const mockClient = {
    from: (table: string) => {
      if (table !== 'audit_log') {
        throw new Error(`Unexpected table: ${table}`);
      }

      let insertPayload: Record<string, unknown> | null = null;

      const builder = {
        insert: (payload: Record<string, unknown>) => {
          insertPayload = payload;
          return builder;
        },
        select: () => builder,
        single: async () => {
          if (insertPayload) {
            const id = 'audit-uuid-mock-456';
            const record = {
              ...insertPayload,
              id,
              created_at: new Date().toISOString(),
            };
            store.push(record);
            return { data: record, error: null };
          }
          return { data: null, error: { message: 'Insert payload missing' } };
        },
      };

      return builder;
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { mockClient: mockClient as any, store };
}

describe('Audit Logger Engine', () => {
  it('constructs and inserts a valid audit event successfully', async () => {
    const { mockClient, store } = createMockSupabaseClient();

    const input: LogAuditEventInput = {
      recoveryCaseId: 'case-uuid-123',
      eventType: 'PAYMENT_FAILURE_DETECTED',
      actor: 'razorpay_webhook',
      previousState: 'NEW',
      newState: 'CLASSIFIED',
      reason: 'Razorpay webhook received for failed charge',
      decision: { category: 'RETRYABLE' },
      metadata: { attempt: 1 },
    };

    const result = await logAuditEvent(input, mockClient);

    assert.strictEqual(result.id, 'audit-uuid-mock-456');
    assert.strictEqual(result.recovery_case_id, 'case-uuid-123');
    assert.strictEqual(result.event_type, 'PAYMENT_FAILURE_DETECTED');
    assert.strictEqual(result.actor, 'razorpay_webhook');
    assert.strictEqual(result.previous_state, 'NEW');
    assert.strictEqual(result.new_state, 'CLASSIFIED');
    assert.strictEqual(result.reason, 'Razorpay webhook received for failed charge');
    assert.deepStrictEqual(result.decision, { category: 'RETRYABLE' });
    assert.deepStrictEqual(result.metadata, { attempt: 1 });

    assert.strictEqual(store.length, 1);
    assert.strictEqual(store[0].event_type, 'PAYMENT_FAILURE_DETECTED');
  });

  it('supports all defined audit event types in the union', () => {
    const validEventTypes: AuditEventType[] = [
      'WEBHOOK_RECEIVED',
      'WEBHOOK_DUPLICATE_IGNORED',
      'WEBHOOK_SIGNATURE_VERIFIED',
      'PAYMENT_FAILURE_DETECTED',
      'CASE_CREATED',
      'STATE_VERIFIED',
      'FAILURE_CLASSIFIED',
      'POLICY_EVALUATED',
      'ACTION_BLOCKED',
      'ACTION_PLANNED',
      'ACTION_SCHEDULED',
      'ACTION_EXECUTING',
      'ACTION_COMPLETED',
      'ACTION_FAILED',
      'CUSTOMER_CONTACTED',
      'CUSTOMER_OPTED_OUT',
      'SUBSCRIPTION_RECOVERED',
      'PENDING_ACTION_CANCELLED',
      'CASE_ESCALATED',
      'CASE_STOPPED',
    ];

    assert.strictEqual(validEventTypes.length, 20);
  });

  it('handles optional fields safely when inserting audit log', async () => {
    const { mockClient, store } = createMockSupabaseClient();

    const input: LogAuditEventInput = {
      eventType: 'CASE_CREATED',
      actor: 'system',
    };

    const result = await logAuditEvent(input, mockClient);

    assert.strictEqual(result.event_type, 'CASE_CREATED');
    assert.strictEqual(result.actor, 'system');
    assert.strictEqual(result.recovery_case_id, null);
    assert.strictEqual(result.previous_state, null);
    assert.strictEqual(result.new_state, null);
    assert.strictEqual(result.decision, null);
    assert.strictEqual(result.reason, null);
    assert.strictEqual(result.metadata, null);

    assert.strictEqual(store.length, 1);
  });
});
