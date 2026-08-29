# RecoverAI — Phase 11 Production Deployment & Hardening Guide

## 1. Overview
RecoverAI is an autonomous, policy-bounded AI revenue recovery orchestrator for subscription billing. This document provides complete instructions for deploying RecoverAI to production on Vercel with Supabase, Razorpay, Resend, and NVIDIA NIM.

---

## 2. Environment Variables Reference

Configure the following environment variables in your production environment (e.g. Vercel Dashboard):

| Variable Name | Environment | Description |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Public | Production application URL (e.g. `https://app.recoverai.com`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase publishable/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-Only | Supabase service role secret key |
| `RAZORPAY_KEY_ID` | Server-Only | Razorpay Key ID |
| `RAZORPAY_KEY_SECRET` | Server-Only | Razorpay Secret Key |
| `RAZORPAY_WEBHOOK_SECRET` | Server-Only | Secret for HMAC signature verification of webhooks |
| `RESEND_API_KEY` | Server-Only | Resend Email API key |
| `RESEND_FROM_EMAIL` | Server-Only | Verified sender email address |
| `NVIDIA_API_KEY` | Server-Only | NVIDIA NIM API Key |
| `NVIDIA_BASE_URL` | Server-Only | NVIDIA API Base Endpoint (default: `https://integrate.api.nvidia.com/v1`) |
| `AI_MODEL` | Server-Only | LLM Model Name (default: `meta/llama-3.1-70b-instruct`) |
| `CRON_SECRET` | Server-Only | Secret token for Vercel Cron authentication |
| `RECOVERY_CRON_BATCH_SIZE` | Server-Only | Maximum recovery actions processed per cron run (default: `20`) |
| `ENABLE_DEMO_SIMULATION` | Server-Only | Set to `false` in production to disable public simulation trigger |

---

## 3. Vercel Cron Setup & Scheduled Recovery Processing

RecoverAI automatically processes due recovery actions via Vercel Cron.

1. **Cron Endpoint:** `GET /api/cron/recovery`
2. **Schedule:** Defined in `vercel.json` (`0 * * * *` — hourly execution).
3. **Authentication:** The worker verifies the request header:
   ```text
   Authorization: Bearer <CRON_SECRET>
   ```
4. **Batch Processing:** Processes up to `RECOVERY_CRON_BATCH_SIZE` due actions per run using atomic locking (`WHERE status IN ('PENDING', 'SCHEDULED')`), preventing race conditions.

---

## 4. Razorpay Webhook Integration Setup

1. In Razorpay Dashboard, navigate to **Settings > Webhooks > Add New Webhook**.
2. **Webhook URL:** `https://<your-domain>/api/webhooks/razorpay`
3. **Secret:** Set a strong random secret string matching `RAZORPAY_WEBHOOK_SECRET`.
4. **Subscribed Events:**
   - `payment.failed`
   - `subscription.charged`
   - `subscription.halted`
   - `subscription.cancelled`
5. RecoverAI calculates raw body HMAC-SHA256 signatures for every incoming request and rejects unauthorized payloads before touching the database.

---

## 5. Security Checklist & Safeguards

- [x] **Server-Only Credentials:** All API keys (`RAZORPAY_KEY_SECRET`, `RESEND_API_KEY`, `NVIDIA_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are protected with `typeof window !== 'undefined'` guards.
- [x] **Bounded AI Protection:** AI is advisory only. Recommended actions are strictly validated against `allowedActions` returned by the Policy Engine.
- [x] **Deterministic Policy Authority:** Opt-out, quiet hours, contact caps (3), retry limits, and fraud auto-execution blocks are enforced deterministically.
- [x] **Production Simulation Safety:** Simulation endpoint (`/api/recovery/simulate`) is disabled in production mode.
- [x] **Security Headers Configured:** HTTP response headers (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy`) configured in `next.config.ts`.
- [x] **Audit Trail Integrity:** All state transitions and recovery decisions append immutable logs to `audit_log`.

---

## 6. Vercel Deployment Instructions

1. Push code to your Git repository (GitHub/GitLab).
2. Import project into Vercel Dashboard.
3. Configure environment variables in **Project Settings > Environment Variables**.
4. Deploy project.
5. Verify build status and test Cron trigger via Vercel Dashboard.

---

## 7. Troubleshooting & Rollback Procedures

- **Cron Worker Authorization Error (401):** Verify `CRON_SECRET` matches Vercel environment setting.
- **Razorpay Signature Rejection (400):** Verify `RAZORPAY_WEBHOOK_SECRET` exactly matches Razorpay dashboard setting.
- **Rollback:** In Vercel Dashboard, select previous successful deployment under **Deployments** and click **Promote to Production**.
