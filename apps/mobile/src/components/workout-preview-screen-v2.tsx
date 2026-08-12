import type { Exercise, ExerciseSwapReason, GeneratedWorkout } from '@circuit/domain';
import { listExerciseSwapCandidates, swapExerciseInWorkout, type ExerciseSwapCandidate } from '@circuit/generator';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActiveWorkoutResumeCard } from '@/components/active-workout-resume-card';
import { CoachInsights } from '@/components/coach-insights';
import { ExerciseDemoModal } from '@/components/exercise-demo-modal';
import { ExerciseSwapModal } from '@/components/exercise-swap-modal';
import { KeyboardSafeScreen } from '@/components/keyboard-safe-screen';
import { ProductDisclosure } from '@/components/product-ui';
import { SportIcon } from '@/components/sport-icon';
import { V23Icon } from '@/components/v23-ui';
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

export default function WorkoutPreviewScreenV2() {
  const { exercises } = useExerciseCatalog();
  const router = useRouter();
  const { user, cloudEnabled } = useAuth();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const {
    previewWorkout,
    previewExplanation,
    previewPlannedSession,
    previewModifiedFromPlan,
    activeWorkout,
    activePlanLink,
    updatePreviewWorkout,
    beginWorkout,
  } = useWorkoutContext();
  const originalWorkout = useRef<GeneratedWorkout | null>(previewWorkout ? cloneWorkout(previewWorkout) : null);
  const originalWorkoutId = useRef<string | null>(previewWorkout?.id ?? null);
  const [demoExercise, setDemoExercise] = useState<Exercise | null>(null);
  const [swapTarget, setSwapTarget] = useState<{ stationId: string; exercise: Exercise } | null>(null);
  const [swapBusy, setSwapBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [roomBusy, setRoomBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [naming, setNaming] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!previewWorkout || originalWorkoutId.current === previewWorkout.id) return;
    originalWorkout.current = cloneWorkout(previewWorkout);
    originalWorkoutId.current = previewWorkout.id;
  }, [previewWorkout]);

  if (!previewWorkout) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.missing}>
      <Text style={styles.missingTitle}>No workout selected</Text>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/train' as Href)} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>Back to Train</Text><V23Icon name="chevron" color="#FFFFFF" size={17} />
      </Pressable>
    </View></SafeAreaView>;
  }

  const workout = previewWorkout;
  const focusRegions = workout.targetRegions.slice(0, 4).map(formatRegion);
  const equipmentSummary = workout.requiredEquipment.length
    ? workout.requiredEquipment.slice(0, 3).map(formatRegion).join(' · ')
    : 'Bodyweight';
  const activeMatchesPreview = Boolean(
    activeWorkout
      && activeWorkout.id === workout.id
      && (activePlanLink?.sessionId ?? null) === (previewPlannedSession?.id ?? null),
  );

  async function save() {
    if (await isWorkoutFavorite(workout.id)) { setSaved(true); return; }
    await saveFavoriteWorkout(workout);
    setSaved(true);
  }

  async function loadSwapCandidates(reason: ExerciseSwapReason): Promise<ExerciseSwapCandidate[]> {
    if (!swapTarget) return [];
    const exercisePreferences = await listExercisePreferences();
    const result = listExerciseSwapCandidates({
      workout,
      stationId: swapTarget.stationId,
      exerciseId: swapTarget.exercise.id,
      reason,
      context: { exercises, exercisePreferences },
    });
    if (!result.ok) throw new Error(result.message);
    return result.candidates;
  }

  async function swap(reason: ExerciseSwapReason, candidateId: string) {
    if (!swapTarget) return;
    setSwapBusy(true);
    setMessage(null);
    try {
      const exercisePreferences = await listExercisePreferences();
      const result = swapExerciseInWorkout({
        workout,
        stationId: swapTarget.stationId,
        exerciseId: swapTarget.exercise.id,
        reason,
        candidateId,
        context: { exercises, exercisePreferences },
      });
      if (!result.ok) { setMessage(result.message); return; }
      updatePreviewWorkout(result.workout);
      if (reason === 'dislike') await saveExercisePreference({ exerciseId: swapTarget.exercise.id, preference: 'disliked', familiarity: 'familiar' });
      if (reason === 'unfamiliar') await saveExercisePreference({ exerciseId: swapTarget.exercise.id, preference: 'neutral', familiarity: 'unreviewed' });
      setSwapTarget(null);
    } finally {
      setSwapBusy(false);
    }
  }

  function start() {
    if (!activeWorkout) {
      beginWorkout(workout);
      router.push('/active-workout' as Href);
      return;
    }
    if (activeMatchesPreview) {
      router.push('/active-workout' as Href);
      return;
    }
    Alert.alert(
      'Replace the active workout?',
      `${activeWorkout.name} is paused and saved. Starting this workout will replace that active session.`,
      [
        { text: 'Keep current workout', style: 'cancel' },
        { text: 'Resume current', onPress: () => router.push('/active-workout' as Href) },
        { text: 'Replace and start', style: 'destructive', onPress: () => { beginWorkout(workout); router.push('/active-workout' as Href); } },
      ],
    );
  }

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
    } finally {
      setRoomBusy(false);
    }
  }

  const footer = <View style={styles.footerRow}>
    <View style={styles.footerCopy}>
      <Text style={styles.footerLabel}>{activeMatchesPreview ? 'WORKOUT IN PROGRESS' : 'READY TO TRAIN'}</Text>
      <Text style={styles.footerMeta}>{Math.round(workout.estimatedElapsedSeconds / 60)} min · {workout.stations.length} stations</Text>
    </View>
    <Pressable accessibilityRole="button" onPress={start} style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}>
      <Text style={styles.startButtonText}>{activeMatchesPreview ? 'Resume' : 'Start'}</Text>
      <V23Icon name="play" color="#FFFFFF" size={16} />
    </Pressable>
  </View>;

  return <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
    <KeyboardSafeScreen contentContainerStyle={styles.content} footer={footer}>
      {activeWorkout ? <ActiveWorkoutResumeCard workout={activeWorkout} planLink={activePlanLink} onResume={() => router.push('/active-workout' as Href)} compact /> : null}

      <View style={styles.header}>
        <View style={styles.headerKickerRow}>
          <SportIcon kind="strength" color={tokens.accent} backgroundColor={tokens.accentSoft} size={19} />
          <Text style={styles.eyebrow}>{previewPlannedSession ? 'PLANNED WORKOUT' : 'WORKOUT PREVIEW'}</Text>
          {previewModifiedFromPlan ? <View style={styles.customizedPill}><Text style={styles.customizedText}>Customized</Text></View> : null}
        </View>
        <Text style={styles.title}>{workout.name}</Text>
        <Text style={styles.meta}>{Math.round(workout.estimatedElapsedSeconds / 60)} min total · {workout.stations.length} stations · {equipmentSummary}</Text>
        {previewPlannedSession ? <Text style={styles.planLine}>{formatPlanDate(previewPlannedSession.date)} · {previewPlannedSession.title}</Text> : null}
      </View>

      <View style={styles.primaryActions}>
        <Pressable accessibilityRole="button" onPress={() => setEditing(true)} style={({ pressed }) => [styles.editAction, pressed && styles.pressed]}>
          <V23Icon name="log" color={tokens.accent} size={17} /><Text style={styles.editActionText}>Edit workout</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void save()} style={({ pressed }) => [styles.saveAction, saved && styles.saveActionSelected, pressed && styles.pressed]}>
          <V23Icon name="heart" color={tokens.accent} size={16} /><Text style={styles.saveActionText}>{saved ? 'Saved' : 'Save'}</Text>
        </Pressable>
      </View>

      <View style={styles.purposeStrip}>
        <View style={styles.purposeCopy}>
          <Text style={styles.purposeLabel}>SESSION INTENT</Text>
          <Text style={styles.purposeTitle}>{workout.stations.map((station) => station.purpose).slice(0, 2).join(' + ') || 'Balanced strength'}</Text>
          <Text style={styles.purposeBody}>{focusRegions.length ? focusRegions.join(' · ') : 'Balanced full-body strength'}</Text>
        </View>
      </View>

      {previewExplanation ? <ProductDisclosure
        title="Why this workout?"
        summary={previewExplanation.conciseWhy[0] ?? 'See how this session fits the plan, fatigue, and recovery context.'}
        expanded={whyOpen}
        onPress={() => setWhyOpen((value) => !value)}
      >
        <CoachInsights explanation={previewExplanation} />
      </ProductDisclosure> : null}

      {workout.recentLoadAdjustments.length ? <View style={styles.adjustmentStrip}>
        <Text style={styles.adjustmentLabel}>RECENT ADAPTATION</Text>
        {workout.recentLoadAdjustments.map((item) => <Text key={item} style={styles.adjustmentText}>{item}</Text>)}
      </View> : null}
      {message ? <Text style={styles.error}>{message}</Text> : null}

      <View style={styles.structureHeading}>
        <Text style={styles.sectionEyebrow}>WORKOUT</Text>
        <Text style={styles.sectionTitle}>Move through it station by station.</Text>
      </View>

      <View style={styles.stationStack}>
        {workout.stations.map((station) => <View key={station.id} style={styles.station}>
          <View style={styles.stationHeader}>
            <View style={styles.stationNumber}><Text style={styles.stationNumberText}>{station.order}</Text></View>
            <View style={styles.stationCopy}>
              <Text style={styles.stationTitle}>{station.purpose}</Text>
              <Text style={styles.stationMeta}>{Math.round(station.durationSeconds / 60)} min AMRAP</Text>
            </View>
          </View>

          <View style={styles.exerciseList}>
            {station.exercises.map((item, index) => <View key={item.exerciseId} style={[styles.exerciseRow, index > 0 && styles.exerciseRowBorder]}>
              <View style={styles.exerciseOrder}><Text style={styles.exerciseOrderText}>{item.order}</Text></View>
              <Pressable accessibilityRole="button" onPress={() => setDemoExercise(item.exerciseSnapshot)} style={({ pressed }) => [styles.exerciseCopy, pressed && styles.pressed]}>
                <Text style={styles.exerciseName}>{item.exerciseSnapshot.name}</Text>
                <Text style={styles.exerciseMeta}>{formatPrescription(item.target, item.unit)} · {item.exerciseSnapshot.category}</Text>
                {showExerciseAdaptation(item.adaptationNote, workout.recentLoadAdjustments) ? <Text style={styles.adaptationText}>{item.adaptationNote}</Text> : null}
              </Pressable>
              <View style={styles.exerciseActions}>
                <Pressable accessibilityRole="button" accessibilityLabel={`View demo for ${item.exerciseSnapshot.name}`} onPress={() => setDemoExercise(item.exerciseSnapshot)} style={styles.demoButton}>
                  <Text style={styles.demoText}>Demo</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Swap ${item.exerciseSnapshot.name}`} onPress={() => setSwapTarget({ stationId: station.id, exercise: item.exerciseSnapshot })} style={styles.swapButton}>
                  <Text style={styles.swapText}>Swap</Text>
                </Pressable>
              </View>
            </View>)}
          </View>
        </View>)}
      </View>

      <ProductDisclosure
        title="More workout options"
        summary="Rename, share, or start this exact workout with someone else."
        expanded={moreOpen}
        onPress={() => setMoreOpen((value) => !value)}
      >
        <View style={styles.moreActions}>
          <OptionRow label="Rename workout" onPress={() => setNaming(true)} tokens={tokens} styles={styles} />
          <OptionRow label="Share workout" onPress={() => void shareText(workout.name, workoutText(workout))} tokens={tokens} styles={styles} />
          <OptionRow label={roomBusy ? 'Creating Workout Together room…' : 'Start Workout Together'} onPress={() => void startTogether()} disabled={roomBusy} tokens={tokens} styles={styles} />
        </View>
      </ProductDisclosure>
    </KeyboardSafeScreen>

    <WorkoutNameModal workout={workout} visible={naming} onClose={() => setNaming(false)} onSave={(name) => { updatePreviewWorkout({ ...workout, name }); setNaming(false); setSaved(false); }} />
    <WorkoutEditorModal
      workout={workout}
      originalWorkout={originalWorkout.current ?? workout}
      exercises={exercises}
      visible={editing}
      onClose={() => setEditing(false)}
      onSave={(edited) => { updatePreviewWorkout(edited); setEditing(false); setSaved(false); }}
    />
    <ExerciseDemoModal exercise={demoExercise} visible={Boolean(demoExercise)} onClose={() => setDemoExercise(null)} />
    <ExerciseSwapModal
      exercise={swapTarget?.exercise ?? null}
      visible={Boolean(swapTarget)}
      busy={swapBusy}
      onClose={() => setSwapTarget(null)}
      onLoadCandidates={loadSwapCandidates}
      onChooseCandidate={(reason, candidateId) => void swap(reason, candidateId)}
      onPain={() => { setSwapTarget(null); router.push('/today-check-in' as Href); }}
    />
  </SafeAreaView>;
}

function OptionRow({ label, onPress, disabled = false, tokens, styles }: { label: string; onPress: () => void; disabled?: boolean; tokens: DesignTokens; styles: ReturnType<typeof makeStyles> }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.optionRow, disabled && styles.disabled, pressed && styles.pressed]}>
    <Text style={styles.optionRowText}>{label}</Text><V23Icon name="chevron" color={tokens.textMuted} size={15} />
  </Pressable>;
}

function formatPrescription(target: number, unit: 'total' | 'per_side' | 'seconds') {
  if (unit === 'seconds') return `${target} sec`;
  if (unit === 'per_side') return `${target}/side`;
  return `${target} reps`;
}

function showExerciseAdaptation(note: string | undefined, sessionNotes: string[]): boolean {
  if (!note) return false;
  const normalized = note.trim().toLowerCase();
  return !sessionNotes.some((sessionNote) => {
    const sessionNormalized = sessionNote.trim().toLowerCase();
    if (sessionNormalized === normalized) return true;
    if (normalized.startsWith('re-entry dose:') && sessionNormalized.startsWith('re-entry dose:')) return true;
    return sessionNormalized.includes(normalized) || normalized.includes(sessionNormalized);
  });
}

function cloneWorkout(workout: GeneratedWorkout): GeneratedWorkout {
  return JSON.parse(JSON.stringify(workout)) as GeneratedWorkout;
}

function formatRegion(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPlanDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: tokens.canvas },
    content: { paddingHorizontal: 18, paddingTop: 15, paddingBottom: 34, gap: 16 },
    missing: { flex: 1, justifyContent: 'center', padding: 24, gap: 18 },
    missingTitle: { color: tokens.text, fontSize: 27, lineHeight: 32, fontWeight: '900' },

    header: { gap: 5, paddingHorizontal: 2 },
    headerKickerRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    eyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.95 },
    customizedPill: { marginLeft: 'auto', borderRadius: 999, backgroundColor: tokens.accentSoft, paddingHorizontal: 8, paddingVertical: 4 },
    customizedText: { color: tokens.accent, fontSize: 9, lineHeight: 11, fontWeight: '900' },
    title: { color: tokens.text, fontSize: 30, lineHeight: 35, fontWeight: '900', letterSpacing: -0.7 },
    meta: { color: tokens.text, fontSize: 14, lineHeight: 19, fontWeight: '800' },
    planLine: { color: tokens.textMuted, fontSize: 13, lineHeight: 18 },

    primaryActions: { flexDirection: 'row', gap: 8 },
    editAction: { flex: 1, minHeight: 43, borderRadius: 13, backgroundColor: tokens.accentSoft, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    editActionText: { color: tokens.accent, fontSize: 12, lineHeight: 16, fontWeight: '900' },
    saveAction: { minHeight: 43, borderRadius: 13, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    saveActionSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent },
    saveActionText: { color: tokens.accent, fontSize: 11.5, lineHeight: 15, fontWeight: '900' },

    purposeStrip: { borderRadius: 17, backgroundColor: tokens.surfaceMuted, padding: 13 },
    purposeCopy: { gap: 2 },
    purposeLabel: { color: tokens.accent, fontSize: 9, lineHeight: 11, fontWeight: '900', letterSpacing: 0.8 },
    purposeTitle: { color: tokens.text, fontSize: 16.5, lineHeight: 22, fontWeight: '900' },
    purposeBody: { color: tokens.textMuted, fontSize: 13, lineHeight: 19 },

    adjustmentStrip: { borderRadius: 15, backgroundColor: tokens.accentSoft, padding: 12, gap: 3 },
    adjustmentLabel: { color: tokens.accent, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.8 },
    adjustmentText: { color: tokens.text, fontSize: 13, lineHeight: 19 },
    error: { color: tokens.danger, fontSize: 12.5, lineHeight: 18, fontWeight: '700' },

    structureHeading: { gap: 2, paddingHorizontal: 2 },
    sectionEyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.95 },
    sectionTitle: { color: tokens.text, fontSize: 21, lineHeight: 26, fontWeight: '900', letterSpacing: -0.2 },
    stationStack: { gap: 11 },
    station: { borderRadius: 19, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, overflow: 'hidden' },
    stationHeader: { minHeight: 64, paddingHorizontal: 13, paddingVertical: 11, backgroundColor: tokens.surfaceMuted, flexDirection: 'row', alignItems: 'center', gap: 9 },
    stationNumber: { width: 31, height: 31, borderRadius: 10, backgroundColor: tokens.header, alignItems: 'center', justifyContent: 'center' },
    stationNumberText: { color: '#FFFFFF', fontSize: 12, lineHeight: 15, fontWeight: '900' },
    stationCopy: { flex: 1, minWidth: 0, gap: 1 },
    stationTitle: { color: tokens.text, fontSize: 16.5, lineHeight: 21, fontWeight: '900' },
    stationMeta: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
    exerciseList: { paddingHorizontal: 12 },
    exerciseRow: { minHeight: 82, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
    exerciseRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border },
    exerciseOrder: { width: 25, height: 25, borderRadius: 13, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    exerciseOrderText: { color: tokens.accent, fontSize: 10.5, lineHeight: 13, fontWeight: '900' },
    exerciseCopy: { flex: 1, minWidth: 0, gap: 1 },
    exerciseName: { color: tokens.text, fontSize: 15.5, lineHeight: 20, fontWeight: '900' },
    exerciseMeta: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 17 },
    adaptationText: { color: tokens.accent, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
    exerciseActions: { alignItems: 'flex-end', gap: 5 },
    demoButton: { minWidth: 54, minHeight: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    demoText: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 15, fontWeight: '800' },
    swapButton: { minWidth: 54, minHeight: 32, borderRadius: 9, borderWidth: 1, borderColor: tokens.accent, alignItems: 'center', justifyContent: 'center' },
    swapText: { color: tokens.accent, fontSize: 11.5, lineHeight: 15, fontWeight: '900' },

    moreActions: { gap: 0 },
    optionRow: { minHeight: 52, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    optionRowText: { color: tokens.text, fontSize: 14, lineHeight: 19, fontWeight: '800' },

    footerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    footerCopy: { flex: 1, minWidth: 0, gap: 1 },
    footerLabel: { color: tokens.accent, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.75 },
    footerMeta: { color: tokens.text, fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
    startButton: { minWidth: 112, minHeight: 44, borderRadius: 14, backgroundColor: tokens.accent, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    startButtonText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '900' },
    primaryButton: { minHeight: 46, borderRadius: 14, backgroundColor: tokens.accent, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    primaryButtonText: { color: '#FFFFFF', fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.74 },
  });
}
