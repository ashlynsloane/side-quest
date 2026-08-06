import type { CompletedTrainingDiscipline, EnduranceActivity, EnduranceDiscipline } from '@circuit/domain';
import { inferEnduranceIntensity } from '@circuit/planner';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import {
  getIntegrationSyncState,
  saveIntegrationSyncState,
  softDeleteEnduranceActivitiesBySource,
  type IntegrationSyncState,
} from './database';
import { ingestEnduranceActivities, type EnduranceIngestResult } from './endurance';
import { supabase } from './supabase';

export interface StravaConnection {
  userId: string;
  athleteId: string;
  athleteName?: string;
  scopes: string[];
  status: 'connected' | 'reauthorization_required' | 'deauthorized' | 'error';
  connectedAt: string;
  lastBackfillAt?: string;
  lastWebhookAt?: string;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  lastSyncError?: string;
  updatedAt: string;
}

interface StravaActivityRow {
  id: string | number;
  user_id: string;
  athlete_id: string | number;
  name: string;
  sport_type: string;
  type?: string | null;
  start_date: string;
  start_date_local?: string | null;
  moving_time: number;
  elapsed_time: number;
  distance?: number | null;
  total_elevation_gain?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  suffer_score?: number | null;
  workout_type?: number | null;
  average_cadence?: number | null;
  average_watts?: number | null;
  weighted_average_watts?: number | null;
  kilojoules?: number | null;
  device_watts?: boolean | null;
  device_name?: string | null;
  has_heartrate?: boolean | null;
  trainer?: boolean | null;
  commute?: boolean | null;
  manual?: boolean | null;
  private?: boolean | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export async function getStravaConnection(): Promise<StravaConnection | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('strava_connections')
    .select('user_id,athlete_id,athlete_firstname,athlete_lastname,scope,status,last_backfill_at,last_webhook_at,last_sync_at,last_sync_status,last_sync_error,created_at,updated_at')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const athleteName = [data.athlete_firstname, data.athlete_lastname].filter(Boolean).join(' ').trim() || undefined;
  return {
    userId: String(data.user_id),
    athleteId: String(data.athlete_id),
    athleteName,
    scopes: Array.isArray(data.scope) ? data.scope.map(String) : [],
    status: data.status as StravaConnection['status'],
    connectedAt: data.created_at,
    lastBackfillAt: data.last_backfill_at ?? undefined,
    lastWebhookAt: data.last_webhook_at ?? undefined,
    lastSyncAt: data.last_sync_at ?? undefined,
    lastSyncStatus: data.last_sync_status ?? undefined,
    lastSyncError: data.last_sync_error ?? undefined,
    updatedAt: data.updated_at,
  };
}

export async function connectStrava(): Promise<StravaConnection | null> {
  if (!supabase) throw new Error('Cloud account services must be configured before Strava can be connected.');
  const returnUrl = Linking.createURL('calendar-sync');
  const { data, error } = await supabase.functions.invoke('strava-oauth-start', { body: { return_url: returnUrl } });
  if (error) throw error;
  const authorizeUrl = String((data as { authorize_url?: string } | null)?.authorize_url ?? '');
  if (!authorizeUrl) throw new Error('The Strava authorization URL was not returned.');
  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, returnUrl);
  if (result.type !== 'success') {
    if (result.type === 'cancel' || result.type === 'dismiss') return getStravaConnection();
    throw new Error('Strava authorization did not complete.');
  }
  await syncStravaActivities({ backfillDays: 365 });
  return getStravaConnection();
}

export async function syncStravaActivities({
  backfillDays,
  reason = 'manual',
}: { backfillDays?: number; reason?: 'manual' | 'foreground_recovery' } = {}): Promise<EnduranceIngestResult> {
  if (!supabase) throw new Error('Cloud account services are not configured.');
  const attemptedAt = new Date().toISOString();
  await saveIntegrationSyncState({
    integrationId: 'strava', status: 'syncing', connected: true, lastAttemptedAt: attemptedAt, updatedAt: attemptedAt,
  });
  try {
    const { error } = await supabase.functions.invoke('strava-sync', {
      body: { backfill_days: backfillDays, reason },
    });
    if (error) throw error;
    const result = await refreshStravaActivitiesFromCloud();
    const completedAt = new Date().toISOString();
    await saveIntegrationSyncState({
      integrationId: 'strava', status: 'success', connected: true, lastAttemptedAt: attemptedAt,
      lastSuccessfulAt: completedAt, importedCount: result.insertedIds.length + result.updatedIds.length, updatedAt: completedAt,
    });
    return result;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Strava sync failed.';
    await saveIntegrationSyncState({
      integrationId: 'strava', status: 'error', connected: true, lastAttemptedAt: attemptedAt,
      lastError: message, updatedAt: new Date().toISOString(),
    });
    throw caught;
  }
}

export async function refreshStravaActivitiesFromCloud(): Promise<EnduranceIngestResult> {
  if (!supabase) throw new Error('Cloud account services are not configured.');
  const { data, error } = await supabase.from('strava_activities')
    .select('id,user_id,athlete_id,name,sport_type,type,start_date,start_date_local,moving_time,elapsed_time,distance,total_elevation_gain,average_heartrate,max_heartrate,suffer_score,workout_type,average_cadence,average_watts,weighted_average_watts,kilojoules,device_watts,device_name,has_heartrate,trainer,commute,manual,private,deleted_at,created_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(5000);
  if (error) throw error;
  const activities = ((data ?? []) as StravaActivityRow[]).flatMap((row) => {
    const discipline = disciplineFromStravaActivity({ sportType: row.sport_type, type: row.type, name: row.name });
    if (!discipline) return [];
    const base = {
      id: `strava_${row.id}`,
      source: 'strava' as const,
      externalId: String(row.id),
      athleteId: String(row.athlete_id),
      name: row.name,
      discipline,
      sportType: row.sport_type,
      classification: discipline === 'strength' || discipline === 'hiit' ? 'unclassified' as const : undefined,
      startAt: row.start_date,
      startLocal: row.start_date_local ?? undefined,
      movingTimeSeconds: row.moving_time,
      elapsedTimeSeconds: row.elapsed_time,
      distanceMeters: row.distance ?? undefined,
      elevationGainMeters: row.total_elevation_gain ?? undefined,
      averageHeartRate: row.average_heartrate ?? undefined,
      maxHeartRate: row.max_heartrate ?? undefined,
      relativeEffort: row.suffer_score ?? undefined,
      workoutType: row.workout_type ?? undefined,
      averageCadence: row.average_cadence ?? undefined,
      averageWatts: row.average_watts ?? undefined,
      weightedAverageWatts: row.weighted_average_watts ?? undefined,
      kilojoules: row.kilojoules ?? undefined,
      deviceWatts: row.device_watts ?? undefined,
      deviceName: row.device_name ?? undefined,
      hasHeartRate: row.has_heartrate ?? undefined,
      trainer: row.trainer ?? undefined,
      commute: row.commute ?? undefined,
      manual: row.manual ?? undefined,
      private: row.private ?? undefined,
      deletedAt: row.deleted_at ?? undefined,
      importedAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return [{ ...base, intensity: inferEnduranceIntensity(base) } satisfies EnduranceActivity];
  });
  return ingestEnduranceActivities(activities);
}

export async function disconnectStrava(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.functions.invoke('strava-disconnect', { body: {} });
  if (error) throw error;
  await softDeleteEnduranceActivitiesBySource('strava');
  const now = new Date().toISOString();
  await saveIntegrationSyncState({ integrationId: 'strava', status: 'disconnected', connected: false, updatedAt: now });
}

export async function getStravaSyncState(): Promise<IntegrationSyncState | null> {
  return getIntegrationSyncState('strava');
}

export function disciplineFromStravaActivity({
  sportType,
  type,
  name,
}: { sportType: string; type?: string | null; name?: string | null }): CompletedTrainingDiscipline | null {
  const normalized = `${sportType} ${type ?? ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const normalizedName = (name ?? '').toLowerCase();
  if (/swim/.test(normalized)) return 'swim';
  if (/ride|cycling|mountainbike|virtualride|ebikeride|velomobile/.test(normalized)) return 'bike';
  if (/run|trailrun|virtualrun|wheelchair/.test(normalized)) return 'run';
  if (/weighttraining|strengthtraining|functionalstrengthtraining|crossfit/.test(normalized)) return 'strength';
  if (/highintensityintervaltraining|hiit/.test(normalized)) return 'hiit';
  if (/workout/.test(normalized)) {
    if (/strength|weight|lift|barbell|dumbbell|kettlebell/.test(normalizedName)) return 'strength';
    return 'hiit';
  }
  return null;
}

export function disciplineFromSportType(sportType: string): EnduranceDiscipline | null {
  const discipline = disciplineFromStravaActivity({ sportType });
  return discipline === 'swim' || discipline === 'bike' || discipline === 'run' ? discipline : null;
}
