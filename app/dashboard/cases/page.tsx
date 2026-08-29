import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CaseTable } from '@/components/recovery/CaseTable';
import { getRecoveryCasesList } from '@/lib/dashboard/queries';
import Link from 'next/link';
import { Search, Filter } from 'lucide-react';

export const revalidate = 0;

interface PageProps {
  searchParams: Promise<{
    status?: string;
    category?: string;
    search?: string;
  }>;
}

export default async function CasesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const currentStatus = params.status || 'ALL';
  const currentCategory = params.category || 'ALL';
  const searchQuery = params.search || '';

  const cases = await getRecoveryCasesList({
    status: currentStatus,
    category: currentCategory,
    search: searchQuery,
  });

  const statuses = [
    'ALL',
    'RECOVERED',
    'ACTION_PLANNED',
    'BLOCKED',
    'ESCALATED',
    'STOPPED',
    'CUSTOMER_ACTION_REQUIRED',
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header & Filter Bar */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Recovery Cases Queue ({cases.length})
              </h2>
              <p className="text-xs text-slate-500">
                Real-time queue of payment failure recovery cases
              </p>
            </div>

            {/* Search Bar */}
            <form method="GET" className="relative max-w-xs w-full">
              <input type="hidden" name="status" value={currentStatus} />
              <input type="hidden" name="category" value={currentCategory} />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                name="search"
                defaultValue={searchQuery}
                placeholder="Search email, sub ID, case ID..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
              />
            </form>
          </div>

          {/* Status Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 mr-2">
              <Filter className="w-3.5 h-3.5" /> Status:
            </span>
            {statuses.map((st) => (
              <Link
                key={st}
                href={`/dashboard/cases?status=${st}&category=${currentCategory}&search=${encodeURIComponent(
                  searchQuery
                )}`}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                  currentStatus === st
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st}
              </Link>
            ))}
          </div>
        </div>

        {/* Case Table */}
        <CaseTable cases={cases} />
      </div>
    </DashboardLayout>
  );
}
