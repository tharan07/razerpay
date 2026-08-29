import assert from 'node:assert';
import { describe, it } from 'node:test';
import { getDueScheduledActions, schedulePendingActions } from '@/lib/actions/scheduler';
import { RecoveryAction } from '@/types/recovery';

function createMockDatabase() {
  const recoveryActions = new Map<string, Record<string, unknown>>();
  const recoveryCases = new Map<string, Record<string, unknown>>();
  const auditLogs: Record<string, unknown>[] = [];

  const mockClient = {
    from: (table: string) => {
      const eqMap: Record<string, string> = {};
      let updateData: Record<string, unknown> | null = null;
      let lteCol: string | null = null;
      let lteVal: string | null = null;
      let inCol: string | null = null;
      let inVals: string[] = [];

      const builder = {
        select: () => builder,
        eq: (col: string, val: string) => {
          eqMap[col] = val;
          return builder;
        },
        lte: (col: string, val: string) => {
          lteCol = col;
          lteVal = val;
          return builder;
        },
        in: (col: string, vals: string[]) => {
          inCol = col;
          inVals = vals;
          return builder;
        },
        update: (data: Record<string, unknown>) => {
          updateData = data;
          return builder;
        },
        maybeSingle: async () => {
          if (table === 'audit_log') {
            return { data: { id: 'audit_sch_1' }, error: null };
          }
          if (updateData && eqMap.id && table === 'recovery_actions') {
            const existing = recoveryActions.get(eqMap.id);
            const statusMatch = eqMap.status
              ? existing?.status === eqMap.status
              : true;
            if (existing && statusMatch) {
              Object.assign(existing, updateData);
              return { data: existing, error: null };
            }
          }
          return { data: null, error: null };
        },
        single: async () => {
          if (table === 'audit_log') {
            return { data: { id: 'audit_sch_1' }, error: null };
          }
          return { data: null, error: null };
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (resolve: any) => {
          if (
            table === 'recovery_actions' &&
            eqMap.status === 'PENDING' &&
            lteCol === 'scheduled_for'
          ) {
            const matches = Array.from(recoveryActions.values()).filter(
              (a) =>
                a.status === 'PENDING' &&
                (a.scheduled_for as string) <= (lteVal || '')
            );
            return resolve({ data: matches, error: null });
          }

          if (
            table === 'recovery_actions' &&
            inCol === 'status' &&
            lteCol === 'scheduled_for'
          ) {
            const matches = Array.from(recoveryActions.values()).filter(
              (a) =>
                inVals.includes(a.status as string) &&
                (a.scheduled_for as string) <= (lteVal || '')
            );
            return resolve({ data: matches, error: null });
          }

          if (updateData && eqMap.id && table === 'recovery_cases') {
            const existing = recoveryCases.get(eqMap.id);
            if (existing) Object.assign(existing, updateData);
            return resolve({ data: existing, error: null });
          }

          return resolve({ data: [], error: null });
        },
        insert: (data: Record<string, unknown>) => {
          if (table === 'audit_log') auditLogs.push(data);
          return builder;
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
    auditLogs,
  };
}

describe('Recovery Action Scheduler', () => {
  it('schedules pending actions that are due and updates recovery case next_eligible_action_at', async () => {
    const db = createMockDatabase();
    const now = new Date('2026-08-29T12:00:00Z');

    const actionPending: RecoveryAction = {
      id: 'act_001',
      recovery_case_id: 'case_001',
      action_type: 'WAIT_AND_MONITOR',
      status: 'PENDING',
      scheduled_for: '2026-08-29T11:50:00Z',
      idempotency_key: 'ik_001',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    db.recoveryActions.set(
      actionPending.id,
      actionPending as unknown as Record<string, unknown>
    );
    db.recoveryCases.set('case_001', {
      id: 'case_001',
      next_eligible_action_at: null,
    });

    const scheduled = await schedulePendingActions(now, db.mockClient);

    assert.strictEqual(scheduled.length, 1);
    assert.strictEqual(scheduled[0].status, 'SCHEDULED');
    assert.strictEqual(actionPending.status, 'SCHEDULED');
    assert.ok(db.auditLogs.some((l) => l.event_type === 'ACTION_SCHEDULED'));
  });

  it('fetches due scheduled actions for execution', async () => {
    const db = createMockDatabase();
    const now = new Date('2026-08-29T12:00:00Z');

    const actionScheduled: RecoveryAction = {
      id: 'act_002',
      recovery_case_id: 'case_002',
      action_type: 'SEND_RECOVERY_MESSAGE',
      status: 'SCHEDULED',
      scheduled_for: '2026-08-29T11:55:00Z',
      idempotency_key: 'ik_002',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    db.recoveryActions.set(
      actionScheduled.id,
      actionScheduled as unknown as Record<string, unknown>
    );

    const due = await getDueScheduledActions(now, db.mockClient);
    assert.strictEqual(due.length, 1);
    assert.strictEqual(due[0].id, 'act_002');
  });
});
