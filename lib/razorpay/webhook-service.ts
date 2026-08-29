import { createClient as createServerClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/logger';
import { evaluatePolicy } from '@/lib/policy/policy-engine';
import {
  createRecoveryCase,
  updateCaseStatus,
} from '@/lib/recovery/case-service';
import { canTransition } from '@/lib/recovery/state-machine';
import { processPaymentAttempt } from '@/lib/razorpay/payment-service';
import {
  getSubscriptionByRazorpayId,
  syncSubscriptionState,
} from '@/lib/razorpay/subscription-service';
import { RazorpayWebhookPayload } from '@/types/razorpay';
import { PolicyInput, RecoveryStrategy } from '@/types/recovery';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface StoreWebhookEventInput {
  providerEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface StoreWebhookEventResult {
  stored: boolean;
  duplicate: boolean;
  eventId?: string;
  error?: string;
}

/**
 * Resolves active server-side Supabase client.
 */
async function getClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) {
    return client;
  }

  try {
    return (await createServerClient()) as unknown as SupabaseClient;
  } catch {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      throw new Error(
        'Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) are required.'
      );
    }
    return createClient(url, key);
  }
}

/**
 * Persists a verified Razorpay webhook event into webhook_events table with PENDING status.
 * Employs unique constraint enforcement on provider_event_id for concurrency-safe idempotency.
 */
export async function storeWebhookEvent(
  input: StoreWebhookEventInput,
  client?: SupabaseClient
): Promise<StoreWebhookEventResult> {
  const db = await getClient(client);

  // 1. App-level idempotency check
  const { data: existing } = await db
    .from('webhook_events')
    .select('id, processing_status')
    .eq('provider_event_id', input.providerEventId)
    .maybeSingle();

  if (existing) {
    return {
      stored: false,
      duplicate: true,
      eventId: existing.id as string,
    };
  }

  // 2. Insert into webhook_events
  const insertPayload = {
    provider: 'razorpay',
    provider_event_id: input.providerEventId,
    event_type: input.eventType,
    payload: input.payload,
    signature_valid: true,
    processing_status: 'PENDING',
  };

  const { data, error } = await db
    .from('webhook_events')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    const isUniqueViolation =
      error.code === '23505' ||
      error.message?.toLowerCase().includes('duplicate') ||
      error.message?.toLowerCase().includes('unique');

    if (isUniqueViolation) {
      return {
        stored: false,
        duplicate: true,
      };
    }

    throw new Error(`Failed to store webhook event: ${error.message}`);
  }

  return {
    stored: true,
    duplicate: false,
    eventId: data?.id as string,
  };
}

/**
 * Processes a stored Razorpay webhook event: updates subscription/payment state,
 * classifies failure, evaluates policy engine, manages recovery cases, logs audit events,
 * and handles recovery outcomes.
 *
 * Marks event status PROCESSED upon completion.
 */
export async function processStoredWebhookEvent(
  webhookEventId: string,
  rawPayload: Record<string, unknown>,
  client?: SupabaseClient
): Promise<void> {
  const db = await getClient(client);
  const payload = rawPayload as unknown as RazorpayWebhookPayload;

  const eventType = payload.event || '';
  const subEntity = payload.payload?.subscription?.entity;
  const payEntity = payload.payload?.payment?.entity;

  // 1. Update processing status to PROCESSING
  await db
    .from('webhook_events')
    .update({ processing_status: 'PROCESSING' })
    .eq('id', webhookEventId);

  // 2. Sync subscription state if subscription entity exists
  if (subEntity) {
    const syncedSub = await syncSubscriptionState(subEntity, db);
    if (syncedSub) {
      await logAuditEvent(
        {
          eventType: 'STATE_VERIFIED',
          actor: 'razorpay_webhook',
          reason: `Subscription status updated to ${subEntity.status}`,
          metadata: { subscriptionId: subEntity.id, status: subEntity.status },
        },
        db
      );
    }
  }

  // 3. Handle Payment Failure Events
  if (eventType === 'payment.failed' && payEntity) {
    const razorpaySubId = subEntity?.id || payEntity.subscription_id || null;

    const { attempt, subscription, failureCategory, isNew } =
      await processPaymentAttempt(payEntity, razorpaySubId, db);

    if (isNew) {
      await logAuditEvent(
        {
          eventType: 'PAYMENT_FAILURE_DETECTED',
          actor: 'razorpay_webhook',
          reason:
            payEntity.error_description || payEntity.error_reason || 'Payment failed',
          metadata: {
            paymentId: payEntity.id,
            failureCode: payEntity.error_code || payEntity.error_reason,
            failureCategory,
          },
        },
        db
      );

      await logAuditEvent(
        {
          eventType: 'FAILURE_CLASSIFIED',
          actor: 'classifier',
          decision: { category: failureCategory },
        },
        db
      );
    }

    if (subscription) {
      // Find open recovery case for subscription
      const { data: openCases } = await db
        .from('recovery_cases')
        .select('*')
        .eq('subscription_id', subscription.id)
        .not('status', 'in', '("RECOVERED","STOPPED","EXPIRED")');

      let targetCase = openCases && openCases.length > 0 ? openCases[0] : null;

      if (!targetCase) {
        // Create new recovery case
        targetCase = await createRecoveryCase(
          {
            subscriptionId: subscription.id,
            paymentAttemptId: attempt.id,
            customerId: subscription.customer_id,
            failureCategory,
          },
          db
        );

        await logAuditEvent(
          {
            recoveryCaseId: targetCase.id,
            eventType: 'CASE_CREATED',
            actor: 'system',
            newState: 'NEW',
          },
          db
        );

        // Advance state NEW -> CLASSIFIED -> VERIFYING -> POLICY_PENDING
        if (canTransition(targetCase.status, 'CLASSIFIED')) {
          const c1 = await updateCaseStatus(
            targetCase.id,
            'CLASSIFIED',
            undefined,
            db
          );
          await logAuditEvent(
            {
              recoveryCaseId: c1.id,
              eventType: 'STATE_VERIFIED',
              actor: 'system',
              previousState: 'NEW',
              newState: 'CLASSIFIED',
            },
            db
          );

          if (canTransition(c1.status, 'VERIFYING')) {
            const c2 = await updateCaseStatus(
              c1.id,
              'VERIFYING',
              undefined,
              db
            );
            await logAuditEvent(
              {
                recoveryCaseId: c2.id,
                eventType: 'STATE_VERIFIED',
                actor: 'system',
                previousState: 'CLASSIFIED',
                newState: 'VERIFYING',
              },
              db
            );

            if (canTransition(c2.status, 'POLICY_PENDING')) {
              const c3 = await updateCaseStatus(
                c2.id,
                'POLICY_PENDING',
                undefined,
                db
              );

              // Evaluate Policy Engine
              const policyInput: PolicyInput = {
                caseId: c3.id,
                subscriptionStatus: subscription.current_status || 'halted',
                failureCategory: failureCategory,
                amount: attempt.amount || subscription.amount || 0,
                retryCount: c3.retry_count,
                contactAttemptCount: c3.contact_attempt_count,
                customerOptedOut: false,
                quietHoursActive: false,
                allowedRecoveryWindow: true,
              };

              const decisionResult = evaluatePolicy(policyInput);

              await logAuditEvent(
                {
                  recoveryCaseId: c3.id,
                  eventType: 'POLICY_EVALUATED',
                  actor: 'policy_engine',
                  decision: {
                    allowed: decisionResult.allowed,
                    decision: decisionResult.decision,
                    allowedActions: decisionResult.allowedActions,
                  },
                  reason: `Policy decision: ${decisionResult.decision}`,
                },
                db
              );

              if (decisionResult.decision === 'ALLOW') {
                if (canTransition(c3.status, 'ACTION_PLANNED')) {
                  const firstAction = (decisionResult.allowedActions[0] as RecoveryStrategy) || 'WAIT_AND_MONITOR';
                  const c4 = await updateCaseStatus(
                    c3.id,
                    'ACTION_PLANNED',
                    { recoveryStrategy: firstAction },
                    db
                  );
                  await logAuditEvent(
                    {
                      recoveryCaseId: c4.id,
                      eventType: 'ACTION_PLANNED',
                      actor: 'policy_engine',
                      previousState: 'POLICY_PENDING',
                      newState: 'ACTION_PLANNED',
                    },
                    db
                  );
                }
              } else if (decisionResult.decision === 'BLOCK') {
                if (canTransition(c3.status, 'BLOCKED')) {
                  const c4 = await updateCaseStatus(
                    c3.id,
                    'BLOCKED',
                    { stopReason: decisionResult.blockedReasons.join(', ') },
                    db
                  );
                  await logAuditEvent(
                    {
                      recoveryCaseId: c4.id,
                      eventType: 'ACTION_BLOCKED',
                      actor: 'policy_engine',
                      reason: decisionResult.blockedReasons.join(', '),
                      previousState: 'POLICY_PENDING',
                      newState: 'BLOCKED',
                    },
                    db
                  );
                }
              } else if (decisionResult.decision === 'ESCALATE') {
                if (canTransition(c3.status, 'BLOCKED')) {
                  const c4 = await updateCaseStatus(
                    c3.id,
                    'BLOCKED',
                    { stopReason: decisionResult.blockedReasons.join(', ') },
                    db
                  );
                  if (canTransition(c4.status, 'ESCALATED')) {
                    const c5 = await updateCaseStatus(
                      c4.id,
                      'ESCALATED',
                      undefined,
                      db
                    );
                    await logAuditEvent(
                      {
                        recoveryCaseId: c5.id,
                        eventType: 'CASE_ESCALATED',
                        actor: 'policy_engine',
                        reason: decisionResult.blockedReasons.join(', '),
                        previousState: 'BLOCKED',
                        newState: 'ESCALATED',
                      },
                      db
                    );
                  }
                }
              } else if (decisionResult.decision === 'STOP') {
                if (canTransition(c3.status, 'BLOCKED')) {
                  const c4 = await updateCaseStatus(
                    c3.id,
                    'BLOCKED',
                    { stopReason: decisionResult.blockedReasons.join(', ') },
                    db
                  );
                  if (canTransition(c4.status, 'STOPPED')) {
                    const c5 = await updateCaseStatus(
                      c4.id,
                      'STOPPED',
                      undefined,
                      db
                    );
                    await logAuditEvent(
                      {
                        recoveryCaseId: c5.id,
                        eventType: 'CASE_STOPPED',
                        actor: 'policy_engine',
                        reason: decisionResult.blockedReasons.join(', '),
                        previousState: 'BLOCKED',
                        newState: 'STOPPED',
                      },
                      db
                    );
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // 4. Handle Payment Success Events
  const isPaymentSuccess =
    eventType === 'payment.captured' ||
    eventType === 'payment.authorized' ||
    (eventType === 'subscription.charged' &&
      payEntity &&
      (payEntity.status === 'captured' || payEntity.status === 'authorized'));

  if (isPaymentSuccess) {
    const razorpaySubId = subEntity?.id || payEntity?.subscription_id || null;

    if (razorpaySubId) {
      const sub = await getSubscriptionByRazorpayId(razorpaySubId, db);
      if (sub) {
        // Find open recovery cases for subscription
        const { data: openCases } = await db
          .from('recovery_cases')
          .select('*')
          .eq('subscription_id', sub.id)
          .not('status', 'in', '("RECOVERED","STOPPED","EXPIRED")');

        if (openCases && openCases.length > 0) {
          for (const openCase of openCases) {
            let currentStatus = openCase.status;

            if (
              !canTransition(currentStatus, 'RECOVERED') &&
              canTransition(currentStatus, 'VERIFYING')
            ) {
              await updateCaseStatus(openCase.id, 'VERIFYING', undefined, db);
              currentStatus = 'VERIFYING';
            }

            if (canTransition(currentStatus, 'RECOVERED')) {
              const previousState = openCase.status;
              await updateCaseStatus(openCase.id, 'RECOVERED', undefined, db);

              // Idempotency check on recovery outcomes
              const { data: existingOutcome } = await db
                .from('recovery_outcomes')
                .select('id')
                .eq('recovery_case_id', openCase.id)
                .maybeSingle();

              if (!existingOutcome) {
                const recoveredAmount = payEntity
                  ? payEntity.amount / 100
                  : sub.amount;

                await db.from('recovery_outcomes').insert({
                  recovery_case_id: openCase.id,
                  outcome: 'RECOVERED',
                  recovered_amount: recoveredAmount,
                  attribution_status: 'CUSTOMER_INDEPENDENT',
                  attribution_reason: 'Payment succeeded via Razorpay webhook',
                  recovered_at: new Date().toISOString(),
                });
              }

              // Cancel pending recovery actions
              const { data: pendingActions } = await db
                .from('recovery_actions')
                .select('*')
                .eq('recovery_case_id', openCase.id)
                .in('status', ['PENDING', 'SCHEDULED']);

              if (pendingActions && pendingActions.length > 0) {
                const now = new Date().toISOString();
                for (const act of pendingActions) {
                  await db
                    .from('recovery_actions')
                    .update({ status: 'CANCELLED', cancelled_at: now })
                    .eq('id', act.id);
                }

                await logAuditEvent(
                  {
                    recoveryCaseId: openCase.id,
                    eventType: 'PENDING_ACTION_CANCELLED',
                    actor: 'razorpay_webhook',
                    reason:
                      'Case marked RECOVERED via successful payment webhook',
                  },
                  db
                );
              }

              await logAuditEvent(
                {
                  recoveryCaseId: openCase.id,
                  eventType: 'SUBSCRIPTION_RECOVERED',
                  actor: 'razorpay_webhook',
                  previousState,
                  newState: 'RECOVERED',
                  metadata: { paymentId: payEntity?.id },
                },
                db
              );
            }
          }
        }
      }
    }
  }

  // 5. Mark webhook status as PROCESSED
  await db
    .from('webhook_events')
    .update({
      processing_status: 'PROCESSED',
      processed_at: new Date().toISOString(),
    })
    .eq('id', webhookEventId);
}
