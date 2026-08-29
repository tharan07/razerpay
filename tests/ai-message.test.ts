import assert from 'node:assert';
import { describe, it } from 'node:test';
import { executeRecoveryAction } from '@/lib/actions/executor';
import { AIProvider } from '@/lib/ai/provider';
import { generateRecoveryMessage } from '@/lib/ai/recovery-message';
import { RecoveryAction, RecoveryCase } from '@/types/recovery';
import { Resend } from 'resend';

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
            return { data: { id: 'audit_msg_1' }, error: null };
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

describe('Phase 9 — AI Message Generation & Customer Safety Validation', () => {
  it('generates valid English recovery message', async () => {
    const mockProvider: AIProvider = {
      generateText: async () => {
        return JSON.stringify({
          subject: 'Payment Update Required for Subscription',
          body: 'Hello Rahul, Please review your billing method to maintain active subscription access.',
        });
      },
    };

    const res = await generateRecoveryMessage(
      {
        customerName: 'Rahul',
        failureCategory: 'RETRYABLE',
        subscriptionStatus: 'halted',
        allowedMessageType: 'RECOVERY_REMINDER',
        language: 'ENGLISH',
      },
      mockProvider
    );

    assert.strictEqual(res.fallbackUsed, false);
    assert.strictEqual(res.subject, 'Payment Update Required for Subscription');
  });

  it('generates valid Hinglish recovery message', async () => {
    const mockProvider: AIProvider = {
      generateText: async () => {
        return JSON.stringify({
          subject: 'Aapki Subscription Payment Update Karein',
          body: 'Hi Rahul, aapka payment complete nahi ho paya. Please apka payment method update karein.',
        });
      },
    };

    const res = await generateRecoveryMessage(
      {
        customerName: 'Rahul',
        failureCategory: 'RETRYABLE',
        subscriptionStatus: 'halted',
        allowedMessageType: 'RECOVERY_REMINDER',
        language: 'HINGLISH',
      },
      mockProvider
    );

    assert.strictEqual(res.fallbackUsed, false);
    assert.ok(res.body.includes('payment complete nahi ho paya'));
  });

  it('rejects unsafe AI message requesting OTP/password/CVV and uses deterministic template fallback', async () => {
    const mockProvider: AIProvider = {
      generateText: async () => {
        return JSON.stringify({
          subject: 'Urgent: Send OTP to verify payment',
          body: 'Please reply with your card OTP and CVV to complete your subscription payment.',
        });
      },
    };

    const res = await generateRecoveryMessage(
      {
        customerName: 'Rahul',
        failureCategory: 'RETRYABLE',
        subscriptionStatus: 'halted',
        allowedMessageType: 'RECOVERY_REMINDER',
      },
      mockProvider
    );

    assert.strictEqual(res.fallbackUsed, true);
    assert.strictEqual(
      res.subject,
      'Action Required: Update your subscription payment details'
    );
  });

  it('Policy Boundary Test: Fraud flagged case -> Policy blocks contact, AI & Resend NEVER called', async () => {
    const db = createMockDatabase();
    const caseData: RecoveryCase = {
      id: 'case_policy_001',
      subscription_id: 'sub_policy_001',
      status: 'ACTION_PLANNED',
      failure_category: 'FRAUD_FLAGGED',
      retry_count: 0,
      contact_attempt_count: 0,
      max_retries: 3,
      max_contact_attempts: 3,
      attribution_window_hours: 72,
      opened_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    db.recoveryCases.set(caseData.id, { ...caseData });
    db.subscriptions.set('sub_policy_001', { id: 'sub_policy_001', current_status: 'halted' });

    const action: RecoveryAction = {
      id: 'act_policy_001',
      recovery_case_id: caseData.id,
      action_type: 'SEND_RECOVERY_MESSAGE',
      status: 'SCHEDULED',
      scheduled_for: new Date().toISOString(),
      idempotency_key: 'ik_policy_001',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.recoveryActions.set(action.id, action as unknown as Record<string, unknown>);

    let aiCalled = false;
    const mockProvider: AIProvider = {
      generateText: async () => {
        aiCalled = true;
        return 'Should not be called';
      },
    };

    const res = await executeRecoveryAction(
      action.id,
      {
        customActionHandler: async () => {
          // If called, invoke AI message generation to test policy gate
          await generateRecoveryMessage(
            {
              caseId: caseData.id,
              failureCategory: 'FRAUD_FLAGGED',
              subscriptionStatus: 'halted',
              allowedMessageType: 'RECOVERY_REMINDER',
            },
            mockProvider
          );
          return true;
        },
      },
      db.mockClient
    );

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'BLOCKED');
    assert.strictEqual(aiCalled, false); // AI MUST NOT BE CALLED!
  });

  it('Critical Safety Integration Test: Payment recovered before execution -> AI & Resend NEVER called', async () => {
    const db = createMockDatabase();
    const caseData: RecoveryCase = {
      id: 'case_safety_002',
      subscription_id: 'sub_safety_002',
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

    db.recoveryCases.set(caseData.id, { ...caseData });
    db.subscriptions.set('sub_safety_002', {
      id: 'sub_safety_002',
      current_status: 'active', // Already recovered
    });

    const action: RecoveryAction = {
      id: 'act_safety_002',
      recovery_case_id: caseData.id,
      action_type: 'SEND_RECOVERY_MESSAGE',
      status: 'SCHEDULED',
      scheduled_for: new Date().toISOString(),
      idempotency_key: 'ik_safety_002',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.recoveryActions.set(action.id, action as unknown as Record<string, unknown>);

    let aiCalled = false;
    let resendCalled = false;

    const res = await executeRecoveryAction(
      action.id,
      {
        customResendClient: {
          emails: {
            send: async () => {
              resendCalled = true;
              return { data: { id: 'should_not_happen' }, error: null };
            },
          },
        } as unknown as Resend,
        customActionHandler: async () => {
          aiCalled = true;
          return true;
        },
      },
      db.mockClient
    );

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'CANCELLED');
    assert.strictEqual(aiCalled, false);
    assert.strictEqual(resendCalled, false);
    assert.ok(db.auditLogs.some((l) => l.event_type === 'PENDING_ACTION_CANCELLED'));
  });
});
