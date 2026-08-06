import type {
  AvoidanceTag,
  BodyRegion,
  EquipmentId,
  Exercise,
  Laterality,
  MovementPattern,
  StationRole,
} from '@circuit/domain';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExerciseDemoModal } from '@/components/exercise-demo-modal';
import {
  archiveCustomExercise,
  listCustomExercises,
  saveCustomExercise,
} from '@/services/database';

const MOVEMENTS: Array<{ value: MovementPattern; label: string }> = [
  { value: 'squat', label: 'Squat' },
  { value: 'lunge', label: 'Lunge' },
  { value: 'hinge', label: 'Hinge' },
  { value: 'horizontal_push', label: 'Horizontal push' },
  { value: 'vertical_push', label: 'Vertical push' },
  { value: 'horizontal_pull', label: 'Horizontal pull' },
  { value: 'vertical_pull', label: 'Vertical pull' },
  { value: 'carry', label: 'Carry' },
  { value: 'rotation', label: 'Rotation' },
  { value: 'anti_rotation', label: 'Anti-rotation' },
  { value: 'trunk_flexion', label: 'Trunk flexion' },
  { value: 'anti_extension', label: 'Anti-extension' },
  { value: 'lateral_flexion', label: 'Lateral flexion' },
  { value: 'jump_hop', label: 'Jump / hop' },
  { value: 'balance', label: 'Balance' },
  { value: 'locomotion', label: 'Locomotion' },
  { value: 'mobility', label: 'Mobility' },
];

const REGIONS: Array<{ value: BodyRegion; label: string }> = [
  { value: 'quadriceps', label: 'Quadriceps' },
  { value: 'hamstrings', label: 'Hamstrings' },
  { value: 'glutes', label: 'Glutes' },
  { value: 'gastrocnemius', label: 'Calves' },
  { value: 'soleus', label: 'Soleus' },
  { value: 'feet_ankles', label: 'Feet + ankles' },
  { value: 'hip_abductors', label: 'Hip abductors' },
  { value: 'hip_adductors', label: 'Hip adductors' },
  { value: 'hip_flexors', label: 'Hip flexors' },
  { value: 'chest', label: 'Chest' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'upper_back', label: 'Upper back' },
  { value: 'lats', label: 'Lats' },
  { value: 'biceps', label: 'Biceps' },
  { value: 'triceps', label: 'Triceps' },
  { value: 'forearms_grip', label: 'Grip' },
  { value: 'core_anterior', label: 'Anterior core' },
  { value: 'core_lateral', label: 'Lateral core' },
  { value: 'core_rotation', label: 'Rotational core' },
  { value: 'lower_back', label: 'Lower back' },
];

const EQUIPMENT: Array<{ value: EquipmentId; label: string }> = [
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'barbell', label: 'Barbell' },
  { value: 'weight_plate', label: 'Weight plate' },
  { value: 'medicine_ball', label: 'Medicine ball' },
  { value: 'long_band', label: 'Long band' },
  { value: 'mini_band', label: 'Mini band' },
  { value: 'cable_machine', label: 'Cable machine' },
  { value: 'bench', label: 'Bench' },
  { value: 'box', label: 'Box' },
  { value: 'trx', label: 'TRX' },
  { value: 'pullup_bar', label: 'Pull-up bar' },
  { value: 'stability_ball', label: 'Stability ball' },
  { value: 'slider', label: 'Slider' },
  { value: 'stairs', label: 'Stairs' },
  { value: 'wall', label: 'Wall' },
];

const AVOIDANCE: Array<{ value: AvoidanceTag; label: string }> = [
  { value: 'overhead', label: 'Overhead' },
  { value: 'shoulder_weight_bearing', label: 'Shoulder weight-bearing' },
  { value: 'wrist_weight_bearing', label: 'Wrist weight-bearing' },
  { value: 'deep_knee_flexion', label: 'Deep knee flexion' },
  { value: 'single_leg_loading', label: 'Single-leg loading' },
  { value: 'jumping', label: 'Jumping' },
  { value: 'high_impact', label: 'High impact' },
  { value: 'rotation', label: 'Rotation' },
  { value: 'spinal_flexion', label: 'Spinal flexion' },
  { value: 'kneeling', label: 'Kneeling' },
  { value: 'floor_required', label: 'Floor required' },
  { value: 'unstable_surface', label: 'Unstable surface' },
  { value: 'high_balance_demand', label: 'High balance demand' },
  { value: 'complex_coordination', label: 'Complex coordination' },
];

export default function ExerciseLibraryScreen() {
  const router = useRouter();
  const [customExercises, setCustomExercises] = useState<Exercise[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [demoExercise, setDemoExercise] = useState<Exercise | null>(null);
  const [editing, setEditing] = useState<Exercise | null>(null);

  const load = useCallback(async () => {
    setCustomExercises(await listCustomExercises({ includeArchived: true }));
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  function edit(exercise: Exercise) {
    setEditing(exercise);
    setShowBuilder(true);
  }

  async function archive(exercise: Exercise) {
    Alert.alert(
      'Archive exercise?',
      `${exercise.name} will stop appearing in generated workouts. Completed and saved workouts will not change.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => void archiveCustomExercise(exercise.id).then(load),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Home</Text>
        </Pressable>
        <Text style={styles.topTitle}>My exercises</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>YOUR MOVEMENT LIBRARY</Text>
          <Text style={styles.title}>Add PT, coach, or personal movements</Text>
          <Text style={styles.subtitle}>
            Custom exercises become eligible for one-off workouts, goal plans, and smart swaps. The app proposes safe defaults, but your classification controls how the generator uses them.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (showBuilder) setEditing(null);
            setShowBuilder((value) => !value);
          }}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>{showBuilder ? 'Close Builder' : '+ Add Custom Exercise'}</Text>
        </Pressable>

        {showBuilder ? (
          <ExerciseBuilder
            initial={editing}
            onCancel={() => {
              setEditing(null);
              setShowBuilder(false);
            }}
            onSaved={async () => {
              setEditing(null);
              setShowBuilder(false);
              await load();
            }}
          />
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Custom exercises</Text>
            <Text style={styles.countBadge}>{customExercises.filter((item) => item.status === 'active').length} active</Text>
          </View>
          {customExercises.length === 0 ? (
            <Text style={styles.helper}>No custom exercises yet. Add a PT exercise and it can immediately appear in compatible workouts.</Text>
          ) : null}
          {customExercises.map((exercise) => (
            <View key={exercise.id} style={[styles.exerciseCard, exercise.status !== 'active' && styles.archivedCard]}>
              <View style={styles.exerciseCopy}>
                <View style={styles.exerciseTitleRow}>
                  <Text style={styles.exerciseTitle}>{exercise.name}</Text>
                  <Text style={[styles.statusBadge, exercise.status !== 'active' && styles.archivedBadge]}>
                    {exercise.status === 'active' ? 'ACTIVE' : 'ARCHIVED'}
                  </Text>
                </View>
                <Text style={styles.helper}>
                  {titleCase(exercise.movementPatterns[0] ?? 'mobility')} · {titleCase(exercise.bodyRegions[0]?.region ?? 'other')} · {exercise.equipmentOptions[0]?.label ?? 'Bodyweight'}
                </Text>
                <Text style={styles.exerciseDescription}>{exercise.shortDescription}</Text>
              </View>
              <View style={styles.actionRow}>
                <Pressable onPress={() => setDemoExercise(exercise)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Preview</Text>
                </Pressable>
                <Pressable onPress={() => edit(exercise)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Edit</Text>
                </Pressable>
                {exercise.status === 'active' ? (
                  <Pressable onPress={() => void archive(exercise)} style={styles.textButton}>
                    <Text style={styles.archiveText}>Archive</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <ExerciseDemoModal exercise={demoExercise} visible={Boolean(demoExercise)} onClose={() => setDemoExercise(null)} />
    </SafeAreaView>
  );
}

function ExerciseBuilder({
  initial,
  onSaved,
  onCancel,
}: {
  initial: Exercise | null;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.shortDescription ?? '');
  const [setup, setSetup] = useState(initial?.instructions.setup.join('\n') ?? 'Set up in a stable position.');
  const [execution, setExecution] = useState(initial?.instructions.execution.join('\n') ?? 'Move through a controlled range of motion.');
  const [cues, setCues] = useState(initial?.instructions.cues.join('\n') ?? 'Move with control.');
  const [mistakes, setMistakes] = useState(initial?.instructions.commonMistakes.join('\n') ?? 'Avoid rushing the movement.');
  const [videoUrl, setVideoUrl] = useState(initial?.media.find((item) => item.kind === 'video')?.uri ?? '');
  const [movement, setMovement] = useState<MovementPattern>(initial?.movementPatterns[0] ?? 'squat');
  const [primaryRegion, setPrimaryRegion] = useState<BodyRegion>(initial?.bodyRegions[0]?.region ?? 'glutes');
  const [secondaryRegions, setSecondaryRegions] = useState<BodyRegion[]>(initial?.bodyRegions.slice(1).map((item) => item.region) ?? []);
  const [equipment, setEquipment] = useState<EquipmentId>(initial?.equipmentOptions[0]?.items[0]?.equipmentId ?? 'bodyweight');
  const [laterality, setLaterality] = useState<Laterality>(initial?.laterality ?? 'bilateral');
  const [prescriptionMode, setPrescriptionMode] = useState<'reps' | 'time'>(initial?.prescriptions[0]?.mode ?? 'reps');
  const [target, setTarget] = useState(String(initial?.prescriptions[0]?.target ?? 10));
  const [avoidanceTags, setAvoidanceTags] = useState<AvoidanceTag[]>(initial?.avoidanceTags ?? []);
  const [beginnerFriendly, setBeginnerFriendly] = useState(initial?.suitableForBeginners ?? true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => {
    if (!name.trim()) return null;
    return buildCustomExercise({
      existing: initial,
      name,
      description,
      setup,
      execution,
      cues,
      mistakes,
      videoUrl,
      movement,
      primaryRegion,
      secondaryRegions,
      equipment,
      laterality,
      prescriptionMode,
      target: Number(target),
      avoidanceTags,
      beginnerFriendly,
    });
  }, [avoidanceTags, beginnerFriendly, cues, description, equipment, execution, initial, laterality, mistakes, movement, name, prescriptionMode, primaryRegion, secondaryRegions, setup, target, videoUrl]);

  async function save() {
    setMessage(null);
    if (!preview) {
      setMessage('Add an exercise name first.');
      return;
    }
    if (!Number.isFinite(Number(target)) || Number(target) <= 0) {
      setMessage('Enter a valid rep or time target.');
      return;
    }
    setBusy(true);
    try {
      await saveCustomExercise(preview);
      await onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.builder}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{initial ? 'Edit exercise' : 'Build a custom exercise'}</Text>
        <Text style={styles.unreviewedBadge}>USER-ADDED</Text>
      </View>

      <Field label="Exercise name">
        <TextInput value={name} onChangeText={setName} placeholder="e.g., Banded lateral step-down" placeholderTextColor="#7B867F" style={styles.input} />
      </Field>
      <Field label="Short description">
        <TextInput value={description} onChangeText={setDescription} multiline placeholder="What is this exercise for?" placeholderTextColor="#7B867F" style={[styles.input, styles.multiline]} />
      </Field>

      <ChoiceSection title="Movement pattern" options={MOVEMENTS} selected={[movement]} onToggle={(value) => setMovement(value)} />
      <ChoiceSection title="Primary region" options={REGIONS} selected={[primaryRegion]} onToggle={(value) => setPrimaryRegion(value)} />
      <ChoiceSection
        title="Secondary regions"
        options={REGIONS.filter((item) => item.value !== primaryRegion)}
        selected={secondaryRegions}
        onToggle={(value) => setSecondaryRegions((current) => toggleLimited(current, value, 3))}
      />
      <ChoiceSection title="Equipment" options={EQUIPMENT} selected={[equipment]} onToggle={(value) => setEquipment(value)} />

      <Text style={styles.fieldLabel}>Laterality</Text>
      <View style={styles.chipWrap}>
        {(['bilateral', 'unilateral', 'alternating', 'either'] as Laterality[]).map((value) => (
          <Chip key={value} label={titleCase(value)} selected={laterality === value} onPress={() => setLaterality(value)} />
        ))}
      </View>

      <Text style={styles.fieldLabel}>Default prescription</Text>
      <View style={styles.inlineFields}>
        <View style={styles.flexOne}>
          <View style={styles.chipWrap}>
            <Chip label="Reps" selected={prescriptionMode === 'reps'} onPress={() => setPrescriptionMode('reps')} />
            <Chip label="Time" selected={prescriptionMode === 'time'} onPress={() => setPrescriptionMode('time')} />
          </View>
        </View>
        <TextInput value={target} onChangeText={setTarget} keyboardType="number-pad" style={[styles.input, styles.targetInput]} />
      </View>

      <ChoiceSection title="Movement flags" options={AVOIDANCE} selected={avoidanceTags} onToggle={(value) => setAvoidanceTags((current) => toggle(current, value))} />

      <Text style={styles.fieldLabel}>Instructions</Text>
      <InstructionInput label="Set up — one instruction per line" value={setup} onChangeText={setSetup} />
      <InstructionInput label="Movement — one instruction per line" value={execution} onChangeText={setExecution} />
      <InstructionInput label="Useful cues — one per line" value={cues} onChangeText={setCues} />
      <InstructionInput label="Common mistakes — one per line" value={mistakes} onChangeText={setMistakes} />

      <Field label="Optional direct demo-video URL">
        <TextInput
          value={videoUrl}
          onChangeText={setVideoUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://…/exercise-demo.mp4"
          placeholderTextColor="#7B867F"
          style={styles.input}
        />
        <Text style={styles.helper}>Use a direct MP4 or streaming-media URL, not a YouTube webpage. User-supplied videos remain labeled unverified.</Text>
      </Field>

      <Pressable onPress={() => setBeginnerFriendly((value) => !value)} style={styles.toggleRow}>
        <View style={[styles.checkbox, beginnerFriendly && styles.checkboxSelected]}>
          {beginnerFriendly ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <View style={styles.flexOne}>
          <Text style={styles.toggleTitle}>Beginner-friendly</Text>
          <Text style={styles.helper}>Eligible when a beginner plan is requested.</Text>
        </View>
      </Pressable>

      {message ? <Text style={styles.error}>{message}</Text> : null}
      <View style={styles.actionRow}>
        <Pressable disabled={busy} onPress={() => void save()} style={[styles.primaryButton, styles.flexOne, busy && styles.disabled]}>
          <Text style={styles.primaryButtonText}>{busy ? 'Saving…' : initial ? 'Save Changes' : 'Add Exercise'}</Text>
        </Pressable>
        <Pressable onPress={onCancel} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function buildCustomExercise({
  existing,
  name,
  description,
  setup,
  execution,
  cues,
  mistakes,
  videoUrl,
  movement,
  primaryRegion,
  secondaryRegions,
  equipment,
  laterality,
  prescriptionMode,
  target,
  avoidanceTags,
  beginnerFriendly,
}: {
  existing: Exercise | null;
  name: string;
  description: string;
  setup: string;
  execution: string;
  cues: string;
  mistakes: string;
  videoUrl: string;
  movement: MovementPattern;
  primaryRegion: BodyRegion;
  secondaryRegions: BodyRegion[];
  equipment: EquipmentId;
  laterality: Laterality;
  prescriptionMode: 'reps' | 'time';
  target: number;
  avoidanceTags: AvoidanceTag[];
  beginnerFriendly: boolean;
}): Exercise {
  const now = new Date().toISOString();
  const id = existing?.id ?? `custom_${Date.now()}_${slugify(name).slice(0, 28)}`;
  const role = stationRoleFor(movement);
  const normalizedTarget = Math.max(1, Math.round(target || (prescriptionMode === 'time' ? 30 : 10)));
  const unit = prescriptionMode === 'time' ? 'seconds' : laterality === 'unilateral' ? 'per_side' : 'total';
  const estimatedSeconds = prescriptionMode === 'time' ? normalizedTarget : normalizedTarget * (unit === 'per_side' ? 5 : 3);
  const tags = [...new Set([
    ...avoidanceTags,
    ...(movement === 'jump_hop' ? ['jumping', 'high_impact'] as AvoidanceTag[] : []),
    ...(laterality === 'unilateral' ? ['single_leg_loading'] as AvoidanceTag[] : []),
  ])];

  return {
    id,
    slug: slugify(name),
    name: name.trim(),
    aliases: [],
    status: 'active',
    classification: equipment === 'bodyweight' ? 'bodyweight' : 'equipment',
    category: titleCase(movement),
    shortDescription: description.trim() || `A user-added ${titleCase(movement).toLowerCase()} exercise.`,
    instructions: {
      setup: lines(setup),
      execution: lines(execution),
      cues: lines(cues),
      commonMistakes: lines(mistakes),
    },
    bodyRegions: [
      { region: primaryRegion, role: 'primary', load: 3 },
      ...secondaryRegions.filter((item) => item !== primaryRegion).map((region) => ({ region, role: 'secondary' as const, load: 2 as const })),
    ],
    jointLoads: [],
    movementPatterns: [movement],
    avoidanceTags: tags,
    laterality,
    stationRoles: [role],
    equipmentOptions: [{
      id: `${id}_${equipment}`,
      label: EQUIPMENT.find((item) => item.value === equipment)?.label ?? titleCase(equipment),
      items: [{ equipmentId: equipment, quantity: equipment === 'dumbbell' ? 2 : 1 }],
    }],
    prescriptions: [{
      id: `${id}_default`,
      style: 'amrap',
      mode: prescriptionMode,
      target: normalizedTarget,
      minimum: Math.max(1, Math.round(normalizedTarget * 0.7)),
      maximum: Math.max(normalizedTarget, Math.round(normalizedTarget * 1.3)),
      unit,
      estimatedSeconds,
      loadGuidance: equipment === 'bodyweight' ? undefined : 'Choose a load that preserves controlled technique.',
    }],
    impactLevel: movement === 'jump_hop' ? 3 : 0,
    balanceDemand: laterality === 'unilateral' || movement === 'balance' ? 3 : 1,
    cardiovascularDemand: movement === 'locomotion' || movement === 'jump_hop' ? 3 : 1,
    technicalComplexity: beginnerFriendly ? 1 : 3,
    suitableForAmrap: true,
    suitableForTravel: equipment === 'bodyweight' || equipment === 'long_band' || equipment === 'mini_band',
    suitableForBeginners: beginnerFriendly,
    substitutionGroupIds: [`custom_${movement}_${primaryRegion}`],
    compatibility: { maximumAppearancesPerWorkout: 1 },
    media: videoUrl.trim() ? [{
      id: `${id}_user_video`,
      kind: 'video',
      sourceType: 'user',
      uri: videoUrl.trim(),
      loop: true,
      muted: true,
      offlinePolicy: 'cache_if_viewed',
      verified: false,
    }] : [],
    defaultEnabled: true,
    contentVersion: (existing?.contentVersion ?? 0) + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function stationRoleFor(pattern: MovementPattern): StationRole {
  if (pattern === 'jump_hop') return 'power';
  if (['anti_rotation', 'trunk_flexion', 'anti_extension', 'lateral_flexion', 'rotation'].includes(pattern)) return 'core';
  if (pattern === 'balance') return 'stability';
  if (pattern === 'locomotion') return 'conditioning';
  if (pattern === 'mobility') return 'mobility';
  return 'accessory';
}

function ChoiceSection<T extends string>({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: Array<{ value: T; label: string }>;
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <View style={styles.choiceSection}>
      <Text style={styles.fieldLabel}>{title}</Text>
      <View style={styles.chipWrap}>
        {options.map((option) => (
          <Chip key={option.value} label={option.label} selected={selected.includes(option.value)} onPress={() => onToggle(option.value)} />
        ))}
      </View>
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>;
}

function InstructionInput({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.smallLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} multiline style={[styles.input, styles.instructionInput]} />
    </View>
  );
}

function lines(value: string) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}
function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'exercise';
}
function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
function toggle<T>(items: T[], value: T) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}
function toggleLimited<T>(items: T[], value: T, maximum: number) {
  if (items.includes(value)) return items.filter((item) => item !== value);
  return items.length >= maximum ? [...items.slice(1), value] : [...items, value];
}

const colors = {
  background: '#E4EBE3', card: '#FFFDF8', ink: '#01234D', muted: '#6B7770',
  border: '#164C73', accent: '#153E2F', accentSoft: '#D8E9DF', warm: '#F4E7D2', danger: '#9C3C31',
};
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  backButton: { flex: 1, paddingVertical: 6 },
  backText: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  topTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 72, gap: 16 },
  intro: { gap: 6 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 29, fontWeight: '700', lineHeight: 35 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  primaryButton: { backgroundColor: colors.accent, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondaryButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, alignItems: 'center' },
  secondaryButtonText: { color: colors.accent, fontWeight: '800' },
  textButton: { paddingHorizontal: 10, paddingVertical: 10 },
  archiveText: { color: colors.danger, fontWeight: '700' },
  builder: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 17, gap: 14 },
  section: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 17, gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: '700' },
  countBadge: { color: colors.accent, backgroundColor: colors.accentSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontSize: 11, fontWeight: '800' },
  unreviewedBadge: { color: '#7A5738', backgroundColor: colors.warm, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '800' },
  exerciseCard: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, gap: 10 },
  archivedCard: { opacity: 0.55 },
  exerciseCopy: { gap: 4 },
  exerciseTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exerciseTitle: { flex: 1, color: colors.ink, fontSize: 17, fontWeight: '700' },
  statusBadge: { color: colors.accent, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  archivedBadge: { color: colors.muted },
  exerciseDescription: { color: colors.ink, fontSize: 14, lineHeight: 20 },
  helper: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  actionRow: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  field: { gap: 6 },
  fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  smallLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: colors.border, backgroundColor: '#FAFBFA', borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11, color: colors.ink, fontSize: 15 },
  multiline: { minHeight: 82, textAlignVertical: 'top' },
  instructionInput: { minHeight: 72, textAlignVertical: 'top' },
  choiceSection: { gap: 7 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#FAFBFA' },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  chipTextSelected: { color: colors.accent },
  inlineFields: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flexOne: { flex: 1 },
  targetInput: { width: 82, textAlign: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: '#FFFFFF', fontWeight: '900' },
  toggleTitle: { color: colors.ink, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.55 },
});
