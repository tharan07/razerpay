import React from 'react';
import { Bot, Shield, CheckCircle2, AlertCircle } from 'lucide-react';

export interface AIRecommendationCardProps {
  allowedActions: string[];
  aiRecommendation?: {
    recommendedAction: string;
    confidence: number;
    reasoningSummary: string;
    fallbackUsed?: boolean;
  } | null;
}

export function AIRecommendationCard({
  allowedActions,
  aiRecommendation,
}: AIRecommendationCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              NVIDIA AI Advisory Recommendation
            </h3>
            <span className="text-[11px] text-slate-500">
              Bounded AI Advisor (NVIDIA NIM)
            </span>
          </div>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded">
          Advisory Only
        </span>
      </div>

      {/* Advisory Notice Banner */}
      <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-3 text-xs text-blue-900 mb-4 flex items-start gap-2">
        <Shield className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold block">AI recommendation is advisory only.</strong>
          The Deterministic Policy Engine remains authoritative and strictly validates all AI outputs before execution.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Allowed Actions Box */}
        <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100">
          <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
            Deterministic Allowed Actions
          </span>
          <div className="flex flex-wrap gap-1.5">
            {allowedActions && allowedActions.length > 0 ? (
              allowedActions.map((action) => (
                <span
                  key={action}
                  className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-800 px-2.5 py-1 rounded text-xs font-semibold"
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  {action}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400 font-medium">None allowed</span>
            )}
          </div>
        </div>

        {/* AI Recommendation Box */}
        <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100">
          <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
            AI Advisory Output
          </span>
          {aiRecommendation ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-indigo-900">
                  {aiRecommendation.recommendedAction}
                </span>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  {Math.round(aiRecommendation.confidence * 100)}% Confidence
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-medium mt-1">
                {aiRecommendation.reasoningSummary}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <AlertCircle className="w-4 h-4 text-slate-400" />
              Fallback to deterministic action used
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
