import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatusBadge, CategoryBadge } from '@/components/recovery/CaseTable';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { RecoveryCase } from '@/types/recovery';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { ShieldAlert, ArrowUpRight, CheckCircle2 } from 'lucide-react';

export const revalidate = 0;

export default async function ExceptionsPage() {
  let db;
  try {
    db = await createServerClient();
  } catch {
    db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );
  }

  // Fetch Exception Cases: ESCALATED, BLOCKED, CUSTOMER_ACTION_REQUIRED, EXPIRED, STOPPED, or FRAUD_FLAGGED
  const { data: casesData } = await db
    .from('recovery_cases')
    .select('*')
    .in('status', ['ESCALATED', 'BLOCKED', 'CUSTOMER_ACTION_REQUIRED', 'EXPIRED', 'STOPPED']);

  const { data: fraudData } = await db
    .from('recovery_cases')
    .select('*')
    .eq('failure_category', 'FRAUD_FLAGGED');

  // Merge unique
  const caseMap = new Map<string, RecoveryCase>();
  for (const c of (casesData || []) as RecoveryCase[]) caseMap.set(c.id, c);
  for (const c of (fraudData || []) as RecoveryCase[]) caseMap.set(c.id, c);

  const exceptionsList = Array.from(caseMap.values());

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Exception Queue Banner */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Exception Management Queue ({exceptionsList.length})
              </h2>
              <p className="text-xs text-slate-500">
                Cases requiring human review, fraud investigation, or customer action
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-full">
            Human Review Required
          </span>
        </div>

        {/* Exceptions Table */}
        {exceptionsList.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-900">No active exceptions</h3>
            <p className="text-xs text-slate-500 mt-1">All cases are operating within normal deterministic parameters</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-4 py-3">Case ID</th>
                    <th className="px-4 py-3">Issue / Reason</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {exceptionsList.map((c) => {
                    const isFraud = c.failure_category === 'FRAUD_FLAGGED';
                    const isEscalated = c.status === 'ESCALATED';

                    let severityLabel = 'MEDIUM';
                    let severityStyle = 'bg-amber-50 text-amber-700 border-amber-200';

                    if (isFraud || isEscalated) {
                      severityLabel = 'HIGH / CRITICAL';
                      severityStyle = 'bg-rose-50 text-rose-700 border-rose-200 font-bold';
                    }

                    return (
                      <tr
                        key={c.id}
                        className={`hover:bg-slate-50 transition ${
                          isFraud ? 'bg-rose-50/20' : ''
                        }`}
                      >
                        <td className="px-4 py-3.5 font-mono text-slate-900 font-bold">
                          {c.id.substring(0, 14)}...
                        </td>
                        <td className="px-4 py-3.5 text-slate-700 font-medium max-w-xs">
                          {c.stop_reason || (isFraud ? 'Fraudulent transaction risk flagged' : 'Human review needed')}
                        </td>
                        <td className="px-4 py-3.5">
                          <CategoryBadge category={c.failure_category || 'UNKNOWN'} />
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase border ${severityStyle}`}
                          >
                            {severityLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="px-4 py-3.5 font-mono text-slate-500">
                          {new Date(c.created_at).toLocaleTimeString('en-IN')}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <Link
                            href={`/dashboard/cases/${c.id}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded hover:bg-blue-100 transition"
                          >
                            Review <ArrowUpRight className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
