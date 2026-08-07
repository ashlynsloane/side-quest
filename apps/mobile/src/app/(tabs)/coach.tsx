import type { PlannedStrengthSession, TrainingBlockPlan, TrainingCalendarEvent, WorkoutRecommendationExplanation } from '@circuit/domain';
import { explainPlannedStrengthSession } from '@circuit/planner';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActiveWorkoutResumeCard } from '@/components/active-workout-resume-card';
import { CoachInsights } from '@/components/coach-insights';
import { V23Card, V23Chip, V23Icon, V23PrimaryButton, V23ScenicBanner, V23Screen } from '@/components/v23-ui';
import {
  getLatestTrainingBlock,
  getTodayReadinessCheckIn,
  getTrainingCalendarEvents,
  listCompletedWorkoutSummaries,
  listTrainingCalendarSources,
} from '@/services/database';
import { useTheme } from '@/state/theme-context';
import { useWorkoutContext } from '@/state/workout-context';
import type { DesignTokens } from '@/theme';

export default function CoachTab() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { openPlannedWorkoutPreview, activeWorkout, activePlanLink } = useWorkoutContext();
  const [block, setBlock] = useState<TrainingBlockPlan | null>(null);
  const [events, setEvents] = useState<TrainingCalendarEvent[]>([]);
  const [hasTrainingHistory, setHasTrainingHistory] = useState(false);
  const [hasReadinessData, setHasReadinessData] = useState(false);
  const [hasConnectedTrainingData, setHasConnectedTrainingData] = useState(false);

  useFocusEffect(useCallback(() => {
    let live = true;
    void (async () => {
      const saved = await getLatestTrainingBlock();
      const nextBlock = saved?.block ?? null;
      const now = new Date();
      const rangeStart = new Date(now);
      rangeStart.setDate(rangeStart.getDate() - 7);
      const rangeEnd = new Date(now);
      rangeEnd.setDate(rangeEnd.getDate() + 21);
      const historyStart = new Date(now);
      historyStart.setDate(historyStart.getDate() - 90);
      const [calendar, history, readiness, sources] = await Promise.all([
        getTrainingCalendarEvents({ from: rangeStart.toISOString(), to: rangeEnd.toISOString() }),
        listCompletedWorkoutSummaries({ from: historyStart.toISOString(), to: now.toISOString() }),
        getTodayReadinessCheckIn(),
        listTrainingCalendarSources(),
      ]);
      if (!live) return;
      setBlock(nextBlock);
      setEvents(calendar);
      setHasTrainingHistory(history.length > 0);
      setHasReadinessData(Boolean(readiness));
      setHasConnectedTrainingData(sources.some((source) => source.active && source.sourceType !== 'manual'));
    })();
    return () => { live = false; };
  }, []));

  const sessions = useMemo(() => block?.weeks.flatMap((week) => week.sessions) ?? [], [block]);
  const nextSession = useMemo(() => selectNextSession(sessions), [sessions]);
  const explanation = useMemo<WorkoutRecommendationExplanation | null>(() => {
    if (!nextSession) return null;
    return explainPlannedStrengthSession(nextSession, {
      goal: block?.goal,
      previousSessionDate: previousStrengthDate(nextSession, sessions),
      nextKeyEnduranceDate: nextEnduranceDate(nextSession, events),
      hasTrainingHistory,
      hasConnectedTrainingData,
      hasReadinessData,
    });
  }, [block?.goal, events, hasConnectedTrainingData, hasReadinessData, hasTrainingHistory, nextSession, sessions]);

  function openNextSession() {
    if (!nextSession) return;
    openPlannedWorkoutPreview(nextSession, {
      goal: block?.goal,
      previousSessionDate: previousStrengthDate(nextSession, sessions),
      nextKeyEnduranceDate: nextEnduranceDate(nextSession, events),
      hasTrainingHistory,
      hasConnectedTrainingData,
      hasReadinessData,
    });
    router.push('/workout-preview' as Href);
  }

  return (
    <V23Screen contentStyle={styles.page}>
      {activeWorkout ? <ActiveWorkoutResumeCard workout={activeWorkout} planLink={activePlanLink} onResume={() => router.push('/active-workout' as Href)} compact /> : null}
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>CURRENT COACHING CALL</Text>
        <Text style={styles.title}>{nextSession ? 'Here is the next useful session.' : 'Start with the week.'}</Text>
        <Text style={styles.body}>
          {nextSession
            ? 'This recommendation uses your goal, current plan, schedule, and the training evidence Side Quest can actually see.'
            : 'Side Quest can make a specific recommendation after you set a goal, availability, and race priority.'}
        </Text>
      </View>

      {nextSession && explanation ? (
        <>
          <V23Card elevated style={styles.nextCard}>
            <View style={styles.nextHeader}>
              <View style={styles.nextCopy}>
                <Text style={styles.callLabel}>NEXT PLANNED STRENGTH</Text>
                <Text style={styles.callTitle}>{nextSession.title}</Text>
                <Text style={styles.dateText}>{formatSessionDate(nextSession.date)}</Text>
              </View>
              <View style={styles.icon}><V23Icon name="train" color={tokens.accent} size={22} /></View>
            </View>
            <View style={styles.chips}>
              <V23Chip>{nextSession.intendedLoad} load</V23Chip>
              <V23Chip tone="neutral">{Math.round(nextSession.workout.estimatedElapsedSeconds / 60)} min</V23Chip>
              <V23Chip tone="neutral">{nextSession.purpose.replaceAll('_', ' ')}</V23Chip>
            </View>
            <V23PrimaryButton onPress={openNextSession} icon="play">Review workout</V23PrimaryButton>
          </V23Card>
          <CoachInsights explanation={explanation} initiallyExpanded />
        </>
      ) : (
        <>
          <V23ScenicBanner variant="morning" />
          <V23Card elevated style={styles.callCard}>
            <View style={styles.callTop}>
              <View style={styles.nextCopy}>
                <Text style={styles.callLabel}>BEST NEXT MOVE</Text>
                <Text style={styles.callTitle}>Build a provisional week</Text>
              </View>
              <View style={styles.icon}><V23Icon name="goal" color={tokens.accent} size={22} /></View>
            </View>
            <Text style={styles.callBody}>You do not need perfect data. Start with what you know, then let the plan adapt as workouts arrive.</Text>
            <V23PrimaryButton onPress={() => router.push('/goal-catalog' as Href)}>Create my week</V23PrimaryButton>
          </V23Card>
        </>
      )}

      <View style={styles.questions}>
        {[
          ['What changed?', 'Review recent adjustments and activity matches.', '/weekly-review'],
          ['What needs attention?', 'Open the training body map and regional priorities.', '/insights'],
          ['How does this work?', 'Review the evidence and limits behind coaching decisions.', '/training-intelligence'],
        ].map(([title, body, route], index, rows) => (
          <Pressable
            key={title}
            onPress={() => router.push(route as Href)}
            style={({ pressed }) => [styles.question, index === rows.length - 1 && styles.questionLast, pressed && styles.pressed]}
          >
            <View style={styles.questionCopy}>
              <Text style={styles.questionTitle}>{title}</Text>
              <Text style={styles.questionBody}>{body}</Text>
            </View>
            <V23Icon name="chevron" color={tokens.textMuted} size={17} />
          </Pressable>
        ))}
      </View>
    </V23Screen>
  );
}

function selectNextSession(sessions: PlannedStrengthSession[]): PlannedStrengthSession | null {
  if (!sessions.length) return null;
  const today = localDate();
  const upcoming = sessions
    .filter((session) => session.completionStatus === 'planned' && session.date >= today)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (upcoming[0]) return upcoming[0];
  return sessions
    .filter((session) => session.completionStatus === 'planned')
    .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null;
}

function previousStrengthDate(session: PlannedStrengthSession, sessions: PlannedStrengthSession[]): string | undefined {
  return sessions
    .filter((candidate) => candidate.id !== session.id && candidate.date < session.date)
    .sort((left, right) => right.date.localeCompare(left.date))[0]?.date;
}

function nextEnduranceDate(session: PlannedStrengthSession, events: TrainingCalendarEvent[]): string | undefined {
  return events
    .filter((event) => event.startAt.slice(0, 10) >= session.date && event.discipline !== 'strength' && event.discipline !== 'rest')
    .sort((left, right) => left.startAt.localeCompare(right.startAt))[0]?.startAt.slice(0, 10);
}

function formatSessionDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { gap: 18, paddingTop: 22 },
    intro: { gap: 6 },
    eyebrow: { color: tokens.accent, fontSize: 11, lineHeight: 14, fontWeight: '900', letterSpacing: 1.25 },
    title: { color: tokens.text, fontSize: 31, lineHeight: 36, fontWeight: '900', letterSpacing: -0.7 },
    body: { color: tokens.textMuted, fontSize: 15.5, lineHeight: 22 },
    nextCard: { gap: 16, padding: 20 },
    nextHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    nextCopy: { flex: 1, minWidth: 0 },
    callCard: { gap: 16, padding: 20 },
    callTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    callLabel: { color: tokens.accent, fontSize: 10.5, lineHeight: 14, fontWeight: '900', letterSpacing: 1.1 },
    callTitle: { color: tokens.text, fontSize: 23, lineHeight: 28, fontWeight: '900', marginTop: 3 },
    dateText: { color: tokens.textMuted, fontSize: 14, lineHeight: 19, marginTop: 4 },
    callBody: { color: tokens.textMuted, fontSize: 15, lineHeight: 22 },
    icon: { width: 48, height: 48, borderRadius: 16, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    questions: { backgroundColor: tokens.surface, borderRadius: 22, borderWidth: 1, borderColor: tokens.border, overflow: 'hidden' },
    question: { minHeight: 78, paddingHorizontal: 17, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    questionLast: { borderBottomWidth: 0 },
    questionCopy: { flex: 1, gap: 2 },
    questionTitle: { color: tokens.text, fontSize: 16.5, lineHeight: 21, fontWeight: '800' },
    questionBody: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19 },
    pressed: { opacity: 0.7 },
  });
}
