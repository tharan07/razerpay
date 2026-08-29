import { getResendClient, getResendFromEmail } from '@/lib/email/client';
import { Resend } from 'resend';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Pure typed email service wrapper around Resend SDK.
 * Returns safe success/failure results without exposing secrets or raw stack traces.
 */
export async function sendEmail(
  options: SendEmailOptions,
  customResendClient?: Resend
): Promise<SendEmailResult> {
  try {
    const resend = customResendClient || getResendClient();
    const fromAddress = options.from || getResendFromEmail();

    const response = await resend.emails.send({
      from: fromAddress,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (response.error) {
      return {
        success: false,
        error: response.error.message || 'Failed to dispatch email via provider',
      };
    }

    return {
      success: true,
      id: response.data?.id,
    };
  } catch (err: unknown) {
    const safeError =
      err instanceof Error ? err.message : 'Unknown email transport failure';

    return {
      success: false,
      error: safeError,
    };
  }
}
