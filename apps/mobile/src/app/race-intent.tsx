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

import {
  ProductAction,
  ProductChoiceRow,
  ProductDisclosure,
  ProductHero,
  ProductSection,
} from '@/components/product-ui';
import { V23Chip, V23Screen } from '@/components/v23-ui';
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
  { id: 'maximize', label: 'Maximize', body: 'Push development as far as time, recovery, race, and safety ceilings allow.' },
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

type IntentSection = 'outcome' | 'focus' | 'tradeoff' | 'target';

export default function RaceIntentScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [editor, setEditor] = useState<RaceIntentEditorState | null>(null);
  const [intent, setIntent] = useState<RaceIntentV2 | null>(null);
  const [openSection, setOpenSection] = useState<IntentSection>('outcome');
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
    return <V23Screen contentStyle={styles.page}>
      <View style={styles.headerRow}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable></View>
      <ProductHero
        tone="surface"
        eyebrow="RACE PRIORITIES"
        title="Create a race plan first."
        body="Race priorities attach to an active event plan so Side Quest can translate them into the actual weekly planner."
      />
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
      setSavedMessage('Race priorities applied. The whole-athlete plan was reconciled around this strategy.');
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
      setSavedMessage('Custom race priorities removed. The plan is back to normal race defaults.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Race priorities could not be reset.');
    } finally {
      setBusy(false);
    }
  };

  const primaryTarget = intent.primaryDiscipline ? intent.disciplineTargets?.[intent.primaryDiscipline] : undefined;
  const overall = OVERALL_OPTIONS.find((option) => option.id === intent.overallObjective);
  const tradeoff = TRADEOFF_OPTIONS.find((option) => option.id === intent.tradeoffTolerance);
  const topFocus = intent.primaryDiscipline ? disciplineLabel(intent.primaryDiscipline) : undefined;

  return <V23Screen contentStyle={styles.page}>
    <View style={styles.headerRow}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backHit}><Text style={styles.back}>‹ Back</Text></Pressable>
      <Text style={styles.headerLabel}>RACE PRIORITIES</Text>
    </View>

    <ProductHero
      eyebrow="YOUR RACE STRATEGY"
      title={editor.goalName}
      body="Set the outcome that matters, then decide where Side Quest should spend scarce progression capacity."
      meta={<>
        <V23Chip tone="info">{overall?.title ?? 'Race goal'}</V23Chip>
        {topFocus ? <V23Chip tone="warm">Top focus · {topFocus}</V23Chip> : <V23Chip tone="neutral">Balanced focus</V23Chip>}
        {editor.customized ? <V23Chip tone="neutral">Customized</V23Chip> : null}
      </>}
    />

    <ProductSection
      eyebrow="DECISION FLOW"
      title="Make the big choices. Keep the details tucked away."
      body="Only one discipline can own the top-focus slot. Race floors, recovery, taper, and the weekly time budget remain protected."
    >
      <View style={styles.sheet}>
        <ProductDisclosure
          title="1 · Outcome"
          summary={overall?.title}
          expanded={openSection === 'outcome'}
          onPress={() => setOpenSection(openSection === 'outcome' ? 'focus' : 'outcome')}
        >
          <View style={styles.choiceStack}>
            {OVERALL_OPTIONS.map((option) => <ProductChoiceRow
              key={option.id}
              title={option.title}
              body={option.body}
              selected={intent.overallObjective === option.id}
              onPress={() => {
                const patch: Partial<RaceIntentV2> = { overallObjective: option.id };
                if (option.id === 'discipline_performance' && !intent.primaryDiscipline) patch.primaryDiscipline = editor.disciplines[0];
                updateIntent(patch);
              }}
            />)}
          </View>
          {intent.overallObjective === 'specific_overall_time' ? <TextInput
            value={intent.overallTarget ?? ''}
            onChangeText={(overallTarget) => updateIntent({ overallTarget })}
            placeholder="Overall goal · e.g. 5:15:00"
            placeholderTextColor={tokens.textMuted}
            style={styles.input}
          /> : null}
        </ProductDisclosure>

        <ProductDisclosure
          title="2 · Focus"
          summary={focusSummary(intent, editor.disciplines)}
          expanded={openSection === 'focus'}
          onPress={() => setOpenSection(openSection === 'focus' ? 'tradeoff' : 'focus')}
          badge={topFocus ? <V23Chip tone="info">{topFocus}</V23Chip> : undefined}
        >
          {editor.disciplines.length > 1 ? <>
            <Text style={styles.microLabel}>TOP DISCIPLINE</Text>
            <View style={styles.chipRow}>
              {editor.disciplines.map((discipline) => <Pressable
                key={discipline}
                onPress={() => choosePrimary(discipline)}
                style={[styles.disciplineChip, intent.primaryDiscipline === discipline && styles.disciplineChipSelected]}
              >
                <Text style={[styles.disciplineChipText, intent.primaryDiscipline === discipline && styles.selectedText]}>{disciplineLabel(discipline)}</Text>
              </Pressable>)}
            </View>
            <Text style={styles.helper}>Choosing a new top discipline releases the previous Primary focus / Maximize slot automatically.</Text>
          </> : null}

          <View style={styles.disciplineList}>
            {editor.disciplines.map((discipline) => {
              const selectedPriority = intent.disciplinePriorities[discipline];
              const selectedOption = PRIORITY_OPTIONS.find((option) => option.id === selectedPriority);
              return <View key={discipline} style={styles.disciplineBlock}>
                <View style={styles.disciplineHeading}>
                  <Text style={styles.disciplineTitle}>{disciplineLabel(discipline)}</Text>
                  <Text style={styles.currentPriority}>{selectedOption?.label ?? 'Default'}</Text>
                </View>
                <View style={styles.priorityGrid}>
                  {PRIORITY_OPTIONS.map((option) => {
                    const selected = selectedPriority === option.id;
                    return <Pressable
                      key={option.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => updateDisciplinePriority(discipline, option.id)}
                      style={[styles.priorityPill, selected && styles.priorityPillSelected]}
                    >
                      <Text style={[styles.priorityPillText, selected && styles.selectedText]}>{option.label}</Text>
                    </Pressable>;
                  })}
                </View>
                {selectedOption ? <Text style={styles.helper}>{selectedOption.body}</Text> : null}
              </View>;
            })}
          </View>
        </ProductDisclosure>

        <ProductDisclosure
          title="3 · Tradeoffs"
          summary={tradeoff?.title ?? 'Use race defaults'}
          expanded={openSection === 'tradeoff'}
          onPress={() => setOpenSection(openSection === 'tradeoff' ? 'target' : 'tradeoff')}
        >
          <View style={styles.choiceStack}>
            {TRADEOFF_OPTIONS.map((option) => <ProductChoiceRow
              key={option.id}
              title={option.title}
              body={option.body}
              selected={intent.tradeoffTolerance === option.id}
              onPress={() => updateIntent({ tradeoffTolerance: option.id })}
            />)}
          </View>
        </ProductDisclosure>

        <ProductDisclosure
          title="4 · Target"
          summary={targetSummary(intent.primaryDiscipline, primaryTarget)}
          expanded={openSection === 'target'}
          onPress={() => setOpenSection(openSection === 'target' ? 'outcome' : 'target')}
        >
          {intent.primaryDiscipline ? <>
            <Text style={styles.helper}>Optional {disciplineLabel(intent.primaryDiscipline)} benchmark. This defines success; it does not directly prescribe volume or intensity.</Text>
            <View style={styles.chipRow}>
              {TARGET_OPTIONS.map((option) => <Pressable
                key={option.id}
                onPress={() => setTargetKind(option.id)}
                style={[styles.disciplineChip, primaryTarget?.kind === option.id && styles.disciplineChipSelected]}
              >
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
          </> : <Text style={styles.helper}>Choose a top discipline first if you want a split-, pace-, power-, speed-, PR-, or placement-specific target.</Text>}
        </ProductDisclosure>
      </View>
    </ProductSection>

    <View style={styles.summaryStrip}>
      <Text style={styles.summaryLabel}>WHAT SIDE QUEST WILL PROTECT</Text>
      <Text style={styles.summaryText}>One top focus at a time · race-specific discipline floors · recovery and safety ceilings · taper and race-week rules.</Text>
    </View>

    {error ? <Text style={styles.error}>{error}</Text> : null}
    {savedMessage ? <Text style={styles.success}>{savedMessage}</Text> : null}
    {busy ? <View style={styles.busy}><ActivityIndicator color={tokens.accent} /><Text style={styles.helper}>Reconciling the whole-athlete plan…</Text></View> : null}

    <View style={styles.actions}>
      <ProductAction label="Apply race priorities" onPress={() => void save()} disabled={busy} icon="check" />
      {editor.customized ? <ProductAction label="Use normal race defaults" onPress={() => void reset()} disabled={busy} variant="secondary" icon="" /> : null}
    </View>
    <Text style={styles.footnote}>Strategy Coach can later add date-scoped focus blocks on top of these race priorities. Race Intent remains the baseline underneath them.</Text>
  </V23Screen>;
}

function disciplineLabel(discipline: EnduranceDiscipline): string {
  if (discipline === 'swim') return 'Swim';
  if (discipline === 'bike') return 'Bike';
  return 'Run';
}

function focusSummary(intent: RaceIntentV2, disciplines: EnduranceDiscipline[]): string {
  return disciplines.map((discipline) => `${disciplineLabel(discipline)} · ${priorityLabel(intent.disciplinePriorities[discipline])}`).join('  •  ');
}

function priorityLabel(priority: CoachStrategyObjective | undefined): string {
  return PRIORITY_OPTIONS.find((option) => option.id === priority)?.label ?? 'Default';
}

function targetSummary(
  discipline: EnduranceDiscipline | undefined,
  target: RaceIntentV2['disciplineTargets'] extends infer Targets
    ? Targets extends Partial<Record<EnduranceDiscipline, infer Target>> ? Target | undefined : never
    : never,
): string {
  if (!discipline || !target) return 'Optional';
  const kind = TARGET_OPTIONS.find((option) => option.id === target.kind)?.label ?? target.kind;
  return `${disciplineLabel(discipline)} · ${kind}${target.value ? ` · ${target.value}` : ''}`;
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
    page: { paddingTop: 14, paddingBottom: 32, gap: 18 },
    headerRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backHit: { minHeight: 34, justifyContent: 'center', paddingRight: 12 },
    back: { color: tokens.accent, fontSize: 15, fontWeight: '800' },
    headerLabel: { color: tokens.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 1.05 },
    sheet: { borderRadius: 20, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, paddingHorizontal: 15, overflow: 'hidden' },
    choiceStack: { gap: 7 },
    helper: { color: tokens.textMuted, fontSize: 12, lineHeight: 17 },
    microLabel: { color: tokens.textMuted, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    disciplineChip: { minHeight: 36, borderRadius: 18, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
    disciplineChipSelected: { borderColor: tokens.accent, backgroundColor: tokens.accentSoft },
    disciplineChipText: { color: tokens.text, fontSize: 12.5, fontWeight: '800' },
    selectedText: { color: tokens.accent },
    disciplineList: { gap: 14, marginTop: 4 },
    disciplineBlock: { gap: 8, paddingTop: 2 },
    disciplineHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
    disciplineTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
    currentPriority: { color: tokens.accent, fontSize: 11.5, lineHeight: 16, fontWeight: '800' },
    priorityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    priorityPill: { minHeight: 36, minWidth: '46%', flexGrow: 1, borderRadius: 12, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surfaceMuted, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
    priorityPillSelected: { borderColor: tokens.accent, backgroundColor: tokens.accentSoft },
    priorityPillText: { color: tokens.text, fontSize: 11.5, lineHeight: 15, fontWeight: '800' },
    input: { minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surfaceMuted, color: tokens.text, paddingHorizontal: 13, fontSize: 14.5 },
    summaryStrip: { borderLeftWidth: 3, borderLeftColor: tokens.accent, paddingLeft: 12, gap: 3 },
    summaryLabel: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.85 },
    summaryText: { color: tokens.textMuted, fontSize: 12, lineHeight: 17 },
    actions: { gap: 8 },
    busy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    error: { color: tokens.danger, fontSize: 12.5, lineHeight: 18, fontWeight: '700' },
    success: { color: tokens.success, fontSize: 12.5, lineHeight: 18, fontWeight: '700' },
    footnote: { color: tokens.textMuted, fontSize: 11, lineHeight: 16, paddingBottom: 8 },
  });
}
