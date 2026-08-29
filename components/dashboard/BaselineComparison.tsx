'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp } from 'lucide-react';

export interface BaselineComparisonProps {
  recoverAiRate: number;
  baselineRate: number;
  recoverAiRevenue: number;
  baselineRevenue: number;
  incrementalRevenue: number;
}

export function BaselineComparison({
  recoverAiRate,
  baselineRate,
  recoverAiRevenue,
  baselineRevenue,
  incrementalRevenue,
}: BaselineComparisonProps) {
  const chartData = [
    {
      name: 'Recovery Rate (%)',
      RecoverAI: recoverAiRate,
      Baseline: baselineRate,
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            RecoverAI vs Naive Baseline
          </h3>
          <p className="text-xs text-slate-500">
            Intelligent orchestration outperforming standard retry spam
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 font-semibold text-xs rounded-full border border-emerald-200">
          <TrendingUp className="w-3.5 h-3.5" />
          +₹{incrementalRevenue.toLocaleString('en-IN')} Incremental
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        {/* Chart */}
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748B' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: '8px', fontSize: '12px' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="RecoverAI" fill="#2563EB" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Baseline" fill="#94A3B8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Metrics Grid */}
        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-600">RecoverAI Recovery Rate</span>
            <span className="text-sm font-bold text-blue-600">{recoverAiRate}%</span>
          </div>

          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-600">Baseline Recovery Rate</span>
            <span className="text-sm font-bold text-slate-500">{baselineRate}%</span>
          </div>

          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-600">RecoverAI Revenue</span>
            <span className="text-sm font-bold text-slate-900">₹{recoverAiRevenue.toLocaleString('en-IN')}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-600">Baseline Revenue</span>
            <span className="text-sm font-bold text-slate-500">₹{baselineRevenue.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
