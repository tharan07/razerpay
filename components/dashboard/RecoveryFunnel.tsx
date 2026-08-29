import React from 'react';
import { ShieldCheck } from 'lucide-react';

export interface RecoveryFunnelProps {
  funnel: {
    detected: number;
    eligible: number;
    policyBlocked: number;
    actionPlanned: number;
    executed: number;
    recovered: number;
  };
}

export function RecoveryFunnel({ funnel }: RecoveryFunnelProps) {
  const steps = [
    { label: 'Detected', count: funnel.detected, color: 'bg-slate-100 text-slate-700 border-slate-200' },
    { label: 'Eligible', count: funnel.eligible, color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { label: 'Policy Blocked', count: funnel.policyBlocked, color: 'bg-amber-50 text-amber-700 border-amber-200' },
    { label: 'Action Planned', count: funnel.actionPlanned, color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { label: 'Executed', count: funnel.executed, color: 'bg-sky-50 text-sky-700 border-sky-200' },
    { label: 'Recovered', count: funnel.recovered, color: 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold' },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Recovery Orchestration Funnel</h3>
          <p className="text-xs text-slate-500">Real-time case progression through deterministic policy gates</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-blue-600 font-semibold bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
          <ShieldCheck className="w-3.5 h-3.5" />
          Deterministic Safety
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {steps.map((step, idx) => (
          <div
            key={step.label}
            className={`p-3 rounded-lg border flex flex-col justify-between relative ${step.color}`}
          >
            <div>
              <span className="block text-[10px] uppercase font-semibold tracking-wider opacity-80">
                Step {idx + 1}
              </span>
              <span className="text-xs font-semibold">{step.label}</span>
            </div>
            <div className="mt-3 text-xl font-bold">{step.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
