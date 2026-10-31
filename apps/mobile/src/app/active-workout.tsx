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
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExerciseDemoModal } from '@/components/exercise-demo-modal';
import { ExerciseSwapModal } from '@/components/exercise-swap-modal';
import { CompletedWorkoutBodyMap } from '@/components/completed-workout-body-map';
import { KeyboardSafeScreen } from '@/components/keyboard-safe-screen';
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
} from '@/services/active-workout-persistence';
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
type Phase = 'work' | 'rest' | 'complete';

export default function ActiveWorkoutScreen() {
  const { exercises } = useExerciseCatalog();
  const { user, cloudEnabled } = useAuth();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const cuePlayer = useAudioPlayer(require('../../assets/audio/workout-cue.wav'));
  const completionPlayer = useAudioPlayer(require('../../assets/audio/workout-complete.wav'));

  useKeepAwake();
  const router = useRouter();
  const { activeWorkout: workout, activePlanLink, updateActiveWorkout, clearActiveWorkout, workoutSessionReady, restoredActiveWorkout } = useWorkoutContext();
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
  const startedAt = useRef(new Date().toISOString());
  const completedAt = useRef<string | null>(null);
  const savedCompletion = useRef(false);
  const completionFractionRef = useRef(1);
  const [completionSaveStatus, setCompletionSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [completionSaveError, setCompletionSaveError] = useState<string | null>(null);
  const cueKey = useRef<string | null>(null);

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
        setPhase(snapshot.pendingCompletion ? 'complete' : snapshot.phase);
        setRemainingSeconds(Math.min(
          Math.max(0, snapshot.remainingSeconds),
          snapshot.phase === 'work' ? (safeStation?.durationSeconds ?? snapshot.remainingSeconds) : Math.max(15, workout.request.restSeconds),
        ));
        setRunning(snapshot.pendingCompletion ? false : restoredActiveWorkout ? false : snapshot.running);
        setStationRounds(snapshot.stationRounds);
        setExerciseLoads(snapshot.exerciseLoads);
        setExerciseSets(snapshot.exerciseSets);
        setRestEntries(snapshot.restEntries);
        setRestRounds(snapshot.restRounds);
        setRestLoadUnit(snapshot.restLoadUnit);
        startedAt.current = snapshot.startedAt;
        if (snapshot.pendingCompletion) {
          completedAt.current = snapshot.pendingCompletion.completedAt;
          completionFractionRef.current = snapshot.pendingCompletion.completionFraction;
          setCompletionSaveStatus('error');
          setCompletionSaveError('Completion was interrupted. Retry saving the original workout dose.');
        }
        const progressed = safeIndex > 0
          || snapshot.phase === 'rest'
          || snapshot.remainingSeconds < (safeStation?.durationSeconds ?? snapshot.remainingSeconds)
          || Object.keys(snapshot.stationRounds).length > 0;
        if (restoredActiveWorkout || progressed || snapshot.pendingCompletion) {
          setResumeNotice(snapshot.pendingCompletion
            ? 'Unfinished completion restored; retry saving before leaving.'
            : restoredActiveWorkout
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

  if (!workoutSessionReady || (workout && !sessionHydrated)) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.missingCard}><Text style={styles.completeTitle}>Restoring workout…</Text><Text style={styles.helper}>Loading the last saved station and timer state.</Text></View></SafeAreaView>;
  }

  if (!workout || !station) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.missingCard}><Text style={styles.completeTitle}>No active workout</Text><Pressable onPress={() => router.replace('/' as Href)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Return home</Text></Pressable></View></SafeAreaView>;
  }

  const activeWorkout = workout;
  const currentStation = station;
  const completedSummary = buildCompletedWorkoutSummary({ workout: activeWorkout, completedAt: completedAt.current ?? undefined, durationMinutes: Math.max(1, elapsedSeconds / 60), stationRounds, exerciseSets });

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

  async function persistCompletion(completionFraction: number, override?: { stationRounds: Record<string, number>; exerciseLoads: Record<string, LoadValue>; exerciseSets: Record<string, LoggedSet[]> }) {
    if (savedCompletion.current) return;
    savedCompletion.current = true;
    completionFractionRef.current = completionFraction;
    setCompletionSaveStatus('saving');
    setCompletionSaveError(null);
    const timestamp = completedAt.current ?? new Date().toISOString();
    completedAt.current = timestamp;
    const completedRounds = override?.stationRounds ?? stationRounds;
    const completedLoads = override?.exerciseLoads ?? exerciseLoads;
    const completedSets = override?.exerciseSets ?? exerciseSets;
    try {
      // Journal the *original* completed dose and timestamp before the SQL
      // transaction. A force quit following a failed save must not silently
      // convert a partial completion into a full one on the next launch.
      await saveLiveWorkoutSession({
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        workout: activeWorkout,
        startedAt: startedAt.current,
        stationIndex,
        phase: 'rest',
        remainingSeconds,
        running: false,
        stationRounds: completedRounds,
        exerciseLoads: completedLoads,
        exerciseSets: completedSets,
        restEntries,
        restRounds,
        restLoadUnit,
        planLink: activePlanLink ?? undefined,
        pendingCompletion: { completedAt: timestamp, completionFraction },
      });
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
      // Persisted in the active checkpoint: a restart retry must use the
      // same canonical workout identity, not a fresh completion timestamp.
      idempotencyKey: `${activeWorkout.id}_${startedAt.current}`,
      });
      // Show "Saved" only after the local workout ledger and plan update
      // have succeeded. Recovery/retry uses the same completion timestamp.
      setCompletionSaveStatus('saved');
    } catch (error) {
      savedCompletion.current = false;
      setCompletionSaveStatus('error');
      setCompletionSaveError(error instanceof Error
        ? error.message : 'Local workout save failed. Retry before leaving.');
      return;
    }
    try {
      await clearLiveWorkoutSession();
    } catch {
      // The canonical workout is saved, but the old checkpoint might reappear.
      setCompletionSaveError('Workout saved, but the active checkpoint could not be cleared.');
    }
    if (cloudEnabled && user?.mode === 'cloud') {
      const ledgerId = `${activeWorkout.id}_${startedAt.current}`;
      try {
        const [entry, preferences, weekEntries] = await Promise.all([getWorkoutLedgerEntry(ledgerId), getSocialPreferences(), listWorkoutLedgerEntries({ from: startOfWeekIso(), limit: 100 })]);
        if (entry) await publishWorkoutActivity({ userId: user.id, ledgerId: entry.id, workoutType: activeWorkout.source === 'manual' ? 'Custom strength' : 'Side Quest strength', title: entry.name, durationMinutes: Math.max(1, Math.round(activeWorkout.estimatedElapsedSeconds * completionFraction / 60)), weeklyCount: weekEntries.length, completedAt: timestamp, exercises: entry.exercises, preferences });
      } catch {
        // Local completion remains authoritative if optional social publishing fails.
      }
    }
  }

  function setCuePrefs(next: WorkoutCuePreferences) { setCuePreferences(next); saveWorkoutCuePreferences(next); }

  function commitRestLog(): { stationRounds: Record<string, number>; exerciseLoads: Record<string, LoadValue>; exerciseSets: Record<string, LoggedSet[]> } {
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
      if (Number.isFinite(load) && load > 0) nextLoads[item.exerciseId] = { value: load, unit: entry.unit, name: item.exerciseSnapshot.name };
      else delete nextLoads[item.exerciseId];
    }
    setExerciseSets(nextSets);
    setExerciseLoads(nextLoads);
    return { stationRounds: nextRounds, exerciseLoads: nextLoads, exerciseSets: nextSets };
  }

  function continueAfterRest(log: boolean) {
    const logged = log ? commitRestLog() : undefined;
    if (isFinalStation) {
      setPhase('complete'); setRunning(false);
      void persistCompletion(1, logged);
      return;
    }
    const nextIndex = stationIndex + 1;
    setStationIndex(nextIndex);
    setPhase('work');
    setRemainingSeconds(activeWorkout.stations[nextIndex]!.durationSeconds);
    setRunning(true);
    cueKey.current = null;
    if (cuePreferences.hapticsEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }

  function skipWorkPhase() { if (phase === 'work') setRemainingSeconds(0); }

  function pauseAndLeave() {
    // Do not replace a pending-completion journal with an ordinary rest state.
    if (phase === 'complete') return;
    setRunning(false);
    void saveLiveWorkoutSession({
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      workout: activeWorkout,
      startedAt: startedAt.current,
      stationIndex,
      phase: phase === 'complete' ? 'rest' : phase,
      remainingSeconds,
      running: false,
      stationRounds,
      exerciseLoads,
      exerciseSets,
      restEntries,
      restRounds,
      restLoadUnit,
      planLink: activePlanLink ?? undefined,
    }).then(() => router.replace('/' as Href));
  }

  function endEarly() {
    Alert.alert('End workout?', 'Save the work you completed, discard this session, or keep training.', [
      { text: 'Keep training', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => { clearActiveWorkout(); router.replace('/train' as Href); } },
      { text: 'Save partial', onPress: () => { const fraction = totalPlannedSeconds > 0 ? elapsedSeconds / totalPlannedSeconds : 0; setPhase('complete'); setRunning(false); void persistCompletion(fraction); } },
    ]);
  }

  async function finishAndExit() {
    if (completionSaveStatus === 'saving') return;
    if (!savedCompletion.current) {
      // A failed save must not discard the active session on exit.
      await persistCompletion(completionFractionRef.current);
      if (!savedCompletion.current) return;
    }
    const completed = completedAt.current;
    if (completed && (sessionRpe !== null || energyAfter !== null || reflectionNotes.trim())) {
      const instanceId = `${activeWorkout.id}_${startedAt.current}`;
      await saveWorkoutReflection({ workoutInstanceId: instanceId, workoutId: activeWorkout.id, workoutName: activeWorkout.name, rpe: sessionRpe ?? undefined, energyAfter: energyAfter ?? undefined, notes: reflectionNotes.trim() || undefined, completedAt: completed, createdAt: new Date().toISOString() });
      setReflectionSaved(true);
    }
    clearActiveWorkout(); router.replace('/' as Href);
  }

  async function saveFavorite() { await saveFavoriteWorkout(activeWorkout); setSaved(true); }
  async function recordFeedback(value: WorkoutDifficultyFeedback) { await saveWorkoutFeedback({ workoutInstanceId: `${activeWorkout.id}_${startedAt.current}`, workoutId: activeWorkout.id, difficulty: value }); setFeedback(value); if (cuePreferences.hapticsEnabled) void Haptics.selectionAsync(); }

  async function loadSwapCandidates(reason: ExerciseSwapReason): Promise<ExerciseSwapCandidate[]> {
    if (!swapTarget) return [];
    const exercisePreferences = await listExercisePreferences();
    const result = listExerciseSwapCandidates({ workout: activeWorkout, stationId: swapTarget.stationId, exerciseId: swapTarget.exercise.id, reason, context: { exercises, exercisePreferences } });
    if (!result.ok) throw new Error(result.message);
    return result.candidates;
  }
  async function handleSwap(reason: ExerciseSwapReason, candidateId: string) {
    if (!swapTarget) return;
    setSwapBusy(true);
    try {
      const exercisePreferences = await listExercisePreferences();
      const result = swapExerciseInWorkout({ workout: activeWorkout, stationId: swapTarget.stationId, exerciseId: swapTarget.exercise.id, reason, candidateId, context: { exercises, exercisePreferences } });
      if (!result.ok) { Alert.alert('Replacement unavailable', result.message); return; }
      updateActiveWorkout(result.workout);
      if (reason === 'dislike') await saveExercisePreference({ exerciseId: swapTarget.exercise.id, preference: 'disliked', familiarity: 'familiar' });
      setSwapTarget(null);
    } finally { setSwapBusy(false); }
  }

  if (phase === 'complete') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <KeyboardSafeScreen contentContainerStyle={styles.completeContainer}>
          <Text style={styles.eyebrow}>WORKOUT COMPLETE</Text>
          <Text style={styles.completeTitle}>{activeWorkout.name}</Text>
          <Text style={styles.helper}>{completionSaveStatus === 'saved'
            ? (activePlanLink ? `${activePlanLink.sessionTitle} was saved and marked complete in your plan.` : 'Saved to training history.')
            : completionSaveStatus === 'saving' ? 'Saving completed workout locally…'
              : 'Workout finished. Local save needs confirmation before leaving.'}</Text>
          {completionSaveError ? <Text style={styles.helper}>{completionSaveError}</Text> : null}
          {completionSaveStatus === 'error' ? <Pressable
            accessibilityRole="button"
            onPress={() => void persistCompletion(completionFractionRef.current)}
            style={styles.outlineButton}>
            <Text style={styles.outlineButtonText}>Retry saving workout</Text>
          </Pressable> : null}
          <View style={styles.summaryRow}><SummaryMetric label="Time" value={`${Math.max(1, Math.round(elapsedSeconds / 60))} min`} styles={styles} /><SummaryMetric label="Stations" value={String(activeWorkout.stations.length)} styles={styles} /><SummaryMetric label="Rounds" value={String(Object.values(stationRounds).reduce((sum, value) => sum + value, 0))} styles={styles} /></View>

          <CompletedWorkoutBodyMap regionLoads={completedSummary.regionLoads} />
          <Pressable onPress={() => setShareOpen(true)} style={styles.shareButton}><V23Icon name="more" color={tokens.accent} size={18} /><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Share workout summary</Text><Text style={styles.helper}>Choose exactly what appears. Pain, restrictions, and notes stay private.</Text></View><Text style={styles.shareChevron}>›</Text></Pressable>

          <View style={styles.card}><Text style={styles.cardTitle}>How did the prescription feel?</Text><Text style={styles.helper}>This updates future exercise doses; it does not grade the workout.</Text><View style={styles.feedbackRow}><ChoiceButton label="Too easy" selected={feedback === 'too_easy'} onPress={() => void recordFeedback('too_easy')} styles={styles} /><ChoiceButton label="About right" selected={feedback === 'appropriate'} onPress={() => void recordFeedback('appropriate')} styles={styles} /><ChoiceButton label="Too hard" selected={feedback === 'too_hard'} onPress={() => void recordFeedback('too_hard')} styles={styles} /></View></View>

          <View style={styles.coachAcknowledgment}>
            <Text style={styles.coachLabel}>SIDE QUEST COACH</Text>
            <Text style={styles.cardTitle}>{feedback ? 'Feedback received' : 'Your next recommendation will use this session'}</Text>
            <Text style={styles.helper}>{feedback === 'too_easy' ? 'Future comparable sessions may progress reps or load when the rest of your training supports it.' : feedback === 'too_hard' ? 'Future comparable sessions can reduce dose or choose a more manageable variation.' : feedback === 'appropriate' ? 'This prescription is a useful reference point for future comparable sessions.' : 'Add difficulty, effort, energy, or a private note below. Side Quest will keep the completed training record even if you skip feedback.'}</Text>
          </View>

          <Pressable onPress={() => setShowReflection((value) => !value)} style={styles.disclosureRow}>
            <View style={{ flex: 1 }}><Text style={styles.cardTitle}>Add a private reflection</Text><Text style={styles.helper}>Effort, energy, or a note for future recommendations.</Text></View><Text style={styles.disclosureChevron}>{showReflection ? '⌃' : '⌄'}</Text>
          </Pressable>
          {showReflection ? <View style={styles.card}>
            <Text style={styles.helper}>Whole-session effort</Text>
            <NumberScale values={[1,2,3,4,5,6,7,8,9,10]} selected={sessionRpe} onSelect={(value) => { setSessionRpe(value); setReflectionSaved(false); }} styles={styles} compact />
            <Text style={styles.helper}>Energy after</Text><NumberScale values={[1,2,3,4,5]} selected={energyAfter} onSelect={(value) => { setEnergyAfter(value); setReflectionSaved(false); }} styles={styles} />
            <TextInput value={reflectionNotes} onChangeText={(value) => { setReflectionNotes(value); setReflectionSaved(false); }} multiline returnKeyType="done" blurOnSubmit placeholder="Optional note" placeholderTextColor={tokens.textMuted} style={styles.reflectionInput} />
            {reflectionSaved ? <Text style={styles.savedNote}>Reflection saved.</Text> : null}
          </View> : null}

          <Pressable onPress={() => router.push('/today-check-in' as Href)} style={styles.symptomButton}><Text style={styles.cardTitle}>Something hurt or tightened up?</Text><Text style={styles.helper}>Log the exact area separately so the next workout can adapt.</Text></Pressable>
          <Pressable onPress={() => void saveFavorite()} style={styles.outlineButton}><Text style={styles.outlineButtonText}>{saved ? '♥ Saved to favorites' : '♡ Save to favorites'}</Text></Pressable>
          <Pressable accessibilityRole="button"
            disabled={completionSaveStatus === 'saving'}
            onPress={() => void finishAndExit()}
            style={[styles.primaryButton, completionSaveStatus === 'saving' && { opacity: 0.5 }]}>
            <Text style={styles.primaryButtonText}>{completionSaveStatus === 'saving'
              ? 'Saving locally…' : completionSaveStatus === 'error'
                ? 'Retry save before leaving' : 'Return to Today'}</Text>
          </Pressable>
        </KeyboardSafeScreen>
        <WorkoutShareModal summary={completedSummary} visible={shareOpen} onClose={() => setShareOpen(false)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <View style={styles.topCopy}>
          <Text style={styles.eyebrow}>{phase === 'rest' ? `STATION ${currentStation.order} COMPLETE` : `STATION ${currentStation.order} OF ${activeWorkout.stations.length}`}</Text>
          <Text style={styles.topTitle}>{phase === 'rest' ? 'Recover and record' : currentStation.purpose}</Text>
        </View>
        <Pressable accessibilityLabel="Workout cue settings" onPress={() => setCueSettingsOpen(true)} style={styles.iconHeaderButton}><V23Icon name="settings" color={tokens.text} size={20} /></Pressable>
        <Pressable onPress={pauseAndLeave} style={styles.pausePill}><Text style={styles.pauseButtonText}>Leave</Text></Pressable>
        <Pressable onPress={endEarly} style={styles.endPill}><Text style={styles.endButtonText}>End</Text></Pressable>
      </View>
      {activePlanLink ? <View style={styles.planBanner}><V23Icon name="plan" color={tokens.accent} size={17} /><Text style={styles.planBannerText}>Planned {formatPlanDate(activePlanLink.sessionDate)} · {activePlanLink.sessionTitle}{activePlanLink.modifiedFromPlan ? ' · Customized' : ''}</Text></View> : null}
      {resumeNotice ? <Pressable onPress={() => setResumeNotice(null)} style={styles.resumeBanner}><V23Icon name="play" color={tokens.accent} size={17} /><Text style={styles.resumeBannerText}>{resumeNotice}</Text></Pressable> : null}

      <KeyboardSafeScreen contentContainerStyle={styles.content}>
        <View style={[styles.timerCard, phase === 'rest' && styles.restTimerCard]}>
          <View style={styles.timerTopLine}><Text style={styles.phaseLabel}>{phase === 'rest' ? (remainingSeconds > 0 ? 'REST + LOG' : 'READY') : 'WORK'}</Text><V23Chip tone={phase === 'rest' ? 'warm' : 'accent'}>{running ? 'Running' : 'Paused'}</V23Chip></View>
          <Text style={styles.timer}>{formatTime(remainingSeconds)}</Text>
          <Text style={styles.timerContext}>{phase === 'rest' ? 'Record the station while you recover.' : `${currentStation.exercises.length} movements · focus on quality`}</Text>
          {phase === 'work' ? <Pressable onPress={() => setRunning((value) => !value)} style={styles.timerControl}><Text style={styles.timerControlText}>{running ? 'Pause timer' : 'Resume timer'}</Text></Pressable> : null}
        </View>

        {phase === 'work' ? (
          <>
            <View style={styles.stationCard}>
              {currentStation.exercises.map((item, index) => <ActiveExerciseRow key={item.exerciseId} item={item} index={index} onDemo={() => setDemoExercise(item.exerciseSnapshot)} onSwap={() => setSwapTarget({ stationId: currentStation.id, exercise: item.exerciseSnapshot })} styles={styles} />)}
            </View>
            <View style={styles.nextCard}>
              <Text style={styles.nextLabel}>UP NEXT</Text>
              <Text style={styles.nextTitle}>{isFinalStation ? 'Workout summary' : `${Math.max(1, Math.round(activeWorkout.request.restSeconds / 60))} min recovery, then ${nextStation?.purpose ?? 'the next station'}`}</Text>
              {nextStation ? <Text style={styles.nextDetail}>{nextStation.exercises.map((item) => item.exerciseSnapshot.name).join(' · ')}</Text> : null}
            </View>
            <View style={styles.controlRow}><Pressable onPress={skipWorkPhase} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Finish station</Text></Pressable><Pressable onPress={endEarly} style={styles.outlineButton}><Text style={styles.outlineButtonText}>End workout</Text></Pressable></View>
          </>
        ) : (
          <RestLogPanel station={currentStation} rounds={restRounds} setRounds={setRestRounds} entries={restEntries} setEntries={setRestEntries} latestLoads={latestLoads} loadUnit={restLoadUnit} onLoadUnitChange={changeRestLoadUnit} styles={styles} tokens={tokens} />
        )}

        {phase === 'rest' ? <><Pressable onPress={() => continueAfterRest(true)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{isFinalStation ? 'Save and finish workout' : 'Save and start next station'}</Text></Pressable><Pressable onPress={() => continueAfterRest(false)} style={styles.textButton}><Text style={styles.textButtonText}>{isFinalStation ? 'Finish without logging' : 'Continue without logging'}</Text></Pressable></> : null}
      </KeyboardSafeScreen>

      <ExerciseDemoModal exercise={demoExercise} visible={Boolean(demoExercise)} onClose={() => setDemoExercise(null)} />
      <ExerciseSwapModal exercise={swapTarget?.exercise ?? null} visible={Boolean(swapTarget)} busy={swapBusy} onClose={() => setSwapTarget(null)} onLoadCandidates={loadSwapCandidates} onChooseCandidate={(reason, candidateId) => void handleSwap(reason, candidateId)} onPain={() => { setRunning(false); setSwapTarget(null); router.push('/today-check-in' as Href); }} />
      <CueSettingsModal visible={cueSettingsOpen} preferences={cuePreferences} onClose={() => setCueSettingsOpen(false)} onChange={setCuePrefs} styles={styles} tokens={tokens} />
    </SafeAreaView>
  );
}

function ActiveExerciseRow({ item, index, onDemo, onSwap, styles }: { item: WorkoutExercisePrescription; index: number; onDemo: () => void; onSwap: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <View style={[styles.exerciseRow, index === 0 && styles.exerciseRowFirst]}>
    <View style={styles.exerciseNumber}><Text style={styles.exerciseNumberText}>{index + 1}</Text></View>
    <View style={styles.exerciseCopy}>
      <Text style={styles.exerciseName}>{item.exerciseSnapshot.name}</Text>
      {item.adaptationNote ? <Text style={styles.adaptationText}>{item.adaptationNote}</Text> : null}
      <View style={styles.inlineActions}><Pressable onPress={onDemo} style={styles.textAction}><Text style={styles.textActionText}>View demo</Text></Pressable><Text style={styles.actionDivider}>·</Text><Pressable onPress={onSwap} style={styles.textAction}><Text style={styles.textActionText}>Swap</Text></Pressable></View>
    </View>
    <View style={styles.prescriptionPill}><Text style={styles.prescriptionText}>{formatPrescription(item.target, item.unit)}</Text></View>
  </View>;
}

function RestLogPanel({ station, rounds, setRounds, entries, setEntries, latestLoads, loadUnit, onLoadUnitChange, styles, tokens }: { station: WorkoutStation; rounds: number; setRounds: (value: number) => void; entries: Record<string, RestEntry>; setEntries: Dispatch<SetStateAction<Record<string, RestEntry>>>; latestLoads: Record<string, ExerciseLoadHistoryEntry>; loadUnit: 'lb' | 'kg'; onLoadUnitChange: (unit: 'lb' | 'kg') => void; styles: ReturnType<typeof makeStyles>; tokens: DesignTokens }) {
  function update(id: string, patch: Partial<RestEntry>) { setEntries((current) => ({ ...current, [id]: { ...(current[id] ?? { reps: '', load: '', unit: loadUnit, skipped: false }), ...patch } })); }
  return <View style={styles.restPanel}>
    <View style={styles.roundHeader}>
      <View style={{ flex: 1 }}><Text style={styles.cardTitle}>Log this station</Text><Text style={styles.helper}>One entry per exercise, applied to each round.</Text></View>
      <View style={styles.roundControls}><Pressable onPress={() => setRounds(Math.max(1, rounds - 1))} style={styles.roundButton}><Text style={styles.roundButtonText}>−</Text></Pressable><Text style={styles.roundValue}>{rounds}</Text><Pressable onPress={() => setRounds(Math.min(30, rounds + 1))} style={styles.roundButton}><Text style={styles.roundButtonText}>+</Text></Pressable></View>
    </View>
    <View style={styles.globalUnitRow}><Text style={styles.fieldLabel}>WEIGHT UNIT</Text><View style={styles.globalUnitToggle}><Pressable onPress={() => onLoadUnitChange('lb')} style={[styles.globalUnitButton, loadUnit === 'lb' && styles.globalUnitButtonSelected]}><Text style={[styles.globalUnitText, loadUnit === 'lb' && styles.globalUnitTextSelected]}>lb</Text></Pressable><Pressable onPress={() => onLoadUnitChange('kg')} style={[styles.globalUnitButton, loadUnit === 'kg' && styles.globalUnitButtonSelected]}><Text style={[styles.globalUnitText, loadUnit === 'kg' && styles.globalUnitTextSelected]}>kg</Text></Pressable></View></View>
    {station.exercises.map((item) => {
      const entry = entries[item.exerciseId] ?? { reps: String(item.target), load: '', unit: loadUnit, skipped: false };
      const previous = latestLoads[item.exerciseId];
      return <View key={item.exerciseId} style={[styles.logExercise, entry.skipped && styles.skippedExercise]}>
        <View style={styles.logTitleLine}><View style={{ flex: 1 }}><Text style={styles.exerciseName}>{item.exerciseSnapshot.name}</Text><Text style={styles.helper}>{formatPrescription(item.target, item.unit)} planned{previous ? ` · last ${previous.loadValue} ${previous.loadUnit}` : ''}</Text></View><Pressable onPress={() => update(item.exerciseId, { skipped: !entry.skipped })} style={[styles.skipPill, entry.skipped && styles.skipPillSelected]}><Text style={[styles.skipPillText, entry.skipped && styles.skipPillTextSelected]}>{entry.skipped ? 'Skipped' : 'Skip'}</Text></Pressable></View>
        {!entry.skipped ? <View style={styles.logFields}><View style={styles.logField}><Text style={styles.fieldLabel}>{item.unit === 'seconds' ? 'SECONDS' : item.unit === 'per_side' ? 'REPS / SIDE' : 'REPS'}</Text><TextInput value={entry.reps} onChangeText={(value) => update(item.exerciseId, { reps: value })} keyboardType="decimal-pad" selectTextOnFocus style={styles.logInput} /></View><View style={styles.logField}><Text style={styles.fieldLabel}>WEIGHT</Text><TextInput value={entry.load} onChangeText={(value) => update(item.exerciseId, { load: value, unit: loadUnit })} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={tokens.textMuted} selectTextOnFocus style={styles.logInput} /></View></View> : null}
      </View>;
    })}
  </View>;
}

function CueSettingsModal({ visible, preferences, onClose, onChange, styles, tokens }: { visible: boolean; preferences: WorkoutCuePreferences; onClose: () => void; onChange: (value: WorkoutCuePreferences) => void; styles: ReturnType<typeof makeStyles>; tokens: DesignTokens }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalOverlay}><View style={styles.settingsModal}><View style={styles.settingsHeader}><View><Text style={styles.eyebrow}>WORKOUT CUES</Text><Text style={styles.settingsTitle}>Sound and haptics</Text></View><Pressable onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>Done</Text></Pressable></View><SettingRow title="Audio cues" detail="Short dings through the current audio output." value={preferences.audioEnabled} onValueChange={(audioEnabled) => onChange({ ...preferences, audioEnabled })} styles={styles} tokens={tokens} /><SettingRow title="Haptic cues" detail="Vibration cues at the same intervals." value={preferences.hapticsEnabled} onValueChange={(hapticsEnabled) => onChange({ ...preferences, hapticsEnabled })} styles={styles} tokens={tokens} /><SettingRow title="Final 5 seconds" detail="Cue each of the last five seconds." value={preferences.finalCountdownEnabled} onValueChange={(finalCountdownEnabled) => onChange({ ...preferences, finalCountdownEnabled })} styles={styles} tokens={tokens} /><Text style={styles.settingsNote}>Work cues: 2 min, 1 min, 30 sec, 10 sec. Rest cues: 15 sec and 5 sec.</Text></View></View></Modal>;
}
function SettingRow({ title, detail, value, onValueChange, styles, tokens }: { title: string; detail: string; value: boolean; onValueChange: (value: boolean) => void; styles: ReturnType<typeof makeStyles>; tokens: DesignTokens }) { return <View style={styles.settingRow}><View style={{ flex: 1 }}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingDetail}>{detail}</Text></View><Switch value={value} onValueChange={onValueChange} trackColor={{ false: tokens.border, true: tokens.accentSoft }} thumbColor={value ? tokens.accent : tokens.surface} /></View>; }
function SummaryMetric({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof makeStyles> }) { return <View style={styles.summaryMetric}><Text style={styles.summaryMetricValue}>{value}</Text><Text style={styles.summaryMetricLabel}>{label}</Text></View>; }
function ChoiceButton({ label, selected, onPress, styles }: { label: string; selected: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles> }) { return <Pressable onPress={onPress} style={[styles.choiceButton, selected && styles.choiceButtonSelected]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>; }
function NumberScale({ values, selected, onSelect, styles, compact = false }: { values: number[]; selected: number | null; onSelect: (value: number) => void; styles: ReturnType<typeof makeStyles>; compact?: boolean }) { return <View style={[styles.numberScale, compact && styles.numberScaleCompact]}>{values.map((value) => <Pressable key={value} onPress={() => onSelect(value)} style={[styles.numberButton, compact && styles.numberButtonCompact, selected === value && styles.numberButtonSelected]}><Text style={[styles.numberButtonText, selected === value && styles.numberButtonTextSelected]}>{value}</Text></Pressable>)}</View>; }

function defaultLoadBasis(exercise: Exercise): LoadBasis { const ids = exercise.equipmentOptions.flatMap((option) => option.items.map((item) => item.equipmentId)); if (ids.includes('dumbbell')) return 'each_hand'; if (ids.includes('barbell') || ids.includes('trap_bar')) return 'total'; if (ids.includes('long_band') || ids.includes('mini_band')) return 'band_level'; if (ids.every((id) => id === 'bodyweight')) return 'bodyweight'; return 'single_implement'; }
function formatPrescription(target: number, unit: 'total' | 'per_side' | 'seconds') { if (unit === 'seconds') return `${target} sec`; if (unit === 'per_side') return `${target}/side`; return `${target} reps`; }
function formatPlanDate(value: string): string { return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
function formatTime(seconds: number) { const minutes = Math.floor(seconds / 60); return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`; }
function startOfWeekIso(): string { const date = new Date(); const day = date.getDay(); date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day)); date.setHours(0,0,0,0); return date.toISOString(); }

function makeStyles(tokens: DesignTokens) { return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: tokens.canvas }, topBar: { minHeight: 72, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: tokens.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border }, topCopy: { flex: 1 }, eyebrow: { color: tokens.accent, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.15 }, topTitle: { color: tokens.text, fontSize: 17, lineHeight: 21, fontWeight: '800', marginTop: 2 }, iconHeaderButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, pausePill: { minHeight: 38, paddingHorizontal: 10, borderRadius: 999, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, pauseButtonText: { color: tokens.text, fontSize: 12.5, fontWeight: '800' }, endPill: { minHeight: 40, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' }, endButtonText: { color: tokens.danger, fontSize: 13, fontWeight: '800' },
  planBanner: { marginHorizontal: 14, marginTop: 10, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 14, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, flexDirection: 'row', alignItems: 'center', gap: 9 }, planBannerText: { flex: 1, color: tokens.textMuted, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
  resumeBanner: { marginHorizontal: 14, marginTop: 10, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 14, backgroundColor: tokens.accentSoft, flexDirection: 'row', alignItems: 'center', gap: 9 }, resumeBannerText: { flex: 1, color: tokens.accent, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 110, gap: 13 }, timerCard: { backgroundColor: tokens.header, borderRadius: 26, paddingHorizontal: 22, paddingVertical: 20, gap: 6, shadowColor: '#000', shadowOpacity: tokens.isDark ? 0.25 : 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 4 }, restTimerCard: { backgroundColor: tokens.accentStrong }, timerTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, phaseLabel: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }, timer: { color: '#FFFFFF', fontSize: 82, lineHeight: 91, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -3 }, timerContext: { color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 18 }, timerControl: { alignSelf: 'flex-start', marginTop: 8, minHeight: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }, timerControlText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' },
  stationCard: { backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, borderRadius: 22, paddingHorizontal: 15 }, exerciseRow: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border }, exerciseRowFirst: { borderTopWidth: 0 }, exerciseNumber: { width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' }, exerciseNumberText: { color: tokens.accent, fontSize: 16, fontWeight: '900' }, exerciseCopy: { flex: 1, minWidth: 0 }, exerciseName: { color: tokens.text, fontSize: 17, lineHeight: 22, fontWeight: '800' }, helper: { color: tokens.textMuted, fontSize: 14, lineHeight: 20 }, adaptationText: { color: tokens.accent, fontSize: 12, lineHeight: 16, marginTop: 3 }, inlineActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }, actionDivider: { color: tokens.textMuted, fontSize: 12 }, prescriptionPill: { minWidth: 72, minHeight: 38, borderRadius: 12, paddingHorizontal: 10, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' }, prescriptionText: { color: tokens.accent, fontSize: 13, fontWeight: '900' }, textAction: { paddingVertical: 3, paddingHorizontal: 1 }, textActionText: { color: tokens.accent, fontSize: 12.5, fontWeight: '800' },
  nextCard: { backgroundColor: tokens.surfaceMuted, borderRadius: 18, padding: 15, gap: 3 }, nextLabel: { color: tokens.accent, fontSize: 10.5, fontWeight: '900', letterSpacing: 1 }, nextTitle: { color: tokens.text, fontSize: 16, lineHeight: 22, fontWeight: '700' }, nextDetail: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 2 }, controlRow: { flexDirection: 'row', gap: 9 }, primaryButton: { flex: 1, minHeight: 52, paddingHorizontal: 17, borderRadius: 17, backgroundColor: tokens.header, alignItems: 'center', justifyContent: 'center' }, primaryButtonText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '800' }, outlineButton: { flex: 1, minHeight: 52, paddingHorizontal: 14, borderRadius: 17, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.borderStrong, alignItems: 'center', justifyContent: 'center' }, outlineButtonText: { color: tokens.text, fontSize: 15, fontWeight: '800' }, textButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center' }, textButtonText: { color: tokens.textMuted, fontSize: 14, fontWeight: '700' },
  restPanel: { backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, borderRadius: 22, overflow: 'hidden' }, roundHeader: { padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: tokens.surfaceMuted }, cardTitle: { color: tokens.text, fontSize: 17, lineHeight: 22, fontWeight: '800' }, roundControls: { flexDirection: 'row', alignItems: 'center', gap: 10 }, roundButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.borderStrong, alignItems: 'center', justifyContent: 'center' }, roundButtonText: { color: tokens.accent, fontSize: 21, fontWeight: '800' }, roundValue: { color: tokens.text, fontSize: 22, fontWeight: '900', minWidth: 24, textAlign: 'center' }, globalUnitRow: { minHeight: 48, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border }, globalUnitToggle: { flexDirection: 'row', backgroundColor: tokens.surface, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: tokens.border }, globalUnitButton: { minWidth: 48, height: 34, alignItems: 'center', justifyContent: 'center' }, globalUnitButtonSelected: { backgroundColor: tokens.accent }, globalUnitText: { color: tokens.textMuted, fontSize: 12, fontWeight: '800' }, globalUnitTextSelected: { color: '#FFFFFF' }, logExercise: { padding: 15, gap: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border }, skippedExercise: { opacity: 0.58 }, logTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 10 }, skipPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: tokens.surfaceMuted }, skipPillSelected: { backgroundColor: tokens.accentSoft }, skipPillText: { color: tokens.textMuted, fontSize: 10.5, fontWeight: '800' }, skipPillTextSelected: { color: tokens.accent }, logFields: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 }, logField: { flex: 1, gap: 5 }, fieldLabel: { color: tokens.textMuted, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.6 }, logInput: { minHeight: 46, borderWidth: 1, borderColor: tokens.borderStrong, borderRadius: 12, backgroundColor: tokens.surfaceRaised, color: tokens.text, textAlign: 'center', fontSize: 17, fontWeight: '800' }, 
  completeContainer: { padding: 20, paddingBottom: 130, gap: 15 }, coachAcknowledgment: { backgroundColor: tokens.accentSoft, borderRadius: 20, padding: 16, gap: 5 }, coachLabel: { color: tokens.accent, fontSize: 10.5, fontWeight: '900', letterSpacing: 1 }, completeTitle: { color: tokens.text, fontSize: 32, lineHeight: 38, fontWeight: '800' }, summaryRow: { flexDirection: 'row', gap: 8 }, summaryMetric: { flex: 1, minHeight: 78, borderRadius: 17, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' }, summaryMetricValue: { color: tokens.text, fontSize: 19, fontWeight: '900' }, summaryMetricLabel: { color: tokens.textMuted, fontSize: 11.5, marginTop: 3 }, card: { backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, borderRadius: 20, padding: 16, gap: 11 }, feedbackRow: { flexDirection: 'row', gap: 6 }, choiceButton: { flex: 1, minHeight: 45, borderRadius: 13, borderWidth: 1, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' }, choiceButtonSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent }, choiceText: { color: tokens.textMuted, fontSize: 11.5, fontWeight: '800' }, choiceTextSelected: { color: tokens.accent }, numberScale: { flexDirection: 'row', gap: 6 }, numberScaleCompact: { flexWrap: 'wrap' }, numberButton: { flex: 1, minWidth: 42, height: 43, borderRadius: 12, borderWidth: 1, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' }, numberButtonCompact: { flex: 0, width: 43 }, numberButtonSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent }, numberButtonText: { color: tokens.text, fontSize: 13, fontWeight: '800' }, numberButtonTextSelected: { color: tokens.accent }, reflectionInput: { minHeight: 112, borderWidth: 1, borderColor: tokens.borderStrong, borderRadius: 14, padding: 13, color: tokens.text, backgroundColor: tokens.surfaceRaised, fontSize: 14.5, lineHeight: 20, textAlignVertical: 'top' }, savedNote: { color: tokens.success, fontSize: 12.5, fontWeight: '800' }, shareButton: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: tokens.border, borderRadius: 20, backgroundColor: tokens.surface, paddingHorizontal: 14, paddingVertical: 12 }, shareChevron: { color: tokens.textMuted, fontSize: 26, fontWeight: '300' }, symptomButton: { backgroundColor: tokens.surfaceMuted, borderRadius: 20, padding: 16, gap: 4 }, disclosureRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 16 }, disclosureChevron: { color: tokens.textMuted, fontSize: 22, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'center', padding: 20 }, settingsModal: { backgroundColor: tokens.surface, borderRadius: 22, padding: 18, gap: 3 }, settingsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 }, settingsTitle: { color: tokens.text, fontSize: 22, fontWeight: '800', marginTop: 2 }, closeButton: { padding: 8 }, closeText: { color: tokens.accent, fontWeight: '800' }, settingRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border }, settingTitle: { color: tokens.text, fontSize: 15, fontWeight: '800' }, settingDetail: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 17, marginTop: 2 }, settingsNote: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18, paddingTop: 10 }, missingCard: { flex: 1, justifyContent: 'center', padding: 24, gap: 18 },
}); }
