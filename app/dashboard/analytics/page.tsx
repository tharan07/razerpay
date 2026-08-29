'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { AnalyticsSummary } from '@/lib/dashboard/queries';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  DollarSign,
  TrendingUp,
  Percent,
  Award,
  Layers,
  BarChart3,
  PieChart as PieIcon,
  RefreshCw,
} from 'lucide-react';

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const res = await fetch('/api/recovery/analytics');
        const json = await res.json();
        if (isMounted && json.data) {
          setSummary(json.data);
        }
      } catch {
        // error handling
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading || !summary) {
    return (
      <DashboardLayout>
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-xs font-semibold text-slate-600">Loading Recovery Analytics...</p>
        </div>
      </DashboardLayout>
    );
  }

  const categoryData = Object.entries(summary.casesByCategory).map(([key, val]) => ({
    name: key,
    count: val,
  }));

  const outcomeData = Object.entries(summary.outcomesByOutcome).map(([key, val]) => ({
    name: key,
    count: val,
  }));

  const actionData = Object.entries(summary.actionsByType).map(([key, val]) => ({
    name: key,
    count: val,
  }));

  const COLORS = ['#2563EB', '#0284C7', '#38BDF8', '#F59E0B', '#EF4444'];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* KPI Metrics Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Revenue At Risk"
            value={`₹${summary.revenueAtRisk.toLocaleString('en-IN')}`}
            subtitle={`${summary.totalCases} Total cases detected`}
            icon={DollarSign}
          />
          <MetricCard
            title="Recovered Revenue"
            value={`₹${summary.revenueRecovered.toLocaleString('en-IN')}`}
            subtitle={`${summary.casesByStatus.RECOVERED} Recovered cases`}
            icon={TrendingUp}
            trend="+100%"
            trendPositive={true}
          />
          <MetricCard
            title="Recovery Rate"
            value={`${summary.recoveryRate}%`}
            subtitle={`Baseline: ${summary.baselineRecoveryRate}%`}
            icon={Percent}
            trendPositive={true}
          />
          <MetricCard
            title="Incremental Value"
            value={`₹${summary.incrementalRecovery.toLocaleString('en-IN')}`}
            subtitle="Value above naive baseline"
            icon={Award}
            trendPositive={true}
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Failure Category Distribution */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-blue-600" />
                Failure Category Distribution
              </h3>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} interval={0} angle={-15} textAnchor="end" />
                  <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="count" fill="#2563EB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recovery Outcome Distribution */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                Recovery Outcome Distribution
              </h3>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={outcomeData}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {outcomeData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Action Types Distribution */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs md:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                Action Strategy Distribution
              </h3>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={actionData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} interval={0} angle={-15} textAnchor="end" />
                  <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="count" fill="#0284C7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
