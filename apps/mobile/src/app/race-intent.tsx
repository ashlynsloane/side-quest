import type { EnduranceDiscipline } from '@circuit/domain';
import type { CoachStrategyObjective, CoachStrategyTradeoff } from '@circuit/planner/coach-semantic-frame';
import {
  setRaceIntentDisciplinePriority,
  type RaceIntentV2,
  type RaceOverallObjective,
  type RaceTargetKind,
} from '@circuit/planner/race-intent';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { V23Card, V23Chip, V23Screen } from '@/components/v23-ui';
import {
  applyRaceIntent,
  loadRaceIntentEditorState,
  resetRaceIntent,
  type RaceIntentEditorState,
} from '@/services/race-intent-runtime';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

const OVERALL_OPTIONS: Array<{ id: RaceOverallObjective; title: string; body: string }> = [
  { id: 'finish_comfortably', title: 'Finish comfortably', body: 'Prepare to complete the event without spending extra training budget chasing performance.' },
  { id: 'strong_finish', title: 'Strong finish', body: 'Build enough performance to race well while keeping the plan broadly balanced.' },
  { id: 'best_overall', title: 'Best overall race', body: 'Optimize the complete race result rather than one discipline in isolation.' },
  { id: 'specific_overall_time', title: 'Specific overall time', body: 'Use a concrete finish-time target as the race-level objective.' },
  { id: 'discipline_performance', title: 'Specific discipline performance', body: 'Give one discipline first claim on discretionary development.' },
  { id: 'placement_qualification', title: 'Placement / qualification', body: 'Treat placing or qualifying as the main competitive outcome.' },
];

const PRIORITY_OPTIONS: Array<{ id: CoachStrategyObjective; label: string; body: string }> = [
  { id: 'minimum_viable', label: 'Minimum viable', body: 'Enough to preserve race readiness; never below the planner’s race-safe floor.' },
  { id: 'maintain', label: 'Maintain', body: 'Hold current capacity without spending much progression budget here.' },
  { id: 'develop', label: 'Develop', body: 'Continue meaningful improvement as part of the overall plan.' },
  { id: 'primary_focus', label: 'Primary focus', body: 'Give this discipline first claim on discretionary progression.' },
  { id: 'maximize', label: 'Maximize', body: 'Push development as far as the time, recovery, race, and safety ceilings allow.' },
];

const TRADEOFF_OPTIONS: Array<{ id: CoachStrategyTradeoff; title: string; body: string }> = [
  { id: 'preserve_balance', title: 'Keep the plan balanced', body: 'A focus can matter, but not by substantially consolidating the other race disciplines.' },
  { id: 'moderate_tradeoff', title: 'Give my focus a clear advantage', body: 'Other disciplines can move toward maintenance so the focus gets more discretionary capacity.' },
  { id: 'aggressive_specialization', title: 'Maximize my focus', body: 'Other disciplines can consolidate toward minimum viable race preparation, but never below protected floors.' },
];

const TARGET_OPTIONS: Array<{ id: RaceTargetKind; label: string }> = [
  { id: 'pr', label: 'PR' },
  { id: 'time', label: 'Split time' },
  { id: 'pace', label: 'Pace' },
  { id: 'power', label: 'Power' },
  { id: 'speed', label: 'Speed' },
  { id: 'placement', label: 'Placement' },
];

export default function RaceIntentScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [editor, setEditor] = useState<RaceIntentEditorState | null>(null);
  const [intent, setIntent] = useState<RaceIntentV2 | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    void loadRaceIntentEditorState().then((next) => {
      if (!live) return;
      setEditor(next);
      setIntent(next?.intent ?? null);
      setError(null);
      setSavedMessage(null);
    });
    return () => { live = false; };
  }, []));

  if (!editor || !intent) {
    return <V23Screen>
      <View style={styles.headerRow}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable></View>
      <V23Card elevated style={styles.card}>
        <Text style={styles.title}>Race priorities need an active event plan.</Text>
        <Text style={styles.body}>Create or open a race-based plan first, then come back here to decide where you want to spend your performance budget.</Text>
      </V23Card>
    </V23Screen>;
  }

  const updateIntent = (patch: Partial<RaceIntentV2>) => {
    setIntent((current) => current ? { ...current, ...patch } : current);
    setError(null);
    setSavedMessage(null);
  };

  const updateDisciplinePriority = (discipline: EnduranceDiscipline, priority: CoachStrategyObjective) => {
    setIntent((current) => current ? setRaceIntentDisciplinePriority(current, discipline, priority) : current);
    setError(null);
    setSavedMessage(null);
  };

  const choosePrimary = (discipline: EnduranceDiscipline) => {
    setIntent((current) => current ? setRaceIntentDisciplinePriority(current, discipline, 'primary_focus') : current);
    setError(null);
    setSavedMessage(null);
  };

  const setTargetKind = (kind: RaceTargetKind) => {
    if (!intent.primaryDiscipline) return;
    const existing = intent.disciplineTargets?.[intent.primaryDiscipline];
    updateIntent({
      disciplineTargets: {
        ...(intent.disciplineTargets ?? {}),
        [intent.primaryDiscipline]: { kind, value: existing?.value },
      },
    });
  };

  const setTargetValue = (value: string) => {
    if (!intent.primaryDiscipline) return;
    const existing = intent.disciplineTargets?.[intent.primaryDiscipline] ?? { kind: 'pr' as const };
    updateIntent({
      disciplineTargets: {
        ...(intent.disciplineTargets ?? {}),
        [intent.primaryDiscipline]: { ...existing, value },
      },
    });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await applyRaceIntent(intent);
      setSavedMessage('Race priorities applied. Side Quest reconciled the whole-athlete plan around this emphasis.');
      setEditor((current) => current ? { ...current, customized: true, intent } : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Race priorities could not be applied.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      await resetRaceIntent();
      const next = await loadRaceIntentEditorState();
      setEditor(next);
      setIntent(next?.intent ?? null);
      setSavedMessage('Custom race priorities removed. The plan is back to the normal race defaults.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Race priorities could not be reset.');
    } finally {
      setBusy(false);
    }
  };

  const primaryTarget = intent.primaryDiscipline ? intent.disciplineTargets?.[intent.primaryDiscipline] : undefined;

  return <V23Screen>
    <View style={styles.headerRow}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable>
      <Text style={styles.headerLabel}>RACE INTENT V2</Text>
    </View>

    <View style={styles.intro}>
      <Text style={styles.eyebrow}>PERFORMANCE BUDGET</Text>
      <Text style={styles.title}>What do you actually want from this race?</Text>
      <Text style={styles.body}>{editor.goalName}</Text>
      <Text style={styles.body}>Your answer can favor one discipline. Safety constraints, race-specific minimums, taper rules, and the total weekly time budget still win.</Text>
    </View>

    <V23Card elevated style={styles.card}>
      <Text style={styles.sectionTitle}>Overall race objective</Text>
      <View style={styles.optionStack}>
        {OVERALL_OPTIONS.map((option) => {
          const selected = intent.overallObjective === option.id;
          return <Pressable key={option.id} onPress={() => {
            const patch: Partial<RaceIntentV2> = { overallObjective: option.id };
            if (option.id === 'discipline_performance' && !intent.primaryDiscipline) patch.primaryDiscipline = editor.disciplines[0];
            updateIntent(patch);
          }} style={[styles.option, selected && styles.optionSelected]}>
            <View style={styles.optionTop}><Text style={[styles.optionTitle, selected && styles.selectedText]}>{option.title}</Text><View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View></View>
            <Text style={styles.optionBody}>{option.body}</Text>
          </Pressable>;
        })}
      </View>
      {intent.overallObjective === 'specific_overall_time' ? <TextInput
        value={intent.overallTarget ?? ''}
        onChangeText={(overallTarget) => updateIntent({ overallTarget })}
        placeholder="Example: 5:15:00"
        placeholderTextColor={tokens.textMuted}
        style={styles.input}
      /> : null}
    </V23Card>

    {editor.disciplines.length > 1 || intent.overallObjective === 'discipline_performance' ? <V23Card elevated style={styles.card}>
      <Text style={styles.sectionTitle}>Primary discipline</Text>
      <Text style={styles.body}>Choose one if a specific split matters more than your overall balanced result. Only one discipline can hold the top focus at a time.</Text>
      <View style={styles.chipRow}>
        {editor.disciplines.map((discipline) => <Pressable key={discipline} onPress={() => choosePrimary(discipline)} style={[styles.disciplineChip, intent.primaryDiscipline === discipline && styles.disciplineChipSelected]}>
          <Text style={[styles.disciplineChipText, intent.primaryDiscipline === discipline && styles.selectedText]}>{disciplineLabel(discipline)}</Text>
        </Pressable>)}
      </View>
    </V23Card> : null}

    <V23Card elevated style={styles.card}>
      <Text style={styles.sectionTitle}>Discipline priorities</Text>
      <Text style={styles.body}>These are relative development priorities—not permission to erase a race discipline. Primary focus and Maximize are exclusive: choosing one automatically releases the previous top focus.</Text>
      {editor.disciplines.map((discipline) => <View key={discipline} style={styles.disciplineBlock}>
        <View style={styles.disciplineHeading}>
          <Text style={styles.disciplineTitle}>{disciplineLabel(discipline)}</Text>
          {intent.primaryDiscipline === discipline ? <V23Chip tone="info">PRIMARY</V23Chip> : null}
        </View>
        <View style={styles.priorityGrid}>
          {PRIORITY_OPTIONS.map((option) => {
            const selected = intent.disciplinePriorities[discipline] === option.id;
            return <Pressable key={option.id} onPress={() => updateDisciplinePriority(discipline, option.id)} style={[styles.priorityOption, selected && styles.prioritySelected]}>
              <Text style={[styles.priorityLabel, selected && styles.selectedText]}>{option.label}</Text>
              <Text style={styles.priorityBody}>{option.body}</Text>
            </Pressable>;
          })}
        </View>
      </View>)}
    </V23Card>

    {editor.disciplines.length > 1 ? <V23Card elevated style={styles.card}>
      <Text style={styles.sectionTitle}>How much tradeoff are you willing to accept?</Text>
      <View style={styles.optionStack}>
        {TRADEOFF_OPTIONS.map((option) => {
          const selected = intent.tradeoffTolerance === option.id;
          return <Pressable key={option.id} onPress={() => updateIntent({ tradeoffTolerance: option.id })} style={[styles.option, selected && styles.optionSelected]}>
            <Text style={[styles.optionTitle, selected && styles.selectedText]}>{option.title}</Text>
            <Text style={styles.optionBody}>{option.body}</Text>
          </Pressable>;
        })}
      </View>
    </V23Card> : null}

    {intent.primaryDiscipline ? <V23Card elevated style={styles.card}>
      <Text style={styles.sectionTitle}>Optional {disciplineLabel(intent.primaryDiscipline)} target</Text>
      <Text style={styles.body}>This tells Side Quest what success means. It does not directly prescribe workout volume or intensity.</Text>
      <View style={styles.chipRow}>
        {TARGET_OPTIONS.map((option) => <Pressable key={option.id} onPress={() => setTargetKind(option.id)} style={[styles.disciplineChip, primaryTarget?.kind === option.id && styles.disciplineChipSelected]}>
          <Text style={[styles.disciplineChipText, primaryTarget?.kind === option.id && styles.selectedText]}>{option.label}</Text>
        </Pressable>)}
      </View>
      {primaryTarget && primaryTarget.kind !== 'pr' ? <TextInput
        value={primaryTarget.value ?? ''}
        onChangeText={setTargetValue}
        placeholder={targetPlaceholder(primaryTarget.kind)}
        placeholderTextColor={tokens.textMuted}
        style={styles.input}
      /> : null}
    </V23Card> : null}

    {error ? <Text style={styles.error}>{error}</Text> : null}
    {savedMessage ? <Text style={styles.success}>{savedMessage}</Text> : null}

    <Pressable disabled={busy} onPress={() => void save()} style={[styles.primaryButton, busy && styles.disabled]}>
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Apply race priorities</Text>}
    </Pressable>
    {editor.customized ? <Pressable disabled={busy} onPress={() => void reset()} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Use normal race defaults</Text></Pressable> : null}
    <Text style={styles.footnote}>An explicitly approved Strategy Coach directive can later refine these priorities. It will not erase the underlying race goal or safety guardrails.</Text>
  </V23Screen>;
}

function disciplineLabel(discipline: EnduranceDiscipline): string {
  if (discipline === 'swim') return 'Swim';
  if (discipline === 'bike') return 'Bike';
  return 'Run';
}

function targetPlaceholder(kind: RaceTargetKind): string {
  if (kind === 'time') return 'Example: 2:35:00';
  if (kind === 'pace') return 'Example: 7:30/mi or 1:45/100m';
  if (kind === 'power') return 'Example: 210 W';
  if (kind === 'speed') return 'Example: 20 mph';
  if (kind === 'placement') return 'Example: top 10 age group';
  return 'Optional target';
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    back: { color: tokens.accent, fontSize: 16, fontWeight: '800' },
    headerLabel: { color: tokens.textMuted, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.1 },
    intro: { gap: 7 },
    eyebrow: { color: tokens.accent, fontSize: 11, lineHeight: 14, fontWeight: '900', letterSpacing: 1.2 },
    title: { color: tokens.text, fontSize: 29, lineHeight: 35, fontWeight: '900', letterSpacing: -0.5 },
    body: { color: tokens.textMuted, fontSize: 14, lineHeight: 20 },
    card: { padding: 17, gap: 12 },
    sectionTitle: { color: tokens.text, fontSize: 19, lineHeight: 24, fontWeight: '900' },
    optionStack: { gap: 8 },
    option: { borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, borderRadius: 15, padding: 13, gap: 5 },
    optionSelected: { borderColor: tokens.accent, backgroundColor: tokens.accentSoft },
    optionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    optionTitle: { flex: 1, color: tokens.text, fontSize: 15, lineHeight: 20, fontWeight: '800' },
    optionBody: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18 },
    selectedText: { color: tokens.accent },
    radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' },
    radioSelected: { borderColor: tokens.accent },
    radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.accent },
    input: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surfaceMuted, color: tokens.text, paddingHorizontal: 13, fontSize: 15 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    disciplineChip: { minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
    disciplineChipSelected: { borderColor: tokens.accent, backgroundColor: tokens.accentSoft },
    disciplineChipText: { color: tokens.text, fontSize: 13, fontWeight: '800' },
    disciplineBlock: { gap: 9, paddingTop: 5 },
    disciplineHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    disciplineTitle: { color: tokens.text, fontSize: 17, fontWeight: '900' },
    priorityGrid: { gap: 7 },
    priorityOption: { borderWidth: 1, borderColor: tokens.border, borderRadius: 14, padding: 11, gap: 3, backgroundColor: tokens.surface },
    prioritySelected: { borderColor: tokens.accent, backgroundColor: tokens.accentSoft },
    priorityLabel: { color: tokens.text, fontSize: 14, fontWeight: '800' },
    priorityBody: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
    error: { color: tokens.danger, fontSize: 13, lineHeight: 19, fontWeight: '700' },
    success: { color: tokens.success, fontSize: 13, lineHeight: 19, fontWeight: '700' },
    primaryButton: { minHeight: 50, borderRadius: 15, backgroundColor: tokens.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    primaryButtonText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '900' },
    secondaryButton: { minHeight: 46, borderRadius: 15, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    secondaryButtonText: { color: tokens.text, fontSize: 14, fontWeight: '800' },
    disabled: { opacity: 0.5 },
    footnote: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 17, paddingBottom: 12 },
  });
}
