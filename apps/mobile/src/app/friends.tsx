import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppScreen, Pill, SectionTitle, Surface } from '@/components/v12-ui';
import { getSocialPreferences, saveSocialPreferences, type SocialPreferences } from '@/services/database';
import {
  blockUser,
  ensureSocialProfile,
  getMySocialProfile,
  listActivityFeed,
  listBlockedUsers,
  listFriendRequests,
  listFriends,
  listWorkoutInvitations,
  removeFriend,
  respondFriendRequest,
  respondWorkoutInvitation,
  sendFriendRequest,
  suggestedUsername,
  syncCloudPrivacy,
  toggleKudos,
  unblockUser,
  type FriendActivity,
  type FriendRequest,
  type SocialProfile,
  type WorkoutInvitation,
} from '@/services/social';
import { joinWorkoutRoom } from '@/services/workout-together';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';
import { typography, type AppPalette } from '@/theme';

type Section = 'feed' | 'people' | 'privacy';
const DEFAULT_PREFS: SocialPreferences = { discoverable:false, shareWorkoutType:true, shareDuration:true, shareWeeklyCount:true, shareExactExercises:false, shareLoads:false };
const PRIVACY_ROWS:Array<{key:keyof SocialPreferences;title:string;detail:string}>=[
  {key:'discoverable',title:'Allow exact username search',detail:'Off by default. Invite codes still work when discovery is disabled.'},
  {key:'shareWorkoutType',title:'Workout type and title',detail:'Example: strength, class, or Workout Together.'},
  {key:'shareDuration',title:'Approximate duration',detail:'Never includes your training location.'},
  {key:'shareWeeklyCount',title:'Weekly strength count',detail:'Shows consistency without exposing the rest of your training plan.'},
  {key:'shareExactExercises',title:'Exact exercise names',detail:'Off by default. Notes, pain, and restrictions remain private.'},
  {key:'shareLoads',title:'Weights and loads',detail:'Off by default. Enable only when you explicitly want friends to see them.'},
];

export default function FriendsScreen() {
  const router=useRouter();
  const {user,cloudEnabled}=useAuth();
  const {palette}=useTheme();
  const styles=useMemo(()=>makeStyles(palette),[palette]);
  const [section,setSection]=useState<Section>('feed');
  const [prefs,setPrefs]=useState<SocialPreferences>(DEFAULT_PREFS);
  const [profile,setProfile]=useState<SocialProfile|null>(null);
  const [username,setUsername]=useState('');
  const [identifier,setIdentifier]=useState('');
  const [friends,setFriends]=useState<SocialProfile[]>([]);
  const [incoming,setIncoming]=useState<FriendRequest[]>([]);
  const [outgoing,setOutgoing]=useState<FriendRequest[]>([]);
  const [blocked,setBlocked]=useState<SocialProfile[]>([]);
  const [feed,setFeed]=useState<FriendActivity[]>([]);
  const [invitations,setInvitations]=useState<WorkoutInvitation[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<string|null>(null);
  const [serviceIssue,setServiceIssue]=useState<string|null>(null);
  const available=Boolean(cloudEnabled&&user?.mode==='cloud');

  const refresh=useCallback(async()=>{
    setServiceIssue(null);
    const localPrefs=await getSocialPreferences();setPrefs(localPrefs);
    if(!user||user.mode!=='cloud'||!cloudEnabled){setProfile(null);setFriends([]);setIncoming([]);setOutgoing([]);setFeed([]);setInvitations([]);return;}
    let current=await getMySocialProfile(user.id);
    if(!current){current=await ensureSocialProfile({userId:user.id,displayName:user.displayName,initials:user.initials,username:suggestedUsername(user.displayName),discoverable:localPrefs.discoverable});}
    setProfile(current);setUsername(current.username);
    const [nextFriends,requests,nextFeed,nextBlocked,nextInvitations]=await Promise.all([listFriends(user.id),listFriendRequests(user.id),listActivityFeed(user.id),listBlockedUsers(user.id),listWorkoutInvitations(user.id)]);
    setFriends(nextFriends);setIncoming(requests.incoming);setOutgoing(requests.outgoing);setFeed(nextFeed);setBlocked(nextBlocked);setInvitations(nextInvitations);
  },[cloudEnabled,user]);

  useFocusEffect(useCallback(()=>{let live=true;void refresh().catch(cause=>{if(live){setMessage(null);setServiceIssue(userFacingSocialError(cause));}});return()=>{live=false};},[refresh]));

  async function run(task:()=>Promise<void>,success?:string){setBusy(true);setMessage(null);try{await task();if(success)setMessage(success);await refresh();}catch(cause){setMessage(userFacingSocialError(cause));}finally{setBusy(false)}}
  async function saveProfile(){if(!user||user.mode!=='cloud')return;await run(async()=>{const next=await ensureSocialProfile({userId:user.id,displayName:user.displayName,initials:user.initials,username,discoverable:prefs.discoverable});setProfile(next);},'Social profile updated.');}
  async function addFriend(){if(!identifier.trim())return;await run(async()=>{await sendFriendRequest(identifier);setIdentifier('');},'Friend request sent.');}
  async function togglePreference(key:keyof SocialPreferences){if(!user)return;const next={...prefs,[key]:!prefs[key]};setPrefs(next);await saveSocialPreferences(next);if(available)await syncCloudPrivacy(user.id,next);}
  async function react(activity:FriendActivity){if(!user)return;const next=!activity.viewerKudos;setFeed(current=>current.map(item=>item.id===activity.id?{...item,viewerKudos:next,kudosCount:Math.max(0,item.kudosCount+(next?1:-1))}:item));try{await toggleKudos(activity.id,user.id,next);}catch(cause){setMessage(userFacingSocialError(cause));await refresh();}}
  async function acceptInvitation(invitation:WorkoutInvitation){if(!user||user.mode!=='cloud')return;setBusy(true);try{const room=await joinWorkoutRoom({code:invitation.roomCode,userId:user.id,displayName:user.displayName});await respondWorkoutInvitation(invitation.id,'accepted');router.push({pathname:'/workout-room',params:{code:room.code}} as Href);}catch(cause){setMessage(userFacingSocialError(cause));}finally{setBusy(false)}}

  return <AppScreen eyebrow="FRIENDS" title="Train with people—not for an audience" subtitle="Approved friends can share privacy-safe strength activity, send one-tap kudos, and invite each other to Workout Together. There is no public follower feed.">
    {!available?<Surface style={styles.notice}><Pill tone="warn">Cloud account required</Pill><Text style={styles.noticeTitle}>Friends stays off until you connect an account.</Text><Text style={styles.helper}>{cloudEnabled?'This profile is local. Sign out and use email OTP to activate cross-phone friends and invitations.':'Add the Supabase environment variables and run the V17 social schema before testing this feature.'}</Text><Pressable onPress={()=>router.push('/sign-in' as Href)} style={styles.primary}><Text style={styles.primaryText}>Open account setup</Text></Pressable></Surface>:null}

    <View style={styles.tabs}>{(['feed','people','privacy'] as Section[]).map(item=><Pressable key={item} onPress={()=>setSection(item)} style={[styles.tab,section===item&&styles.tabActive]}><Text style={[styles.tabText,section===item&&styles.tabTextActive]}>{item==='feed'?'Activity':item==='people'?'Friends':'Privacy'}</Text></Pressable>)}</View>
    {message?<Surface style={styles.message}><Text style={styles.messageText}>{message}</Text></Surface>:null}
    {serviceIssue?<Surface style={styles.serviceIssue}><Pill tone="warn">Friends unavailable</Pill><Text style={styles.noticeTitle}>This feature is not ready on the current cloud environment.</Text><Text style={styles.helper}>{serviceIssue}</Text><Pressable disabled={busy} onPress={()=>void refresh().catch(cause=>setServiceIssue(userFacingSocialError(cause)))} style={styles.secondary}><Text style={styles.secondaryText}>{busy?'Checking…':'Try again'}</Text></Pressable></Surface>:null}

    {section==='feed'&&!serviceIssue?<>
      {invitations.length?<><SectionTitle detail={`${invitations.length}`}>Workout Together invitations</SectionTitle>{invitations.map(invitation=><Surface key={invitation.id} style={styles.invitation}><View style={styles.avatar}><Text style={styles.avatarText}>{invitation.person?.initials??'SQ'}</Text></View><View style={{flex:1}}><Text style={styles.activityTitle}>{invitation.person?.displayName??'A friend'} invited you</Text><Text style={styles.helper}>{invitation.workoutName} · room {invitation.roomCode}</Text></View><View style={styles.smallActions}><Pressable disabled={busy} onPress={()=>void acceptInvitation(invitation)} style={styles.accept}><Text style={styles.acceptText}>Join</Text></Pressable><Pressable disabled={busy} onPress={()=>void run(()=>respondWorkoutInvitation(invitation.id,'declined'))} style={styles.decline}><Text style={styles.declineText}>No</Text></Pressable></View></Surface>)}</>:null}
      <SectionTitle detail={`${feed.length}`}>Private activity</SectionTitle>
      {!feed.length?<Surface style={styles.empty}><Text style={styles.emptyIcon}>✦</Text><Text style={styles.emptyTitle}>No friend activity yet</Text><Text style={styles.helper}>When an approved friend completes a shared strength workout, it will appear here according to their privacy settings.</Text></Surface>:null}
      {feed.map(activity=><Surface key={activity.id} style={styles.activity}><View style={styles.activityHeader}><View style={styles.avatar}><Text style={styles.avatarText}>{activity.person?.initials??'A'}</Text></View><View style={{flex:1}}><Text style={styles.personName}>{activity.person?.displayName??'Friend'}</Text><Text style={styles.date}>{formatRelative(activity.completedAt)}</Text></View></View><Text style={styles.activityTitle}>{activity.title}</Text><View style={styles.activityMeta}><Pill tone="neutral">{activity.workoutType}</Pill>{activity.durationMinutes?<Pill tone="neutral">{activity.durationMinutes} min</Pill>:null}{activity.weeklyCount?<Pill tone="good">{activity.weeklyCount} this week</Pill>:null}</View>{activity.exactExercises?.length?<Text style={styles.exercises}>{activity.exactExercises.join(' · ')}</Text>:null}{activity.loadSummary?.length?<View style={styles.loadList}>{activity.loadSummary.map((item,index)=><Text key={`${activity.id}-load-${index}`} style={styles.loadText}>{item.exercise}: {item.value} {item.unit}{item.basis==='each_hand'?' each':''}</Text>)}</View>:null}<Pressable disabled={activity.userId===user?.id} onPress={()=>void react(activity)} style={[styles.kudos,activity.viewerKudos&&styles.kudosActive,activity.userId===user?.id&&styles.disabled]}><Text style={[styles.kudosText,activity.viewerKudos&&styles.kudosTextActive]}>Nice work{activity.kudosCount?` · ${activity.kudosCount}`:''}</Text></Pressable></Surface>)}
    </>:null}

    {section==='people'&&!serviceIssue?<>
      <SectionTitle>Your private identity</SectionTitle><Surface style={styles.profileCard}><Text style={styles.label}>Username</Text><TextInput value={username} onChangeText={(value:string)=>setUsername(value.toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,24))} placeholder="your_username" placeholderTextColor={palette.inkMuted} style={styles.input}/><Pressable disabled={!available||busy||username.length<3} onPress={()=>void saveProfile()} style={[styles.secondary,(!available||busy||username.length<3)&&styles.disabled]}><Text style={styles.secondaryText}>Save username</Text></Pressable>{profile?<View style={styles.inviteCode}><View><Text style={styles.label}>Private invite code</Text><Text style={styles.code}>{profile.inviteCode}</Text></View><Pressable onPress={()=>void Share.share({message:`Add me on Side Quest with invite code ${profile.inviteCode}`})}><Text style={styles.shareText}>Share</Text></Pressable></View>:null}</Surface>
      <SectionTitle>Add a friend</SectionTitle><Surface style={styles.addCard}><TextInput value={identifier} onChangeText={setIdentifier} placeholder="Exact username or invite code" placeholderTextColor={palette.inkMuted} autoCapitalize="none" style={styles.input}/><Pressable disabled={!available||busy||!identifier.trim()} onPress={()=>void addFriend()} style={[styles.primary,(!available||busy||!identifier.trim())&&styles.disabled]}><Text style={styles.primaryText}>Send friend request</Text></Pressable><Text style={styles.helper}>Both people must approve the connection. Discovery can remain off when invite codes are used.</Text></Surface>
      {incoming.length?<><SectionTitle detail={`${incoming.length}`}>Requests to you</SectionTitle>{incoming.map(request=><Surface key={request.id} style={styles.personRow}><Avatar person={request.person}/><View style={{flex:1}}><Text style={styles.personName}>{request.person?.displayName??request.person?.username??'Athlete'}</Text><Text style={styles.helper}>@{request.person?.username}</Text></View><View style={styles.smallActions}><Pressable disabled={busy} onPress={()=>void run(()=>respondFriendRequest(request.id,'accepted'))} style={styles.accept}><Text style={styles.acceptText}>Accept</Text></Pressable><Pressable disabled={busy} onPress={()=>void run(()=>respondFriendRequest(request.id,'declined'))} style={styles.decline}><Text style={styles.declineText}>Decline</Text></Pressable></View></Surface>)}</>:null}
      {outgoing.length?<><SectionTitle detail={`${outgoing.length}`}>Pending requests</SectionTitle>{outgoing.map(request=><Surface key={request.id} style={styles.personRow}><Avatar person={request.person}/><View style={{flex:1}}><Text style={styles.personName}>{request.person?.displayName??request.person?.username??'Athlete'}</Text><Text style={styles.helper}>Waiting for approval</Text></View><Pill tone="neutral">Pending</Pill></Surface>)}</>:null}
      <SectionTitle detail={`${friends.length}`}>Friends</SectionTitle>{!friends.length?<Surface><Text style={styles.emptyTitle}>No approved friends yet</Text><Text style={styles.helper}>Use an exact username or private invite code. Side Quest does not recommend strangers.</Text></Surface>:null}
      {friends.map(friend=><Surface key={friend.id} style={styles.personCard}><View style={styles.personRowInner}><Avatar person={friend}/><View style={{flex:1}}><Text style={styles.personName}>{friend.displayName}</Text><Text style={styles.helper}>@{friend.username}</Text></View></View><View style={styles.friendActions}><Pressable onPress={()=>router.push({pathname:'/workout-together',params:{friendId:friend.id,friendName:friend.displayName}} as Href)} style={styles.inviteButton}><Text style={styles.inviteButtonText}>Invite to workout</Text></Pressable><Pressable onPress={()=>Alert.alert(friend.displayName,'Choose an account action.',[{text:'Cancel',style:'cancel'},{text:'Remove friend',style:'destructive',onPress:()=>void run(()=>removeFriend(friend.id))},{text:'Block',style:'destructive',onPress:()=>void run(()=>blockUser(friend.id))}])}><Text style={styles.more}>•••</Text></Pressable></View></Surface>)}
      {blocked.length?<><SectionTitle detail={`${blocked.length}`}>Blocked accounts</SectionTitle>{blocked.map(person=><Surface key={person.id} style={styles.personRow}><Avatar person={person}/><View style={{flex:1}}><Text style={styles.personName}>{person.displayName}</Text><Text style={styles.helper}>This account cannot find, friend, invite, or interact with you.</Text></View><Pressable onPress={()=>void run(()=>unblockUser(person.id))}><Text style={styles.unblock}>Unblock</Text></Pressable></Surface>)}</>:null}
    </>:null}

    {section==='privacy'&&!serviceIssue?<>
      <SectionTitle>Sharing controls</SectionTitle>{PRIVACY_ROWS.map(row=><Pressable key={row.key} onPress={()=>void togglePreference(row.key)} style={styles.privacyRow}><View style={{flex:1}}><Text style={styles.rowTitle}>{row.title}</Text><Text style={styles.helper}>{row.detail}</Text></View><View style={[styles.switch,prefs[row.key]&&styles.switchOn]}><View style={[styles.knob,prefs[row.key]&&styles.knobOn]}/></View></Pressable>)}
      <Surface style={styles.private}><Text style={styles.privateTitle}>Always private</Text><Text style={styles.helper}>Pain, injuries, PT restrictions, readiness answers, body or health data, personal notes, exact training location, menstrual information, and deleted workouts are excluded from Friends. There is no public profile or follower count.</Text></Surface>
    </>:null}
  </AppScreen>;
}
function userFacingSocialError(cause:unknown){
  const raw=cause instanceof Error?cause.message:String(cause);
  const normalized=raw.toLowerCase();
  if(normalized.includes('permission denied')||normalized.includes('row-level security')||normalized.includes('social_profiles')){
    return 'The Friends database permissions or social migration are incomplete. Your account and workout data are unaffected.';
  }
  if(normalized.includes('network')||normalized.includes('fetch')){
    return 'Side Quest could not reach the Friends service. Check the connection and try again.';
  }
  return 'Friends could not load safely. Try again after the cloud service is available.';
}
function Avatar({person}:{person?:SocialProfile}){return <View style={{width:43,height:43,borderRadius:16,backgroundColor:'#153E2F',alignItems:'center',justifyContent:'center'}}><Text style={{color:'#fff',fontWeight:'900'}}>{person?.initials??'SQ'}</Text></View>}
function formatRelative(value:string){const hours=(Date.now()-new Date(value).getTime())/3_600_000;if(hours<1)return 'Just now';if(hours<24)return `${Math.round(hours)}h ago`;return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(new Date(value));}
function makeStyles(palette:AppPalette){return StyleSheet.create({
  notice:{gap:9},serviceIssue:{gap:10},noticeTitle:{...typography.h2,color:palette.ink},helper:{...typography.small,color:palette.inkMuted},tabs:{flexDirection:'row',gap:7},tab:{flex:1,borderWidth:1,borderColor:palette.border,borderRadius:13,padding:11,alignItems:'center'},tabActive:{backgroundColor:palette.forest,borderColor:palette.forest},tabText:{fontWeight:'900',color:palette.inkMuted},tabTextActive:{color:palette.white},message:{backgroundColor:palette.surfaceMuted},messageText:{color:palette.ink,fontWeight:'800',fontSize:13},primary:{backgroundColor:palette.forest,borderRadius:13,padding:13,alignItems:'center'},primaryText:{color:palette.white,fontWeight:'900'},secondary:{borderWidth:1,borderColor:palette.forest,borderRadius:13,padding:12,alignItems:'center'},secondaryText:{color:palette.forest,fontWeight:'900'},disabled:{opacity:.45},empty:{alignItems:'center',gap:6,paddingVertical:24},emptyIcon:{fontSize:34,color:palette.forest},emptyTitle:{fontSize:18,fontWeight:'900',color:palette.ink},invitation:{flexDirection:'row',alignItems:'center',gap:10},avatar:{width:43,height:43,borderRadius:16,backgroundColor:palette.forest,alignItems:'center',justifyContent:'center'},avatarText:{color:palette.white,fontWeight:'900'},activity:{gap:10},activityHeader:{flexDirection:'row',alignItems:'center',gap:10},personName:{fontSize:16,fontWeight:'900',color:palette.ink},date:{fontSize:11,color:palette.inkMuted},activityTitle:{fontSize:18,fontWeight:'900',color:palette.ink},activityMeta:{flexDirection:'row',gap:6,flexWrap:'wrap'},exercises:{...typography.small,color:palette.inkMuted},loadList:{backgroundColor:palette.surfaceMuted,borderRadius:11,padding:9,gap:3},loadText:{fontSize:11,fontWeight:'800',color:palette.inkMuted},kudos:{borderWidth:1,borderColor:palette.border,borderRadius:12,padding:10,alignItems:'center'},kudosActive:{backgroundColor:palette.mint,borderColor:palette.forest},kudosText:{color:palette.inkMuted,fontWeight:'900'},kudosTextActive:{color:palette.forest},profileCard:{gap:9},label:{...typography.eyebrow,color:palette.forest},input:{backgroundColor:palette.canvas,borderWidth:1,borderColor:palette.border,borderRadius:12,padding:12,color:palette.ink},inviteCode:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:palette.surfaceMuted,borderRadius:13,padding:12},code:{fontSize:21,fontWeight:'900',letterSpacing:2,color:palette.ink},shareText:{color:palette.forest,fontWeight:'900'},addCard:{gap:9},personRow:{flexDirection:'row',alignItems:'center',gap:10},personRowInner:{flexDirection:'row',alignItems:'center',gap:10},personCard:{gap:11},smallActions:{flexDirection:'row',gap:6},accept:{backgroundColor:palette.forest,borderRadius:10,paddingHorizontal:10,paddingVertical:8},acceptText:{color:palette.white,fontWeight:'900',fontSize:12},decline:{borderWidth:1,borderColor:palette.border,borderRadius:10,paddingHorizontal:10,paddingVertical:8},declineText:{color:palette.inkMuted,fontWeight:'900',fontSize:12},friendActions:{flexDirection:'row',alignItems:'center',gap:10},inviteButton:{flex:1,backgroundColor:palette.surfaceMuted,borderRadius:11,padding:11,alignItems:'center'},inviteButtonText:{color:palette.forest,fontWeight:'900'},more:{fontSize:20,color:palette.inkMuted,paddingHorizontal:8},unblock:{color:palette.forest,fontWeight:'900'},privacyRow:{backgroundColor:palette.surface,borderWidth:1,borderColor:palette.border,borderRadius:16,padding:14,flexDirection:'row',alignItems:'center',gap:12},rowTitle:{fontSize:15,fontWeight:'900',color:palette.ink},switch:{width:46,height:27,borderRadius:14,backgroundColor:palette.border,padding:3},switchOn:{backgroundColor:palette.forest},knob:{width:21,height:21,borderRadius:11,backgroundColor:palette.white},knobOn:{alignSelf:'flex-end'},private:{backgroundColor:palette.sand,gap:5},privateTitle:{fontSize:16,fontWeight:'900',color:palette.ink},
});}
