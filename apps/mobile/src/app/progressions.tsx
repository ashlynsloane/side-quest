import type { EquipmentId, ExercisePerformanceHistoryEntry, PTProfile, TrainingBlockPlan, TrainingCheckIn } from '@circuit/domain';
import {
  recommendExerciseProgressions,
  type ExerciseProgressionRecommendation,
} from '@circuit/planner';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  clearProgressionTarget,
  getActiveTrainingCheckIn,
  getDefaultEquipmentProfile,
  getLatestPTProfile,
  getLatestTrainingBlock,
  getTrainingContinuitySummary,
  listExerciseLoadHistory,
  listExercisePerformanceHistory,
  listProgressionTargets,
  listWorkoutFeedbackSince,
  listWorkoutReflectionsSince,
  saveProgressionTarget,
  type EquipmentProfile,
  type ProgressionTarget,
  type TrainingContinuitySummary,
} from '@/services/database';
import { useExerciseCatalog } from '@/services/exercise-catalog';

export default function ProgressionsScreen() {
  const router = useRouter();
  const { exercises } = useExerciseCatalog();
  const [history, setHistory] = useState<ExercisePerformanceHistoryEntry[]>([]);
  const [feedback, setFeedback] = useState<Awaited<ReturnType<typeof listWorkoutFeedbackSince>>>([]);
  const [reflections, setReflections] = useState<Awaited<ReturnType<typeof listWorkoutReflectionsSince>>>([]);
  const [targets, setTargets] = useState<Record<string, ProgressionTarget>>({});
  const [continuity, setContinuity] = useState<TrainingContinuitySummary>({ completedLast28Days: 0 });
  const [block, setBlock] = useState<TrainingBlockPlan | null>(null);
  const [ptProfile, setPTProfile] = useState<PTProfile | null>(null);
  const [checkIn, setCheckIn] = useState<TrainingCheckIn | null>(null);
  const [equipmentProfile, setEquipmentProfile] = useState<EquipmentProfile | null>(null);
  const [filter, setFilter] = useState<'all' | 'increase' | 'hold' | 'reduce'>('all');

  const load = useCallback(async () => {
    const from = new Date(Date.now() - 84 * 86_400_000).toISOString();
    const [performance, legacyLoads, savedFeedback, savedReflections, savedTargets, summary, savedBlock, profile, activeCheckIn, savedEquipment] = await Promise.all([
      listExercisePerformanceHistory({ from, limit: 800 }),
      listExerciseLoadHistory({ from, limit: 400 }),
      listWorkoutFeedbackSince(from),
      listWorkoutReflectionsSince(from),
      listProgressionTargets(),
      getTrainingContinuitySummary(),
      getLatestTrainingBlock(),
      getLatestPTProfile(),
      getActiveTrainingCheckIn(),
      getDefaultEquipmentProfile(),
    ]);
    const covered = new Set(performance.map((item) => item.exerciseId));
    const legacy: ExercisePerformanceHistoryEntry[] = legacyLoads
      .filter((item) => !covered.has(item.exerciseId))
      .map((item) => ({
        exerciseId: item.exerciseId,
        exerciseName: item.exerciseName,
        targetValue: 10,
        targetUnit: 'total',
        loadValue: item.loadValue,
        loadUnit: item.loadUnit,
        completionFraction: 1,
        completedAt: item.completedAt,
      }));
    setHistory([...performance, ...legacy]);
    setFeedback(savedFeedback);
    setReflections(savedReflections);
    setTargets(savedTargets);
    setContinuity(summary);
    setBlock(savedBlock?.block ?? null);
    setPTProfile(profile);
    setCheckIn(activeCheckIn);
    setEquipmentProfile(savedEquipment);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const metadata = useMemo(() => exercises.map((exercise) => {
    const prescription = exercise.prescriptions.find((item) => item.mode === 'reps') ?? exercise.prescriptions[0];
    return {
      exerciseId: exercise.id,
      equipmentIds: [...new Set(exercise.equipmentOptions.flatMap((option) => option.items.map((item) => item.equipmentId)))],
      defaultTarget: prescription?.target,
      targetUnit: prescription?.unit,
      minimumTarget: prescription?.minimum,
      maximumTarget: prescription?.maximum,
    };
  }), [exercises]);

  const missedSessionsLast28Days = useMemo(() => {
    if (!block) return 0;
    const today = localIsoDate(new Date());
    const cutoff = localIsoDate(new Date(Date.now() - 28 * 86_400_000));
    return block.weeks.flatMap((week) => week.sessions).filter((session) =>
      session.date >= cutoff
      && session.date <= today
      && (session.completionStatus === 'skipped'
        || (session.completionStatus === 'planned' && session.date < today))).length;
  }, [block]);

  const returningFromInjury = Boolean(ptProfile?.active && ptProfile.conditions.some((condition) =>
    condition.status === 'returning' || condition.status === 'active'));
  const activePainRestriction = checkIn?.status === 'tightness_pain' || checkIn?.status === 'unable_to_train';
  const availableLoads = useMemo(() => {
    if (!equipmentProfile) return {};
    const unit = equipmentProfile.loadUnit ?? 'lb';
    const result: Partial<Record<EquipmentId, { unit: 'lb' | 'kg'; values: number[] }>> = {};
    if (equipmentProfile.dumbbellLoads?.length) result.dumbbell = { unit, values: equipmentProfile.dumbbellLoads };
    if (equipmentProfile.kettlebellLoads?.length) result.kettlebell = { unit, values: equipmentProfile.kettlebellLoads };
    if (equipmentProfile.medicineBallLoads?.length) result.medicine_ball = { unit, values: equipmentProfile.medicineBallLoads };
    if (equipmentProfile.barbellPlateLoads?.length) {
      result.barbell = { unit, values: equipmentProfile.barbellPlateLoads };
      result.weight_plate = { unit, values: equipmentProfile.barbellPlateLoads };
    }
    return result;
  }, [equipmentProfile]);

  const recommendations = useMemo(() => recommendExerciseProgressions({
    history,
    exerciseMetadata: metadata,
    recentFeedback: feedback.map((item) => item.difficulty),
    recentRpe: reflections.flatMap((item) => item.rpe === undefined ? [] : [item.rpe]),
    continuity: {
      daysSinceLastStrength: continuity.daysSinceLastStrength,
      missedSessionsLast28Days,
      returningFromInjury,
      activePainRestriction,
    },
    availableLoads,
  }), [history, metadata, feedback, reflections, continuity.daysSinceLastStrength, missedSessionsLast28Days, returningFromInjury, activePainRestriction, availableLoads]);

  const shown = filter === 'all' ? recommendations : recommendations.filter((item) => item.action === filter);

  async function accept(recommendation: ExerciseProgressionRecommendation) {
    await saveProgressionTarget({
      exerciseId: recommendation.exerciseId,
      exerciseName: recommendation.exerciseName,
      strategy: recommendation.strategy === 'collect_more' ? 'hold' : recommendation.strategy,
      targetLoad: recommendation.suggestedLoad,
      loadUnit: recommendation.loadUnit,
      targetValue: recommendation.suggestedTarget,
      targetUnit: recommendation.targetUnit,
      equipmentId: recommendation.equipmentId,
      source: 'recommended',
      rationale: recommendation.rationale.join(' '),
      updatedAt: new Date().toISOString(),
    });
    await load();
  }

  async function clear(exerciseId: string) {
    await clearProgressionTarget(exerciseId);
    await load();
  }

  const counts = {
    increase: recommendations.filter((item) => item.action === 'increase').length,
    hold: recommendations.filter((item) => item.action === 'hold' || item.action === 'collect_more').length,
    reduce: recommendations.filter((item) => item.action === 'reduce').length,
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>‹ Back</Text></Pressable>
        <Text style={styles.topTitle}>Progression lab</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>NONLINEAR PROGRESSION</Text>
          <Text style={styles.title}>Progress the dose—not just the weight</Text>
          <Text style={styles.subtitle}>Completed sets, repetitions, load, and effort automatically feed future recommendations. The app prefers repetitions or time before load, uses realistic implement jumps, and deliberately backs off after interruption, pain, or return from injury.</Text>
        </View>

        <ContinuityCard
          continuity={continuity}
          missedSessions={missedSessionsLast28Days}
          returning={returningFromInjury}
          activePain={activePainRestriction}
        />

        <View style={styles.explainerCard}>
          <Text style={styles.cardEyebrow}>HOW THIS WORKS</Text>
          <Text style={styles.sectionTitle}>Workout logging is the memory</Text>
          <Text style={styles.body}>You do not need to save every completed exercise separately. Set-by-set logging automatically updates this lab. “Pin this target” is optional: it tells Side Quest to hold a specific next-session goal instead of recalculating it.</Text>
        </View>

        <View style={styles.metricsRow}>
          <Metric value={counts.increase} label="ready to progress" />
          <Metric value={counts.hold} label="hold or learn" />
          <Metric value={counts.reduce} label="re-entry / reduce" />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {(['all', 'increase', 'hold', 'reduce'] as const).map((value) => (
            <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}>
              <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{filterLabel(value)}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {shown.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.sectionTitle}>Not enough performance history yet</Text>
            <Text style={styles.body}>Complete workouts and record loads. Side Quest stores the completed repetitions or time, the implement, and any recorded load so future recommendations become more specific.</Text>
          </View>
        ) : shown.map((recommendation) => (
          <RecommendationCard
            key={recommendation.exerciseId}
            recommendation={recommendation}
            target={targets[recommendation.exerciseId]}
            onAccept={() => void accept(recommendation)}
            onClear={() => void clear(recommendation.exerciseId)}
          />
        ))}

        <View style={styles.noteCard}>
          <Text style={styles.sectionTitle}>Equipment-aware guardrails</Text>
          <Text style={styles.body}>{equipmentProfile ? `Recommendations use the weights saved in ${equipmentProfile.name} whenever that implement and unit match the workout log. ` : ''}Kettlebells, dumbbells, barbells, and plates otherwise use realistic fallback increments—not invented one-pound jumps.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ContinuityCard({ continuity, missedSessions, returning, activePain }: {
  continuity: TrainingContinuitySummary;
  missedSessions: number;
  returning: boolean;
  activePain: boolean;
}) {
  const interruption = (continuity.daysSinceLastStrength ?? 0) >= 14 || missedSessions >= 2;
  const conservative = returning || activePain;
  return (
    <View style={[styles.continuityCard, (interruption || conservative) && styles.continuityAttention]}>
      <Text style={styles.cardEyebrow}>CURRENT CONTEXT</Text>
      <Text style={styles.sectionTitle}>{conservative ? 'Conservative return mode' : interruption ? 'Re-entry after interruption' : 'Normal progression context'}</Text>
      <Text style={styles.body}>
        {continuity.daysSinceLastStrength === undefined
          ? 'No completed strength session has been recorded yet.'
          : `${continuity.daysSinceLastStrength} day${continuity.daysSinceLastStrength === 1 ? '' : 's'} since the last completed strength workout · ${missedSessions} missed or overdue session${missedSessions === 1 ? '' : 's'} in the last 28 days.`}
      </Text>
      {(interruption || conservative) ? <Text style={styles.contextWarning}>Recommendations will reduce reps, time, load, or session dose before progression resumes.</Text> : null}
    </View>
  );
}

function RecommendationCard({ recommendation, target, onAccept, onClear }: {
  recommendation: ExerciseProgressionRecommendation;
  target?: ProgressionTarget;
  onAccept: () => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.exerciseName}>{recommendation.exerciseName}</Text>
          <Text style={styles.meta}>{recommendation.observations} comparable exposure{recommendation.observations === 1 ? '' : 's'} · {strategyLabel(recommendation.strategy)}</Text>
        </View>
        <Text style={[styles.actionBadge, actionStyle(recommendation.action)]}>{actionLabel(recommendation.action)}</Text>
      </View>

      <View style={styles.doseGrid}>
        <DoseBlock label="CURRENT" value={formatDose(recommendation.currentTarget, recommendation.targetUnit, recommendation.currentLoad, recommendation.loadUnit)} />
        <Text style={styles.arrow}>→</Text>
        <DoseBlock label="NEXT EXPOSURE" value={formatDose(recommendation.suggestedTarget, recommendation.targetUnit, recommendation.suggestedLoad, recommendation.loadUnit)} />
      </View>

      {recommendation.rationale.map((reason) => <View key={reason} style={styles.reasonRow}><Text style={styles.bullet}>•</Text><Text style={styles.reason}>{reason}</Text></View>)}

      {target ? (
        <View style={styles.savedTarget}>
          <View style={{ flex: 1 }}><Text style={styles.savedTitle}>Pinned next-session target</Text><Text style={styles.savedBody}>{formatSavedTarget(target)}</Text></View>
          <Pressable onPress={onClear}><Text style={styles.clearText}>Clear</Text></Pressable>
        </View>
      ) : recommendation.action === 'collect_more' ? null : (
        <Pressable onPress={onAccept} style={styles.acceptButton}><Text style={styles.acceptText}>Pin this target</Text></Pressable>
      )}
    </View>
  );
}

function DoseBlock({ label, value }: { label: string; value: string }) { return <View style={styles.loadBlock}><Text style={styles.loadLabel}>{label}</Text><Text style={styles.loadValue}>{value}</Text></View>; }
function Metric({ value, label }: { value: number; label: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function filterLabel(value: 'all' | 'increase' | 'hold' | 'reduce') { return value === 'all' ? 'All' : value === 'increase' ? 'Progress' : value === 'hold' ? 'Hold / learn' : 'Reduce / return'; }
function actionLabel(value: ExerciseProgressionRecommendation['action']) { if (value === 'collect_more') return 'LEARN'; return value.toUpperCase(); }
function actionStyle(value: ExerciseProgressionRecommendation['action']) { if (value === 'increase') return styles.actionIncrease; if (value === 'reduce') return styles.actionReduce; return styles.actionHold; }
function strategyLabel(value: ExerciseProgressionRecommendation['strategy']) { return value.replaceAll('_', ' '); }
function formatTarget(value: number | undefined, unit: 'total' | 'per_side' | 'seconds' | undefined) { if (value === undefined) return ''; if (unit === 'seconds') return `${value}s`; if (unit === 'per_side') return `${value}/side`; return `${value} reps`; }
function formatLoad(value: number | undefined, unit: 'lb' | 'kg' | undefined) { if (value === undefined || !unit) return ''; return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`; }
function formatDose(target: number | undefined, targetUnit: 'total' | 'per_side' | 'seconds' | undefined, load: number | undefined, loadUnit: 'lb' | 'kg' | undefined) { return [formatTarget(target, targetUnit), formatLoad(load, loadUnit)].filter(Boolean).join(' · ') || 'Repeat and observe'; }
function formatSavedTarget(target: ProgressionTarget) { return formatDose(target.targetValue, target.targetUnit, target.targetLoad, target.loadUnit); }
function localIsoDate(date: Date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, '0'); const day = String(date.getDate()).padStart(2, '0'); return `${year}-${month}-${day}`; }

const c = { bg: '#E4EBE3', card: '#FFFDF8', ink: '#01234D', muted: '#6B7770', border: '#164C73', accent: '#153E2F', soft: '#D8E9DF', warm: '#F4E7D2', danger: '#9B2C2C', gold: '#8A6A2F' };
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: c.bg }, topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.card }, backButton: { flex: 1, paddingVertical: 6 }, backText: { color: c.accent, fontSize: 16, fontWeight: '700' }, topTitle: { color: c.ink, fontSize: 17, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 60, gap: 14 }, intro: { gap: 6 }, eyebrow: { color: c.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }, title: { color: c.ink, fontSize: 29, fontWeight: '800', lineHeight: 35 }, subtitle: { color: c.muted, fontSize: 14, lineHeight: 21 },
  explainerCard: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 20, padding: 17, gap: 6 },
  continuityCard: { backgroundColor: c.soft, borderRadius: 20, padding: 17, gap: 6 }, continuityAttention: { backgroundColor: c.warm }, cardEyebrow: { color: c.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, contextWarning: { color: c.danger, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  metricsRow: { flexDirection: 'row', gap: 8 }, metric: { flex: 1, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 13 }, metricValue: { color: c.accent, fontSize: 25, fontWeight: '900' }, metricLabel: { color: c.muted, fontSize: 11, lineHeight: 15, marginTop: 3 },
  filters: { gap: 8 }, filter: { borderWidth: 1, borderColor: c.border, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: c.card }, filterActive: { backgroundColor: c.accent, borderColor: c.accent }, filterText: { color: c.muted, fontSize: 13, fontWeight: '800' }, filterTextActive: { color: '#FFFFFF' },
  card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 20, padding: 17, gap: 11 }, emptyCard: { backgroundColor: c.card, borderRadius: 20, padding: 18, gap: 7 }, noteCard: { backgroundColor: c.warm, borderRadius: 20, padding: 17, gap: 6 }, sectionTitle: { color: c.ink, fontSize: 18, fontWeight: '800' }, body: { color: c.muted, fontSize: 14, lineHeight: 20 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, exerciseName: { color: c.ink, fontSize: 18, fontWeight: '800' }, meta: { color: c.muted, fontSize: 11, marginTop: 3, textTransform: 'capitalize' }, actionBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: '900' }, actionIncrease: { color: c.accent, backgroundColor: c.soft }, actionReduce: { color: c.danger, backgroundColor: '#F7E3E3' }, actionHold: { color: c.gold, backgroundColor: c.warm },
  doseGrid: { flexDirection: 'row', alignItems: 'center', gap: 8 }, loadBlock: { flex: 1, backgroundColor: c.bg, borderRadius: 13, padding: 11, minHeight: 69 }, loadLabel: { color: c.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, loadValue: { color: c.accent, fontSize: 16, lineHeight: 21, fontWeight: '900', marginTop: 3 }, arrow: { color: c.accent, fontSize: 20, fontWeight: '900' }, reasonRow: { flexDirection: 'row', gap: 7 }, bullet: { color: c.accent, fontSize: 15 }, reason: { flex: 1, color: c.muted, fontSize: 13, lineHeight: 19 },
  acceptButton: { backgroundColor: c.accent, borderRadius: 14, padding: 13, alignItems: 'center' }, acceptText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' }, savedTarget: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.soft, borderRadius: 14, padding: 12 }, savedTitle: { color: c.accent, fontSize: 12, fontWeight: '900' }, savedBody: { color: c.ink, fontSize: 13, marginTop: 2 }, clearText: { color: c.danger, fontSize: 12, fontWeight: '900' },
});
