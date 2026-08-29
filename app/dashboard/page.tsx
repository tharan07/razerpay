import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { RecoveryFunnel } from '@/components/dashboard/RecoveryFunnel';
import { BaselineComparison } from '@/components/dashboard/BaselineComparison';
import { CustomerProtectionMetrics } from '@/components/dashboard/CustomerProtectionMetrics';
import { getAnalyticsSummary } from '@/lib/dashboard/queries';
import {
  DollarSign,
  TrendingUp,
  Percent,
  Ban,
  ShieldAlert,
  Award,
} from 'lucide-react';

export const revalidate = 0; // Dynamic server-side rendering

export default async function DashboardPage() {
  const summary = await getAnalyticsSummary();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard
            title="Revenue At Risk"
            value={`₹${summary.revenueAtRisk.toLocaleString('en-IN')}`}
            subtitle={`${summary.totalCases} Total cases detected`}
            icon={DollarSign}
          />
          <MetricCard
            title="Revenue Recovered"
            value={`₹${summary.revenueRecovered.toLocaleString('en-IN')}`}
            subtitle={`${summary.casesByStatus.RECOVERED} Cases recovered`}
            icon={TrendingUp}
            trend="+100%"
            trendPositive={true}
          />
          <MetricCard
            title="Recovery Rate"
            value={`${summary.recoveryRate}%`}
            subtitle={`Vs Baseline ${summary.baselineRecoveryRate}%`}
            icon={Percent}
            trend={`+${(summary.recoveryRate - summary.baselineRecoveryRate).toFixed(1)}%`}
            trendPositive={true}
          />
          <MetricCard
            title="Incremental Revenue"
            value={`₹${summary.incrementalRecovery.toLocaleString('en-IN')}`}
            subtitle="Value created vs baseline"
            icon={Award}
            trendPositive={true}
          />
          <MetricCard
            title="Safely Stopped"
            value={summary.customerProtection.casesSafelyStopped}
            subtitle="Terminal & cancelled cases"
            icon={Ban}
          />
          <MetricCard
            title="Human Escalations"
            value={summary.customerProtection.humanEscalations}
            subtitle="Fraud & complex cases"
            icon={ShieldAlert}
          />
        </div>

        {/* Recovery Funnel */}
        <RecoveryFunnel funnel={summary.funnel} />

        {/* Baseline Comparison & Customer Protection */}
        <div className="grid grid-cols-1 gap-6">
          <BaselineComparison
            recoverAiRate={summary.recoveryRate}
            baselineRate={summary.baselineRecoveryRate}
            recoverAiRevenue={summary.revenueRecovered}
            baselineRevenue={summary.baselineRecovered}
            incrementalRevenue={summary.incrementalRecovery}
          />

          <CustomerProtectionMetrics protection={summary.customerProtection} />
        </div>
      </div>
    </DashboardLayout>
  );
}
