export type EmailTemplateType =
  | 'RECOVERY_REMINDER'
  | 'PAYMENT_METHOD_UPDATE'
  | 'RECOVERY_LINK';

export interface RenderTemplateInput {
  templateType: EmailTemplateType;
  customerName?: string;
  amount?: number;
  currency?: string;
  recoveryUrl?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Deterministic recovery email template renderer.
 * Produces clean, concise, customer-safe email copy.
 * Never requests passwords, OTPs, CVVs, or sensitive credentials.
 */
export function renderEmailTemplate(
  input: RenderTemplateInput
): RenderedEmail {
  const name = input.customerName || 'Valued Customer';
  const formattedAmount = input.amount
    ? `${input.currency || 'INR'} ${input.amount}`
    : '';
  const url =
    input.recoveryUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://app.recoverai.com/account/billing';

  switch (input.templateType) {
    case 'RECOVERY_REMINDER':
      return {
        subject: 'Action Required: Update your subscription payment details',
        text: `Hello ${name},\n\nWe were unable to process your recent subscription payment${
          formattedAmount ? ` of ${formattedAmount}` : ''
        }.\n\nPlease review your payment method to ensure uninterrupted service.\n\nYou can update your billing details here: ${url}\n\nThank you,\nCustomer Support Team`,
        html: `<div style="font-family: sans-serif; line-height: 1.6; color: #333;"><p>Hello ${name},</p><p>We were unable to process your recent subscription payment${
          formattedAmount ? ` of <strong>${formattedAmount}</strong>` : ''
        }.</p><p>Please review your payment method to ensure uninterrupted service.</p><p><a href="${url}" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 5px;">Update Payment Method</a></p><p>Thank you,<br/>Customer Support Team</p></div>`,
      };

    case 'PAYMENT_METHOD_UPDATE':
      return {
        subject: 'Important: Action required to update payment method',
        text: `Hello ${name},\n\nYour subscription payment attempt failed. Please update your payment method to maintain your access.\n\nUpdate details securely at: ${url}\n\nThank you,\nCustomer Support Team`,
        html: `<div style="font-family: sans-serif; line-height: 1.6; color: #333;"><p>Hello ${name},</p><p>Your subscription payment attempt failed. Please update your payment method to maintain your access.</p><p><a href="${url}" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 5px;">Update Payment Details</a></p><p>Thank you,<br/>Customer Support Team</p></div>`,
      };

    case 'RECOVERY_LINK':
      return {
        subject: 'Secure Recovery Link for your subscription payment',
        text: `Hello ${name},\n\nUse the link below to securely update your payment information for your subscription:\n\n${url}\n\nThank you,\nCustomer Support Team`,
        html: `<div style="font-family: sans-serif; line-height: 1.6; color: #333;"><p>Hello ${name},</p><p>Use the link below to securely update your payment information for your subscription:</p><p><a href="${url}" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 5px;">Secure Payment Link</a></p><p>Thank you,<br/>Customer Support Team</p></div>`,
      };
  }
}
