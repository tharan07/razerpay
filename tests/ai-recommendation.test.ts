import assert from 'node:assert';
import { describe, it } from 'node:test';
import { AIProvider } from '@/lib/ai/provider';
import { generateRecoveryRecommendation } from '@/lib/ai/recovery-message';

describe('Phase 9 — Bounded AI Recovery Recommendation System', () => {
  const allowedActions = ['WAIT_AND_MONITOR', 'SEND_RECOVERY_MESSAGE'];

  it('accepts valid recommendation within allowed_actions', async () => {
    const mockProvider: AIProvider = {
      generateText: async () => {
        return JSON.stringify({
          recommended_action: 'WAIT_AND_MONITOR',
          confidence: 0.88,
          reasoning_summary: 'Temporary failure is likely self-healing.',
        });
      },
    };

    const res = await generateRecoveryRecommendation(
      {
        failureCategory: 'RETRYABLE',
        subscriptionStatus: 'halted',
        retryCount: 1,
        contactAttemptCount: 0,
        allowedActions,
      },
      mockProvider
    );

    assert.strictEqual(res.recommendedAction, 'WAIT_AND_MONITOR');
    assert.strictEqual(res.confidence, 0.88);
    assert.strictEqual(res.fallbackUsed, false);
  });

  it('rejects unallowed AI action (e.g. CHARGE_CUSTOMER) and falls back deterministically', async () => {
    const mockProvider: AIProvider = {
      generateText: async () => {
        return JSON.stringify({
          recommended_action: 'CHARGE_CUSTOMER_UNAUTHORIZED',
          confidence: 0.95,
          reasoning_summary: 'Attempt direct charge.',
        });
      },
    };

    const res = await generateRecoveryRecommendation(
      {
        failureCategory: 'RETRYABLE',
        subscriptionStatus: 'halted',
        retryCount: 1,
        contactAttemptCount: 0,
        allowedActions,
      },
      mockProvider
    );

    assert.strictEqual(res.recommendedAction, 'WAIT_AND_MONITOR');
    assert.strictEqual(res.fallbackUsed, true);
    assert.ok(res.reasoningSummary.includes('unallowed action'));
  });

  it('handles malformed JSON response safely with deterministic fallback', async () => {
    const mockProvider: AIProvider = {
      generateText: async () => {
        return 'not a json string {{{';
      },
    };

    const res = await generateRecoveryRecommendation(
      {
        failureCategory: 'RETRYABLE',
        subscriptionStatus: 'halted',
        retryCount: 1,
        contactAttemptCount: 0,
        allowedActions,
      },
      mockProvider
    );

    assert.strictEqual(res.recommendedAction, 'WAIT_AND_MONITOR');
    assert.strictEqual(res.fallbackUsed, true);
  });

  it('handles AI provider outage/exception safely without crashing recovery pipeline', async () => {
    const mockProvider: AIProvider = {
      generateText: async () => {
        throw new Error('NVIDIA NIM API connection refused');
      },
    };

    const res = await generateRecoveryRecommendation(
      {
        failureCategory: 'RETRYABLE',
        subscriptionStatus: 'halted',
        retryCount: 1,
        contactAttemptCount: 0,
        allowedActions,
      },
      mockProvider
    );

    assert.strictEqual(res.recommendedAction, 'WAIT_AND_MONITOR');
    assert.strictEqual(res.fallbackUsed, true);
  });

  it('rejects invalid confidence bounds (< 0 or > 1)', async () => {
    const mockProvider: AIProvider = {
      generateText: async () => {
        return JSON.stringify({
          recommended_action: 'WAIT_AND_MONITOR',
          confidence: 1.5, // invalid
          reasoning_summary: 'Invalid confidence',
        });
      },
    };

    const res = await generateRecoveryRecommendation(
      {
        failureCategory: 'RETRYABLE',
        subscriptionStatus: 'halted',
        retryCount: 1,
        contactAttemptCount: 0,
        allowedActions,
      },
      mockProvider
    );

    assert.strictEqual(res.fallbackUsed, true);
  });
});
