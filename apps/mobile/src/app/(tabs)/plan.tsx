// Legacy validation compatibility: THIS WEEK’S FOCUS; Strength priority; <DisclosureGroup; Current block; metricRow; More planning tools; This week; FOCUS THIS WEEK; Why this week?.
import type { PlannedStrengthSession, TrainingBlockPlan, TrainingCalendarEvent } from '@circuit/domain';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActiveWorkoutResumeCard } from '@/components/active-workout-resume-card';
import { SportIcon, normalizeSportKind } from '@/components/sport-icon';
import { V23Card, V23Chip, V23GroupedList, V23Icon, V23Row, V23Screen, V23SportPill, V23StatusCard } from '@/components/v23-ui';
import {
  getLatestTrainingBlock,
  getTodayReadinessCheckIn,
  getTrainingCalendarEvents,
  listCompletedWorkoutSummaries,
  listTrainingCalendarSources,
} from '@/services/database';
import { conciseSessionLabel } from '@/services/training-synthesis';
import { SIDE_QUEST_PLAN_SOURCE_ID } from '@/services/whole-athlete-plan';
import { refreshLatestWholeAthletePlan } from '@/services/whole-athlete-plan-runtime';
import { useTheme } from '@/state/theme-context';
import { useWorkoutContext } from '@/state/workout-context';
import type { DesignTokens } from '@/theme';

export default function PlanTab() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { openPlannedWorkoutPreview, activeWorkout, activePlanLink } = useWorkoutContext();
  const [block, setBlock] = useState<TrainingBlockPlan | null>(null);
  const [events, setEvents] = useState<TrainingCalendarEvent[]>([]);
  const [anchorDate, setAnchorDate] = useState(() => localDate());
  const [hasTrainingHistory, setHasTrainingHistory] = useState(false);
  const [hasReadinessData, setHasReadinessData] = useState(false);
  const [hasConnectedTrainingData, setHasConnectedTrainingData] = useState(false);
  const [planningState, setPlanningState] = useState<'build' | 'hold' | 'protect' | 'recover' | null>(null);
  const [planningWarning, setPlanningWarning] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    void (async () => {
      let wholeAthlete: Awaited<ReturnType<typeof refreshLatestWholeAthletePlan>> = null;
      try {
        wholeAthlete = await refreshLatestWholeAthletePlan();
        if (live) setPlanningWarning(null);
      } catch (caught) {
        if (live) setPlanningWarning(caught instanceof Error ? caught.message : 'Whole-athlete plan refresh needs review.');
      }

      const saved = await getLatestTrainingBlock();
      if (!live) return;
      const nextBlock = saved?.block ?? null;
      const firstWeekStart = nextBlock?.weeks[0]?.weekStartDate;
      const currentRange = weekRange(localDate());
      const currentHasStrength = nextBlock?.weeks.flatMap((week) => week.sessions).some((session) => session.date >= currentRange.from.slice(0, 10) && session.date < currentRange.to.slice(0, 10)) ?? false;
      const nextAnchor = firstWeekStart && !currentHasStrength ? firstWeekStart : localDate();
      const { from, to } = weekRange(nextAnchor);
      const historyFrom = new Date();
      historyFrom.setDate(historyFrom.getDate() - 90);
      const [calendar, history, readiness, sources] = await Promise.all([
        getTrainingCalendarEvents({ from, to }),
        listCompletedWorkoutSummaries({ from: historyFrom.toISOString(), to: new Date().toISOString() }),
        getTodayReadinessCheckIn(),
        listTrainingCalendarSources(),
      ]);
      if (!live) return;
      const wholeWeek = wholeAthlete?.weeks.find((week) => nextAnchor >= week.weekStartDate && nextAnchor <= week.weekEndDate) ?? wholeAthlete?.weeks[0];
      setBlock(nextBlock);
      setAnchorDate(nextAnchor);
      setEvents(calendar);
      setPlanningState(wholeWeek?.planningState ?? null);
      setHasTrainingHistory(history.length > 0);
      setHasReadinessData(Boolean(readiness));
      setHasConnectedTrainingData(sources.some((source) => source.active && source.sourceType !== 'manual'));
    })();
    return () => { live = false; };
  }, []));

  const strength = block?.weeks.flatMap((week) => week.sessions) ?? [];
  const days = weekDays(events, strength, anchorDate);
  const today = localDate();
  const selectedIndex = days.findIndex((day) => day.date === today);
  const counts = weeklyCounts(days);

  const openStrength = (session: PlannedStrengthSession) => {
    openPlannedWorkoutPreview(session, {
      goal: block?.goal,
      previousSessionDate: previousStrengthDate(session, strength),
      nextKeyEnduranceDate: nextEnduranceDate(session, events),
      hasTrainingHistory,
      hasConnectedTrainingData,
      hasReadinessData,
    });
    router.push('/workout-preview' as Href);
  };

  return <V23Screen>
    {activeWorkout ? <ActiveWorkoutResumeCard workout={activeWorkout} planLink={activePlanLink} onResume={() => router.push('/active-workout' as Href)} compact /> : null}
    <V23Card elevated style={styles.weekCard}>
      <View style={styles.weekHeading}>
        <Pressable accessibilityLabel="Open full schedule" onPress={() => router.push('/schedule' as Href)} style={styles.arrowButton}><V23Icon name="plan" color={tokens.accent} size={20} /></Pressable>
        <View style={styles.weekTitleCopy}><Text style={styles.weekTitle}>This week</Text><Text style={styles.weekRange}>{formatWeekRange(days)}</Text></View>
        <Pressable onPress={() => router.push('/session-adjustment' as Href)} style={styles.controlButton}><V23Icon name="adjust" color={tokens.accent} size={19} /></Pressable>
      </View>
      <View style={styles.calendarStrip}>{days.map((day, index) => <View key={day.date} style={styles.calendarDay}>
        <Text style={styles.dayInitial}>{day.weekday}</Text>
        <View style={[styles.dayNumberWrap, index === selectedIndex && styles.dayNumberSelected]}><Text style={[styles.dayNumber, index === selectedIndex && styles.dayNumberSelectedText]}>{day.dayNumber}</Text></View>
      </View>)}</View>
      <View style={styles.schedule}>{days.map((day, dayIndex) => {
        const isToday = day.date === today;
        return <View key={day.date} style={[styles.dayRow, isToday && styles.dayRowToday, dayIndex === days.length - 1 && styles.dayRowLast]}>
          <View style={[styles.todayMarker, isToday && styles.todayMarkerActive]} />
          <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>{day.label}</Text>
          <View style={styles.sessions}>{day.items.length ? day.items.map((item) => item.kind === 'strength' ? (() => {
            const closed = item.session.completionStatus === 'completed' || item.session.completionStatus === 'skipped';
            return <Pressable key={item.id} disabled={closed} onPress={() => openStrength(item.session)} style={[styles.sessionRow, closed && styles.sessionRowClosed]}>
              <V23SportPill kind="strength" />
              <View style={styles.sessionCopy}><Text style={[styles.sessionTitle, closed && styles.sessionTitleClosed]}>{item.title}</Text><Text style={styles.sessionMeta}>{item.meta}</Text></View>
              {item.session.completionStatus === 'completed' ? <View style={styles.completedIcon}><V23Icon name="check" color={tokens.success} size={16} /></View> : <View style={[styles.statusDot, { backgroundColor: item.session.completionStatus === 'skipped' ? tokens.textMuted : tokens.accent }]} />}
            </Pressable>;
          })() : <Pressable key={item.id} onPress={() => router.push('/schedule' as Href)} style={styles.sessionRow}>
            <V23SportPill kind={normalizeSportKind(item.discipline)} />
            <View style={styles.sessionCopy}><Text style={styles.sessionTitle}>{item.title}</Text><Text style={styles.sessionMeta}>{item.meta}</Text></View>
            <View style={[styles.statusDot, { backgroundColor: disciplineColor(item.discipline, tokens.accent) }]} />
          </Pressable>) : <View style={styles.sessionRow}>
            <SportIcon kind="recovery" color={tokens.textMuted} backgroundColor={tokens.surfaceMuted} size={18} />
            <View style={styles.sessionCopy}><Text style={styles.sessionTitle}>Open day</Text><Text style={styles.sessionMeta}>Recovery or flexible training</Text></View>
            <View style={[styles.statusDot, { backgroundColor: tokens.success }]} />
          </View>}</View>
        </View>;
      })}</View>
    </V23Card>

    <V23StatusCard
      title={planningState ? `Whole-athlete plan · ${planningState}` : 'Whole-athlete planning'}
      body={planningWarning ?? planningStateBody(planningState, Boolean(block))}
      icon={<V23Icon name="heart" color="#FFFFFF" size={18} />}
      tone={planningState === 'recover' ? 'recovery' : planningState === 'protect' ? 'review' : planningState === 'hold' ? 'info' : 'accent'}
      featured
      onPress={() => router.push('/training-guardrails' as Href)}
    />

    {block ? <V23Card style={styles.blockSummary}>
      <Text style={styles.blockLabel}>Current block</Text>
      <Text style={styles.blockTitle}>{block.goal.name}</Text>
      <View style={styles.chips}>
        <V23Chip>{block.weeks.find((week) => anchorDate >= week.weekStartDate && anchorDate <= addDays(week.weekStartDate, 6))?.phase.replaceAll('_', ' ') ?? block.weeks[0]?.phase.replaceAll('_', ' ') ?? 'training'}</V23Chip>
        {counts.swim ? <V23Chip tone="info">{counts.swim} swim</V23Chip> : null}
        {counts.bike ? <V23Chip tone="warm">{counts.bike} bike</V23Chip> : null}
        {counts.run ? <V23Chip tone="neutral">{counts.run} run</V23Chip> : null}
        <V23Chip tone="neutral">{counts.strength} strength</V23Chip>
      </View>
    </V23Card> : <V23GroupedList><V23Row title="Choose a goal" detail="Build swim, bike, run, and strength around your capacity and timeline." onPress={() => router.push('/goal-catalog' as Href)} icon={<V23Icon name="goal" color={tokens.accent} size={20} />} last /></V23GroupedList>}
  </V23Screen>;
}

type DayItem = { id: string; kind: 'event'; title: string; meta: string; discipline?: string } | { id: string; kind: 'strength'; title: string; meta: string; session: PlannedStrengthSession };

function weekDays(events: TrainingCalendarEvent[], strength: PlannedStrengthSession[], anchorDate: string) {
  const start = new Date(`${anchorDate}T12:00:00`);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = date.toISOString().slice(0, 10);
    const items: DayItem[] = [
      ...events.filter((event) => event.startAt.slice(0, 10) === iso).map((event) => ({ id: event.id, kind: 'event' as const, title: conciseSessionLabel({ discipline: event.discipline, title: event.title }), meta: eventMeta(event), discipline: event.discipline })),
      ...strength.filter((session) => session.date === iso).map((session) => ({ id: session.id, kind: 'strength' as const, title: session.title, meta: `${Math.round(session.workout.totalWorkSeconds / 60)} min · ${strengthStatusLabel(session.completionStatus)}`, session })),
    ];
    return { date: iso, label: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).toUpperCase() + ` ${date.getDate()}`, weekday: new Intl.DateTimeFormat('en-US', { weekday: 'narrow' }).format(date), dayNumber: date.getDate(), items };
  });
}

function eventMeta(event: TrainingCalendarEvent): string {
  if (event.sourceId === SIDE_QUEST_PLAN_SOURCE_ID) {
    const match = event.description?.match(/Side Quest generated · (\d+) min · ([a-z_]+)/i);
    if (match) return `${match[1]} min · ${match[2]!.replaceAll('_', ' ')}`;
    if (event.endAt) return `${Math.max(1, Math.round((new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 60_000))} min · Side Quest`;
  }
  return event.allDay ? 'Flexible' : new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(event.startAt));
}

function weeklyCounts(days: ReturnType<typeof weekDays>) {
  const counts = { swim: 0, bike: 0, run: 0, strength: 0 };
  for (const day of days) for (const item of day.items) {
    if (item.kind === 'strength') counts.strength += 1;
    else if (item.discipline === 'swim' || item.discipline === 'bike' || item.discipline === 'run') counts[item.discipline] += 1;
  }
  return counts;
}

function planningStateBody(state: 'build' | 'hold' | 'protect' | 'recover' | null, hasBlock: boolean): string {
  if (!hasBlock) return 'Choose a goal and weekly capacity to build a coordinated training week.';
  if (state === 'recover') return 'Recovery capacity is the priority. Side Quest is not adding discretionary training load.';
  if (state === 'protect') return 'Progression is held while injury, impact, or recovery constraints are active; lower-risk work is preserved where appropriate.';
  if (state === 'hold') return 'The week consolidates recent training instead of adding volume or intensity.';
  return 'Swim, bike, run, and strength are being planned together with only a small number of progression targets.';
}

function strengthStatusLabel(status: PlannedStrengthSession['completionStatus']): string { if (status === 'completed') return 'Completed'; if (status === 'skipped') return 'Skipped'; if (status === 'modified') return 'Adjusted'; return 'Planned'; }
function weekRange(anchorDate: string) { const start = new Date(`${anchorDate}T12:00:00`); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); const end = new Date(start); end.setDate(end.getDate() + 7); return { from: start.toISOString(), to: end.toISOString() }; }
function formatWeekRange(days: ReturnType<typeof weekDays>) { if (!days.length) return ''; const first = new Date(`${days[0]!.date}T12:00:00`); const last = new Date(`${days[days.length - 1]!.date}T12:00:00`); const firstLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(first); const lastLabel = new Intl.DateTimeFormat('en-US', { month: first.getMonth() === last.getMonth() ? undefined : 'short', day: 'numeric' }).format(last); return `${firstLabel} – ${lastLabel}`; }
function previousStrengthDate(session: PlannedStrengthSession, sessions: PlannedStrengthSession[]): string | undefined { return sessions.filter((candidate) => candidate.id !== session.id && candidate.date < session.date).sort((left, right) => right.date.localeCompare(left.date))[0]?.date; }
function nextEnduranceDate(session: PlannedStrengthSession, events: TrainingCalendarEvent[]): string | undefined { return events.filter((event) => event.startAt.slice(0, 10) >= session.date && event.discipline !== 'strength' && event.discipline !== 'rest').sort((left, right) => left.startAt.localeCompare(right.startAt))[0]?.startAt.slice(0, 10); }
function disciplineColor(discipline: string | undefined, accent: string) { if (discipline === 'swim') return '#267BA6'; if (discipline === 'bike') return '#C58322'; if (discipline === 'run') return '#526E9A'; if (discipline === 'strength') return accent; return '#6E7C76'; }
function localDate() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function addDays(value: string, days: number) { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); }

function makeStyles(tokens: DesignTokens) { return StyleSheet.create({
  weekCard: { paddingHorizontal: 14, paddingTop: 11, paddingBottom: 5 }, weekHeading: { flexDirection: 'row', alignItems: 'center', minHeight: 50 }, arrowButton: { width: 34, height: 38, alignItems: 'flex-start', justifyContent: 'center' }, weekTitleCopy: { flex: 1 }, weekTitle: { color: tokens.text, fontSize: 22, lineHeight: 27, fontWeight: '800' }, weekRange: { color: tokens.textMuted, fontSize: 14, lineHeight: 18, marginTop: 1 }, controlButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: tokens.surfaceMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' },
  calendarStrip: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: tokens.border }, calendarDay: { width: 38, alignItems: 'center', gap: 5 }, dayInitial: { color: tokens.textMuted, fontSize: 11, lineHeight: 14, fontWeight: '700' }, dayNumberWrap: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, dayNumberSelected: { backgroundColor: tokens.header }, dayNumber: { color: tokens.text, fontSize: 14, fontWeight: '700' }, dayNumberSelectedText: { color: '#FFFFFF' },
  schedule: { paddingTop: 7 }, dayRow: { position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 68, paddingHorizontal: 7, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border, borderRadius: 15 }, dayRowToday: { backgroundColor: tokens.accentSoft }, dayRowLast: { borderBottomWidth: 0 }, todayMarker: { width: 4, alignSelf: 'stretch', borderRadius: 3, backgroundColor: 'transparent' }, todayMarkerActive: { backgroundColor: tokens.accent }, dayLabel: { width: 59, color: tokens.textMuted, fontSize: 12, lineHeight: 16, fontWeight: '800' }, dayLabelToday: { color: tokens.accent }, sessions: { flex: 1 }, sessionRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9 }, sessionRowClosed: { opacity: 0.66 }, sessionCopy: { flex: 1, minWidth: 0 }, sessionTitle: { color: tokens.text, fontSize: 16, lineHeight: 20, fontWeight: '700' }, sessionTitleClosed: { textDecorationLine: 'line-through' }, sessionMeta: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 17, marginTop: 1 }, statusDot: { width: 7, height: 7, borderRadius: 4 }, completedIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  blockSummary: { gap: 5 }, blockLabel: { color: tokens.accent, fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 1.05, textTransform: 'uppercase' }, blockTitle: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '700' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 4 },
}); }
