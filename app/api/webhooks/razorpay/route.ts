import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/razorpay/verify-webhook';
import {
  processStoredWebhookEvent,
  storeWebhookEvent,
} from '@/lib/razorpay/webhook-service';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Ingests, stores, and processes incoming Razorpay webhooks.
 * Enforces raw body signature verification before JSON parsing.
 * Extracts provider_event_id and enforces idempotency via webhook_events unique constraint.
 */
export async function processWebhookRequest(
  request: Request,
  customSupabaseClient?: SupabaseClient
) {
  try {
    const signature = request.headers.get('x-razorpay-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing webhook signature header' },
        { status: 400 }
      );
    }

    const rawBody = await request.text();

    const isValid = verifyWebhookSignature({
      rawBody,
      signature,
    });

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 400 }
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json(
        { error: 'Payload must be a JSON object' },
        { status: 400 }
      );
    }

    const providerEventId =
      (typeof payload.event_id === 'string' && payload.event_id.trim()) ||
      (typeof payload.id === 'string' && payload.id.trim()) ||
      null;

    if (!providerEventId) {
      return NextResponse.json(
        { error: 'Missing provider event ID' },
        { status: 400 }
      );
    }

    const event = typeof payload.event === 'string' ? payload.event : 'unknown';

    const storeResult = await storeWebhookEvent(
      {
        providerEventId,
        eventType: event,
        payload,
      },
      customSupabaseClient
    );

    if (storeResult.duplicate) {
      return NextResponse.json(
        {
          status: 'ok',
          received: true,
          duplicate: true,
          event,
          message: 'Duplicate event ignored',
        },
        { status: 200 }
      );
    }

    if (storeResult.eventId) {
      await processStoredWebhookEvent(
        storeResult.eventId,
        payload,
        customSupabaseClient
      );
    }

    return NextResponse.json(
      {
        status: 'ok',
        received: true,
        duplicate: false,
        eventId: storeResult.eventId,
        event,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return processWebhookRequest(request);
}
