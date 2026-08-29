import { AIProvider } from '@/lib/ai/provider';
import { getNvidiaNimProvider } from '@/lib/ai/nim-provider';
import {
  MESSAGE_SYSTEM_PROMPT,
  RECOMMENDATION_SYSTEM_PROMPT,
} from '@/lib/ai/prompts';
import { logAuditEvent } from '@/lib/audit/logger';
import { renderEmailTemplate, RenderedEmail } from '@/lib/email/templates';
import { RecoveryStrategy } from '@/types/recovery';
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export interface RecoveryRecommendationInput {
  caseId?: string;
  failureCategory: string;
  subscriptionStatus: string;
  retryCount: number;
  contactAttemptCount: number;
  allowedActions: string[];
}

export interface AIRecoveryRecommendationResult {
  recommendedAction: RecoveryStrategy;
  confidence: number;
  reasoningSummary: string;
  fallbackUsed: boolean;
}

export interface RecoveryMessageInput {
  caseId?: string;
  customerName?: string;
  failureCategory: string;
  subscriptionStatus: string;
  allowedMessageType:
    | 'RECOVERY_REMINDER'
    | 'PAYMENT_METHOD_UPDATE'
    | 'RECOVERY_LINK';
  tone?: 'friendly' | 'professional';
  language?: 'ENGLISH' | 'HINGLISH';
  recoveryUrl?: string;
  amount?: number;
  currency?: string;
}

export interface AIRecoveryMessageResult {
  subject: string;
  body: string;
  fallbackUsed: boolean;
}

const AIRecoveryRecommendationSchema = z.object({
  recommended_action: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reasoning_summary: z.string().min(1),
});

const AIRecoveryMessageSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});

/**
 * Deterministic fallback action calculator when AI fails or returns an invalid action.
 */
function getDeterministicFallbackAction(
  allowedActions: string[]
): RecoveryStrategy {
  if (!allowedActions || allowedActions.length === 0) {
    return 'WAIT_AND_MONITOR';
  }
  if (allowedActions.includes('WAIT_AND_MONITOR')) {
    return 'WAIT_AND_MONITOR';
  }
  if (allowedActions.includes('SEND_RECOVERY_MESSAGE')) {
    return 'SEND_RECOVERY_MESSAGE';
  }
  if (allowedActions.includes('REQUEST_PAYMENT_METHOD_UPDATE')) {
    return 'REQUEST_PAYMENT_METHOD_UPDATE';
  }
  return (allowedActions[0] as RecoveryStrategy) || 'WAIT_AND_MONITOR';
}

/**
 * Generates a bounded recovery recommendation using NVIDIA NIM AI.
 * Validates that recommended_action is strictly within allowedActions.
 * If AI fails or returns an invalid action, falls back deterministically.
 */
export async function generateRecoveryRecommendation(
  input: RecoveryRecommendationInput,
  provider?: AIProvider,
  dbClient?: SupabaseClient
): Promise<AIRecoveryRecommendationResult> {
  const fallbackAction = getDeterministicFallbackAction(input.allowedActions);

  if (!input.allowedActions || input.allowedActions.length === 0) {
    return {
      recommendedAction: 'STOP_RECOVERY',
      confidence: 1.0,
      reasoningSummary: 'No executable actions allowed by policy engine.',
      fallbackUsed: true,
    };
  }

  try {
    const aiProvider = provider || getNvidiaNimProvider();
    const userPrompt = JSON.stringify({
      failureCategory: input.failureCategory,
      subscriptionStatus: input.subscriptionStatus,
      retryCount: input.retryCount,
      contactAttemptCount: input.contactAttemptCount,
      allowed_actions: input.allowedActions,
    });

    const rawOutput = await aiProvider.generateText({
      systemPrompt: RECOMMENDATION_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.1,
    });

    // Clean JSON markdown blocks if present
    const cleanedOutput = rawOutput.replace(/```json\s*|\s*```/gi, '').trim();
    const parsedJson = JSON.parse(cleanedOutput);
    const validated = AIRecoveryRecommendationSchema.parse(parsedJson);

    // Validate action is strictly in allowedActions
    const isAllowed = input.allowedActions.includes(validated.recommended_action);

    if (!isAllowed) {
      if (input.caseId) {
        await logAuditEvent(
          {
            recoveryCaseId: input.caseId,
            eventType: 'AI_RECOMMENDATION_REJECTED',
            actor: 'ai_advisor',
            reason: `AI recommended unallowed action '${validated.recommended_action}'`,
            metadata: {
              recommended: validated.recommended_action,
              allowedActions: input.allowedActions,
            },
          },
          dbClient
        );

        await logAuditEvent(
          {
            recoveryCaseId: input.caseId,
            eventType: 'AI_FALLBACK_USED',
            actor: 'ai_advisor',
            reason: `Fallback to '${fallbackAction}' used after unallowed AI recommendation`,
          },
          dbClient
        );
      }

      return {
        recommendedAction: fallbackAction,
        confidence: 0.0,
        reasoningSummary: `AI recommended unallowed action '${validated.recommended_action}'; defaulted to deterministic fallback '${fallbackAction}'.`,
        fallbackUsed: true,
      };
    }

    if (input.caseId) {
      await logAuditEvent(
        {
          recoveryCaseId: input.caseId,
          eventType: 'AI_RECOMMENDATION_GENERATED',
          actor: 'ai_advisor',
          reason: `AI recommended '${validated.recommended_action}' with confidence ${validated.confidence}`,
          metadata: {
            recommendedAction: validated.recommended_action,
            confidence: validated.confidence,
          },
        },
        dbClient
      );
    }

    return {
      recommendedAction: validated.recommended_action as RecoveryStrategy,
      confidence: validated.confidence,
      reasoningSummary: validated.reasoning_summary,
      fallbackUsed: false,
    };
  } catch (err: unknown) {
    if (input.caseId) {
      await logAuditEvent(
        {
          recoveryCaseId: input.caseId,
          eventType: 'AI_FALLBACK_USED',
          actor: 'ai_advisor',
          reason: `AI recommendation failed: ${
            err instanceof Error ? err.message : 'Unknown provider error'
          }; used fallback '${fallbackAction}'`,
        },
        dbClient
      );
    }

    return {
      recommendedAction: fallbackAction,
      confidence: 0.0,
      reasoningSummary: `AI service unavailable or malformed; used deterministic fallback '${fallbackAction}'.`,
      fallbackUsed: true,
    };
  }
}

/**
 * Checks message text against security & safety rules.
 * Prohibits requesting sensitive credentials, OTPs, CVVs, passwords, or PINs.
 */
function isMessageCustomerSafe(subject: string, body: string): boolean {
  const combined = `${subject} ${body}`.toLowerCase();

  const prohibitedPhrases = [
    'password',
    'one-time password',
    'otp',
    'cvv',
    'card pin',
    'atm pin',
    'credit card number',
    'full card number',
    'bank account password',
    'netbanking password',
    'discount',
    'refund',
    'legal action',
    'police',
    'court',
  ];

  for (const phrase of prohibitedPhrases) {
    if (combined.includes(phrase)) {
      return false;
    }
  }

  return true;
}

/**
 * Generates a customer recovery message using NVIDIA NIM AI.
 * Validates output for customer safety. Falls back to deterministic email templates on failure.
 */
export async function generateRecoveryMessage(
  input: RecoveryMessageInput,
  provider?: AIProvider,
  dbClient?: SupabaseClient
): Promise<AIRecoveryMessageResult> {
  const fallbackTemplate: RenderedEmail = renderEmailTemplate({
    templateType: input.allowedMessageType,
    customerName: input.customerName,
    amount: input.amount,
    currency: input.currency,
    recoveryUrl: input.recoveryUrl,
  });

  try {
    const aiProvider = provider || getNvidiaNimProvider();
    const userPrompt = JSON.stringify({
      customerName: input.customerName || 'Valued Customer',
      failureCategory: input.failureCategory,
      subscriptionStatus: input.subscriptionStatus,
      allowedMessageType: input.allowedMessageType,
      tone: input.tone || 'friendly',
      language: input.language || 'ENGLISH',
      recoveryUrl:
        input.recoveryUrl ||
        process.env.NEXT_PUBLIC_APP_URL ||
        'https://app.recoverai.com/account/billing',
    });

    const rawOutput = await aiProvider.generateText({
      systemPrompt: MESSAGE_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.3,
    });

    const cleanedOutput = rawOutput.replace(/```json\s*|\s*```/gi, '').trim();
    const parsedJson = JSON.parse(cleanedOutput);
    const validated = AIRecoveryMessageSchema.parse(parsedJson);

    // Validate customer safety
    const isSafe = isMessageCustomerSafe(validated.subject, validated.body);

    if (!isSafe) {
      if (input.caseId) {
        await logAuditEvent(
          {
            recoveryCaseId: input.caseId,
            eventType: 'AI_MESSAGE_REJECTED',
            actor: 'ai_copywriter',
            reason: 'Generated AI message failed customer safety validation checks',
          },
          dbClient
        );
        await logAuditEvent(
          {
            recoveryCaseId: input.caseId,
            eventType: 'AI_FALLBACK_USED',
            actor: 'ai_copywriter',
            reason: 'Used deterministic template fallback after unsafe AI message',
          },
          dbClient
        );
      }

      return {
        subject: fallbackTemplate.subject,
        body: fallbackTemplate.text,
        fallbackUsed: true,
      };
    }

    if (input.caseId) {
      await logAuditEvent(
        {
          recoveryCaseId: input.caseId,
          eventType: 'AI_MESSAGE_GENERATED',
          actor: 'ai_copywriter',
          reason: `AI generated recovery message type '${input.allowedMessageType}' in ${input.language || 'ENGLISH'}`,
        },
        dbClient
      );
    }

    return {
      subject: validated.subject,
      body: validated.body,
      fallbackUsed: false,
    };
  } catch (err: unknown) {
    if (input.caseId) {
      await logAuditEvent(
        {
          recoveryCaseId: input.caseId,
          eventType: 'AI_FALLBACK_USED',
          actor: 'ai_copywriter',
          reason: `AI message generation failed: ${
            err instanceof Error ? err.message : 'Unknown provider error'
          }; used deterministic template fallback`,
        },
        dbClient
      );
    }

    return {
      subject: fallbackTemplate.subject,
      body: fallbackTemplate.text,
      fallbackUsed: true,
    };
  }
}
