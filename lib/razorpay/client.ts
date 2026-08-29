import Razorpay from 'razorpay';

/**
 * Server-only Razorpay client factory and helper.
 *
 * Enforces server-side execution via runtime environment check
 * to prevent accidental client/browser bundle inclusion of Razorpay secret credentials.
 */

let razorpayInstance: Razorpay | null = null;

/**
 * Creates or returns a singleton server-side Razorpay client instance.
 *
 * Reads RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET from server environment variables.
 * Throws a clean error if credentials are missing without exposing secret values.
 *
 * @returns Razorpay client instance
 */
export function getRazorpayClient(): Razorpay {
  if (typeof window !== 'undefined') {
    throw new Error('Razorpay client must only be initialized on the server.');
  }

  if (razorpayInstance) {
    return razorpayInstance;
  }

  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    throw new Error(
      'Missing Razorpay server environment variables: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set.'
    );
  }

  razorpayInstance = new Razorpay({
    key_id,
    key_secret,
  });

  return razorpayInstance;
}
