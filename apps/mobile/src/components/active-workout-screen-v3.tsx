import type {
  Exercise,
  ExerciseLoadHistoryEntry,
  ExerciseSwapReason,
  WorkoutDifficultyFeedback,
  WorkoutExercisePrescription,
  WorkoutStation,
} from '@circuit/domain';
import { listExerciseSwapCandidates, swapExerciseInWorkout, type ExerciseSwapCandidate } from '@circuit/generator';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CompletedWorkoutBodyMap } from '@/components/completed-workout-body-map';
import { ExerciseDemoModal } from '@/components/exercise-demo-modal';
import { ExerciseSwapModal } from '@/components/exercise-swap-modal';
import { KeyboardSafeScreen } from '@/components/keyboard-safe-screen';
import { ProductDisclosure } from '@/components/product-ui';
import { WorkoutShareModal } from '@/components/workout-share-modal';
import { V23Chip, V23Icon } from '@/components/v23-ui';
import {
  getLatestExerciseLoads,
  getSocialPreferences,
  getWorkoutLedgerEntry,
  listExercisePreferences,
  listWorkoutLedgerEntries,
  saveCompletedWorkout,
  saveExercisePreference,
  saveFavoriteWorkout,
  saveWorkoutFeedback,
  saveWorkoutReflection,
  type LoadBasis,
  type LoggedSet,
} from '@/services/database';
import { useExerciseCatalog } from '@/services/exercise-catalog';
import {
  clearLiveWorkoutSession,
  loadLiveWorkoutSession,
  saveLiveWorkoutSession,
  type LiveWorkoutLoadValue as LoadValue,
  type LiveWorkoutRestEntry as RestEntry,
  type LiveWorkoutSessionSnapshot,
} from '@/services/active-workout-persistence';
import {
  activeWorkoutCompletionFraction,
  activeWorkoutCompletionRecordId,
  completionSaveEyebrow,
  type ActiveWorkoutCompletionSaveState,
} from '@/services/active-workout-execution';
import { publishWorkoutActivity } from '@/services/social';
import { buildCompletedWorkoutSummary } from '@/services/workout-summary';
import {
  getWorkoutCuePreferences,
  saveWorkoutCuePreferences,
  type WorkoutCuePreferences,
} from '@/services/workout-cues';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';
import { useWorkoutContext } from '@/state/workout-context';
import type { DesignTokens } from '@/theme';

// Legacy validation contract: REST + RECORD · Rounds completed · Log what you did
// Execution V3 contract: Finish station · Save and start next station · Save workout and return to Today
type Phase = 'work' | 'rest' | 'complete';

export default function ActiveWorkoutScreenV3() {
  const { exercises } = useExerciseCatalog();
  const { user, cloudEnabled } = useAuth();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const cuePlayer = useAudioPlayer(require('../../assets/audio/workout-cue.wav'));
  const completionPlayer = useAudioPlayer(require('../../assets/audio/workout-complete.wav'));

  useKeepAwake();
  const router = useRouter();
  const {
    activeWorkout: workout,
    activePlanLink,
    updateActiveWorkout,
    clearActiveWorkout,
    workoutSessionReady,
    restoredActiveWorkout,
  } = useWorkoutContext();
  const [stationIndex, setStationIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('work');
  const [remainingSeconds, setRemainingSeconds] = useState(workout?.stations[0]?.durationSeconds ?? 0);
  const [running, setRunning] = useState(false);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const [stationRounds, setStationRounds] = useState<Record<string, number>>({});
  const [exerciseLoads, setExerciseLoads] = useState<Record<string, LoadValue>>({});
  const [exerciseSets, setExerciseSets] = useState<Record<string, LoggedSet[]>>({});
  const [latestLoads, setLatestLoads] = useState<Record<string, ExerciseLoadHistoryEntry>>({});
  const [restEntries, setRestEntries] = useState<Record<string, RestEntry>>({});
  const [restRounds, setRestRounds] = useState(1);
  const [restLoadUnit, setRestLoadUnit] = useState<'lb' | 'kg'>('lb');
  const [showReflection, setShowReflection] = useState(false);
  const [completionDetailsOpen, setCompletionDetailsOpen] = useState(false);
  const [demoExercise, setDemoExercise] = useState<Exercise | null>(null);
  const [swapTarget, setSwapTarget] = useState<{ stationId: string; exercise: Exercise } | null>(null);
  const [swapBusy, setSwapBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState<WorkoutDifficultyFeedback | null>(null);
  const [sessionRpe, setSessionRpe] = useState<number | null>(null);
  const [energyAfter, setEnergyAfter] = useState<number | null>(null);
  const [reflectionNotes, setReflectionNotes] = useState('');
  const [reflectionSaved, setReflectionSaved] = useState(false);
  const [cuePreferences, setCuePreferences] = useState<WorkoutCuePreferences>(() => getWorkoutCuePreferences());
  const [cueSettingsOpen, setCueSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [completionSaveState, setCompletionSaveState] = useState<ActiveWorkoutCompletionSaveState>('idle');
  const [completionSaveMessage, setCompletionSaveMessage] = useState<string | null>(null);
  const startedAt = useRef(new Date().toISOString());
  const completedAt = useRef<string | null>(null);
  const savedCompletion = useRef(false);
  const cueKey = useRef<string | null>(null);
  const hardwareLeaveRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!workoutSessionReady) return;
    if (!workout) {
      setSessionHydrated(true);
      return;
    }
    let live = true;
    void loadLiveWorkoutSession().then((snapshot) => {
      if (!live) return;
      if (snapshot?.workout.id === workout.id) {
        const safeIndex = Math.min(Math.max(0, snapshot.stationIndex), Math.max(0, workout.stations.length - 1));
        const safeStation = workout.stations[safeIndex];
        setStationIndex(safeIndex);
        setPhase(snapshot.phase);
        setRemainingSeconds(Math.min(
          Math.max(0, snapshot.remainingSeconds),
          snapshot.phase === 'work'
            ? (safeStation?.durationSeconds ?? snapshot.remainingSeconds)
            : Math.max(15, workout.request.restSeconds),
        ));
        setRunning(restoredActiveWorkout ? false : snapshot.running);
        setStationRounds(snapshot.stationRounds);
        setExerciseLoads(snapshot.exerciseLoads);
        setExerciseSets(snapshot.exerciseSets);
        setRestEntries(snapshot.restEntries);
        setRestRounds(snapshot.restRounds);
        setRestLoadUnit(snapshot.restLoadUnit);
        startedAt.current = snapshot.startedAt;
        const progressed = safeIndex > 0
          || snapshot.phase === 'rest'
          || snapshot.remainingSeconds < (safeStation?.durationSeconds ?? snapshot.remainingSeconds)
          || Object.keys(snapshot.stationRounds).length > 0;
        if (restoredActiveWorkout || progressed) {
          setResumeNotice(restoredActiveWorkout
            ? 'Workout restored. The timer is paused so nothing advances without you.'
            : 'Workout resumed from your last saved point.');
        }
      } else {
        setRunning(true);
      }
      setSessionHydrated(true);
    });
    return () => { live = false; };
  }, [restoredActiveWorkout, workout?.id, workoutSessionReady]);

  const station = workout?.stations[stationIndex] ?? null;
  const isFinalStation = Boolean(workout && stationIndex === workout.stations.length - 1);
  const nextStation = workout?.stations[stationIndex + 1] ?? null;
  const totalPlannedSeconds = workout?.estimatedElapsedSeconds ?? 0;

  useEffect(() => {
    void getLatestExerciseLoads().then(setLatestLoads);
    void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      hardwareLeaveRef.current();
      return true;
    });
    return () => subscription.remove();
  }, []);

  const elapsedSeconds = useMemo(() => {
    if (!workout) return 0;
    let completed = 0;
    for (let index = 0; index < stationIndex; index += 1) {
      completed += workout.stations[index]!.durationSeconds + workout.request.restSeconds;
    }
    if (phase === 'work') completed += (station?.durationSeconds ?? 0) - remainingSeconds;
    if (phase === 'rest') completed += station?.durationSeconds ?? 0;
    if (phase === 'complete') completed = totalPlannedSeconds;
    return Math.max(0, Math.min(totalPlannedSeconds, completed));
  }, [phase, remainingSeconds, station, stationIndex, totalPlannedSeconds, workout]);

  useEffect(() => {
    if (!workout || !sessionHydrated || phase === 'complete') return;
    const timer = setTimeout(() => {
      void saveLiveWorkoutSession({
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        workout,
        startedAt: startedAt.current,
        stationIndex,
        phase,
        remainingSeconds,
        running,
        stationRounds,
        exerciseLoads,
        exerciseSets,
        restEntries,
        restRounds,
        restLoadUnit,
        planLink: activePlanLink ?? undefined,
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [activePlanLink, exerciseLoads, exerciseSets, phase, remainingSeconds, restEntries, restLoadUnit, restRounds, running, sessionHydrated, stationIndex, stationRounds, workout]);

  useEffect(() => {
    if (!workout || !sessionHydrated || phase === 'complete') return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') return;
      setRunning(false);
      void saveLiveWorkoutSession({
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        workout,
        startedAt: startedAt.current,
        stationIndex,
        phase,
        remainingSeconds,
        running: false,
        stationRounds,
        exerciseLoads,
        exerciseSets,
        restEntries,
        restRounds,
        restLoadUnit,
        planLink: activePlanLink ?? undefined,
      });
    });
    return () => subscription.remove();
  }, [activePlanLink, exerciseLoads, exerciseSets, phase, remainingSeconds, restEntries, restLoadUnit, restRounds, sessionHydrated, stationIndex, stationRounds, workout]);

  useEffect(() => {
    if (!resumeNotice) return;
    const timer = setTimeout(() => setResumeNotice(null), 7000);
    return () => clearTimeout(timer);
  }, [resumeNotice]);

  useEffect(() => {
    if (!workout || !sessionHydrated || !running || phase === 'complete') return;
    const timer = setInterval(() => setRemainingSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, [phase, running, sessionHydrated, workout]);

  useEffect(() => {
    if (!workout || phase === 'complete') return;
    const thresholds = phase === 'work' ? cuePreferences.workCueSeconds : cuePreferences.restCueSeconds;
    const inFinalCountdown = cuePreferences.finalCountdownEnabled && remainingSeconds <= 5 && remainingSeconds > 0;
    if (!thresholds.includes(remainingSeconds) && !inFinalCountdown) return;
    const nextKey = `${phase}:${stationIndex}:${remainingSeconds}`;
    if (cueKey.current === nextKey) return;
    cueKey.current = nextKey;
    if (cuePreferences.audioEnabled) {
      void cuePlayer.seekTo(0).then(() => cuePlayer.play()).catch(() => undefined);
    }
    if (cuePreferences.hapticsEnabled) {
      void Haptics.impactAsync(remainingSeconds <= 5 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    }
  }, [cuePlayer, cuePreferences, phase, remainingSeconds, stationIndex, workout]);

  useEffect(() => {
    if (!workout || remainingSeconds !== 0 || phase !== 'work') return;
    setPhase('rest');
    setRunning(true);
    setRemainingSeconds(Math.max(15, workout.request.restSeconds));
    initializeRestLog(station ?? workout.stations[stationIndex]!);
    if (cuePreferences.audioEnabled) void completionPlayer.seekTo(0).then(() => completionPlayer.play()).catch(() => undefined);
    if (cuePreferences.hapticsEnabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [completionPlayer, cuePreferences.audioEnabled, cuePreferences.hapticsEnabled, phase, remainingSeconds, station, stationIndex, workout]);

  hardwareLeaveRef.current = () => {
    if (phase === 'complete') {
      if (completionSaveState === 'saved') void finishAndExit();
      return;
    }
    void pauseAndLeave();
  };

  if (!workoutSessionReady || (workout && !sessionHydrated)) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.missingCard}><Text style={styles.completeTitle}>Restoring workout…</Text><Text style={styles.helper}>Loading the last saved station and timer state.</Text></View></SafeAreaView>;
  }

  if (!workout || !station) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.missingCard}><Text style={styles.completeTitle}>No active workout</Text><Pressable onPress={() => router.replace('/' as Href)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Return home</Text></Pressable></View></SafeAreaView>;
  }

  const activeWorkout = workout;
  const currentStation = station;
  const completedSummary = buildCompletedWorkoutSummary({
    workout: activeWorkout,
    completedAt: completedAt.current ?? undefined,
    durationMinutes: Math.max(1, elapsedSeconds / 60),
    stationRounds,
    exerciseSets,
  });

  async function persistExecutionCheckpoint(
    overrides: Partial<LiveWorkoutSessionSnapshot> = {},
  ): Promise<void> {
    if (!workout) return;
    await saveLiveWorkoutSession({
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      workout,
      startedAt: startedAt.current,
      stationIndex,
      phase: phase === 'complete' ? 'rest' : phase,
      remainingSeconds,
      running,
      stationRounds,
      exerciseLoads,
      exerciseSets,
      restEntries,
      restRounds,
      restLoadUnit,
      planLink: activePlanLink ?? undefined,
      ...overrides,
    });
  }

  function initializeRestLog(targetStation: WorkoutStation) {
    setRestRounds(Math.max(1, stationRounds[targetStation.id] ?? 1));
    const preferredUnit = targetStation.exercises.map((item) => latestLoads[item.exerciseId]?.loadUnit).find(Boolean) ?? 'lb';
    setRestLoadUnit(preferredUnit);
    setRestEntries(Object.fromEntries(targetStation.exercises.map((item) => {
      const previous = latestLoads[item.exerciseId];
      return [item.exerciseId, {
        reps: String(item.target),
        load: previous ? String(previous.loadValue) : '',
        unit: preferredUnit,
        skipped: false,
      } satisfies RestEntry];
    })));
  }

  function changeRestLoadUnit(unit: 'lb' | 'kg') {
    setRestLoadUnit(unit);
    setRestEntries((current) => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, { ...value, unit }])));
  }

  async function persistCompletion(
    completionFraction: number,
    override?: { stationRounds: Record<string, number>; exerciseLoads: Record<string, LoadValue>; exerciseSets: Record<string, LoggedSet[]> },
  ) {
    if (savedCompletion.current) return;
    savedCompletion.current = true;
    setCompletionSaveState('saving');
    setCompletionSaveMessage(null);

    const timestamp = completedAt.current ?? new Date().toISOString();
    completedAt.current = timestamp;
    const completionRecordId = activeWorkoutCompletionRecordId(activeWorkout.id, startedAt.current);
    const completedRounds = override?.stationRounds ?? stationRounds;
    const completedLoads = override?.exerciseLoads ?? exerciseLoads;
    const completedSets = override?.exerciseSets ?? exerciseSets;

    try {
      await saveCompletedWorkout({
        workout: activeWorkout,
        startedAt: startedAt.current,
        completedAt: timestamp,
        completionFraction,
        stationRounds: completedRounds,
        exerciseLoads: completedLoads,
        exerciseSets: completedSets,
        plannedSessionId: activePlanLink?.sessionId,
        relationToPlan: activePlanLink ? 'completed_planned' : 'unrelated',
        idempotencyKey: completionRecordId,
      });
      await clearLiveWorkoutSession();
      setCompletionSaveState('saved');

      if (cloudEnabled && user?.mode === 'cloud') {
        void (async () => {
          try {
            const [entry, preferences, weekEntries] = await Promise.all([
              getWorkoutLedgerEntry(completionRecordId),
              getSocialPreferences(),
              listWorkoutLedgerEntries({ from: startOfWeekIso(), limit: 100 }),
            ]);
            if (entry) {
              await publishWorkoutActivity({
                userId: user.id,
                ledgerId: entry.id,
                workoutType: activeWorkout.source === 'manual' ? 'Custom strength' : 'Side Quest strength',
                title: entry.name,
                durationMinutes: Math.max(1, Math.round(activeWorkout.estimatedElapsedSeconds * completionFraction / 60)),
                weeklyCount: weekEntries.length,
                completedAt: timestamp,
                exercises: entry.exercises,
                preferences,
              });
            }
          } catch {
            // Local completion remains authoritative if optional social publishing fails.
          }
        })();
      }
    } catch (cause) {
      savedCompletion.current = false;
      setCompletionSaveState('error');
      setCompletionSaveMessage(cause instanceof Error
        ? cause.message
        : 'Side Quest could not save this workout locally. Your active workout is still preserved so you can retry.');
    }
  }

  function setCuePrefs(next: WorkoutCuePreferences) {
    setCuePreferences(next);
    saveWorkoutCuePreferences(next);
  }

  function commitRestLog(): {
    stationRounds: Record<string, number>;
    exerciseLoads: Record<string, LoadValue>;
    exerciseSets: Record<string, LoggedSet[]>;
  } {
    const rounds = Math.max(1, restRounds);
    const nextRounds = { ...stationRounds, [currentStation.id]: rounds };
    setStationRounds(nextRounds);
    const nextSets = { ...exerciseSets };
    const nextLoads = { ...exerciseLoads };
    for (const item of currentStation.exercises) {
      const entry = restEntries[item.exerciseId];
      if (!entry || entry.skipped) {
        nextSets[item.exerciseId] = [];
        delete nextLoads[item.exerciseId];
        continue;
      }
      const actual = Math.max(0, Number(entry.reps) || item.target);
      const load = Number(entry.load);
      const loadBasis = defaultLoadBasis(item.exerciseSnapshot);
      nextSets[item.exerciseId] = Array.from({ length: rounds }, (_, index) => ({
        id: `${activeWorkout.id}_${currentStation.id}_${item.exerciseId}_${index}_${Date.now()}`,
        reps: item.unit === 'seconds' ? undefined : actual,
        seconds: item.unit === 'seconds' ? actual : undefined,
        loadValue: Number.isFinite(load) && load > 0 ? load : undefined,
        loadUnit: Number.isFinite(load) && load > 0 ? entry.unit : undefined,
        loadBasis,
        completed: true,
      } satisfies LoggedSet));
      if (Number.isFinite(load) && load > 0) {
        nextLoads[item.exerciseId] = { value: load, unit: entry.unit, name: item.exerciseSnapshot.name };
      } else {
        delete nextLoads[item.exerciseId];
      }
    }
    setExerciseSets(nextSets);
    setExerciseLoads(nextLoads);
    return { stationRounds: nextRounds, exerciseLoads: nextLoads, exerciseSets: nextSets };
  }

  function continueAfterRest(log: boolean) {
    const logged = log ? commitRestLog() : undefined;
    if (isFinalStation) {
      setPhase('complete');
      setRunning(false);
      void persistCompletion(1, logged);
      return;
    }
    const nextIndex = stationIndex + 1;
    const nextRemaining = activeWorkout.stations[nextIndex]!.durationSeconds;
    void persistExecutionCheckpoint({
      stationIndex: nextIndex,
      phase: 'work',
      remainingSeconds: nextRemaining,
      running: true,
      stationRounds: logged?.stationRounds ?? stationRounds,
      exerciseLoads: logged?.exerciseLoads ?? exerciseLoads,
      exerciseSets: logged?.exerciseSets ?? exerciseSets,
    });
    setStationIndex(nextIndex);
    setPhase('work');
    setRemainingSeconds(nextRemaining);
    setRunning(true);
    cueKey.current = null;
    if (cuePreferences.hapticsEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }

  function skipWorkPhase() {
    if (phase === 'work') setRemainingSeconds(0);
  }

  async function pauseAndLeave() {
    setRunning(false);
    if (workout) await persistExecutionCheckpoint({ running: false });
    router.replace('/' as Href);
  }

  async function discardAndExit() {
    await clearLiveWorkoutSession();
    clearActiveWorkout();
    router.replace('/train' as Href);
  }

  function endEarly() {
    Alert.alert('End workout?', 'Save the work you completed, discard this session, or keep training.', [
      { text: 'Keep training', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => { void discardAndExit(); } },
      {
        text: 'Save partial',
        onPress: () => {
          const logged = phase === 'rest' ? commitRestLog() : undefined;
          const fraction = activeWorkoutCompletionFraction(elapsedSeconds, totalPlannedSeconds);
          setPhase('complete');
          setRunning(false);
          void persistCompletion(fraction, logged);
        },
      },
    ]);
  }

  async function finishAndExit() {
    if (!workout || completionSaveState !== 'saved') return;
    const completed = completedAt.current;
    if (completed && (sessionRpe !== null || energyAfter !== null || reflectionNotes.trim())) {
      const instanceId = activeWorkoutCompletionRecordId(workout.id, startedAt.current);
      await saveWorkoutReflection({
        workoutInstanceId: instanceId,
        workoutId: workout.id,
        workoutName: workout.name,
        rpe: sessionRpe ?? undefined,
        energyAfter: energyAfter ?? undefined,
        notes: reflectionNotes.trim() || undefined,
        completedAt: completed,
        createdAt: new Date().toISOString(),
      });
      setReflectionSaved(true);
    }
    clearActiveWorkout();
    router.replace((activePlanLink ? '/(tabs)/plan' : '/') as Href);
  }

  async function saveFavorite() {
    await saveFavoriteWorkout(activeWorkout);
    setSaved(true);
  }

  async function recordFeedback(value: WorkoutDifficultyFeedback) {
    await saveWorkoutFeedback({
      workoutInstanceId: activeWorkoutCompletionRecordId(activeWorkout.id, startedAt.current),
      workoutId: activeWorkout.id,
      difficulty: value,
    });
    setFeedback(value);
    if (cuePreferences.hapticsEnabled) void Haptics.selectionAsync();
  }

  async function loadSwapCandidates(reason: ExerciseSwapReason): Promise<ExerciseSwapCandidate[]> {
    if (!swapTarget) return [];
    const exercisePreferences = await listExercisePreferences();
    const result = listExerciseSwapCandidates({
      workout: activeWorkout,
      stationId: swapTarget.stationId,
      exerciseId: swapTarget.exercise.id,
      reason,
      context: { exercises, exercisePreferences },
    });
    if (!result.ok) throw new Error(result.message);
    return result.candidates;
  }

  async function handleSwap(reason: ExerciseSwapReason, candidateId: string) {
    if (!swapTarget) return;
    setSwapBusy(true);
    try {
      const exercisePreferences = await listExercisePreferences();
      const result = swapExerciseInWorkout({
        workout: activeWorkout,
        stationId: swapTarget.stationId,
        exerciseId: swapTarget.exercise.id,
        reason,
        candidateId,
        context: { exercises, exercisePreferences },
      });
      if (!result.ok) {
        Alert.alert('Replacement unavailable', result.message);
        return;
      }
      const nextPlanLink = activePlanLink
        ? { ...activePlanLink, modifiedFromPlan: true }
        : undefined;
      await persistExecutionCheckpoint({
        workout: result.workout,
        planLink: nextPlanLink,
        running,
      });
      updateActiveWorkout(result.workout, { modifiedFromPlan: true });
      if (reason === 'dislike') {
        await saveExercisePreference({ exerciseId: swapTarget.exercise.id, preference: 'disliked', familiarity: 'familiar' });
      }
      setSwapTarget(null);
    } finally {
      setSwapBusy(false);
    }
  }

  if (phase === 'complete') {
    const rounds = Object.values(stationRounds).reduce((sum, value) => sum + value, 0);
    return (
      <SafeAreaView style={styles.safeArea}>
        <KeyboardSafeScreen contentContainerStyle={styles.completeContainer}>
          <View style={styles.completeHero}>
            <View style={styles.completeIcon}><V23Icon name={completionSaveState === 'saved' ? 'check' : 'clock'} color="#FFFFFF" size={23} /></View>
            <Text style={styles.completeEyebrow}>{completionSaveEyebrow(completionSaveState)}</Text>
            <Text style={styles.completeTitle}>{activeWorkout.name}</Text>
            <Text style={styles.completeBody}>
              {completionSaveState === 'error'
                ? (completionSaveMessage ?? 'The local save needs to be retried. Your workout checkpoint is still preserved.')
                : completionSaveState === 'saving'
                  ? 'Saving the completed workout locally before you leave this screen.'
                  : activePlanLink
                    ? `${activePlanLink.sessionTitle} is complete${activePlanLink.modifiedFromPlan ? ' as modified' : ''}. The completed record is already part of the plan.`
                    : 'This session is saved to your training history.'}
            </Text>
            {completionSaveState === 'error' ? <Pressable
              accessibilityRole="button"
              onPress={() => void persistCompletion(
                activeWorkoutCompletionFraction(elapsedSeconds, totalPlannedSeconds),
              )}
              style={styles.retrySaveButton}
            >
              <Text style={styles.retrySaveText}>Retry local save</Text>
            </Pressable> : null}
            <View style={styles.summaryRow}>
              <SummaryMetric label="Time" value={`${Math.max(1, Math.round(elapsedSeconds / 60))} min`} styles={styles} />
              <SummaryMetric label="Stations" value={String(activeWorkout.stations.length)} styles={styles} />
              <SummaryMetric label="Rounds" value={String(rounds)} styles={styles} />
            </View>
          </View>

          <View style={styles.feedbackCard}>
            <Text style={styles.sectionEyebrow}>QUICK FEEDBACK</Text>
            <Text style={styles.cardTitle}>How did that prescription feel?</Text>
            <Text style={styles.helper}>This helps tune future exercise doses. It does not grade the workout.</Text>
            <View style={styles.feedbackRow}>
              <ChoiceButton label="Too easy" selected={feedback === 'too_easy'} onPress={() => void recordFeedback('too_easy')} styles={styles} />
              <ChoiceButton label="About right" selected={feedback === 'appropriate'} onPress={() => void recordFeedback('appropriate')} styles={styles} />
              <ChoiceButton label="Too hard" selected={feedback === 'too_hard'} onPress={() => void recordFeedback('too_hard')} styles={styles} />
            </View>
            <View style={styles.coachLine}>
              <V23Icon name="insights" color={tokens.accent} size={17} />
              <Text style={styles.coachLineText}>{feedbackMessage(feedback)}</Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/today-check-in' as Href)}
            style={({ pressed }) => [styles.symptomButton, pressed && styles.pressed]}
          >
            <View style={styles.symptomIcon}><V23Icon name="heart" color={tokens.danger} size={18} /></View>
            <View style={styles.symptomCopy}>
              <Text style={styles.cardTitle}>Something hurt or tightened up?</Text>
              <Text style={styles.helper}>Log the exact area separately so the next recommendation can protect it.</Text>
            </View>
            <V23Icon name="chevron" color={tokens.textMuted} size={15} />
          </Pressable>

          <ProductDisclosure
            title="Private reflection"
            summary="Optional effort, energy, or note for future recommendations."
            expanded={showReflection}
            onPress={() => setShowReflection((value) => !value)}
          >
            <View style={styles.reflectionBody}>
              <Text style={styles.fieldPrompt}>Whole-session effort</Text>
              <NumberScale
                values={[1,2,3,4,5,6,7,8,9,10]}
                selected={sessionRpe}
                onSelect={(value) => { setSessionRpe(value); setReflectionSaved(false); }}
                styles={styles}
                compact
              />
              <Text style={styles.fieldPrompt}>Energy after</Text>
              <NumberScale
                values={[1,2,3,4,5]}
                selected={energyAfter}
                onSelect={(value) => { setEnergyAfter(value); setReflectionSaved(false); }}
                styles={styles}
              />
              <TextInput
                value={reflectionNotes}
                onChangeText={(value) => { setReflectionNotes(value); setReflectionSaved(false); }}
                multiline
                returnKeyType="done"
                blurOnSubmit
                placeholder="Optional note"
                placeholderTextColor={tokens.textMuted}
                style={styles.reflectionInput}
              />
              {reflectionSaved ? <Text style={styles.savedNote}>Reflection saved.</Text> : null}
            </View>
          </ProductDisclosure>

          <ProductDisclosure
            title="Workout details"
            summary="Body-region summary, sharing, and favorites."
            expanded={completionDetailsOpen}
            onPress={() => setCompletionDetailsOpen((value) => !value)}
          >
            <View style={styles.detailsBody}>
              <CompletedWorkoutBodyMap regionLoads={completedSummary.regionLoads} />
              <Pressable onPress={() => setShareOpen(true)} style={({ pressed }) => [styles.detailAction, pressed && styles.pressed]}>
                <View style={styles.detailIcon}><V23Icon name="more" color={tokens.accent} size={17} /></View>
                <View style={styles.detailCopy}><Text style={styles.detailTitle}>Share workout summary</Text><Text style={styles.detailText}>Choose exactly what appears. Pain, restrictions, and notes stay private.</Text></View>
                <V23Icon name="chevron" color={tokens.textMuted} size={15} />
              </Pressable>
              <Pressable onPress={() => void saveFavorite()} style={({ pressed }) => [styles.detailAction, pressed && styles.pressed]}>
                <View style={styles.detailIcon}><V23Icon name="heart" color={tokens.accent} size={17} /></View>
                <View style={styles.detailCopy}><Text style={styles.detailTitle}>{saved ? 'Saved to favorites' : 'Save to favorites'}</Text><Text style={styles.detailText}>Keep this workout available for a future one-off session.</Text></View>
                <V23Icon name={saved ? 'check' : 'chevron'} color={tokens.textMuted} size={15} />
              </Pressable>
            </View>
          </ProductDisclosure>

          <Pressable
            disabled={completionSaveState !== 'saved'}
            onPress={() => void finishAndExit()}
            style={({ pressed }) => [styles.doneButton, completionSaveState !== 'saved' && styles.doneButtonDisabled, pressed && completionSaveState === 'saved' && styles.pressed]}
          >
            <Text style={styles.doneButtonText}>{completionSaveState === 'saved' ? (activePlanLink ? 'Done · back to Week' : 'Done') : 'Saving…'}</Text>
            <V23Icon name="chevron" color="#FFFFFF" size={16} />
          </Pressable>
          <Text style={styles.doneNote}>{completionSaveState === 'saved'
            ? 'Your completed training is saved. Feedback and reflection are optional.'
            : completionSaveState === 'error'
              ? 'Retry the local save before leaving so this workout cannot be lost.'
              : 'Keep this screen open until the local save finishes.'}</Text>
        </KeyboardSafeScreen>
        <WorkoutShareModal summary={completedSummary} visible={shareOpen} onClose={() => setShareOpen(false)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.topBar}>
        <View style={styles.topCopy}>
          <Text style={styles.eyebrow}>STATION {currentStation.order} OF {activeWorkout.stations.length}</Text>
          <Text style={styles.topTitle}>{phase === 'rest' ? 'Recover + record' : currentStation.purpose}</Text>
        </View>
        <Pressable accessibilityLabel="Workout cue settings" onPress={() => setCueSettingsOpen(true)} style={styles.iconHeaderButton}>
          <V23Icon name="settings" color={tokens.text} size={19} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void pauseAndLeave()} style={styles.leaveButton}>
          <Text style={styles.leaveButtonText}>Leave</Text>
        </Pressable>
      </View>

      <StationProgressRail stationIndex={stationIndex} stationCount={activeWorkout.stations.length} styles={styles} />

      {resumeNotice ? <Pressable onPress={() => setResumeNotice(null)} style={styles.resumeBanner}>
        <V23Icon name="play" color={tokens.accent} size={16} />
        <Text style={styles.resumeBannerText}>{resumeNotice}</Text>
      </Pressable> : null}

      <KeyboardSafeScreen contentContainerStyle={styles.content}>
        {activePlanLink ? <View style={styles.planContext}>
          <V23Icon name="plan" color={tokens.accent} size={15} />
          <Text style={styles.planContextText}>Planned {formatPlanDate(activePlanLink.sessionDate)} · {activePlanLink.sessionTitle}{activePlanLink.modifiedFromPlan ? ' · Customized' : ''}</Text>
        </View> : null}

        <View style={[styles.timerHero, phase === 'rest' && styles.restHero]}>
          <View style={styles.timerTopLine}>
            <Text style={styles.phaseLabel}>{phase === 'rest' ? (remainingSeconds > 0 ? 'RECOVER' : 'READY') : 'WORK'}</Text>
            <V23Chip tone={phase === 'rest' ? 'warm' : 'accent'}>{running ? 'Running' : 'Paused'}</V23Chip>
          </View>
          <Text style={styles.timer}>{formatTime(remainingSeconds)}</Text>
          <Text style={styles.timerContext}>{phase === 'rest'
            ? (isFinalStation ? 'Log the final station, then finish.' : `Next: ${nextStation?.purpose ?? 'next station'}`)
            : `${currentStation.exercises.length} movement${currentStation.exercises.length === 1 ? '' : 's'} · quality first`}</Text>
          {phase === 'work' ? <Pressable onPress={() => setRunning((value) => !value)} style={styles.timerControl}>
            <V23Icon name={running ? 'pause' : 'play'} color="#FFFFFF" size={15} />
            <Text style={styles.timerControlText}>{running ? 'Pause timer' : 'Resume timer'}</Text>
          </Pressable> : null}
        </View>

        {phase === 'work' ? <>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionEyebrow}>THIS STATION</Text>
            <Text style={styles.sectionTitle}>{currentStation.purpose}</Text>
          </View>
          <View style={styles.stationCard}>
            {currentStation.exercises.map((item, index) => <ActiveExerciseRow
              key={item.exerciseId}
              item={item}
              index={index}
              onDemo={() => setDemoExercise(item.exerciseSnapshot)}
              onSwap={() => setSwapTarget({ stationId: currentStation.id, exercise: item.exerciseSnapshot })}
              styles={styles}
              tokens={tokens}
            />)}
          </View>

          <View style={styles.upNextStrip}>
            <View style={styles.upNextIcon}><V23Icon name="clock" color={tokens.accent} size={17} /></View>
            <View style={styles.upNextCopy}>
              <Text style={styles.nextLabel}>UP NEXT</Text>
              <Text style={styles.nextTitle}>{isFinalStation
                ? 'Recover, log this station, then finish.'
                : `${Math.max(1, Math.round(activeWorkout.request.restSeconds / 60))} min recovery · ${nextStation?.purpose ?? 'next station'}`}</Text>
              {nextStation ? <Text style={styles.nextDetail}>{nextStation.exercises.map((item) => item.exerciseSnapshot.name).join(' · ')}</Text> : null}
            </View>
          </View>

          <Pressable onPress={endEarly} style={({ pressed }) => [styles.endEarlyRow, pressed && styles.pressed]}>
            <Text style={styles.endEarlyText}>End workout early</Text>
          </Pressable>
        </> : <>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionEyebrow}>LOG THE STATION</Text>
            <Text style={styles.sectionTitle}>Record what actually happened.</Text>
            <Text style={styles.sectionBody}>Logging happens during recovery so the workout stays moving. Planned values are prefilled; change only what was different.</Text>
          </View>
          <RestLogPanel
            station={currentStation}
            rounds={restRounds}
            setRounds={setRestRounds}
            entries={restEntries}
            setEntries={setRestEntries}
            latestLoads={latestLoads}
            loadUnit={restLoadUnit}
            onLoadUnitChange={changeRestLoadUnit}
            styles={styles}
            tokens={tokens}
          />
          <Pressable onPress={endEarly} style={({ pressed }) => [styles.endEarlyRow, pressed && styles.pressed]}>
            <Text style={styles.endEarlyText}>End workout early</Text>
          </Pressable>
        </>}
      </KeyboardSafeScreen>

      <View style={styles.actionDock}>
        {phase === 'work' ? <Pressable onPress={skipWorkPhase} style={({ pressed }) => [styles.dockPrimary, pressed && styles.pressed]}>
          <Text style={styles.dockPrimaryText}>Finish station</Text>
          <V23Icon name="chevron" color="#FFFFFF" size={17} />
        </Pressable> : <>
          <Pressable onPress={() => continueAfterRest(true)} style={({ pressed }) => [styles.dockPrimary, pressed && styles.pressed]}>
            <Text style={styles.dockPrimaryText}>{isFinalStation ? 'Save + finish workout' : 'Save + next station'}</Text>
            <V23Icon name="chevron" color="#FFFFFF" size={17} />
          </Pressable>
          <Pressable onPress={() => continueAfterRest(false)} style={({ pressed }) => [styles.dockQuiet, pressed && styles.pressed]}>
            <Text style={styles.dockQuietText}>{isFinalStation ? 'Finish without logging' : 'Continue without logging'}</Text>
          </Pressable>
        </>}
      </View>

      <ExerciseDemoModal exercise={demoExercise} visible={Boolean(demoExercise)} onClose={() => setDemoExercise(null)} />
      <ExerciseSwapModal
        exercise={swapTarget?.exercise ?? null}
        visible={Boolean(swapTarget)}
        busy={swapBusy}
        onClose={() => setSwapTarget(null)}
        onLoadCandidates={loadSwapCandidates}
        onChooseCandidate={(reason, candidateId) => void handleSwap(reason, candidateId)}
        onPain={() => {
          setRunning(false);
          setSwapTarget(null);
          router.push('/today-check-in' as Href);
        }}
      />
      <CueSettingsModal
        visible={cueSettingsOpen}
        preferences={cuePreferences}
        onClose={() => setCueSettingsOpen(false)}
        onChange={setCuePrefs}
        styles={styles}
        tokens={tokens}
      />
    </SafeAreaView>
  );
}

function StationProgressRail({ stationIndex, stationCount, styles }: {
  stationIndex: number;
  stationCount: number;
  styles: ReturnType<typeof makeStyles>;
}) {
  return <View style={styles.progressRail} accessibilityLabel={`Station ${stationIndex + 1} of ${stationCount}`}>
    {Array.from({ length: stationCount }, (_, index) => <View
      key={index}
      style={[styles.progressSegment, index <= stationIndex && styles.progressSegmentActive]}
    />)}
  </View>;
}

function ActiveExerciseRow({ item, index, onDemo, onSwap, styles, tokens }: {
  item: WorkoutExercisePrescription;
  index: number;
  onDemo: () => void;
  onSwap: () => void;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  return <View style={[styles.exerciseRow, index === 0 && styles.exerciseRowFirst]}>
    <View style={styles.exerciseNumber}><Text style={styles.exerciseNumberText}>{index + 1}</Text></View>
    <View style={styles.exerciseCopy}>
      <Text style={styles.exerciseName}>{item.exerciseSnapshot.name}</Text>
      <Text style={styles.exercisePrescription}>{formatPrescription(item.target, item.unit)}</Text>
      {item.adaptationNote ? <Text style={styles.adaptationText}>{item.adaptationNote}</Text> : null}
      <View style={styles.inlineActions}>
        <Pressable onPress={onDemo} style={styles.exerciseAction}><V23Icon name="play" color={tokens.accent} size={13} /><Text style={styles.exerciseActionText}>Demo</Text></Pressable>
        <Pressable onPress={onSwap} style={styles.exerciseAction}><V23Icon name="swap" color={tokens.accent} size={13} /><Text style={styles.exerciseActionText}>Swap</Text></Pressable>
      </View>
    </View>
  </View>;
}

function RestLogPanel({ station, rounds, setRounds, entries, setEntries, latestLoads, loadUnit, onLoadUnitChange, styles, tokens }: {
  station: WorkoutStation;
  rounds: number;
  setRounds: (value: number) => void;
  entries: Record<string, RestEntry>;
  setEntries: Dispatch<SetStateAction<Record<string, RestEntry>>>;
  latestLoads: Record<string, ExerciseLoadHistoryEntry>;
  loadUnit: 'lb' | 'kg';
  onLoadUnitChange: (unit: 'lb' | 'kg') => void;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  function update(id: string, patch: Partial<RestEntry>) {
    setEntries((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { reps: '', load: '', unit: loadUnit, skipped: false }), ...patch },
    }));
  }

  return <View style={styles.restPanel}>
    <View style={styles.roundHeader}>
      <View style={styles.roundCopy}>
        <Text style={styles.roundLabel}>ROUNDS COMPLETED</Text>
        <Text style={styles.roundHint}>Applied to each movement below.</Text>
      </View>
      <View style={styles.roundControls}>
        <Pressable onPress={() => setRounds(Math.max(1, rounds - 1))} style={styles.roundButton}><Text style={styles.roundButtonText}>−</Text></Pressable>
        <Text style={styles.roundValue}>{rounds}</Text>
        <Pressable onPress={() => setRounds(Math.min(30, rounds + 1))} style={styles.roundButton}><Text style={styles.roundButtonText}>+</Text></Pressable>
      </View>
    </View>

    <View style={styles.globalUnitRow}>
      <Text style={styles.fieldLabel}>WEIGHT UNIT</Text>
      <View style={styles.globalUnitToggle}>
        <Pressable onPress={() => onLoadUnitChange('lb')} style={[styles.globalUnitButton, loadUnit === 'lb' && styles.globalUnitButtonSelected]}><Text style={[styles.globalUnitText, loadUnit === 'lb' && styles.globalUnitTextSelected]}>lb</Text></Pressable>
        <Pressable onPress={() => onLoadUnitChange('kg')} style={[styles.globalUnitButton, loadUnit === 'kg' && styles.globalUnitButtonSelected]}><Text style={[styles.globalUnitText, loadUnit === 'kg' && styles.globalUnitTextSelected]}>kg</Text></Pressable>
      </View>
    </View>

    {station.exercises.map((item) => {
      const entry = entries[item.exerciseId] ?? { reps: String(item.target), load: '', unit: loadUnit, skipped: false };
      const previous = latestLoads[item.exerciseId];
      return <View key={item.exerciseId} style={[styles.logExercise, entry.skipped && styles.skippedExercise]}>
        <View style={styles.logTitleLine}>
          <View style={styles.logTitleCopy}>
            <Text style={styles.logExerciseName}>{item.exerciseSnapshot.name}</Text>
            <Text style={styles.helper}>{formatPrescription(item.target, item.unit)} planned{previous ? ` · last ${previous.loadValue} ${previous.loadUnit}` : ''}</Text>
          </View>
          <Pressable onPress={() => update(item.exerciseId, { skipped: !entry.skipped })} style={[styles.skipPill, entry.skipped && styles.skipPillSelected]}>
            <Text style={[styles.skipPillText, entry.skipped && styles.skipPillTextSelected]}>{entry.skipped ? 'Skipped' : 'Skip'}</Text>
          </Pressable>
        </View>
        {!entry.skipped ? <View style={styles.logFields}>
          <View style={styles.logField}>
            <Text style={styles.fieldLabel}>{item.unit === 'seconds' ? 'SECONDS' : item.unit === 'per_side' ? 'REPS / SIDE' : 'REPS'}</Text>
            <TextInput value={entry.reps} onChangeText={(value) => update(item.exerciseId, { reps: value })} keyboardType="decimal-pad" selectTextOnFocus style={styles.logInput} />
          </View>
          <View style={styles.logField}>
            <Text style={styles.fieldLabel}>WEIGHT</Text>
            <TextInput value={entry.load} onChangeText={(value) => update(item.exerciseId, { load: value, unit: loadUnit })} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={tokens.textMuted} selectTextOnFocus style={styles.logInput} />
          </View>
        </View> : null}
      </View>;
    })}
  </View>;
}

function CueSettingsModal({ visible, preferences, onClose, onChange, styles, tokens }: {
  visible: boolean;
  preferences: WorkoutCuePreferences;
  onClose: () => void;
  onChange: (value: WorkoutCuePreferences) => void;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <View style={styles.settingsModal}>
        <View style={styles.settingsHeader}>
          <View><Text style={styles.eyebrow}>WORKOUT CUES</Text><Text style={styles.settingsTitle}>Sound and haptics</Text></View>
          <Pressable onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>Done</Text></Pressable>
        </View>
        <SettingRow title="Audio cues" detail="Short dings through the current audio output." value={preferences.audioEnabled} onValueChange={(audioEnabled) => onChange({ ...preferences, audioEnabled })} styles={styles} tokens={tokens} />
        <SettingRow title="Haptic cues" detail="Vibration cues at the same intervals." value={preferences.hapticsEnabled} onValueChange={(hapticsEnabled) => onChange({ ...preferences, hapticsEnabled })} styles={styles} tokens={tokens} />
        <SettingRow title="Final 5 seconds" detail="Cue each of the last five seconds." value={preferences.finalCountdownEnabled} onValueChange={(finalCountdownEnabled) => onChange({ ...preferences, finalCountdownEnabled })} styles={styles} tokens={tokens} />
        <Text style={styles.settingsNote}>Work cues: 2 min, 1 min, 30 sec, 10 sec. Rest cues: 15 sec and 5 sec.</Text>
      </View>
    </View>
  </Modal>;
}

function SettingRow({ title, detail, value, onValueChange, styles, tokens }: {
  title: string;
  detail: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  return <View style={styles.settingRow}>
    <View style={styles.settingCopy}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingDetail}>{detail}</Text></View>
    <Switch value={value} onValueChange={onValueChange} trackColor={{ false: tokens.border, true: tokens.accentSoft }} thumbColor={value ? tokens.accent : tokens.surface} />
  </View>;
}

function SummaryMetric({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.summaryMetric}><Text style={styles.summaryMetricValue}>{value}</Text><Text style={styles.summaryMetricLabel}>{label}</Text></View>;
}

function ChoiceButton({ label, selected, onPress, styles }: { label: string; selected: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.choiceButton, selected && styles.choiceButtonSelected, pressed && styles.pressed]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>;
}

function NumberScale({ values, selected, onSelect, styles, compact = false }: {
  values: number[];
  selected: number | null;
  onSelect: (value: number) => void;
  styles: ReturnType<typeof makeStyles>;
  compact?: boolean;
}) {
  return <View style={[styles.numberScale, compact && styles.numberScaleCompact]}>
    {values.map((value) => <Pressable key={value} onPress={() => onSelect(value)} style={({ pressed }) => [styles.numberButton, compact && styles.numberButtonCompact, selected === value && styles.numberButtonSelected, pressed && styles.pressed]}><Text style={[styles.numberButtonText, selected === value && styles.numberButtonTextSelected]}>{value}</Text></Pressable>)}
  </View>;
}

function feedbackMessage(feedback: WorkoutDifficultyFeedback | null): string {
  if (feedback === 'too_easy') return 'Side Quest can progress a comparable dose when the rest of your training supports it.';
  if (feedback === 'too_hard') return 'Side Quest can reduce a comparable dose or choose a more manageable variation next time.';
  if (feedback === 'appropriate') return 'This is now a useful reference dose for future comparable sessions.';
  return 'Your completed session already counts. Add feedback only if it gives the Coach useful context.';
}

function defaultLoadBasis(exercise: Exercise): LoadBasis {
  const ids = exercise.equipmentOptions.flatMap((option) => option.items.map((item) => item.equipmentId));
  if (ids.includes('dumbbell')) return 'each_hand';
  if (ids.includes('barbell') || ids.includes('trap_bar')) return 'total';
  if (ids.includes('long_band') || ids.includes('mini_band')) return 'band_level';
  if (ids.every((id) => id === 'bodyweight')) return 'bodyweight';
  return 'single_implement';
}

function formatPrescription(target: number, unit: 'total' | 'per_side' | 'seconds') {
  if (unit === 'seconds') return `${target} sec`;
  if (unit === 'per_side') return `${target}/side`;
  return `${target} reps`;
}

function formatPlanDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function startOfWeekIso(): string {
  const date = new Date();
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: tokens.canvas },
    topBar: { minHeight: 68, paddingHorizontal: 18, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: tokens.surface },
    topCopy: { flex: 1, minWidth: 0 },
    eyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 1.05 },
    topTitle: { color: tokens.text, fontSize: 17, lineHeight: 21, fontWeight: '900', marginTop: 2 },
    iconHeaderButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    leaveButton: { minHeight: 38, borderRadius: 19, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
    leaveButtonText: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 16, fontWeight: '800' },
    progressRail: { minHeight: 7, paddingHorizontal: 18, paddingBottom: 8, flexDirection: 'row', gap: 4, backgroundColor: tokens.surface },
    progressSegment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: tokens.border },
    progressSegmentActive: { backgroundColor: tokens.accent },
    resumeBanner: { marginHorizontal: 14, marginTop: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 13, backgroundColor: tokens.accentSoft, flexDirection: 'row', alignItems: 'center', gap: 8 },
    resumeBannerText: { flex: 1, color: tokens.accent, fontSize: 12, lineHeight: 17, fontWeight: '700' },
    content: { padding: 15, paddingBottom: 150, gap: 14 },
    planContext: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 2 },
    planContextText: { flex: 1, color: tokens.textMuted, fontSize: 11.5, lineHeight: 16, fontWeight: '700' },

    timerHero: { backgroundColor: tokens.header, borderRadius: 25, paddingHorizontal: 20, paddingVertical: 18, gap: 5 },
    restHero: { backgroundColor: tokens.accentStrong },
    timerTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    phaseLabel: { color: '#FFFFFF', fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1.2 },
    timer: { color: '#FFFFFF', fontSize: 78, lineHeight: 86, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -3 },
    timerContext: { color: 'rgba(255,255,255,0.80)', fontSize: 12.5, lineHeight: 18 },
    timerControl: { alignSelf: 'flex-start', marginTop: 7, minHeight: 35, paddingHorizontal: 12, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', flexDirection: 'row', alignItems: 'center', gap: 6 },
    timerControlText: { color: '#FFFFFF', fontSize: 12, lineHeight: 15, fontWeight: '800' },

    sectionHeading: { gap: 3, paddingHorizontal: 2 },
    sectionEyebrow: { color: tokens.accent, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 1 },
    sectionTitle: { color: tokens.text, fontSize: 20, lineHeight: 25, fontWeight: '900', letterSpacing: -0.2 },
    sectionBody: { color: tokens.textMuted, fontSize: 12, lineHeight: 17 },

    stationCard: { backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, borderRadius: 20, paddingHorizontal: 14 },
    exerciseRow: { minHeight: 94, flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border },
    exerciseRowFirst: { borderTopWidth: 0 },
    exerciseNumber: { width: 38, height: 38, borderRadius: 19, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    exerciseNumberText: { color: tokens.accent, fontSize: 15, fontWeight: '900' },
    exerciseCopy: { flex: 1, minWidth: 0, gap: 2 },
    exerciseName: { color: tokens.text, fontSize: 17, lineHeight: 22, fontWeight: '900' },
    exercisePrescription: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
    adaptationText: { color: tokens.accent, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
    inlineActions: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
    exerciseAction: { minHeight: 32, borderRadius: 16, backgroundColor: tokens.surfaceMuted, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
    exerciseActionText: { color: tokens.accent, fontSize: 11, lineHeight: 14, fontWeight: '900' },

    upNextStrip: { borderRadius: 16, backgroundColor: tokens.surfaceMuted, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
    upNextIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
    upNextCopy: { flex: 1, minWidth: 0, gap: 2 },
    nextLabel: { color: tokens.accent, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
    nextTitle: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
    nextDetail: { color: tokens.textMuted, fontSize: 11, lineHeight: 15 },
    endEarlyRow: { minHeight: 38, alignItems: 'center', justifyContent: 'center' },
    endEarlyText: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 15, fontWeight: '700' },

    restPanel: { backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, borderRadius: 20, overflow: 'hidden' },
    roundHeader: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: tokens.surfaceMuted },
    roundCopy: { flex: 1, minWidth: 0, gap: 2 },
    roundLabel: { color: tokens.text, fontSize: 12, lineHeight: 16, fontWeight: '900', letterSpacing: 0.45 },
    roundHint: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 14 },
    roundControls: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    roundButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' },
    roundButtonText: { color: tokens.accent, fontSize: 20, lineHeight: 23, fontWeight: '800' },
    roundValue: { color: tokens.text, fontSize: 21, fontWeight: '900', minWidth: 23, textAlign: 'center' },
    globalUnitRow: { minHeight: 45, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border },
    globalUnitToggle: { flexDirection: 'row', backgroundColor: tokens.surface, borderRadius: 9, overflow: 'hidden', borderWidth: 1, borderColor: tokens.border },
    globalUnitButton: { minWidth: 45, height: 31, alignItems: 'center', justifyContent: 'center' },
    globalUnitButtonSelected: { backgroundColor: tokens.accent },
    globalUnitText: { color: tokens.textMuted, fontSize: 11, fontWeight: '800' },
    globalUnitTextSelected: { color: '#FFFFFF' },
    logExercise: { padding: 14, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border },
    skippedExercise: { opacity: 0.58 },
    logTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    logTitleCopy: { flex: 1, minWidth: 0 },
    logExerciseName: { color: tokens.text, fontSize: 15, lineHeight: 20, fontWeight: '900' },
    helper: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18 },
    skipPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: tokens.surfaceMuted },
    skipPillSelected: { backgroundColor: tokens.accentSoft },
    skipPillText: { color: tokens.textMuted, fontSize: 10, fontWeight: '800' },
    skipPillTextSelected: { color: tokens.accent },
    logFields: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    logField: { flex: 1, gap: 5 },
    fieldLabel: { color: tokens.textMuted, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.6 },
    logInput: { minHeight: 45, borderWidth: 1, borderColor: tokens.border, borderRadius: 11, backgroundColor: tokens.surfaceRaised, color: tokens.text, textAlign: 'center', fontSize: 16, fontWeight: '800' },

    actionDock: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: tokens.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, paddingHorizontal: 15, paddingTop: 10, paddingBottom: 12, gap: 5 },
    dockPrimary: { minHeight: 50, borderRadius: 16, backgroundColor: tokens.header, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    dockPrimaryText: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '900' },
    dockQuiet: { minHeight: 34, alignItems: 'center', justifyContent: 'center' },
    dockQuietText: { color: tokens.textMuted, fontSize: 11, lineHeight: 14, fontWeight: '700' },

    completeContainer: { padding: 18, paddingBottom: 44, gap: 14 },
    completeHero: { borderRadius: 25, backgroundColor: tokens.header, padding: 19, gap: 6 },
    completeIcon: { width: 43, height: 43, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
    completeEyebrow: { color: 'rgba(255,255,255,0.72)', fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 1 },
    completeTitle: { color: '#FFFFFF', fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: -0.4 },
    completeBody: { color: 'rgba(255,255,255,0.82)', fontSize: 12.5, lineHeight: 18 },
    retrySaveButton: { alignSelf: 'flex-start', minHeight: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
    retrySaveText: { color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '900' },
    summaryRow: { flexDirection: 'row', gap: 7, marginTop: 6 },
    summaryMetric: { flex: 1, minHeight: 65, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.11)', alignItems: 'center', justifyContent: 'center' },
    summaryMetricValue: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
    summaryMetricLabel: { color: 'rgba(255,255,255,0.67)', fontSize: 10, marginTop: 2 },

    feedbackCard: { borderRadius: 20, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, padding: 15, gap: 8 },
    cardTitle: { color: tokens.text, fontSize: 17, lineHeight: 22, fontWeight: '900' },
    feedbackRow: { flexDirection: 'row', gap: 6 },
    choiceButton: { flex: 1, minHeight: 43, borderRadius: 12, borderWidth: 1, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    choiceButtonSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent },
    choiceText: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 14, fontWeight: '800', textAlign: 'center' },
    choiceTextSelected: { color: tokens.accent },
    coachLine: { borderRadius: 13, backgroundColor: tokens.surfaceMuted, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
    coachLineText: { flex: 1, color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },

    symptomButton: { minHeight: 80, borderRadius: 19, backgroundColor: tokens.surfaceMuted, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
    symptomIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
    symptomCopy: { flex: 1, minWidth: 0, gap: 2 },

    reflectionBody: { gap: 10, paddingTop: 4 },
    fieldPrompt: { color: tokens.text, fontSize: 12, lineHeight: 16, fontWeight: '800' },
    numberScale: { flexDirection: 'row', gap: 6 },
    numberScaleCompact: { flexWrap: 'wrap' },
    numberButton: { flex: 1, minWidth: 40, height: 42, borderRadius: 11, borderWidth: 1, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' },
    numberButtonCompact: { flex: 0, width: 41 },
    numberButtonSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent },
    numberButtonText: { color: tokens.text, fontSize: 12, fontWeight: '800' },
    numberButtonTextSelected: { color: tokens.accent },
    reflectionInput: { minHeight: 100, borderWidth: 1, borderColor: tokens.border, borderRadius: 13, padding: 12, color: tokens.text, backgroundColor: tokens.surfaceRaised, fontSize: 13.5, lineHeight: 19, textAlignVertical: 'top' },
    savedNote: { color: tokens.success, fontSize: 11.5, fontWeight: '800' },

    detailsBody: { gap: 10, paddingTop: 4 },
    detailAction: { minHeight: 68, borderRadius: 15, backgroundColor: tokens.surfaceMuted, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 9 },
    detailIcon: { width: 35, height: 35, borderRadius: 18, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
    detailCopy: { flex: 1, minWidth: 0, gap: 2 },
    detailTitle: { color: tokens.text, fontSize: 13, lineHeight: 17, fontWeight: '900' },
    detailText: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 15 },
    doneButton: { minHeight: 51, borderRadius: 16, backgroundColor: tokens.header, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    doneButtonDisabled: { opacity: 0.48 },
    doneButtonText: { color: '#FFFFFF', fontSize: 14.5, lineHeight: 18, fontWeight: '900' },
    doneNote: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 15, textAlign: 'center', paddingHorizontal: 10 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'center', padding: 20 },
    settingsModal: { backgroundColor: tokens.surface, borderRadius: 22, padding: 18, gap: 3 },
    settingsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 },
    settingsTitle: { color: tokens.text, fontSize: 22, fontWeight: '800', marginTop: 2 },
    closeButton: { padding: 8 },
    closeText: { color: tokens.accent, fontWeight: '800' },
    settingRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border },
    settingCopy: { flex: 1 },
    settingTitle: { color: tokens.text, fontSize: 15, fontWeight: '800' },
    settingDetail: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
    settingsNote: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18, paddingTop: 10 },
    missingCard: { flex: 1, justifyContent: 'center', padding: 24, gap: 18 },
    primaryButton: { minHeight: 50, borderRadius: 16, backgroundColor: tokens.header, alignItems: 'center', justifyContent: 'center' },
    primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
    pressed: { opacity: 0.72 },
  });
}
