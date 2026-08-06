import { autoRefreshTrainingCalendars } from './calendar-sync';
import { syncAthleteFuturePlan } from './coach';
import {
  enqueueCloudOperation,
  getLatestTrainingCalendarSource,
  listDueCloudOperations,
  markCloudOperationFailed,
  markCloudOperationSucceeded,
  retryAllCloudOperationsNow,
  type BetaFeedbackRecord,
  type CloudOperationKind,
} from './database';
import { syncStravaActivities } from './strava';
import { supabase } from './supabase';

let processing:Promise<{processed:number;succeeded:number;failed:number}>|null=null;

export async function queueReliabilityOperation(kind:CloudOperationKind,dedupeKey:string,payload:Record<string,unknown>={}):Promise<void>{
  await enqueueCloudOperation({kind,dedupeKey,payload});
}

export async function queueFeedbackUpload(record:BetaFeedbackRecord,userId:string):Promise<void>{
  await queueReliabilityOperation('beta_feedback_upload',`feedback:${record.id}`,{
    id:record.id,userId,category:record.category,message:record.message,route:record.route,context:record.context,createdAt:record.createdAt,
  });
}

export interface CloudProfilePayload {
  userId: string;
  email: string;
  displayName: string;
  units: 'lb' | 'kg';
  anatomyFigure: 'woman' | 'man';
  themeId: string;
  appearance: 'system' | 'light' | 'dark';
}

export async function syncProfileWithFallback(profile:CloudProfilePayload):Promise<void>{
  try{
    await uploadProfile(profile,profile.userId);
  }catch{
    await queueReliabilityOperation('profile_sync',`profile:${profile.userId}`,{...profile}).catch(()=>undefined);
  }
}

export async function processReliabilityQueue(input:{cloudEnabled:boolean;userId?:string;force?:boolean}):Promise<{processed:number;succeeded:number;failed:number}>{
  if(processing)return processing;
  processing=run(input);
  try{return await processing}finally{processing=null}
}

async function run({cloudEnabled,userId,force=false}:{cloudEnabled:boolean;userId?:string;force?:boolean}):Promise<{processed:number;succeeded:number;failed:number}>{
  if(!cloudEnabled||!userId||!supabase)return{processed:0,succeeded:0,failed:0};
  if(force)await retryAllCloudOperationsNow();
  const operations=await listDueCloudOperations(12);
  let succeeded=0;let failed=0;
  for(const operation of operations){
    try{
      if(operation.kind==='calendar_sync'){await autoRefreshTrainingCalendars({force:true});const source=await getLatestTrainingCalendarSource();if(source?.active&&source.syncStatus==='error')throw new Error('Calendar reconciliation is still failing.')}
      else if(operation.kind==='strava_sync')await syncStravaActivities({reason:'foreground_recovery'});
      else if(operation.kind==='coach_plan_sync')await syncAthleteFuturePlan(userId);
      else if(operation.kind==='beta_feedback_upload')await uploadFeedback(operation.payload,userId);
      else if(operation.kind==='profile_sync')await uploadProfile(operation.payload,userId);
      await markCloudOperationSucceeded(operation.id);succeeded+=1;
    }catch(cause){
      await markCloudOperationFailed(operation.id,errorCode(cause),operation.attempts+1);failed+=1;
    }
  }
  return{processed:operations.length,succeeded,failed};
}

async function uploadFeedback(payload:Record<string,unknown>,userId:string):Promise<void>{
  if(!supabase)throw new Error('Cloud services are unavailable.');
  if(String(payload.userId??'')!==userId)throw new Error('Queued feedback belongs to another account.');
  const{error}=await supabase.from('beta_feedback').upsert({
    id:String(payload.id),user_id:userId,category:String(payload.category),message:String(payload.message),route:payload.route?String(payload.route):null,context:payload.context??null,created_at:String(payload.createdAt),
  },{onConflict:'id'});
  if(error)throw error;
}

async function uploadProfile(payload:Record<string,unknown>|CloudProfilePayload,userId:string):Promise<void>{
  if(!supabase)throw new Error('Cloud services are unavailable.');
  if(String(payload.userId??'')!==userId)throw new Error('Queued profile belongs to another account.');
  const displayName=String(payload.displayName??'Athlete');
  const units=payload.units==='kg'?'kg':'lb';
  const anatomyFigure=payload.anatomyFigure==='man'?'man':'woman';
  const themeId=String(payload.themeId??'forest');
  const appearance=payload.appearance==='light'||payload.appearance==='dark'?payload.appearance:'system';
  const{error:authError}=await supabase.auth.updateUser({data:{
    display_name:displayName,
    theme_id:themeId,
    appearance,
    anatomy_figure:anatomyFigure,
  }});
  if(authError)throw authError;
  const{error:profileError}=await supabase.from('profiles').upsert({
    id:userId,
    email:String(payload.email??''),
    display_name:displayName,
    units,
    theme_id:themeId,
    appearance,
    updated_at:new Date().toISOString(),
  });
  if(profileError)throw profileError;
}

function errorCode(cause:unknown):string{
  const candidate=cause as {code?:unknown;status?:unknown;name?:unknown};
  if(typeof candidate?.code==='string')return candidate.code;
  if(typeof candidate?.status==='number')return `HTTP_${candidate.status}`;
  if(typeof candidate?.name==='string'&&candidate.name!=='Error')return candidate.name;
  const message=cause instanceof Error?cause.message:String(cause);
  if(/network|fetch|offline/i.test(message))return'NETWORK_UNAVAILABLE';
  if(/auth|token|session|jwt/i.test(message))return'AUTH_REQUIRED';
  return'OPERATION_FAILED';
}
