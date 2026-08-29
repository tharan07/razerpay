import assert from 'node:assert';
import { describe, it } from 'node:test';
import { evaluateContactPolicy } from '@/lib/policy/contact-policy';
import { evaluatePolicy } from '@/lib/policy/policy-engine';
import { PolicyInput } from '@/types/recovery';

describe('Phase 6 — Deterministic Policy & Compliance Engine', () => {
  const basePolicyInput: PolicyInput = {
    caseId: 'case_100',
    subscriptionStatus: 'halted',
    failureCategory: 'RETRYABLE',
    amount: 1000,
    retryCount: 0,
    contactAttemptCount: 0,
    customerOptedOut: false,
    quietHoursActive: false,
    allowedRecoveryWindow: true,
  };

  it('allows normal retryable recovery', () => {
    const result = evaluatePolicy(basePolicyInput);
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.decision, 'ALLOW');
    assert.deepStrictEqual(result.allowedActions, [
      'WAIT_AND_MONITOR',
      'SEND_RECOVERY_MESSAGE',
      'SEND_RECOVERY_LINK',
    ]);
    assert.strictEqual(result.blockedReasons.length, 0);
  });

  it('blocks opted-out customer contact', () => {
    const input: PolicyInput = {
      ...basePolicyInput,
      customerOptedOut: true,
    };
    const result = evaluatePolicy(input);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.decision, 'BLOCK');
    assert.ok(result.blockedReasons.includes('CUSTOMER_OPTED_OUT'));
    assert.deepStrictEqual(result.allowedActions, ['WAIT_AND_MONITOR']);
  });

  it('blocks when retry cap reached (boundary condition: retryCount === maxRetries)', () => {
    const input: PolicyInput = {
      ...basePolicyInput,
      retryCount: 3,
    };
    const result = evaluatePolicy(input, { maxRetries: 3 });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.decision, 'STOP');
    assert.strictEqual(result.retryCapRemaining, 0);
    assert.ok(
      result.blockedReasons.some((r) =>
        r.includes('Maximum retry attempts limit')
      )
    );
  });

  it('blocks contact when contact cap reached (boundary condition: contactAttemptCount === maxContactAttempts)', () => {
    const input: PolicyInput = {
      ...basePolicyInput,
      contactAttemptCount: 3,
    };
    const result = evaluatePolicy(input, { maxContactAttempts: 3 });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.decision, 'BLOCK');
    assert.strictEqual(result.contactCapRemaining, 0);
    assert.ok(result.blockedReasons.includes('MAX_CONTACT_ATTEMPTS_REACHED'));
  });

  it('delays contact during quiet hours', () => {
    const input: PolicyInput = {
      ...basePolicyInput,
      quietHoursActive: true,
    };
    const now = new Date('2026-08-29T23:00:00Z');
    const result = evaluatePolicy(input, { now });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.decision, 'BLOCK');
    assert.ok(result.blockedReasons.includes('QUIET_HOURS_ACTIVE'));
    assert.notStrictEqual(result.earliestExecutionTime, undefined);
  });

  it('delays contact when frequency window has not elapsed', () => {
    const now = new Date('2026-08-29T12:00:00Z');
    const lastContactAt = new Date('2026-08-29T00:00:00Z'); // 12 hours ago (limit is 24h)
    const input: PolicyInput = {
      ...basePolicyInput,
      lastContactAt,
    };
    const result = evaluatePolicy(input, { now, maxContactFrequencyHours: 24 });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.decision, 'BLOCK');
    assert.ok(result.blockedReasons.includes('CONTACT_FREQUENCY_LIMIT'));
    assert.strictEqual(
      result.earliestExecutionTime?.getTime(),
      lastContactAt.getTime() + 24 * 3600 * 1000
    );
  });

  it('allows contact when frequency window has exactly elapsed (boundary condition)', () => {
    const lastContactAt = new Date('2026-08-28T12:00:00Z');
    const now = new Date('2026-08-29T12:00:00Z'); // exactly 24h later
    const contactResult = evaluateContactPolicy({
      customerOptedOut: false,
      contactAttemptCount: 0,
      lastContactAt,
      maxContactFrequencyHours: 24,
      now,
    });
    assert.strictEqual(contactResult.allowed, true);
  });

  it('escalates fraud and never allows fraud automatic execution', () => {
    const input: PolicyInput = {
      ...basePolicyInput,
      failureCategory: 'FRAUD_FLAGGED',
    };
    const result = evaluatePolicy(input);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.decision, 'ESCALATE');
    assert.deepStrictEqual(result.allowedActions, ['ESCALATE_TO_HUMAN']);
    assert.ok(result.blockedReasons.some((r) => r.includes('Fraud')));
  });

  it('stops cancelled subscription', () => {
    const input: PolicyInput = {
      ...basePolicyInput,
      subscriptionStatus: 'cancelled',
    };
    const result = evaluatePolicy(input);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.decision, 'STOP');
    assert.deepStrictEqual(result.allowedActions, ['STOP_RECOVERY']);
  });

  it('stops already recovered payment', () => {
    const input: PolicyInput = {
      ...basePolicyInput,
      subscriptionStatus: 'active',
    };
    const result = evaluatePolicy(input);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.decision, 'STOP');
  });

  it('expires an expired recovery window', () => {
    const input: PolicyInput = {
      ...basePolicyInput,
      allowedRecoveryWindow: false,
    };
    const result = evaluatePolicy(input);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.decision, 'STOP');
  });

  it('returns deterministic results for identical inputs', () => {
    const res1 = evaluatePolicy(basePolicyInput);
    const res2 = evaluatePolicy(basePolicyInput);
    assert.deepStrictEqual(res1, res2);
  });
});
