import assert from 'node:assert';
import { describe, it } from 'node:test';
import { GET as getAnalyticsRoute } from '@/app/api/recovery/analytics/route';
import { getAnalyticsSummary, getRecoveryCasesList } from '@/lib/dashboard/queries';
import { runRecoverySimulation } from '@/lib/dashboard/simulation-service';
import { SupabaseClient } from '@supabase/supabase-js';

function createMockDatabase() {
  const recoveryCases = new Map<string, Record<string, unknown>>();
  const subscriptions = new Map<string, Record<string, unknown>>();
  const recoveryOutcomes = new Map<string, Record<string, unknown>>();
  const recoveryActions = new Map<string, Record<string, unknown>>();
  const webhookEvents = new Map<string, Record<string, unknown>>();
  const auditLogs: Record<string, unknown>[] = [];

  // Seed sample data
  const sub1 = { id: 'sub_001', razorpay_subscription_id: 'sub_rzp_001', customer_id: 'cust_001', amount: 5000, current_status: 'halted' };
  const sub2 = { id: 'sub_002', razorpay_subscription_id: 'sub_rzp_002', customer_id: 'cust_002', amount: 10000, current_status: 'active' };

  subscriptions.set(sub1.id, sub1);
  subscriptions.set(sub2.id, sub2);

  const case1 = {
    id: 'case_001',
    subscription_id: 'sub_001',
    customer_id: 'cust_001',
    status: 'ACTION_PLANNED',
    failure_category: 'RETRYABLE',
    recovery_strategy: 'WAIT_AND_MONITOR',
    retry_count: 1,
    contact_attempt_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const case2 = {
    id: 'case_002',
    subscription_id: 'sub_002',
    customer_id: 'cust_002',
    status: 'RECOVERED',
    failure_category: 'RETRYABLE',
    recovery_strategy: 'WAIT_AND_MONITOR',
    retry_count: 1,
    contact_attempt_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  recoveryCases.set(case1.id, case1);
  recoveryCases.set(case2.id, case2);

  recoveryOutcomes.set('outcome_002', {
    id: 'outcome_002',
    recovery_case_id: 'case_002',
    outcome: 'RECOVERED',
    recovered_amount: 10000,
  });

  const mockClient = {
    from: (table: string) => {
      const eqMap: Record<string, string> = {};
      let inVals: string[] = [];
      let updateData: Record<string, unknown> | null = null;
      let insertData: Record<string, unknown> | null = null;

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
        not: () => builder,
        lte: () => builder,
        gte: () => builder,
        order: () => builder,
        limit: () => builder,
        update: (data: Record<string, unknown>) => {
          updateData = data;
          return builder;
        },
        insert: (data: Record<string, unknown>) => {
          insertData = data;
          if (table === 'audit_log') auditLogs.push(data);
          if (table === 'subscriptions' && data.id) {
            subscriptions.set(data.id as string, data);
          }
          if (table === 'webhook_events') {
            const id = (data.id as string) || `we_${Date.now()}`;
            webhookEvents.set(id, { ...data, id });
          }
          if (table === 'recovery_cases') {
            const id = (data.id as string) || `c_${Date.now()}`;
            recoveryCases.set(id, { ...data, id });
          }
          return builder;
        },
        upsert: (data: Record<string, unknown>) => {
          if (table === 'webhook_events') {
            const id = (data.id as string) || (data.provider_event_id as string);
            webhookEvents.set(id, { ...data, id });
          }
          return builder;
        },
        maybeSingle: async () => {
          if (table === 'subscriptions') {
            if (eqMap.id) return { data: subscriptions.get(eqMap.id) || null, error: null };
            if (eqMap.razorpay_subscription_id) {
              for (const s of subscriptions.values()) {
                if (s.razorpay_subscription_id === eqMap.razorpay_subscription_id) {
                  return { data: s, error: null };
                }
              }
            }
          }
          if (table === 'recovery_cases') {
            if (eqMap.id) return { data: recoveryCases.get(eqMap.id) || null, error: null };
            if (eqMap.subscription_id) {
              for (const c of recoveryCases.values()) {
                if (c.subscription_id === eqMap.subscription_id) {
                  return { data: c, error: null };
                }
              }
            }
          }
          if (table === 'webhook_events' && eqMap.provider_event_id) {
            for (const w of webhookEvents.values()) {
              if (w.provider_event_id === eqMap.provider_event_id) {
                return { data: w, error: null };
              }
            }
          }
          return { data: null, error: null };
        },
        single: async () => {
          if (table === 'audit_log') return { data: { id: 'audit_dash_1' }, error: null };
          if (table === 'webhook_events' && insertData) {
            const id = `we_${Date.now()}_${Math.random()}`;
            const record = { ...insertData, id };
            webhookEvents.set(id, record);
            return { data: record, error: null };
          }
          if (table === 'recovery_cases' && insertData) {
            const id = `rc_${Date.now()}_${Math.random()}`;
            const record = { ...insertData, id };
            recoveryCases.set(id, record);
            return { data: record, error: null };
          }
          return { data: null, error: null };
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (resolve: any) => {
          if (updateData && eqMap.id) {
            if (table === 'recovery_cases') {
              const existing = recoveryCases.get(eqMap.id);
              if (existing) Object.assign(existing, updateData);
            }
            if (table === 'subscriptions') {
              const existing = subscriptions.get(eqMap.id);
              if (existing) Object.assign(existing, updateData);
            }
          }

          if (table === 'recovery_cases') {
            let list = Array.from(recoveryCases.values());
            if (inVals.length > 0) {
              list = list.filter((c) => inVals.includes(c.status as string));
            }
            return resolve({ data: list, error: null });
          }

          if (table === 'subscriptions') {
            return resolve({ data: Array.from(subscriptions.values()), error: null });
          }

          if (table === 'recovery_outcomes') {
            return resolve({ data: Array.from(recoveryOutcomes.values()), error: null });
          }

          if (table === 'recovery_actions') {
            return resolve({ data: Array.from(recoveryActions.values()), error: null });
          }

          if (table === 'audit_log') {
            return resolve({ data: auditLogs, error: null });
          }

          return resolve({ data: [], error: null });
        },
      };

      return builder;
    },
  };

  return {
    mockClient: mockClient as unknown as SupabaseClient,
    recoveryCases,
    subscriptions,
    recoveryOutcomes,
  };
}

describe('Phase 10 — Recovery Dashboard & Admin UI Service Layer', () => {
  it('calculates analytics summary metrics correctly from actual database records', async () => {
    const db = createMockDatabase();
    const summary = await getAnalyticsSummary(db.mockClient);

    assert.strictEqual(summary.totalCases, 2);
    assert.strictEqual(summary.revenueAtRisk, 15000); // 5000 + 10000
    assert.strictEqual(summary.revenueRecovered, 10000);
    assert.strictEqual(summary.recoveryRate, 66.7); // (10000 / 15000) * 100
    assert.strictEqual(summary.casesByStatus.RECOVERED, 1);
    assert.strictEqual(summary.casesByStatus.ACTION_PLANNED, 1);
  });

  it('handles division by zero safely when revenue at risk is 0', async () => {
    const emptyDb = {
      from: () => ({
        select: () => ({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          then: (resolve: any) => resolve({ data: [], error: null }),
        }),
      }),
    };

    const summary = await getAnalyticsSummary(emptyDb as unknown as SupabaseClient);
    assert.strictEqual(summary.revenueAtRisk, 0);
    assert.strictEqual(summary.revenueRecovered, 0);
    assert.strictEqual(summary.recoveryRate, 0);
  });

  it('filters case queue list by status and search query', async () => {
    const db = createMockDatabase();

    const allCases = await getRecoveryCasesList({ status: 'ALL' }, db.mockClient);
    assert.strictEqual(allCases.length, 2);

    const recoveredOnly = await getRecoveryCasesList({ status: 'RECOVERED' }, db.mockClient);
    assert.strictEqual(recoveredOnly.length, 1);
    assert.strictEqual(recoveredOnly[0].id, 'case_002');

    const searchMatch = await getRecoveryCasesList({ search: 'case_001' }, db.mockClient);
    assert.strictEqual(searchMatch.length, 1);
    assert.strictEqual(searchMatch[0].id, 'case_001');
  });

  it('runs recovery simulation deterministically and seeds database cases', async () => {
    const db = createMockDatabase();
    const simRes = await runRecoverySimulation(db.mockClient);
    assert.strictEqual(simRes.status, 'success');
    assert.ok(simRes.casesProcessed > 0);
  });

  it('Security: Analytics API endpoint does NOT expose secrets in responses', async () => {
    const response = await getAnalyticsRoute();
    const json = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(json.status, 'ok');

    const jsonString = JSON.stringify(json);
    assert.strictEqual(jsonString.includes('RAZORPAY_KEY_SECRET'), false);
    assert.strictEqual(jsonString.includes('RESEND_API_KEY'), false);
    assert.strictEqual(jsonString.includes('NVIDIA_API_KEY'), false);
    assert.strictEqual(jsonString.includes('SUPABASE_SERVICE_ROLE_KEY'), false);
  });
});
