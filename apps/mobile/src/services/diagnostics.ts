import { listCoachAccess, listCoachSessionProposals } from './coach';
import {
  countCompletedWorkouts,
  getActiveDatabaseName,
  getCloudOperationQueueStats,
  getIntegrationSyncState,
  getLatestTrainingCalendarSource,
  getTrainingCalendarEvents,
  listEnduranceActivities,
  listPlannedCompletedMatches,
  listWorkoutSensorLinks,
} from './database';
import { getStravaConnection, getStravaSyncState } from './strava';

export interface PrivacySafeDiagnostics {
  generatedAt:string;
  appVersion:string;
  accountMode:'cloud'|'local'|'signed_out';
  database:{schemaVersion:number;active:boolean};
  runtime:{status:string;lastAttemptedAt?:string;lastSuccessfulAt?:string;hasError:boolean};
  calendar:{connected:boolean;status:string;lastAttemptedAt?:string;lastSuccessfulAt?:string;eventCount:number;failureCount:number;hasError:boolean};
  strava:{connected:boolean;status:string;lastAttemptedAt?:string;lastSuccessfulAt?:string;lastWebhookAt?:string;lastActivityAt?:string;activityCounts:Record<string,number>;matchCounts:Record<string,number>;sensorLinks:Record<string,number>;hasError:boolean};
  coach:{grantsAsAthlete:number;grantsAsCoach:number;pendingProposals:number;available:boolean};
  reliability:{pending:number;retrying:number;dueNow:number;oldestQueuedAt?:string};
  local:{completedWorkoutCount:number};
}

export async function buildPrivacySafeDiagnostics(input:{accountMode:'cloud'|'local'|'signed_out';userId?:string}):Promise<PrivacySafeDiagnostics>{
  const now=new Date();const from=new Date(now.getTime()-365*86400000).toISOString();const to=new Date(now.getTime()+365*86400000).toISOString();
  const[source,activities,matches,links,completed,queue,runtime]=await Promise.all([
    getLatestTrainingCalendarSource().catch(()=>null),listEnduranceActivities({from,to,limit:10000}).catch(()=>[]),listPlannedCompletedMatches().catch(()=>[]),listWorkoutSensorLinks().catch(()=>[]),countCompletedWorkouts().catch(()=>0),getCloudOperationQueueStats().catch(()=>({pending:0,retrying:0,dueNow:0,oldestCreatedAt:undefined})),getIntegrationSyncState('foreground_recovery').catch(()=>null),
  ]);
  const eventCount=source?await getTrainingCalendarEvents({from,to}).then(items=>items.length).catch(()=>0):0;
  const connection=input.accountMode==='cloud'?await getStravaConnection().catch(()=>null):null;
  const stravaState=await getStravaSyncState().catch(()=>null);
  let coach={grantsAsAthlete:0,grantsAsCoach:0,pendingProposals:0,available:false};
  if(input.accountMode==='cloud'&&input.userId){try{const access=await listCoachAccess(input.userId);const proposals=await listCoachSessionProposals({athleteId:input.userId,status:'pending'});coach={grantsAsAthlete:access.coaches.length,grantsAsCoach:access.athletes.length,pendingProposals:proposals.length,available:true}}catch{}}
  const lastActivityAt=activities.map(item=>item.startAt).sort().at(-1);
  return{
    generatedAt:now.toISOString(),appVersion:'0.18.10',accountMode:input.accountMode,database:{schemaVersion:187,active:Boolean(getActiveDatabaseName())},
    runtime:{status:runtime?.status??'idle',lastAttemptedAt:runtime?.lastAttemptedAt,lastSuccessfulAt:runtime?.lastSuccessfulAt,hasError:runtime?.status==='error'},
    calendar:{connected:Boolean(source?.active),status:source?.syncStatus??'not_connected',lastAttemptedAt:source?.lastAttemptedAt,lastSuccessfulAt:source?.lastSuccessfulAt,eventCount,failureCount:source?.consecutiveFailures??0,hasError:Boolean(source?.lastError)},
    strava:{connected:connection?.status==='connected',status:connection?.status??stravaState?.status??'not_connected',lastAttemptedAt:stravaState?.lastAttemptedAt,lastSuccessfulAt:stravaState?.lastSuccessfulAt,lastWebhookAt:connection?.lastWebhookAt,lastActivityAt,activityCounts:countBy(activities.map(item=>item.discipline)),matchCounts:countBy(matches.map(item=>item.status)),sensorLinks:countBy(links.map(item=>item.status)),hasError:Boolean(connection?.lastSyncError||stravaState?.lastError)},
    coach,reliability:{pending:queue.pending,retrying:queue.retrying,dueNow:queue.dueNow,oldestQueuedAt:queue.oldestCreatedAt},local:{completedWorkoutCount:completed},
  };
}
function countBy(values:string[]):Record<string,number>{return values.reduce<Record<string,number>>((output,value)=>{output[value]=(output[value]??0)+1;return output},{})}
export function diagnosticsText(report:PrivacySafeDiagnostics):string{return JSON.stringify(report,null,2)}
