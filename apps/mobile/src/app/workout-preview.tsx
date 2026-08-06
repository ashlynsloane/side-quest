import type { Exercise, ExerciseSwapReason, GeneratedWorkout } from '@circuit/domain';
import { listExerciseSwapCandidates, swapExerciseInWorkout, type ExerciseSwapCandidate } from '@circuit/generator';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExerciseDemoModal } from '@/components/exercise-demo-modal';
import { ExerciseSwapModal } from '@/components/exercise-swap-modal';
import { KeyboardSafeScreen } from '@/components/keyboard-safe-screen';
import { V23Card, V23Chip, V23Icon, V23PageIntro, V23PrimaryButton, V23SectionHeader } from '@/components/v23-ui';
import { WorkoutEditorModal } from '@/components/workout-editor-modal';
import { WorkoutNameModal } from '@/components/workout-name-modal';
import {
  isWorkoutFavorite,
  listExercisePreferences,
  saveExercisePreference,
  saveFavoriteWorkout,
} from '@/services/database';
import { useExerciseCatalog } from '@/services/exercise-catalog';
import { shareText, workoutText } from '@/services/sharing';
import { createWorkoutRoom } from '@/services/workout-together';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';
import { useWorkoutContext } from '@/state/workout-context';
import type { DesignTokens } from '@/theme';

export default function WorkoutPreviewScreen() {
  const { exercises } = useExerciseCatalog();
  const router = useRouter();
  const { user, cloudEnabled } = useAuth();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { previewWorkout, setPreviewWorkout, beginWorkout } = useWorkoutContext();
  const originalWorkout = useRef<GeneratedWorkout | null>(previewWorkout ? cloneWorkout(previewWorkout) : null);
  const [demoExercise, setDemoExercise] = useState<Exercise | null>(null);
  const [swapTarget, setSwapTarget] = useState<{ stationId: string; exercise: Exercise } | null>(null);
  const [swapBusy, setSwapBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [roomBusy, setRoomBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [naming, setNaming] = useState(false);

  function openExerciseOptions(stationId: string, exercise: Exercise) {
    Alert.alert(exercise.name, 'Choose an action.', [
      { text: 'View demo', onPress: () => setDemoExercise(exercise) },
      { text: 'Swap exercise', onPress: () => setSwapTarget({ stationId, exercise }) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  if (!previewWorkout) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.missing}><Text style={styles.missingTitle}>No workout selected</Text><V23PrimaryButton onPress={() => router.replace('/' as Href)}>Return home</V23PrimaryButton></View></SafeAreaView>;
  }

  const workout = previewWorkout;
  const focusRegions = workout.targetRegions.slice(0, 4).map(formatRegion);
  const equipmentSummary = workout.requiredEquipment.length
    ? workout.requiredEquipment.slice(0, 3).map(formatRegion).join(' · ')
    : 'Bodyweight';

  async function save() {
    if (await isWorkoutFavorite(workout.id)) { setSaved(true); return; }
    await saveFavoriteWorkout(workout);
    setSaved(true);
  }

  async function loadSwapCandidates(reason: ExerciseSwapReason): Promise<ExerciseSwapCandidate[]> {
    if (!swapTarget) return [];
    const exercisePreferences = await listExercisePreferences();
    const result = listExerciseSwapCandidates({ workout, stationId: swapTarget.stationId, exerciseId: swapTarget.exercise.id, reason, context: { exercises, exercisePreferences } });
    if (!result.ok) throw new Error(result.message);
    return result.candidates;
  }

  async function swap(reason: ExerciseSwapReason, candidateId: string) {
    if (!swapTarget) return;
    setSwapBusy(true); setMessage(null);
    try {
      const exercisePreferences = await listExercisePreferences();
      const result = swapExerciseInWorkout({ workout, stationId: swapTarget.stationId, exerciseId: swapTarget.exercise.id, reason, candidateId, context: { exercises, exercisePreferences } });
      if (!result.ok) { setMessage(result.message); return; }
      setPreviewWorkout(result.workout);
      if (reason === 'dislike') await saveExercisePreference({ exerciseId: swapTarget.exercise.id, preference: 'disliked', familiarity: 'familiar' });
      setSwapTarget(null);
    } finally { setSwapBusy(false); }
  }

  function start() { beginWorkout(workout); router.push('/active-workout' as Href); }

  async function startTogether() {
    if (!user || user.mode !== 'cloud' || !cloudEnabled) {
      Alert.alert('Cloud account required', 'Workout Together uses a private room so separate phones receive the same start clock.');
      return;
    }
    setRoomBusy(true);
    try {
      const room = await createWorkoutRoom({ workout, userId: user.id, displayName: user.displayName });
      router.push({ pathname: '/workout-room', params: { code: room.code } } as Href);
    } catch (cause) {
      Alert.alert('Could not create room', cause instanceof Error ? cause.message : String(cause));
    } finally { setRoomBusy(false); }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <KeyboardSafeScreen contentContainerStyle={styles.content}>
        <V23PageIntro label="WORKOUT PREVIEW" title={workout.name} body={`${Math.round(workout.totalWorkSeconds / 60)} min work · ${workout.stations.length} stations · ${Math.round(workout.estimatedElapsedSeconds / 60)} min total`} compact />
        <View style={styles.headerActions}>
          <Pressable onPress={() => setNaming(true)} style={styles.nameButton}><Text style={styles.nameButtonText}>Rename</Text></Pressable>
          <Pressable onPress={() => setEditing(true)} style={styles.editButton}><V23Icon name="log" color={tokens.accent} size={18} /><Text style={styles.editButtonText}>Edit workout</Text></Pressable>
          <Pressable onPress={() => void save()} style={styles.iconAction}><V23Icon name="heart" color={tokens.accent} size={18} /><Text style={styles.iconActionText}>{saved ? 'Saved' : 'Save'}</Text></Pressable>
          <Pressable onPress={() => void shareText(workout.name, workoutText(workout))} style={styles.iconAction}><V23Icon name="more" color={tokens.accent} size={18} /><Text style={styles.iconActionText}>Share</Text></Pressable>
        </View>

        <V23Card tone="muted" style={styles.overviewCard}>
          <Text style={styles.overviewEyebrow}>SESSION PURPOSE</Text>
          <Text style={styles.overviewTitle}>{workout.stations.map((item) => item.purpose).slice(0, 2).join(' + ')}</Text>
          <Text style={styles.overviewBody}>A {Math.round(workout.estimatedElapsedSeconds / 60)}-minute session built around {focusRegions.length ? focusRegions.join(', ') : 'balanced full-body strength'}.</Text>
          <View style={styles.overviewChips}>
            <V23Chip tone="accent">{workout.stations.length} stations</V23Chip>
            <V23Chip>{equipmentSummary}</V23Chip>
            {workout.variantLabel ? <V23Chip tone="warm">{workout.variantLabel}</V23Chip> : null}
          </View>
        </V23Card>

        {workout.recentLoadAdjustments.length ? <V23Card tone="muted" style={styles.adjustmentCard}>{workout.recentLoadAdjustments.map((item) => <Text key={item} style={styles.adjustment}>• {item}</Text>)}</V23Card> : null}
        {message ? <Text style={styles.error}>{message}</Text> : null}

        <V23SectionHeader>WORKOUT STRUCTURE</V23SectionHeader>
        {workout.stations.map((station) => (
          <V23Card key={station.id} style={styles.stationCard}>
            <View style={styles.stationHeader}>
              <View style={{ flex: 1 }}><Text style={styles.stationLabel}>STATION {station.order}</Text><Text style={styles.stationTitle}>{station.purpose}</Text></View>
              <V23Chip>{Math.round(station.durationSeconds / 60)} min AMRAP</V23Chip>
            </View>
            {station.exercises.map((item, index) => (
              <View key={item.exerciseId} style={[styles.exerciseRow, index === station.exercises.length - 1 && styles.exerciseRowLast]}>
                <View style={styles.exerciseNumber}><Text style={styles.exerciseNumberText}>{item.order}</Text></View>
                <View style={styles.exerciseCopy}><Text style={styles.exerciseName}>{item.exerciseSnapshot.name}</Text><Text style={styles.exerciseMeta}>{formatPrescription(item.target, item.unit)} · {item.exerciseSnapshot.category}</Text>{item.adaptationNote ? <Text style={styles.adaptationText}>{item.adaptationNote}</Text> : null}</View>
                <Pressable accessibilityLabel={`Options for ${item.exerciseSnapshot.name}`} onPress={() => openExerciseOptions(station.id, item.exerciseSnapshot)} style={styles.optionButton}>
                  <V23Icon name="more" color={tokens.accent} size={19} />
                </Pressable>
              </View>
            ))}
          </V23Card>
        ))}

        <View style={styles.startPanel}>
          <View><Text style={styles.startTitle}>Ready when you are</Text><Text style={styles.startBody}>Edits and swaps are saved for this session.</Text></View>
          <V23PrimaryButton onPress={start} icon="play">Start workout</V23PrimaryButton>
          <Pressable onPress={() => void startTogether()} disabled={roomBusy} style={[styles.togetherButton, roomBusy && styles.disabled]}><Text style={styles.togetherButtonText}>{roomBusy ? 'Creating room…' : 'Start this workout together'}</Text></Pressable>
        </View>
      </KeyboardSafeScreen>

      <WorkoutNameModal workout={workout} visible={naming} onClose={() => setNaming(false)} onSave={(name) => { setPreviewWorkout({ ...workout, name }); setNaming(false); setSaved(false); }} />
      <WorkoutEditorModal
        workout={workout}
        originalWorkout={originalWorkout.current ?? workout}
        exercises={exercises}
        visible={editing}
        onClose={() => setEditing(false)}
        onSave={(edited) => { setPreviewWorkout(edited); setEditing(false); setSaved(false); }}
      />
      <ExerciseDemoModal exercise={demoExercise} visible={Boolean(demoExercise)} onClose={() => setDemoExercise(null)} />
      <ExerciseSwapModal exercise={swapTarget?.exercise ?? null} visible={Boolean(swapTarget)} busy={swapBusy} onClose={() => setSwapTarget(null)} onLoadCandidates={loadSwapCandidates} onChooseCandidate={(reason, candidateId) => void swap(reason, candidateId)} onPain={() => { setSwapTarget(null); router.push('/today-check-in' as Href); }} />
    </SafeAreaView>
  );
}

function formatPrescription(target: number, unit: 'total' | 'per_side' | 'seconds') {
  if (unit === 'seconds') return `${target} sec`;
  if (unit === 'per_side') return `${target}/side`;
  return `${target} reps`;
}
function cloneWorkout(workout: GeneratedWorkout): GeneratedWorkout { return JSON.parse(JSON.stringify(workout)) as GeneratedWorkout; }
function formatRegion(value: string): string { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }

function makeStyles(tokens: DesignTokens) { return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: tokens.canvas }, content: { padding: 18, paddingBottom: 80, gap: 14 }, missing: { flex: 1, justifyContent: 'center', padding: 24, gap: 18 }, missingTitle: { color: tokens.text, fontSize: 28, fontWeight: '800' },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, nameButton: { minHeight: 48, paddingHorizontal: 14, borderRadius: 15, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' }, nameButtonText: { color: tokens.accent, fontSize: 13, fontWeight: '800' }, editButton: { flex: 1, minHeight: 48, borderRadius: 15, backgroundColor: tokens.accentSoft, borderWidth: 1, borderColor: tokens.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, editButtonText: { color: tokens.accent, fontSize: 14, fontWeight: '800' }, iconAction: { minWidth: 70, minHeight: 48, borderRadius: 15, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center', gap: 2 }, iconActionText: { color: tokens.textMuted, fontSize: 10.5, fontWeight: '700' },
  overviewCard: { gap: 8 }, overviewEyebrow: { color: tokens.accent, fontSize: 10.5, fontWeight: '900', letterSpacing: 1 }, overviewTitle: { color: tokens.text, fontSize: 19, lineHeight: 24, fontWeight: '800' }, overviewBody: { color: tokens.textMuted, fontSize: 14, lineHeight: 20 }, overviewChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 2 },
  adjustmentCard: { gap: 4 }, adjustment: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19 }, error: { color: tokens.danger, fontSize: 14, fontWeight: '700' },
  stationCard: { padding: 16, gap: 10 }, stationHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, stationLabel: { color: tokens.accent, fontSize: 10.5, fontWeight: '900', letterSpacing: 1 }, stationTitle: { color: tokens.text, fontSize: 19, lineHeight: 24, fontWeight: '800', marginTop: 3 },
  exerciseRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border }, exerciseRowLast: { paddingBottom: 0 }, exerciseNumber: { width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' }, exerciseNumberText: { color: tokens.accent, fontSize: 14, fontWeight: '800' }, exerciseCopy: { flex: 1, minWidth: 0 }, exerciseName: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '800' }, exerciseMeta: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 18, marginTop: 2 }, adaptationText: { color: tokens.accent, fontSize: 12, lineHeight: 16, marginTop: 3 }, optionButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  startPanel: { gap: 11, marginTop: 2, paddingTop: 5 }, startTitle: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '800' }, startBody: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19, marginTop: 2 },
  togetherButton: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: tokens.borderStrong, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' }, togetherButtonText: { color: tokens.accent, fontSize: 14.5, fontWeight: '800' }, disabled: { opacity: 0.5 },
}); }
