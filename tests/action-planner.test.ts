import assert from 'node:assert';
import { describe, it } from 'node:test';
import { planRecoveryAction } from '@/lib/actions/planner';
import { evaluatePolicy } from '@/lib/policy/policy-engine';
import { PolicyInput, RecoveryCase } from '@/types/recovery';

function createMockDatabase() {
  const recoveryActions = new Map<string, Record<string, unknown>>();
  const recoveryActionsByIdempotency = new Map<string, Record<string, unknown>>();
  const auditLogs: Record<string, unknown>[] = [];

  const mockClient = {
    from: (table: string) => {
      const eqMap: Record<string, string> = {};
      let insertData: Record<string, unknown> | null = null;
      let isCountQuery = false;

      const builder = {
        select: (cols?: string, options?: { count?: string; head?: boolean }) => {
          if (options?.count === 'exact') {
            isCountQuery = true;
          }
          return builder;
        },
        eq: (col: string, val: string) => {
          eqMap[col] = val;
          return builder;
        },
        in: () => builder,
        maybeSingle: async () => {
          if (table === 'recovery_actions') {
            if (eqMap.idempotency_key) {
              const found = recoveryActionsByIdempotency.get(eqMap.idempotency_key);
              return { data: found || null, error: null };
            }
            if (eqMap.recovery_case_id && eqMap.action_type) {
              const found = Array.from(recoveryActions.values()).find(
                (a) =>
                  a.recovery_case_id === eqMap.recovery_case_id &&
                  a.action_type === eqMap.action_type &&
                  ['PENDING', 'SCHEDULED'].includes(a.status as string)
              );
              return { data: found || null, error: null };
            }
          }
          return { data: null, error: null };
        },
        single: async () => {
          if (table === 'audit_log') {
            return { data: { id: 'audit_100' }, error: null };
          }

          if (insertData) {
            const id = `act-uuid-${Math.random().toString(36).substring(2, 8)}`;
            const rec: Record<string, unknown> = {
              ...insertData,
              id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            if (table === 'recovery_actions') {
              const ik = rec.idempotency_key as string;
              recoveryActions.set(id, rec);
              if (ik) recoveryActionsByIdempotency.set(ik, rec);
            } else if (table === 'audit_log') {
              auditLogs.push(rec);
            }
            return { data: rec, error: null };
          }

          if (table === 'recovery_actions' && eqMap.idempotency_key) {
            const found = recoveryActionsByIdempotency.get(eqMap.idempotency_key);
            return { data: found || null, error: null };
          }
          return { data: null, error: { message: 'Not found' } };
        },
        insert: (data: Record<string, unknown>) => {
          insertData = data;
          if (table === 'audit_log') auditLogs.push(data);
          return builder;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (resolve: any) => {
          if (
            isCountQuery &&
            table === 'recovery_actions' &&
            eqMap.recovery_case_id
          ) {
            const count = Array.from(recoveryActions.values()).filter(
              (a) => a.recovery_case_id === eqMap.recovery_case_id
            ).length;
            return resolve({ count, data: null, error: null });
          }

          if (insertData) {
            const id = `act-uuid-${Math.random().toString(36).substring(2, 8)}`;
            const rec: Record<string, unknown> = {
              ...insertData,
              id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            if (table === 'recovery_actions') {
              const ik = rec.idempotency_key as string;
              recoveryActions.set(id, rec);
              if (ik) recoveryActionsByIdempotency.set(ik, rec);
            } else if (table === 'audit_log') {
              auditLogs.push(rec);
            }
            return resolve({ data: rec, error: null });
          }

          return resolve({ data: [], error: null });
        },
      };

      return builder;
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { mockClient: mockClient as any, recoveryActions, auditLogs };
}

describe('Recovery Action Planner', () => {
  const dummyCase: RecoveryCase = {
    id: 'case_uuid_001',
    subscription_id: 'sub_001',
    status: 'ACTION_PLANNED',
    failure_category: 'RETRYABLE',
    retry_count: 0,
    contact_attempt_count: 0,
    max_retries: 3,
    max_contact_attempts: 3,
    attribution_window_hours: 72,
    opened_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const policyInput: PolicyInput = {
    caseId: dummyCase.id,
    subscriptionStatus: 'halted',
    failureCategory: 'RETRYABLE',
    amount: 1000,
    retryCount: 0,
    contactAttemptCount: 0,
    customerOptedOut: false,
    quietHoursActive: false,
    allowedRecoveryWindow: true,
  };

  it('plans a valid recovery action permitted by policy engine', async () => {
    const db = createMockDatabase();
    const policyResult = evaluatePolicy(policyInput);

    const action = await planRecoveryAction(
      { recoveryCase: dummyCase, policyResult },
      db.mockClient
    );

    assert.notStrictEqual(action, null);
    assert.strictEqual(action?.status, 'PENDING');
    assert.strictEqual(
      action?.idempotency_key,
      `case_${dummyCase.id}_action_${policyResult.allowedActions[0].toLowerCase()}_seq_1`
    );
    assert.strictEqual(db.recoveryActions.size, 1);
    assert.ok(db.auditLogs.some((l) => l.event_type === 'ACTION_PLANNED'));
  });

  it('returns null if policy result has no allowed executable actions or is ESCALATE/STOP', async () => {
    const db = createMockDatabase();
    const fraudInput: PolicyInput = {
      ...policyInput,
      failureCategory: 'FRAUD_FLAGGED',
    };
    const policyResult = evaluatePolicy(fraudInput);

    const action = await planRecoveryAction(
      { recoveryCase: dummyCase, policyResult },
      db.mockClient
    );

    assert.strictEqual(action, null);
    assert.strictEqual(db.recoveryActions.size, 0);
  });

  it('returns existing action idempotently when identical idempotency key or pending action exists', async () => {
    const db = createMockDatabase();
    const policyResult = evaluatePolicy(policyInput);

    const action1 = await planRecoveryAction(
      { recoveryCase: dummyCase, policyResult },
      db.mockClient
    );
    const action2 = await planRecoveryAction(
      { recoveryCase: dummyCase, policyResult },
      db.mockClient
    );

    assert.strictEqual(action1?.id, action2?.id);
    assert.strictEqual(db.recoveryActions.size, 1);
  });
});
