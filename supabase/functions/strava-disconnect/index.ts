import { corsHeaders, json } from '../_shared/cors.ts';
import { admin, HttpError, requireUser } from '../_shared/supabase.ts';
import { validAccessToken } from '../_shared/strava.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
    const user = await requireUser(req);
    try {
      const { token } = await validAccessToken(user.id);
      await fetch('https://www.strava.com/oauth/deauthorize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      console.warn('Remote Strava deauthorization was unavailable; local credentials will still be removed.', error);
    }
    const now = new Date().toISOString();
    const results = await Promise.all([
      admin.from('strava_tokens').delete().eq('user_id', user.id),
      admin.from('strava_activities').delete().eq('user_id', user.id),
      admin.from('strava_connections').update({ status: 'deauthorized', last_sync_status: 'idle', last_sync_error: null, updated_at: now }).eq('user_id', user.id),
    ]);
    const failure = results.find((result) => result.error)?.error;
    if (failure) throw failure;
    return json({ disconnected: true });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return json({ error: error instanceof Error ? error.message : String(error) }, status);
  }
});
