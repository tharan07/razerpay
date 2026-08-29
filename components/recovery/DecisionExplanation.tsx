import React from 'react';
import { HelpCircle, ShieldCheck } from 'lucide-react';

export interface DecisionExplanationProps {
  explanation: string;
  failureCategory: string;
  selectedStrategy: string;
  status: string;
}

export function DecisionExplanation({
  explanation,
  failureCategory,
  selectedStrategy,
  status,
}: DecisionExplanationProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <HelpCircle className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Why this decision?</h3>
        </div>
        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" /> Policy Engine Verified
        </span>
      </div>

      <p className="text-xs text-slate-700 leading-relaxed font-medium bg-slate-50 p-3.5 rounded-lg border border-slate-100 mb-3">
        {explanation}
      </p>

      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded font-medium">
          Category: <strong className="text-slate-900">{failureCategory}</strong>
        </span>
        <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded font-medium">
          Strategy: <strong className="text-blue-900">{selectedStrategy}</strong>
        </span>
        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded font-medium">
          Status: <strong className="text-slate-900">{status}</strong>
        </span>
      </div>
    </div>
  );
}
