-- Migration: Create RecoverAI PostgreSQL Database Schema
-- Authoritative Source: RecoverAI-Specification.md

-- 1. customers
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_customer_id TEXT UNIQUE,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. customer_preferences
CREATE TABLE IF NOT EXISTS customer_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  email_opt_out BOOLEAN DEFAULT FALSE,
  preferred_contact_channel TEXT,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  max_contact_frequency_hours INTEGER DEFAULT 24,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_subscription_id TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  plan_id TEXT,
  amount NUMERIC,
  currency TEXT DEFAULT 'INR',
  current_status TEXT,
  latest_verified_status TEXT,
  last_state_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. webhook_events
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT DEFAULT 'razorpay',
  provider_event_id TEXT UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  signature_valid BOOLEAN,
  processing_status TEXT DEFAULT 'PENDING' CHECK (
    processing_status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED')
  ),
  processing_error TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- 5. payment_attempts
CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_payment_id TEXT UNIQUE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  failure_code TEXT,
  failure_description TEXT,
  failure_category TEXT CHECK (
    failure_category IS NULL OR failure_category IN ('RETRYABLE', 'NEEDS_CUSTOMER_ACTION', 'TERMINAL', 'FRAUD_FLAGGED', 'UNKNOWN')
  ),
  amount NUMERIC,
  attempt_number INTEGER,
  occurred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. recovery_cases
CREATE TABLE IF NOT EXISTS recovery_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  payment_attempt_id UUID REFERENCES payment_attempts(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (
    status IN (
      'NEW',
      'CLASSIFIED',
      'VERIFYING',
      'POLICY_PENDING',
      'BLOCKED',
      'ACTION_PLANNED',
      'WAITING',
      'ACTION_EXECUTING',
      'AWAITING_OUTCOME',
      'RECOVERED',
      'CUSTOMER_ACTION_REQUIRED',
      'ESCALATED',
      'STOPPED',
      'EXPIRED'
    )
  ),
  failure_category TEXT CHECK (
    failure_category IS NULL OR failure_category IN ('RETRYABLE', 'NEEDS_CUSTOMER_ACTION', 'TERMINAL', 'FRAUD_FLAGGED', 'UNKNOWN')
  ),
  recovery_strategy TEXT,
  retry_count INTEGER DEFAULT 0,
  contact_attempt_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  max_contact_attempts INTEGER DEFAULT 3,
  next_eligible_action_at TIMESTAMPTZ,
  attribution_window_hours INTEGER DEFAULT 72,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  stop_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. recovery_actions
CREATE TABLE IF NOT EXISTS recovery_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_case_id UUID REFERENCES recovery_cases(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'SCHEDULED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED')
  ),
  scheduled_for TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  blocked_reason TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. recovery_outcomes
CREATE TABLE IF NOT EXISTS recovery_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_case_id UUID REFERENCES recovery_cases(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (
    outcome IN ('RECOVERED', 'NOT_RECOVERED', 'ESCALATED', 'STOPPED', 'EXPIRED')
  ),
  recovered_amount NUMERIC,
  attribution_status TEXT CHECK (
    attribution_status IS NULL OR attribution_status IN ('AGENT_ATTRIBUTED', 'BASELINE_ATTRIBUTED', 'CUSTOMER_INDEPENDENT', 'UNKNOWN')
  ),
  attribution_reason TEXT,
  recovered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. audit_log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_case_id UUID REFERENCES recovery_cases(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  previous_state TEXT,
  new_state TEXT,
  decision JSONB,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Append-only trigger on audit_log
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log table is append-only. UPDATE and DELETE operations are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_audit_log_append_only ON audit_log;
CREATE TRIGGER enforce_audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customer_preferences_updated_at ON customer_preferences;
CREATE TRIGGER update_customer_preferences_updated_at BEFORE UPDATE ON customer_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_recovery_cases_updated_at ON recovery_cases;
CREATE TRIGGER update_recovery_cases_updated_at BEFORE UPDATE ON recovery_cases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_recovery_actions_updated_at ON recovery_actions;
CREATE TRIGGER update_recovery_actions_updated_at BEFORE UPDATE ON recovery_actions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Performance and FK Indexes
CREATE INDEX IF NOT EXISTS idx_customer_preferences_customer_id ON customer_preferences(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_id ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_razorpay_sub_id ON subscriptions(razorpay_subscription_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processing_status ON webhook_events(processing_status);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_subscription_id ON payment_attempts(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_razorpay_payment_id ON payment_attempts(razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_recovery_cases_subscription_id ON recovery_cases(subscription_id);
CREATE INDEX IF NOT EXISTS idx_recovery_cases_payment_attempt_id ON recovery_cases(payment_attempt_id);
CREATE INDEX IF NOT EXISTS idx_recovery_cases_customer_id ON recovery_cases(customer_id);
CREATE INDEX IF NOT EXISTS idx_recovery_cases_status ON recovery_cases(status);
CREATE INDEX IF NOT EXISTS idx_recovery_actions_recovery_case_id ON recovery_actions(recovery_case_id);
CREATE INDEX IF NOT EXISTS idx_recovery_actions_status ON recovery_actions(status);
CREATE INDEX IF NOT EXISTS idx_recovery_outcomes_recovery_case_id ON recovery_outcomes(recovery_case_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_recovery_case_id ON audit_log(recovery_case_id);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
