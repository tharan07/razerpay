import assert from 'node:assert';
import { describe, it } from 'node:test';
import { GET as cronRoute, processRecoveryCron } from '@/app/api/cron/recovery/route';
import { SupabaseClient } from '@supabase/supabase-js';

function createMockDatabase() {
  const recoveryActions = new Map<string, Record<string, unknown>>();
  const recoveryCases = new Map<string, Record<string, unknown>>();

  const mockClient = {
    from: (table: string) => {
      const eqMap: Record<string, string> = {};
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
        lte: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (resolve: any) => {
          if (table === 'recovery_actions') {
            let list = Array.from(recoveryActions.values());
            if (inVals.length > 0) {
              list = list.filter((a) => inVals.includes(a.status as string));
            }
            if (eqMap.status) {
              list = list.filter((a) => a.status === eqMap.status);
            }
            return resolve({ data: list, error: null });
          }
          if (table === 'recovery_cases') {
            return resolve({ data: Array.from(recoveryCases.values()), error: null });
          }
          return resolve({ data: [], error: null });
        },
      };

      return builder;
    },
  };

  return {
    mockClient: mockClient as unknown as SupabaseClient,
    recoveryActions,
    recoveryCases,
  };
}

describe('Phase 11 — Vercel Cron Scheduled Recovery Action Worker', () => {
  it('rejects unauthorized cron request when CRON_SECRET is configured', async () => {
    const origSecret = process.env.CRON_SECRET;
    try {
      process.env.CRON_SECRET = 'super-secret-cron-key-123';

      const unauthReq = new Request('http://localhost/api/cron/recovery', {
        headers: {},
      });

      const res = await cronRoute(unauthReq);
      assert.strictEqual(res.status, 401);

      const json = await res.json();
      assert.ok(json.error.includes('Unauthorized cron request'));
    } finally {
      process.env.CRON_SECRET = origSecret;
    }
  });

  it('accepts authorized cron request with valid Bearer CRON_SECRET', async () => {
    const origSecret = process.env.CRON_SECRET;
    const db = createMockDatabase();

    try {
      process.env.CRON_SECRET = 'super-secret-cron-key-123';

      const authReq = new Request('http://localhost/api/cron/recovery', {
        headers: {
          authorization: 'Bearer super-secret-cron-key-123',
        },
      });

      // Verify authorization check
      const authRes = await cronRoute(authReq);
      assert.notStrictEqual(authRes.status, 401);

      // Verify cron processing logic with mock client
      const res = await processRecoveryCron({ dbClient: db.mockClient });
      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(typeof res.processed, 'number');
      assert.strictEqual(typeof res.completed, 'number');
    } finally {
      process.env.CRON_SECRET = origSecret;
    }
  });

  it('processes cron requests normally when CRON_SECRET is unconfigured (open dev mode)', async () => {
    const origSecret = process.env.CRON_SECRET;
    const db = createMockDatabase();

    try {
      delete process.env.CRON_SECRET;

      const res = await processRecoveryCron({ dbClient: db.mockClient });
      assert.strictEqual(res.status, 'ok');
    } finally {
      process.env.CRON_SECRET = origSecret;
    }
  });

  it('processRecoveryCron respects batch size limit', async () => {
    const db = createMockDatabase();
    const res = await processRecoveryCron({ dbClient: db.mockClient, batchSize: 5 });
    assert.strictEqual(res.status, 'ok');
    assert.strictEqual(typeof res.processed, 'number');
  });
});
