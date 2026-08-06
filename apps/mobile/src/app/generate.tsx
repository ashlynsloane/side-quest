import type {
  AvoidanceTag,
  BodyRegion,
  EquipmentId,
  Exercise,
  ExerciseSwapReason,
  GeneratedWorkout,
  JointRegion,
  MovementPattern,
  PainAreaSelection,
} from '@circuit/domain';
import { equipmentSeed } from '@circuit/exercise-content';
import { generateWorkout, listExerciseSwapCandidates, swapExerciseInWorkout, type ExerciseSwapCandidate } from '@circuit/generator';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExerciseDemoModal } from '@/components/exercise-demo-modal';
import { ExerciseSwapModal } from '@/components/exercise-swap-modal';
import { PainBodyMap } from '@/components/pain-body-map';
import { MOVEMENT_PATTERN_OPTIONS, buildRestrictionsFromPainAreas } from '@/content/pain-areas';
import { DEFAULT_EQUIPMENT, DEFAULT_REQUEST } from '@/features/generate/default-request';
import {
  deleteFavoriteWorkout,
  getActiveTrainingCheckIn,
  getLatestPTProfile,
  getPreviousExerciseIds,
  getRecentRegionExposures,
  isWorkoutFavorite,
  listExercisePreferences,
  ensureDefaultEquipmentProfiles,
  saveFavoriteWorkout,
  saveExercisePreference,
  type EquipmentProfile,
} from '@/services/database';
import { useExerciseCatalog } from '@/services/exercise-catalog';
import { useWorkoutContext } from '@/state/workout-context';

const WORK_TIMES = [24, 32, 40, 48] as const;
const FOCUS_OPTIONS: Array<{ label: string; region: BodyRegion }> = [
  { label: 'Hamstrings', region: 'hamstrings' },
  { label: 'Glutes', region: 'glutes' },
  { label: 'Quads', region: 'quadriceps' },
  { label: 'Core', region: 'core_anterior' },
  { label: 'Upper back', region: 'upper_back' },
  { label: 'Calves + ankles', region: 'feet_ankles' },
  { label: 'Shoulders', region: 'shoulders' },
  { label: 'Chest', region: 'chest' },
  { label: 'Adductors', region: 'hip_adductors' },
];

const QUICK_EQUIPMENT: EquipmentId[] = [
  'dumbbell',
  'kettlebell',
  'medicine_ball',
  'long_band',
  'mini_band',
  'bench',
  'box',
  'bosu',
  'trx',
];

const MOVEMENT_AVOIDANCE: Array<{ label: string; tags: AvoidanceTag[] }> = [
  { label: 'No jumping', tags: ['jumping', 'high_impact'] },
  { label: 'No overhead', tags: ['overhead'] },
  { label: 'No weight through hands', tags: ['shoulder_weight_bearing', 'wrist_weight_bearing'] },
  { label: 'No floor work', tags: ['floor_required'] },
  { label: 'No rotation', tags: ['rotation'] },
  { label: 'No deep squats', tags: ['deep_knee_flexion'] },
  { label: 'No unstable surfaces', tags: ['unstable_surface'] },
];

export default function GenerateScreen() {
  const { exercises, customCount } = useExerciseCatalog();

  const router = useRouter();
  const { previewWorkout: workout, setPreviewWorkout, beginWorkout } = useWorkoutContext();
  const [workMinutes, setWorkMinutes] = useState<number>(40);
  const [focuses, setFocuses] = useState<BodyRegion[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentId[]>(DEFAULT_EQUIPMENT);
  const [equipmentProfiles, setEquipmentProfiles] = useState<EquipmentProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [excludedRegions, setExcludedRegions] = useState<Array<BodyRegion | JointRegion>>([]);
  const [painAreas, setPainAreas] = useState<PainAreaSelection[]>([]);
  const [excludedMovementPatterns, setExcludedMovementPatterns] = useState<MovementPattern[]>([]);
  const [excludedMovementTags, setExcludedMovementTags] = useState<AvoidanceTag[]>([]);
  const [showAllEquipment, setShowAllEquipment] = useState(false);
  const [showLimitations, setShowLimitations] = useState(false);
  const [demoExercise, setDemoExercise] = useState<Exercise | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState<{ stationId: string; exercise: Exercise } | null>(null);
  const [swapBusy, setSwapBusy] = useState(false);

  const equipmentLabels = useMemo(
    () => new Map(equipmentSeed.map((item) => [item.id, item.label])),
    [],
  );
  const allEquipment = useMemo(
    () => equipmentSeed.map((item) => item.id).filter((id) => id !== 'bodyweight'),
    [],
  );

  useEffect(() => {
    let live = true;
    void ensureDefaultEquipmentProfiles().then((profiles) => {
      if (!live) return;
      setEquipmentProfiles(profiles);
      const selected = profiles.find((profile) => profile.isDefault) ?? profiles[0];
      if (selected) { setSelectedProfileId(selected.id); setSelectedEquipment(selected.equipment.filter((id) => id !== 'bodyweight')); }
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    void Promise.all([getLatestPTProfile(), getActiveTrainingCheckIn()]).then(([profile, checkIn]) => {
      if (!live) return;
      const profileAreas = profile?.active ? profile.protectedAreas ?? [] : [];
      const checkInAreas = checkIn?.active ? checkIn.painAreas ?? [] : [];
      const mergedAreas = new Map([...profileAreas, ...checkInAreas].map((area) => [area.areaId, area]));
      setPainAreas([...mergedAreas.values()]);
      setExcludedRegions([
        ...(profile?.active ? profile.excludedRegions : []),
        ...(checkIn?.active && !(checkIn.regionRestrictions?.length) ? checkIn.affectedRegions : []),
      ]);
      setExcludedMovementPatterns([...new Set([
        ...(profile?.active ? profile.excludedMovementPatterns ?? [] : []),
        ...(checkIn?.active ? checkIn.aggravatedMovementPatterns ?? [] : []),
      ])]);
      setExcludedMovementTags([...new Set([
        ...(profile?.active ? profile.excludedMovementTags : []),
        ...(checkIn?.active ? checkIn.aggravatedMovementTags : []),
      ])]);
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!workout) {
      setFavorite(false);
      return;
    }
    void isWorkoutFavorite(workout.id).then((value) => {
      if (!cancelled) setFavorite(value);
    });
    return () => {
      cancelled = true;
    };
  }, [workout]);

  function toggleFocus(region: BodyRegion) {
    setFocuses((current) =>
      current.includes(region) ? current.filter((item) => item !== region) : [...current, region],
    );
  }

  function toggleEquipment(id: EquipmentId) {
    setSelectedProfileId(null);
    setSelectedEquipment((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function toggleMovementGroup(tags: AvoidanceTag[]) {
    const enabled = tags.every((tag) => excludedMovementTags.includes(tag));
    setExcludedMovementTags((current) => {
      const next = new Set(current);
      tags.forEach((tag) => enabled ? next.delete(tag) : next.add(tag));
      return [...next];
    });
  }

  function toggleMovementPattern(pattern: MovementPattern) {
    setExcludedMovementPatterns((current) => current.includes(pattern)
      ? current.filter((item) => item !== pattern)
      : [...current, pattern]);
  }

  async function createWorkout() {
    setBusy(true);
    setError(null);
    try {
      const [recentRegionExposures, previousExerciseIds, exercisePreferences] = await Promise.all([
        getRecentRegionExposures(),
        getPreviousExerciseIds(),
        listExercisePreferences(),
      ]);
      const emphasis = focuses.length > 1 ? 'moderate' : 'strong';
      const mappedRestrictions = buildRestrictionsFromPainAreas(painAreas);
      const result = generateWorkout(
        {
          ...DEFAULT_REQUEST,
          workMinutes,
          focusTargets: focuses.map((region) => ({ region, emphasis })),
          excludedRegions,
          excludedMovementTags,
          regionRestrictions: mappedRestrictions.regionRestrictions,
          excludedMovementPatterns,
          availableEquipment: selectedEquipment,
          randomSeed: `${Date.now()}`,
        },
        {
          exercises: exercises,
          recentRegionExposures,
          previousExerciseIds,
          exercisePreferences,
        },
      );

      if (!result.ok) {
        setPreviewWorkout(null);
        setError(result.messages.join(' '));
        return;
      }

      setPreviewWorkout(result.workout);
      router.push('/workout-preview' as Href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The workout could not be generated.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite() {
    if (!workout) return;
    if (favorite) {
      await deleteFavoriteWorkout(workout.id);
      setFavorite(false);
    } else {
      await saveFavoriteWorkout(workout);
      setFavorite(true);
    }
  }

  async function loadSwapCandidates(reason: ExerciseSwapReason): Promise<ExerciseSwapCandidate[]> {
    if (!workout || !swapTarget) return [];
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

  async function handleSwap(reason: ExerciseSwapReason, candidateId: string) {
    if (!workout || !swapTarget) return;
    setSwapBusy(true);
    setError(null);
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
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPreviewWorkout(result.workout);
      if (reason === 'dislike') {
        await saveExercisePreference({ exerciseId: swapTarget.exercise.id, preference: 'disliked', familiarity: 'familiar' });
      } else if (reason === 'unfamiliar') {
        await saveExercisePreference({ exerciseId: swapTarget.exercise.id, preference: 'neutral', familiarity: 'unreviewed' });
      }
      setSwapTarget(null);
    } finally {
      setSwapBusy(false);
    }
  }

  function startWorkout() {
    if (!workout) return;
    beginWorkout(workout);
    router.push('/active-workout' as Href);
  }

  const equipmentToShow = showAllEquipment ? allEquipment : QUICK_EQUIPMENT;

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Home</Text>
        </Pressable>
        <Text style={styles.topTitle}>Quick workout</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>ONE-OFF WORKOUT</Text>
          <Text style={styles.title}>Build a strength-cardio circuit</Text>
        </View>
        <Text style={styles.subtitle}>
          {exercises.length} available exercises{customCount ? ` (${customCount} custom)` : ''}. Set the constraints, then generate a new AMRAP.
        </Text>

        <Section title="Work time">
          <View style={styles.chipRow}>
            {WORK_TIMES.map((minutes) => (
              <Chip
                key={minutes}
                label={`${minutes} min`}
                selected={workMinutes === minutes}
                onPress={() => setWorkMinutes(minutes)}
              />
            ))}
          </View>
        </Section>

        <Section title="Emphasis">
          <Text style={styles.helper}>Select one or several. Balanced clears all emphasis targets.</Text>
          <View style={styles.chipRow}>
            <Chip label="Balanced" selected={focuses.length === 0} onPress={() => setFocuses([])} />
            {FOCUS_OPTIONS.map((option) => (
              <Chip
                key={option.region}
                label={option.label}
                selected={focuses.includes(option.region)}
                onPress={() => toggleFocus(option.region)}
              />
            ))}
          </View>
        </Section>

        <Section title="Training location">
          <Text style={styles.helper}>Choose a saved setup. Use Custom for a one-time change without editing the saved location.</Text>
          <View style={styles.chipRow}>
            {equipmentProfiles.map((profile) => (
              <Chip key={profile.id} label={profile.name} selected={selectedProfileId === profile.id} onPress={() => { setSelectedProfileId(profile.id); setSelectedEquipment(profile.equipment.filter((id) => id !== 'bodyweight')); }} />
            ))}
            <Chip label="Bodyweight only" selected={selectedEquipment.length === 0} onPress={() => { setSelectedProfileId(null); setSelectedEquipment([]); }} />
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push('/equipment-profiles' as Href)}><Text style={styles.textButton}>Edit saved equipment locations →</Text></Pressable>
          <Text style={styles.helper}>Available now: {selectedEquipment.length ? selectedEquipment.map((id) => equipmentLabels.get(id) ?? id).join(' · ') : 'Bodyweight only'}</Text>
          <Text style={styles.helper}>Temporarily add or remove equipment below.</Text>
          <View style={styles.chipRow}>
            {equipmentToShow.map((id) => (
              <Chip
                key={id}
                label={equipmentLabels.get(id) ?? id}
                selected={selectedEquipment.includes(id)}
                onPress={() => toggleEquipment(id)}
              />
            ))}
          </View>
          <Pressable accessibilityRole="button" onPress={() => setShowAllEquipment((value) => !value)}>
            <Text style={styles.textButton}>{showAllEquipment ? 'Show fewer options' : 'Show all equipment'}</Text>
          </Pressable>
        </Section>

        <View style={styles.optionalBlock}>
          <Pressable accessibilityRole="button" onPress={() => setShowLimitations((value) => !value)} style={styles.optionalHeader}>
            <View style={styles.optionalCopy}>
              <Text style={styles.optionalTitle}>Any limitations today?</Text>
              <Text style={styles.helper}>{painAreas.length || excludedMovementPatterns.length || excludedMovementTags.length ? 'Current limitations will shape this workout.' : 'Optional — protect an area or avoid a movement.'}</Text>
            </View>
            <Text style={styles.optionalChevron}>{showLimitations ? '−' : '+'}</Text>
          </Pressable>

          {showLimitations ? (
            <View style={styles.optionalDetails}>
              <View style={styles.openSection}>
                <Text style={styles.sectionTitle}>Protect an area</Text>
                <Text style={styles.helper}>Choose only what needs protection today. Unrelated training remains available.</Text>
                <PainBodyMap selections={painAreas} onChange={setPainAreas} />
              </View>

              <View style={styles.openSection}>
                <Text style={styles.sectionTitle}>Movements that hurt</Text>
                <View style={styles.movementList}>
                  {MOVEMENT_PATTERN_OPTIONS.map((option) => (
                    <Pressable key={option.pattern} onPress={() => toggleMovementPattern(option.pattern)} style={[styles.movementRow, excludedMovementPatterns.includes(option.pattern) && styles.movementRowSelected]}>
                      <View style={[styles.movementCheck, excludedMovementPatterns.includes(option.pattern) && styles.movementCheckSelected]}>{excludedMovementPatterns.includes(option.pattern) ? <Text style={styles.movementCheckText}>✓</Text> : null}</View>
                      <View style={styles.movementCopy}><Text style={styles.movementTitle}>{option.label}</Text><Text style={styles.helper}>{option.detail}</Text></View>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.openSection}>
                <Text style={styles.sectionTitle}>Avoid movement types</Text>
                <View style={styles.chipRow}>
                  {MOVEMENT_AVOIDANCE.map((option) => (
                    <Chip key={option.label} label={option.label} selected={option.tags.every((tag) => excludedMovementTags.includes(tag))} onPress={() => toggleMovementGroup(option.tags)} />
                  ))}
                </View>
              </View>
            </View>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void createWorkout()}
          style={({ pressed }: { pressed: boolean }) => [
            styles.generateButton,
            pressed && styles.generateButtonPressed,
            busy && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.generateButtonText}>{busy ? 'Generating…' : 'Generate Workout'}</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {workout ? <Text style={styles.previewRedirect}>Opening workout preview…</Text> : null}
      </ScrollView>

      <ExerciseDemoModal
        exercise={demoExercise}
        visible={Boolean(demoExercise)}
        onClose={() => setDemoExercise(null)}
      />
      <ExerciseSwapModal
        exercise={swapTarget?.exercise ?? null}
        visible={Boolean(swapTarget)}
        busy={swapBusy}
        onClose={() => setSwapTarget(null)}
        onLoadCandidates={loadSwapCandidates}
        onChooseCandidate={(reason, candidateId) => void handleSwap(reason, candidateId)}
        onPain={() => {
          setSwapTarget(null);
          router.push('/today-check-in' as Href);
        }}
      />
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function sameEquipment(left: EquipmentId[], right: EquipmentId[]) {
  return left.length === right.length && left.every((item) => right.includes(item));
}

function formatPrescription(target: number, unit: 'total' | 'per_side' | 'seconds') {
  if (unit === 'seconds') return `${target} sec`;
  if (unit === 'per_side') return `${target} / side`;
  return `${target} reps`;
}

const colors = {
  background: '#E4EBE3',
  card: '#FFFDF8',
  ink: '#01234D',
  muted: '#6B7770',
  border: '#164C73',
  accent: '#153E2F',
  accentSoft: '#D8E9DF',
  danger: '#9B2C2C',
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { paddingVertical: 6, paddingRight: 4 },
  backText: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  topTitle: { color: colors.ink, fontSize: 22, fontWeight: '700' },
  content: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 84, gap: 26 },
  headerCopy: { gap: 6, paddingTop: 8 },
  modeRow: { flexDirection: 'row', gap: 10 },
  modeButton: {
    flex: 1,
    minHeight: 72,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modeButtonPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeEyebrow: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  modeButtonText: { color: colors.accent, fontSize: 17, fontWeight: '700', marginTop: 3 },
  modeButtonPrimaryText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginTop: 3 },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '700', lineHeight: 36 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  section: { backgroundColor: colors.card, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: '#CBD8D0', paddingHorizontal: 18, paddingVertical: 20, gap: 14 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '600' },
  optionalBlock: { backgroundColor: colors.card, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: '#CBD8D0', overflow: 'hidden' },
  optionalHeader: { minHeight: 82, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 16, gap: 14 },
  optionalCopy: { flex: 1, gap: 4 },
  optionalTitle: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  optionalChevron: { color: colors.accent, fontSize: 28, fontWeight: '400' },
  optionalDetails: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D7E0DA', paddingHorizontal: 18, paddingBottom: 20, gap: 24 },
  openSection: { paddingTop: 20, gap: 12 },
  previewRedirect: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  adaptationText: { color: '#153E2F', fontSize: 12, lineHeight: 17, marginTop: 3 },
  helper: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#B7C9BE', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.card },
  chipSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { color: colors.ink, fontSize: 14, fontWeight: '500' },
  chipTextSelected: { color: colors.accent, fontWeight: '700' },
  movementList: { gap: 8 },
  movementRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D7E0DA', paddingVertical: 13, backgroundColor: colors.card },
  movementRowSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  movementCheck: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  movementCheckSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  movementCheckText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  movementCopy: { flex: 1 },
  movementTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  textButton: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  generateButton: { backgroundColor: colors.accent, borderRadius: 18, paddingVertical: 18, alignItems: 'center' },
  generateButtonPressed: { opacity: 0.84 },
  buttonDisabled: { opacity: 0.55 },
  generateButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  resultSection: { gap: 14 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resultHeaderCopy: { flex: 1, gap: 4 },
  resultTitle: { color: colors.ink, fontSize: 24, fontWeight: '700' },
  favoriteButton: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.card },
  favoriteButtonSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  favoriteButtonText: { color: colors.accent, fontWeight: '700' },
  recoveryCard: { backgroundColor: colors.accentSoft, borderRadius: 16, padding: 14, gap: 4 },
  recoveryTitle: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  recoveryText: { color: colors.ink, fontSize: 13, lineHeight: 18 },
  stationCard: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
  stationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  stationTitle: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  stationDuration: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  stationPurpose: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  exerciseNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  exerciseNumberText: { color: colors.accent, fontWeight: '700' },
  exerciseCopy: { flex: 1, gap: 2 },
  exerciseName: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  exerciseActions: { gap: 6, alignItems: 'stretch' },
  swapButton: { borderWidth: 1, borderColor: colors.accent, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center' },
  swapButtonText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  demoButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  demoButtonText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  startButton: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.accent, borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  startButtonText: { color: colors.accent, fontSize: 17, fontWeight: '700' },
});
