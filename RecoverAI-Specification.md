# RecoverAI — AI Revenue Recovery Orchestrator

## Razorpay AI Buildathon — Track 03: AI Revenue Recovery

---

# 1. Project Overview

## Project Name

**RecoverAI**

### Tagline

> **Detect. Diagnose. Recover — without annoying the customer.**

## One-Line Pitch

RecoverAI is an AI-powered revenue recovery orchestrator that monitors failed Razorpay subscription payments, diagnoses why revenue is at risk, determines the safest and least intrusive recovery intervention, executes bounded actions, and measures how much revenue was actually recovered.

## Core Problem

Recurring subscription payments can fail because of:

- Insufficient funds
- Temporary bank failures
- Payment method issues
- Mandate problems
- Gateway failures
- Customer cancellation
- Fraud-related flags

Traditional recovery systems often use a simplistic approach:

```text
Payment failed
      ↓
Retry
      ↓
Retry again
      ↓
Retry again
```

This creates several problems:

- Customers receive unnecessary reminders
- Retry attempts may be wasted
- Customer preferences may be ignored
- Fraud or terminal cases may be retried incorrectly
- There is no intelligent intervention strategy
- Recovery actions may continue after the payment is already recovered
- Merchants cannot clearly understand why an action was taken
- Recovery performance is difficult to measure

RecoverAI introduces a closed-loop recovery system.

```text
Detect
   ↓
Diagnose
   ↓
Verify Current State
   ↓
Apply Safety + Compliance Rules
   ↓
Choose Recovery Strategy
   ↓
Execute Bounded Action
   ↓
Observe Razorpay Outcome
   ↓
Measure Recovery
   ↓
Stop or Escalate
```

---

# 2. Core Product Principle

## Razorpay Owns Payment Execution

RecoverAI must NOT attempt to replace Razorpay's subscription lifecycle or built-in payment retry system.

Razorpay is responsible for:

- Payment processing
- Subscription lifecycle
- Mandates
- Payment retries supported by Razorpay
- Payment state changes
- Payment webhooks

RecoverAI operates as an intelligence and orchestration layer around Razorpay.

## RecoverAI Owns

- Revenue risk detection
- Failure diagnosis
- Recovery case management
- Current subscription state verification
- Customer contact fatigue prevention
- Compliance and safety policy enforcement
- Recovery strategy selection
- AI-assisted recommendations
- Customer communication
- Escalation
- Stopping rules
- Outcome attribution
- Audit logging
- Batch recovery analytics

The architecture principle is:

> **Deterministic code controls compliance, state transitions, and financial workflow boundaries. AI can reason and recommend only inside explicitly allowed options.**

---

# 3. Primary Product Flow

```text
                    RAZORPAY
                        │
                        │ Webhook
                        ▼
              WEBHOOK INGESTION
                        │
                Signature Validation
                        │
                Idempotency Check
                        │
                        ▼
                 WEBHOOK EVENTS
                        │
                        ▼
                RECOVERY CASE ENGINE
                        │
              ┌─────────┼─────────┐
              ▼         ▼         ▼
         Verify State Diagnose  Fraud Check
              │         │         │
              └─────────┼─────────┘
                        ▼
                 POLICY ENGINE
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
           BLOCKED              ALLOWED
              │                   │
              ▼                   ▼
        HUMAN ESCALATION    STRATEGY ENGINE
                                  │
                                  ▼
                            AI ADVISOR
                     (bounded recommendations)
                                  │
                                  ▼
                       DETERMINISTIC VALIDATOR
                                  │
                                  ▼
                           ACTION EXECUTOR
                     ┌────────────┼────────────┐
                     ▼            ▼            ▼
                   WAIT         EMAIL      CUSTOMER ACTION
                     │            │            │
                     └────────────┼────────────┘
                                  ▼
                          OUTCOME TRACKER
                                  │
                      ┌───────────┴───────────┐
                      ▼                       ▼
                  RECOVERED                UNRESOLVED
                      │                       │
                      ▼                       ▼
                ATTRIBUTE               STOP / ESCALATE
                      │
                      ▼
                  AUDIT LOG
                      │
                      ▼
                   DASHBOARD
```

---

# 4. Technology Stack

## Frontend

- Next.js
- App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Recharts for analytics

## Backend

Use Next.js as a full-stack application.

Do NOT create a separate Express, NestJS, or Fastify backend.

Use:

- Next.js Route Handlers
- Server-side service layer
- TypeScript
- Zod validation

## Database

Supabase PostgreSQL.

Supabase should provide:

- PostgreSQL
- Authentication
- Database migrations
- Row Level Security
- Development database management

Sensitive workflow logic must NOT live in frontend Supabase calls.

## Payments

- Razorpay Test Mode
- Razorpay Subscriptions
- Razorpay Webhooks

## AI

Primary architecture:

```text
AI Provider Abstraction
        │
        ▼
NVIDIA NIM
        │
        ▼
Qwen or Llama Instruct Model
```

The model must be configurable through environment variables.

Do not tightly couple the application to a specific AI provider.

## Email

Resend.

## Scheduling

Vercel Cron.

## Hosting

Vercel.

---

# 5. Folder Structure

Implement the project with the following structure.

```text
recover-ai/
│
├── app/
│   │
│   ├── api/
│   │   │
│   │   ├── webhooks/
│   │   │   └── razorpay/
│   │   │       └── route.ts
│   │   │
│   │   ├── recovery/
│   │   │   ├── cases/
│   │   │   ├── actions/
│   │   │   └── simulate/
│   │   │
│   │   ├── cron/
│   │   │   └── process-actions/
│   │   │       └── route.ts
│   │   │
│   │   └── ai/
│   │       └── generate/
│   │
│   ├── dashboard/
│   │   ├── page.tsx
│   │   ├── cases/
│   │   ├── analytics/
│   │   └── exceptions/
│   │
│   ├── case/
│   │   └── [id]/
│   │       └── page.tsx
│   │
│   └── page.tsx
│
├── components/
│   ├── dashboard/
│   ├── recovery/
│   ├── analytics/
│   ├── audit/
│   └── ui/
│
├── lib/
│   │
│   ├── db/
│   │   ├── supabase-server.ts
│   │   └── queries.ts
│   │
│   ├── razorpay/
│   │   ├── client.ts
│   │   ├── verify-webhook.ts
│   │   ├── subscription-service.ts
│   │   └── payment-service.ts
│   │
│   ├── recovery/
│   │   ├── classifier.ts
│   │   ├── state-machine.ts
│   │   ├── strategy-engine.ts
│   │   ├── case-service.ts
│   │   └── outcome-tracker.ts
│   │
│   ├── policy/
│   │   ├── policy-engine.ts
│   │   ├── contact-policy.ts
│   │   ├── stopping-rules.ts
│   │   └── policy-config.ts
│   │
│   ├── actions/
│   │   ├── planner.ts
│   │   ├── executor.ts
│   │   ├── scheduler.ts
│   │   └── idempotency.ts
│   │
│   ├── ai/
│   │   ├── provider.ts
│   │   ├── nim-provider.ts
│   │   ├── prompts.ts
│   │   ├── recovery-message.ts
│   │   ├── decision-explanation.ts
│   │   └── exception-summary.ts
│   │
│   ├── audit/
│   │   └── logger.ts
│   │
│   └── validation/
│       └── schemas.ts
│
├── types/
│   ├── recovery.ts
│   ├── razorpay.ts
│   └── database.ts
│
├── tests/
│   ├── classifier.test.ts
│   ├── policy-engine.test.ts
│   ├── idempotency.test.ts
│   ├── stopping-rules.test.ts
│   └── recovery-flow.test.ts
│
├── supabase/
│   └── migrations/
│
├── scripts/
│   ├── seed-data.ts
│   └── simulate-batch.ts
│
├── public/
│
├── README.md
│
└── .env.example
```

---

# 6. Recovery Case State Machine

Every recovery case must follow an explicit state machine.

## Recovery Case Status

```text
NEW
CLASSIFIED
VERIFYING
POLICY_PENDING
BLOCKED
ACTION_PLANNED
WAITING
ACTION_EXECUTING
AWAITING_OUTCOME
RECOVERED
CUSTOMER_ACTION_REQUIRED
ESCALATED
STOPPED
EXPIRED
```

## State Flow

```text
NEW
 │
 ▼
CLASSIFIED
 │
 ▼
VERIFYING
 │
 ├── Already recovered ───────────────► RECOVERED
 │
 ├── Subscription cancelled ──────────► STOPPED
 │
 ▼
POLICY_PENDING
 │
 ├── Policy blocked ──────────────────► BLOCKED
 │
 └── Allowed
       │
       ▼
ACTION_PLANNED
       │
       ▼
WAITING
       │
       ▼
ACTION_EXECUTING
       │
       ├── Wait/Monitor ──────────────► AWAITING_OUTCOME
       │
       ├── Send Email ────────────────► AWAITING_OUTCOME
       │
       ├── Customer Action Required ──► CUSTOMER_ACTION_REQUIRED
       │
       └── Human Review ──────────────► ESCALATED
                                           
AWAITING_OUTCOME
       │
       ├── Payment succeeds ──────────► RECOVERED
       │
       ├── Retry/contact cap reached ─► STOPPED
       │
       └── Still unresolved ──────────► ACTION_PLANNED
```

Invalid state transitions must be rejected.

---

# 7. Database Schema

Use PostgreSQL with Supabase.

## 7.1 customers

```sql
create table customers (
  id uuid primary key default gen_random_uuid(),

  razorpay_customer_id text unique,

  email text,
  phone text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

## 7.2 customer_preferences

```sql
create table customer_preferences (
  id uuid primary key default gen_random_uuid(),

  customer_id uuid references customers(id),

  email_opt_out boolean default false,

  preferred_contact_channel text,

  quiet_hours_start time,
  quiet_hours_end time,

  max_contact_frequency_hours integer default 24,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

## 7.3 subscriptions

```sql
create table subscriptions (
  id uuid primary key default gen_random_uuid(),

  razorpay_subscription_id text unique not null,

  customer_id uuid references customers(id),

  plan_id text,

  amount numeric,

  currency text default 'INR',

  current_status text,

  latest_verified_status text,

  last_state_verified_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

Do NOT permanently hard-code AFA eligibility as a generated database column.

Compliance thresholds must be configurable through the policy engine.

---

## 7.4 webhook_events

This table is critical.

```sql
create table webhook_events (
  id uuid primary key default gen_random_uuid(),

  provider text default 'razorpay',

  provider_event_id text unique,

  event_type text not null,

  payload jsonb not null,

  signature_valid boolean,

  processing_status text default 'PENDING',

  processing_error text,

  received_at timestamptz default now(),

  processed_at timestamptz
);
```

Possible statuses:

```text
PENDING
PROCESSING
PROCESSED
FAILED
IGNORED
```

Webhook processing must be replayable.

---

## 7.5 payment_attempts

```sql
create table payment_attempts (
  id uuid primary key default gen_random_uuid(),

  razorpay_payment_id text,

  subscription_id uuid references subscriptions(id),

  failure_code text,

  failure_description text,

  failure_category text,

  amount numeric,

  attempt_number integer,

  occurred_at timestamptz,

  created_at timestamptz default now()
);
```

Failure categories:

```text
RETRYABLE
NEEDS_CUSTOMER_ACTION
TERMINAL
FRAUD_FLAGGED
UNKNOWN
```

---

## 7.6 recovery_cases

```sql
create table recovery_cases (
  id uuid primary key default gen_random_uuid(),

  subscription_id uuid references subscriptions(id),

  payment_attempt_id uuid references payment_attempts(id),

  customer_id uuid references customers(id),

  status text not null default 'NEW',

  failure_category text,

  recovery_strategy text,

  retry_count integer default 0,

  contact_attempt_count integer default 0,

  max_retries integer default 3,

  max_contact_attempts integer default 3,

  next_eligible_action_at timestamptz,

  attribution_window_hours integer default 72,

  opened_at timestamptz default now(),

  resolved_at timestamptz,

  stop_reason text,

  created_at timestamptz default now(),

  updated_at timestamptz default now()
);
```

---

## 7.7 recovery_actions

```sql
create table recovery_actions (
  id uuid primary key default gen_random_uuid(),

  recovery_case_id uuid references recovery_cases(id),

  action_type text not null,

  status text default 'PENDING',

  scheduled_for timestamptz,

  executed_at timestamptz,

  completed_at timestamptz,

  cancelled_at timestamptz,

  failed_at timestamptz,

  failure_reason text,

  blocked_reason text,

  idempotency_key text unique not null,

  metadata jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

Action statuses:

```text
PENDING
SCHEDULED
EXECUTING
COMPLETED
FAILED
CANCELLED
BLOCKED
```

---

## 7.8 recovery_outcomes

```sql
create table recovery_outcomes (
  id uuid primary key default gen_random_uuid(),

  recovery_case_id uuid references recovery_cases(id),

  outcome text not null,

  recovered_amount numeric,

  attribution_status text,

  attribution_reason text,

  recovered_at timestamptz,

  created_at timestamptz default now()
);
```

Outcomes:

```text
RECOVERED
NOT_RECOVERED
ESCALATED
STOPPED
EXPIRED
```

Attribution:

```text
AGENT_ATTRIBUTED
BASELINE_ATTRIBUTED
CUSTOMER_INDEPENDENT
UNKNOWN
```

---

## 7.9 audit_log

This table must be append-only.

```sql
create table audit_log (
  id uuid primary key default gen_random_uuid(),

  recovery_case_id uuid references recovery_cases(id),

  event_type text not null,

  actor text not null,

  previous_state text,

  new_state text,

  decision jsonb,

  reason text,

  metadata jsonb,

  created_at timestamptz default now()
);
```

The application must never update or delete audit log entries.

---

# 8. Webhook Processing

Implement:

```text
POST /api/webhooks/razorpay
```

## Required Flow

```text
Receive webhook
      ↓
Read raw request body
      ↓
Verify Razorpay signature
      ↓
Reject invalid signature
      ↓
Extract provider event ID
      ↓
Check webhook_events
      │
      ├── Already processed → return success safely
      │
      └── New event
              ↓
       Store raw event
              ↓
       Begin processing
              ↓
       Update subscription/payment state
              ↓
       Create or update recovery case
              ↓
       Write audit event
              ↓
       Mark webhook processed
```

Webhook processing must be idempotent.

A duplicate Razorpay webhook must never create:

- Duplicate payment attempts
- Duplicate recovery cases
- Duplicate emails
- Duplicate actions

---

# 9. Failure Classification Engine

The classifier must be deterministic.

Do NOT use an LLM.

## Interface

```ts
type FailureCategory =
  | "RETRYABLE"
  | "NEEDS_CUSTOMER_ACTION"
  | "TERMINAL"
  | "FRAUD_FLAGGED"
  | "UNKNOWN";
```

## Example Mapping

```text
Insufficient funds
→ RETRYABLE

Temporary bank issue
→ RETRYABLE

Gateway timeout
→ RETRYABLE

Expired payment method
→ NEEDS_CUSTOMER_ACTION

Mandate issue
→ NEEDS_CUSTOMER_ACTION

Subscription cancelled
→ TERMINAL

Fraud/security flag
→ FRAUD_FLAGGED
```

All mappings must be configurable.

Do not scatter failure mappings across the codebase.

Use a centralized configuration.

---

# 10. State Verification

Before EVERY recovery action:

```text
Fetch/check latest known Razorpay subscription state
```

Then:

```text
IF payment already recovered
    Cancel pending actions
    Mark case RECOVERED

IF subscription cancelled
    Stop recovery

IF subscription halted
    Do not continue automatic retry assumptions
    Select allowed escalation strategy

IF subscription remains pending
    Continue according to policy
```

Never execute an action based only on stale database data.

---

# 11. Policy and Safety Engine

The policy engine is deterministic.

## Input

```ts
type PolicyInput = {
  caseId: string;

  subscriptionStatus: string;

  failureCategory: string;

  amount: number;

  retryCount: number;

  contactAttemptCount: number;

  customerOptedOut: boolean;

  quietHoursActive: boolean;

  lastContactAt?: Date;

  allowedRecoveryWindow: boolean;
};
```

## Output

```ts
type PolicyDecision = {
  allowed: boolean;

  decision:
    | "ALLOW"
    | "BLOCK"
    | "ESCALATE"
    | "STOP";

  allowedActions: string[];

  blockedReasons: string[];

  earliestExecutionTime?: Date;

  retryCapRemaining: number;

  contactCapRemaining: number;
};
```

## Policy Rules

### Rule 1

If customer opted out:

```text
BLOCK all customer contact.
STOP recovery communication.
```

### Rule 2

If maximum recovery attempts reached:

```text
STOP recovery.
```

### Rule 3

If maximum contact attempts reached:

```text
STOP additional contact.
```

### Rule 4

If fraud flagged:

```text
Never automatically execute recovery.
ESCALATE_TO_HUMAN.
```

### Rule 5

If within quiet hours:

```text
Delay communication.
Set next_eligible_action_at.
```

### Rule 6

If payment already recovered:

```text
Cancel all pending actions.
```

### Rule 7

If the action would involve a debit:

```text
Require explicit policy evaluation for applicable
pre-debit notification and authentication requirements.
```

The implementation must make compliance thresholds configurable through policy configuration.

Do not hard-code legal assumptions throughout the code.

---

# 12. Contact Policy Engine

This is a differentiating feature.

Before contacting the customer:

```text
Has the agent contacted recently?
        │
        ▼
Has customer opted out?
        │
        ▼
Are quiet hours active?
        │
        ▼
Has maximum contact count been reached?
        │
        ▼
Would this message provide new information?
        │
        ▼
Is the payment already recovered?
```

If the answer is negative at any stage:

```text
DO NOT SEND MESSAGE
```

Instead:

```text
WAIT
STOP
or ESCALATE
```

---

# 13. Recovery Strategy Engine

The strategy engine selects the recovery approach.

Possible strategies:

```text
WAIT_AND_MONITOR

SEND_RECOVERY_MESSAGE

REQUEST_PAYMENT_METHOD_UPDATE

SEND_RECOVERY_LINK

CUSTOMER_ACTION_REQUIRED

ESCALATE_TO_HUMAN

STOP_RECOVERY
```

## Example Strategy Logic

### Insufficient Funds

```text
Failure:
Insufficient funds

Strategy:
WAIT_AND_MONITOR

Optional:
Send reminder if contact policy allows
```

### Temporary Failure

```text
Failure:
Temporary bank/gateway failure

Strategy:
WAIT_AND_MONITOR

Avoid unnecessary customer contact.
```

### Payment Method Problem

```text
Failure:
Expired/invalid payment method

Strategy:
REQUEST_PAYMENT_METHOD_UPDATE
```

### Fraud

```text
Failure:
Fraud flagged

Strategy:
ESCALATE_TO_HUMAN
```

### Terminal

```text
Failure:
Subscription cancelled

Strategy:
STOP_RECOVERY
```

---

# 14. AI Layer

The AI layer must never directly control payment or compliance actions.

## AI Responsibilities

AI may:

- Recommend one action from already allowed actions
- Generate personalized recovery messages
- Generate Hinglish messages
- Explain deterministic decisions
- Summarize unresolved cases

AI may NOT:

- Classify fraud
- Override policy decisions
- Override opt-outs
- Change retry caps
- Initiate an unapproved payment action
- Decide legal compliance
- Invent recovery strategies outside the allowed list

---

# 15. AI Provider Abstraction

Create:

```ts
export interface AIProvider {
  generateText(input: {
    systemPrompt: string;
    userPrompt: string;
  }): Promise<string>;
}
```

Create NVIDIA NIM implementation.

The application should support future providers without changing business logic.

```text
AIProvider
    │
    ├── NVIDIA NIM
    │
    └── Future Provider
```

---

# 16. AI Recovery Recommendation

The AI receives:

```json
{
  "failure_category": "RETRYABLE",
  "subscription_status": "pending",
  "retry_count": 1,
  "contact_attempt_count": 0,
  "allowed_actions": [
    "WAIT_AND_MONITOR",
    "SEND_RECOVERY_MESSAGE"
  ]
}
```

The AI can return:

```json
{
  "recommended_action": "WAIT_AND_MONITOR",
  "confidence": 0.82,
  "reasoning_summary": "A retryable temporary failure with no additional customer action required."
}
```

The backend MUST validate:

```text
Is recommended_action in allowed_actions?

YES
→ Continue

NO
→ Reject recommendation
→ Use deterministic fallback
```

---

# 17. AI Message Generation

Input:

```json
{
  "customer_name": "Rahul",
  "failure_context": "payment could not be completed",
  "allowed_message_type": "RECOVERY_REMINDER",
  "tone": "friendly",
  "language": "HINGLISH"
}
```

The AI must generate only the message.

Prompt restrictions:

```text
Do not invent discounts.
Do not invent deadlines.
Do not promise payment success.
Do not claim a payment was successful.
Do not request sensitive financial information.
Do not change the allowed action.
```

---

# 18. Action Executor

Every action must use an idempotency key.

## Execution Flow

```text
Action scheduled
      ↓
Fetch action
      ↓
Acquire execution lock
      ↓
Check action status
      │
      ├── Already completed → STOP
      │
      └── Pending
              ↓
       Verify recovery case
              ↓
       Verify latest subscription state
              ↓
       Run policy engine again
              ↓
       Mark EXECUTING
              ↓
       Execute action
              ↓
       Mark COMPLETED / FAILED
              ↓
       Write audit log
```

The action must never execute twice.

---

# 19. Scheduler

Use Vercel Cron.

Cron endpoint:

```text
/api/cron/process-actions
```

Query:

```text
Find recovery actions where:

status = SCHEDULED
AND scheduled_for <= NOW()
```

Before execution, verify:

```text
Recovery case not recovered
Subscription state still eligible
Customer has not opted out
Retry/contact limits not exceeded
Action is not already executing/completed
```

---

# 20. Outcome Tracking

Recovery is not complete until the system observes the actual outcome.

## Recovery Signals

Possible signals:

```text
subscription.charged
subscription.activated
payment success event
```

When success occurs:

```text
Mark recovery case RECOVERED
Cancel pending actions
Calculate recovered amount
Calculate attribution
Write audit event
```

---

# 21. Attribution Rules

Default attribution window:

```text
72 hours
```

A payment is considered agent-attributed if:

```text
Payment succeeds
within attribution_window_hours
after a valid agent intervention
```

Example:

```text
Agent sends recovery message
        ↓
Customer updates payment method
        ↓
Subscription successfully charged
within 72 hours
        ↓
AGENT_ATTRIBUTED
```

If payment occurs without a qualifying intervention:

```text
CUSTOMER_INDEPENDENT
```

All attribution rules must be visible in the dashboard.

---

# 22. Baseline Comparison

Define a deterministic baseline.

## Naive Baseline

```text
Retry/contact once every 24 hours
Maximum 3 attempts
No failure-specific strategy
No contact fatigue protection
No AI recommendation
No personalization
```

## RecoverAI

```text
Failure diagnosis
+
State verification
+
Policy enforcement
+
Contact fatigue prevention
+
Strategy selection
+
AI bounded recommendation
+
Personalized communication
+
Stopping rules
```

## Metrics

Calculate:

```text
Total Revenue At Risk

Recovered Revenue

Recovery Rate

Baseline Recovery Rate

Incremental Revenue Recovered

Average Actions Per Recovered Case

Attempt Efficiency

Contact Reduction

Cases Safely Stopped

Fraud Cases Escalated

Customer Action Conversion Rate
```

Formula:

```text
Recovery Rate =
Recovered Revenue / Revenue At Risk
```

```text
Attempt Efficiency =
Recovered Revenue / Number of Recovery Actions
```

```text
Incremental Recovery =
Agent Recovered Revenue
-
Baseline Recovered Revenue
```

---

# 23. Dashboard

The dashboard must immediately demonstrate batch-level value.

## Header Metrics

```text
₹ Revenue At Risk

₹ Revenue Recovered

Recovery Rate

Incremental Recovery vs Baseline

Cases Safely Stopped

Human Escalations
```

---

## Recovery Funnel

```text
100 Cases Detected
        ↓
72 Eligible
        ↓
18 Blocked / Stopped
        ↓
12 Customer Action Required
        ↓
42 Recovery Interventions
        ↓
28 Recovered
```

---

## Agent vs Baseline Chart

Show:

```text
Baseline

vs

RecoverAI
```

Metrics:

- Revenue recovered
- Recovery rate
- Number of actions
- Contact attempts

---

## Recovery Case Queue

Columns:

```text
Customer
Subscription
Amount at Risk
Failure Category
Current Status
Recovery Strategy
Next Action
Last Updated
```

Filters:

```text
All
Active
Recovered
Blocked
Escalated
Stopped
Fraud
Needs Customer Action
```

---

# 24. Individual Case Page

Every case should be understandable without reading code.

## Sections

### Case Summary

```text
Revenue at Risk
Failure Category
Current Status
Strategy
Next Action
```

### Why This Decision?

Example:

```text
Payment failed due to insufficient funds.

The subscription remains pending.

The policy engine allows monitoring.

The customer has not been contacted recently.

The agent selected WAIT_AND_MONITOR to avoid
unnecessary contact.
```

This explanation may be generated from deterministic decision data.

### Timeline

```text
10:01 — Payment failure detected

10:01 — Webhook verified

10:02 — Recovery case created

10:02 — Failure classified as RETRYABLE

10:02 — Latest state verified

10:03 — Policy engine allowed WAIT_AND_MONITOR

10:03 — AI recommendation generated

10:04 — Action scheduled

Next Day — Subscription charged

Next Day — ₹999 recovered

Next Day — Pending actions cancelled
```

### Audit Log

Render all events chronologically.

---

# 25. Synthetic Dataset

Create 100–150 synthetic recovery cases.

Distribution:

```text
40 — Insufficient funds

15 — Temporary bank/gateway failure

15 — Payment method problems

10 — Customer action required

10 — Fraud flagged

5 — Terminal/cancelled

5 — Duplicate webhook cases
```

Add special edge cases:

```text
Payment recovered before scheduled action

Customer opts out after action scheduled

Duplicate webhook arrives multiple times

Action executes while another process attempts execution

Subscription cancelled during recovery

Recovery succeeds independently

Retry/contact cap reached

Quiet hours delay an action
```

The seed script must be repeatable.

---

# 26. Simulation Mode

Implement a batch simulation.

Button:

```text
RUN RECOVERY SIMULATION
```

The simulation should process cases through the entire pipeline.

Example output:

```text
100 Cases Detected

₹12,50,000 Revenue At Risk

72 Cases Eligible

18 Cases Blocked Safely

10 Human Escalations

42 Recovery Interventions

₹7,20,000 Recovered

57.6% Recovery Rate

Baseline Recovery Rate: 43.2%

Incremental Recovery: ₹1,80,000
```

The numbers must be generated from the actual simulation logic.

Do not hard-code dashboard metrics.

---

# 27. Audit Events

Supported audit events:

```text
WEBHOOK_RECEIVED

WEBHOOK_DUPLICATE_IGNORED

WEBHOOK_SIGNATURE_VERIFIED

PAYMENT_FAILURE_DETECTED

CASE_CREATED

STATE_VERIFIED

FAILURE_CLASSIFIED

POLICY_EVALUATED

ACTION_BLOCKED

ACTION_PLANNED

ACTION_SCHEDULED

ACTION_EXECUTING

ACTION_COMPLETED

ACTION_FAILED

CUSTOMER_CONTACTED

CUSTOMER_OPTED_OUT

SUBSCRIPTION_RECOVERED

PENDING_ACTION_CANCELLED

CASE_ESCALATED

CASE_STOPPED
```

---

# 28. Required API Routes

Implement:

```text
POST /api/webhooks/razorpay

GET /api/recovery/cases

GET /api/recovery/cases/:id

POST /api/recovery/cases/:id/action

POST /api/recovery/simulate

GET /api/recovery/analytics

POST /api/cron/process-actions

POST /api/ai/generate
```

Every input must be validated with Zod.

---

# 29. Security Rules

Never expose:

```text
RAZORPAY_KEY_SECRET

RAZORPAY_WEBHOOK_SECRET

SUPABASE_SERVICE_ROLE_KEY

RESEND_API_KEY

NVIDIA_API_KEY
```

All secrets remain server-side.

Do not allow the frontend to:

- Execute recovery actions directly
- Modify audit logs
- Change recovery states directly
- Bypass policy checks

All sensitive actions must pass through server-side services.

---

# 30. Testing Requirements

Create automated tests.

## Failure Classification

Test every supported failure mapping.

## Policy Engine

Test:

```text
Customer opt-out

Retry cap

Contact cap

Quiet hours

Fraud escalation

Already recovered payment

Cancelled subscription
```

## Idempotency

Test:

```text
Duplicate webhook

Duplicate action execution

Repeated cron execution
```

## Recovery Flow

Test:

```text
Failure
→ Case creation
→ Classification
→ Policy
→ Action
→ Recovery
```

## Critical Test

This scenario must always pass:

```text
Action scheduled

Customer pays independently

Razorpay sends success webhook

Recovery case becomes RECOVERED

Scheduled action is cancelled

Cron runs

NO additional action is executed
```

---

# 31. Environment Variables

Create `.env.example`.

```env
NEXT_PUBLIC_SUPABASE_URL=

NEXT_PUBLIC_SUPABASE_ANON_KEY=

SUPABASE_SERVICE_ROLE_KEY=

RAZORPAY_KEY_ID=

RAZORPAY_KEY_SECRET=

RAZORPAY_WEBHOOK_SECRET=

RESEND_API_KEY=

RESEND_FROM_EMAIL=

NVIDIA_API_KEY=

NVIDIA_BASE_URL=

AI_MODEL=

CRON_SECRET=

NEXT_PUBLIC_APP_URL=
```

---

# 32. Implementation Plan

## Phase 1 — Foundation

Goal:

```text
Next.js app running
Supabase connected
Database schema migrated
Dashboard skeleton visible
```

Do not build AI yet.

---

## Phase 2 — Recovery Domain

Implement:

```text
Recovery types

State machine

Failure classifier

Case service

Audit logger
```

Write tests before moving on.

---

## Phase 3 — Razorpay Integration

Implement:

```text
Webhook endpoint

Signature validation

Webhook storage

Idempotency

Subscription state updates
```

Test duplicate webhooks.

---

## Phase 4 — Policy Engine

Implement:

```text
Opt-out

Contact caps

Retry caps

Quiet hours

Fraud escalation

Stopping rules
```

This is a critical project feature.

---

## Phase 5 — Recovery Strategy

Implement:

```text
WAIT_AND_MONITOR

SEND_RECOVERY_MESSAGE

REQUEST_PAYMENT_METHOD_UPDATE

SEND_RECOVERY_LINK

ESCALATE_TO_HUMAN

STOP_RECOVERY
```

---

## Phase 6 — Action Execution

Implement:

```text
Action planner

Scheduler

Execution locks

Idempotency

Cancellation
```

---

## Phase 7 — Email Integration

Implement Resend.

Support:

```text
Normal English message

Personalized message

Hinglish message
```

Email sending must be recorded in the audit log.

---

## Phase 8 — AI Layer

Implement:

```text
AI provider abstraction

NVIDIA NIM provider

Bounded recommendation

Message generation

Decision explanation

Exception summary
```

AI output must always be validated.

---

## Phase 9 — Simulation

Create:

```text
100–150 synthetic cases

Batch processor

Baseline simulator

Agent simulator

Analytics generator
```

---

## Phase 10 — Dashboard

Build:

```text
Metrics

Recovery funnel

Baseline comparison

Case queue

Case detail page

Audit timeline

Exception queue
```

---

# 33. What NOT to Build

Do not waste time building:

```text
Separate microservices

Redis

Kafka

BullMQ

Complex agent frameworks

LangChain unless absolutely required

Multi-agent systems

Custom ML training

Local LLM inference

Multiple AI providers

SMS integration

WhatsApp integration

Complex customer authentication

Advanced role management
```

The goal is:

> **A complete working recovery loop, not the largest architecture diagram.**

---

# 34. Demo Cases

The final demo must show these four cases.

## Case 1 — Smart Recovery

```text
Payment fails

↓
Detected

↓
Classified as RETRYABLE

↓
State verified

↓
Policy allows monitoring

↓
Agent chooses WAIT_AND_MONITOR

↓
Razorpay outcome succeeds

↓
Revenue recovered

↓
Metrics updated
```

---

## Case 2 — Fraud

```text
Failure flagged as FRAUD

↓
Policy blocks automatic action

↓
Case escalated

↓
Audit trail records reason
```

---

## Case 3 — Customer Protection

```text
Action scheduled

↓
Customer opts out

↓
Pending action cancelled

↓
No additional communication
```

---

## Case 4 — Idempotency

```text
Same webhook arrives multiple times

↓
Only one webhook processed

↓
Only one payment attempt

↓
Only one recovery case

↓
No duplicate action
```

---

# 35. Definition of Done

The project is complete only when all of the following are true.

```text
[ ] Real Razorpay webhook endpoint works

[ ] Webhook signature validation works

[ ] Duplicate webhooks do not duplicate cases

[ ] Failure classification is deterministic

[ ] Recovery state machine rejects invalid transitions

[ ] Every action passes through the policy engine

[ ] Fraud cases never auto-execute

[ ] Opt-out immediately stops customer contact

[ ] Scheduled actions verify current state before execution

[ ] Recovered payments cancel pending actions

[ ] Actions are idempotent

[ ] Every important decision creates an audit event

[ ] AI cannot execute an action outside allowed options

[ ] At least one real email is sent using Resend

[ ] Batch simulation processes at least 100 cases

[ ] Metrics are generated from real database data

[ ] Agent vs baseline comparison works

[ ] Individual case timeline works

[ ] Dashboard shows recovered revenue

[ ] Exception queue works

[ ] Tests cover critical edge cases

[ ] Application deploys successfully on Vercel

[ ] README explains architecture and setup

[ ] Demo can be completed within 5 minutes
```

---

# 36. README Requirements

The README must include:

```text
Problem

Solution

Architecture diagram

Tech stack

How Razorpay is integrated

How the recovery agent works

AI boundaries

Database design

State machine

Policy engine

How to run locally

Environment variables

How to configure webhooks

How to run simulation

How metrics are calculated

Known limitations

Demo flow
```

---

# 37. Final Antigravity Instructions

You are implementing a production-style hackathon application called RecoverAI.

Follow these rules:

1. Do not change the core architecture.
2. Build the application phase by phase.
3. Do not skip the deterministic policy engine.
4. Do not let the AI directly execute financial or compliance actions.
5. Do not replace Razorpay's subscription lifecycle.
6. Treat Razorpay as the payment system of record.
7. Verify subscription state before executing every recovery action.
8. Make webhook ingestion idempotent.
9. Make action execution idempotent.
10. Maintain an append-only audit log.
11. Use Supabase only as infrastructure and database.
12. Keep sensitive recovery logic server-side.
13. Use TypeScript throughout.
14. Validate API inputs using Zod.
15. Add tests for all critical business rules.
16. Do not implement unnecessary microservices.
17. Do not build features listed in "What NOT to Build" unless explicitly requested.
18. Prioritize a complete end-to-end recovery loop over additional features.
19. Do not hard-code demo metrics.
20. Keep the UI professional, fintech-focused, and easy to understand.

The final application must demonstrate:

```text
DETECT
↓
DIAGNOSE
↓
VERIFY
↓
DECIDE
↓
ACT
↓
OBSERVE
↓
MEASURE
↓
STOP OR ESCALATE
```

The most important outcome is not the number of features.

The most important outcome is proving:

> **RecoverAI can intelligently recover subscription revenue across a batch while respecting safety boundaries, avoiding duplicate actions, protecting customers from unnecessary contact, and providing a complete audit trail.**