import { corsHeaders, json } from '../_shared/cors.ts';
import { HttpError, requireUser } from '../_shared/supabase.ts';
import { syncActivities } from '../_shared/strava.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({})) as { reason?: string; backfill_days?: number };
    const reason = body.reason === 'foreground_recovery' ? 'foreground_recovery' : 'manual';
    const backfillDays = Math.max(2, Math.min(366, Number(body.backfill_days) || 30));
    const result = await syncActivities({
      userId: user.id,
      reason,
      after: Math.floor(Date.now() / 1000) - backfillDays * 86_400,
      maxPages: Math.min(20, Math.ceil(backfillDays / 15) + 1),
    });
    return json(result);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return json({ error: error instanceof Error ? error.message : String(error) }, status);
  }
});
