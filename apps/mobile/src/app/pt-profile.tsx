import { adaptTrainingBlock } from '@circuit/planner';
import type {
  AvoidanceTag,
  MovementPattern,
  PainAreaSelection,
  PlanRestrictionOverride,
  PTCondition,
  PTProfile,
} from '@circuit/domain';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppScreen } from '@/components/v12-ui';
import { PainBodyMap } from '@/components/pain-body-map';
import { MOVEMENT_PATTERN_OPTIONS, PAIN_AREAS, buildRestrictionsFromPainAreas, createPainAreaSelection } from '@/content/pain-areas';
import { useExerciseCatalog } from '@/services/exercise-catalog';
import {
  getLatestPTProfile,
  getLatestTrainingBlock,
  getPreviousExerciseIds,
  getRecentRegionExposures,
  savePTProfile,
  saveTrainingBlock,
} from '@/services/database';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

const OTHER_MOVEMENT_LIMITS: Array<{ label: string; tags: AvoidanceTag[] }> = [
  { label: 'Weight through hands', tags: ['shoulder_weight_bearing', 'wrist_weight_bearing'] },
  { label: 'Hanging', tags: ['hanging'] },
  { label: 'Deep knee bending', tags: ['deep_knee_flexion'] },
  { label: 'Kneeling', tags: ['kneeling'] },
  { label: 'Floor work', tags: ['floor_required'] },
  { label: 'Unstable surfaces', tags: ['unstable_surface', 'high_balance_demand'] },
  { label: 'Complex coordination', tags: ['complex_coordination'] },
];

export default function PTProfileScreen() {
  const { exercises } = useExerciseCatalog();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const router = useRouter();
  const [profileName, setProfileName] = useState('Current PT profile');
  const [conditionName, setConditionName] = useState('');
  const [conditionStatus, setConditionStatus] = useState<PTCondition['status']>('active');
  const [active, setActive] = useState(true);
  const [painAreas, setPainAreas] = useState<PainAreaSelection[]>([]);
  const [movementPatterns, setMovementPatterns] = useState<MovementPattern[]>([]);
  const [movementTags, setMovementTags] = useState<AvoidanceTag[]>([]);
  const [clinicianNotes, setClinicianNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    void getLatestPTProfile().then((profile) => {
      if (cancelled || !profile) return;
      setProfileName(profile.name);
      setConditionName(profile.conditions[0]?.name ?? '');
      setConditionStatus(profile.conditions[0]?.status ?? 'active');
      setActive(profile.active);
      setPainAreas(profile.protectedAreas?.length ? profile.protectedAreas : legacySelections(profile));
      setMovementPatterns(profile.excludedMovementPatterns ?? []);
      setMovementTags(profile.excludedMovementTags ?? []);
      setClinicianNotes(profile.clinicianNotes ?? '');
    });
    return () => { cancelled = true; };
  }, []));

  function togglePattern(pattern: MovementPattern) {
    setMovementPatterns((current) => current.includes(pattern) ? current.filter((item) => item !== pattern) : [...current, pattern]);
  }
  function toggleTags(tags: AvoidanceTag[]) {
    const selected = tags.every((tag) => movementTags.includes(tag));
    setMovementTags((current) => selected ? current.filter((tag) => !tags.includes(tag)) : unique([...current, ...tags]));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const now = new Date().toISOString();
      const mapped = buildRestrictionsFromPainAreas(painAreas);
      const conditions: PTCondition[] = conditionName.trim() ? [{ id: 'condition_primary', name: conditionName.trim(), status: conditionStatus, affectedSide: sideFromAreas(painAreas) }] : [];
      const profile: PTProfile = {
        id: 'pt_profile_primary',
        name: profileName.trim() || 'Current PT profile',
        active,
        conditions,
        excludedRegions: [],
        excludedMovementTags: movementTags,
        protectedAreas: painAreas,
        regionRestrictions: mapped.regionRestrictions,
        excludedMovementPatterns: movementPatterns,
        clinicianNotes: clinicianNotes.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
      await savePTProfile(profile);

      if (profile.active) {
        const [savedBlock, recentRegionExposures, previousExerciseIds] = await Promise.all([getLatestTrainingBlock(), getRecentRegionExposures(), getPreviousExerciseIds()]);
        if (savedBlock) {
          const adjusted = adaptTrainingBlock(savedBlock.block, profileOverride(profile, `pt_update_${Date.now()}`), { exercises, recentRegionExposures, previousExerciseIds, now });
          if (!adjusted.ok) {
            setMessage(`The profile was saved, but the current plan could not be updated: ${adjusted.messages.join(' ')}`);
            return;
          }
          await saveTrainingBlock(adjusted.block);
        }
      }
      setMessage(profile.active ? 'Restriction profile saved and applied to remaining sessions.' : 'Restriction profile saved as inactive.');
      router.back();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'The restriction profile could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return <AppScreen eyebrow="ONGOING RESTRICTIONS" title="Protect only what needs protecting" subtitle="Use this for a current PT plan, recurring limitation, or return-to-training restriction. Specific areas and movements replace broad all-or-nothing exclusions.">
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Use this profile</Text>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: active }} onPress={() => setActive((current) => !current)} style={[styles.toggleRow, active && styles.toggleRowSelected]}>
        <View style={[styles.toggle, active && styles.toggleSelected]}><View style={[styles.toggleKnob, active && styles.toggleKnobSelected]} /></View>
        <View style={styles.flex}><Text style={styles.rowTitle}>{active ? 'Active' : 'Inactive'}</Text><Text style={styles.body}>{active ? 'Applied to new workouts and remaining planned sessions.' : 'Saved for reference without filtering workouts.'}</Text></View>
      </Pressable>
    </View>

    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Profile details</Text>
      <Field label="Profile name" styles={styles}><TextInput value={profileName} onChangeText={setProfileName} placeholder="Current PT profile" placeholderTextColor={tokens.textMuted} style={styles.input} /></Field>
      <Field label="Condition or PT context" styles={styles}><TextInput value={conditionName} onChangeText={setConditionName} placeholder="Example: shoulder rehab or return from bone stress injury" placeholderTextColor={tokens.textMuted} style={styles.input} /></Field>
      <Field label="Current stage" styles={styles}><View style={styles.chipRow}>{(['active', 'improving', 'returning', 'managed'] as const).map((value) => <Chip key={value} label={value === 'returning' ? 'Returning to sport' : capitalize(value)} selected={conditionStatus === value} onPress={() => setConditionStatus(value)} styles={styles} />)}</View></Field>
    </View>

    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Protected areas</Text>
      <Text style={styles.body}>Tap the precise location and choose whether to avoid direct loading, keep it light, or avoid the area entirely.</Text>
      <PainBodyMap selections={painAreas} onChange={setPainAreas} />
    </View>

    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Movement restrictions</Text>
      <Text style={styles.body}>Use these only when a movement itself is restricted. They are stronger than selecting an area alone.</Text>
      <View style={styles.patternList}>{MOVEMENT_PATTERN_OPTIONS.map((option) => {
        const selected = movementPatterns.includes(option.pattern);
        return <Pressable key={option.pattern} onPress={() => togglePattern(option.pattern)} style={[styles.patternRow, selected && styles.patternRowSelected]}>
          <View style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected ? <Text style={styles.checkmark}>✓</Text> : null}</View>
          <View style={styles.flex}><Text style={styles.patternTitle}>{option.label}</Text><Text style={styles.body}>{option.detail}</Text></View>
        </Pressable>;
      })}</View>
      <Text style={styles.subsectionTitle}>Other restrictions</Text>
      <View style={styles.chipRow}>{OTHER_MOVEMENT_LIMITS.map((option) => <Chip key={option.label} label={option.label} selected={option.tags.every((tag) => movementTags.includes(tag))} onPress={() => toggleTags(option.tags)} styles={styles} />)}</View>
    </View>

    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Clinician or personal notes</Text>
      <TextInput value={clinicianNotes} onChangeText={setClinicianNotes} multiline placeholder="Example: no loaded dorsiflexion; symptoms should return to baseline by the next morning" placeholderTextColor={tokens.textMuted} style={[styles.input, styles.notesInput]} />
      <Text style={styles.body}>Notes are private reference text. Structured area and movement selections control generation.</Text>
    </View>

    {message ? <Text style={styles.message}>{message}</Text> : null}
    <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.primaryButton, saving && styles.disabled]}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save restriction profile'}</Text></Pressable>
  </AppScreen>;
}

function Field({ label, children, styles }: { label: string; children: ReactNode; styles: ReturnType<typeof makeStyles> }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>; }
function Chip({ label, selected, onPress, styles }: { label: string; selected: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles> }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>; }

function legacySelections(profile: PTProfile): PainAreaSelection[] {
  const ids = new Set<string>();
  for (const region of profile.excludedRegions) { const match = PAIN_AREAS.find((area) => area.regions.includes(region)); if (match) ids.add(match.id); }
  return [...ids].map((id) => createPainAreaSelection(PAIN_AREAS.find((area) => area.id === id)!, 'avoid'));
}
function sideFromAreas(areas: PainAreaSelection[]): PTCondition['affectedSide'] {
  const sides = new Set(areas.map((area) => area.side));
  if (sides.has('left') && sides.has('right')) return 'bilateral';
  if (sides.has('left')) return 'left';
  if (sides.has('right')) return 'right';
  return 'not_applicable';
}
function profileOverride(profile: PTProfile, id: string): PlanRestrictionOverride { return { id, source: 'pt_profile', label: `${profile.name} applied to remaining plan`, activeFrom: new Date().toISOString(), excludedRegions: profile.excludedRegions, excludedMovementTags: profile.excludedMovementTags, regionRestrictions: profile.regionRestrictions ?? [], excludedMovementPatterns: profile.excludedMovementPatterns ?? [], penalizedRegions: [] }; }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }

function makeStyles(tokens: DesignTokens) { return StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: 20, borderWidth: 1, borderColor: tokens.border, padding: 16, gap: 12 }, sectionTitle: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '800' }, subsectionTitle: { color: tokens.text, fontSize: 14, fontWeight: '800', marginTop: 3 }, body: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19 }, rowTitle: { color: tokens.text, fontSize: 15, fontWeight: '800' }, flex: { flex: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: tokens.border }, toggleRowSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent }, toggle: { width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: tokens.surfaceMuted, borderWidth: 1, borderColor: tokens.border }, toggleSelected: { backgroundColor: tokens.accent }, toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' }, toggleKnobSelected: { transform: [{ translateX: 18 }] },
  field: { gap: 7 }, fieldLabel: { color: tokens.text, fontSize: 14, fontWeight: '700' }, input: { minHeight: 48, borderWidth: 1, borderColor: tokens.border, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, color: tokens.text, backgroundColor: tokens.canvas, fontSize: 15 }, notesInput: { minHeight: 112, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { borderWidth: 1, borderColor: tokens.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: tokens.surface }, chipSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent }, chipText: { color: tokens.text, fontSize: 13, fontWeight: '600' }, chipTextSelected: { color: tokens.accent, fontWeight: '800' },
  patternList: { gap: 7 }, patternRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: tokens.border, borderRadius: 14, padding: 11 }, patternRowSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent }, checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' }, checkboxSelected: { backgroundColor: tokens.accent, borderColor: tokens.accent }, checkmark: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' }, patternTitle: { color: tokens.text, fontSize: 14, fontWeight: '700' },
  primaryButton: { minHeight: 54, borderRadius: 16, backgroundColor: tokens.header, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' }, disabled: { opacity: 0.55 }, message: { color: '#A04444', fontSize: 13.5, lineHeight: 19 },
}); }
