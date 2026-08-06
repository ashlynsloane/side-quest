import type { GeneratedWorkout } from '@circuit/domain';
import { combineSharedWorkouts, publicWorkoutForCollaboration, withSharedWorkoutContext } from '@circuit/planner';

import { supabase } from '@/services/supabase';

export type WorkoutRoomStatus = 'lobby' | 'active' | 'complete' | 'cancelled';
export type WorkoutRoomSelectionMode = 'single' | 'combined';
export type WorkoutRoomPlanRelation = 'additional' | 'substitute_next';

export interface SharedWorkoutRoom {
  id: string;
  code: string;
  hostUserId: string;
  workoutName: string;
  workout: GeneratedWorkout;
  selectionMode: WorkoutRoomSelectionMode;
  selectedCandidateUserIds: string[];
  selectedSourceSessionIds: string[];
  selectedByUserId?: string;
  status: WorkoutRoomStatus;
  startsAt: string | null;
  createdAt: string;
  expiresAt: string;
  selectionRevision: number;
}

export interface WorkoutRoomMember {
  roomId: string;
  userId: string;
  displayName: string;
  ready: boolean;
  planRelation: WorkoutRoomPlanRelation;
  plannedSessionId?: string;
  plannedSessionTitle?: string;
  joinedAt: string;
  completedAt: string | null;
  planRelationConfirmedAt?: string;
  confirmedSelectionRevision: number;
}

export interface WorkoutRoomCandidate {
  roomId: string;
  userId: string;
  displayName: string;
  sourceSessionId?: string;
  workoutName: string;
  workout: GeneratedWorkout;
  createdAt: string;
}

type RoomRow = {
  id:string; code:string; host_user_id:string; workout_name:string; workout_json:GeneratedWorkout;
  selection_mode:WorkoutRoomSelectionMode; selected_candidate_user_ids:string[]|null;
  selected_source_session_ids:string[]|null; selected_by_user_id:string|null;
  status:WorkoutRoomStatus; starts_at:string|null; created_at:string; expires_at:string; selection_revision:number;
};
type MemberRow = {
  room_id:string; user_id:string; display_name:string; ready:boolean;
  plan_relation:WorkoutRoomPlanRelation; planned_session_id:string|null; planned_session_title:string|null;
  joined_at:string; completed_at:string|null; plan_relation_confirmed_at:string|null; confirmed_selection_revision:number;
};
type CandidateRow = {
  room_id:string; user_id:string; display_name:string; source_session_id:string|null;
  workout_name:string; workout_json:GeneratedWorkout; created_at:string;
};

function client(){if(!supabase)throw new Error('Workout Together requires a cloud-enabled beta build.');return supabase;}
function roomFromRow(row:RoomRow):SharedWorkoutRoom{return{
  id:row.id,code:row.code,hostUserId:row.host_user_id,workoutName:row.workout_name,workout:row.workout_json,
  selectionMode:row.selection_mode??'single',selectedCandidateUserIds:row.selected_candidate_user_ids??[],
  selectedSourceSessionIds:row.selected_source_session_ids??[],selectedByUserId:row.selected_by_user_id??undefined,
  status:row.status,startsAt:row.starts_at,createdAt:row.created_at,expiresAt:row.expires_at,selectionRevision:row.selection_revision??1,
};}
function memberFromRow(row:MemberRow):WorkoutRoomMember{return{
  roomId:row.room_id,userId:row.user_id,displayName:row.display_name,ready:row.ready,
  planRelation:row.plan_relation??'additional',plannedSessionId:row.planned_session_id??undefined,
  plannedSessionTitle:row.planned_session_title??undefined,joinedAt:row.joined_at,completedAt:row.completed_at,
  planRelationConfirmedAt:row.plan_relation_confirmed_at??undefined,confirmedSelectionRevision:row.confirmed_selection_revision??0,
};}
function candidateFromRow(row:CandidateRow):WorkoutRoomCandidate{return{
  roomId:row.room_id,userId:row.user_id,displayName:row.display_name,
  sourceSessionId:row.source_session_id??undefined,workoutName:row.workout_name,
  workout:row.workout_json,createdAt:row.created_at,
};}
function roomCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:6},()=>alphabet[Math.floor(Math.random()*alphabet.length)]).join('');}

export async function createWorkoutRoom(input:{
  workout:GeneratedWorkout;userId:string;displayName:string;sourceSessionId?:string;
}):Promise<SharedWorkoutRoom>{
  const db=client();let lastError:Error|null=null;
  for(let attempt=0;attempt<5;attempt+=1){
    const code=roomCode();const expiresAt=new Date(Date.now()+6*60*60*1000).toISOString();
    const context={roomCode:code,selectionMode:'single' as const,sourceUserIds:[input.userId],sourceDisplayNames:[input.displayName],sourceSessionIds:input.sourceSessionId?[input.sourceSessionId]:[],selectedByUserId:input.userId};
    const workout=withSharedWorkoutContext(input.workout,context);
    const{data,error}=await db.from('workout_rooms').insert({
      code,host_user_id:input.userId,workout_name:workout.name,workout_json:workout,
      selection_mode:'single',selected_candidate_user_ids:[input.userId],
      selected_source_session_ids:context.sourceSessionIds,selected_by_user_id:input.userId,
      status:'lobby',expires_at:expiresAt,
    }).select('*').single();
    if(error){lastError=new Error(error.message);if(error.code==='23505')continue;throw lastError;}
    const row=data as RoomRow;
    const{error:memberError}=await db.from('workout_room_members').upsert({
      room_id:row.id,user_id:input.userId,display_name:input.displayName,ready:false,plan_relation:'additional',
    });if(memberError)throw new Error(memberError.message);
    const{error:candidateError}=await db.from('workout_room_candidates').upsert({
      room_id:row.id,user_id:input.userId,display_name:input.displayName,
      source_session_id:input.sourceSessionId??null,workout_name:input.workout.name,
      workout_json:withSharedWorkoutContext(input.workout,{...context,roomCode:code}),
    });if(candidateError)throw new Error(candidateError.message);
    return roomFromRow(row);
  }
  throw lastError??new Error('Could not create a unique workout room code.');
}

export async function joinWorkoutRoom(input:{code:string;userId:string;displayName:string}):Promise<SharedWorkoutRoom>{
  const db=client();const normalized=input.code.trim().toUpperCase();
  const{data,error}=await db.from('workout_rooms').select('*').eq('code',normalized).maybeSingle();if(error)throw new Error(error.message);
  if(!data)throw new Error('No active workout room was found with that code.');
  const room=roomFromRow(data as RoomRow);
  if(room.status!=='lobby')throw new Error('That workout has already started or the room is closed.');
  if(new Date(room.expiresAt).getTime()<Date.now())throw new Error('That workout room has expired.');
  const{error:memberError}=await db.from('workout_room_members').upsert({
    room_id:room.id,user_id:input.userId,display_name:input.displayName,ready:false,plan_relation:'additional',
  });if(memberError)throw new Error(memberError.message);return room;
}

export async function getWorkoutRoomByCode(code:string):Promise<SharedWorkoutRoom|null>{const db=client();const{data,error}=await db.from('workout_rooms').select('*').eq('code',code.trim().toUpperCase()).maybeSingle();if(error)throw new Error(error.message);return data?roomFromRow(data as RoomRow):null;}
export async function listWorkoutRoomMembers(roomId:string):Promise<WorkoutRoomMember[]>{const db=client();const{data,error}=await db.from('workout_room_members').select('*').eq('room_id',roomId).order('joined_at');if(error)throw new Error(error.message);return((data??[])as MemberRow[]).map(memberFromRow);}
export async function listWorkoutRoomCandidates(roomId:string):Promise<WorkoutRoomCandidate[]>{const db=client();const{data,error}=await db.from('workout_room_candidates').select('*').eq('room_id',roomId).order('created_at');if(error)throw new Error(error.message);return((data??[])as CandidateRow[]).map(candidateFromRow);}

export async function offerWorkoutRoomCandidate(input:{roomId:string;userId:string;displayName:string;sourceSessionId?:string;workout:GeneratedWorkout}):Promise<void>{
  const db=client();const{error}=await db.from('workout_room_candidates').upsert({
    room_id:input.roomId,user_id:input.userId,display_name:input.displayName,
    source_session_id:input.sourceSessionId??null,workout_name:input.workout.name,
    workout_json:publicWorkoutForCollaboration(input.workout),
  });if(error)throw new Error(error.message);
}

export async function selectWorkoutRoomCandidates(input:{
  room:SharedWorkoutRoom;hostUserId:string;candidates:WorkoutRoomCandidate[];
}):Promise<SharedWorkoutRoom>{
  if(!input.candidates.length)throw new Error('Choose at least one workout.');
  const selected=input.candidates.length===1
    ? withSharedWorkoutContext(input.candidates[0]!.workout,{
        roomCode:input.room.code,selectionMode:'single',sourceUserIds:[input.candidates[0]!.userId],
        sourceDisplayNames:[input.candidates[0]!.displayName],
        sourceSessionIds:input.candidates[0]!.sourceSessionId?[input.candidates[0]!.sourceSessionId!]:[],
        selectedByUserId:input.hostUserId,
      })
    : combineSharedWorkouts(input.candidates.map(candidate=>({
        userId:candidate.userId,displayName:candidate.displayName,sourceSessionId:candidate.sourceSessionId,workout:candidate.workout,
      })),input.hostUserId);
  selected.sharedContext={...selected.sharedContext!,roomCode:input.room.code};
  const db=client();const{data,error}=await db.rpc('select_workout_room_workout',{
    p_room_id:input.room.id,p_workout_name:selected.name,p_workout_json:selected,
    p_selection_mode:input.candidates.length===1?'single':'combined',
    p_candidate_user_ids:input.candidates.map(candidate=>candidate.userId),
    p_source_session_ids:input.candidates.flatMap(candidate=>candidate.sourceSessionId?[candidate.sourceSessionId]:[]),
  });if(error)throw new Error(error.message);
  const row=Array.isArray(data)?data[0]:data;if(!row)throw new Error('The shared workout could not be selected.');
  return roomFromRow(row as RoomRow);
}

export async function setWorkoutRoomPlanRelation(input:{
  roomId:string;userId:string;relation:WorkoutRoomPlanRelation;plannedSessionId?:string;plannedSessionTitle?:string;
}):Promise<void>{
  const db=client();const{error}=await db.rpc('confirm_workout_room_plan_relation',{
    p_room_id:input.roomId,p_relation:input.relation,
    p_planned_session_id:input.plannedSessionId??null,p_planned_session_title:input.plannedSessionTitle??null,
  });if(error)throw new Error(error.message);
}
export async function setWorkoutRoomReady(roomId:string,_userId:string,ready:boolean):Promise<void>{const db=client();const{error}=await db.rpc('set_workout_room_ready_v18_4',{p_room_id:roomId,p_ready:ready});if(error)throw new Error(error.message);}
export async function startWorkoutRoom(roomId:string,_hostUserId:string,countdownSeconds=8):Promise<string>{const db=client();const{data,error}=await db.rpc('start_workout_room_v18_4',{p_room_id:roomId,p_countdown_seconds:countdownSeconds});if(error)throw new Error(error.message);const row=Array.isArray(data)?data[0]:data;if(!row)throw new Error('The shared workout could not be started.');return String((row as{starts_at:string}).starts_at);}
export async function markWorkoutRoomMemberComplete(roomId:string,userId:string):Promise<void>{const db=client();const{error}=await db.from('workout_room_members').update({completed_at:new Date().toISOString(),last_seen_at:new Date().toISOString()}).eq('room_id',roomId).eq('user_id',userId);if(error)throw new Error(error.message);}
export async function finishWorkoutRoom(roomId:string,hostUserId:string):Promise<void>{const db=client();const{error}=await db.from('workout_rooms').update({status:'complete'}).eq('id',roomId).eq('host_user_id',hostUserId);if(error)throw new Error(error.message);}
export async function cancelWorkoutRoom(roomId:string,hostUserId:string):Promise<void>{const db=client();const{error}=await db.from('workout_rooms').update({status:'cancelled'}).eq('id',roomId).eq('host_user_id',hostUserId);if(error)throw new Error(error.message);}
export function subscribeToWorkoutRoom(roomId:string,onChange:()=>void):()=>void{const db=client();const channel=db.channel(`workout-room-${roomId}`)
  .on('postgres_changes',{event:'*',schema:'public',table:'workout_rooms',filter:`id=eq.${roomId}`},onChange)
  .on('postgres_changes',{event:'*',schema:'public',table:'workout_room_members',filter:`room_id=eq.${roomId}`},onChange)
  .on('postgres_changes',{event:'*',schema:'public',table:'workout_room_candidates',filter:`room_id=eq.${roomId}`},onChange)
  .subscribe();return()=>{void db.removeChannel(channel);};}
