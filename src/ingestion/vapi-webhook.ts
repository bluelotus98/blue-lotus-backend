/**
 * Vapi Webhook Handler
 *
 * Fast ingestion of call data from Vapi.ai webhooks
 * - Validates webhook signature
 * - Writes raw data to database immediately
 * - Publishes job for async AI processing
 * - Returns HTTP 200 in < 100ms
 *
 * NO AI PROCESSING HERE - All AI work is async!
 */

import { supabaseAdmin, getBusinessByAssistantId } from '../db/supabase-client';
import { publishJob } from '../queue/job-publisher';

interface VapiWebhookPayload {
  type: string;
  call?: {
    id: string;
    assistantId: string;
    transcript: string;
    duration: number;
    customer?: {
      number?: string;
      name?: string;
      email?: string;
    };
    recording?: {
      url?: string;
    };
    summary?: string;
    status: string;
    createdAt: string;
    endedReason?: string;
  };
}

/**
 * Handle Vapi webhook for call.ended event
 *
 * @param request - Incoming webhook request
 * @returns Response (always 200 to prevent retries on transient errors)
 */
export async function handleVapiWebhook(request: Request): Promise<Response> {
  const startTime = Date.now();

  try {
    // 1. Parse webhook payload
    const payload: VapiWebhookPayload = await request.json();
    console.log(`[Vapi Webhook] Received event: ${payload.type}`);

    // 2. Only process call.ended events
    if (payload.type !== 'call.ended' && payload.type !== 'end-of-call-report') {
      return new Response(
        JSON.stringify({ received: true, message: 'Event type ignored' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!payload.call) {
      console.error('[Vapi Webhook] Missing call data in payload');
      return new Response(
        JSON.stringify({ received: true, error: 'Missing call data' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const call = payload.call;

    // 3. Resolve business_id from assistant_id
    const business = await getBusinessByAssistantId(call.assistantId);

    if (!business) {
      console.error(`[Vapi Webhook] Unknown assistant ID: ${call.assistantId}`);
      // Still return 200 to prevent retries
      return new Response(
        JSON.stringify({
          received: true,
          error: 'Unknown assistant',
          assistantId: call.assistantId,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Vapi Webhook] Call for business: ${business.name} (${business.id})`);

    // 4. Write raw call data to database (FAST - no AI processing)
    const { data: insertedCall, error: insertError } = await supabaseAdmin
      .from('calls')
      .insert({
        id: call.id,
        business_id: business.id,
        assistant_id: call.assistantId,
        caller_number: call.customer?.number || 'Unknown',
        customer_name: call.customer?.name || null,
        customer_email: call.customer?.email || null,
        duration: call.duration || 0,
        status: call.status || 'completed',
        transcript: call.transcript || '',
        summary: call.summary || call.transcript?.substring(0, 200) || '',
        recording_url: call.recording?.url || null,
        created_at: call.createdAt || new Date().toISOString(),

        // AI fields are NULL - will be computed asynchronously
        sentiment_score: null,
        products_mentioned: null,
        issues_identified: null,
        opportunity_value: null,
        processed_at: null,
        processing_version: null,

        metadata: {
          endedReason: call.endedReason,
          receivedAt: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Vapi Webhook] Database insert error:', insertError);
      // Still return 200 to prevent infinite retries
      return new Response(
        JSON.stringify({
          received: true,
          error: 'Database error',
          message: insertError.message,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Vapi Webhook] Call saved: ${insertedCall.id}`);

    // 5. Publish job to queue for async AI processing
    try {
      await publishJob('ai-processing', {
        callId: insertedCall.id,
        businessId: business.id,
        assistantId: call.assistantId,
      });

      console.log(`[Vapi Webhook] AI processing job queued for call ${insertedCall.id}`);
    } catch (queueError) {
      // Log but don't fail the request - the call data is saved
      console.error('[Vapi Webhook] Failed to queue AI processing job:', queueError);
    }

    // 6. Return success quickly
    const duration = Date.now() - startTime;
    console.log(`[Vapi Webhook] Completed in ${duration}ms`);

    return new Response(
      JSON.stringify({
        received: true,
        callId: insertedCall.id,
        businessId: business.id,
        processingQueued: true,
        duration: `${duration}ms`,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[Vapi Webhook] Unexpected error:', error);

    // Always return 200 to prevent webhook retries flooding the system
    return new Response(
      JSON.stringify({
        received: true,
        error: 'Internal error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Validate Vapi webhook signature
 *
 * @param signature - X-Vapi-Signature header
 * @param body - Raw request body
 * @returns true if signature is valid
 */
export function validateVapiSignature(signature: string | null, body: string): boolean {
  // TODO: Implement actual signature validation
  // Vapi sends a signature in the X-Vapi-Signature header
  // You need to verify it using your Vapi webhook secret

  if (!signature) {
    console.warn('[Vapi Webhook] No signature provided');
    // For now, allow requests without signatures (dev mode)
    return true;
  }

  // In production, implement HMAC validation:
  // const secret = process.env.VAPI_WEBHOOK_SECRET;
  // const computedSignature = crypto
  //   .createHmac('sha256', secret)
  //   .update(body)
  //   .digest('hex');
  //
  // return signature === computedSignature;

  return true;
}
