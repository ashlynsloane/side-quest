import { corsHeaders, json } from '../_shared/cors.ts';
import { admin, HttpError, requireUser } from '../_shared/supabase.ts';

const clientId = Deno.env.get('STRAVA_CLIENT_ID');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
if (!clientId || !supabaseUrl) throw new Error('STRAVA_CLIENT_ID and SUPABASE_URL are required.');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({})) as { return_url?: string };
    const returnUrl = validateReturnUrl(body.return_url);
    const state = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const { error } = await admin.from('strava_oauth_states').insert({ state, user_id: user.id, return_url: returnUrl, expires_at: expiresAt });
    if (error) throw error;

    const redirectUri = `${supabaseUrl}/functions/v1/strava-oauth-callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'read,activity:read_all',
      state,
    });
    return json({ authorize_url: `https://www.strava.com/oauth/authorize?${params}`, expires_at: expiresAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('strava-oauth-start failed:', message, error);
    const status = error instanceof HttpError ? error.status : 500;
    return json({ error: message }, status);
  }
});

function validateReturnUrl(value?: string): string {
  const fallback = `${Deno.env.get('APP_DEEP_LINK_SCHEME') ?? 'sidequest'}://calendar-sync`;
  const candidate = value?.trim() || fallback;
  let parsed: URL;
  try { parsed = new URL(candidate); } catch { throw new HttpError(400, 'Invalid return URL.'); }
  const allowedScheme = Deno.env.get('APP_DEEP_LINK_SCHEME') ?? 'sidequest';
  if (parsed.protocol !== `${allowedScheme}:`) throw new HttpError(400, 'Return URL scheme is not allowed.');
  return candidate;
}
