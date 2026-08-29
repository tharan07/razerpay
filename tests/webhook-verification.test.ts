import assert from 'node:assert';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import { verifyWebhookSignature } from '@/lib/razorpay/verify-webhook';

describe('Razorpay Webhook Signature Verification', () => {
  const TEST_SECRET = 'test_whsec_1234567890abcdef';
  const SAMPLE_PAYLOAD = JSON.stringify({
    entity: 'event',
    account_id: 'acc_123',
    event: 'subscription.charged',
    contains: ['subscription', 'payment'],
    payload: {
      subscription: {
        entity: {
          id: 'sub_test_123',
          status: 'authenticated',
        },
      },
      payment: {
        entity: {
          id: 'pay_test_456',
          amount: 1000,
          status: 'failed',
        },
      },
    },
    created_at: 1700000000,
  });

  function computeHmacSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  it('accepts a valid Razorpay webhook signature', () => {
    const validSig = computeHmacSignature(SAMPLE_PAYLOAD, TEST_SECRET);
    const result = verifyWebhookSignature({
      rawBody: SAMPLE_PAYLOAD,
      signature: validSig,
      secret: TEST_SECRET,
    });

    assert.strictEqual(result, true);
  });

  it('rejects an invalid/tampered signature', () => {
    const invalidSig =
      'badsig1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const result = verifyWebhookSignature({
      rawBody: SAMPLE_PAYLOAD,
      signature: invalidSig,
      secret: TEST_SECRET,
    });

    assert.strictEqual(result, false);
  });

  it('rejects verification if the payload was modified after signature generation', () => {
    const validSig = computeHmacSignature(SAMPLE_PAYLOAD, TEST_SECRET);
    const modifiedPayload = SAMPLE_PAYLOAD.replace(
      'sub_test_123',
      'sub_tampered_999'
    );

    const result = verifyWebhookSignature({
      rawBody: modifiedPayload,
      signature: validSig,
      secret: TEST_SECRET,
    });

    assert.strictEqual(result, false);
  });

  it('rejects missing or null signature', () => {
    assert.strictEqual(
      verifyWebhookSignature({
        rawBody: SAMPLE_PAYLOAD,
        signature: null,
        secret: TEST_SECRET,
      }),
      false
    );

    assert.strictEqual(
      verifyWebhookSignature({
        rawBody: SAMPLE_PAYLOAD,
        signature: undefined,
        secret: TEST_SECRET,
      }),
      false
    );

    assert.strictEqual(
      verifyWebhookSignature({
        rawBody: SAMPLE_PAYLOAD,
        signature: '',
        secret: TEST_SECRET,
      }),
      false
    );
  });

  it('handles empty or non-string inputs safely without throwing exceptions', () => {
    assert.strictEqual(
      verifyWebhookSignature({
        rawBody: '',
        signature: 'some_sig',
        secret: TEST_SECRET,
      }),
      false
    );

    assert.strictEqual(
      verifyWebhookSignature({
        rawBody: null as unknown as string,
        signature: 'some_sig',
        secret: TEST_SECRET,
      }),
      false
    );
  });
});
