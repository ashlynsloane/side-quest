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

import { PainBodyMap } from '@/components/pain-body-map';
import { ProductAction, ProductDisclosure } from '@/components/product-ui';
import { V23Icon, V23Screen } from '@/components/v23-ui';
import {
  MOVEMENT_PATTERN_OPTIONS,
  PAIN_AREAS,
  buildRestrictionsFromPainAreas,
  createPainAreaSelection,
  painAreaById,
} from '@/content/pain-areas';
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
import { useExerciseCatalog } from '@/services/exercise-catalog';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

const STATUS_OPTIONS: Array<{
  id: TrainingCheckInStatus;
  label: string;
  description: string;
  impact: string;
  icon: 'check' | 'adjust' | 'heart' | 'clock';
}> = [
  {
    id: 'normal',
    label: 'No limitation',
    description: 'Training feels normally available today.',
    impact: 'Clear the temporary adjustment and return to the underlying plan.',
    icon: 'check',
  },
  {
    id: 'muscle_soreness',
    label: 'Muscle soreness',
    description: 'An area feels sore or heavy, but training is still possible.',
    impact: 'Reduce repeated loading while keeping unrelated training available.',
    icon: 'adjust',
  },
  {
    id: 'tightness_pain',
    label: 'Pain or tightness',
    description: 'A specific area or movement is currently aggravating symptoms.',
    impact: 'Protect the selected area or movement before the planner chooses exercises.',
    icon: 'heart',
  },
  {
    id: 'unable_to_train',
    label: 'Pause strength',
    description: 'Strength training is not appropriate for the temporary window you choose.',
    impact: 'Remove strength sessions during the temporary window. Endurance remains governed separately.',
    icon: 'clock',
  },
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

export default function TrainingCheckInScreenV3() {
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
  const [areaOpen, setAreaOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    void getActiveTrainingCheckIn().then((checkIn) => {
      if (cancelled || !checkIn) return;
      setActiveCheckIn(checkIn);
      setStatus(checkIn.status);
      setSeverity(checkIn.severity);
      const areas = checkIn.painAreas?.length ? checkIn.painAreas : legacySelections(checkIn);
      setPainAreas(areas);
      setMovementPatterns(checkIn.aggravatedMovementPatterns ?? []);
      setMovementTags(checkIn.aggravatedMovementTags ?? []);
      setNotes(checkIn.notes ?? '');
      setAreaOpen(areas.length > 0);
      setMovementOpen(Boolean(checkIn.aggravatedMovementPatterns?.length || checkIn.aggravatedMovementTags?.length));
      setDetailOpen(true);
      const remaining = Math.max(1, Math.ceil((new Date(checkIn.activeUntil).getTime() - Date.now()) / 86_400_000));
      setDurationDays(remaining >= 7 ? 7 : remaining >= 3 ? 3 : remaining >= 2 ? 2 : 1);
    });
    return () => { cancelled = true; };
  }, []));

  const selectedAreaDefinitions = useMemo(() => painAreas.flatMap((selection) => {
    const area = painAreaById(selection.areaId);
    return area ? [area] : [];
  }), [painAreas]);
  const suggestedPatterns = useMemo(
    () => unique(selectedAreaDefinitions.flatMap((area) => area.suggestedPatterns)),
    [selectedAreaDefinitions],
  );
  const selectedStatus = STATUS_OPTIONS.find((option) => option.id === status) ?? STATUS_OPTIONS[0]!;
  const hasSpecificRestriction = painAreas.length > 0 || movementPatterns.length > 0 || movementTags.length > 0;

  function selectStatus(next: TrainingCheckInStatus) {
    setStatus(next);
    setMessage(null);
    if (next === 'normal' || next === 'unable_to_train') {
      setAreaOpen(false);
      setMovementOpen(false);
    } else if (!hasSpecificRestriction) {
      setDetailOpen(true);
    }
  }

  function togglePattern(pattern: MovementPattern) {
    setMovementPatterns((current) => current.includes(pattern)
      ? current.filter((item) => item !== pattern)
      : [...current, pattern]);
  }

  function toggleTags(tags: AvoidanceTag[]) {
    const selected = tags.every((tag) => movementTags.includes(tag));
    setMovementTags((current) => selected
      ? current.filter((tag) => !tags.includes(tag))
      : unique([...current, ...tags]));
  }

  function interpretDescription() {
    const value = notes.toLowerCase();
    if (!value.trim()) {
      setMessage('Describe the area or movement first.');
      return;
    }
    const areaMatches = PAIN_AREAS.map((area) => {
      const phrases = [area.shortLabel, area.plainLanguage, ...area.searchTerms]
        .map((phrase) => phrase.toLowerCase())
        .filter((phrase) => phrase.length > 3);
      const score = phrases.reduce((total, phrase) => total + (value.includes(phrase) ? Math.max(1, phrase.split(/\s+/).length) : 0), 0);
      const sideScore = area.side === 'left' && value.includes('left')
        ? 1
        : area.side === 'right' && value.includes('right')
          ? 1
          : 0;
      return { area, score: score + sideScore };
    })
      .filter((item) => item.score > (item.area.side === 'left' || item.area.side === 'right' ? 1 : 0))
      .sort((left, right) => right.score - left.score)
      .map((item) => item.area);

    const nextAreas = [...painAreas];
    for (const area of areaMatches.slice(0, 3)) {
      if (!nextAreas.some((item) => item.areaId === area.id)) nextAreas.push(createPainAreaSelection(area));
    }

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
    if (areaMatches.length) setAreaOpen(true);
    if (inferredPatterns.length) setMovementOpen(true);
    setMessage(areaMatches.length || inferredPatterns.length
      ? 'Suggested areas and movements are selected below. Review them before saving.'
      : 'No confident match was found. Use the body map or movement list below.');
  }

  async function clearAdjustment() {
    const [latest, savedPTProfile, recentRegionExposures, previousExerciseIds] = await Promise.all([
      getLatestTrainingBlock(),
      getLatestPTProfile(),
      getRecentRegionExposures(),
      getPreviousExerciseIds(),
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
          exercises,
          recentRegionExposures,
          previousExerciseIds,
          now: new Date().toISOString(),
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
      if (status !== 'unable_to_train' && !hasSpecificRestriction) {
        setMessage('Select an affected area or a movement that should be limited.');
        setDetailOpen(true);
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
        getLatestTrainingBlock(),
        getLatestPTProfile(),
        getRecentRegionExposures(),
        getPreviousExerciseIds(),
      ]);
      if (savedBlock) {
        const result = adaptTrainingBlock(savedBlock.block, buildOverride(checkIn, mapped.penaltyRegions, ptProfile), {
          exercises,
          recentRegionExposures,
          previousExerciseIds,
          now: now.toISOString(),
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

  return <V23Screen contentStyle={styles.page}>
    <View style={styles.header}>
      <Text style={styles.eyebrow}>TRAINING PROTECTION</Text>
      <Text style={styles.title}>What changed?</Text>
      <Text style={styles.subtitle}>Use this for soreness, pain, tightness, or a movement limitation. Side Quest will protect what you identify while keeping unrelated training available when the plan can do so safely.</Text>
    </View>

    {activeCheckIn ? <View style={styles.activeBanner}>
      <View style={styles.activeIcon}><V23Icon name="adjust" color={tokens.accent} size={17} /></View>
      <View style={styles.activeCopy}>
        <Text style={styles.activeTitle}>A temporary adjustment is already active</Text>
        <Text style={styles.body}>Saving replaces it. Choosing No limitation clears it and restores the prior plan when available.</Text>
      </View>
    </View> : null}

    <View style={styles.statusList}>
      {STATUS_OPTIONS.map((option) => {
        const selected = status === option.id;
        return <Pressable
          key={option.id}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          onPress={() => selectStatus(option.id)}
          style={({ pressed }) => [styles.statusOption, selected && styles.statusOptionSelected, pressed && styles.pressed]}
        >
          <View style={[styles.statusIcon, selected && styles.statusIconSelected]}>
            <V23Icon name={option.icon} color={selected ? '#FFFFFF' : tokens.accent} size={17} />
          </View>
          <View style={styles.optionCopy}>
            <Text style={styles.optionTitle}>{option.label}</Text>
            <Text style={styles.body}>{option.description}</Text>
          </View>
          <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
        </Pressable>;
      })}
    </View>

    {status !== 'normal' && status !== 'unable_to_train' ? <>
      <View style={styles.descriptionCard}>
        <Text style={styles.sectionEyebrow}>DESCRIBE IT NATURALLY</Text>
        <Text style={styles.sectionTitle}>What are you noticing?</Text>
        <Text style={styles.body}>You can describe the area, side, or movement. Side Quest only uses this to suggest structured selections below—you still review them before saving.</Text>
        <TextInput
          value={notes}
          onChangeText={(value) => { setNotes(value); setMessage(null); }}
          multiline
          placeholder="Example: tight behind my left shoulder blade when I pull or squeeze my shoulders back"
          placeholderTextColor={tokens.textMuted}
          style={styles.notesInput}
        />
        <ProductAction label="Suggest area + movement" variant="secondary" icon="search" onPress={interpretDescription} />
      </View>

      <ProductDisclosure
        title="Pinpoint an area"
        summary={painAreaSummary(painAreas)}
        badge={painAreas.length ? `${painAreas.length} selected` : undefined}
        expanded={areaOpen}
        onPress={() => setAreaOpen((value) => !value)}
      >
        <PainBodyMap selections={painAreas} onChange={(next) => { setPainAreas(next); setMessage(null); }} />
      </ProductDisclosure>

      <ProductDisclosure
        title="Movements that aggravate it"
        summary={movementSummary(movementPatterns, movementTags)}
        badge={movementPatterns.length || movementTags.length ? `${movementPatterns.length + movementTags.length} selected` : undefined}
        expanded={movementOpen}
        onPress={() => setMovementOpen((value) => !value)}
      >
        <Text style={styles.body}>Select only movements that currently reproduce or meaningfully aggravate the problem. An area alone does not automatically remove every exercise that uses the broader region.</Text>
        {suggestedPatterns.length ? <View style={styles.suggestionBox}>
          <Text style={styles.suggestionLabel}>COMMON FOR THE SELECTED AREA</Text>
          <View style={styles.chipRow}>{suggestedPatterns.map((pattern) => <PatternChip key={pattern} pattern={pattern} selected={movementPatterns.includes(pattern)} onPress={() => togglePattern(pattern)} styles={styles} />)}</View>
        </View> : null}
        <View style={styles.patternList}>{MOVEMENT_PATTERN_OPTIONS.map((option) => {
          const selected = movementPatterns.includes(option.pattern);
          return <Pressable
            key={option.pattern}
            onPress={() => { togglePattern(option.pattern); setMessage(null); }}
            style={[styles.patternRow, selected && styles.patternRowSelected]}
          >
            <View style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected ? <Text style={styles.checkmark}>✓</Text> : null}</View>
            <View style={styles.optionCopy}><Text style={styles.patternTitle}>{option.label}</Text><Text style={styles.body}>{option.detail}</Text></View>
          </Pressable>;
        })}</View>
        <Text style={styles.subsectionTitle}>Other practical limits</Text>
        <View style={styles.chipRow}>{OTHER_MOVEMENT_LIMITS.map((option) => <Chip key={option.label} label={option.label} selected={option.tags.every((tag) => movementTags.includes(tag))} onPress={() => toggleTags(option.tags)} styles={styles} />)}</View>
      </ProductDisclosure>

      <ProductDisclosure
        title="Severity + duration"
        summary={`${severityLabel(severity)} · ${durationDays} day${durationDays === 1 ? '' : 's'}`}
        expanded={detailOpen}
        onPress={() => setDetailOpen((value) => !value)}
      >
        <Text style={styles.fieldTitle}>How noticeable is it?</Text>
        <View style={styles.scaleRow}>{([1, 2, 3, 4, 5] as const).map((value) => <Pressable
          key={value}
          accessibilityRole="button"
          accessibilityState={{ selected: severity === value }}
          onPress={() => setSeverity(value)}
          style={[styles.scaleButton, severity === value && styles.scaleButtonSelected]}
        ><Text style={[styles.scaleText, severity === value && styles.scaleTextSelected]}>{value}</Text></Pressable>)}</View>
        <View style={styles.scaleAnchors}><Text style={styles.anchor}>Minor</Text><Text style={styles.anchorRight}>Normal training is not appropriate</Text></View>
        <Text style={styles.fieldTitle}>Keep this protection active for</Text>
        <View style={styles.chipRow}>{([1, 2, 3, 7] as const).map((days) => <Chip key={days} label={`${days} day${days === 1 ? '' : 's'}`} selected={durationDays === days} onPress={() => setDurationDays(days)} styles={styles} />)}</View>
      </ProductDisclosure>
    </> : null}

    {status === 'unable_to_train' ? <View style={styles.pauseCard}>
      <Text style={styles.sectionEyebrow}>TEMPORARY STRENGTH PAUSE</Text>
      <Text style={styles.sectionTitle}>How long should strength stay paused?</Text>
      <Text style={styles.body}>This is intentionally separate from soreness or pain-area filtering. It removes strength sessions for the selected temporary window.</Text>
      <View style={styles.chipRow}>{([1, 2, 3, 7] as const).map((days) => <Chip key={days} label={`${days} day${days === 1 ? '' : 's'}`} selected={durationDays === days} onPress={() => setDurationDays(days)} styles={styles} />)}</View>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="Optional context"
        placeholderTextColor={tokens.textMuted}
        style={styles.notesInputSmall}
      />
    </View> : null}

    <View style={styles.impactCard}>
      <View style={styles.impactTop}><V23Icon name={selectedStatus.icon} color={tokens.accent} size={18} /><Text style={styles.impactLabel}>WHAT SIDE QUEST WILL DO</Text></View>
      <Text style={styles.impactTitle}>{selectedStatus.impact}</Text>
      {status !== 'normal' && status !== 'unable_to_train' ? <Text style={styles.impactBody}>{restrictionSummary(painAreas, movementPatterns, movementTags)}</Text> : null}
      <Text style={styles.impactFootnote}>This check-in does not diagnose the cause. It changes training constraints for the temporary window you choose.</Text>
    </View>

    {message ? <View style={styles.message}><V23Icon name="info" color={tokens.danger} size={16} /><Text style={styles.messageText}>{message}</Text></View> : null}

    <ProductAction
      label={saving ? 'Updating…' : status === 'normal' ? 'Clear temporary adjustment' : 'Update training protection'}
      icon={status === 'normal' ? 'check' : 'adjust'}
      disabled={saving}
      onPress={() => void save()}
    />
  </V23Screen>;
}

function PatternChip({ pattern, selected, onPress, styles }: { pattern: MovementPattern; selected: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  const option = MOVEMENT_PATTERN_OPTIONS.find((item) => item.pattern === pattern);
  return <Chip label={option?.label ?? pattern} selected={selected} onPress={onPress} styles={styles} />;
}

function Chip({ label, selected, onPress, styles }: { label: string; selected: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
  </Pressable>;
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
    label: checkIn.status === 'muscle_soreness'
      ? 'Temporary soreness adjustment'
      : checkIn.status === 'tightness_pain'
        ? 'Temporary pain or tightness adjustment'
        : 'Temporary training pause',
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
    id,
    source: 'pt_profile',
    label: `${profile.name} retained after clearing temporary adjustment`,
    activeFrom: new Date().toISOString(),
    excludedRegions: profile.excludedRegions,
    excludedMovementTags: profile.excludedMovementTags,
    regionRestrictions: profile.regionRestrictions ?? [],
    excludedMovementPatterns: profile.excludedMovementPatterns ?? [],
    penalizedRegions: [],
  };
}

function mergeRegionRestrictions(values: RegionRestriction[]): RegionRestriction[] {
  const rank = { direct_only: 1, keep_light: 2, avoid: 3 } as const;
  const map = new Map<string, RegionRestriction>();
  for (const value of values) {
    const current = map.get(value.region);
    if (!current || rank[value.mode] > rank[current.mode]) map.set(value.region, value);
  }
  return [...map.values()];
}

function painAreaSummary(selections: PainAreaSelection[]): string {
  if (!selections.length) return 'Optional if a specific area is involved.';
  return selections
    .slice(0, 2)
    .map((selection) => painAreaById(selection.areaId)?.shortLabel ?? selection.areaId)
    .join(' · ') + (selections.length > 2 ? ` +${selections.length - 2}` : '');
}

function movementSummary(patterns: MovementPattern[], tags: AvoidanceTag[]): string {
  const count = patterns.length + tags.length;
  if (!count) return 'Optional if only a specific area needs protection.';
  return `${count} movement limit${count === 1 ? '' : 's'} selected.`;
}

function restrictionSummary(areas: PainAreaSelection[], patterns: MovementPattern[], tags: AvoidanceTag[]): string {
  const parts: string[] = [];
  if (areas.length) parts.push(`${areas.length} area${areas.length === 1 ? '' : 's'}`);
  if (patterns.length) parts.push(`${patterns.length} movement pattern${patterns.length === 1 ? '' : 's'}`);
  if (tags.length) parts.push(`${tags.length} practical limit${tags.length === 1 ? '' : 's'}`);
  return parts.length
    ? `Current structured protection: ${parts.join(' · ')}.`
    : 'No specific area or movement has been selected yet.';
}

function severityLabel(value: number): string {
  if (value <= 1) return 'Minor';
  if (value === 2) return 'Noticeable';
  if (value === 3) return 'Moderate';
  if (value === 4) return 'High';
  return 'Normal training inappropriate';
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { gap: 16, paddingTop: 16, paddingBottom: 40 },
    header: { gap: 5, paddingHorizontal: 2 },
    eyebrow: { color: tokens.accent, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1.05 },
    title: { color: tokens.text, fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: -0.55 },
    subtitle: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 20 },
    body: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18 },

    activeBanner: { borderRadius: 16, backgroundColor: tokens.accentSoft, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
    activeIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
    activeCopy: { flex: 1, minWidth: 0, gap: 2 },
    activeTitle: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },

    statusList: { gap: 8 },
    statusOption: { minHeight: 76, borderRadius: 18, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
    statusOptionSelected: { borderColor: tokens.accent, backgroundColor: tokens.surfaceMuted },
    statusIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    statusIconSelected: { backgroundColor: tokens.accent },
    optionCopy: { flex: 1, minWidth: 0, gap: 2 },
    optionTitle: { color: tokens.text, fontSize: 14.5, lineHeight: 19, fontWeight: '900' },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' },
    radioSelected: { borderColor: tokens.accent },
    radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: tokens.accent },

    descriptionCard: { borderRadius: 20, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 15, gap: 8 },
    sectionEyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
    sectionTitle: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '900' },
    subsectionTitle: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900', marginTop: 3 },
    notesInput: { minHeight: 96, borderWidth: 1, borderColor: tokens.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, color: tokens.text, backgroundColor: tokens.surfaceMuted, fontSize: 14, lineHeight: 20, textAlignVertical: 'top' },
    notesInputSmall: { minHeight: 72, borderWidth: 1, borderColor: tokens.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, color: tokens.text, backgroundColor: tokens.surface, fontSize: 13.5, lineHeight: 19, textAlignVertical: 'top' },

    suggestionBox: { backgroundColor: tokens.surfaceMuted, borderRadius: 14, padding: 11, gap: 7 },
    suggestionLabel: { color: tokens.accent, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.75 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    chip: { borderWidth: 1, borderColor: tokens.border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: tokens.surface },
    chipSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent },
    chipText: { color: tokens.textMuted, fontSize: 12, lineHeight: 16, fontWeight: '700' },
    chipTextSelected: { color: tokens.accent, fontWeight: '900' },

    patternList: { gap: 6 },
    patternRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: tokens.border, borderRadius: 13, padding: 10 },
    patternRowSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent },
    checkbox: { width: 21, height: 21, borderRadius: 7, borderWidth: 1.5, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' },
    checkboxSelected: { backgroundColor: tokens.accent, borderColor: tokens.accent },
    checkmark: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
    patternTitle: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '800' },

    fieldTitle: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900', marginTop: 2 },
    scaleRow: { flexDirection: 'row', gap: 7 },
    scaleButton: { flex: 1, minHeight: 43, borderRadius: 12, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
    scaleButtonSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent },
    scaleText: { color: tokens.text, fontSize: 14, fontWeight: '800' },
    scaleTextSelected: { color: tokens.accent },
    scaleAnchors: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
    anchor: { flex: 1, color: tokens.textMuted, fontSize: 10.5, lineHeight: 14 },
    anchorRight: { flex: 1, color: tokens.textMuted, fontSize: 10.5, lineHeight: 14, textAlign: 'right' },

    pauseCard: { borderRadius: 20, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 15, gap: 9 },
    impactCard: { borderRadius: 20, backgroundColor: tokens.surfaceMuted, padding: 15, gap: 5 },
    impactTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    impactLabel: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.85 },
    impactTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
    impactBody: { color: tokens.textMuted, fontSize: 12, lineHeight: 17 },
    impactFootnote: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 15, marginTop: 2 },

    message: { borderRadius: 13, borderWidth: 1, borderColor: tokens.danger, backgroundColor: tokens.surfaceMuted, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
    messageText: { flex: 1, color: tokens.danger, fontSize: 12, lineHeight: 17, fontWeight: '700' },
    pressed: { opacity: 0.75 },
  });
}
