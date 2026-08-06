import type { GeneratedWorkout } from '@circuit/domain';
import { nextSubstitutableSession } from '@circuit/planner';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { AppScreen, Pill, SectionTitle, Surface } from '@/components/v12-ui';
import { getLatestTrainingBlock } from '@/services/database';
import {
  cancelWorkoutRoom,
  getWorkoutRoomByCode,
  listWorkoutRoomCandidates,
  listWorkoutRoomMembers,
  offerWorkoutRoomCandidate,
  selectWorkoutRoomCandidates,
  setWorkoutRoomPlanRelation,
  setWorkoutRoomReady,
  startWorkoutRoom,
  subscribeToWorkoutRoom,
  type SharedWorkoutRoom,
  type WorkoutRoomCandidate,
  type WorkoutRoomMember,
} from '@/services/workout-together';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';
import { typography, type AppPalette } from '@/theme';

export default function WorkoutRoomScreen() {
  const { code: rawCode } = useLocalSearchParams<{ code?: string }>();
  const code = String(rawCode ?? '').toUpperCase();
  const router = useRouter();
  const { user } = useAuth();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [room, setRoom] = useState<SharedWorkoutRoom | null>(null);
  const [members, setMembers] = useState<WorkoutRoomMember[]>([]);
  const [candidates, setCandidates] = useState<WorkoutRoomCandidate[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<WorkoutRoomCandidate | null>(null);
  const [nextSession, setNextSession] = useState<ReturnType<typeof nextSubstitutableSession>>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigated = useRef(false);

  const refresh = useCallback(async () => {
    if (!code) return;
    try {
      const nextRoom = await getWorkoutRoomByCode(code);
      if (!nextRoom) throw new Error('This workout room no longer exists.');
      const [nextMembers, nextCandidates, savedBlock] = await Promise.all([
        listWorkoutRoomMembers(nextRoom.id), listWorkoutRoomCandidates(nextRoom.id), getLatestTrainingBlock(),
      ]);
      setRoom(nextRoom); setMembers(nextMembers); setCandidates(nextCandidates);
      setNextSession(nextSubstitutableSession(savedBlock?.block ?? null));
      setSelectedCandidateIds(nextRoom.selectedCandidateUserIds); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }, [code]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => room ? subscribeToWorkoutRoom(room.id, () => { void refresh(); }) : undefined, [room?.id, refresh]);
  useEffect(() => {
    if (room?.status === 'active' && room.startsAt && !navigated.current) {
      navigated.current = true;
      router.replace({ pathname: '/together-session', params: { code: room.code } } as Href);
    }
  }, [room?.status, room?.startsAt, room?.code, router]);

  const me = members.find((member) => member.userId === user?.id) ?? null;
  const isHost = room?.hostUserId === user?.id;
  const relationConfirmed = Boolean(room && me?.planRelationConfirmedAt && me.confirmedSelectionRevision === room.selectionRevision);
  const everyoneReady = Boolean(room && members.length > 0 && members.every((member) => member.ready && member.planRelationConfirmedAt && member.confirmedSelectionRevision === room.selectionRevision));
  const myCandidate = candidates.find((candidate) => candidate.userId === user?.id);

  async function offerMine() {
    if (!room || !user || !nextSession) return;
    setBusy(true);
    try { await offerWorkoutRoomCandidate({roomId:room.id,userId:user.id,displayName:user.displayName,sourceSessionId:nextSession.id,workout:nextSession.workout}); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  }
  function toggleCandidate(userId:string){if(!isHost)return;setSelectedCandidateIds(current=>current.includes(userId)?current.filter(id=>id!==userId):[...current,userId].slice(-2));}
  async function chooseWorkout(){if(!room||!user||!isHost)return;const selected=candidates.filter(candidate=>selectedCandidateIds.includes(candidate.userId));if(!selected.length)return;setBusy(true);try{await selectWorkoutRoomCandidates({room,hostUserId:user.id,candidates:selected});await refresh();}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{setBusy(false)}}

  function requestRelation(relation:'additional'|'substitute_next') {
    if (!room || !user) return;
    if (relation === 'substitute_next' && !nextSession) { setError('No future Side Quest session is available to substitute.'); return; }
    const body = relation === 'substitute_next'
      ? `This shared workout will replace “${nextSession?.title}” in your plan after you complete it. Your history and your friend’s history remain separate.`
      : 'This shared workout will be added without replacing a planned Side Quest session.';
    Alert.alert(relation === 'substitute_next' ? 'Confirm substitution' : 'Confirm additional workout', body, [
      {text:'Cancel',style:'cancel'},
      {text:'Confirm',onPress:()=>void setRelation(relation)},
    ]);
  }
  async function setRelation(relation:'additional'|'substitute_next'){
    if(!room||!user)return;setBusy(true);
    try{await setWorkoutRoomPlanRelation({roomId:room.id,userId:user.id,relation,plannedSessionId:relation==='substitute_next'?nextSession?.id:undefined,plannedSessionTitle:relation==='substitute_next'?nextSession?.title:undefined});await refresh();}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{setBusy(false)}
  }
  async function toggleReady(){if(!room||!user||!me)return;setBusy(true);try{await setWorkoutRoomReady(room.id,user.id,!me.ready);await refresh();}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{setBusy(false)}}
  async function start(){if(!room||!user||!isHost)return;setBusy(true);try{await startWorkoutRoom(room.id,user.id,8);await refresh();}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{setBusy(false)}}
  async function shareCode(){if(room)await Share.share({message:`Join my workout in Side Quest. Room code: ${room.code}`});}
  function cancel(){if(!room||!user||!isHost){router.back();return}Alert.alert('Cancel workout room?','Everyone in the lobby will be disconnected.',[{text:'Keep room',style:'cancel'},{text:'Cancel room',style:'destructive',onPress:()=>void(async()=>{await cancelWorkoutRoom(room.id,user.id);router.replace('/workout-together' as Href)})()}]);}

  if (!room) return <AppScreen eyebrow="WORKOUT ROOM" title={error?'Room unavailable':'Loading room…'} subtitle={error??'Connecting to the shared lobby.'}><View /></AppScreen>;
  return <AppScreen eyebrow="LIVE WORKOUT LOBBY" title={room.workoutName} subtitle="Preview the choices, select one or combine two, then each athlete explicitly confirms how it affects their own plan.">
    <Surface style={styles.codeCard}><Text style={styles.codeLabel}>ROOM CODE</Text><Text style={styles.code}>{room.code}</Text><Pressable onPress={()=>void shareCode()}><Text style={styles.link}>Share invite</Text></Pressable></Surface>
    <SectionTitle detail={`${candidates.length} offered`}>Workout options</SectionTitle>
    {nextSession&&!myCandidate?<Pressable disabled={busy} onPress={()=>void offerMine()} style={styles.secondary}><Text style={styles.secondaryText}>Offer my next session · {nextSession.title}</Text></Pressable>:null}
    <View style={styles.list}>{candidates.map(candidate=>{const selected=selectedCandidateIds.includes(candidate.userId);return <Surface key={candidate.userId} style={selected?{...styles.card,...styles.selected}:styles.card}><View style={{flex:1}}><Text style={styles.title}>{candidate.displayName}</Text><Text style={styles.body}>{candidate.workoutName} · {Math.round(candidate.workout.totalWorkSeconds/60)} min</Text></View><Pressable onPress={()=>setPreview(candidate)}><Text style={styles.link}>Preview</Text></Pressable>{isHost?<Pressable onPress={()=>toggleCandidate(candidate.userId)}><Pill tone={selected?'good':'neutral'}>{selected?'SELECTED':'SELECT'}</Pill></Pressable>:<Pill tone="neutral">OFFERED</Pill>}</Surface>})}</View>
    {preview?<WorkoutPreview workout={preview.workout} owner={preview.displayName} onClose={()=>setPreview(null)}/>:null}
    {isHost&&candidates.length?<Pressable disabled={busy||selectedCandidateIds.length<1} onPress={()=>void chooseWorkout()} style={styles.primary}><Text style={styles.primaryText}>{selectedCandidateIds.length===2?'Combine selected workouts':'Use selected workout'}</Text></Pressable>:null}
    <Surface><Text style={styles.title}>{room.selectionMode==='combined'?'Combined shared session':'Selected shared session'} · Revision {room.selectionRevision}</Text><Text style={styles.body}>{room.selectionMode==='combined'?'Stations are interleaved, duplicate exercises are removed, and total work is capped at 48 minutes.':'Everyone follows the selected structure while using their own load and modifications.'}</Text></Surface>

    <SectionTitle>Your plan relationship</SectionTitle>
    <View style={styles.segment}><Pressable disabled={busy} onPress={()=>requestRelation('additional')} style={[styles.segmentButton,relationConfirmed&&me?.planRelation==='additional'?styles.segmentActive:undefined]}><Text style={[styles.segmentText,relationConfirmed&&me?.planRelation==='additional'?styles.segmentTextActive:undefined]}>Additional workout</Text></Pressable><Pressable disabled={busy||!nextSession} onPress={()=>requestRelation('substitute_next')} style={[styles.segmentButton,relationConfirmed&&me?.planRelation==='substitute_next'?styles.segmentActive:undefined]}><Text style={[styles.segmentText,relationConfirmed&&me?.planRelation==='substitute_next'?styles.segmentTextActive:undefined]}>Substitute my next session</Text></Pressable></View>
    {!relationConfirmed?<Surface style={styles.notice}><Pill tone="warn">CONFIRMATION REQUIRED</Pill><Text style={styles.body}>Confirm one option after the host’s latest workout selection. A changed selection resets everyone’s confirmation and ready state.</Text></Surface>:null}
    {relationConfirmed&&me?.planRelation==='substitute_next'?<Surface style={styles.notice}><Pill tone="good">SUBSTITUTION CONFIRMED</Pill><Text style={styles.body}>Completing this shared workout will satisfy: {me.plannedSessionTitle??nextSession?.title}. The workout is counted once in your history.</Text></Surface>:null}

    <SectionTitle detail={everyoneReady?'Ready to start':'Waiting'}>People in this room</SectionTitle>
    <View style={styles.list}>{members.map(member=>{const confirmed=member.planRelationConfirmedAt&&member.confirmedSelectionRevision===room.selectionRevision;return <Surface key={member.userId} style={styles.card}><View style={{flex:1}}><Text style={styles.title}>{member.displayName}{member.userId===room.hostUserId?' · Host':''}</Text><Text style={styles.body}>{confirmed?(member.planRelation==='substitute_next'?`Substituting ${member.plannedSessionTitle??'next session'}`:'Additional workout'):'Reviewing latest selection'}</Text></View><Pill tone={member.ready&&confirmed?'good':confirmed?'warn':'neutral'}>{member.ready&&confirmed?'READY':confirmed?'CONFIRMED':'REVIEW'}</Pill></Surface>})}</View>
    <Pressable disabled={busy||!me||!relationConfirmed} onPress={()=>void toggleReady()} style={[styles.secondary,me?.ready?styles.ready:undefined,!relationConfirmed?styles.disabled:undefined]}><Text style={styles.secondaryText}>{!relationConfirmed?'Confirm plan choice first':me?.ready?'I’m ready ✓':'Mark me ready'}</Text></Pressable>
    {isHost?<Pressable disabled={busy||!everyoneReady} onPress={()=>void start()} style={[styles.primary,!everyoneReady||busy?styles.disabled:undefined]}><Text style={styles.primaryText}>{everyoneReady?'Start together · 8 second countdown':'Everyone must confirm and be ready'}</Text></Pressable>:null}
    {error?<Text style={styles.error}>{error}</Text>:null}
    <Surface><Text style={styles.title}>Private by design</Text><Text style={styles.body}>Only sanitized workout structure and each athlete’s substitution choice are shared. Loads, completed rounds, pain, restrictions, readiness, heart rate, notes, and history remain private.</Text></Surface>
    <Pressable onPress={cancel}><Text style={styles.cancel}>{isHost?'Cancel room':'Leave lobby'}</Text></Pressable>
  </AppScreen>;
}

function WorkoutPreview({workout,owner,onClose}:{workout:GeneratedWorkout;owner:string;onClose:()=>void}){return <Surface><View style={previewStyles.header}><View style={{flex:1}}><Text style={previewStyles.title}>{owner}’s workout</Text><Text style={previewStyles.body}>{workout.name} · {Math.round(workout.totalWorkSeconds/60)} minutes</Text></View><Pressable onPress={onClose}><Text style={previewStyles.close}>Close</Text></Pressable></View>{workout.stations.map((station,index)=><View key={station.id} style={previewStyles.station}><Text style={previewStyles.stationTitle}>Station {index+1} · {Math.round(station.durationSeconds/60)} min</Text><Text style={previewStyles.body}>{station.exercises.map(item=>item.exerciseSnapshot.name).join(' · ')}</Text></View>)}</Surface>}
const previewStyles=StyleSheet.create({header:{flexDirection:'row',gap:10},title:{fontSize:16,fontWeight:'900'},body:{fontSize:12,opacity:.7,marginTop:3},close:{fontWeight:'900'},station:{marginTop:10},stationTitle:{fontSize:13,fontWeight:'900'}});
function makeStyles(palette:AppPalette){return StyleSheet.create({codeCard:{alignItems:'center',gap:5},codeLabel:{...typography.eyebrow,color:palette.inkMuted},code:{fontSize:38,fontWeight:'900',letterSpacing:7,color:palette.forest},link:{color:palette.forest,fontWeight:'900'},list:{gap:8},card:{flexDirection:'row',alignItems:'center',gap:10},selected:{borderWidth:2,borderColor:palette.forest},title:{fontSize:16,fontWeight:'900',color:palette.ink},body:{...typography.small,color:palette.inkMuted,marginTop:3},primary:{backgroundColor:palette.forest,borderRadius:15,padding:15,alignItems:'center'},primaryText:{color:palette.white,fontWeight:'900'},secondary:{borderWidth:1,borderColor:palette.forest,borderRadius:15,padding:14,alignItems:'center'},secondaryText:{color:palette.forest,fontWeight:'900'},ready:{backgroundColor:palette.mint},disabled:{opacity:.4},segment:{flexDirection:'row',gap:8},segmentButton:{flex:1,borderWidth:1,borderColor:palette.border,borderRadius:14,padding:12,alignItems:'center'},segmentActive:{backgroundColor:palette.forest,borderColor:palette.forest},segmentText:{color:palette.ink,fontWeight:'800',fontSize:12,textAlign:'center'},segmentTextActive:{color:palette.white},notice:{gap:7,backgroundColor:palette.mint},error:{color:palette.danger,fontWeight:'800'},cancel:{color:palette.danger,fontWeight:'900',textAlign:'center',padding:12}})}
