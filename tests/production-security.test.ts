import assert from 'node:assert';
import { describe, it } from 'node:test';
import { POST as simulateRoute } from '@/app/api/recovery/simulate/route';
import { validateServerEnv } from '@/lib/config/env';

describe('Phase 11 — Production Security & Environment Hardening', () => {
  it('validates server environment variables using validateServerEnv()', () => {
    const env = validateServerEnv();
    assert.ok(env.NEXT_PUBLIC_APP_URL);
    assert.strictEqual(typeof env.RECOVERY_CRON_BATCH_SIZE, 'number');
    assert.strictEqual(typeof env.ENABLE_DEMO_SIMULATION, 'boolean');
  });

  it('Production Security: Simulation endpoint returns 403 Forbidden when NODE_ENV=production', async () => {
    const envRecord = process.env as Record<string, string>;
    const origEnv = envRecord.NODE_ENV;
    const origEnable = envRecord.ENABLE_DEMO_SIMULATION;

    try {
      envRecord.NODE_ENV = 'production';
      envRecord.ENABLE_DEMO_SIMULATION = 'false';

      const res = await simulateRoute();
      assert.strictEqual(res.status, 403);

      const json = await res.json();
      assert.ok(json.error.includes('disabled in production'));
    } finally {
      envRecord.NODE_ENV = origEnv;
      envRecord.ENABLE_DEMO_SIMULATION = origEnable;
    }
  });

  it('Development Security: Simulation endpoint allowed in development mode', async () => {
    const envRecord = process.env as Record<string, string>;
    const origEnv = envRecord.NODE_ENV;
    try {
      envRecord.NODE_ENV = 'development';
      const res = await simulateRoute();
      // Should either return 200 or 500 (if db not seeded), but NOT 403
      assert.notStrictEqual(res.status, 403);
    } finally {
      envRecord.NODE_ENV = origEnv;
    }
  });
});
