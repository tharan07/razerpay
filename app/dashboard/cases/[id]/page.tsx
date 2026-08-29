import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatusBadge, CategoryBadge } from '@/components/recovery/CaseTable';
import { DecisionExplanation } from '@/components/recovery/DecisionExplanation';
import { AIRecommendationCard } from '@/components/recovery/AIRecommendationCard';
import { AuditTimeline, AuditEventItem } from '@/components/recovery/AuditTimeline';
import { explainDecision } from '@/lib/ai/decision-explanation';
import { generateRecoveryRecommendation } from '@/lib/ai/recovery-message';
import { evaluatePolicy } from '@/lib/policy/policy-engine';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { PolicyInput, RecoveryCase, RecoveryAction } from '@/types/recovery';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

export const revalidate = 0;

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function CaseDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  const caseId = resolvedParams.id;

  let db;
  try {
    db = await createServerClient();
  } catch {
    db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );
  }

  // Fetch Case
  const { data: c } = await db
    .from('recovery_cases')
    .select('*')
    .eq('id', caseId)
    .maybeSingle();

  if (!c) {
    return (
      <DashboardLayout>
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-900">Recovery Case Not Found</h2>
          <p className="text-xs text-slate-500 mt-1">Case ID: {caseId}</p>
          <Link
            href="/dashboard/cases"
            className="inline-flex items-center gap-2 mt-4 text-xs font-semibold text-blue-600 bg-blue-50 px-4 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Cases Queue
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const recoveryCase = c as RecoveryCase;

  // Fetch Subscription
  let amount = 1000;
  let currency = 'INR';
  let subscriptionStatus = 'halted';

  if (recoveryCase.subscription_id) {
    const { data: sub } = await db
      .from('subscriptions')
      .select('*')
      .eq('id', recoveryCase.subscription_id)
      .maybeSingle();
    if (sub) {
      amount = Number(sub.amount || 1000);
      currency = (sub.currency as string) || 'INR';
      subscriptionStatus = (sub.current_status as string) || 'halted';
    }
  }

  // Evaluate Policy Engine for allowed actions
  const policyInput: PolicyInput = {
    caseId: recoveryCase.id,
    subscriptionStatus,
    failureCategory: recoveryCase.failure_category || 'UNKNOWN',
    amount,
    retryCount: recoveryCase.retry_count,
    contactAttemptCount: recoveryCase.contact_attempt_count,
    customerOptedOut: false,
    quietHoursActive: false,
    allowedRecoveryWindow: true,
  };

  const policyResult = evaluatePolicy(policyInput);

  // Decision Explanation
  const explanationResult = await explainDecision({
    caseId: recoveryCase.id,
    failureCategory: recoveryCase.failure_category || 'UNKNOWN',
    subscriptionStatus,
    policyDecision: policyResult.decision,
    allowedActions: policyResult.allowedActions,
    selectedAction: recoveryCase.recovery_strategy || 'WAIT_AND_MONITOR',
    retryCount: recoveryCase.retry_count,
    contactAttemptCount: recoveryCase.contact_attempt_count,
  });

  // AI Recommendation (Advisory)
  const aiRecResult = await generateRecoveryRecommendation({
    caseId: recoveryCase.id,
    failureCategory: recoveryCase.failure_category || 'UNKNOWN',
    subscriptionStatus,
    retryCount: recoveryCase.retry_count,
    contactAttemptCount: recoveryCase.contact_attempt_count,
    allowedActions: policyResult.allowedActions,
  });

  // Fetch Actions for this case
  const { data: actionsData } = await db
    .from('recovery_actions')
    .select('*')
    .eq('recovery_case_id', recoveryCase.id);

  const actions = (actionsData || []) as RecoveryAction[];

  // Fetch Audit Logs for Timeline
  const { data: auditData } = await db
    .from('audit_log')
    .select('*')
    .eq('recovery_case_id', recoveryCase.id)
    .order('created_at', { ascending: true });

  const auditEvents: AuditEventItem[] = (auditData || []).map((a) => ({
    id: a.id as string,
    eventType: a.event_type as string,
    actor: a.actor as string,
    previousState: a.previous_state as string,
    newState: a.new_state as string,
    reason: a.reason as string,
    createdAt: a.created_at as string,
  }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back Link & Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard/cases"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Cases Queue
          </Link>
          <span className="text-xs font-mono text-slate-400">ID: {recoveryCase.id}</span>
        </div>

        {/* Case Summary Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                Recovery Case Overview
              </span>
              <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                {currency} {amount.toLocaleString('en-IN')} at Risk
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <CategoryBadge category={recoveryCase.failure_category || 'UNKNOWN'} />
              <StatusBadge status={recoveryCase.status} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 text-xs">
            <div>
              <span className="text-slate-400 font-semibold block mb-0.5">Current Strategy</span>
              <span className="font-bold text-slate-900">
                {recoveryCase.recovery_strategy || 'WAIT_AND_MONITOR'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block mb-0.5">Attempts</span>
              <span className="font-bold text-slate-900">
                Retries: {recoveryCase.retry_count} / Contacts: {recoveryCase.contact_attempt_count}
              </span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block mb-0.5">Created At</span>
              <span className="font-mono text-slate-700">
                {new Date(recoveryCase.created_at).toLocaleString('en-IN')}
              </span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block mb-0.5">Last Updated</span>
              <span className="font-mono text-slate-700">
                {new Date(recoveryCase.updated_at).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>

        {/* Why this decision? */}
        <DecisionExplanation
          explanation={explanationResult.explanation}
          failureCategory={recoveryCase.failure_category || 'UNKNOWN'}
          selectedStrategy={recoveryCase.recovery_strategy || 'WAIT_AND_MONITOR'}
          status={recoveryCase.status}
        />

        {/* AI Advisory Recommendation Card */}
        <AIRecommendationCard
          allowedActions={policyResult.allowedActions}
          aiRecommendation={aiRecResult}
        />

        {/* Planned & Executed Actions Table */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Planned & Executed Actions ({actions.length})</h3>
          {actions.length === 0 ? (
            <p className="text-xs text-slate-500">No actions recorded for this case yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                  <tr>
                    <th className="p-2.5">Action Type</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Scheduled For</th>
                    <th className="p-2.5">Executed At</th>
                    <th className="p-2.5">Reason / Failure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {actions.map((act) => (
                    <tr key={act.id}>
                      <td className="p-2.5 font-bold text-slate-900">{act.action_type}</td>
                      <td className="p-2.5">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                          {act.status}
                        </span>
                      </td>
                      <td className="p-2.5 font-mono text-slate-600">
                        {act.scheduled_for ? new Date(act.scheduled_for).toLocaleTimeString('en-IN') : '-'}
                      </td>
                      <td className="p-2.5 font-mono text-slate-600">
                        {act.executed_at ? new Date(act.executed_at).toLocaleTimeString('en-IN') : '-'}
                      </td>
                      <td className="p-2.5 text-slate-500">
                        {act.failure_reason || act.blocked_reason || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Audit Log Timeline */}
        <AuditTimeline events={auditEvents} />
      </div>
    </DashboardLayout>
  );
}
