import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  createRecoveryCase,
  getRecoveryCaseById,
  updateCaseStatus,
} from '@/lib/recovery/case-service';
import { RecoveryCase } from '@/types/recovery';

// Lightweight in-memory mock Supabase client for unit testing
function createMockSupabaseClient(initialData?: Partial<RecoveryCase>[]) {
  const store = new Map<string, Record<string, unknown>>(
    (initialData || []).map((item) => [
      item.id || 'test-case-id',
      {
        id: item.id || 'test-case-id',
        subscription_id: item.subscription_id || 'sub_123',
        payment_attempt_id: item.payment_attempt_id || 'pay_123',
        customer_id: item.customer_id || 'cust_123',
        status: item.status || 'NEW',
        failure_category: item.failure_category || 'RETRYABLE',
        retry_count: item.retry_count ?? 0,
        contact_attempt_count: item.contact_attempt_count ?? 0,
        max_retries: item.max_retries ?? 3,
        max_contact_attempts: item.max_contact_attempts ?? 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])
  );

  const mockClient = {
    from: (table: string) => {
      if (table !== 'recovery_cases') {
        throw new Error(`Unexpected table: ${table}`);
      }

      let currentId: string | null = null;
      let updatePayload: Record<string, unknown> | null = null;
      let insertPayload: Record<string, unknown> | null = null;

      const builder = {
        insert: (payload: Record<string, unknown>) => {
          insertPayload = payload;
          return builder;
        },
        select: () => builder,
        single: async () => {
          if (insertPayload) {
            const id = 'case-uuid-mock-123';
            const record = {
              ...insertPayload,
              id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            store.set(id, record);
            return { data: record, error: null };
          }
          if (currentId && updatePayload) {
            const existing = store.get(currentId);
            if (!existing) return { data: null, error: { message: 'Not found' } };
            const updated = { ...existing, ...updatePayload };
            store.set(currentId, updated);
            return { data: updated, error: null };
          }
          return { data: null, error: { message: 'Invalid query' } };
        },
        eq: (col: string, val: string) => {
          if (col === 'id') currentId = val;
          return builder;
        },
        maybeSingle: async () => {
          if (currentId && store.has(currentId)) {
            return { data: store.get(currentId), error: null };
          }
          return { data: null, error: null };
        },
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload;
          return builder;
        },
      };

      return builder;
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return mockClient as any;
}

describe('Recovery Case Service (Pure & State Transition Validation)', () => {
  it('creates a recovery case starting in status NEW with 0 counts', async () => {
    const mockDb = createMockSupabaseClient();
    const result = await createRecoveryCase(
      {
        subscriptionId: 'sub_test',
        paymentAttemptId: 'pay_test',
        customerId: 'cust_test',
        failureCategory: 'RETRYABLE',
      },
      mockDb
    );

    assert.strictEqual(result.status, 'NEW');
    assert.strictEqual(result.retry_count, 0);
    assert.strictEqual(result.contact_attempt_count, 0);
    assert.strictEqual(result.subscription_id, 'sub_test');
    assert.strictEqual(result.failure_category, 'RETRYABLE');
  });

  it('retrieves an existing recovery case by ID', async () => {
    const mockDb = createMockSupabaseClient([
      { id: 'case-100', status: 'NEW', subscription_id: 'sub_100' },
    ]);

    const caseItem = await getRecoveryCaseById('case-100', mockDb);
    assert.notStrictEqual(caseItem, null);
    assert.strictEqual(caseItem?.id, 'case-100');
    assert.strictEqual(caseItem?.status, 'NEW');
    assert.strictEqual(caseItem?.subscription_id, 'sub_100');
  });

  it('allows valid state transition (NEW -> CLASSIFIED)', async () => {
    const mockDb = createMockSupabaseClient([
      { id: 'case-200', status: 'NEW' },
    ]);

    const updated = await updateCaseStatus('case-200', 'CLASSIFIED', undefined, mockDb);
    assert.strictEqual(updated.status, 'CLASSIFIED');
  });

  it('rejects invalid state transition (NEW -> RECOVERED) before database update', async () => {
    const mockDb = createMockSupabaseClient([
      { id: 'case-300', status: 'NEW' },
    ]);

    await assert.rejects(
      async () => {
        await updateCaseStatus('case-300', 'RECOVERED', undefined, mockDb);
      },
      (err: Error) => {
        return (
          err.message.includes('Invalid recovery case state transition') &&
          err.message.includes("from 'NEW' to 'RECOVERED'")
        );
      }
    );

    // Verify status remained unchanged in store
    const unchanged = await getRecoveryCaseById('case-300', mockDb);
    assert.strictEqual(unchanged?.status, 'NEW');
  });
});
