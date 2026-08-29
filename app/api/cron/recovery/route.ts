import { NextResponse } from 'next/server';
import { executeRecoveryAction } from '@/lib/actions/executor';
import { schedulePendingActions } from '@/lib/actions/scheduler';
import { validateServerEnv } from '@/lib/config/env';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

async function getClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  try {
    return (await createServerClient()) as unknown as SupabaseClient;
  } catch {
    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
    const key =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'placeholder-key';
    return createClient(url, key);
  }
}

export interface RecoveryCronOptions {
  dbClient?: SupabaseClient;
  batchSize?: number;
  now?: Date;
}

/**
 * Core Recovery Cron Processing Engine.
 */
export async function processRecoveryCron(options?: RecoveryCronOptions) {
  const startTime = Date.now();
  const env = validateServerEnv();
  const db = await getClient(options?.dbClient);

  const now = options?.now || new Date();
  await schedulePendingActions(now, db);

  const batchSize = options?.batchSize || env.RECOVERY_CRON_BATCH_SIZE || 20;
  const { data: dueActions } = await db
    .from('recovery_actions')
    .select('id')
    .in('status', ['PENDING', 'SCHEDULED'])
    .lte('scheduled_for', now.toISOString())
    .limit(batchSize);

  let completed = 0;
  let failed = 0;
  let blocked = 0;

  for (const act of dueActions || []) {
    const res = await executeRecoveryAction(act.id as string, undefined, db);
    if (res.status === 'COMPLETED') completed++;
    else if (res.status === 'FAILED') failed++;
    else if (res.status === 'BLOCKED') blocked++;
  }

  const durationMs = Date.now() - startTime;

  return {
    status: 'ok',
    processed: dueActions?.length || 0,
    completed,
    failed,
    blocked,
    durationMs,
  };
}

/**
 * Vercel Cron Worker Endpoint for Scheduled Recovery Processing.
 * Authenticates cron requests via Authorization header or CRON_SECRET.
 */
export async function GET(request: Request) {
  // Authenticate Cron Request
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && cronSecret.trim()) {
    const authHeader = request.headers.get('authorization');
    const cronHeader = request.headers.get('x-cron-secret');
    const expectedBearer = `Bearer ${cronSecret}`;

    const isValid =
      authHeader === expectedBearer ||
      authHeader === cronSecret ||
      cronHeader === cronSecret;

    if (!isValid) {
      return NextResponse.json(
        { error: 'Unauthorized cron request. Invalid or missing CRON_SECRET authorization.' },
        { status: 401 }
      );
    }
  }

  try {
    const result = await processRecoveryCron();
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Internal recovery cron processing failure',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
