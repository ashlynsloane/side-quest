import { autoRefreshTrainingCalendars } from './calendar-sync';
import { refreshCoachObservedOutcomes } from './coach-observed-outcomes';
import { listCoachAccess, syncAthleteFuturePlan } from './coach';
import { getLatestTrainingCalendarSource, saveIntegrationSyncState, softDeleteEnduranceActivitiesBySource } from './database';
import { processReliabilityQueue, queueReliabilityOperation } from './reliability';
import { getStravaConnection, getStravaSyncState, refreshStravaActivitiesFromCloud, syncStravaActivities } from './strava';
import { refreshLatestWholeAthletePlan } from './whole-athlete-plan-runtime';

let refreshInFlight: Promise<void> | null = null;

export async function refreshTrainingIntegrations({
  cloudEnabled,
  userId,
  force = false,
}: { cloudEnabled: boolean; userId?: string; force?: boolean }): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = runRefresh({ cloudEnabled, userId, force });
  try { await refreshInFlight; } finally { refreshInFlight = null; }
}

async function runRefresh({ cloudEnabled, userId, force }: { cloudEnabled: boolean; userId?: string; force: boolean }): Promise<void> {
  const attemptedAt=new Date().toISOString();
  await saveIntegrationSyncState({integrationId:'foreground_recovery',status:'syncing',connected:cloudEnabled,lastAttemptedAt:attemptedAt,updatedAt:attemptedAt});
  try{
    if(cloudEnabled&&userId)await processReliabilityQueue({cloudEnabled,userId,force});
    await autoRefreshTrainingCalendars({ force });
    const source=await getLatestTrainingCalendarSource().catch(()=>null);
    if(source?.active&&source.syncStatus==='error')await queueReliabilityOperation('calendar_sync','calendar:active');
    if (!cloudEnabled) {await markRuntimeSuccess(attemptedAt);return;}
    if (userId) {
      try {
        const access = await listCoachAccess(userId);
        if (access.coaches.length > 0) await syncAthleteFuturePlan(userId);
      } catch {
        await queueReliabilityOperation('coach_plan_sync',`coach:${userId}`);
      }
    }
    try {
      const connection = await getStravaConnection();
      if (!connection) {await markRuntimeSuccess(attemptedAt);return;}
      if (connection.status !== 'connected') {
        if (connection.status === 'deauthorized') await softDeleteEnduranceActivitiesBySource('strava');
        await markRuntimeSuccess(attemptedAt);return;
      }
      await refreshStravaActivitiesFromCloud();
      const state = await getStravaSyncState();
      const anchor = state?.lastSuccessfulAt ?? connection.lastBackfillAt ?? connection.connectedAt;
      const stale = !anchor || Date.now() - new Date(anchor).getTime() >= 6 * 60 * 60 * 1000;
      if (force || stale) await syncStravaActivities({ reason: 'foreground_recovery' });
    } catch {
      await queueReliabilityOperation('strava_sync',`strava:${userId??'account'}`);
    }
    if(userId)await processReliabilityQueue({cloudEnabled,userId});
    await markRuntimeSuccess(attemptedAt);
  }catch(cause){
    const updatedAt=new Date().toISOString();
    await saveIntegrationSyncState({integrationId:'foreground_recovery',status:'error',connected:cloudEnabled,lastAttemptedAt:attemptedAt,lastError:runtimeCode(cause),updatedAt});
  } finally {
    // Canonicalize the visible plan after calendar/watch changes and then attach any
    // newly observed completions to Coach interventions. Neither step may make a
    // user-approved integration sync fail if local planning state is unavailable.
    try {
      await refreshLatestWholeAthletePlan();
      await refreshCoachObservedOutcomes();
    } catch {
      // Plan/Coach screens can retry from their own focus handlers.
    }
  }
}
async function markRuntimeSuccess(attemptedAt:string){const updatedAt=new Date().toISOString();await saveIntegrationSyncState({integrationId:'foreground_recovery',status:'success',connected:true,lastAttemptedAt:attemptedAt,lastSuccessfulAt:updatedAt,updatedAt})}
function runtimeCode(cause:unknown){const message=cause instanceof Error?cause.message:String(cause);return /network|fetch|offline/i.test(message)?'NETWORK_UNAVAILABLE':'RECOVERY_FAILED'}
