import type {
  EnduranceDiscipline,
  GoalTerrain,
  PerformanceGoalType,
  TrainingBlockLength,
  Weekday,
} from '@circuit/domain';
import type { CoachStrategyTradeoff } from '@circuit/planner/coach-semantic-frame';
import type { RaceOverallObjective, RaceTargetKind } from '@circuit/planner/race-intent';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  ProductAction,
  ProductChoiceRow,
  ProductDisclosure,
  ProductHero,
  ProductMetric,
  ProductSection,
} from '@/components/product-ui';
import { V23Chip, V23Icon, V23ScenicBanner, V23Screen } from '@/components/v23-ui';
import {
  buildAndSaveGoalSetup,
  goalSetupOption,
  GOAL_SETUP_OPTIONS,
  loadGoalSetupEnvironment,
  recommendedStrengthDoseForDraft,
  removeCurrentGoalSetup,
  resetDraftForGoal,
  suggestedBlockLength,
  validateGoalSetupDraft,
  weekdays,
  weeksUntilEvent,
  type GoalSetupDraft,
  type GoalSetupEnvironment,
  type GoalSetupRestriction,
} from '@/services/goal-setup-runtime';
import { useExerciseCatalog } from '@/services/exercise-catalog';
import { useOnboarding } from '@/state/onboarding-context';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

type SetupStep = 'goal' | 'outcome' | 'capacity' | 'setup' | 'review';
type GoalCategory = 'triathlon' | 'running' | 'trail' | 'performance';
const STEPS: SetupStep[] = ['goal', 'outcome', 'capacity', 'setup', 'review'];
const PLAN_LENGTHS: TrainingBlockLength[] = [1, 2, 4, 8, 12];
const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: 'M', tuesday: 'T', wednesday: 'W', thursday: 'T', friday: 'F', saturday: 'S', sunday: 'S',
};
const WEEKDAY_SHORT: Record<Weekday, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

const OUTCOMES: Array<{ id: RaceOverallObjective; title: string; body: string }> = [
  { id: 'finish_comfortably', title: 'Finish comfortably', body: 'Prepare to complete the event without spending extra training budget chasing performance.' },
  { id: 'strong_finish', title: 'Race strong', body: 'Build performance while keeping the overall plan broadly balanced.' },
  { id: 'best_overall', title: 'Best overall race', body: 'Optimize the complete result rather than one discipline in isolation.' },
  { id: 'specific_overall_time', title: 'Specific overall time', body: 'Use a concrete finish-time target as the race-level objective.' },
  { id: 'discipline_performance', title: 'Specific discipline performance', body: 'Give one discipline first claim on discretionary development.' },
  { id: 'placement_qualification', title: 'Placement / qualification', body: 'Treat placing or qualifying as the main competitive outcome.' },
];

const TRADEOFFS: Array<{ id: CoachStrategyTradeoff; title: string; body: string }> = [
  { id: 'preserve_balance', title: 'Keep the plan balanced', body: 'The focus matters, but the other race disciplines keep meaningful development.' },
  { id: 'moderate_tradeoff', title: 'Give my focus a clear advantage', body: 'Other disciplines can move toward maintenance so the focus gets more capacity.' },
  { id: 'aggressive_specialization', title: 'Push the focus hard', body: 'Other disciplines can consolidate toward protected race minimums.' },
];

const TARGETS: Array<{ id: RaceTargetKind; label: string }> = [
  { id: 'pr', label: 'PR' },
  { id: 'time', label: 'Split time' },
  { id: 'pace', label: 'Pace' },
  { id: 'power', label: 'Power' },
  { id: 'speed', label: 'Speed' },
  { id: 'placement', label: 'Placement' },
];

export default function GoalPlanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ goal?: string; onboarding?: string }>();
  const { exercises } = useExerciseCatalog();
  const onboarding = useOnboarding();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [environment, setEnvironment] = useState<GoalSetupEnvironment | null>(null);
  const [draft, setDraft] = useState<GoalSetupDraft | null>(null);
  const [step, setStep] = useState<SetupStep>('goal');
  const [goalCategory, setGoalCategory] = useState<GoalCategory>('triathlon');
  const [advancedCapacity, setAdvancedCapacity] = useState(false);
  const [keyDaysOpen, setKeyDaysOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const requestedGoal = parseGoalType(params.goal);
    void loadGoalSetupEnvironment(requestedGoal).then((next) => {
      if (!live) return;
      setEnvironment(next);
      setDraft(next.draft);
      setGoalCategory(goalSetupOption(next.draft.goalType).category);
    }).catch((caught) => {
      if (live) setError(caught instanceof Error ? caught.message : 'Side Quest could not load Goal Setup.');
    });
    return () => { live = false; };
  }, [params.goal]);

  if (!environment || !draft) {
    return <V23Screen contentStyle={styles.page}>
      <ProductHero eyebrow="GOAL SETUP" title="Loading your training setup…" body={error ?? 'Preparing the current plan, training capacity, equipment, and protection context.'} />
    </V23Screen>;
  }

  // Capture the successfully loaded setup state for event-handler closures.
  // React state remains nullable while loading, but everything below the guard
  // operates on a fully initialized Goal Setup environment and draft.
  const activeEnvironment = environment;
  const activeDraft = draft;

  const option = goalSetupOption(draft.goalType);
  const recommendation = recommendedStrengthDoseForDraft(draft);
  const weeks = weeksUntilEvent(draft);
  const stepIndex = STEPS.indexOf(step);
  const isRaceGoal = draft.goalType !== 'general_offseason' && option.disciplines.length > 0;

  function patch(next: Partial<GoalSetupDraft>) {
    setDraft((current) => current ? { ...current, ...next } : current);
    setError(null);
  }

  function chooseGoal(type: PerformanceGoalType) {
    setDraft((current) => current ? resetDraftForGoal(current, type) : current);
    setGoalCategory(goalSetupOption(type).category);
    setError(null);
  }

  function updateEventDate(eventDate: string) {
    setDraft((current) => {
      if (!current) return current;
      const candidate = { ...current, eventDate };
      const until = weeksUntilEvent(candidate);
      return { ...candidate, blockLength: until >= 0 ? suggestedBlockLength(Math.max(1, until)) : current.blockLength };
    });
    setError(null);
  }

  function toggleStrengthDay(day: Weekday) {
    setDraft((current) => {
      if (!current) return current;
      const selected = current.preferredStrengthDays.includes(day);
      return {
        ...current,
        preferredStrengthDays: selected
          ? current.preferredStrengthDays.filter((candidate) => candidate !== day)
          : [...current.preferredStrengthDays, day],
      };
    });
    setError(null);
  }

  function setKeyDay(discipline: EnduranceDiscipline, day: Weekday | null) {
    setDraft((current) => current ? {
      ...current,
      enduranceSchedule: {
        ...current.enduranceSchedule,
        ...(discipline === 'swim' ? { keySwim: day } : discipline === 'bike' ? { keyBike: day } : { keyRun: day }),
      },
    } : current);
    setError(null);
  }

  function chooseEquipment(profileId: string | undefined) {
    if (!profileId) {
      patch({ equipmentProfileId: undefined, equipment: ['bodyweight'] });
      return;
    }
    const profile = activeEnvironment.equipmentProfiles.find((candidate) => candidate.id === profileId);
    if (profile) patch({ equipmentProfileId: profile.id, equipment: profile.equipment });
  }

  function choosePrimaryDiscipline(primaryDiscipline: EnduranceDiscipline | undefined) {
    patch({ primaryDiscipline, disciplineTargetKind: primaryDiscipline ? activeDraft.disciplineTargetKind : undefined, disciplineTargetValue: primaryDiscipline ? activeDraft.disciplineTargetValue : undefined });
  }

  function goNext() {
    if (step === 'goal' && isRaceGoal && (!activeDraft.eventDate || weeks < 0)) {
      setError('Add a valid event date before continuing.');
      return;
    }
    if (step === 'capacity') {
      const capacityErrors = validateGoalSetupDraft(activeDraft).filter((item) => item.includes('capacity') || item.includes('endurance hours'));
      if (capacityErrors[0]) { setError(capacityErrors[0]); return; }
    }
    setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)] ?? 'review');
    setError(null);
  }

  function goBack() {
    if (stepIndex === 0) { router.back(); return; }
    setStep(STEPS[Math.max(0, stepIndex - 1)] ?? 'goal');
    setError(null);
  }

  async function buildPlan() {
    if (busy) return;
    const errors = validateGoalSetupDraft(activeDraft);
    if (errors[0]) { setError(errors[0]); return; }
    setBusy(true);
    setError(null);
    try {
      if (params.onboarding === '1') {
        onboarding.acknowledgeStrengthModel(true);
        onboarding.acknowledgePrivacyModel(true);
      }
      await buildAndSaveGoalSetup(activeDraft, exercises);
      if (params.onboarding === '1') await onboarding.complete();
      router.replace('/(tabs)/plan' as Href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Side Quest could not build this plan.');
    } finally {
      setBusy(false);
    }
  }

  async function removePlan() {
    if (busy) return;
    setBusy(true);
    try {
      await removeCurrentGoalSetup();
      router.replace('/goal-catalog' as Href);
    } finally {
      setBusy(false);
    }
  }

  return <V23Screen contentStyle={styles.page}>
    <V23ScenicBanner variant="goal" />
    <SetupProgress step={step} styles={styles} />

    {step === 'goal' ? <>
      <ProductHero
        eyebrow="1 · GOAL"
        title="What are you training toward?"
        body="Choose the event first. Side Quest will coordinate strength with the sport, race timeline, and the rest of your weekly training."
        tone="surface"
      />
      <View style={styles.categoryRow}>
        {([
          ['triathlon', 'Triathlon'], ['running', 'Road'], ['trail', 'Trail'], ['performance', 'Strength + swim'],
        ] as const).map(([id, label]) => <Pressable key={id} onPress={() => setGoalCategory(id)} style={[styles.category, goalCategory === id && styles.categorySelected]}>
          <Text style={[styles.categoryText, goalCategory === id && styles.categoryTextSelected]}>{label}</Text>
        </Pressable>)}
      </View>
      <View style={styles.choiceStack}>
        {GOAL_SETUP_OPTIONS.filter((goal) => goal.category === goalCategory).map((goal) => <ProductChoiceRow
          key={goal.type}
          title={goal.title}
          body={goal.description}
          selected={draft.goalType === goal.type}
          onPress={() => chooseGoal(goal.type)}
          icon="goal"
        />)}
      </View>

      <ProductSection title={draft.goalType === 'general_offseason' ? 'Training horizon' : 'Race timing'} body={draft.goalType === 'general_offseason' ? 'Choose how much of the strength block to generate now.' : 'The race date determines the phase and how much room the current block has to progress.'}>
        {draft.goalType !== 'general_offseason' ? <TextInput
          value={draft.eventDate ?? ''}
          onChangeText={updateEventDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={tokens.textMuted}
          keyboardType="numbers-and-punctuation"
          style={styles.largeInput}
        /> : null}
        <View style={styles.metricRow}>
          {draft.goalType !== 'general_offseason' && weeks >= 0 ? <ProductMetric label="to event" value={weeks === 0 ? 'Race week' : `${weeks} wk`} emphasis /> : null}
          <ProductMetric label="block" value={`${draft.blockLength} wk`} />
        </View>
        <Text style={styles.smallLabel}>BLOCK HORIZON</Text>
        <View style={styles.chipRow}>{PLAN_LENGTHS.map((length) => {
          const disabled = draft.goalType !== 'general_offseason' && weeks >= 0 && length > Math.max(1, weeks);
          return <ChoiceChip key={length} label={`${length} wk`} selected={draft.blockLength === length} disabled={disabled} onPress={() => patch({ blockLength: length })} styles={styles} />;
        })}</View>
        {supportsTerrain(draft.goalType) ? <>
          <Text style={styles.smallLabel}>COURSE PROFILE</Text>
          <View style={styles.chipRow}>{(['flat', 'rolling', 'hilly', 'mountainous', 'technical_trail'] as GoalTerrain[]).filter((terrain) => allowsTechnicalTerrain(draft.goalType) || terrain !== 'technical_trail').map((terrain) => <ChoiceChip key={terrain} label={formatLabel(terrain)} selected={draft.terrain === terrain} onPress={() => patch({ terrain })} styles={styles} />)}</View>
        </> : null}
      </ProductSection>
    </> : null}

    {step === 'outcome' ? <OutcomeStep draft={draft} disciplines={option.disciplines} patch={patch} choosePrimary={choosePrimaryDiscipline} styles={styles} tokens={tokens} /> : null}

    {step === 'capacity' ? <>
      <ProductHero eyebrow="3 · WEEKLY CAPACITY" title="Start with the week you can actually sustain." body="Side Quest uses total training time and current endurance load to recommend—not maximize—the strength dose." tone="surface" />
      <View style={styles.capacityHero}>
        <View style={styles.capacityNumber}><Text style={styles.capacityValue}>{draft.totalWeeklyHours}</Text><Text style={styles.capacityUnit}>hr/week available</Text></View>
        <Stepper value={draft.totalWeeklyHours} min={3} max={25} onChange={(totalWeeklyHours) => patch({ totalWeeklyHours, currentEnduranceHours: Math.min(draft.currentEnduranceHours, totalWeeklyHours) })} styles={styles} />
      </View>
      <ProductSection title="Current endurance load" body="How many of those hours are already swim, bike, run, or other endurance work?">
        <View style={styles.capacityInline}>
          <Text style={styles.capacityInlineValue}>{draft.currentEnduranceHours} hr/week</Text>
          <Stepper value={draft.currentEnduranceHours} min={0} max={draft.totalWeeklyHours} onChange={(currentEnduranceHours) => patch({ currentEnduranceHours })} styles={styles} small />
        </View>
      </ProductSection>
      <View style={styles.recommendation}>
        <View style={styles.recommendationIcon}><V23Icon name="train" color={tokens.accent} size={20} /></View>
        <View style={styles.recommendationCopy}>
          <Text style={styles.smallLabel}>RECOMMENDED STARTING DOSE</Text>
          <Text style={styles.recommendationTitle}>{recommendation.sessionsPerWeek} strength sessions · {recommendation.minutesPerWeek} min/week</Text>
          <Text style={styles.recommendationBody}>{recommendation.trainingBudget.strength.hours}h strength inside a {draft.totalWeeklyHours}h weekly budget · {recommendation.weeklyAllocationHours.recoveryMargin}h recovery margin.</Text>
        </View>
      </View>
      <ProductSection title="Current running status" body="Running and impact progression are treated separately from general endurance fitness.">
        <View style={styles.choiceStack}>
          {([
            ['normal', 'Running normally'], ['reduced', 'Running less than usual'], ['return_to_run', 'Returning to running'], ['not_running', 'Not currently running'],
          ] as const).map(([id, title]) => <ProductChoiceRow key={id} title={title} selected={draft.runStatus === id} onPress={() => patch({ runStatus: id })} />)}
        </View>
      </ProductSection>
      <ProductDisclosure title="Athlete context" summary="Experience, mileage history, and bone-stress history refine the starting dose." expanded={advancedCapacity} onPress={() => setAdvancedCapacity((value) => !value)}>
        <Text style={styles.smallLabel}>HIGHEST RUN MILEAGE · LAST 12 WEEKS</Text>
        <View style={styles.capacityInline}><Text style={styles.capacityInlineValue}>{draft.maxRunMilesLast12Weeks} mi/week</Text><Stepper value={draft.maxRunMilesLast12Weeks} min={0} max={120} onChange={(maxRunMilesLast12Weeks) => patch({ maxRunMilesLast12Weeks })} styles={styles} small /></View>
        <CompactChoice title="BONE-STRESS HISTORY" value={draft.boneStressInjuryHistory} options={[['none', 'None'], ['remote', 'Past history'], ['recent_or_current', 'Recent/current']]} onChange={(boneStressInjuryHistory) => patch({ boneStressInjuryHistory })} styles={styles} />
        {option.disciplines.includes('swim') ? <CompactChoice title="SWIM EXPERIENCE" value={draft.swimProficiency} options={[['developing', 'Developing'], ['average', 'Established'], ['strong', 'Strong']]} onChange={(swimProficiency) => patch({ swimProficiency })} styles={styles} /> : null}
        {option.disciplines.includes('bike') ? <CompactChoice title="BIKE EXPERIENCE" value={draft.bikeProficiency} options={[['developing', 'Developing'], ['average', 'Established'], ['strong', 'Strong']]} onChange={(bikeProficiency) => patch({ bikeProficiency })} styles={styles} /> : null}
        {option.disciplines.includes('run') ? <CompactChoice title="RUN EXPERIENCE" value={draft.runProficiency} options={[['developing', 'Developing'], ['average', 'Established'], ['strong', 'Strong']]} onChange={(runProficiency) => patch({ runProficiency })} styles={styles} /> : null}
        <CompactChoice title="STRENGTH EXPERIENCE" value={draft.strengthExperience} options={[['beginner', 'New'], ['intermediate', 'Some experience'], ['advanced', 'Experienced']]} onChange={(strengthExperience) => patch({ strengthExperience })} styles={styles} />
      </ProductDisclosure>
    </> : null}

    {step === 'setup' ? <>
      <ProductHero eyebrow="4 · SCHEDULE + SETUP" title="Give the planner realistic places to put the work." body="Choose days that could work, the equipment you normally have, and any protection context that should constrain the first block." tone="surface" />
      <ProductSection title="Strength-day options" body={`Side Quest currently recommends ${recommendation.sessionsPerWeek} sessions. Choose at least that many realistic days; it may use fewer than the days you make available.`}>
        <View style={styles.dayRow}>{weekdays().map((day) => <Pressable key={day} onPress={() => toggleStrengthDay(day)} style={[styles.day, draft.preferredStrengthDays.includes(day) && styles.daySelected]}>
          <Text style={[styles.dayText, draft.preferredStrengthDays.includes(day) && styles.dayTextSelected]}>{WEEKDAY_LABELS[day]}</Text>
          <Text style={[styles.daySub, draft.preferredStrengthDays.includes(day) && styles.dayTextSelected]}>{WEEKDAY_SHORT[day]}</Text>
        </Pressable>)}</View>
      </ProductSection>
      <ProductSection title="Training location" body="Use a saved equipment location. You can refine individual equipment later without rebuilding the race strategy.">
        <View style={styles.choiceStack}>
          {environment.equipmentProfiles.map((profile) => <ProductChoiceRow key={profile.id} title={profile.name} body={`${profile.equipment.length} equipment options`} selected={draft.equipmentProfileId === profile.id} onPress={() => chooseEquipment(profile.id)} icon="equipment" />)}
          <ProductChoiceRow title="Bodyweight only" body="No equipment required." selected={!draft.equipmentProfileId && draft.equipment.length === 1 && draft.equipment[0] === 'bodyweight'} onPress={() => chooseEquipment(undefined)} icon="equipment" />
        </View>
      </ProductSection>
      {option.disciplines.length ? <ProductDisclosure title="Key endurance days" summary={keyDaySummary(draft, option.disciplines)} expanded={keyDaysOpen} onPress={() => setKeyDaysOpen((value) => !value)}>
        {option.disciplines.map((discipline) => <View key={discipline} style={styles.keyDayBlock}>
          <Text style={styles.smallLabel}>KEY {discipline.toUpperCase()} DAY</Text>
          <View style={styles.chipRow}>
            <ChoiceChip label="None" selected={!keyDayFor(draft, discipline)} onPress={() => setKeyDay(discipline, null)} styles={styles} />
            {weekdays().map((day) => <ChoiceChip key={day} label={WEEKDAY_SHORT[day]} selected={keyDayFor(draft, discipline) === day} onPress={() => setKeyDay(discipline, day)} styles={styles} />)}
          </View>
        </View>)}
      </ProductDisclosure> : null}
      <ProductSection title="Anything to protect right now?" body="This is a conservative first-block filter, not a diagnosis. Any active PT profile and today’s check-in are also applied automatically.">
        <View style={styles.choiceStack}>
          {([
            ['none', 'Nothing extra', 'Use the existing PT/check-in context only.'],
            ['lower_body', 'Lower body', 'Conservatively exclude direct lower-body loading in the generated strength block.'],
            ['upper_body', 'Upper body', 'Conservatively exclude direct pressing/pulling regions in the generated strength block.'],
            ['back', 'Back / trunk', 'Conservatively reduce direct lower-back and rotational loading.'],
            ['other', 'Something else', 'Build from the saved PT/check-in profile; refine the specific restriction before training.'],
          ] as Array<[GoalSetupRestriction, string, string]>).map(([id, title, body]) => <ProductChoiceRow key={id} title={title} body={body} selected={draft.restriction === id} onPress={() => patch({ restriction: id })} icon="heart" />)}
        </View>
        {environment.ptProfile?.active ? <Text style={styles.contextNote}>Active PT profile will also be applied: {environment.ptProfile.conditions.length ? environment.ptProfile.conditions.map((condition) => condition.name).join(' · ') : 'saved movement restrictions'}.</Text> : null}
        {environment.activeCheckIn ? <Text style={styles.contextNote}>Today’s check-in is active through {formatDate(environment.activeCheckIn.activeUntil.slice(0, 10))} and will be layered on top.</Text> : null}
      </ProductSection>
    </> : null}

    {step === 'review' ? <ReviewStep draft={draft} environment={environment} recommendation={recommendation} option={option} styles={styles} tokens={tokens} /> : null}

    {error ? <View style={styles.errorBox}><V23Icon name="info" color={tokens.danger} size={17} /><Text style={styles.errorText}>{error}</Text></View> : null}

    <View style={styles.navActions}>
      <ProductAction label={stepIndex === 0 ? 'Back' : 'Previous'} onPress={goBack} variant="secondary" icon="back" disabled={busy} />
      {step === 'review'
        ? <View style={styles.buildAction}><Pressable disabled={busy || exercises.length === 0} onPress={() => void buildPlan()} style={({ pressed }) => [styles.buildButton, (busy || exercises.length === 0) && styles.disabled, pressed && styles.pressed]}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.buildButtonText}>{environment.existingBlock ? 'Apply and rebuild plan' : 'Build my plan'}</Text><V23Icon name="check" color="#FFFFFF" size={18} /></>}
          </Pressable></View>
        : <ProductAction label="Continue" onPress={goNext} icon="chevron" />}
    </View>

    {step === 'review' && environment.existingBlock && params.onboarding !== '1' ? <Pressable onPress={() => Alert.alert('Remove current plan?', 'Future planned sessions and the active goal will be removed. Completed workout history is kept.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove plan', style: 'destructive', onPress: () => void removePlan() }])} style={styles.removePlan}><Text style={styles.removePlanText}>Remove current goal plan</Text></Pressable> : null}
  </V23Screen>;
}

function OutcomeStep({ draft, disciplines, patch, choosePrimary, styles, tokens }: {
  draft: GoalSetupDraft;
  disciplines: EnduranceDiscipline[];
  patch: (next: Partial<GoalSetupDraft>) => void;
  choosePrimary: (discipline: EnduranceDiscipline | undefined) => void;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  if (draft.goalType === 'general_offseason' || !disciplines.length) return <>
    <ProductHero eyebrow="2 · TRAINING INTENT" title="What should this block optimize?" body="For offseason strength, the race-specific allocation layer is not needed. Side Quest will use the weekly capacity and athlete context you enter next." tone="surface" />
    <View style={styles.infoPanel}><V23Icon name="train" color={tokens.accent} size={20} /><Text style={styles.infoText}>This block will prioritize broad strength development while respecting the weekly time budget and any saved restrictions.</Text></View>
  </>;

  const primaryTarget = draft.primaryDiscipline && draft.disciplineTargetKind;
  return <>
    <ProductHero eyebrow="2 · RACE OUTCOME" title="What matters most at this race?" body="This becomes the durable race strategy beneath temporary Strategy Coach blocks." tone="surface" />
    <ProductSection title="Overall objective">
      <View style={styles.choiceStack}>{OUTCOMES.map((option) => <ProductChoiceRow key={option.id} title={option.title} body={option.body} selected={draft.overallObjective === option.id} onPress={() => patch({ overallObjective: option.id })} icon="goal" />)}</View>
      {draft.overallObjective === 'specific_overall_time' ? <TextInput value={draft.overallTarget ?? ''} onChangeText={(overallTarget) => patch({ overallTarget })} placeholder="Example: 5:15:00" placeholderTextColor={tokens.textMuted} style={styles.largeInput} /> : null}
    </ProductSection>
    <ProductSection title="Where should extra development go?" body="Only one discipline can hold the top focus. Choose Balanced if the overall result matters more than a specific split.">
      <View style={styles.chipRow}>
        {disciplines.length > 1 ? <ChoiceChip label="Balanced" selected={!draft.primaryDiscipline} onPress={() => choosePrimary(undefined)} styles={styles} /> : null}
        {disciplines.map((discipline) => <ChoiceChip key={discipline} label={disciplineLabel(discipline)} selected={draft.primaryDiscipline === discipline} onPress={() => choosePrimary(discipline)} styles={styles} />)}
      </View>
      {draft.primaryDiscipline ? <View style={styles.focusLevelRow}>
        <ProductChoiceRow title="Primary focus" body="Give this discipline first claim on discretionary progression." selected={draft.focusLevel === 'primary_focus'} onPress={() => patch({ focusLevel: 'primary_focus' })} />
        <ProductChoiceRow title="Maximize" body="Push it as far as time, recovery, race floors, and safety ceilings allow." selected={draft.focusLevel === 'maximize'} onPress={() => patch({ focusLevel: 'maximize' })} />
      </View> : null}
    </ProductSection>
    {disciplines.length > 1 && draft.primaryDiscipline ? <ProductSection title="How much tradeoff is acceptable?">
      <View style={styles.choiceStack}>{TRADEOFFS.map((option) => <ProductChoiceRow key={option.id} title={option.title} body={option.body} selected={draft.tradeoffTolerance === option.id} onPress={() => patch({ tradeoffTolerance: option.id })} />)}</View>
    </ProductSection> : null}
    {draft.primaryDiscipline ? <ProductDisclosure title={`Optional ${disciplineLabel(draft.primaryDiscipline)} target`} summary={primaryTarget ? `${targetLabel(draft.disciplineTargetKind!)}${draft.disciplineTargetValue ? ` · ${draft.disciplineTargetValue}` : ''}` : 'No specific split target'} expanded={Boolean(draft.disciplineTargetKind)} onPress={() => patch({ disciplineTargetKind: draft.disciplineTargetKind ? undefined : 'pr', disciplineTargetValue: draft.disciplineTargetKind ? undefined : draft.disciplineTargetValue })}>
      <View style={styles.chipRow}>{TARGETS.map((target) => <ChoiceChip key={target.id} label={target.label} selected={draft.disciplineTargetKind === target.id} onPress={() => patch({ disciplineTargetKind: target.id })} styles={styles} />)}</View>
      {draft.disciplineTargetKind && draft.disciplineTargetKind !== 'pr' ? <TextInput value={draft.disciplineTargetValue ?? ''} onChangeText={(disciplineTargetValue) => patch({ disciplineTargetValue })} placeholder={targetPlaceholder(draft.disciplineTargetKind)} placeholderTextColor={tokens.textMuted} style={styles.largeInput} /> : null}
    </ProductDisclosure> : null}
  </>;
}

function ReviewStep({ draft, environment, recommendation, option, styles, tokens }: {
  draft: GoalSetupDraft;
  environment: GoalSetupEnvironment;
  recommendation: ReturnType<typeof recommendedStrengthDoseForDraft>;
  option: ReturnType<typeof goalSetupOption>;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  const weeks = weeksUntilEvent(draft);
  const raceSummary = draft.goalType === 'general_offseason'
    ? 'Broad strength development'
    : `${outcomeLabel(draft.overallObjective)}${draft.primaryDiscipline ? ` · ${disciplineLabel(draft.primaryDiscipline)} ${formatLabel(draft.focusLevel)}` : ' · balanced development'}`;
  return <>
    <ProductHero
      eyebrow="5 · REVIEW"
      title={environment.existingBlock ? 'Ready to rebuild the plan.' : 'Ready to build the plan.'}
      body="This is the small set of inputs Side Quest will treat as authoritative. The planner still decides the exact weekly distribution under phase, recovery, and safety constraints."
      meta={<>
        <ProductMetric label="weekly capacity" value={`${draft.totalWeeklyHours}h`} emphasis />
        <ProductMetric label="strength" value={`${recommendation.sessionsPerWeek}×`} />
        <ProductMetric label="block" value={`${draft.blockLength} wk`} />
        {draft.goalType !== 'general_offseason' && weeks >= 0 ? <ProductMetric label="to event" value={`${weeks} wk`} /> : null}
      </>}
    />
    <ProductSection eyebrow="GOAL" title={option.title} body={draft.goalType === 'general_offseason' ? 'No race date.' : `${formatDate(draft.eventDate!)} · ${formatLabel(draft.terrain)} course`}>
      <ReviewRow label="Outcome" value={raceSummary} styles={styles} />
      {draft.overallTarget ? <ReviewRow label="Overall target" value={draft.overallTarget} styles={styles} /> : null}
      {draft.primaryDiscipline && draft.disciplineTargetKind ? <ReviewRow label={`${disciplineLabel(draft.primaryDiscipline)} target`} value={`${targetLabel(draft.disciplineTargetKind)}${draft.disciplineTargetValue ? ` · ${draft.disciplineTargetValue}` : ''}`} styles={styles} /> : null}
    </ProductSection>
    <ProductSection eyebrow="WEEK" title={`${recommendation.sessionsPerWeek} strength sessions · ${recommendation.minutesPerWeek} min/week`} body={`Current endurance: ${draft.currentEnduranceHours}h/week · Recovery margin: ${recommendation.weeklyAllocationHours.recoveryMargin}h`}>
      <ReviewRow label="Strength can fit" value={sortDays(draft.preferredStrengthDays).map((day) => WEEKDAY_SHORT[day]).join(' · ')} styles={styles} />
      <ReviewRow label="Key endurance" value={keyDaySummary(draft, option.disciplines)} styles={styles} />
    </ProductSection>
    <ProductSection eyebrow="SETUP" title={environment.equipmentProfiles.find((profile) => profile.id === draft.equipmentProfileId)?.name ?? 'Bodyweight only'} body={`${draft.equipment.length} equipment option${draft.equipment.length === 1 ? '' : 's'} available to the generator.`}>
      <ReviewRow label="Protection" value={restrictionLabel(draft.restriction)} styles={styles} />
      <ReviewRow label="Run status" value={formatLabel(draft.runStatus)} styles={styles} />
      <ReviewRow label="Strength experience" value={formatLabel(draft.strengthExperience)} styles={styles} />
    </ProductSection>
    <View style={styles.principles}><V23Icon name="heart" color={tokens.accent} size={18} /><View style={styles.principlesCopy}><Text style={styles.principlesTitle}>Planner guardrails remain in force.</Text><Text style={styles.principlesBody}>Race priorities do not override recovery, injury/protection context, fixed commitments, taper/race-week rules, or the total weekly time budget. Side Quest does not diagnose injuries or infer medical clearance.</Text></View></View>
  </>;
}

function SetupProgress({ step, styles }: { step: SetupStep; styles: ReturnType<typeof makeStyles> }) {
  const current = STEPS.indexOf(step);
  return <View style={styles.progressRow}>{STEPS.map((candidate, index) => <View key={candidate} style={[styles.progressSegment, index <= current && styles.progressSegmentActive]} />)}</View>;
}

function Stepper({ value, min, max, onChange, styles, small = false }: { value: number; min: number; max: number; onChange: (value: number) => void; styles: ReturnType<typeof makeStyles>; small?: boolean }) {
  return <View style={[styles.stepper, small && styles.stepperSmall]}>
    <Pressable onPress={() => onChange(Math.max(min, value - 1))} style={styles.stepperButton}><Text style={styles.stepperButtonText}>−</Text></Pressable>
    <Pressable onPress={() => onChange(Math.min(max, value + 1))} style={styles.stepperButton}><Text style={styles.stepperButtonText}>+</Text></Pressable>
  </View>;
}

function CompactChoice<T extends string>({ title, value, options, onChange, styles }: { title: string; value: T; options: Array<[T, string]>; onChange: (value: T) => void; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.compactChoice}><Text style={styles.smallLabel}>{title}</Text><View style={styles.chipRow}>{options.map(([id, label]) => <ChoiceChip key={id} label={label} selected={value === id} onPress={() => onChange(id)} styles={styles} />)}</View></View>;
}

function ChoiceChip({ label, selected, onPress, styles, disabled = false }: { label: string; selected: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles>; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.chip, selected && styles.chipSelected, disabled && styles.disabled]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>;
}

function ReviewRow({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.reviewRow}><Text style={styles.reviewLabel}>{label}</Text><Text style={styles.reviewValue}>{value}</Text></View>;
}

function keyDayFor(draft: GoalSetupDraft, discipline: EnduranceDiscipline): Weekday | null | undefined {
  return discipline === 'swim' ? draft.enduranceSchedule.keySwim : discipline === 'bike' ? draft.enduranceSchedule.keyBike : draft.enduranceSchedule.keyRun;
}

function keyDaySummary(draft: GoalSetupDraft, disciplines: EnduranceDiscipline[]): string {
  if (!disciplines.length) return 'No endurance key days';
  return disciplines.map((discipline) => {
    const day = keyDayFor(draft, discipline);
    return `${disciplineLabel(discipline)} ${day ? WEEKDAY_SHORT[day] : 'flexible'}`;
  }).join(' · ');
}

function restrictionLabel(value: GoalSetupRestriction): string {
  if (value === 'none') return 'Existing PT/check-in context only';
  if (value === 'lower_body') return 'Conservative lower-body filter';
  if (value === 'upper_body') return 'Conservative upper-body filter';
  if (value === 'back') return 'Conservative back/trunk filter';
  return 'Use saved PT/check-in context; refine before training';
}

function outcomeLabel(value: RaceOverallObjective): string {
  return OUTCOMES.find((option) => option.id === value)?.title ?? formatLabel(value);
}

function disciplineLabel(value: EnduranceDiscipline): string {
  if (value === 'swim') return 'Swim';
  if (value === 'bike') return 'Bike';
  return 'Run';
}

function targetLabel(value: RaceTargetKind): string {
  return TARGETS.find((target) => target.id === value)?.label ?? formatLabel(value);
}

function targetPlaceholder(kind: RaceTargetKind): string {
  if (kind === 'time') return 'Example: 2:35:00';
  if (kind === 'pace') return 'Example: 7:30/mi or 1:45/100m';
  if (kind === 'power') return 'Example: 210 W';
  if (kind === 'speed') return 'Example: 20 mph';
  if (kind === 'placement') return 'Example: top 10 age group';
  return 'Optional target';
}

function supportsTerrain(type: PerformanceGoalType): boolean {
  return type !== 'swim_speed' && type !== 'general_offseason';
}

function allowsTechnicalTerrain(type: PerformanceGoalType): boolean {
  return type === 'trail_50k' || type === 'trail_100k' || type === 'swimrun';
}

function parseGoalType(value: string | undefined): PerformanceGoalType | undefined {
  return GOAL_SETUP_OPTIONS.some((option) => option.type === value) ? value as PerformanceGoalType : undefined;
}

function sortDays(days: Weekday[]): Weekday[] {
  const order = weekdays();
  return [...days].sort((left, right) => order.indexOf(left) - order.indexOf(right));
}

function formatLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { gap: 20, paddingTop: 0, paddingBottom: 36 },
    progressRow: { flexDirection: 'row', gap: 5, paddingHorizontal: 2 },
    progressSegment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: tokens.border },
    progressSegmentActive: { backgroundColor: tokens.accent },
    categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    category: { minHeight: 36, borderRadius: 18, paddingHorizontal: 12, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
    categorySelected: { backgroundColor: tokens.header, borderColor: tokens.header },
    categoryText: { color: tokens.textMuted, fontSize: 12.5, fontWeight: '800' },
    categoryTextSelected: { color: '#FFFFFF' },
    choiceStack: { gap: 8 },
    largeInput: { minHeight: 49, borderRadius: 14, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, color: tokens.text, paddingHorizontal: 14, fontSize: 16, fontWeight: '700' },
    metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    smallLabel: { color: tokens.textMuted, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0.85 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    chip: { minHeight: 37, borderRadius: 19, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
    chipSelected: { borderColor: tokens.accent, backgroundColor: tokens.accentSoft },
    chipText: { color: tokens.textMuted, fontSize: 12.5, fontWeight: '800' },
    chipTextSelected: { color: tokens.accent },
    focusLevelRow: { gap: 8, marginTop: 4 },
    capacityHero: { borderRadius: 22, backgroundColor: tokens.header, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
    capacityNumber: { flex: 1 },
    capacityValue: { color: '#FFFFFF', fontSize: 43, lineHeight: 48, fontWeight: '900', letterSpacing: -1.1 },
    capacityUnit: { color: '#D9E3EA', fontSize: 13, lineHeight: 18, fontWeight: '700' },
    stepper: { flexDirection: 'row', gap: 8 },
    stepperSmall: { flexShrink: 0 },
    stepperButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: tokens.border },
    stepperButtonText: { color: tokens.accent, fontSize: 23, lineHeight: 26, fontWeight: '800' },
    capacityInline: { minHeight: 58, borderRadius: 16, backgroundColor: tokens.surfaceMuted, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    capacityInlineValue: { color: tokens.text, fontSize: 18, fontWeight: '900' },
    recommendation: { borderRadius: 18, backgroundColor: tokens.accentSoft, padding: 15, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
    recommendationIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
    recommendationCopy: { flex: 1, gap: 3 },
    recommendationTitle: { color: tokens.text, fontSize: 17, lineHeight: 22, fontWeight: '900' },
    recommendationBody: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18 },
    compactChoice: { gap: 7 },
    dayRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
    day: { flex: 1, minWidth: 38, height: 56, borderRadius: 15, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center', gap: 1 },
    daySelected: { backgroundColor: tokens.header, borderColor: tokens.header },
    dayText: { color: tokens.text, fontSize: 15, lineHeight: 18, fontWeight: '900' },
    daySub: { color: tokens.textMuted, fontSize: 8.5, lineHeight: 11, fontWeight: '800' },
    dayTextSelected: { color: '#FFFFFF' },
    keyDayBlock: { gap: 7 },
    contextNote: { color: tokens.textMuted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
    reviewRow: { minHeight: 46, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, paddingVertical: 10, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
    reviewLabel: { color: tokens.textMuted, fontSize: 12, lineHeight: 17, fontWeight: '800' },
    reviewValue: { flex: 1, color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '800', textAlign: 'right' },
    principles: { borderRadius: 16, backgroundColor: tokens.surfaceMuted, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    principlesCopy: { flex: 1, gap: 3 },
    principlesTitle: { color: tokens.text, fontSize: 14, lineHeight: 19, fontWeight: '900' },
    principlesBody: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 17 },
    infoPanel: { borderRadius: 18, backgroundColor: tokens.accentSoft, padding: 16, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    infoText: { flex: 1, color: tokens.text, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
    errorBox: { borderRadius: 14, backgroundColor: tokens.surfaceMuted, borderWidth: 1, borderColor: tokens.danger, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    errorText: { flex: 1, color: tokens.danger, fontSize: 12.5, lineHeight: 18, fontWeight: '700' },
    navActions: { flexDirection: 'row', gap: 9, alignItems: 'stretch' },
    buildAction: { flex: 1 },
    buildButton: { minHeight: 48, borderRadius: 14, backgroundColor: tokens.accent, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    buildButtonText: { color: '#FFFFFF', fontSize: 14.5, lineHeight: 19, fontWeight: '900' },
    removePlan: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
    removePlanText: { color: tokens.danger, fontSize: 12.5, fontWeight: '800' },
    disabled: { opacity: 0.4 },
    pressed: { opacity: 0.76 },
  });
}
