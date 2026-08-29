import { NextResponse } from 'next/server';
import { explainDecision } from '@/lib/ai/decision-explanation';
import { summarizeException } from '@/lib/ai/exception-summary';
import {
  generateRecoveryMessage,
  generateRecoveryRecommendation,
} from '@/lib/ai/recovery-message';
import { z } from 'zod';

const RecommendationContextSchema = z.object({
  caseId: z.string().optional(),
  failure_category: z.string(),
  subscription_status: z.string(),
  retry_count: z.number().default(0),
  contact_attempt_count: z.number().default(0),
  allowed_actions: z.array(z.string()).min(1),
});

const MessageContextSchema = z.object({
  caseId: z.string().optional(),
  customerName: z.string().optional(),
  failureCategory: z.string(),
  subscriptionStatus: z.string(),
  allowedMessageType: z.enum([
    'RECOVERY_REMINDER',
    'PAYMENT_METHOD_UPDATE',
    'RECOVERY_LINK',
  ]),
  tone: z.enum(['friendly', 'professional']).optional(),
  language: z.enum(['ENGLISH', 'HINGLISH']).optional(),
  recoveryUrl: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
});

const ExplanationContextSchema = z.object({
  caseId: z.string().optional(),
  failureCategory: z.string(),
  subscriptionStatus: z.string(),
  policyDecision: z.string(),
  allowedActions: z.array(z.string()),
  selectedAction: z.string(),
  retryCount: z.number().default(0),
  contactAttemptCount: z.number().default(0),
});

const SummaryContextSchema = z.object({
  caseId: z.string().optional(),
  failureCategory: z.string(),
  subscriptionStatus: z.string(),
  retryCount: z.number().default(0),
  contactAttemptCount: z.number().default(0),
  reason: z.string().optional(),
});

const GenerateRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('recommendation'),
    context: RecommendationContextSchema,
  }),
  z.object({
    type: z.literal('message'),
    context: MessageContextSchema,
  }),
  z.object({
    type: z.literal('decision_explanation'),
    context: ExplanationContextSchema,
  }),
  z.object({
    type: z.literal('exception_summary'),
    context: SummaryContextSchema,
  }),
]);

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const parseResult = GenerateRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request schema or context payload',
          details: parseResult.error.format(),
        },
        { status: 400 }
      );
    }

    const payload = parseResult.data;

    switch (payload.type) {
      case 'recommendation': {
        const result = await generateRecoveryRecommendation({
          caseId: payload.context.caseId,
          failureCategory: payload.context.failure_category,
          subscriptionStatus: payload.context.subscription_status,
          retryCount: payload.context.retry_count,
          contactAttemptCount: payload.context.contact_attempt_count,
          allowedActions: payload.context.allowed_actions,
        });

        return NextResponse.json({
          status: 'ok',
          type: 'recommendation',
          result,
        });
      }

      case 'message': {
        const result = await generateRecoveryMessage({
          caseId: payload.context.caseId,
          customerName: payload.context.customerName,
          failureCategory: payload.context.failureCategory,
          subscriptionStatus: payload.context.subscriptionStatus,
          allowedMessageType: payload.context.allowedMessageType,
          tone: payload.context.tone,
          language: payload.context.language,
          recoveryUrl: payload.context.recoveryUrl,
          amount: payload.context.amount,
          currency: payload.context.currency,
        });

        return NextResponse.json({
          status: 'ok',
          type: 'message',
          result,
        });
      }

      case 'decision_explanation': {
        const result = await explainDecision({
          caseId: payload.context.caseId,
          failureCategory: payload.context.failureCategory,
          subscriptionStatus: payload.context.subscriptionStatus,
          policyDecision: payload.context.policyDecision,
          allowedActions: payload.context.allowedActions,
          selectedAction: payload.context.selectedAction,
          retryCount: payload.context.retryCount,
          contactAttemptCount: payload.context.contactAttemptCount,
        });

        return NextResponse.json({
          status: 'ok',
          type: 'decision_explanation',
          result,
        });
      }

      case 'exception_summary': {
        const result = await summarizeException({
          caseId: payload.context.caseId,
          failureCategory: payload.context.failureCategory,
          subscriptionStatus: payload.context.subscriptionStatus,
          retryCount: payload.context.retryCount,
          contactAttemptCount: payload.context.contactAttemptCount,
          reason: payload.context.reason,
        });

        return NextResponse.json({
          status: 'ok',
          type: 'exception_summary',
          result,
        });
      }
    }
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Internal AI generation handler failure',
      },
      { status: 500 }
    );
  }
}
