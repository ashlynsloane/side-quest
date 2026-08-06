import type { Exercise, GeneratedWorkout, WorkoutExercisePrescription } from '@circuit/domain';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen, Pill, SectionTitle, Surface } from '@/components/v12-ui';
import {
  listCoachFutureSessions,
  listCoachSessionProposals,
  proposeCoachFutureSession,
  type CoachFutureSession,
} from '@/services/coach';
import { useExerciseCatalog } from '@/services/exercise-catalog';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';
import { typography, type AppPalette } from '@/theme';

type ReplaceTarget = { stationIndex: number; exerciseIndex: number } | null;

export default function CoachPlanScreen() {
  const params = useLocalSearchParams<{ athleteId?: string; athleteName?: string }>();
  const athleteId = String(params.athleteId ?? '');
  const athleteName = String(params.athleteName ?? 'Athlete');
  const { user } = useAuth();
  const { exercises } = useExerciseCatalog();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [sessions, setSessions] = useState<CoachFutureSession[]>([]);
  const [pendingSessionIds, setPendingSessionIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<CoachFutureSession | null>(null);
  const [note, setNote] = useState('');
  const [replaceTarget, setReplaceTarget] = useState<ReplaceTarget>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!athleteId) return;
    try {
      const [next, proposals] = await Promise.all([
        listCoachFutureSessions(athleteId),
        listCoachSessionProposals({ athleteId, status: 'pending' }),
      ]);
      setSessions(next);
      setPendingSessionIds(new Set(proposals.map((proposal) => proposal.localSessionId)));
      if (editing) setEditing(next.find((session) => session.localSessionId === editing.localSessionId) ?? null);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
  }, [athleteId, editing?.localSessionId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const replacementChoices = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!replaceTarget || !normalized) return [];
    return exercises.filter((exercise) => [
      exercise.name,
      exercise.category,
      exercise.shortDescription,
      ...exercise.movementPatterns,
      ...exercise.bodyRegions.map((item) => item.region),
    ].join(' ').toLowerCase().includes(normalized)).slice(0, 10);
  }, [exercises, query, replaceTarget]);

  function begin(session: CoachFutureSession) {
    setEditing(JSON.parse(JSON.stringify(session)) as CoachFutureSession);
    setNote(session.coachNote ?? '');
    setReplaceTarget(null);
    setQuery('');
    setMessage(null);
  }

  function updateWorkout(transform: (workout: GeneratedWorkout) => GeneratedWorkout) {
    setEditing((current) => current ? { ...current, workout: transform(current.workout) } : current);
  }

  function adjustTarget(stationIndex: number, exerciseIndex: number, delta: number) {
    updateWorkout((workout) => ({
      ...workout,
      stations: workout.stations.map((station, currentStation) => currentStation !== stationIndex ? station : ({
        ...station,
        exercises: station.exercises.map((item, currentExercise) => currentExercise !== exerciseIndex ? item : ({
          ...item,
          target: Math.max(item.unit === 'seconds' ? 10 : 1, item.target + delta),
        })),
      })),
    }));
  }

  function removeExercise(stationIndex: number, exerciseIndex: number) {
    updateWorkout((workout) => ({
      ...workout,
      stations: workout.stations.map((station, currentStation) => currentStation !== stationIndex ? station : ({
        ...station,
        exercises: station.exercises.length <= 1 ? station.exercises : station.exercises
          .filter((_, currentExercise) => currentExercise !== exerciseIndex)
          .map((item, index) => ({ ...item, order: index + 1 })),
      })),
    }));
  }

  function replaceExercise(exercise: Exercise) {
    if (!replaceTarget) return;
    const { stationIndex, exerciseIndex } = replaceTarget;
    updateWorkout((workout) => ({
      ...workout,
      stations: workout.stations.map((station, currentStation) => currentStation !== stationIndex ? station : ({
        ...station,
        exercises: station.exercises.map((item, currentExercise) => {
          if (currentExercise !== exerciseIndex) return item;
          const option = exercise.equipmentOptions[0];
          const prescription = exercise.prescriptions.find((candidate) => candidate.unit === item.unit)
            ?? exercise.prescriptions[0];
          return {
            ...item,
            exerciseId: exercise.id,
            exerciseSnapshot: exercise,
            equipmentOptionId: option?.id ?? item.equipmentOptionId,
            prescriptionId: prescription?.id ?? item.prescriptionId,
            target: prescription?.target ?? item.target,
            unit: prescription?.unit ?? item.unit,
            adaptationNote: undefined,
            userLoadValue: undefined,
            userLoadUnit: undefined,
          } satisfies WorkoutExercisePrescription;
        }),
      })),
      requiredEquipment: uniqueEquipment(workout.stations, stationIndex, exerciseIndex, exercise),
      targetRegions: [...new Set(workout.stations.flatMap((station, currentStation) =>
        station.exercises.flatMap((item, currentExercise) =>
          currentStation === stationIndex && currentExercise === exerciseIndex
            ? exercise.bodyRegions.map((load) => load.region)
            : item.exerciseSnapshot.bodyRegions.map((load) => load.region),
        ),
      ))],
    }));
    setReplaceTarget(null);
    setQuery('');
  }

  async function save() {
    if (!editing || !user) return;
    setBusy(true); setMessage(null);
    try {
      await proposeCoachFutureSession({
        athleteId,
        session: editing,
        date: editing.sessionDate,
        title: editing.title,
        intendedLoad: editing.intendedLoad,
        workout: recalculateWorkout(editing.workout),
        note,
        coachDisplayName: user.displayName,
      });
      setMessage(`Proposal sent. ${athleteName} must approve it before their plan changes.`);
      setEditing(null);
      await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  return <AppScreen eyebrow="COACH PLAN" title={`${athleteName} · future strength`} subtitle="You can edit future strength structure only. Completed history and private athlete context are not available.">
    <Surface style={styles.privacy}><Pill tone="good">ATHLETE APPROVAL REQUIRED</Pill><Text style={styles.body}>You can propose changes to future strength structure. The athlete sees the original and proposed workout side by side, then approves or rejects it. No access to completed workouts, loads used, readiness, pain, PT restrictions, heart rate, Strava, calendar details, or private notes.</Text></Surface>

    {!editing ? <>
      <SectionTitle detail={`${sessions.length} session${sessions.length === 1 ? '' : 's'}`}>Upcoming sessions</SectionTitle>
      {sessions.map((session) => <Pressable key={session.localSessionId} onPress={() => begin(session)} style={styles.session}>
        <View style={{flex:1}}><Text style={styles.title}>{session.title}</Text><Text style={styles.body}>{formatDate(session.sessionDate)} · {session.intendedLoad} · {Math.round(session.workout.totalWorkSeconds / 60)} min</Text><Text style={styles.meta}>{session.workout.stations.length} stations · {session.workout.stations.flatMap((station) => station.exercises).length} exercise slots{pendingSessionIds.has(session.localSessionId) ? ' · proposal pending' : ''}</Text></View><Text style={styles.edit}>{pendingSessionIds.has(session.localSessionId) ? 'Revise' : 'Edit'}</Text>
      </Pressable>)}
      {!sessions.length ? <Surface><Text style={styles.body}>No future sessions are shared yet. The athlete must open Coach Access and sync their future plan.</Text></Surface> : null}
    </> : <>
      <SectionTitle detail="Coach edit">Session details</SectionTitle>
      <Surface>
        <Text style={styles.label}>Date</Text>
        <TextInput value={editing.sessionDate} onChangeText={(value: string) => setEditing({...editing,sessionDate:value})} placeholder="YYYY-MM-DD" placeholderTextColor={palette.inkMuted} style={styles.input}/>
        <Text style={styles.label}>Title</Text>
        <TextInput value={editing.title} onChangeText={(value: string) => setEditing({...editing,title:value})} placeholderTextColor={palette.inkMuted} style={styles.input}/>
        <Text style={styles.label}>Intended load</Text>
        <View style={styles.segment}>{(['light','moderate','high'] as const).map((load) => <Pressable key={load} onPress={() => setEditing({...editing,intendedLoad:load})} style={[styles.segmentButton,editing.intendedLoad===load&&styles.segmentActive]}><Text style={[styles.segmentText,editing.intendedLoad===load&&styles.segmentTextActive]}>{load}</Text></Pressable>)}</View>
        <Text style={styles.label}>Coach note about this edit</Text>
        <TextInput value={note} onChangeText={setNote} multiline placeholder="Optional plan rationale—not a private athlete note" placeholderTextColor={palette.inkMuted} style={[styles.input,styles.note]}/>
      </Surface>

      {editing.workout.stations.map((station, stationIndex) => <Surface key={station.id}>
        <Text style={styles.station}>Station {stationIndex + 1} · {Math.round(station.durationSeconds / 60)} min</Text>
        {station.exercises.map((item, exerciseIndex) => <View key={`${item.exerciseId}-${exerciseIndex}`} style={styles.exercise}>
          <View style={{flex:1}}><Text style={styles.title}>{item.exerciseSnapshot.name}</Text><Text style={styles.body}>{item.target} {item.unit.replace('_',' ')}</Text></View>
          <View style={styles.controls}><Pressable onPress={() => adjustTarget(stationIndex,exerciseIndex,item.unit==='seconds'?-5:-1)} style={styles.small}><Text style={styles.smallText}>−</Text></Pressable><Pressable onPress={() => adjustTarget(stationIndex,exerciseIndex,item.unit==='seconds'?5:1)} style={styles.small}><Text style={styles.smallText}>＋</Text></Pressable></View>
          <Pressable onPress={() => {setReplaceTarget({stationIndex,exerciseIndex});setQuery(item.exerciseSnapshot.name);}}><Text style={styles.edit}>Replace</Text></Pressable>
          {station.exercises.length > 1 ? <Pressable onPress={() => removeExercise(stationIndex,exerciseIndex)}><Text style={styles.danger}>Remove</Text></Pressable> : null}
        </View>)}
      </Surface>)}

      {replaceTarget ? <Surface>
        <Text style={styles.title}>Replace exercise</Text>
        <TextInput value={query} onChangeText={setQuery} autoCapitalize="none" placeholder="Search exercise, region, or movement" placeholderTextColor={palette.inkMuted} style={styles.input}/>
        {replacementChoices.map((exercise) => <Pressable key={exercise.id} onPress={() => replaceExercise(exercise)} style={styles.choice}><Text style={styles.title}>{exercise.name}</Text><Text style={styles.body}>{exercise.category} · {exercise.bodyRegions.slice(0,3).map((item)=>item.region.replaceAll('_',' ')).join(', ')}</Text></Pressable>)}
        <Pressable onPress={() => {setReplaceTarget(null);setQuery('')}}><Text style={styles.cancel}>Cancel replacement</Text></Pressable>
      </Surface> : null}

      <Pressable disabled={busy} onPress={() => void save()} style={[styles.primary,busy&&styles.disabled]}><Text style={styles.primaryText}>{busy?'Saving…':'Save future-session edit'}</Text></Pressable>
      <Pressable onPress={() => setEditing(null)} style={styles.secondary}><Text style={styles.secondaryText}>Back to future plan</Text></Pressable>
    </>}
    {message ? <Surface><Text style={styles.message}>{message}</Text></Surface> : null}
  </AppScreen>;
}

function recalculateWorkout(workout: GeneratedWorkout): GeneratedWorkout {
  const totalWorkSeconds=workout.stations.reduce((sum,station)=>sum+station.durationSeconds,0);
  const totalRestSeconds=Math.max(0,workout.stations.length-1)*workout.request.restSeconds;
  return {...workout,totalWorkSeconds,totalRestSeconds,estimatedElapsedSeconds:totalWorkSeconds+totalRestSeconds,request:{...workout.request,workMinutes:Math.round(totalWorkSeconds/60)}};
}
function uniqueEquipment(stations: GeneratedWorkout['stations'], stationIndex:number, exerciseIndex:number, replacement:Exercise) {
  const ids=stations.flatMap((station,currentStation)=>station.exercises.flatMap((item,currentExercise)=>{
    const exercise=currentStation===stationIndex&&currentExercise===exerciseIndex?replacement:item.exerciseSnapshot;
    return exercise.equipmentOptions.flatMap((option)=>option.items.map((entry)=>entry.equipmentId));
  }));
  return [...new Set(ids)];
}
function formatDate(value:string){return new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric'}).format(new Date(`${value}T12:00:00`));}
function makeStyles(palette:AppPalette){return StyleSheet.create({
  privacy:{gap:7,backgroundColor:palette.mint},body:{...typography.small,color:palette.inkMuted},meta:{fontSize:11,color:palette.inkMuted,marginTop:3},title:{fontSize:15,fontWeight:'900',color:palette.ink},session:{backgroundColor:palette.surface,borderWidth:1,borderColor:palette.border,borderRadius:17,padding:15,flexDirection:'row',alignItems:'center',gap:10,marginBottom:8},edit:{color:palette.forest,fontWeight:'900'},danger:{color:palette.danger,fontWeight:'800',fontSize:12},label:{...typography.eyebrow,color:palette.forest,marginTop:9,marginBottom:5},input:{backgroundColor:palette.canvas,borderWidth:1,borderColor:palette.border,borderRadius:13,padding:12,color:palette.ink},note:{minHeight:80,textAlignVertical:'top'},segment:{flexDirection:'row',gap:7},segmentButton:{flex:1,borderWidth:1,borderColor:palette.border,borderRadius:12,padding:10,alignItems:'center'},segmentActive:{backgroundColor:palette.forest,borderColor:palette.forest},segmentText:{color:palette.ink,fontWeight:'800'},segmentTextActive:{color:palette.white},station:{...typography.eyebrow,color:palette.forest,marginBottom:7},exercise:{borderTopWidth:1,borderTopColor:palette.border,paddingVertical:10,gap:8},controls:{flexDirection:'row',gap:6},small:{borderWidth:1,borderColor:palette.border,borderRadius:10,width:38,height:34,alignItems:'center',justifyContent:'center'},smallText:{fontSize:18,fontWeight:'900',color:palette.ink},choice:{borderTopWidth:1,borderTopColor:palette.border,paddingVertical:10},cancel:{color:palette.danger,fontWeight:'900',textAlign:'center',padding:10},primary:{backgroundColor:palette.forest,borderRadius:15,padding:15,alignItems:'center'},primaryText:{color:palette.white,fontWeight:'900'},secondary:{borderWidth:1,borderColor:palette.forest,borderRadius:15,padding:14,alignItems:'center'},secondaryText:{color:palette.forest,fontWeight:'900'},disabled:{opacity:.4},message:{fontWeight:'700',color:palette.ink},
});}
