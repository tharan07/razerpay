import assert from 'node:assert';
import { describe, it } from 'node:test';
import { executeRecoveryAction } from '@/lib/actions/executor';
import { RecoveryAction, RecoveryCase } from '@/types/recovery';

function createMockDatabase() {
  const recoveryActions = new Map<string, Record<string, unknown>>();
  const recoveryCases = new Map<string, Record<string, unknown>>();
  const subscriptions = new Map<string, Record<string, unknown>>();
  const auditLogs: Record<string, unknown>[] = [];

  const mockClient = {
    from: (table: string) => {
      const eqMap: Record<string, string> = {};
      let updateData: Record<string, unknown> | null = null;
      let inVals: string[] = [];

      const builder = {
        select: () => builder,
        eq: (col: string, val: string) => {
          eqMap[col] = val;
          return builder;
        },
        in: (_col: string, vals: string[]) => {
          inVals = vals;
          return builder;
        },
        update: (data: Record<string, unknown>) => {
          updateData = data;
          return builder;
        },
        maybeSingle: async () => {
          if (updateData && eqMap.id && table === 'recovery_actions') {
            const existing = recoveryActions.get(eqMap.id);
            const statusMatch =
              inVals.length > 0 ? inVals.includes(existing?.status as string) : true;
            if (existing && statusMatch) {
              Object.assign(existing, updateData);
              return { data: existing, error: null };
            }
            return { data: null, error: null };
          }

          if (table === 'recovery_actions' && eqMap.id) {
            const found = recoveryActions.get(eqMap.id);
            return { data: found || null, error: null };
          }

          if (table === 'recovery_cases' && eqMap.id) {
            const found = recoveryCases.get(eqMap.id);
            return { data: found || null, error: null };
          }

          if (table === 'subscriptions' && eqMap.id) {
            const found = subscriptions.get(eqMap.id);
            return { data: found || null, error: null };
          }

          return { data: null, error: null };
        },
        single: async () => {
          if (table === 'audit_log') {
            return { data: { id: 'audit_123' }, error: null };
          }
          if (updateData && eqMap.id && table === 'recovery_actions') {
            const existing = recoveryActions.get(eqMap.id);
            if (existing) {
              Object.assign(existing, updateData);
              return { data: existing, error: null };
            }
          }
          if (updateData && eqMap.id && table === 'recovery_cases') {
            const existing = recoveryCases.get(eqMap.id);
            if (existing) {
              Object.assign(existing, updateData);
              return { data: existing, error: null };
            }
          }
          return { data: null, error: null };
        },
        insert: (data: Record<string, unknown>) => {
          if (table === 'audit_log') {
            auditLogs.push(data);
          }
          return builder;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (resolve: any) => {
          if (updateData && eqMap.id) {
            if (table === 'recovery_actions') {
              const existing = recoveryActions.get(eqMap.id);
              if (existing) Object.assign(existing, updateData);
            }
            if (table === 'recovery_cases') {
              const existing = recoveryCases.get(eqMap.id);
              if (existing) Object.assign(existing, updateData);
            }
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
    recoveryActions,
    recoveryCases,
    subscriptions,
    auditLogs,
  };
}

describe('Phase 7 — Recovery Action Executor & Race-Condition Locking', () => {
  const dummyCase: RecoveryCase = {
    id: 'case_exec_001',
    subscription_id: 'sub_exec_001',
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

  const dummySub = {
    id: 'sub_exec_001',
    current_status: 'halted',
    amount: 1000,
  };

  it('Critical race-condition test: Only ONE of two simultaneous execution attempts acquires lock & executes', async () => {
    const db = createMockDatabase();
    db.recoveryCases.set(dummyCase.id, { ...dummyCase });
    db.subscriptions.set(dummySub.id, { ...dummySub });

    const action: RecoveryAction = {
      id: 'act_race_001',
      recovery_case_id: dummyCase.id,
      action_type: 'WAIT_AND_MONITOR',
      status: 'SCHEDULED',
      scheduled_for: new Date().toISOString(),
      idempotency_key: 'ik_race_001',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.recoveryActions.set(
      action.id,
      action as unknown as Record<string, unknown>
    );

    // Launch two simultaneous execution attempts
    const [res1, res2] = await Promise.all([
      executeRecoveryAction(action.id, undefined, db.mockClient),
      executeRecoveryAction(action.id, undefined, db.mockClient),
    ]);

    // Exactly one must succeed and one must fail lock acquisition!
    const successes = [res1, res2].filter((r) => r.success);
    const lockFailures = [res1, res2].filter(
      (r) =>
        !r.success &&
        r.reason?.includes('Execution lock acquisition failed')
    );

    assert.strictEqual(successes.length, 1);
    assert.strictEqual(lockFailures.length, 1);
    assert.strictEqual(action.status, 'COMPLETED');
  });

  it('Payment recovered before execution -> action CANCELLED', async () => {
    const db = createMockDatabase();
    db.recoveryCases.set(dummyCase.id, { ...dummyCase });
    db.subscriptions.set(dummySub.id, {
      ...dummySub,
      current_status: 'active',
    });

    const action: RecoveryAction = {
      id: 'act_rec_002',
      recovery_case_id: dummyCase.id,
      action_type: 'SEND_RECOVERY_MESSAGE',
      status: 'SCHEDULED',
      scheduled_for: new Date().toISOString(),
      idempotency_key: 'ik_rec_002',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.recoveryActions.set(
      action.id,
      action as unknown as Record<string, unknown>
    );

    const res = await executeRecoveryAction(action.id, undefined, db.mockClient);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'CANCELLED');
    assert.strictEqual(action.status, 'CANCELLED');
    assert.ok(db.auditLogs.some((l) => l.event_type === 'PENDING_ACTION_CANCELLED'));
  });

  it('Subscription cancelled before execution -> action CANCELLED / STOPPED', async () => {
    const db = createMockDatabase();
    db.recoveryCases.set(dummyCase.id, { ...dummyCase });
    db.subscriptions.set(dummySub.id, {
      ...dummySub,
      current_status: 'cancelled',
    });

    const action: RecoveryAction = {
      id: 'act_canc_003',
      recovery_case_id: dummyCase.id,
      action_type: 'SEND_RECOVERY_MESSAGE',
      status: 'SCHEDULED',
      scheduled_for: new Date().toISOString(),
      idempotency_key: 'ik_canc_003',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.recoveryActions.set(
      action.id,
      action as unknown as Record<string, unknown>
    );

    const res = await executeRecoveryAction(action.id, undefined, db.mockClient);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'CANCELLED');
    assert.strictEqual(action.status, 'CANCELLED');
    assert.ok(db.auditLogs.some((l) => l.event_type === 'CASE_STOPPED'));
  });

  it('Retry cap reached -> action BLOCKED', async () => {
    const db = createMockDatabase();
    db.recoveryCases.set(dummyCase.id, {
      ...dummyCase,
      retry_count: 3,
      max_retries: 3,
    });
    db.subscriptions.set(dummySub.id, { ...dummySub });

    const action: RecoveryAction = {
      id: 'act_cap_004',
      recovery_case_id: dummyCase.id,
      action_type: 'WAIT_AND_MONITOR',
      status: 'SCHEDULED',
      scheduled_for: new Date().toISOString(),
      idempotency_key: 'ik_cap_004',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.recoveryActions.set(
      action.id,
      action as unknown as Record<string, unknown>
    );

    const res = await executeRecoveryAction(action.id, undefined, db.mockClient);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'BLOCKED');
    assert.strictEqual(action.status, 'BLOCKED');
    assert.ok(db.auditLogs.some((l) => l.event_type === 'ACTION_BLOCKED'));
  });

  it('Fraud -> ESCALATED, never automatically executed', async () => {
    const db = createMockDatabase();
    db.recoveryCases.set(dummyCase.id, {
      ...dummyCase,
      failure_category: 'FRAUD_FLAGGED',
    });
    db.subscriptions.set(dummySub.id, { ...dummySub });

    const action: RecoveryAction = {
      id: 'act_fraud_005',
      recovery_case_id: dummyCase.id,
      action_type: 'SEND_RECOVERY_MESSAGE',
      status: 'SCHEDULED',
      scheduled_for: new Date().toISOString(),
      idempotency_key: 'ik_fraud_005',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.recoveryActions.set(
      action.id,
      action as unknown as Record<string, unknown>
    );

    const res = await executeRecoveryAction(action.id, undefined, db.mockClient);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'BLOCKED');
    assert.strictEqual(action.status, 'BLOCKED');
    assert.ok(db.auditLogs.some((l) => l.event_type === 'CASE_ESCALATED'));
  });

  it('Duplicate execution on already COMPLETED action -> no second execution', async () => {
    const db = createMockDatabase();
    db.recoveryCases.set(dummyCase.id, { ...dummyCase });
    db.subscriptions.set(dummySub.id, { ...dummySub });

    const action: RecoveryAction = {
      id: 'act_comp_006',
      recovery_case_id: dummyCase.id,
      action_type: 'WAIT_AND_MONITOR',
      status: 'COMPLETED',
      scheduled_for: new Date().toISOString(),
      idempotency_key: 'ik_comp_006',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.recoveryActions.set(
      action.id,
      action as unknown as Record<string, unknown>
    );

    const res = await executeRecoveryAction(action.id, undefined, db.mockClient);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'COMPLETED');
  });
});
