import { json } from '../_shared/cors.ts';
import { processWebhook, type StravaWebhookPayload } from '../_shared/strava.ts';

const verifyToken = Deno.env.get('STRAVA_VERIFY_TOKEN');
if (!verifyToken) throw new Error('STRAVA_VERIFY_TOKEN is required.');

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === verifyToken && challenge) return json({ 'hub.challenge': challenge });
    return json({ error: 'Webhook verification failed.' }, 403);
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const payload = await req.json().catch(() => null) as StravaWebhookPayload | null;
  if (!payload?.object_type || !payload.aspect_type || !payload.owner_id || !payload.event_time) {
    return json({ error: 'Malformed webhook payload.' }, 400);
  }
  const expectedSubscriptionId = Number(Deno.env.get('STRAVA_SUBSCRIPTION_ID'));
  if (!Number.isFinite(expectedSubscriptionId)) return json({ error: 'Webhook subscription is not configured.' }, 503);
  if (payload.subscription_id !== expectedSubscriptionId) return json({ error: 'Unexpected webhook subscription.' }, 403);
  if (Math.abs(Date.now() / 1000 - payload.event_time) > 7 * 86_400) return json({ error: 'Webhook event is outside the accepted time window.' }, 400);

  // Strava expects a fast acknowledgement. Durable processing continues in the Edge Runtime.
  EdgeRuntime.waitUntil(processWebhook(payload).catch((error) => console.error('Strava webhook processing failed', error)));
  return json({ received: true });
});
