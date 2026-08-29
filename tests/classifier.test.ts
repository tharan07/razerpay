import assert from 'node:assert';
import { describe, it } from 'node:test';
import { classifyFailure } from '@/lib/recovery/classifier';

describe('Failure Classifier Engine', () => {
  it('should classify insufficient funds as RETRYABLE', () => {
    assert.strictEqual(
      classifyFailure({ failureDescription: 'Insufficient funds in customer account' }),
      'RETRYABLE'
    );
    assert.strictEqual(
      classifyFailure({ failureCode: 'INSUFFICIENT_FUNDS' }),
      'RETRYABLE'
    );
  });

  it('should classify temporary bank failure as RETRYABLE', () => {
    assert.strictEqual(
      classifyFailure({ failureDescription: 'Temporary bank failure occurred' }),
      'RETRYABLE'
    );
    assert.strictEqual(
      classifyFailure({ failureCode: 'BANK_ERROR' }),
      'RETRYABLE'
    );
  });

  it('should classify gateway timeout as RETRYABLE', () => {
    assert.strictEqual(
      classifyFailure({ failureDescription: 'Payment gateway timeout' }),
      'RETRYABLE'
    );
    assert.strictEqual(
      classifyFailure({ failureCode: 'GATEWAY_TIMEOUT' }),
      'RETRYABLE'
    );
  });

  it('should classify expired payment method as NEEDS_CUSTOMER_ACTION', () => {
    assert.strictEqual(
      classifyFailure({ failureDescription: 'Expired payment method' }),
      'NEEDS_CUSTOMER_ACTION'
    );
    assert.strictEqual(
      classifyFailure({ failureCode: 'EXPIRED_CARD' }),
      'NEEDS_CUSTOMER_ACTION'
    );
  });

  it('should classify mandate issue as NEEDS_CUSTOMER_ACTION', () => {
    assert.strictEqual(
      classifyFailure({ failureDescription: 'Mandate issue on auto-debit' }),
      'NEEDS_CUSTOMER_ACTION'
    );
    assert.strictEqual(
      classifyFailure({ failureCode: 'MANDATE_EXPIRED' }),
      'NEEDS_CUSTOMER_ACTION'
    );
  });

  it('should classify subscription cancelled as TERMINAL', () => {
    assert.strictEqual(
      classifyFailure({ failureDescription: 'Subscription cancelled by merchant' }),
      'TERMINAL'
    );
    assert.strictEqual(
      classifyFailure({ failureCode: 'SUBSCRIPTION_CANCELLED' }),
      'TERMINAL'
    );
  });

  it('should classify fraud/security flag as FRAUD_FLAGGED', () => {
    assert.strictEqual(
      classifyFailure({ failureDescription: 'Fraud/security flag raised' }),
      'FRAUD_FLAGGED'
    );
    assert.strictEqual(
      classifyFailure({ failureCode: 'FRAUD_SUSPECTED' }),
      'FRAUD_FLAGGED'
    );
  });

  it('should classify unknown/unrecognized failures as UNKNOWN', () => {
    assert.strictEqual(
      classifyFailure({ failureCode: 'XYZ_UNRECOGNIZED_123', failureDescription: 'Random error' }),
      'UNKNOWN'
    );
    assert.strictEqual(
      classifyFailure({}),
      'UNKNOWN'
    );
  });

  it('should handle case-insensitive and whitespace-padded inputs safely', () => {
    assert.strictEqual(
      classifyFailure({ failureDescription: '  INSUFFICIENT FUNDS  ' }),
      'RETRYABLE'
    );
    assert.strictEqual(
      classifyFailure({ failureCode: '  expired_card  ' }),
      'NEEDS_CUSTOMER_ACTION'
    );
    assert.strictEqual(
      classifyFailure({ failureDescription: 'FRAUD/SECURITY FLAG' }),
      'FRAUD_FLAGGED'
    );
  });
});
