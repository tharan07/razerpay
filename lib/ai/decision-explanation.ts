import { AIProvider } from '@/lib/ai/provider';
import { getNvidiaNimProvider } from '@/lib/ai/nim-provider';
import { EXPLANATION_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { logAuditEvent } from '@/lib/audit/logger';
import { SupabaseClient } from '@supabase/supabase-js';

export interface DecisionExplanationInput {
  caseId?: string;
  failureCategory: string;
  subscriptionStatus: string;
  policyDecision: string;
  allowedActions: string[];
  selectedAction: string;
  retryCount: number;
  contactAttemptCount: number;
}

export interface DecisionExplanationResult {
  explanation: string;
  fallbackUsed: boolean;
}

/**
 * Generates a natural language explanation for an already-determined backend policy decision.
 * The explanation explains the decision; it never alters or creates decisions.
 */
export async function explainDecision(
  input: DecisionExplanationInput,
  provider?: AIProvider,
  dbClient?: SupabaseClient
): Promise<DecisionExplanationResult> {
  const fallback = `RecoverAI selected '${input.selectedAction}' because the case failure category is '${input.failureCategory}', the subscription status is '${input.subscriptionStatus}', and the policy decision returned '${input.policyDecision}'.`;

  try {
    const aiProvider = provider || getNvidiaNimProvider();
    const userPrompt = JSON.stringify({
      failure_category: input.failureCategory,
      subscription_status: input.subscriptionStatus,
      policy_decision: input.policyDecision,
      allowed_actions: input.allowedActions,
      selected_action: input.selectedAction,
      retry_count: input.retryCount,
      contact_attempt_count: input.contactAttemptCount,
    });

    const explanation = await aiProvider.generateText({
      systemPrompt: EXPLANATION_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.2,
      maxTokens: 256,
    });

    const cleanExplanation = explanation.trim();

    if (!cleanExplanation) {
      return { explanation: fallback, fallbackUsed: true };
    }

    if (input.caseId) {
      await logAuditEvent(
        {
          recoveryCaseId: input.caseId,
          eventType: 'AI_DECISION_EXPLAINED',
          actor: 'ai_analyst',
          reason: cleanExplanation,
        },
        dbClient
      );
    }

    return {
      explanation: cleanExplanation,
      fallbackUsed: false,
    };
  } catch {
    return {
      explanation: fallback,
      fallbackUsed: true,
    };
  }
}
