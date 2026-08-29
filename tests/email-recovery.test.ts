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
            return { data: { id: 'audit_email_1' }, error: null };
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
          if (table === 'audit_log') auditLogs.push(data);
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

function createMockResendClient(shouldFail = false, errorMessage = 'Resend API rate limit exceeded') {
  let callCount = 0;
  const sentEmails: Record<string, unknown>[] = [];

  const mockResend = {
    emails: {
      send: async (payload: Record<string, unknown>) => {
        callCount++;
        sentEmails.push(payload);
        if (shouldFail) {
          return { data: null, error: { message: errorMessage, name: 'ResendError' } };
        }
        return { data: { id: `email_msg_${callCount}` }, error: null };
      },
    },
  };

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockResend: mockResend as any,
    getCallCount: () => callCount,
    sentEmails,
  };
}

describe('Phase 8 — Resend Email Recovery System Integration', () => {
  const dummyCase: RecoveryCase = {
    id: 'case_email_001',
    subscription_id: 'sub_email_001',
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
    id: 'sub_email_001',
    current_status: 'halted',
    amount: 1000,
  };

  it('successful recovery email -> action COMPLETED, contact_attempt_count incremented, CUSTOMER_CONTACTED audit event', async () => {
    const db = createMockDatabase();
    db.recoveryCases.set(dummyCase.id, { ...dummyCase });
    db.subscriptions.set(dummySub.id, { ...dummySub });

    const action: RecoveryAction = {
      id: 'act_email_001',
      recovery_case_id: dummyCase.id,
      action_type: 'SEND_RECOVERY_MESSAGE',
      status: 'SCHEDULED',
      scheduled_for: new Date().toISOString(),
      idempotency_key: 'ik_email_001',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.recoveryActions.set(action.id, action as unknown as Record<string, unknown>);

    const resendMock = createMockResendClient(false);

    const res = await executeRecoveryAction(
      action.id,
      { customResendClient: resendMock.mockResend, toEmail: 'user@example.com' },
      db.mockClient
    );

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'COMPLETED');
    assert.strictEqual(resendMock.getCallCount(), 1);
    assert.strictEqual(resendMock.sentEmails[0].to, 'user@example.com');

    // Case contact count incremented
    const updatedCase = db.recoveryCases.get(dummyCase.id);
    assert.strictEqual(updatedCase?.contact_attempt_count, 1);

    // Audit logs emitted
    assert.ok(db.auditLogs.some((l) => l.event_type === 'CUSTOMER_CONTACTED'));
    assert.ok(db.auditLogs.some((l) => l.event_type === 'ACTION_COMPLETED'));
  });

  it('Resend failure -> action FAILED, contact_attempt_count NOT incremented, ACTION_FAILED audit event', async () => {
    const db = createMockDatabase();
    db.recoveryCases.set(dummyCase.id, { ...dummyCase });
    db.subscriptions.set(dummySub.id, { ...dummySub });

    const action: RecoveryAction = {
      id: 'act_email_fail_002',
      recovery_case_id: dummyCase.id,
      action_type: 'SEND_RECOVERY_MESSAGE',
      status: 'SCHEDULED',
      scheduled_for: new Date().toISOString(),
      idempotency_key: 'ik_email_fail_002',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.recoveryActions.set(action.id, action as unknown as Record<string, unknown>);

    const resendMock = createMockResendClient(true, 'Invalid API Key');

    const res = await executeRecoveryAction(
      action.id,
      { customResendClient: resendMock.mockResend, toEmail: 'user@example.com' },
      db.mockClient
    );

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'FAILED');
    assert.strictEqual(resendMock.getCallCount(), 1);

    // Contact count MUST NOT be incremented on failure
    const updatedCase = db.recoveryCases.get(dummyCase.id);
    assert.strictEqual(updatedCase?.contact_attempt_count, 0);

    assert.ok(db.auditLogs.some((l) => l.event_type === 'ACTION_FAILED'));
  });

  it('contact cap reached -> action BLOCKED, no email sent', async () => {
    const db = createMockDatabase();
    db.recoveryCases.set(dummyCase.id, {
      ...dummyCase,
      contact_attempt_count: 3,
      max_contact_attempts: 3,
    });
    db.subscriptions.set(dummySub.id, { ...dummySub });

    const action: RecoveryAction = {
      id: 'act_email_cap_003',
      recovery_case_id: dummyCase.id,
      action_type: 'SEND_RECOVERY_MESSAGE',
      status: 'SCHEDULED',
      scheduled_for: new Date().toISOString(),
      idempotency_key: 'ik_email_cap_003',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.recoveryActions.set(action.id, action as unknown as Record<string, unknown>);

    const resendMock = createMockResendClient(false);

    const res = await executeRecoveryAction(
      action.id,
      { customResendClient: resendMock.mockResend, toEmail: 'user@example.com' },
      db.mockClient
    );

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'BLOCKED');
    assert.strictEqual(resendMock.getCallCount(), 0); // NO email sent!
    assert.ok(db.auditLogs.some((l) => l.event_type === 'ACTION_BLOCKED'));
  });

  it('payment recovered before execution -> no email sent, PENDING_ACTION_CANCELLED emitted', async () => {
    const db = createMockDatabase();
    db.recoveryCases.set(dummyCase.id, { ...dummyCase });
    db.subscriptions.set(dummySub.id, { ...dummySub, current_status: 'active' });

    const action: RecoveryAction = {
      id: 'act_email_rec_004',
      recovery_case_id: dummyCase.id,
      action_type: 'SEND_RECOVERY_MESSAGE',
      status: 'SCHEDULED',
      scheduled_for: new Date().toISOString(),
      idempotency_key: 'ik_email_rec_004',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.recoveryActions.set(action.id, action as unknown as Record<string, unknown>);

    const resendMock = createMockResendClient(false);

    const res = await executeRecoveryAction(
      action.id,
      { customResendClient: resendMock.mockResend, toEmail: 'user@example.com' },
      db.mockClient
    );

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'CANCELLED');
    assert.strictEqual(resendMock.getCallCount(), 0); // NO email sent!
    assert.ok(db.auditLogs.some((l) => l.event_type === 'PENDING_ACTION_CANCELLED'));
  });

  it('fraud flagged -> no email sent, action BLOCKED, case ESCALATED', async () => {
    const db = createMockDatabase();
    db.recoveryCases.set(dummyCase.id, {
      ...dummyCase,
      failure_category: 'FRAUD_FLAGGED',
    });
    db.subscriptions.set(dummySub.id, { ...dummySub });

    const action: RecoveryAction = {
      id: 'act_email_fraud_005',
      recovery_case_id: dummyCase.id,
      action_type: 'SEND_RECOVERY_MESSAGE',
      status: 'SCHEDULED',
      scheduled_for: new Date().toISOString(),
      idempotency_key: 'ik_email_fraud_005',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.recoveryActions.set(action.id, action as unknown as Record<string, unknown>);

    const resendMock = createMockResendClient(false);

    const res = await executeRecoveryAction(
      action.id,
      { customResendClient: resendMock.mockResend, toEmail: 'user@example.com' },
      db.mockClient
    );

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'BLOCKED');
    assert.strictEqual(resendMock.getCallCount(), 0); // NO email sent!
    assert.ok(db.auditLogs.some((l) => l.event_type === 'CASE_ESCALATED'));
  });

  it('duplicate action execution -> only one email sent via atomic locking', async () => {
    const db = createMockDatabase();
    db.recoveryCases.set(dummyCase.id, { ...dummyCase });
    db.subscriptions.set(dummySub.id, { ...dummySub });

    const action: RecoveryAction = {
      id: 'act_email_dup_006',
      recovery_case_id: dummyCase.id,
      action_type: 'SEND_RECOVERY_MESSAGE',
      status: 'SCHEDULED',
      scheduled_for: new Date().toISOString(),
      idempotency_key: 'ik_email_dup_006',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.recoveryActions.set(action.id, action as unknown as Record<string, unknown>);

    const resendMock = createMockResendClient(false);

    // Concurrent execution calls
    const [res1, res2] = await Promise.all([
      executeRecoveryAction(
        action.id,
        { customResendClient: resendMock.mockResend, toEmail: 'user@example.com' },
        db.mockClient
      ),
      executeRecoveryAction(
        action.id,
        { customResendClient: resendMock.mockResend, toEmail: 'user@example.com' },
        db.mockClient
      ),
    ]);

    const successes = [res1, res2].filter((r) => r.success);
    assert.strictEqual(successes.length, 1);
    assert.strictEqual(resendMock.getCallCount(), 1); // Exactly 1 email sent!
  });
});
