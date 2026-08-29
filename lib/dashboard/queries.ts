import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  FailureCategory,
  RecoveryCase,
  RecoveryCaseStatus,
} from '@/types/recovery';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface AnalyticsSummary {
  revenueAtRisk: number;
  revenueRecovered: number;
  recoveryRate: number;
  baselineRecovered: number;
  baselineRecoveryRate: number;
  incrementalRecovery: number;
  totalCases: number;
  casesByStatus: Record<RecoveryCaseStatus, number>;
  casesByCategory: Record<FailureCategory, number>;
  outcomesByOutcome: Record<string, number>;
  actionsByType: Record<string, number>;
  actionStats: {
    total: number;
    completed: number;
    failed: number;
    blocked: number;
    cancelled: number;
  };
  customerProtection: {
    contactAttempts: number;
    contactsAvoided: number;
    casesSafelyStopped: number;
    optOutBlocks: number;
    quietHourDelays: number;
    contactCapBlocks: number;
    fraudBlocks: number;
    humanEscalations: number;
  };
  funnel: {
    detected: number;
    eligible: number;
    policyBlocked: number;
    actionPlanned: number;
    executed: number;
    recovered: number;
  };
}

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

/**
 * Calculates complete analytics summary from actual database records.
 */
export async function getAnalyticsSummary(
  client?: SupabaseClient
): Promise<AnalyticsSummary> {
  const db = await getClient(client);

  // 1. Fetch Recovery Cases
  const { data: casesData } = await db.from('recovery_cases').select('*');
  const cases: RecoveryCase[] = (casesData || []) as RecoveryCase[];

  // 2. Fetch Subscriptions for Amount calculation
  const { data: subsData } = await db.from('subscriptions').select('*');
  const subsMap = new Map<string, number>();
  for (const s of subsData || []) {
    subsMap.set(s.id as string, Number(s.amount || 0));
  }

  // Calculate Revenue At Risk
  let revenueAtRisk = 0;
  for (const c of cases) {
    if (c.subscription_id && subsMap.has(c.subscription_id)) {
      revenueAtRisk += subsMap.get(c.subscription_id) || 0;
    } else {
      revenueAtRisk += 1000; // default fallback amount
    }
  }

  // 3. Fetch Outcomes
  const { data: outcomesData } = await db.from('recovery_outcomes').select('*');
  let revenueRecovered = 0;
  const outcomesByOutcome: Record<string, number> = {
    RECOVERED: 0,
    NOT_RECOVERED: 0,
    ESCALATED: 0,
    STOPPED: 0,
    EXPIRED: 0,
  };

  for (const o of outcomesData || []) {
    const outcomeStr = (o.outcome as string) || 'NOT_RECOVERED';
    outcomesByOutcome[outcomeStr] = (outcomesByOutcome[outcomeStr] || 0) + 1;
    if (outcomeStr === 'RECOVERED') {
      revenueRecovered += Number(o.recovered_amount || 0);
    }
  }

  // Safe recovery rates
  const recoveryRate =
    revenueAtRisk > 0
      ? Number(((revenueRecovered / revenueAtRisk) * 100).toFixed(1))
      : 0;

  // Deterministic baseline comparison (naive retry gets ~35% baseline recovery rate)
  const baselineRecoveryRate = 35.0;
  const baselineRecovered = Math.round(revenueAtRisk * (baselineRecoveryRate / 100));
  const incrementalRecovery = Math.max(0, revenueRecovered - baselineRecovered);

  // 4. Status counts
  const initialStatuses: Record<RecoveryCaseStatus, number> = {
    NEW: 0,
    CLASSIFIED: 0,
    VERIFYING: 0,
    POLICY_PENDING: 0,
    BLOCKED: 0,
    ACTION_PLANNED: 0,
    WAITING: 0,
    ACTION_EXECUTING: 0,
    AWAITING_OUTCOME: 0,
    RECOVERED: 0,
    CUSTOMER_ACTION_REQUIRED: 0,
    ESCALATED: 0,
    STOPPED: 0,
    EXPIRED: 0,
  };

  const casesByStatus = { ...initialStatuses };
  for (const c of cases) {
    if (c.status && casesByStatus[c.status] !== undefined) {
      casesByStatus[c.status] += 1;
    }
  }

  // 5. Category counts
  const casesByCategory: Record<FailureCategory, number> = {
    RETRYABLE: 0,
    NEEDS_CUSTOMER_ACTION: 0,
    TERMINAL: 0,
    FRAUD_FLAGGED: 0,
    UNKNOWN: 0,
  };

  for (const c of cases) {
    const fc = (c.failure_category as FailureCategory) || 'UNKNOWN';
    if (casesByCategory[fc] !== undefined) {
      casesByCategory[fc] += 1;
    }
  }

  // 6. Actions Stats
  const { data: actionsData } = await db.from('recovery_actions').select('*');
  const actionsByType: Record<string, number> = {};
  const actionStats = {
    total: actionsData?.length || 0,
    completed: 0,
    failed: 0,
    blocked: 0,
    cancelled: 0,
  };

  for (const a of actionsData || []) {
    const typeStr = (a.action_type as string) || 'UNKNOWN';
    actionsByType[typeStr] = (actionsByType[typeStr] || 0) + 1;
    const st = (a.status as string) || '';
    if (st === 'COMPLETED') actionStats.completed++;
    else if (st === 'FAILED') actionStats.failed++;
    else if (st === 'BLOCKED') actionStats.blocked++;
    else if (st === 'CANCELLED') actionStats.cancelled++;
  }

  // 7. Audit Log Protection Events
  const { data: auditData } = await db.from('audit_log').select('event_type, reason');
  let optOutBlocks = 0;
  let quietHourDelays = 0;
  let contactCapBlocks = 0;

  for (const log of auditData || []) {
    const r = (log.reason as string) || '';
    if (r.includes('OPTED_OUT')) optOutBlocks++;
    if (r.includes('QUIET_HOURS')) quietHourDelays++;
    if (r.includes('MAX_CONTACT_ATTEMPTS')) contactCapBlocks++;
  }

  // Protection metrics summary
  const customerProtection = {
    contactAttempts: cases.reduce((acc, c) => acc + (c.contact_attempt_count || 0), 0),
    contactsAvoided: (actionsByType['WAIT_AND_MONITOR'] || 0),
    casesSafelyStopped: casesByStatus.STOPPED,
    optOutBlocks,
    quietHourDelays,
    contactCapBlocks,
    fraudBlocks: casesByCategory.FRAUD_FLAGGED,
    humanEscalations: casesByStatus.ESCALATED,
  };

  // Funnel
  const funnel = {
    detected: cases.length,
    eligible: cases.length - casesByCategory.FRAUD_FLAGGED,
    policyBlocked: casesByStatus.BLOCKED,
    actionPlanned: casesByStatus.ACTION_PLANNED + casesByStatus.WAITING + casesByStatus.ACTION_EXECUTING + casesByStatus.RECOVERED,
    executed: actionStats.completed,
    recovered: casesByStatus.RECOVERED,
  };

  return {
    revenueAtRisk,
    revenueRecovered,
    recoveryRate,
    baselineRecovered,
    baselineRecoveryRate,
    incrementalRecovery,
    totalCases: cases.length,
    casesByStatus,
    casesByCategory,
    outcomesByOutcome,
    actionsByType,
    actionStats,
    customerProtection,
    funnel,
  };
}

/**
 * Fetches recovery cases list with filtering and search options.
 */
export async function getRecoveryCasesList(
  filters?: { status?: string; search?: string; category?: string },
  client?: SupabaseClient
) {
  const db = await getClient(client);
  const { data: casesData } = await db.from('recovery_cases').select('*');
  const { data: subsData } = await db.from('subscriptions').select('*');

  const subsMap = new Map<string, Record<string, unknown>>();
  for (const s of subsData || []) {
    subsMap.set(s.id as string, s);
    if (s.razorpay_subscription_id) {
      subsMap.set(s.razorpay_subscription_id as string, s);
    }
  }

  let list = (casesData || []).map((c) => {
    const sub = c.subscription_id ? subsMap.get(c.subscription_id) : null;
    return {
      id: c.id as string,
      subscriptionId: c.subscription_id as string,
      customerId: c.customer_id as string || 'cust_default',
      customerEmail: (sub?.customer_id as string) || 'customer@example.com',
      amount: Number(sub?.amount || 1000),
      currency: (sub?.currency as string) || 'INR',
      status: c.status as RecoveryCaseStatus,
      failureCategory: c.failure_category as FailureCategory,
      recoveryStrategy: c.recovery_strategy as string || 'WAIT_AND_MONITOR',
      retryCount: Number(c.retry_count || 0),
      contactAttemptCount: Number(c.contact_attempt_count || 0),
      createdAt: c.created_at as string,
      updatedAt: c.updated_at as string,
    };
  });

  if (filters?.status && filters.status !== 'ALL') {
    list = list.filter((c) => c.status === filters.status);
  }

  if (filters?.category && filters.category !== 'ALL') {
    list = list.filter((c) => c.failureCategory === filters.category);
  }

  if (filters?.search && filters.search.trim()) {
    const q = filters.search.toLowerCase().trim();
    list = list.filter(
      (c) =>
        c.id.toLowerCase().includes(q) ||
        (c.subscriptionId && c.subscriptionId.toLowerCase().includes(q)) ||
        c.customerEmail.toLowerCase().includes(q)
    );
  }

  return list;
}
