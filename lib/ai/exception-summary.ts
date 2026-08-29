import { AIProvider } from '@/lib/ai/provider';
import { getNvidiaNimProvider } from '@/lib/ai/nim-provider';
import { SUMMARY_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { logAuditEvent } from '@/lib/audit/logger';
import { SupabaseClient } from '@supabase/supabase-js';

export interface ExceptionSummaryInput {
  caseId?: string;
  failureCategory: string;
  subscriptionStatus: string;
  retryCount: number;
  contactAttemptCount: number;
  reason?: string;
}

export interface ExceptionSummaryResult {
  summary: string;
  fallbackUsed: boolean;
}

/**
 * Generates a concise executive summary for an unresolved or escalated recovery case.
 * Based strictly on supplied deterministic facts.
 */
export async function summarizeException(
  input: ExceptionSummaryInput,
  provider?: AIProvider,
  dbClient?: SupabaseClient
): Promise<ExceptionSummaryResult> {
  const fallback = `Recovery case remained unresolved after ${input.retryCount} retry attempts and ${input.contactAttemptCount} contact attempts. ${
    input.reason ? `Reason: ${input.reason}.` : ''
  } Human review is recommended.`;

  try {
    const aiProvider = provider || getNvidiaNimProvider();
    const userPrompt = JSON.stringify({
      failure_category: input.failureCategory,
      subscription_status: input.subscriptionStatus,
      retry_count: input.retryCount,
      contact_attempt_count: input.contactAttemptCount,
      reason: input.reason || 'Max attempts reached or fraud flagged',
    });

    const summary = await aiProvider.generateText({
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.2,
      maxTokens: 256,
    });

    const cleanSummary = summary.trim();

    if (!cleanSummary) {
      return { summary: fallback, fallbackUsed: true };
    }

    if (input.caseId) {
      await logAuditEvent(
        {
          recoveryCaseId: input.caseId,
          eventType: 'AI_EXCEPTION_SUMMARY_GENERATED',
          actor: 'ai_analyst',
          reason: cleanSummary,
        },
        dbClient
      );
    }

    return {
      summary: cleanSummary,
      fallbackUsed: false,
    };
  } catch {
    return {
      summary: fallback,
      fallbackUsed: true,
    };
  }
}
