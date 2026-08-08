import type {
  AvoidanceTag,
  BodyRegion,
  EquipmentId,
  JointRegion,
  MovementPattern,
  PainAreaSelection,
} from '@circuit/domain';
import { equipmentSeed } from '@circuit/exercise-content';
import { generateWorkout } from '@circuit/generator';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardSafeScreen } from '@/components/keyboard-safe-screen';
import { PainBodyMap } from '@/components/pain-body-map';
import { ProductDisclosure } from '@/components/product-ui';
import { V23Icon } from '@/components/v23-ui';
import { MOVEMENT_PATTERN_OPTIONS, buildRestrictionsFromPainAreas } from '@/content/pain-areas';
import { DEFAULT_EQUIPMENT, DEFAULT_REQUEST } from '@/features/generate/default-request';
import {
  ensureDefaultEquipmentProfiles,
  getActiveTrainingCheckIn,
  getLatestPTProfile,
  getPreviousExerciseIds,
  getRecentRegionExposures,
  listExercisePreferences,
  type EquipmentProfile,
} from '@/services/database';
import { useExerciseCatalog } from '@/services/exercise-catalog';
import { useTheme } from '@/state/theme-context';
import { useWorkoutContext } from '@/state/workout-context';
import type { DesignTokens } from '@/theme';

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
  'dumbbell', 'kettlebell', 'medicine_ball', 'long_band', 'mini_band', 'bench', 'box', 'bosu', 'trx',
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

export default function QuickWorkoutBuilderV2() {
  const router = useRouter();
  const { exercises } = useExerciseCatalog();
  const { setPreviewWorkout } = useWorkoutContext();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [workMinutes, setWorkMinutes] = useState<number>(40);
  const [focuses, setFocuses] = useState<BodyRegion[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentId[]>(DEFAULT_EQUIPMENT);
  const [equipmentProfiles, setEquipmentProfiles] = useState<EquipmentProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [excludedRegions, setExcludedRegions] = useState<Array<BodyRegion | JointRegion>>([]);
  const [painAreas, setPainAreas] = useState<PainAreaSelection[]>([]);
  const [excludedMovementPatterns, setExcludedMovementPatterns] = useState<MovementPattern[]>([]);
  const [excludedMovementTags, setExcludedMovementTags] = useState<AvoidanceTag[]>([]);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [limitationsOpen, setLimitationsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const equipmentLabels = useMemo(() => new Map(equipmentSeed.map((item) => [item.id, item.label])), []);
  const allEquipment = useMemo(() => equipmentSeed.map((item) => item.id).filter((id) => id !== 'bodyweight'), []);
  const [showAllEquipment, setShowAllEquipment] = useState(false);

  useEffect(() => {
    let live = true;
    void ensureDefaultEquipmentProfiles().then((profiles) => {
      if (!live) return;
      setEquipmentProfiles(profiles);
      const selected = profiles.find((profile) => profile.isDefault) ?? profiles[0];
      if (selected) {
        setSelectedProfileId(selected.id);
        setSelectedEquipment(selected.equipment.filter((id) => id !== 'bodyweight'));
      }
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
      const nextPainAreas = [...mergedAreas.values()];
      const nextRegions = [
        ...(profile?.active ? profile.excludedRegions : []),
        ...(checkIn?.active && !(checkIn.regionRestrictions?.length) ? checkIn.affectedRegions : []),
      ];
      const nextPatterns = [...new Set([
        ...(profile?.active ? profile.excludedMovementPatterns ?? [] : []),
        ...(checkIn?.active ? checkIn.aggravatedMovementPatterns ?? [] : []),
      ])];
      const nextTags = [...new Set([
        ...(profile?.active ? profile.excludedMovementTags : []),
        ...(checkIn?.active ? checkIn.aggravatedMovementTags : []),
      ])];
      setPainAreas(nextPainAreas);
      setExcludedRegions(nextRegions);
      setExcludedMovementPatterns(nextPatterns);
      setExcludedMovementTags(nextTags);
      if (nextPainAreas.length || nextRegions.length || nextPatterns.length || nextTags.length) setLimitationsOpen(true);
    });
    return () => { live = false; };
  }, []);

  const selectedProfile = equipmentProfiles.find((profile) => profile.id === selectedProfileId);
  const equipmentSummary = selectedEquipment.length
    ? selectedEquipment.slice(0, 4).map((id) => equipmentLabels.get(id) ?? id).join(' · ') + (selectedEquipment.length > 4 ? ` +${selectedEquipment.length - 4}` : '')
    : 'Bodyweight only';
  const limitationCount = painAreas.length + excludedMovementPatterns.length + (excludedMovementTags.length ? 1 : 0);
  const equipmentToShow = showAllEquipment ? allEquipment : QUICK_EQUIPMENT;

  function toggleFocus(region: BodyRegion) {
    setFocuses((current) => current.includes(region) ? current.filter((item) => item !== region) : [...current, region]);
  }

  function toggleEquipment(id: EquipmentId) {
    setSelectedProfileId(null);
    setSelectedEquipment((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleMovementPattern(pattern: MovementPattern) {
    setExcludedMovementPatterns((current) => current.includes(pattern) ? current.filter((item) => item !== pattern) : [...current, pattern]);
  }

  function toggleMovementGroup(tags: AvoidanceTag[]) {
    const enabled = tags.every((tag) => excludedMovementTags.includes(tag));
    setExcludedMovementTags((current) => {
      const next = new Set(current);
      tags.forEach((tag) => enabled ? next.delete(tag) : next.add(tag));
      return [...next];
    });
  }

  async function createWorkout() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const [recentRegionExposures, previousExerciseIds, exercisePreferences] = await Promise.all([
        getRecentRegionExposures(),
        getPreviousExerciseIds(),
        listExercisePreferences(),
      ]);
      const mappedRestrictions = buildRestrictionsFromPainAreas(painAreas);
      const result = generateWorkout({
        ...DEFAULT_REQUEST,
        workMinutes,
        focusTargets: focuses.map((region) => ({ region, emphasis: focuses.length > 1 ? 'moderate' : 'strong' })),
        excludedRegions,
        excludedMovementTags,
        regionRestrictions: mappedRestrictions.regionRestrictions,
        excludedMovementPatterns,
        availableEquipment: selectedEquipment,
        randomSeed: `${Date.now()}`,
      }, {
        exercises,
        recentRegionExposures,
        previousExerciseIds,
        exercisePreferences,
      });
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

  const footer = <View style={styles.footerRow}>
    <View style={styles.footerCopy}>
      <Text style={styles.footerLabel}>QUICK WORKOUT</Text>
      <Text style={styles.footerMeta}>{workMinutes} min work · {selectedProfile?.name ?? (selectedEquipment.length ? 'Custom setup' : 'Bodyweight')}</Text>
    </View>
    <Pressable accessibilityRole="button" disabled={busy || exercises.length === 0} onPress={() => void createWorkout()} style={({ pressed }) => [styles.generateButton, (busy || exercises.length === 0) && styles.disabled, pressed && styles.pressed]}>
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.generateButtonText}>Generate</Text><V23Icon name="chevron" color="#FFFFFF" size={16} /></>}
    </Pressable>
  </View>;

  return <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
    <KeyboardSafeScreen contentContainerStyle={styles.content} footer={footer}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ONE-OFF STRENGTH</Text>
        <Text style={styles.title}>Build around the day you have.</Text>
        <Text style={styles.subtitle}>Set only the constraints that matter. Side Quest handles the exercise selection and station balance.</Text>
      </View>

      <View style={styles.timeCard}>
        <Text style={styles.cardLabel}>WORK TIME</Text>
        <Text style={styles.timeValue}>{workMinutes}<Text style={styles.timeUnit}> min</Text></Text>
        <Text style={styles.timeBody}>Total elapsed time will be slightly longer after station transitions and rest.</Text>
        <View style={styles.chipRow}>{WORK_TIMES.map((minutes) => <ChoiceChip key={minutes} label={`${minutes}`} selected={workMinutes === minutes} onPress={() => setWorkMinutes(minutes)} styles={styles} />)}</View>
      </View>

      <View style={styles.locationCard}>
        <View style={styles.cardHeading}>
          <View style={styles.cardHeadingCopy}><Text style={styles.cardLabel}>TRAINING LOCATION</Text><Text style={styles.cardTitle}>{selectedProfile?.name ?? (selectedEquipment.length ? 'Custom setup' : 'Bodyweight only')}</Text><Text style={styles.cardBody}>{equipmentSummary}</Text></View>
          <V23Icon name="equipment" color={tokens.accent} size={20} />
        </View>
        <View style={styles.profileRow}>
          {equipmentProfiles.map((profile) => <ChoiceChip key={profile.id} label={profile.name} selected={selectedProfileId === profile.id} onPress={() => { setSelectedProfileId(profile.id); setSelectedEquipment(profile.equipment.filter((id) => id !== 'bodyweight')); }} styles={styles} />)}
          <ChoiceChip label="Bodyweight" selected={selectedEquipment.length === 0} onPress={() => { setSelectedProfileId(null); setSelectedEquipment([]); }} styles={styles} />
        </View>
        <ProductDisclosure title="Customize equipment for this workout" summary="Temporary changes do not edit the saved location." expanded={equipmentOpen} onPress={() => setEquipmentOpen((value) => !value)}>
          <View style={styles.chipRow}>{equipmentToShow.map((id) => <ChoiceChip key={id} label={equipmentLabels.get(id) ?? id} selected={selectedEquipment.includes(id)} onPress={() => toggleEquipment(id)} styles={styles} />)}</View>
          <Pressable accessibilityRole="button" onPress={() => setShowAllEquipment((value) => !value)} style={styles.textAction}><Text style={styles.textActionText}>{showAllEquipment ? 'Show fewer equipment options' : 'Show all equipment'}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/equipment-profiles' as Href)} style={styles.textAction}><Text style={styles.textActionText}>Edit saved training locations</Text></Pressable>
        </ProductDisclosure>
      </View>

      <ProductDisclosure
        title="Optional emphasis"
        summary={focuses.length ? focuses.map((region) => FOCUS_OPTIONS.find((option) => option.region === region)?.label ?? region).join(' · ') : 'Balanced full-body session'}
        expanded={focusOpen}
        onPress={() => setFocusOpen((value) => !value)}
      >
        <Text style={styles.helper}>Balanced is the default. Choose one or more regions only when you deliberately want extra emphasis.</Text>
        <View style={styles.chipRow}>
          <ChoiceChip label="Balanced" selected={focuses.length === 0} onPress={() => setFocuses([])} styles={styles} />
          {FOCUS_OPTIONS.map((option) => <ChoiceChip key={option.region} label={option.label} selected={focuses.includes(option.region)} onPress={() => toggleFocus(option.region)} styles={styles} />)}
        </View>
      </ProductDisclosure>

      <ProductDisclosure
        title="Limitations today"
        summary={limitationCount ? `${limitationCount} active constraint${limitationCount === 1 ? '' : 's'} will shape this workout.` : 'Optional — protect an area or avoid a movement.'}
        expanded={limitationsOpen}
        onPress={() => setLimitationsOpen((value) => !value)}
      >
        <View style={styles.limitSection}>
          <Text style={styles.subheading}>Protect an area</Text>
          <Text style={styles.helper}>Choose only what needs protection today. Unrelated training remains available.</Text>
          <PainBodyMap selections={painAreas} onChange={setPainAreas} />
        </View>
        <View style={styles.limitSection}>
          <Text style={styles.subheading}>Movements that aggravate it</Text>
          <View style={styles.movementList}>{MOVEMENT_PATTERN_OPTIONS.map((option) => {
            const selected = excludedMovementPatterns.includes(option.pattern);
            return <Pressable key={option.pattern} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => toggleMovementPattern(option.pattern)} style={[styles.movementRow, selected && styles.movementRowSelected]}>
              <View style={[styles.check, selected && styles.checkSelected]}>{selected ? <V23Icon name="check" color="#FFFFFF" size={12} /> : null}</View>
              <View style={styles.movementCopy}><Text style={styles.movementTitle}>{option.label}</Text><Text style={styles.helper}>{option.detail}</Text></View>
            </Pressable>;
          })}</View>
        </View>
        <View style={styles.limitSection}>
          <Text style={styles.subheading}>Avoid movement types</Text>
          <View style={styles.chipRow}>{MOVEMENT_AVOIDANCE.map((option) => <ChoiceChip key={option.label} label={option.label} selected={option.tags.every((tag) => excludedMovementTags.includes(tag))} onPress={() => toggleMovementGroup(option.tags)} styles={styles} />)}</View>
        </View>
      </ProductDisclosure>

      {error ? <View style={styles.errorBox}><V23Icon name="info" color={tokens.danger} size={16} /><Text style={styles.errorText}>{error}</Text></View> : null}
    </KeyboardSafeScreen>
  </SafeAreaView>;
}

function ChoiceChip({ label, selected, onPress, styles }: { label: string; selected: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}>
    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
  </Pressable>;
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: tokens.canvas },
    content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 34, gap: 16 },
    header: { gap: 4, paddingHorizontal: 2 },
    eyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.95 },
    title: { color: tokens.text, fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: -0.6 },
    subtitle: { color: tokens.textMuted, fontSize: 13, lineHeight: 19 },

    timeCard: { borderRadius: 22, backgroundColor: tokens.header, padding: 17, gap: 6 },
    cardLabel: { color: tokens.accent, fontSize: 9, lineHeight: 11, fontWeight: '900', letterSpacing: 0.85 },
    timeValue: { color: '#FFFFFF', fontSize: 42, lineHeight: 46, fontWeight: '900', letterSpacing: -1 },
    timeUnit: { fontSize: 18, lineHeight: 22, fontWeight: '800' },
    timeBody: { color: '#D9E3EA', fontSize: 11.5, lineHeight: 16 },
    locationCard: { borderRadius: 20, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 14, gap: 11 },
    cardHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    cardHeadingCopy: { flex: 1, minWidth: 0, gap: 2 },
    cardTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
    cardBody: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
    profileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    chip: { minHeight: 36, borderRadius: 18, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
    chipSelected: { borderColor: tokens.accent, backgroundColor: tokens.accentSoft },
    chipText: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 15, fontWeight: '800' },
    chipTextSelected: { color: tokens.accent, fontWeight: '900' },
    helper: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
    textAction: { minHeight: 34, justifyContent: 'center' },
    textActionText: { color: tokens.accent, fontSize: 11.5, lineHeight: 15, fontWeight: '800' },

    limitSection: { gap: 8 },
    subheading: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
    movementList: { gap: 7 },
    movementRow: { minHeight: 60, borderRadius: 13, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
    movementRowSelected: { borderColor: tokens.accent, backgroundColor: tokens.accentSoft },
    check: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' },
    checkSelected: { borderColor: tokens.accent, backgroundColor: tokens.accent },
    movementCopy: { flex: 1, minWidth: 0, gap: 1 },
    movementTitle: { color: tokens.text, fontSize: 12.5, lineHeight: 17, fontWeight: '800' },

    errorBox: { borderRadius: 14, borderWidth: 1, borderColor: tokens.danger, backgroundColor: tokens.surfaceMuted, padding: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
    errorText: { flex: 1, color: tokens.danger, fontSize: 11.5, lineHeight: 16, fontWeight: '700' },

    footerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    footerCopy: { flex: 1, minWidth: 0, gap: 1 },
    footerLabel: { color: tokens.accent, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.75 },
    footerMeta: { color: tokens.text, fontSize: 11.5, lineHeight: 15, fontWeight: '800' },
    generateButton: { minWidth: 118, minHeight: 44, borderRadius: 14, backgroundColor: tokens.accent, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    generateButtonText: { color: '#FFFFFF', fontSize: 12.5, lineHeight: 16, fontWeight: '900' },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.74 },
  });
}
