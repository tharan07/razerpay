/**
 * RecoverAI — Razorpay Webhook & API Types
 * Authoritative Specification: RecoverAI-Specification.md
 */

export interface RazorpaySubscriptionEntity {
  id: string;
  entity: 'subscription';
  plan_id?: string;
  customer_id?: string;
  status:
    | 'created'
    | 'authenticated'
    | 'active'
    | 'pending'
    | 'halted'
    | 'cancelled'
    | 'completed'
    | 'expired'
    | 'paused'
    | string;
  current_start?: number;
  current_end?: number;
  ended_at?: number;
  quantity?: number;
  notes?: Record<string, unknown>;
  charge_at?: number;
  start_at?: number;
  end_at?: number;
  auth_attempts?: number;
  total_count?: number;
  paid_count?: number;
  customer_notify?: boolean;
  created_at?: number;
}

export interface RazorpayPaymentEntity {
  id: string;
  entity: 'payment';
  amount: number;
  currency?: string;
  status:
    | 'created'
    | 'authorized'
    | 'captured'
    | 'refunded'
    | 'failed'
    | string;
  order_id?: string;
  invoice_id?: string;
  international?: boolean;
  method?: string;
  amount_refunded?: number;
  refund_status?: string;
  captured?: boolean;
  description?: string;
  card_id?: string;
  bank?: string;
  wallet?: string;
  vpa?: string;
  email?: string;
  contact?: string;
  notes?: Record<string, unknown>;
  fee?: number;
  tax?: number;
  error_code?: string;
  error_description?: string;
  error_source?: string;
  error_step?: string;
  error_reason?: string;
  subscription_id?: string;
  created_at?: number;
}

export interface RazorpayWebhookPayload {
  entity: 'event';
  account_id?: string;
  event: string;
  event_id?: string;
  id?: string;
  contains?: string[];
  payload: {
    subscription?: {
      entity: RazorpaySubscriptionEntity;
    };
    payment?: {
      entity: RazorpayPaymentEntity;
    };
    [key: string]: unknown;
  };
  created_at?: number;
}
