import { admin, HttpError } from './supabase.ts';

const STRAVA_API = 'https://www.strava.com/api/v3';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const clientId = Deno.env.get('STRAVA_CLIENT_ID');
const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');

if (!clientId || !clientSecret) throw new Error('STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET are required.');

export interface StravaWebhookPayload {
  object_type: 'activity' | 'athlete' | string;
  object_id: number;
  aspect_type: 'create' | 'update' | 'delete' | string;
  owner_id: number;
  subscription_id?: number;
  event_time: number;
  updates?: Record<string, unknown>;
}

interface TokenRow {
  user_id: string;
  athlete_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export async function validAccessToken(userId: string): Promise<{ token: string; athleteId: number }> {
  const { data, error } = await admin.from('strava_tokens').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(409, 'Strava is not connected.');
  const tokenRow = data as TokenRow;
  if (tokenRow.expires_at > Math.floor(Date.now() / 1000) + 300) return { token: tokenRow.access_token, athleteId: tokenRow.athlete_id };

  const response = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: tokenRow.refresh_token,
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    await admin.from('strava_connections').update({ status: 'reauthorization_required', last_sync_error: stringifyError(payload), updated_at: new Date().toISOString() }).eq('user_id', userId);
    throw new HttpError(409, 'Strava authorization must be renewed.');
  }
  const { error: updateError } = await admin.from('strava_tokens').update({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: payload.expires_at,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
  if (updateError) throw updateError;
  return { token: payload.access_token, athleteId: tokenRow.athlete_id };
}

export async function stravaFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${STRAVA_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) throw new HttpError(409, 'Strava authorization must be renewed.');
  if (!response.ok) throw new HttpError(response.status, `Strava request failed: ${stringifyError(body)}`);
  return body as T;
}

export async function upsertActivity(userId: string, athleteId: number, activity: Record<string, unknown>): Promise<boolean> {
  if (!isSupportedSport(String(activity.sport_type ?? activity.type ?? ''))) return false;
  const row = {
    id: Number(activity.id),
    user_id: userId,
    athlete_id: athleteId,
    name: String(activity.name ?? 'Endurance activity'),
    sport_type: String(activity.sport_type ?? activity.type ?? 'Workout'),
    type: activity.type ? String(activity.type) : null,
    start_date: String(activity.start_date),
    start_date_local: activity.start_date_local ? String(activity.start_date_local) : null,
    timezone: activity.timezone ? String(activity.timezone) : null,
    moving_time: Number(activity.moving_time ?? 0),
    elapsed_time: Number(activity.elapsed_time ?? activity.moving_time ?? 0),
    distance: finiteOrNull(activity.distance),
    total_elevation_gain: finiteOrNull(activity.total_elevation_gain),
    average_heartrate: finiteOrNull(activity.average_heartrate),
    max_heartrate: finiteOrNull(activity.max_heartrate),
    suffer_score: finiteOrNull(activity.suffer_score ?? activity.relative_effort),
    workout_type: finiteIntegerOrNull(activity.workout_type),
    average_cadence: finiteOrNull(activity.average_cadence),
    average_watts: finiteOrNull(activity.average_watts),
    weighted_average_watts: finiteOrNull(activity.weighted_average_watts),
    kilojoules: finiteOrNull(activity.kilojoules),
    device_watts: activity.device_watts === undefined || activity.device_watts === null ? null : Boolean(activity.device_watts),
    device_name: activity.device_name ? String(activity.device_name) : null,
    has_heartrate: activity.has_heartrate === undefined || activity.has_heartrate === null ? null : Boolean(activity.has_heartrate),
    trainer: Boolean(activity.trainer),
    commute: Boolean(activity.commute),
    manual: Boolean(activity.manual),
    private: Boolean(activity.private),
    deleted_at: null,
    raw: activity,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from('strava_activities').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  return true;
}

export async function syncActivities({
  userId,
  reason,
  after,
  before,
  maxPages = 20,
}: {
  userId: string;
  reason: 'oauth_backfill' | 'manual' | 'foreground_recovery' | 'webhook';
  after?: number;
  before?: number;
  maxPages?: number;
}): Promise<{ seen: number; upserted: number }> {
  const { data: run, error: runError } = await admin.from('strava_sync_runs').insert({ user_id: userId, reason, status: 'running' }).select('id').single();
  if (runError) throw runError;
  await admin.from('strava_connections').update({ last_sync_status: 'running', last_sync_error: null, updated_at: new Date().toISOString() }).eq('user_id', userId);

  let seen = 0;
  let upserted = 0;
  try {
    const { token, athleteId } = await validAccessToken(userId);
    for (let page = 1; page <= maxPages; page += 1) {
      const query = new URLSearchParams({ page: String(page), per_page: '100' });
      if (after) query.set('after', String(after));
      if (before) query.set('before', String(before));
      const activities = await stravaFetch<Array<Record<string, unknown>>>(`/athlete/activities?${query}`, token);
      seen += activities.length;
      for (const activity of activities) if (await upsertActivity(userId, athleteId, activity)) upserted += 1;
      if (activities.length < 100) break;
    }
    const now = new Date().toISOString();
    await Promise.all([
      admin.from('strava_sync_runs').update({ status: 'success', activities_seen: seen, activities_upserted: upserted, completed_at: now }).eq('id', run.id),
      admin.from('strava_connections').update({ status: 'connected', last_sync_status: 'success', last_sync_at: now, last_sync_error: null, ...(reason === 'oauth_backfill' ? { last_backfill_at: now } : {}), updated_at: now }).eq('user_id', userId),
    ]);
    return { seen, upserted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const now = new Date().toISOString();
    await Promise.all([
      admin.from('strava_sync_runs').update({ status: 'error', activities_seen: seen, activities_upserted: upserted, completed_at: now, error: message }).eq('id', run.id),
      admin.from('strava_connections').update({ last_sync_status: 'error', last_sync_error: message, updated_at: now }).eq('user_id', userId),
    ]);
    throw error;
  }
}

export async function processWebhook(payload: StravaWebhookPayload): Promise<void> {
  const eventKey = [payload.subscription_id ?? 'none', payload.owner_id, payload.object_type, payload.object_id, payload.aspect_type, payload.event_time].join(':');
  const { data: inserted, error } = await admin.from('strava_webhook_events').insert({
    event_key: eventKey,
    object_type: payload.object_type,
    object_id: payload.object_id,
    aspect_type: payload.aspect_type,
    owner_id: payload.owner_id,
    subscription_id: payload.subscription_id ?? null,
    event_time: payload.event_time,
    updates: payload.updates ?? {},
    payload,
  }).select('id').maybeSingle();
  if (error?.code === '23505') return;
  if (error) throw error;
  const eventId = inserted?.id;
  try {
    const { data: connection } = await admin.from('strava_connections').select('user_id').eq('athlete_id', payload.owner_id).maybeSingle();
    if (!connection) {
      if (eventId) await admin.from('strava_webhook_events').update({ status: 'ignored', processed_at: new Date().toISOString() }).eq('id', eventId);
      return;
    }
    const userId = connection.user_id as string;
    if (payload.object_type === 'athlete' && (payload.updates?.authorized === 'false' || payload.updates?.authorized === false)) {
      await Promise.all([
        admin.from('strava_tokens').delete().eq('user_id', userId),
        admin.from('strava_activities').delete().eq('user_id', userId),
        admin.from('strava_connections').update({ status: 'deauthorized', last_webhook_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('user_id', userId),
      ]);
    } else if (payload.object_type === 'activity' && payload.aspect_type === 'delete') {
      await admin.from('strava_activities').update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', payload.object_id).eq('user_id', userId);
      await admin.from('strava_connections').update({ last_webhook_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('user_id', userId);
    } else if (payload.object_type === 'activity' && (payload.aspect_type === 'create' || payload.aspect_type === 'update')) {
      const { token, athleteId } = await validAccessToken(userId);
      const activity = await stravaFetch<Record<string, unknown>>(`/activities/${payload.object_id}`, token);
      await upsertActivity(userId, athleteId, activity);
      await admin.from('strava_connections').update({ last_webhook_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('user_id', userId);
    }
    if (eventId) await admin.from('strava_webhook_events').update({ status: 'processed', processed_at: new Date().toISOString() }).eq('id', eventId);
  } catch (processingError) {
    if (eventId) await admin.from('strava_webhook_events').update({ status: 'error', error: processingError instanceof Error ? processingError.message : String(processingError), processed_at: new Date().toISOString() }).eq('id', eventId);
    throw processingError;
  }
}

function isSupportedSport(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return /run|ride|bike|cycling|swim|workout|weighttraining|strengthtraining|functionalstrengthtraining|highintensityintervaltraining|hiit|crossfit/.test(normalized);
}

function finiteOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function finiteIntegerOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}
function stringifyError(value: unknown): string {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}
