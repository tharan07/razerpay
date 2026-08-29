import crypto from 'crypto';
import Razorpay from 'razorpay';

export interface VerifyWebhookSignatureOptions {
  rawBody: string;
  signature: string | null | undefined;
  secret?: string;
}

/**
 * Verifies the Razorpay webhook signature against the raw request body string.
 *
 * Uses HMAC-SHA256 with constant-time buffer comparison to prevent timing attacks.
 * Server-only protected module to prevent client-side execution.
 *
 * IMPORTANT: rawBody MUST be the raw unparsed request body string directly from the request.
 *
 * @param options Object containing rawBody, signature, and optional secret
 * @returns boolean true if signature is valid, false otherwise
 */
export function verifyWebhookSignature({
  rawBody,
  signature,
  secret,
}: VerifyWebhookSignatureOptions): boolean {
  if (typeof window !== 'undefined') {
    throw new Error('Razorpay webhook verification can only be executed on the server.');
  }

  if (!rawBody || typeof rawBody !== 'string' || !signature || typeof signature !== 'string') {
    return false;
  }

  const webhookSecret = secret || process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return false;
  }

  try {
    if (typeof Razorpay.validateWebhookSignature === 'function') {
      return Razorpay.validateWebhookSignature(rawBody, signature, webhookSecret);
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const signatureBuffer = Buffer.from(signature.trim(), 'utf8');

    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch {
    return false;
  }
}
