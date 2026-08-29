import React from 'react';
import {
  ShieldCheck,
  UserCheck,
  Clock,
  Slash,
  AlertTriangle,
  Ban,
} from 'lucide-react';

export interface CustomerProtectionMetricsProps {
  protection: {
    contactAttempts: number;
    contactsAvoided: number;
    casesSafelyStopped: number;
    optOutBlocks: number;
    quietHourDelays: number;
    contactCapBlocks: number;
    fraudBlocks: number;
    humanEscalations: number;
  };
}

export function CustomerProtectionMetrics({ protection }: CustomerProtectionMetricsProps) {
  const metrics = [
    {
      label: 'Contacts Avoided',
      value: protection.contactsAvoided,
      desc: 'Wait & Monitor strategy used',
      icon: UserCheck,
      color: 'text-blue-600 bg-blue-50 border-blue-100',
    },
    {
      label: 'Cases Safely Stopped',
      value: protection.casesSafelyStopped,
      desc: 'Terminal / Cancelled cases',
      icon: Ban,
      color: 'text-slate-700 bg-slate-100 border-slate-200',
    },
    {
      label: 'Quiet-Hour Delays',
      value: protection.quietHourDelays,
      desc: 'Delayed overnight contact',
      icon: Clock,
      color: 'text-amber-700 bg-amber-50 border-amber-200',
    },
    {
      label: 'Contact-Cap Blocks',
      value: protection.contactCapBlocks,
      desc: 'Max contact attempts (3) enforced',
      icon: Slash,
      color: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    },
    {
      label: 'Fraud Execution Blocks',
      value: protection.fraudBlocks,
      desc: 'Auto-recovery prohibited',
      icon: AlertTriangle,
      color: 'text-rose-700 bg-rose-50 border-rose-200',
    },
    {
      label: 'Human Escalations',
      value: protection.humanEscalations,
      desc: 'Escalated to admin review',
      icon: ShieldCheck,
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">
              Customer Protection & Compliance Safeguards
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">
              Active Policy Engine
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            &ldquo;RecoverAI does not maximize retries. It maximizes safe recovery.&rdquo;
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {metrics.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={`p-3.5 rounded-xl border flex flex-col justify-between ${item.color}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold">{item.label}</span>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xl font-bold">{item.value}</div>
                <div className="text-[10px] opacity-80 font-medium mt-0.5">
                  {item.desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
