import { supabase } from '@/services/supabase';
import type { LoggedExercise, SocialPreferences } from '@/services/database';

export interface SocialProfile {
  id: string;
  username: string;
  displayName: string;
  initials: string;
  discoverable: boolean;
  inviteCode: string;
}
export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: string;
  person?: SocialProfile;
}
export interface FriendActivity {
  id: string;
  userId: string;
  workoutType: string;
  title: string;
  durationMinutes?: number;
  weeklyCount?: number;
  exactExercises?: string[];
  loadSummary?: Array<{ exercise:string; value:number; unit:'lb'|'kg'; basis:string }>;
  completedAt: string;
  person?: SocialProfile;
  kudosCount: number;
  viewerKudos: boolean;
}
export interface WorkoutInvitation {
  id: string;
  senderId: string;
  receiverId: string;
  roomCode: string;
  workoutName: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: string;
  createdAt: string;
  person?: SocialProfile;
}

type ProfileRow = { id:string; username:string; display_name:string; avatar_initials:string; discoverable:boolean; invite_code:string };
type RequestRow = { id:string; sender_id:string; receiver_id:string; status:FriendRequest['status']; created_at:string };
type ActivityRow = { id:string; user_id:string; workout_type:string; title:string; duration_minutes:number|null; weekly_count:number|null; exact_exercises:string[]|null; load_summary:Array<{exercise:string;value:number;unit:'lb'|'kg';basis:string}>|null; completed_at:string };
type InvitationRow = { id:string; sender_id:string; receiver_id:string; room_code:string; workout_name:string; status:WorkoutInvitation['status']; expires_at:string; created_at:string };

function client() {
  if (!supabase) throw new Error('Friends requires a cloud-enabled Side Quest account.');
  return supabase;
}
function profile(row: ProfileRow): SocialProfile {
  return { id:row.id, username:row.username, displayName:row.display_name, initials:row.avatar_initials, discoverable:row.discoverable, inviteCode:row.invite_code };
}
function cleanUsername(value:string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,24);
}
export function suggestedUsername(displayName:string) {
  return cleanUsername(displayName.replace(/\s+/g,'_')) || `athlete_${Math.floor(Math.random()*9000+1000)}`;
}

export async function ensureSocialProfile(input:{userId:string;displayName:string;initials:string;username?:string;discoverable?:boolean}):Promise<SocialProfile> {
  const db=client();
  const username=cleanUsername(input.username??suggestedUsername(input.displayName));
  const {data,error}=await db.rpc('upsert_social_profile',{p_username:username,p_display_name:input.displayName,p_initials:input.initials,p_discoverable:input.discoverable??false});
  if(error) throw new Error(error.message.includes('duplicate')?'That username is already taken.':error.message);
  const row=Array.isArray(data)?data[0]:data;
  if(!row) throw new Error('The social profile could not be created.');
  return profile(row as ProfileRow);
}
export async function getMySocialProfile(userId:string):Promise<SocialProfile|null>{
  const db=client();const{data,error}=await db.from('social_profiles').select('*').eq('id',userId).maybeSingle();if(error)throw new Error(error.message);return data?profile(data as ProfileRow):null;
}
export async function syncCloudPrivacy(userId:string,prefs:SocialPreferences):Promise<void>{
  const db=client();
  const{error}=await db.from('social_privacy').upsert({user_id:userId,share_workout_type:prefs.shareWorkoutType,share_duration:prefs.shareDuration,share_weekly_count:prefs.shareWeeklyCount,share_exact_exercises:prefs.shareExactExercises,share_loads:prefs.shareLoads,updated_at:new Date().toISOString()});
  if(error)throw new Error(error.message);
  const{error:profileError}=await db.from('social_profiles').update({discoverable:prefs.discoverable,updated_at:new Date().toISOString()}).eq('id',userId);if(profileError)throw new Error(profileError.message);
  const redactions:Record<string,unknown>={};
  if(!prefs.shareWorkoutType){redactions.workout_type='Strength workout';redactions.title='Completed a strength workout';}
  if(!prefs.shareDuration)redactions.duration_minutes=null;
  if(!prefs.shareWeeklyCount)redactions.weekly_count=null;
  if(!prefs.shareExactExercises)redactions.exact_exercises=null;
  if(!prefs.shareLoads)redactions.load_summary=null;
  if(Object.keys(redactions).length){const{error:redactionError}=await db.from('social_workout_activities').update(redactions).eq('user_id',userId);if(redactionError)throw new Error(redactionError.message);}
}
export async function sendFriendRequest(identifier:string):Promise<void>{const db=client();const{error}=await db.rpc('send_friend_request',{p_identifier:identifier.trim()});if(error)throw new Error(error.message);}
export async function respondFriendRequest(requestId:string,response:'accepted'|'declined'):Promise<void>{const db=client();const{error}=await db.rpc('respond_friend_request',{p_request_id:requestId,p_response:response});if(error)throw new Error(error.message);}
export async function removeFriend(friendId:string):Promise<void>{const db=client();const{error}=await db.rpc('remove_social_friend',{p_friend_id:friendId});if(error)throw new Error(error.message);}
export async function blockUser(userId:string):Promise<void>{const db=client();const{error}=await db.rpc('block_social_user',{p_blocked_id:userId});if(error)throw new Error(error.message);}
export async function unblockUser(userId:string):Promise<void>{const db=client();const{error}=await db.from('social_blocks').delete().eq('blocker_id',(await db.auth.getUser()).data.user?.id??'').eq('blocked_id',userId);if(error)throw new Error(error.message);}

async function profileMap(ids:string[]):Promise<Map<string,SocialProfile>>{
  const unique=[...new Set(ids)].filter(Boolean);if(!unique.length)return new Map();const db=client();const{data,error}=await db.from('social_profiles').select('*').in('id',unique);if(error)throw new Error(error.message);return new Map(((data??[]) as ProfileRow[]).map(row=>[row.id,profile(row)]));
}
export async function listFriends(userId:string):Promise<SocialProfile[]>{
  const db=client();const{data,error}=await db.from('social_friendships').select('friend_id').eq('user_id',userId).order('created_at');if(error)throw new Error(error.message);const ids=((data??[]) as Array<{friend_id:string}>).map((row:{friend_id:string})=>String(row.friend_id));const map=await profileMap(ids);return ids.flatMap((id:string)=>map.get(id)?[map.get(id)!]:[]);
}
export async function listFriendRequests(userId:string):Promise<{incoming:FriendRequest[];outgoing:FriendRequest[]}>{
  const db=client();const{data,error}=await db.from('social_friend_requests').select('*').or(`sender_id.eq.${userId},receiver_id.eq.${userId}`).eq('status','pending').order('created_at',{ascending:false});if(error)throw new Error(error.message);const rows=(data??[]) as RequestRow[];const people=await profileMap(rows.map(row=>row.sender_id===userId?row.receiver_id:row.sender_id));const mapped=rows.map(row=>({id:row.id,senderId:row.sender_id,receiverId:row.receiver_id,status:row.status,createdAt:row.created_at,person:people.get(row.sender_id===userId?row.receiver_id:row.sender_id)}));return{incoming:mapped.filter(row=>row.receiverId===userId),outgoing:mapped.filter(row=>row.senderId===userId)};
}
export async function listBlockedUsers(userId:string):Promise<SocialProfile[]>{const db=client();const{data,error}=await db.from('social_blocks').select('blocked_id').eq('blocker_id',userId);if(error)throw new Error(error.message);const ids=((data??[]) as Array<{blocked_id:string}>).map((row:{blocked_id:string})=>String(row.blocked_id));const map=await profileMap(ids);return ids.flatMap((id:string)=>map.get(id)?[map.get(id)!]:[]);}

export async function publishWorkoutActivity(input:{
  userId:string;ledgerId:string;workoutType:string;title:string;durationMinutes?:number;weeklyCount?:number;completedAt?:string;exercises?:LoggedExercise[];preferences:SocialPreferences;
}):Promise<void>{
  const db=client();
  const exactExercises=input.preferences.shareExactExercises?input.exercises?.map(item=>item.name).slice(0,12):null;
  const loadSummary=input.preferences.shareLoads?input.exercises?.flatMap(item=>item.sets.filter(set=>set.completed&&set.loadValue&&set.loadUnit).slice(-1).map(set=>({exercise:item.name,value:set.loadValue,unit:set.loadUnit,basis:set.loadBasis}))).slice(0,12):null;
  const{error}=await db.from('social_workout_activities').upsert({user_id:input.userId,workout_ledger_id:input.ledgerId,workout_type:input.preferences.shareWorkoutType?input.workoutType:'Strength workout',title:input.preferences.shareWorkoutType?input.title:'Completed a strength workout',duration_minutes:input.preferences.shareDuration?input.durationMinutes:null,weekly_count:input.preferences.shareWeeklyCount?input.weeklyCount:null,exact_exercises:exactExercises,load_summary:loadSummary,completed_at:input.completedAt??new Date().toISOString()},{onConflict:'user_id,workout_ledger_id'});if(error)throw new Error(error.message);
}
export async function listActivityFeed(userId:string):Promise<FriendActivity[]>{
  const db=client();const{data,error}=await db.from('social_workout_activities').select('*').order('completed_at',{ascending:false}).limit(50);if(error)throw new Error(error.message);const rows=(data??[]) as ActivityRow[];const people=await profileMap(rows.map(row=>row.user_id));const ids=rows.map(row=>row.id);let kudosRows:Array<{activity_id:string;user_id:string}>=[];if(ids.length){const result=await db.from('social_kudos').select('activity_id,user_id').in('activity_id',ids);if(result.error)throw new Error(result.error.message);kudosRows=(result.data??[]) as Array<{activity_id:string;user_id:string}>;}
  return rows.map(row=>{const kudos=kudosRows.filter(item=>item.activity_id===row.id);return{id:row.id,userId:row.user_id,workoutType:row.workout_type,title:row.title,durationMinutes:row.duration_minutes??undefined,weeklyCount:row.weekly_count??undefined,exactExercises:row.exact_exercises??undefined,loadSummary:row.load_summary??undefined,completedAt:row.completed_at,person:people.get(row.user_id),kudosCount:kudos.length,viewerKudos:kudos.some(item=>item.user_id===userId)};});
}
export async function toggleKudos(activityId:string,userId:string,active:boolean):Promise<void>{const db=client();if(active){const{error}=await db.from('social_kudos').upsert({activity_id:activityId,user_id:userId,kind:'nice_work'});if(error)throw new Error(error.message);}else{const{error}=await db.from('social_kudos').delete().eq('activity_id',activityId).eq('user_id',userId);if(error)throw new Error(error.message);}}

export async function sendWorkoutInvitation(input:{senderId:string;receiverId:string;roomCode:string;workoutName:string}):Promise<void>{const db=client();const{error}=await db.from('social_workout_invitations').insert({sender_id:input.senderId,receiver_id:input.receiverId,room_code:input.roomCode,workout_name:input.workoutName,status:'pending',expires_at:new Date(Date.now()+6*60*60*1000).toISOString()});if(error)throw new Error(error.message);}
export async function listWorkoutInvitations(userId:string):Promise<WorkoutInvitation[]>{const db=client();const{data,error}=await db.from('social_workout_invitations').select('*').eq('receiver_id',userId).eq('status','pending').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false});if(error)throw new Error(error.message);const rows=(data??[]) as InvitationRow[];const people=await profileMap(rows.map(row=>row.sender_id));return rows.map(row=>({id:row.id,senderId:row.sender_id,receiverId:row.receiver_id,roomCode:row.room_code,workoutName:row.workout_name,status:row.status,expiresAt:row.expires_at,createdAt:row.created_at,person:people.get(row.sender_id)}));}
export async function respondWorkoutInvitation(id:string,status:'accepted'|'declined'):Promise<void>{const db=client();const{error}=await db.from('social_workout_invitations').update({status,responded_at:new Date().toISOString()}).eq('id',id);if(error)throw new Error(error.message);}

export async function deleteWorkoutActivity(userId:string,ledgerId:string):Promise<void>{
  const db=client();
  const{error}=await db.from('social_workout_activities').delete().eq('user_id',userId).eq('workout_ledger_id',ledgerId);
  if(error)throw new Error(error.message);
}
