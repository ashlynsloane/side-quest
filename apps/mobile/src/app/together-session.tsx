import type { Exercise, GeneratedWorkout, WorkoutStation } from '@circuit/domain';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExerciseDemoModal } from '@/components/exercise-demo-modal';
import {
  inspectGenericWorkoutSafety,
  saveCompletedWorkout,
  withVerifiedAthleteDatabase,
} from '@/services/database';
import {
  finishWorkoutRoom,
  getWorkoutRoomByCode,
  listWorkoutRoomMembers,
  markWorkoutRoomMemberComplete,
  type SharedWorkoutRoom,
  type WorkoutRoomMember,
} from '@/services/workout-together';
import { boundedSharedWorkoutFraction } from '@/services/shared-workout-safe-fraction';
import { useAuth } from '@/state/auth-context';
import { useWorkoutContext } from '@/state/workout-context';
import { useTheme } from '@/state/theme-context';
import { typography, type AppPalette } from '@/theme';

type TimelineState =
  | { kind: 'countdown'; remaining: number; stationIndex: 0; elapsed: 0 }
  | { kind: 'work' | 'rest'; remaining: number; stationIndex: number; elapsed: number }
  | { kind: 'complete'; remaining: 0; stationIndex: number; elapsed: number };

export default function TogetherSessionScreen() {
  useKeepAwake();
  const { code: rawCode } = useLocalSearchParams<{ code?: string }>();
  const code = String(rawCode ?? '').toUpperCase();
  const router = useRouter();
  const { user } = useAuth();
  const { activeWorkout } = useWorkoutContext();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [room, setRoom] = useState<SharedWorkoutRoom | null>(null);
  const [member, setMember] = useState<WorkoutRoomMember | null>(null);
  const [now, setNow] = useState(Date.now());
  const [rounds, setRounds] = useState<Record<string, number>>({});
  const [demo, setDemo] = useState<Exercise | null>(null);
  const [error, setError] = useState<string | null>(null);
  const persisted = useRef(false);
  const savingRef = useRef(false);
  const completedAtRef = useRef<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [safetyStatus, setSafetyStatus] = useState<'checking' | 'clear' | 'hold'>('checking');
  const [safetyReason, setSafetyReason] = useState<string | null>(null);
  const safetyHeldRef = useRef(false);
  const safetyRoomRef = useRef<string | null>(null);
  const safetyBusyRef = useRef(false);
  const lastSafeElapsedRef = useRef(0);
  const lastClockTickRef = useRef<number | null>(null);
  const foregroundRef = useRef(true);

  useEffect(() => {
    void (async () => {
      try {
        const next = await getWorkoutRoomByCode(code);
        setRoom(next);
        if (next && user) {
          const members = await listWorkoutRoomMembers(next.id);
          setMember(members.find((item) => item.userId === user.id) ?? null);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
  }, [code, user?.id]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);

  useEffect(() => {
    if (!room?.id || !user?.id) return;
    let live = true;
    if (safetyRoomRef.current !== room.id) {
      safetyRoomRef.current = room.id;
      safetyHeldRef.current = false;
      lastSafeElapsedRef.current = 0;
      lastClockTickRef.current = null;
      foregroundRef.current = true;
      setSafetyStatus('checking');
      setSafetyReason(null);
    }
    const check = async () => {
      if (!live || safetyHeldRef.current || safetyBusyRef.current) return;
      safetyBusyRef.current = true;
      try {
        if (activeWorkout) {
          throw new Error('Another athlete workout is already saved. Recover or finish it first.');
        }
        const decision = await inspectGenericWorkoutSafety(user.id);
        if (!live) return;
        if (decision.kind === 'hold') {
          safetyHeldRef.current = true;
          setSafetyStatus('hold');
          setSafetyReason(decision.blockers.join(' ') ||
            'The shared session cannot continue under current safety restrictions.');
        } else {
          setSafetyStatus('clear');
        }
      } catch (cause) {
        if (!live) return;
        safetyHeldRef.current = true;
        setSafetyStatus('hold');
        setSafetyReason(cause instanceof Error ? cause.message
          : 'Athlete safety evidence cannot be verified.');
      } finally { safetyBusyRef.current = false; }
    };
    void check();
    const poll = setInterval(() => { void check(); }, 4000);
    const foreground = AppState.addEventListener('change', status => {
      if (status !== 'active') {
        foregroundRef.current = false;
        lastClockTickRef.current = null;
        if (!safetyHeldRef.current) setSafetyStatus('checking');
        return;
      }
      foregroundRef.current = true;
      if (!safetyHeldRef.current) setSafetyStatus('checking');
      void check();
    });
    return () => {
      live = false;
      clearInterval(poll);
      foreground.remove();
    };
  }, [room?.id, user?.id, activeWorkout]);

  const state = useMemo(() => room?.startsAt ? timeline(room.workout, room.startsAt, now) : null, [room, now]);
  useEffect(() => {
    // Do not backfill a remote room clock after a delayed join, background
    // suspension, blocked safety check, or skipped JS timer frames.
    if (safetyStatus !== 'clear' || !foregroundRef.current || !state
      || state.kind === 'countdown' || state.kind === 'complete') {
      lastClockTickRef.current = null;
      return;
    }
    if (lastClockTickRef.current !== null) {
      const observedMilliseconds = Math.max(0, Math.min(1000, now - lastClockTickRef.current));
      lastSafeElapsedRef.current += observedMilliseconds / 1000;
    }
    lastClockTickRef.current = now;
  }, [now, safetyStatus, state?.kind]);

  const station = state && state.kind !== 'complete' && state.kind !== 'countdown' ? room?.workout.stations[state.stationIndex] ?? null : null;

  const persist = useCallback(async (fraction: number): Promise<boolean> => {
    if (!room || !user || savingRef.current) return false;
    if (persisted.current) return true;
    const safeFraction = boundedSharedWorkoutFraction(
      fraction, lastSafeElapsedRef.current, room.workout.estimatedElapsedSeconds,
    );
    if (safeFraction <= 0) {
      setSaveStatus('error');
      setSaveError('This device has no observed, safety-cleared participation time. The shared room clock alone cannot create a completed workout.');
      return false;
    }
    savingRef.current = true;
    setSaveStatus('saving');
    setSaveError(null);
    const completedAt = completedAtRef.current ?? new Date().toISOString();
    completedAtRef.current = completedAt;
    const substitutesPlan = member?.planRelation === 'substitute_next' && Boolean(member.plannedSessionId);
    const shared = room.workout.sharedContext;
    try {
      await withVerifiedAthleteDatabase(user.id, async () => {
        await saveCompletedWorkout({
          workout: room.workout,
          startedAt: room.startsAt ?? room.createdAt,
          completedAt,
          completionFraction: safeFraction,
          stationRounds: rounds,
          plannedSessionId: substitutesPlan ? member?.plannedSessionId : undefined,
          ledgerSource: 'workout_together',
          relationToPlan: substitutesPlan ? 'replaced_planned' : 'additional',
          idempotencyKey: `workout_together:${room.id}:${user.id}`,
          friendSubstitution: substitutesPlan && member?.plannedSessionId && member.plannedSessionTitle ? {
            kind: room.selectionMode === 'combined' ? 'combined_friend_workout' : 'friend_workout',
            roomCode: room.code,
            sourceUserIds: shared?.sourceUserIds ?? room.selectedCandidateUserIds,
            sourceDisplayNames: shared?.sourceDisplayNames ?? [],
            sourceSessionIds: shared?.sourceSessionIds ?? room.selectedSourceSessionIds,
            originalSessionId: member.plannedSessionId,
            originalSessionTitle: member.plannedSessionTitle,
            replacementWorkoutName: room.workoutName,
          } : undefined,
        });
      });
      // Local canonical SQLite success is distinct from remote room status.
      persisted.current = true;
      setSaveStatus('saved');
      try {
        await markWorkoutRoomMemberComplete(room.id, user.id);
        if (room.hostUserId === user.id && safeFraction >= .99) {
          await finishWorkoutRoom(room.id, user.id);
        }
      } catch {
        setSaveError('Your workout is saved locally, but room status could not synchronize.');
      }
      return true;
    } catch (cause) {
      // A failed canonical write must never be displayed as a saved workout,
      // nor permanently suppress another explicit retry of the same identity.
      setSaveStatus('error');
      setSaveError(cause instanceof Error ? cause.message
        : 'Shared workout could not be saved. Retry before leaving.');
      return false;
    } finally { savingRef.current = false; }
  }, [room, user, member, rounds]);

  useEffect(() => {
    if (state?.kind === 'complete' && safetyStatus === 'clear'
      && !safetyHeldRef.current) void persist(1);
  }, [state?.kind, safetyStatus, persist]);

  function changeRounds(delta: number) {
    if (!station || safetyStatus !== 'clear' || safetyHeldRef.current) return;
    setRounds((current) => ({ ...current, [station.id]: Math.max(0, (current[station.id] ?? 0) + delta) }));
  }
  function leaveEarly() {
    if (!room || !state) { router.replace('/(tabs)/train' as Href); return; }
    const fraction = Math.max(0, Math.min(1, state.elapsed / room.workout.estimatedElapsedSeconds));
    Alert.alert('Leave your shared workout?', 'This will not pause the other phones. Your completed portion can still be saved.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave and save', style: 'destructive', onPress: () => void (async () => {
        if (await persist(fraction)) router.replace('/(tabs)/train' as Href);
      })() },
    ]);
  }

  async function saveHeldPortionAndExit() {
    if (!room || saveStatus === 'saving') return;
    const seconds = Math.max(0, lastSafeElapsedRef.current);
    const elapsedFraction = room.workout.estimatedElapsedSeconds > 0
      ? seconds / room.workout.estimatedElapsedSeconds : 0;
    // A shared clock is not itself evidence of physical activity. Never
    // count the period AFTER the safety hold as additional training dose.
    const fraction = Math.max(0, Math.min(0.99, elapsedFraction));
    if (await persist(fraction)) router.replace('/(tabs)/train' as Href);
  }

  function leaveHeldWithoutSaving() {
    Alert.alert(
      'Leave without saving this shared workout?',
      'The other phones will keep their clock. Any rounds entered on this phone will not be recorded in your training history.',
      [
        { text: 'Keep workout record', style: 'cancel' },
        { text: 'Leave without saving', style: 'destructive',
          onPress: () => router.replace('/(tabs)/train' as Href) },
      ],
    );
  }

  if (error || !room || !state) return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.title}>{error ? 'Could not open shared workout' : 'Synchronizing room…'}</Text>{error ? <Text style={styles.body}>{error}</Text> : null}<Pressable onPress={() => router.replace('/workout-together' as Href)} style={styles.secondary}><Text style={styles.secondaryText}>Return</Text></Pressable></View></SafeAreaView>;

  if (safetyStatus === 'checking') {
    return <SafeAreaView style={styles.safe}><View style={styles.center}>
      <Text style={styles.title}>Checking your training safety</Text>
      <Text style={styles.body}>The shared clock does not authorize training. Your local restrictions must be checked before showing exercises.</Text>
      <Pressable onPress={() => router.replace('/workout-room' as Href)} style={styles.secondary}>
        <Text style={styles.secondaryText}>Return to room</Text>
      </Pressable>
    </View></SafeAreaView>;
  }

  if (safetyStatus === 'hold') {
    return <SafeAreaView style={styles.safe}><View style={styles.center}>
      <Text style={styles.title}>Your shared workout is on safety hold</Text>
      <Text style={styles.body}>{safetyReason ?? 'Current training safety evidence could not be verified.'}</Text>
      <Text style={styles.body}>Your phone must stop the exercises. The other athletes' clocks continue independently. You may save only the portion elapsed before your hold.</Text>
      {saveError ? <Text style={styles.body}>{saveError}</Text> : null}
      <Pressable disabled={saveStatus === 'saving'} onPress={() => { void saveHeldPortionAndExit(); }}
        style={styles.primary}><Text style={styles.primaryText}>
          {saveStatus === 'saving' ? 'Saving your portion…' : 'Save prior portion and leave'}
        </Text></Pressable>
      <Pressable onPress={() => router.push('/training-safety-context' as Href)}
        style={styles.secondary}><Text style={styles.secondaryText}>Review training context</Text></Pressable>
      <Pressable onPress={leaveHeldWithoutSaving} style={styles.secondary}>
        <Text style={styles.secondaryText}>Leave without a workout record</Text>
      </Pressable>
    </View></SafeAreaView>;
  }

  if (state.kind === 'countdown') return <SafeAreaView style={styles.safe}><View style={styles.countdown}><Text style={styles.eyebrow}>EVERY PHONE STARTS TOGETHER</Text><Text style={styles.countNumber}>{state.remaining}</Text><Text style={styles.countTitle}>{room.workoutName}</Text><Text style={styles.body}>Get to your first station. The shared clock begins automatically.</Text></View></SafeAreaView>;

  if (state.kind === 'complete') return <SafeAreaView style={styles.safe}><View style={styles.complete}>
    <Text style={styles.eyebrow}>SHARED WORKOUT COMPLETE</Text>
    <Text style={styles.completeTitle}>Same session. Your own result.</Text>
    <Text style={styles.body}>Your completion is recorded only after your athlete-owned training ledger confirms the write.</Text>
    {saveError ? <Text style={styles.body}>{saveError}</Text> : null}
    <Pressable disabled={saveStatus === 'saving'} onPress={() => {
      void (async () => {
        if (await persist(1)) router.replace('/(tabs)/train' as Href);
      })();
    }} style={styles.primary}><Text style={styles.primaryText}>
      {saveStatus === 'saving' ? 'Saving workout locally…'
        : saveStatus === 'saved' ? 'Done' : 'Save workout before leaving'}
    </Text></Pressable>
  </View></SafeAreaView>;

  const currentStation = station!;
  return <SafeAreaView style={styles.safe}>
    <View style={styles.top}><View><Text style={styles.eyebrow}>ROOM {room.code} · SYNCED</Text><Text style={styles.topTitle}>{state.kind === 'rest' ? 'Transition' : `Station ${currentStation.order} of ${room.workout.stations.length}`}</Text></View><Pressable onPress={leaveEarly}><Text style={styles.end}>Exit</Text></Pressable></View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.timerCard, state.kind === 'rest' && styles.restCard]}><Text style={styles.timerLabel}>{state.kind === 'rest' ? 'NEXT STATION IN' : 'AMRAP'}</Text><Text style={styles.timer}>{formatTime(state.remaining)}</Text><Text style={styles.syncNote}>Clock anchored to the room start time</Text></View>
      {state.kind === 'rest' ? <NextStation station={room.workout.stations[state.stationIndex + 1]!} onDemo={setDemo} styles={styles} /> : <View style={styles.stationCard}><Text style={styles.purpose}>{currentStation.purpose}</Text>{currentStation.exercises.map((item) => <View key={item.exerciseId} style={styles.exercise}><View style={{ flex: 1 }}><Text style={styles.exerciseName}>{item.exerciseSnapshot.name}</Text><Text style={styles.body}>{prescription(item.target, item.unit)}</Text>{item.adaptationNote ? <Text style={styles.adaptation}>{item.adaptationNote}</Text> : null}</View><Pressable onPress={() => setDemo(item.exerciseSnapshot)} style={styles.demo}><Text style={styles.demoText}>Demo</Text></Pressable></View>)}</View>}
      {state.kind === 'work' ? <View style={styles.roundCard}><View><Text style={styles.roundTitle}>Your rounds</Text><Text style={styles.body}>Private to this phone</Text></View><View style={styles.roundControls}><Pressable onPress={() => changeRounds(-1)} style={styles.roundButton}><Text style={styles.roundButtonText}>−</Text></Pressable><Text style={styles.roundValue}>{rounds[currentStation.id] ?? 0}</Text><Pressable onPress={() => changeRounds(1)} style={styles.roundButton}><Text style={styles.roundButtonText}>+</Text></Pressable></View></View> : null}
      <View style={styles.privacy}><Text style={styles.privacyTitle}>Shared clock, personal execution</Text><Text style={styles.body}>Use your own load and an appropriate regression or progression. Pausing or exiting your phone does not change anyone else’s clock.</Text></View>
    </ScrollView>
    <ExerciseDemoModal exercise={demo} visible={Boolean(demo)} onClose={() => setDemo(null)} />
  </SafeAreaView>;
}

function timeline(workout: GeneratedWorkout, startsAt: string, now: number): TimelineState {
  const raw = Math.floor((now - new Date(startsAt).getTime()) / 1000);
  if (raw < 0) return { kind: 'countdown', remaining: Math.max(1, Math.ceil(-raw)), stationIndex: 0, elapsed: 0 };
  let cursor = raw;
  for (let index = 0; index < workout.stations.length; index += 1) {
    const station = workout.stations[index]!;
    if (cursor < station.durationSeconds) return { kind: 'work', remaining: station.durationSeconds - cursor, stationIndex: index, elapsed: raw };
    cursor -= station.durationSeconds;
    if (index < workout.stations.length - 1) {
      if (cursor < workout.request.restSeconds) return { kind: 'rest', remaining: workout.request.restSeconds - cursor, stationIndex: index, elapsed: raw };
      cursor -= workout.request.restSeconds;
    }
  }
  return { kind: 'complete', remaining: 0, stationIndex: Math.max(0, workout.stations.length - 1), elapsed: raw };
}
function formatTime(seconds: number) { return `${Math.floor(seconds / 60)}:${Math.max(0, seconds % 60).toString().padStart(2, '0')}`; }
function prescription(target: number, unit: 'total'|'per_side'|'seconds') { return unit === 'seconds' ? `${target} seconds` : unit === 'per_side' ? `${target} per side` : `${target} reps`; }
function NextStation({ station, onDemo, styles }: { station: WorkoutStation; onDemo: (exercise: Exercise) => void; styles: ReturnType<typeof makeStyles> }) { return <View style={styles.stationCard}><Text style={styles.timerLabel}>UP NEXT</Text><Text style={styles.purpose}>{station.purpose}</Text>{station.exercises.map((item) => <View key={item.exerciseId} style={styles.exercise}><View style={{ flex: 1 }}><Text style={styles.exerciseName}>{item.exerciseSnapshot.name}</Text><Text style={styles.body}>{prescription(item.target, item.unit)}</Text></View><Pressable onPress={() => onDemo(item.exerciseSnapshot)} style={styles.demo}><Text style={styles.demoText}>Demo</Text></Pressable></View>)}</View>; }

function makeStyles(palette: AppPalette) { return StyleSheet.create({
  safe:{flex:1,backgroundColor:palette.canvas},center:{flex:1,justifyContent:'center',padding:26,gap:14},title:{...typography.h1,color:palette.ink},body:{...typography.body,color:palette.inkMuted},secondary:{borderWidth:1,borderColor:palette.forest,borderRadius:15,padding:14,alignItems:'center'},secondaryText:{color:palette.forest,fontWeight:'900'},countdown:{flex:1,alignItems:'center',justifyContent:'center',padding:28,gap:12},eyebrow:{...typography.eyebrow,color:palette.forest},countNumber:{fontSize:118,lineHeight:126,fontWeight:'900',color:palette.forest,fontVariant:['tabular-nums']},countTitle:{...typography.h1,color:palette.ink,textAlign:'center'},complete:{flex:1,justifyContent:'center',padding:28,gap:14},completeTitle:{fontSize:36,lineHeight:42,fontWeight:'900',color:palette.ink},primary:{backgroundColor:palette.forest,borderRadius:16,padding:16,alignItems:'center',marginTop:8},primaryText:{color:palette.white,fontWeight:'900'},top:{backgroundColor:palette.surface,borderBottomWidth:1,borderBottomColor:palette.border,paddingHorizontal:20,paddingVertical:14,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},topTitle:{fontSize:19,fontWeight:'900',color:palette.ink,marginTop:3},end:{color:palette.danger,fontWeight:'900'},content:{padding:20,paddingBottom:50,gap:14},timerCard:{backgroundColor:palette.mint,borderRadius:26,padding:24,alignItems:'center'},restCard:{backgroundColor:palette.sand},timerLabel:{...typography.eyebrow,color:palette.forest},timer:{fontSize:72,lineHeight:82,fontWeight:'900',color:palette.ink,fontVariant:['tabular-nums']},syncNote:{...typography.small,color:palette.inkMuted},stationCard:{backgroundColor:palette.surface,borderWidth:1,borderColor:palette.border,borderRadius:22,padding:16,gap:8},purpose:{...typography.h2,color:palette.ink,marginBottom:3},exercise:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:10,borderBottomWidth:1,borderBottomColor:palette.border},exerciseName:{fontSize:17,fontWeight:'900',color:palette.ink},adaptation:{...typography.small,color:palette.forest,marginTop:3},demo:{borderWidth:1,borderColor:palette.forest,borderRadius:10,paddingHorizontal:10,paddingVertical:8},demoText:{color:palette.forest,fontWeight:'900',fontSize:12},roundCard:{backgroundColor:palette.surface,borderWidth:1,borderColor:palette.border,borderRadius:20,padding:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},roundTitle:{fontSize:16,fontWeight:'900',color:palette.ink},roundControls:{flexDirection:'row',alignItems:'center',gap:13},roundButton:{width:42,height:42,borderRadius:21,borderWidth:1,borderColor:palette.forest,alignItems:'center',justifyContent:'center'},roundButtonText:{fontSize:24,color:palette.forest,fontWeight:'800'},roundValue:{fontSize:24,fontWeight:'900',color:palette.ink,minWidth:28,textAlign:'center'},privacy:{backgroundColor:palette.surfaceMuted,borderRadius:18,padding:15},privacyTitle:{fontSize:15,fontWeight:'900',color:palette.ink,marginBottom:4},
}); }
