import React from 'react';
import { AuditEventType } from '@/lib/audit/logger';
import { Clock } from 'lucide-react';

export interface AuditEventItem {
  id: string;
  eventType: AuditEventType | string;
  actor: string;
  previousState?: string | null;
  newState?: string | null;
  reason?: string | null;
  createdAt: string;
}

export function formatEventLabel(eventType: string): string {
  const map: Record<string, string> = {
    WEBHOOK_RECEIVED: 'Webhook Event Received',
    WEBHOOK_DUPLICATE_IGNORED: 'Duplicate Webhook Ignored',
    WEBHOOK_SIGNATURE_VERIFIED: 'Signature Verified',
    PAYMENT_FAILURE_DETECTED: 'Payment Failure Detected',
    CASE_CREATED: 'Recovery Case Created',
    STATE_VERIFIED: 'State Verified',
    FAILURE_CLASSIFIED: 'Failure Classified',
    POLICY_EVALUATED: 'Policy Evaluated',
    ACTION_BLOCKED: 'Action Blocked by Policy',
    ACTION_PLANNED: 'Recovery Action Planned',
    ACTION_SCHEDULED: 'Action Scheduled',
    ACTION_EXECUTING: 'Action Executing',
    ACTION_COMPLETED: 'Action Completed',
    ACTION_FAILED: 'Action Execution Failed',
    CUSTOMER_CONTACTED: 'Customer Contacted',
    CUSTOMER_OPTED_OUT: 'Customer Opted Out',
    SUBSCRIPTION_RECOVERED: 'Subscription Recovered',
    PENDING_ACTION_CANCELLED: 'Pending Actions Cancelled',
    CASE_ESCALATED: 'Case Escalated to Admin',
    CASE_STOPPED: 'Case Safely Stopped',
    AI_RECOMMENDATION_GENERATED: 'AI Recommendation Generated',
    AI_RECOMMENDATION_REJECTED: 'AI Recommendation Rejected',
    AI_FALLBACK_USED: 'Deterministic Fallback Used',
    AI_MESSAGE_GENERATED: 'AI Message Generated',
    AI_MESSAGE_REJECTED: 'AI Message Rejected',
    AI_DECISION_EXPLAINED: 'AI Decision Explained',
    AI_EXCEPTION_SUMMARY_GENERATED: 'Exception Summary Generated',
  };

  return map[eventType] || eventType;
}

export function AuditTimeline({ events }: { events: AuditEventItem[] }) {
  if (!events || events.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-500 font-medium">
        No audit log records available for this case.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600" />
          Chronological Audit Log Timeline
        </h3>
        <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
          {events.length} Events Logged
        </span>
      </div>

      <div className="relative border-l-2 border-slate-200 ml-3 space-y-4 py-1">
        {events.map((evt) => {
          const isRecovery = evt.eventType === 'SUBSCRIPTION_RECOVERED';
          const isFailure = evt.eventType.includes('FAILED') || evt.eventType.includes('REJECTED');
          const isBlocked = evt.eventType.includes('BLOCKED') || evt.eventType.includes('STOPPED');
          const isAi = evt.eventType.startsWith('AI_');

          let badgeColor = 'bg-blue-600';
          if (isRecovery) badgeColor = 'bg-emerald-600';
          if (isFailure) badgeColor = 'bg-rose-600';
          if (isBlocked) badgeColor = 'bg-amber-500';
          if (isAi) badgeColor = 'bg-indigo-600';

          return (
            <div key={evt.id} className="ml-5 relative text-xs">
              {/* Timeline Bullet Dot */}
              <div
                className={`absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white ${badgeColor} shadow-2xs`}
              />

              <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-900">
                    {formatEventLabel(evt.eventType)}
                  </span>
                  <time className="text-[11px] text-slate-400 font-mono">
                    {new Date(evt.createdAt).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </time>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 mb-1">
                  <span className="bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono text-[10px]">
                    Actor: {evt.actor}
                  </span>
                  {evt.previousState && evt.newState && (
                    <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-semibold text-[10px]">
                      {evt.previousState} &rarr; {evt.newState}
                    </span>
                  )}
                </div>

                {evt.reason && (
                  <p className="text-[11px] text-slate-600 leading-relaxed font-medium mt-1">
                    {evt.reason}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
