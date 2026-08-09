import type { Exercise, PTProfile, TrainingCheckIn } from '@circuit/domain';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ExerciseDemoModal } from '@/components/exercise-demo-modal';
import { ProductDisclosure } from '@/components/product-ui';
import { V23Icon, V23Screen } from '@/components/v23-ui';
import {
  getActiveTrainingCheckIn,
  getLatestPTProfile,
  getLatestTrainingBlock,
  listWorkoutLedgerEntries,
  saveCompletedWorkout,
  type LoggedSet,
} from '@/services/database';
import { useExerciseCatalog } from '@/services/exercise-catalog';
import {
  buildMachineStrengthWorkout,
  isMachineStrengthWorkout,
  type MachineStrengthAvailability,
  type MachineStrengthWorkout,
} from '@/services/machine-strength';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

type SetState = Record<string, boolean[]>;
type RepState = Record<string, string[]>;
type LoadState = Record<string, string>;

export default function MachineStrengthScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { exercises } = useExerciseCatalog();
  const [availability, setAvailability] = useState<MachineStrengthAvailability>({ selectorizedMachines: true, legPress: true });
  const [ptProfile, setPtProfile] = useState<PTProfile | null>(null);
  const [checkIn, setCheckIn] = useState<TrainingCheckIn | null>(null);
  const [workout, setWorkout] = useState<MachineStrengthWorkout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentMachineSession, setRecentMachineSession] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState<string | null>(null);
  const [completedSets, setCompletedSets] = useState<SetState>({});
  const [reps, setReps] = useState<RepState>({});
  const [loads, setLoads] = useState<LoadState>({});
  const [loadUnit, setLoadUnit] = useState<'lb' | 'kg'>('lb');
  const [startedAt] = useState(() => new Date().toISOString());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [demoExercise, setDemoExercise] = useState<Exercise | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    let live = true;
    void Promise.all([
      getLatestPTProfile(),
      getActiveTrainingCheckIn(),
      listWorkoutLedgerEntries({ from: sevenDaysAgo(), limit: 250 }),
      getLatestTrainingBlock(),
    ]).then(([pt, activeCheckIn, ledger, block]) => {
      if (!live) return;
      setPtProfile(pt);
      setCheckIn(activeCheckIn);
      setRecentMachineSession(ledger.some((entry) => isMachineStrengthWorkout(entry.workout)));
      const today = localDate();
      const currentWeek = block?.block.weeks
        .filter((week) => week.weekStartDate <= today)
        .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))[0]
        ?? block?.block.weeks[0];
      setPhaseLabel(currentWeek?.phase ? currentWeek.phase.replaceAll('_', ' ') : null);
      installWorkout(exercises, availability, pt, activeCheckIn);
    }).catch((cause) => {
      if (live) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { live = false; };
    // Exercise catalog seed is immediately available; custom content reloads do not
    // need to replace a machine session that is already in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function installWorkout(
    catalog = exercises,
    nextAvailability = availability,
    pt = ptProfile,
    activeCheckIn = checkIn,
  ) {
    const result = buildMachineStrengthWorkout({
      exercises: catalog,
      availability: nextAvailability,
      ptProfile: pt,
      checkIn: activeCheckIn,
      seed: `${localDate()}:${Date.now()}`,
    });
    if (!result.ok) {
      setError(result.reason);
      setWorkout(null);
      return;
    }
    setWorkout(result.workout);
    setError(null);
    setSaved(false);
    const complete: SetState = {};
    const nextReps: RepState = {};
    for (const item of flattenedExercises(result.workout)) {
      complete[item.exerciseId] = Array(result.workout.machineStrength.setsPerExercise).fill(false);
      nextReps[item.exerciseId] = Array(result.workout.machineStrength.setsPerExercise).fill(String(item.target));
    }
    setCompletedSets(complete);
    setReps(nextReps);
    setLoads({});
  }

  function updateAvailability(key: keyof MachineStrengthAvailability) {
    setAvailability((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleSet(exerciseId: string, setIndex: number) {
    setCompletedSets((current) => ({
      ...current,
      [exerciseId]: (current[exerciseId] ?? []).map((value, index) => index === setIndex ? !value : value),
    }));
  }

  function updateReps(exerciseId: string, setIndex: number, value: string) {
    setReps((current) => ({
      ...current,
      [exerciseId]: (current[exerciseId] ?? []).map((item, index) => index === setIndex ? value.replace(/[^0-9]/g, '') : item),
    }));
  }

  async function finishSession() {
    if (!workout || saving) return;
    const items = flattenedExercises(workout);
    const expectedSets = items.length * workout.machineStrength.setsPerExercise;
    const finishedSets = items.reduce((sum, item) => sum + (completedSets[item.exerciseId] ?? []).filter(Boolean).length, 0);
    if (finishedSets === 0) {
      setError('Mark at least one completed set before saving the session.');
      return;
    }

    const exerciseSets: Record<string, LoggedSet[]> = {};
    const exerciseLoads: Record<string, { value: number; unit: 'lb' | 'kg'; name: string }> = {};
    for (const item of items) {
      const load = Number(loads[item.exerciseId]);
      const sets = completedSets[item.exerciseId] ?? [];
      exerciseSets[item.exerciseId] = sets.flatMap((complete, setIndex) => {
        if (!complete) return [];
        const repCount = Number(reps[item.exerciseId]?.[setIndex] ?? item.target);
        return [{
          id: `${workout.id}_${item.exerciseId}_set_${setIndex + 1}`,
          reps: Number.isFinite(repCount) && repCount > 0 ? repCount : item.target,
          loadValue: Number.isFinite(load) && load > 0 ? load : undefined,
          loadUnit: Number.isFinite(load) && load > 0 ? loadUnit : undefined,
          loadBasis: 'total' as const,
          completed: true,
        }];
      });
      if (Number.isFinite(load) && load > 0) {
        exerciseLoads[item.exerciseId] = { value: load, unit: loadUnit, name: item.exerciseSnapshot.name };
      }
    }

    const stationRounds: Record<string, number> = {};
    for (const station of workout.stations) {
      const setCounts = station.exercises.map((item) => (completedSets[item.exerciseId] ?? []).filter(Boolean).length);
      stationRounds[station.id] = setCounts.length ? Math.min(...setCounts) : 0;
    }

    setSaving(true);
    setError(null);
    try {
      await saveCompletedWorkout({
        workout,
        startedAt,
        completedAt: new Date().toISOString(),
        completionFraction: Math.max(0, Math.min(1, finishedSets / expectedSets)),
        stationRounds,
        exerciseLoads,
        exerciseSets,
        notes: 'Set-based supplemental machine strength session.',
        ledgerSource: 'side_quest',
        relationToPlan: 'additional',
      });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  if (saved && workout) {
    return <V23Screen contentStyle={styles.page}>
      <View style={styles.savedCard}>
        <View style={styles.savedIcon}><V23Icon name="check" color="#FFFFFF" size={22} /></View>
        <Text style={styles.savedEyebrow}>MACHINE SESSION SAVED</Text>
        <Text style={styles.savedTitle}>Loads and completed sets are in Training Memory.</Text>
        <Text style={styles.savedBody}>This remains supplemental strength rather than replacing the circuit work already in the plan.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/train' as Href)} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>Back to Train</Text><V23Icon name="chevron" color="#FFFFFF" size={16} />
        </Pressable>
      </View>
    </V23Screen>;
  }

  return <>
    <V23Screen contentStyle={styles.page}>
      <View style={styles.topRow}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <V23Icon name="back" color={tokens.text} size={18} /><Text style={styles.backText}>Train</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroIcon}><V23Icon name="equipment" color={tokens.accent} size={22} /></View>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>SUPPLEMENTAL STRENGTH</Text>
          <Text style={styles.title}>Machine strength</Text>
          <Text style={styles.subtitle}>Heavier sets. Fewer repetitions. No station timer.</Text>
        </View>
      </View>

      <View style={styles.intentCard}>
        <Text style={styles.intentTitle}>Different stimulus, not a replacement.</Text>
        <Text style={styles.intentBody}>Use machines to load muscles directly and progressively while the regular Side Quest circuits keep the free-weight, stability, and strength-under-fatigue stimulus.</Text>
        <View style={styles.intentStats}>
          <Metric value={workout ? `${workout.stations.flatMap((station) => station.exercises).length}` : '6'} label="exercises" styles={styles} />
          <Metric value={workout ? `${workout.machineStrength.setsPerExercise}` : '3'} label="sets each" styles={styles} />
          <Metric value="6–10" label="reps" styles={styles} />
        </View>
      </View>

      {recentMachineSession ? <View style={styles.warningCard}>
        <V23Icon name="info" color={tokens.accent} size={16} />
        <Text style={styles.warningText}>You already logged a machine session in the last 7 days. The default ceiling is one supplemental machine session per week unless the plan explicitly calls for more.</Text>
      </View> : null}

      {phaseLabel ? <View style={styles.phaseStrip}>
        <Text style={styles.phaseLabel}>CURRENT PHASE</Text>
        <Text style={styles.phaseValue}>{phaseLabel}</Text>
        <Text style={styles.phaseBody}>{phaseGuidance(phaseLabel)}</Text>
      </View> : null}

      <View style={styles.setupSection}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionEyebrow}>MACHINES AVAILABLE</Text>
          <Text style={styles.sectionTitle}>Build around the gym you have today.</Text>
        </View>
        <View style={styles.choiceStack}>
          <AvailabilityRow title="Cable + selectorized machines" detail="Pulldown, row, chest press, reverse fly, arm and isolation machines." selected={availability.selectorizedMachines} onPress={() => updateAvailability('selectorizedMachines')} tokens={tokens} styles={styles} />
          <AvailabilityRow title="Leg press" detail="Include a heavier supported lower-body press when available." selected={availability.legPress} onPress={() => updateAvailability('legPress')} tokens={tokens} styles={styles} />
        </View>
        <Pressable accessibilityRole="button" onPress={() => installWorkout(exercises, availability)} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <V23Icon name="adjust" color={tokens.accent} size={16} /><Text style={styles.secondaryButtonText}>{workout ? 'Regenerate machine session' : 'Build machine session'}</Text>
        </Pressable>
      </View>

      {error ? <View style={styles.errorCard}><V23Icon name="info" color={tokens.danger} size={16} /><Text style={styles.errorText}>{error}</Text></View> : null}

      {workout ? <>
        <View style={styles.sessionHeader}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionEyebrow}>TODAY'S SESSION</Text>
            <Text style={styles.sectionTitle}>{workout.machineStrength.estimatedMinutes[0]}–{workout.machineStrength.estimatedMinutes[1]} min depending on machine availability.</Text>
          </View>
          <Text style={styles.sessionNote}>Complete one exercise at a time. Waiting for a machine is fine; elapsed time is not part of the score.</Text>
        </View>

        {flattenedExercises(workout).map((item, exerciseIndex) => {
          const exercise = item.exerciseSnapshot;
          const prescription = exercise.prescriptions.find((candidate) => candidate.id === item.prescriptionId);
          const setFlags = completedSets[item.exerciseId] ?? [];
          return <View key={item.exerciseId} style={styles.exerciseCard}>
            <View style={styles.exerciseTop}>
              <View style={styles.exerciseNumber}><Text style={styles.exerciseNumberText}>{exerciseIndex + 1}</Text></View>
              <View style={styles.exerciseCopy}>
                <Text style={styles.exerciseName}>{exercise.name}</Text>
                <Text style={styles.exerciseMeta}>{workout.machineStrength.setsPerExercise} sets · {prescription?.minimum ?? item.target}–{prescription?.maximum ?? item.target} reps · {workout.machineStrength.restSeconds}s rest</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => setDemoExercise(exercise)} style={({ pressed }) => [styles.demoButton, pressed && styles.pressed]}>
                <Text style={styles.demoText}>Demo</Text>
              </Pressable>
            </View>

            <Text style={styles.loadGuidance}>{prescription?.loadGuidance}</Text>

            <View style={styles.loadRow}>
              <Text style={styles.fieldLabel}>WEIGHT</Text>
              <TextInput
                value={loads[item.exerciseId] ?? ''}
                onChangeText={(value) => setLoads((current) => ({ ...current, [item.exerciseId]: value.replace(/[^0-9.]/g, '') }))}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={tokens.textMuted}
                style={styles.loadInput}
              />
              <View style={styles.unitToggle}>
                {(['lb', 'kg'] as const).map((unit) => <Pressable key={unit} accessibilityRole="button" onPress={() => setLoadUnit(unit)} style={[styles.unitOption, loadUnit === unit && styles.unitOptionSelected]}>
                  <Text style={[styles.unitText, loadUnit === unit && styles.unitTextSelected]}>{unit}</Text>
                </Pressable>)}
              </View>
            </View>

            <View style={styles.setList}>
              {setFlags.map((complete, setIndex) => <View key={`${item.exerciseId}-${setIndex}`} style={styles.setRow}>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: complete }} onPress={() => toggleSet(item.exerciseId, setIndex)} style={[styles.setCheck, complete && styles.setCheckDone]}>
                  {complete ? <V23Icon name="check" color="#FFFFFF" size={14} /> : <Text style={styles.setNumber}>{setIndex + 1}</Text>}
                </Pressable>
                <Text style={styles.setLabel}>Set {setIndex + 1}</Text>
                <TextInput
                  value={reps[item.exerciseId]?.[setIndex] ?? String(item.target)}
                  onChangeText={(value) => updateReps(item.exerciseId, setIndex, value)}
                  keyboardType="number-pad"
                  style={styles.repInput}
                />
                <Text style={styles.repLabel}>reps</Text>
              </View>)}
            </View>
          </View>;
        })}

        <ProductDisclosure
          title="Why this is capped at one per week"
          summary="Machine work adds useful load, but it still counts toward strength stress."
          expanded={detailsOpen}
          onPress={() => setDetailsOpen((value) => !value)}
        >
          <Text style={styles.disclosureBody}>The goal is to add direct, progressively loadable work without quietly turning a three-session strength week into four or five hard strength days. Offseason and base phases are the natural place for this supplemental dose; it should become easier to omit as race-specific training takes priority.</Text>
        </ProductDisclosure>

        <View style={styles.finishCard}>
          <Text style={styles.finishTitle}>Finish when the sets are done—not when a clock expires.</Text>
          <Text style={styles.finishBody}>{completionSummary(workout, completedSets)}</Text>
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void finishSession()} style={({ pressed }) => [styles.primaryButton, saving && styles.disabled, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Save machine session'}</Text><V23Icon name="check" color="#FFFFFF" size={16} />
          </Pressable>
        </View>
      </> : null}
    </V23Screen>

    <ExerciseDemoModal exercise={demoExercise} visible={Boolean(demoExercise)} onClose={() => setDemoExercise(null)} />
  </>;
}

function AvailabilityRow({ title, detail, selected, onPress, tokens, styles }: {
  title: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
  tokens: DesignTokens;
  styles: ReturnType<typeof makeStyles>;
}) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }) => [styles.choiceRow, selected && styles.choiceRowSelected, pressed && styles.pressed]}>
    <View style={[styles.choiceCheck, selected && styles.choiceCheckSelected]}>{selected ? <V23Icon name="check" color="#FFFFFF" size={14} /> : null}</View>
    <View style={styles.choiceCopy}><Text style={styles.choiceTitle}>{title}</Text><Text style={styles.choiceDetail}>{detail}</Text></View>
    <V23Icon name="chevron" color={tokens.textMuted} size={15} />
  </Pressable>;
}

function Metric({ value, label, styles }: { value: string; label: string; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function flattenedExercises(workout: MachineStrengthWorkout) {
  return workout.stations.flatMap((station) => station.exercises);
}

function completionSummary(workout: MachineStrengthWorkout, completed: SetState): string {
  const items = flattenedExercises(workout);
  const done = items.reduce((sum, item) => sum + (completed[item.exerciseId] ?? []).filter(Boolean).length, 0);
  const total = items.length * workout.machineStrength.setsPerExercise;
  return `${done} of ${total} working sets marked complete. Partial sessions can still be saved accurately.`;
}

function phaseGuidance(phase: string): string {
  if (phase === 'offseason' || phase === 'base') return 'Strong fit for supplemental machine work when the weekly strength dose has room.';
  if (phase === 'build') return 'Optional. Keep it subordinate to key endurance and planned strength sessions.';
  return 'Usually omit supplemental machine work as race-specific recovery and freshness become more important.';
}

function sevenDaysAgo(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString();
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { gap: 16, paddingTop: 12, paddingBottom: 40 },
    topRow: { minHeight: 38, justifyContent: 'center' },
    backButton: { alignSelf: 'flex-start', minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 3, paddingRight: 10 },
    backText: { color: tokens.text, fontSize: 13, fontWeight: '800' },
    hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    heroCopy: { flex: 1, minWidth: 0, gap: 2 },
    eyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
    title: { color: tokens.text, fontSize: 28, lineHeight: 33, fontWeight: '900', letterSpacing: -0.5 },
    subtitle: { color: tokens.textMuted, fontSize: 13, lineHeight: 18 },
    intentCard: { borderRadius: 21, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, padding: 15, gap: 7 },
    intentTitle: { color: tokens.text, fontSize: 17, lineHeight: 22, fontWeight: '900' },
    intentBody: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18 },
    intentStats: { flexDirection: 'row', gap: 8, marginTop: 4 },
    metric: { flex: 1, borderRadius: 14, backgroundColor: tokens.surfaceMuted, padding: 10, gap: 1 },
    metricValue: { color: tokens.text, fontSize: 18, lineHeight: 22, fontWeight: '900' },
    metricLabel: { color: tokens.textMuted, fontSize: 9.5, lineHeight: 12, fontWeight: '700' },
    warningCard: { borderRadius: 16, backgroundColor: tokens.accentSoft, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    warningText: { flex: 1, color: tokens.text, fontSize: 11.5, lineHeight: 17 },
    phaseStrip: { borderRadius: 16, backgroundColor: tokens.surfaceMuted, padding: 12, gap: 2 },
    phaseLabel: { color: tokens.accent, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.8 },
    phaseValue: { color: tokens.text, fontSize: 14, lineHeight: 18, fontWeight: '900', textTransform: 'capitalize' },
    phaseBody: { color: tokens.textMuted, fontSize: 10.8, lineHeight: 15 },
    setupSection: { gap: 9 },
    sectionHeading: { gap: 2 },
    sectionEyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
    sectionTitle: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '900' },
    choiceStack: { borderRadius: 18, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, overflow: 'hidden' },
    choiceRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    choiceRowSelected: { backgroundColor: tokens.surfaceMuted },
    choiceCheck: { width: 27, height: 27, borderRadius: 9, borderWidth: 1, borderColor: tokens.borderStrong, alignItems: 'center', justifyContent: 'center' },
    choiceCheckSelected: { backgroundColor: tokens.accent, borderColor: tokens.accent },
    choiceCopy: { flex: 1, minWidth: 0, gap: 2 },
    choiceTitle: { color: tokens.text, fontSize: 13, lineHeight: 17, fontWeight: '900' },
    choiceDetail: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 15 },
    secondaryButton: { minHeight: 44, alignSelf: 'flex-start', borderRadius: 13, backgroundColor: tokens.accentSoft, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 7 },
    secondaryButtonText: { color: tokens.accent, fontSize: 12, lineHeight: 16, fontWeight: '900' },
    errorCard: { borderRadius: 15, borderWidth: 1, borderColor: tokens.danger, backgroundColor: tokens.surface, padding: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
    errorText: { flex: 1, color: tokens.text, fontSize: 11.5, lineHeight: 16 },
    sessionHeader: { gap: 4, marginTop: 2 },
    sessionNote: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 17 },
    exerciseCard: { borderRadius: 20, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 14, gap: 11 },
    exerciseTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    exerciseNumber: { width: 31, height: 31, borderRadius: 11, backgroundColor: tokens.header, alignItems: 'center', justifyContent: 'center' },
    exerciseNumberText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
    exerciseCopy: { flex: 1, minWidth: 0, gap: 1 },
    exerciseName: { color: tokens.text, fontSize: 15, lineHeight: 20, fontWeight: '900' },
    exerciseMeta: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 15 },
    demoButton: { minHeight: 34, borderRadius: 11, backgroundColor: tokens.surfaceMuted, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
    demoText: { color: tokens.accent, fontSize: 10.5, fontWeight: '900' },
    loadGuidance: { color: tokens.textMuted, fontSize: 11, lineHeight: 16 },
    loadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    fieldLabel: { color: tokens.textMuted, fontSize: 8.5, fontWeight: '900', letterSpacing: 0.75 },
    loadInput: { width: 72, minHeight: 40, borderRadius: 11, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surfaceMuted, color: tokens.text, paddingHorizontal: 10, textAlign: 'center', fontSize: 14, fontWeight: '800' },
    unitToggle: { flexDirection: 'row', borderRadius: 11, borderWidth: 1, borderColor: tokens.border, overflow: 'hidden' },
    unitOption: { minWidth: 40, minHeight: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.surface },
    unitOptionSelected: { backgroundColor: tokens.accent },
    unitText: { color: tokens.textMuted, fontSize: 10.5, fontWeight: '800' },
    unitTextSelected: { color: '#FFFFFF' },
    setList: { gap: 7 },
    setRow: { minHeight: 42, borderRadius: 12, backgroundColor: tokens.surfaceMuted, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 9 },
    setCheck: { width: 28, height: 28, borderRadius: 9, borderWidth: 1, borderColor: tokens.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.surface },
    setCheckDone: { backgroundColor: tokens.accent, borderColor: tokens.accent },
    setNumber: { color: tokens.textMuted, fontSize: 10, fontWeight: '900' },
    setLabel: { flex: 1, color: tokens.text, fontSize: 11.5, fontWeight: '800' },
    repInput: { width: 52, minHeight: 32, borderRadius: 9, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, color: tokens.text, textAlign: 'center', fontSize: 12, fontWeight: '800' },
    repLabel: { width: 28, color: tokens.textMuted, fontSize: 9.5 },
    disclosureBody: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 17 },
    finishCard: { borderRadius: 20, backgroundColor: tokens.surfaceMuted, padding: 14, gap: 6 },
    finishTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
    finishBody: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
    primaryButton: { minHeight: 46, borderRadius: 14, backgroundColor: tokens.accent, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 },
    primaryButtonText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '900' },
    savedCard: { marginTop: 40, borderRadius: 24, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, padding: 20, gap: 7, alignItems: 'stretch' },
    savedIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: tokens.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
    savedEyebrow: { color: tokens.accent, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.9 },
    savedTitle: { color: tokens.text, fontSize: 22, lineHeight: 27, fontWeight: '900' },
    savedBody: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18 },
    pressed: { opacity: 0.72 },
    disabled: { opacity: 0.5 },
  });
}
