import { admin } from '../_shared/supabase.ts';
import { syncActivities } from '../_shared/strava.ts';

const clientId = Deno.env.get('STRAVA_CLIENT_ID');
const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');
if (!clientId || !clientSecret) throw new Error('STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET are required.');

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const denied = url.searchParams.get('error');
  if (!state) return new Response('Missing OAuth state.', { status: 400 });

  const { data: stateRow, error: stateError } = await admin.from('strava_oauth_states')
    .select('*').eq('state', state).is('consumed_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (stateError || !stateRow) return new Response('OAuth state is invalid or expired.', { status: 400 });
  const returnUrl = new URL(stateRow.return_url as string);

  if (denied || !code) {
    await consumeState(state);
    return redirect(returnUrl, { strava: 'cancelled' });
  }

  try {
    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code' }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.athlete?.id || !payload.access_token || !payload.refresh_token) {
      throw new Error(`Token exchange failed: ${JSON.stringify(payload)}`);
    }
    const now = new Date().toISOString();
    const scope = parseScope(url.searchParams.get('scope') ?? payload.scope ?? 'read,activity:read_all');
    if (!scope.includes('activity:read_all')) throw new Error('Strava did not grant activity:read_all.');
    const userId = stateRow.user_id as string;
    const athleteId = Number(payload.athlete.id);
    const { data: previousConnection } = await admin.from('strava_connections').select('athlete_id').eq('user_id', userId).maybeSingle();
    if (previousConnection && Number(previousConnection.athlete_id) !== athleteId) {
      await admin.from('strava_activities').delete().eq('user_id', userId);
    }

    const [{ error: connectionError }, { error: tokenError }] = await Promise.all([
      admin.from('strava_connections').upsert({
        user_id: userId,
        athlete_id: athleteId,
        athlete_firstname: payload.athlete.firstname ?? null,
        athlete_lastname: payload.athlete.lastname ?? null,
        scope,
        status: 'connected',
        last_sync_status: 'idle',
        last_sync_error: null,
        updated_at: now,
      }, { onConflict: 'user_id' }),
      admin.from('strava_tokens').upsert({
        user_id: userId,
        athlete_id: athleteId,
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        expires_at: Number(payload.expires_at),
        updated_at: now,
      }, { onConflict: 'user_id' }),
    ]);
    if (connectionError) throw connectionError;
    if (tokenError) throw tokenError;
    await consumeState(state);

    // The browser returns immediately; historical import continues after the response lifecycle.
    EdgeRuntime.waitUntil(syncActivities({
      userId,
      reason: 'oauth_backfill',
      after: Math.floor(Date.now() / 1000) - 366 * 86_400,
      maxPages: 20,
    }).catch((error) => console.error('Strava backfill failed', error)));

    return redirect(returnUrl, { strava: 'connected' });
  } catch (error) {
    await consumeState(state);
    console.error(error);
    return redirect(returnUrl, { strava: 'error', message: error instanceof Error ? error.message : String(error) });
  }
});

async function consumeState(state: string): Promise<void> {
  await admin.from('strava_oauth_states').update({ consumed_at: new Date().toISOString() }).eq('state', state);
}
function parseScope(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}
function redirect(url: URL, params: Record<string, string>): Response {
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Response(null, { status: 302, headers: { Location: url.toString(), 'Cache-Control': 'no-store' } });
}
