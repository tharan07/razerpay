'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  BarChart3,
  Home,
  Layers,
  Play,
  RefreshCw,
  Shield,
  Zap,
} from 'lucide-react';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isSimulating, setIsSimulating] = useState(false);

  const handleRunSimulation = async () => {
    try {
      setIsSimulating(true);
      await fetch('/api/recovery/simulate', { method: 'POST' });
      window.location.reload();
    } catch {
      alert('Failed to run simulation');
    } finally {
      setIsSimulating(false);
    }
  };

  const navItems = [
    { label: 'Overview', href: '/dashboard', icon: Home },
    { label: 'Recovery Cases', href: '/dashboard/cases', icon: Layers },
    { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    { label: 'Exceptions', href: '/dashboard/exceptions', icon: AlertTriangle },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-slate-900">
                Recover<span className="text-blue-600">AI</span>
              </span>
              <span className="block text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                Fintech Engine
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname?.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold border-l-4 border-blue-600 pl-2.5'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Security & Boundary Status Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 m-3 rounded-xl border">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-1">
            <Shield className="w-4 h-4 text-blue-600" />
            Bounded AI Protection
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Deterministic Policy Engine controls financial actions & opt-outs.
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Action Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10 shadow-2xs">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {pathname === '/dashboard' && 'Executive Dashboard'}
              {pathname === '/dashboard/cases' && 'Recovery Cases Queue'}
              {pathname?.startsWith('/dashboard/cases/') && 'Case Audit Detail'}
              {pathname === '/dashboard/analytics' && 'Recovery Performance Analytics'}
              {pathname === '/dashboard/exceptions' && 'Exception Management Queue'}
            </h1>
            <p className="text-xs text-slate-500">
              Autonomous financial recovery orchestration & observability
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              Refresh
            </button>

            <button
              onClick={handleRunSimulation}
              disabled={isSimulating}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
              {isSimulating ? 'Simulating...' : 'Run Recovery Simulation'}
            </button>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="p-6 flex-1 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
