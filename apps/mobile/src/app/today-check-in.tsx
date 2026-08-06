import type {
  AvoidanceTag,
  BodyRegion,
  MovementPattern,
  PainAreaSelection,
  PlanRestrictionOverride,
  PTProfile,
  RegionRestriction,
  TrainingCheckIn,
  TrainingCheckInStatus,
} from '@circuit/domain';
import { adaptTrainingBlock } from '@circuit/planner';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppScreen } from '@/components/v12-ui';
import { PainBodyMap } from '@/components/pain-body-map';
import {
  MOVEMENT_PATTERN_OPTIONS,
  PAIN_AREAS,
  buildRestrictionsFromPainAreas,
  createPainAreaSelection,
  painAreaById,
} from '@/content/pain-areas';
import { useExerciseCatalog } from '@/services/exercise-catalog';
import {
  clearActiveTrainingCheckIn,
  getActiveTrainingCheckIn,
  getLatestPTProfile,
  getLatestTrainingBlock,
  getPreviousExerciseIds,
  getRecentRegionExposures,
  getTrainingBlockById,
  saveTrainingBlock,
  saveTrainingCheckIn,
} from '@/services/database';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

const STATUS_OPTIONS: Array<{ id: TrainingCheckInStatus; label: string; description: string }> = [
  { id: 'normal', label: 'Feeling normal', description: 'Clear the temporary adjustment.' },
  { id: 'muscle_soreness', label: 'Muscle soreness', description: 'Keep unrelated training available while reducing repeated loading.' },
  { id: 'tightness_pain', label: 'Tightness or pain', description: 'Protect the selected area and any movement that currently aggravates it.' },
  { id: 'unable_to_train', label: 'Pause strength', description: 'Remove strength sessions during the selected window.' },
];

const OTHER_MOVEMENT_LIMITS: Array<{ label: string; tags: AvoidanceTag[] }> = [
  { label: 'Weight through hands', tags: ['shoulder_weight_bearing', 'wrist_weight_bearing'] },
  { label: 'Hanging', tags: ['hanging'] },
  { label: 'Deep knee bending', tags: ['deep_knee_flexion'] },
  { label: 'Kneeling', tags: ['kneeling'] },
  { label: 'Floor work', tags: ['floor_required'] },
  { label: 'Unstable surfaces', tags: ['unstable_surface', 'high_balance_demand'] },
  { label: 'Complex coordination', tags: ['complex_coordination'] },
];

export default function TodayCheckInScreen() {
  const { exercises } = useExerciseCatalog();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const router = useRouter();
  const [status, setStatus] = useState<TrainingCheckInStatus>('normal');
  const [severity, setSeverity] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [painAreas, setPainAreas] = useState<PainAreaSelection[]>([]);
  const [movementPatterns, setMovementPatterns] = useState<MovementPattern[]>([]);
  const [movementTags, setMovementTags] = useState<AvoidanceTag[]>([]);
  const [durationDays, setDurationDays] = useState<1 | 2 | 3 | 7>(2);
  const [notes, setNotes] = useState('');
  const [activeCheckIn, setActiveCheckIn] = useState<TrainingCheckIn | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    void getActiveTrainingCheckIn().then((checkIn) => {
      if (cancelled || !checkIn) return;
      setActiveCheckIn(checkIn);
      setStatus(checkIn.status);
      setSeverity(checkIn.severity);
      setPainAreas(checkIn.painAreas?.length ? checkIn.painAreas : legacySelections(checkIn));
      setMovementPatterns(checkIn.aggravatedMovementPatterns ?? []);
      setMovementTags(checkIn.aggravatedMovementTags ?? []);
      setNotes(checkIn.notes ?? '');
      const remaining = Math.max(1, Math.ceil((new Date(checkIn.activeUntil).getTime() - Date.now()) / 86_400_000));
      setDurationDays(remaining >= 7 ? 7 : remaining >= 3 ? 3 : remaining >= 2 ? 2 : 1);
    });
    return () => { cancelled = true; };
  }, []));

  const selectedAreaDefinitions = useMemo(() => painAreas.flatMap((selection) => {
    const area = painAreaById(selection.areaId);
    return area ? [area] : [];
  }), [painAreas]);
  const suggestedPatterns = useMemo(() => unique(selectedAreaDefinitions.flatMap((area) => area.suggestedPatterns)), [selectedAreaDefinitions]);

  function togglePattern(pattern: MovementPattern) {
    setMovementPatterns((current) => current.includes(pattern) ? current.filter((item) => item !== pattern) : [...current, pattern]);
  }

  function toggleTags(tags: AvoidanceTag[]) {
    const selected = tags.every((tag) => movementTags.includes(tag));
    setMovementTags((current) => selected ? current.filter((tag) => !tags.includes(tag)) : unique([...current, ...tags]));
  }

  function interpretDescription() {
    const value = notes.toLowerCase();
    if (!value.trim()) { setMessage('Describe the area or movement first.'); return; }
    const areaMatches = PAIN_AREAS.map((area) => {
      const phrases = [area.shortLabel, area.plainLanguage, ...area.searchTerms]
        .map((phrase) => phrase.toLowerCase())
        .filter((phrase) => phrase.length > 3);
      const score = phrases.reduce((total, phrase) => total + (value.includes(phrase) ? Math.max(1, phrase.split(/\s+/).length) : 0), 0);
      const sideScore = area.side === 'left' && value.includes('left') ? 1 : area.side === 'right' && value.includes('right') ? 1 : 0;
      return { area, score: score + sideScore };
    }).filter((item) => item.score > (item.area.side === 'left' || item.area.side === 'right' ? 1 : 0)).sort((left, right) => right.score - left.score).map((item) => item.area);
    const nextAreas = [...painAreas];
    for (const area of areaMatches.slice(0, 3)) if (!nextAreas.some((item) => item.areaId === area.id)) nextAreas.push(createPainAreaSelection(area));
    const inferredPatterns = MOVEMENT_PATTERN_OPTIONS.filter((option) => {
      const words = `${option.label} ${option.detail}`.toLowerCase();
      return words.split(/\s+/).some((word) => word.length > 4 && value.includes(word));
    }).map((option) => option.pattern);
    if (/row|retraction|squeeze.*shoulder|shoulder.*squeeze/.test(value)) inferredPatterns.push('horizontal_pull');
    if (/overhead|press.*head/.test(value)) inferredPatterns.push('vertical_push');
    if (/jump|hop|impact|running hurts/.test(value)) inferredPatterns.push('jump_hop');
    if (/twist|rotation|rotating/.test(value)) inferredPatterns.push('rotation');
    setPainAreas(nextAreas);
    setMovementPatterns((current) => unique([...current, ...inferredPatterns]));
    setMessage(areaMatches.length || inferredPatterns.length ? 'Suggested areas and movements were selected. Review them before saving.' : 'No confident match was found. Use the body map or search field below.');
  }

  async function clearAdjustment() {
    const [latest, savedPTProfile, recentRegionExposures, previousExerciseIds] = await Promise.all([
      getLatestTrainingBlock(), getLatestPTProfile(), getRecentRegionExposures(), getPreviousExerciseIds(),
    ]);
    await clearActiveTrainingCheckIn();
    let restored = latest?.block ?? null;
    const checkInId = activeCheckIn?.id;
    while (restored?.parentBlockId && checkInId && restored.adaptations?.some((adaptation) => adaptation.id === checkInId)) {
      const parent = await getTrainingBlockById(restored.parentBlockId);
      if (!parent) break;
      restored = parent;
    }
    if (restored) {
      let blockToSave = { ...restored, id: `${restored.id}_restored_${Date.now()}`, createdAt: new Date().toISOString() };
      if (savedPTProfile?.active) {
        const reapplied = adaptTrainingBlock(blockToSave, ptOverride(savedPTProfile, `pt_restore_${Date.now()}`), {
          exercises, recentRegionExposures, previousExerciseIds, now: new Date().toISOString(),
        });
        if (reapplied.ok) blockToSave = reapplied.block;
      }
      await saveTrainingBlock(blockToSave);
    }
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      if (status === 'normal') {
        await clearAdjustment();
        router.back();
        return;
      }
      if (status !== 'unable_to_train' && painAreas.length === 0 && movementPatterns.length === 0 && movementTags.length === 0) {
        setMessage('Select an affected area or a movement that should be limited.');
        return;
      }

      const now = new Date();
      const activeUntil = new Date(now);
      activeUntil.setDate(activeUntil.getDate() + durationDays);
      activeUntil.setHours(23, 59, 59, 999);
      const mapped = buildRestrictionsFromPainAreas(painAreas);
      const checkIn: TrainingCheckIn = {
        id: `checkin_${Date.now()}`,
        status,
        severity,
        affectedRegions: mapped.affectedRegions,
        aggravatedMovementTags: movementTags,
        painAreas,
        regionRestrictions: mapped.regionRestrictions,
        aggravatedMovementPatterns: movementPatterns,
        notes: notes.trim() || undefined,
        active: true,
        createdAt: now.toISOString(),
        activeUntil: activeUntil.toISOString(),
      };
      await saveTrainingCheckIn(checkIn);

      const [savedBlock, ptProfile, recentRegionExposures, previousExerciseIds] = await Promise.all([
        getLatestTrainingBlock(), getLatestPTProfile(), getRecentRegionExposures(), getPreviousExerciseIds(),
      ]);
      if (savedBlock) {
        const result = adaptTrainingBlock(savedBlock.block, buildOverride(checkIn, mapped.penaltyRegions, ptProfile), {
          exercises, recentRegionExposures, previousExerciseIds, now: now.toISOString(),
        });
        if (!result.ok) {
          setMessage(`The check-in was saved, but the plan could not be adjusted: ${result.messages.join(' ')}`);
          return;
        }
        await saveTrainingBlock(result.block);
      }
      router.back();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'The check-in could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return <AppScreen eyebrow="TEMPORARY ADJUSTMENT" title="What should we protect today?" subtitle="Point to the area and tell Side Quest what actually aggravates it. Unrelated movements stay available whenever the exercise library supports a safe workaround.">
    {activeCheckIn ? <View style={styles.activeBanner}><Text style={styles.activeTitle}>An adjustment is active</Text><Text style={styles.body}>Saving replaces it. Feeling normal clears it and restores the previous plan when available.</Text></View> : null}

    <View style={styles.card}>
      <Text style={styles.sectionTitle}>How are you feeling?</Text>
      <View style={styles.optionList}>{STATUS_OPTIONS.map((option) => {
        const selected = status === option.id;
        return <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setStatus(option.id)} style={[styles.statusOption, selected && styles.statusOptionSelected]}>
          <View style={[styles.radio, selected && styles.radioSelected]} /><View style={styles.optionCopy}><Text style={styles.optionTitle}>{option.label}</Text><Text style={styles.body}>{option.description}</Text></View>
        </Pressable>;
      })}</View>
    </View>

    {status !== 'normal' && status !== 'unable_to_train' ? <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Optional description</Text>
        <TextInput value={notes} onChangeText={setNotes} multiline placeholder="Example: pain between my left shoulder blade and spine when I squeeze my shoulders back" placeholderTextColor={tokens.textMuted} style={styles.notesInput} />
        <Pressable accessibilityRole="button" onPress={interpretDescription} style={styles.outlineButton}><Text style={styles.outlineText}>Suggest areas and movements</Text></Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Where do you feel it?</Text>
        <PainBodyMap selections={painAreas} onChange={setPainAreas} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Which movements aggravate it?</Text>
        <Text style={styles.body}>Select only what currently causes symptoms. An area alone no longer removes every exercise that touches the broader body region.</Text>
        {suggestedPatterns.length ? <View style={styles.suggestionBox}><Text style={styles.suggestionLabel}>COMMON FOR YOUR SELECTED AREA</Text><View style={styles.chipRow}>{suggestedPatterns.map((pattern) => <PatternChip key={pattern} pattern={pattern} selected={movementPatterns.includes(pattern)} onPress={() => togglePattern(pattern)} styles={styles} />)}</View></View> : null}
        <View style={styles.patternList}>{MOVEMENT_PATTERN_OPTIONS.map((option) => {
          const selected = movementPatterns.includes(option.pattern);
          return <Pressable key={option.pattern} onPress={() => togglePattern(option.pattern)} style={[styles.patternRow, selected && styles.patternRowSelected]}>
            <View style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected ? <Text style={styles.checkmark}>✓</Text> : null}</View>
            <View style={styles.optionCopy}><Text style={styles.patternTitle}>{option.label}</Text><Text style={styles.body}>{option.detail}</Text></View>
          </Pressable>;
        })}</View>
        <Text style={styles.subsectionTitle}>Other limits</Text>
        <View style={styles.chipRow}>{OTHER_MOVEMENT_LIMITS.map((option) => <Chip key={option.label} label={option.label} selected={option.tags.every((tag) => movementTags.includes(tag))} onPress={() => toggleTags(option.tags)} styles={styles} />)}</View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>How noticeable is it?</Text>
        <View style={styles.scaleRow}>{([1, 2, 3, 4, 5] as const).map((value) => <Pressable key={value} onPress={() => setSeverity(value)} style={[styles.scaleButton, severity === value && styles.scaleButtonSelected]}><Text style={[styles.scaleText, severity === value && styles.scaleTextSelected]}>{value}</Text></Pressable>)}</View>
        <View style={styles.scaleAnchors}><Text style={styles.anchor}>Minor</Text><Text style={styles.anchor}>Normal training is not appropriate</Text></View>
      </View>
    </> : null}

    {status !== 'normal' ? <View style={styles.card}><Text style={styles.sectionTitle}>How long should this stay active?</Text><View style={styles.chipRow}>{([1, 2, 3, 7] as const).map((days) => <Chip key={days} label={`${days} day${days === 1 ? '' : 's'}`} selected={durationDays === days} onPress={() => setDurationDays(days)} styles={styles} />)}</View></View> : null}

    {message ? <Text style={styles.message}>{message}</Text> : null}
    <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.primaryButton, saving && styles.disabled]}><Text style={styles.primaryText}>{saving ? 'Updating…' : status === 'normal' ? 'Clear temporary adjustment' : 'Protect these areas and update plan'}</Text></Pressable>
  </AppScreen>;
}

function PatternChip({ pattern, selected, onPress, styles }: { pattern: MovementPattern; selected: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  const option = MOVEMENT_PATTERN_OPTIONS.find((item) => item.pattern === pattern);
  return <Chip label={option?.label ?? pattern} selected={selected} onPress={onPress} styles={styles} />;
}

function Chip({ label, selected, onPress, styles }: { label: string; selected: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>;
}

function legacySelections(checkIn: TrainingCheckIn): PainAreaSelection[] {
  const ids = new Set<string>();
  for (const region of checkIn.affectedRegions) {
    const match = PAIN_AREAS.find((area) => area.regions.includes(region));
    if (match) ids.add(match.id);
  }
  return [...ids].map((id) => createPainAreaSelection(painAreaById(id)!));
}

function buildOverride(checkIn: TrainingCheckIn, penaltyRegions: BodyRegion[], ptProfile: PTProfile | null): PlanRestrictionOverride {
  const legacyHardRegions = checkIn.regionRestrictions?.length ? [] : checkIn.affectedRegions;
  return {
    id: checkIn.id,
    source: 'temporary_check_in',
    label: checkIn.status === 'muscle_soreness' ? 'Temporary soreness adjustment' : checkIn.status === 'tightness_pain' ? 'Temporary pain or tightness adjustment' : 'Temporary training pause',
    activeFrom: checkIn.createdAt,
    activeUntil: checkIn.activeUntil,
    excludedRegions: unique([...legacyHardRegions, ...(ptProfile?.active ? ptProfile.excludedRegions : [])]),
    excludedMovementTags: unique([...checkIn.aggravatedMovementTags, ...(ptProfile?.active ? ptProfile.excludedMovementTags : [])]),
    regionRestrictions: mergeRegionRestrictions([...(checkIn.regionRestrictions ?? []), ...(ptProfile?.active ? ptProfile.regionRestrictions ?? [] : [])]),
    excludedMovementPatterns: unique([...(checkIn.aggravatedMovementPatterns ?? []), ...(ptProfile?.active ? ptProfile.excludedMovementPatterns ?? [] : [])]),
    penalizedRegions: penaltyRegions,
    pauseStrengthTraining: checkIn.status === 'unable_to_train',
  };
}

function ptOverride(profile: PTProfile, id: string): PlanRestrictionOverride {
  return {
    id, source: 'pt_profile', label: `${profile.name} retained after clearing temporary adjustment`, activeFrom: new Date().toISOString(),
    excludedRegions: profile.excludedRegions, excludedMovementTags: profile.excludedMovementTags,
    regionRestrictions: profile.regionRestrictions ?? [], excludedMovementPatterns: profile.excludedMovementPatterns ?? [], penalizedRegions: [],
  };
}

function mergeRegionRestrictions(values: RegionRestriction[]): RegionRestriction[] {
  const rank = { direct_only: 1, keep_light: 2, avoid: 3 } as const;
  const map = new Map<string, RegionRestriction>();
  for (const value of values) { const current = map.get(value.region); if (!current || rank[value.mode] > rank[current.mode]) map.set(value.region, value); }
  return [...map.values()];
}
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }

function makeStyles(tokens: DesignTokens) { return StyleSheet.create({
  activeBanner: { backgroundColor: tokens.accentSoft, borderRadius: 18, borderWidth: 1, borderColor: tokens.border, padding: 15, gap: 3 }, activeTitle: { color: tokens.text, fontSize: 16, fontWeight: '800' },
  card: { backgroundColor: tokens.surface, borderRadius: 20, borderWidth: 1, borderColor: tokens.border, padding: 16, gap: 12 }, sectionTitle: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '800' }, subsectionTitle: { color: tokens.text, fontSize: 14, fontWeight: '800', marginTop: 3 }, body: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19 },
  optionList: { gap: 8 }, statusOption: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: tokens.border, borderRadius: 15, padding: 12, backgroundColor: tokens.surface }, statusOptionSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent }, radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: tokens.border }, radioSelected: { borderWidth: 6, borderColor: tokens.accent }, optionCopy: { flex: 1 }, optionTitle: { color: tokens.text, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  notesInput: { minHeight: 104, borderWidth: 1, borderColor: tokens.border, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 12, color: tokens.text, backgroundColor: tokens.canvas, fontSize: 15, lineHeight: 21, textAlignVertical: 'top' }, outlineButton: { minHeight: 46, borderWidth: 1, borderColor: tokens.accent, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, outlineText: { color: tokens.accent, fontSize: 14, fontWeight: '700' },
  suggestionBox: { backgroundColor: tokens.surfaceMuted, borderRadius: 15, padding: 12, gap: 8 }, suggestionLabel: { color: tokens.accent, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8 }, chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { borderWidth: 1, borderColor: tokens.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: tokens.surface }, chipSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent }, chipText: { color: tokens.text, fontSize: 13, fontWeight: '600' }, chipTextSelected: { color: tokens.accent, fontWeight: '800' },
  patternList: { gap: 7 }, patternRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: tokens.border, borderRadius: 14, padding: 11 }, patternRowSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent }, checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' }, checkboxSelected: { backgroundColor: tokens.accent, borderColor: tokens.accent }, checkmark: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' }, patternTitle: { color: tokens.text, fontSize: 14, fontWeight: '700' },
  scaleRow: { flexDirection: 'row', gap: 8 }, scaleButton: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' }, scaleButtonSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent }, scaleText: { color: tokens.text, fontSize: 15, fontWeight: '700' }, scaleTextSelected: { color: tokens.accent }, scaleAnchors: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, anchor: { flex: 1, color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
  primaryButton: { minHeight: 54, borderRadius: 16, backgroundColor: tokens.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }, primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'center' }, disabled: { opacity: 0.55 }, message: { color: '#A04444', fontSize: 13.5, lineHeight: 19 },
}); }
