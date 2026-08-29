'use client';

import React from 'react';
import Link from 'next/link';
import { RecoveryCaseStatus, FailureCategory } from '@/types/recovery';
import { ArrowUpRight, AlertTriangle, ShieldAlert, CheckCircle2, Clock, Ban, UserCheck } from 'lucide-react';

export interface CaseRow {
  id: string;
  subscriptionId: string;
  customerId: string;
  customerEmail: string;
  amount: number;
  currency: string;
  status: RecoveryCaseStatus;
  failureCategory: FailureCategory;
  recoveryStrategy: string;
  retryCount: number;
  contactAttemptCount: number;
  createdAt: string;
}

export function StatusBadge({ status }: { status: RecoveryCaseStatus | string }) {
  let style = 'bg-slate-100 text-slate-700 border-slate-200';
  let icon = Clock;

  if (status === 'RECOVERED') {
    style = 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold';
    icon = CheckCircle2;
  } else if (status === 'ESCALATED' || status === 'FRAUD_FLAGGED') {
    style = 'bg-rose-50 text-rose-700 border-rose-200 font-semibold';
    icon = ShieldAlert;
  } else if (status === 'BLOCKED' || status === 'CUSTOMER_ACTION_REQUIRED') {
    style = 'bg-amber-50 text-amber-700 border-amber-200 font-semibold';
    icon = AlertTriangle;
  } else if (status === 'ACTION_PLANNED' || status === 'WAITING' || status === 'ACTION_EXECUTING') {
    style = 'bg-blue-50 text-blue-700 border-blue-200 font-semibold';
    icon = UserCheck;
  } else if (status === 'STOPPED' || status === 'EXPIRED') {
    style = 'bg-slate-100 text-slate-600 border-slate-200';
    icon = Ban;
  }

  const Icon = icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${style}`}>
      <Icon className="w-3.5 h-3.5" />
      {status}
    </span>
  );
}

export function CategoryBadge({ category }: { category: FailureCategory | string }) {
  let color = 'bg-blue-50 text-blue-700 border-blue-200';
  if (category === 'NEEDS_CUSTOMER_ACTION') color = 'bg-amber-50 text-amber-700 border-amber-200';
  if (category === 'TERMINAL') color = 'bg-slate-100 text-slate-700 border-slate-200';
  if (category === 'FRAUD_FLAGGED') color = 'bg-rose-50 text-rose-700 border-rose-200';

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${color}`}>
      {category}
    </span>
  );
}

export function CaseTable({ cases }: { cases: CaseRow[] }) {
  if (!cases || cases.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
          <Clock className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-bold text-slate-900">No recovery cases found</h4>
        <p className="text-xs text-slate-500 mt-1">Try adjusting your status or category filters</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="px-4 py-3">Case ID</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Amount at Risk</th>
              <th className="px-4 py-3">Failure Category</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Strategy</th>
              <th className="px-4 py-3">Attempts</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {cases.map((c) => (
              <tr
                key={c.id}
                className="hover:bg-blue-50/40 transition cursor-pointer"
              >
                <td className="px-4 py-3.5 font-mono text-slate-900 font-bold">
                  <Link href={`/dashboard/cases/${c.id}`} className="hover:text-blue-600">
                    {c.id.substring(0, 14)}...
                  </Link>
                </td>
                <td className="px-4 py-3.5">
                  <span className="block font-semibold text-slate-900">{c.customerEmail}</span>
                  <span className="block text-[11px] text-slate-400 font-mono">{c.customerId}</span>
                </td>
                <td className="px-4 py-3.5 font-bold text-slate-900">
                  {c.currency} {c.amount.toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-3.5">
                  <CategoryBadge category={c.failureCategory} />
                </td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-4 py-3.5 text-slate-700 font-semibold">
                  {c.recoveryStrategy}
                </td>
                <td className="px-4 py-3.5 text-slate-600">
                  <span className="block">Retries: {c.retryCount}</span>
                  <span className="block text-[11px] text-slate-400">Contacts: {c.contactAttemptCount}</span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <Link
                    href={`/dashboard/cases/${c.id}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md hover:bg-blue-100 transition"
                  >
                    View <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
