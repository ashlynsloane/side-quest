import type { PlannedStrengthSession, TrainingCheckIn } from '@circuit/domain';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getActiveTrainingCheckIn,
  getLatestTrainingBlock,
  listCompletedWorkoutSummaries,
  listReadinessCheckIns,
  listWorkoutFeedbackSince,
  listWorkoutReflectionsSince,
  type CompletedWorkoutSummary,
  type WorkoutFeedbackSummary,
  type WorkoutReflection,
} from '@/services/database';
import { buildWeeklyCoachNotes, readinessSummary, type WeeklyReadinessSummary } from '@/services/readiness';

type ReviewData = {
  sessions: PlannedStrengthSession[];
  completedWorkouts: CompletedWorkoutSummary[];
  feedback: WorkoutFeedbackSummary[];
  reflections: WorkoutReflection[];
  readiness: WeeklyReadinessSummary;
  activeCheckIn: TrainingCheckIn | null;
};

const EMPTY: ReviewData = {
  sessions: [],
  completedWorkouts: [],
  feedback: [],
  reflections: [],
  readiness: { averageScore: null, band: null, daysLogged: 0 },
  activeCheckIn: null,
};

export default function WeeklyReviewScreen() {
  const router = useRouter();
  const [data, setData] = useState<ReviewData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const range = useMemo(() => weekRange(new Date()), []);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    const fromTimestamp = `${range.start}T00:00:00.000`;
    const toTimestamp = `${range.end}T23:59:59.999`;
    void Promise.all([
      getLatestTrainingBlock(),
      listCompletedWorkoutSummaries({ from: fromTimestamp, to: toTimestamp }),
      listReadinessCheckIns({ from: range.start, to: range.end }),
      listWorkoutFeedbackSince(fromTimestamp),
      listWorkoutReflectionsSince(fromTimestamp),
      getActiveTrainingCheckIn(),
    ]).then(([savedBlock, completedWorkouts, readinessRows, feedback, reflections, activeCheckIn]) => {
      if (cancelled) return;
      const sessions = savedBlock?.block.weeks
        .flatMap((week) => week.sessions)
        .filter((session) => session.date >= range.start && session.date <= range.end) ?? [];
      setData({
        sessions,
        completedWorkouts,
        feedback: feedback.filter((item) => item.createdAt <= toTimestamp),
        reflections: reflections.filter((item) => item.completedAt <= toTimestamp),
        readiness: readinessSummary(readinessRows),
        activeCheckIn,
      });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [range.end, range.start]));

  const metrics = useMemo(() => deriveMetrics(data), [data]);
  const notes = useMemo(() => buildWeeklyCoachNotes({
    plannedSessions: metrics.planned,
    completedSessions: metrics.completed,
    skippedSessions: metrics.skipped,
    rescheduledSessions: metrics.modified,
    completedWorkouts: data.completedWorkouts.length,
    tooEasyCount: metrics.tooEasy,
    appropriateCount: metrics.appropriate,
    tooHardCount: metrics.tooHard,
    averageRpe: metrics.averageRpe,
    readiness: data.readiness,
    activePainRestriction: data.activeCheckIn?.status === 'tightness_pain' || data.activeCheckIn?.status === 'unable_to_train',
  }), [data, metrics]);

  async function shareReview() {
    await Share.share({ message: reviewText(range, data, metrics, notes) });
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Home</Text>
        </Pressable>
        <Text style={styles.topTitle}>Weekly Review</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>WEEK OF {formatDate(range.start).toUpperCase()}</Text>
          <Text style={styles.title}>Was the plan realistic?</Text>
          <Text style={styles.subtitle}>
            Review adherence, readiness, perceived difficulty, and actual effort before changing next week.
          </Text>
        </View>

        {loading ? <Text style={styles.helper}>Building your weekly review…</Text> : null}

        <View style={styles.metricGrid}>
          <MetricCard value={`${metrics.completed}/${metrics.planned}`} label="planned sessions completed" />
          <MetricCard value={`${Math.round(metrics.adherence * 100)}%`} label="plan adherence" />
          <MetricCard value={data.readiness.averageScore === null ? '—' : data.readiness.averageScore.toFixed(1)} label="average readiness / 5" />
          <MetricCard value={metrics.averageRpe === null ? '—' : metrics.averageRpe.toFixed(1)} label="average session RPE / 10" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Coach interpretation</Text>
          {notes.map((note) => (
            <View key={note} style={styles.noteRow}>
              <Text style={styles.noteBullet}>•</Text>
              <Text style={styles.noteText}>{note}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Plan status</Text>
          {data.sessions.length === 0 ? (
            <Text style={styles.helper}>No goal-plan strength sessions fall inside this week.</Text>
          ) : data.sessions.map((session) => (
            <View key={session.id} style={styles.sessionRow}>
              <View style={[styles.statusDot, statusStyle(session.completionStatus)]} />
              <View style={styles.sessionCopy}>
                <Text style={styles.sessionTitle}>{session.title}</Text>
                <Text style={styles.helper}>{formatDate(session.date)} · {formatStatus(session.completionStatus)}</Text>
              </View>
              <Text style={styles.loadLabel}>{session.intendedLoad}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Readiness pattern</Text>
            <Text style={styles.sectionMeta}>{data.readiness.daysLogged}/7 days</Text>
          </View>
          {data.readiness.daysLogged === 0 ? (
            <Text style={styles.helper}>No daily readiness entries yet. Three or more days produces a more useful pattern.</Text>
          ) : (
            <>
              <Text style={styles.readinessHeadline}>
                {data.readiness.band ? data.readiness.band.toUpperCase() : 'NO TREND'}
              </Text>
              {data.readiness.lowestDay ? (
                <Text style={styles.helper}>Lowest logged day: {formatDate(data.readiness.lowestDay.date)}.</Text>
              ) : null}
            </>
          )}
          <Pressable accessibilityRole="button" onPress={() => router.push('/readiness' as never)} style={styles.inlineButton}>
            <Text style={styles.inlineButtonText}>Log today’s readiness</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Completed workouts</Text>
          {data.completedWorkouts.length === 0 ? (
            <Text style={styles.helper}>No completed strength workouts were recorded this week.</Text>
          ) : data.completedWorkouts.map((workout) => {
            const reflection = data.reflections.find((item) => item.workoutInstanceId === workout.id);
            return (
              <View key={workout.id} style={styles.workoutRow}>
                <View style={styles.workoutCopy}>
                  <Text style={styles.sessionTitle}>{workout.workoutName}</Text>
                  <Text style={styles.helper}>
                    {formatDateTime(workout.completedAt)} · {Math.round(workout.completionFraction * 100)}% completed
                    {workout.variantLevel ? ` · ${workout.variantLevel}` : ''}
                  </Text>
                  {reflection?.notes ? <Text style={styles.reflectionNote}>“{reflection.notes}”</Text> : null}
                </View>
                {reflection?.rpe ? <Text style={styles.rpeBadge}>RPE {reflection.rpe}</Text> : null}
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prescription feedback</Text>
          <View style={styles.feedbackRow}>
            <FeedbackStat value={metrics.tooEasy} label="Too easy" />
            <FeedbackStat value={metrics.appropriate} label="About right" />
            <FeedbackStat value={metrics.tooHard} label="Too hard" />
          </View>
        </View>

        <Pressable accessibilityRole="button" onPress={() => void shareReview()} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Share Weekly Summary</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function deriveMetrics(data: ReviewData) {
  const planned = data.sessions.length;
  const completed = data.sessions.filter((item) => item.completionStatus === 'completed').length;
  const skipped = data.sessions.filter((item) => item.completionStatus === 'skipped').length;
  const modified = data.sessions.filter((item) => item.completionStatus === 'modified').length;
  const tooEasy = data.feedback.filter((item) => item.difficulty === 'too_easy').length;
  const appropriate = data.feedback.filter((item) => item.difficulty === 'appropriate').length;
  const tooHard = data.feedback.filter((item) => item.difficulty === 'too_hard').length;
  const rpes = data.reflections.flatMap((item) => item.rpe === undefined ? [] : [item.rpe]);
  const averageRpe = rpes.length ? rpes.reduce((sum, value) => sum + value, 0) / rpes.length : null;
  return {
    planned,
    completed,
    skipped,
    modified,
    tooEasy,
    appropriate,
    tooHard,
    averageRpe,
    adherence: planned > 0 ? completed / planned : 0,
  };
}

function MetricCard({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function FeedbackStat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.feedbackStat}>
      <Text style={styles.feedbackValue}>{value}</Text>
      <Text style={styles.feedbackLabel}>{label}</Text>
    </View>
  );
}

function statusStyle(status: PlannedStrengthSession['completionStatus']) {
  if (status === 'completed') return styles.statusCompleted;
  if (status === 'skipped') return styles.statusSkipped;
  if (status === 'modified') return styles.statusModified;
  return styles.statusPlanned;
}

function formatStatus(status: PlannedStrengthSession['completionStatus']) {
  if (status === 'completed') return 'Completed';
  if (status === 'skipped') return 'Skipped';
  if (status === 'modified') return 'Moved or modified';
  return 'Planned';
}

function reviewText(
  range: { start: string; end: string },
  data: ReviewData,
  metrics: ReturnType<typeof deriveMetrics>,
  notes: string[],
) {
  return [
    `Side Quest weekly review · ${formatDate(range.start)}–${formatDate(range.end)}`,
    '',
    `Goal-plan strength: ${metrics.completed}/${metrics.planned} completed (${Math.round(metrics.adherence * 100)}%)`,
    `Completed strength workouts: ${data.completedWorkouts.length}`,
    `Average readiness: ${data.readiness.averageScore === null ? 'not enough data' : `${data.readiness.averageScore.toFixed(1)}/5`}`,
    `Average session RPE: ${metrics.averageRpe === null ? 'not recorded' : `${metrics.averageRpe.toFixed(1)}/10`}`,
    `Feedback: ${metrics.tooEasy} too easy · ${metrics.appropriate} about right · ${metrics.tooHard} too hard`,
    '',
    'Coach interpretation:',
    ...notes.map((note) => `• ${note}`),
  ].join('\n');
}

function weekRange(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: localIsoDate(start), end: localIsoDate(end) };
}

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

const colors = {
  background: '#E4EBE3', card: '#FFFDF8', ink: '#01234D', muted: '#6B7770', border: '#164C73',
  accent: '#153E2F', accentSoft: '#D8E9DF', warm: '#F4E7D2', danger: '#9B2C2C', gold: '#8A6A2F',
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  backButton: { flex: 1, paddingVertical: 6 },
  backText: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  topTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 56, gap: 15 },
  intro: { gap: 6 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '700', lineHeight: 36 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  helper: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { width: '48%', minHeight: 112, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 15, justifyContent: 'space-between' },
  metricValue: { color: colors.accent, fontSize: 28, fontWeight: '800' },
  metricLabel: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  section: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 17, gap: 11 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  sectionMeta: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  noteRow: { flexDirection: 'row', gap: 8 },
  noteBullet: { color: colors.accent, fontSize: 17 },
  noteText: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 21 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusCompleted: { backgroundColor: colors.accent },
  statusSkipped: { backgroundColor: colors.danger },
  statusModified: { backgroundColor: colors.gold },
  statusPlanned: { backgroundColor: colors.border },
  sessionCopy: { flex: 1 },
  sessionTitle: { color: colors.ink, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  loadLabel: { color: colors.accent, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  readinessHeadline: { color: colors.accent, fontSize: 20, fontWeight: '800' },
  inlineButton: { alignSelf: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  inlineButtonText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  workoutRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 10 },
  workoutCopy: { flex: 1, gap: 3 },
  reflectionNote: { color: colors.ink, fontSize: 13, fontStyle: 'italic', lineHeight: 18, marginTop: 3 },
  rpeBadge: { color: colors.accent, backgroundColor: colors.accentSoft, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, fontSize: 11, fontWeight: '800' },
  feedbackRow: { flexDirection: 'row', gap: 8 },
  feedbackStat: { flex: 1, backgroundColor: colors.background, borderRadius: 14, padding: 12, alignItems: 'center', gap: 3 },
  feedbackValue: { color: colors.accent, fontSize: 23, fontWeight: '800' },
  feedbackLabel: { color: colors.muted, fontSize: 11, textAlign: 'center' },
  primaryButton: { backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
