import { sendEmail, SendEmailResult } from '@/lib/email/email-service';
import {
  EmailTemplateType,
  renderEmailTemplate,
} from '@/lib/email/templates';
import { RecoveryAction } from '@/types/recovery';
import { Resend } from 'resend';

export interface DispatchRecoveryEmailInput {
  action: RecoveryAction;
  toEmail: string;
  customerName?: string;
  amount?: number;
  currency?: string;
  recoveryUrl?: string;
}

/**
 * Dispatches a customer communication recovery email mapped from the recovery action type.
 *
 * Mappings:
 * - SEND_RECOVERY_MESSAGE -> RECOVERY_REMINDER template
 * - REQUEST_PAYMENT_METHOD_UPDATE -> PAYMENT_METHOD_UPDATE template
 * - SEND_RECOVERY_LINK -> RECOVERY_LINK template
 */
export async function dispatchRecoveryEmail(
  input: DispatchRecoveryEmailInput,
  customResendClient?: Resend
): Promise<SendEmailResult> {
  let templateType: EmailTemplateType = 'RECOVERY_REMINDER';

  if (input.action.action_type === 'REQUEST_PAYMENT_METHOD_UPDATE') {
    templateType = 'PAYMENT_METHOD_UPDATE';
  } else if (input.action.action_type === 'SEND_RECOVERY_LINK') {
    templateType = 'RECOVERY_LINK';
  }

  const rendered = renderEmailTemplate({
    templateType,
    customerName: input.customerName,
    amount: input.amount,
    currency: input.currency,
    recoveryUrl: input.recoveryUrl,
  });

  return sendEmail(
    {
      to: input.toEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    },
    customResendClient
  );
}
