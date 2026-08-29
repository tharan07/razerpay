import { Resend } from 'resend';

// Enforce server-only execution
if (typeof window !== 'undefined') {
  throw new Error('lib/email/client.ts is server-only and cannot be imported into browser code.');
}

/**
 * Gets a server-side Resend client instance.
 * Reads RESEND_API_KEY from environment variables.
 */
export function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not configured.');
  }
  return new Resend(apiKey);
}

/**
 * Gets the configured default sender email address.
 * Reads RESEND_FROM_EMAIL from environment variables.
 */
export function getResendFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
}
