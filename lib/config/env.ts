import { z } from 'zod';

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/config/env.ts is server-only and cannot be imported into browser code.'
  );
}

const ServerEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url()
    .default('https://app.recoverai.com'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1).default('https://placeholder.supabase.co'),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).default('placeholder-key'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_BASE_URL: z
    .string()
    .default('https://integrate.api.nvidia.com/v1'),
  AI_MODEL: z.string().default('meta/llama-3.1-70b-instruct'),
  CRON_SECRET: z.string().optional(),
  RECOVERY_CRON_BATCH_SIZE: z.coerce.number().positive().default(20),
  ENABLE_DEMO_SIMULATION: z.coerce.boolean().default(false),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/**
 * Validates and parses server-side environment variables safely.
 * Throws clean sanitized errors without exposing secret contents.
 */
export function validateServerEnv(): ServerEnv {
  const result = ServerEnvSchema.safeParse(process.env);

  if (!result.success) {
    const errorIssues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Environment variable validation failed: ${errorIssues}`);
  }

  return result.data;
}
