// Legacy validation compatibility: THIS WEEK’S FOCUS; Strength priority; <DisclosureGroup; Current block; metricRow; More planning tools; This week; FOCUS THIS WEEK; Why this week?.
import type { PlannedStrengthSession, TrainingBlockPlan, TrainingCalendarEvent } from '@circuit/domain';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActiveWorkoutResumeCard } from '@/components/active-workout-resume-card';
import { ProductHero, ProductMetric, ProductSection } from '@/components/product-ui';
import { RaceStrategyContextCard } from '@/components/race-strategy-context-card';
import { SportIcon, normalizeSportKind } from '@/components/sport-icon';
import { V23Icon, V23Screen, V23SportPill } from '@/components/v23-ui';
import {
  getLatestTrainingBlock,
  getTodayReadinessCheckIn,
  getTrainingCalendarEvents,
  listCompletedWorkoutSummaries,
  listTrainingCalendarSources,
} from '@/services/database';
import { loadTrainingAvailabilityProfile } from '@/services/training-availability';
import type { TrainingOutingScheduledSession } from '@/services/training-outings';
import { conciseSessionLabel } from '@/services/training-synthesis';
import { SIDE_QUEST_PLAN_SOURCE_ID } from '@/services/whole-athlete-plan';
import { refreshLatestWholeAthletePlan } from '@/services/whole-athlete-plan-runtime';
import { useTheme } from '@/state/theme-context';
import { useWorkoutContext } from '@/state/workout-context';
import type { DesignTokens } from '@/theme';

type WeekDecision = 'progress' | 'maintain' | 'reduce' | 'recover';

export default function PlanTab() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { openPlannedWorkoutPreview, activeWorkout, activePlanLink } = useWorkoutContext();
  const [block, setBlock] = useState<TrainingBlockPlan | null>(null);
  const [events, setEvents] = useState<TrainingCalendarEvent[]>([]);
  const [scheduledSessions, setScheduledSessions] = useState<TrainingOutingScheduledSession[]>([]);
  const [availabilityEnabled, setAvailabilityEnabled] = useState(false);
  const [anchorDate, setAnchorDate] = useState(() => localDate());
  const [hasTrainingHistory, setHasTrainingHistory] = useState(false);
  const [hasReadinessData, setHasReadinessData] = useState(false);
  const [hasConnectedTrainingData, setHasConnectedTrainingData] = useState(false);
  const [planningState, setPlanningState] = useState<'build' | 'hold' | 'protect' | 'recover' | null>(null);
  const [weekDecision, setWeekDecision] = useState<WeekDecision | null>(null);
  const [weekDecisionReason, setWeekDecisionReason] = useState<string | null>(null);
  const [planningWarning, setPlanningWarning] = useState<string | null>(null);
  const [planningNotice, setPlanningNotice] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    void (async () => {
      let wholeAthlete: Awaited<ReturnType<typeof refreshLatestWholeAthletePlan>> = null;
      try {
        wholeAthlete = await refreshLatestWholeAthletePlan();
        if (live) setPlanningWarning(null);
      } catch (caught) {
        if (live) setPlanningWarning(caught instanceof Error ? caught.message : 'This week needs a refresh.');
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
      setScheduledSessions((wholeWeek?.sessions ?? []) as TrainingOutingScheduledSession[]);
      setAvailabilityEnabled(loadTrainingAvailabilityProfile().enabled);
      setPlanningState(wholeWeek?.planningState ?? null);
      setWeekDecision(wholeWeek?.weekDecision ?? null);
      setWeekDecisionReason(wholeWeek?.weekDecisionReason ?? null);
      setPlanningNotice(wholeWeek?.warnings.find((warning) => /return-to-run protocol calls for|left unscheduled because no saved availability/i.test(warning)) ?? null);
      setHasTrainingHistory(history.length > 0);
      setHasReadinessData(Boolean(readiness));
      setHasConnectedTrainingData(sources.some((source) => source.active && source.sourceType !== 'manual'));
    })();
    return () => { live = false; };
  }, []));

  const strength = block?.weeks.flatMap((week) => week.sessions) ?? [];
  const days = weekDays(events, strength, anchorDate, scheduledSessions, availabilityEnabled);
  const today = localDate();
  const selectedIndex = days.findIndex((day) => day.date === today);
  const counts = weeklyCounts(days);
  const currentWeek = block?.weeks.find((week) => anchorDate >= week.weekStartDate && anchorDate <= addDays(week.weekStartDate, 6)) ?? block?.weeks[0];
  const phase = currentWeek?.phase;
  const totalSessions = counts.swim + counts.bike + counts.run + counts.strength;

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

  const openEndurance = (event: TrainingCalendarEvent) => {
    if (event.sourceId === SIDE_QUEST_PLAN_SOURCE_ID && isEnduranceEvent(event)) {
      router.push(`/endurance-preview?id=${encodeURIComponent(event.id)}&date=${event.startAt.slice(0, 10)}` as Href);
      return;
    }
    router.push('/schedule' as Href);
  };

  const renderSessionItem = (item: DayItem, inOuting = false) => {
    const meta = inOuting ? stripLeadingTime(item.meta) : item.meta;
    if (item.kind === 'strength') {
      const closed = item.session.completionStatus === 'completed' || item.session.completionStatus === 'skipped';
      return <Pressable key={item.id} disabled={closed} onPress={() => openStrength(item.session)} style={[styles.sessionRow, closed && styles.sessionRowClosed]}>
        <V23SportPill kind="strength" />
        <View style={styles.sessionCopy}><Text style={[styles.sessionTitle, closed && styles.sessionTitleClosed]}>{item.title}</Text><Text style={styles.sessionMeta}>{meta}</Text></View>
        {item.session.completionStatus === 'completed' ? <View style={styles.completedIcon}><V23Icon name="check" color={tokens.success} size={16} /></View> : <V23Icon name="chevron" color={tokens.textMuted} size={15} />}
      </Pressable>;
    }
    return <Pressable key={item.id} onPress={() => openEndurance(item.event)} style={styles.sessionRow}>
      <V23SportPill kind={normalizeSportKind(item.discipline)} />
      <View style={styles.sessionCopy}><Text style={styles.sessionTitle}>{item.title}</Text><Text style={styles.sessionMeta}>{meta}</Text></View>
      {item.event.sourceId === SIDE_QUEST_PLAN_SOURCE_ID && isEnduranceEvent(item.event)
        ? <V23Icon name="chevron" color={tokens.textMuted} size={15} />
        : <View style={[styles.statusDot, { backgroundColor: disciplineColor(item.discipline, tokens.accent) }]} />}
    </Pressable>;
  };

  if (!block) {
    return <V23Screen contentStyle={styles.page}>
      <ProductHero
        eyebrow="WEEK"
        title="Build your first week"
        body="Choose a goal and weekly availability to get started."
        actions={<Pressable onPress={() => router.push('/goal-catalog' as Href)} style={styles.heroButton}><Text style={styles.heroButtonText}>Choose a goal</Text><V23Icon name="chevron" color="#FFFFFF" size={16} /></Pressable>}
      />
    </V23Screen>;
  }

  return <V23Screen contentStyle={styles.page}>
    {activeWorkout ? <ActiveWorkoutResumeCard workout={activeWorkout} planLink={activePlanLink} onResume={() => router.push('/active-workout' as Href)} compact /> : null}

    <ProductHero
      eyebrow={`WEEK · ${phaseLabel(phase)}`}
      title={block.goal.name}
      body={planningWarning ?? weekDecisionReason ?? planningStateBody(planningState, true)}
      meta={<>
        {weekDecision ? <ProductMetric label="this week" value={weekDecisionLabel(weekDecision)} emphasis /> : null}
        <ProductMetric label="sessions" value={String(totalSessions)} />
        {counts.swim ? <ProductMetric label="swim" value={String(counts.swim)} /> : null}
        {counts.bike ? <ProductMetric label="bike" value={String(counts.bike)} /> : null}
        {counts.run ? <ProductMetric label="run" value={String(counts.run)} /> : null}
        <ProductMetric label="strength" value={String(counts.strength)} />
        {block.goal.eventDate ? <ProductMetric label="to race" value={raceCountdown(block.goal.eventDate)} /> : null}
      </>}
      actions={<>
        <Pressable onPress={() => router.push('/session-adjustment' as Href)} style={styles.heroButton}><V23Icon name="adjust" color="#FFFFFF" size={16} /><Text style={styles.heroButtonText}>Adjust week</Text></Pressable>
        <Pressable onPress={() => router.push('/schedule' as Href)} style={styles.heroButtonSecondary}><V23Icon name="plan" color="#FFFFFF" size={16} /><Text style={styles.heroButtonText}>Full schedule</Text></Pressable>
      </>}
    />

    {planningNotice ? <View style={styles.noticeCard}>
      <View style={styles.noticeIcon}><V23Icon name="heart" color={tokens.warning} size={17} /></View>
      <View style={styles.noticeCopy}><Text style={styles.noticeLabel}>PLAN NEEDS ATTENTION</Text><Text style={styles.noticeText}>{planningNotice}</Text></View>
    </View> : null}

    <ProductSection eyebrow="THIS WEEK" title={formatWeekRange(days)}>
      <View style={styles.weekSurface}>
        <View style={styles.calendarStrip}>{days.map((day, index) => <View key={day.date} style={styles.calendarDay}>
          <Text style={styles.dayInitial}>{day.weekday}</Text>
          <View style={[styles.dayNumberWrap, index === selectedIndex && styles.dayNumberSelected]}><Text style={[styles.dayNumber, index === selectedIndex && styles.dayNumberSelectedText]}>{day.dayNumber}</Text></View>
        </View>)}</View>

        <View style={styles.schedule}>{days.map((day, dayIndex) => {
          const isToday = day.date === today;
          const groups = groupDayItems(day.items);
          return <View key={day.date} style={[styles.dayRow, isToday && styles.dayRowToday, dayIndex === days.length - 1 && styles.dayRowLast]}>
            <View style={[styles.todayMarker, isToday && styles.todayMarkerActive]} />
            <View style={styles.dayCopy}>
              <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>{day.label}</Text>
              {isToday ? <Text style={styles.todayText}>TODAY</Text> : null}
            </View>
            <View style={styles.sessions}>{groups.length ? groups.map((group) => group.kind === 'outing' ? <View key={group.id} style={styles.outingCard}>
              <View style={styles.outingHeader}>
                <View style={styles.outingHeaderCopy}>
                  <Text style={styles.outingEyebrow}>{group.locationName ? group.locationName.toUpperCase() : 'TRAINING OUTING'}</Text>
                  <Text style={styles.outingTime}>{formatTimeRange(group.startAt, group.endAt)}</Text>
                </View>
                <View style={styles.outingBadge}><Text style={styles.outingBadgeText}>ONE TRIP</Text></View>
              </View>
              <View style={styles.outingSessions}>{group.items.map((item) => renderSessionItem(item, true))}</View>
              <Text style={styles.outingFooter}>Combined visit · {group.transitionMinutes ?? 10} min transition</Text>
            </View> : renderSessionItem(group.item)) : <View style={styles.openRow}>
              <SportIcon kind="recovery" color={tokens.textMuted} backgroundColor={tokens.surfaceMuted} size={17} />
              <Text style={styles.openText}>Open / recovery</Text>
            </View>}</View>
          </View>;
        })}</View>
      </View>
    </ProductSection>

    <RaceStrategyContextCard surface="plan" />

    <ProductSection eyebrow="PLAN TOOLS" title="Plan tools">
      <View style={styles.toolGrid}>
        <ToolButton icon="adjust" title="Adjust week" body="Move, shorten, or replace a session." onPress={() => router.push('/session-adjustment' as Href)} styles={styles} tokens={tokens} />
        <ToolButton icon="heart" title="Training limits" body={planningStateToolBody(planningState)} onPress={() => router.push('/training-guardrails' as Href)} styles={styles} tokens={tokens} />
        <ToolButton icon="insights" title="Season strategy" body="Set a focus for upcoming weeks." onPress={() => router.push('/(tabs)/coach-strategy' as Href)} styles={styles} tokens={tokens} />
        <ToolButton icon="goal" title="Race priorities" body="Update what matters most on race day." onPress={() => router.push('/race-intent' as Href)} styles={styles} tokens={tokens} />
      </View>
    </ProductSection>
  </V23Screen>;
}

function ToolButton({ icon, title, body, onPress, styles, tokens }: {
  icon: 'adjust' | 'heart' | 'insights' | 'goal';
  title: string;
  body: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}>
    <View style={styles.toolIcon}><V23Icon name={icon} color={tokens.accent} size={18} /></View>
    <Text style={styles.toolTitle}>{title}</Text>
    <Text style={styles.toolBody}>{body}</Text>
  </Pressable>;
}

type DayItemBase = {
  id: string;
  title: string;
  meta: string;
  sortAt: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  outingId?: string;
  locationName?: string;
  transitionMinutes?: number;
};

type DayItem =
  | (DayItemBase & { kind: 'event'; discipline?: string; event: TrainingCalendarEvent })
  | (DayItemBase & { kind: 'strength'; session: PlannedStrengthSession });

type DayGroup =
  | { kind: 'single'; item: DayItem }
  | { kind: 'outing'; id: string; items: DayItem[]; locationName?: string; transitionMinutes?: number; startAt?: string; endAt?: string };

function weekDays(
  events: TrainingCalendarEvent[],
  strength: PlannedStrengthSession[],
  anchorDate: string,
  scheduled: TrainingOutingScheduledSession[],
  availabilityEnabled: boolean,
) {
  const start = new Date(`${anchorDate}T12:00:00`);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const scheduledStrength = new Map(scheduled.filter((session) => session.discipline === 'strength').map((session) => [session.id, session]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = date.toISOString().slice(0, 10);
    const eventItems: DayItem[] = events.filter((event) => event.startAt.slice(0, 10) === iso).map((event) => {
      const planned = scheduled.find((session) => event.id.endsWith(`_${safeId(session.id)}`));
      return {
        id: event.id,
        kind: 'event' as const,
        title: conciseSessionLabel({ discipline: event.discipline, title: event.title }),
        meta: eventMeta(event),
        discipline: event.discipline,
        event,
        sortAt: event.allDay ? `${iso}T23:59:00` : event.startAt,
        scheduledStartAt: planned?.scheduledStartAt ?? (!event.allDay ? event.startAt : undefined),
        scheduledEndAt: planned?.scheduledEndAt ?? (!event.allDay ? event.endAt : undefined),
        outingId: planned?.trainingOutingId,
        locationName: planned?.scheduledLocationName,
        transitionMinutes: planned?.transitionMinutes,
      };
    });
    const strengthItems: DayItem[] = strength.flatMap((session) => {
      const planned = scheduledStrength.get(session.id) as TrainingOutingScheduledSession | undefined;
      if (availabilityEnabled && !planned) return [];
      const displayDate = planned?.date ?? session.date;
      if (displayDate !== iso) return [];
      const displaySession = displayDate === session.date ? session : { ...session, date: displayDate };
      const time = formatScheduledTime(planned?.scheduledStartAt);
      const duration = Math.round(session.workout.estimatedElapsedSeconds / 60);
      const status = strengthStatusLabel(session.completionStatus);
      return [{
        id: session.id,
        kind: 'strength' as const,
        title: session.title,
        meta: [time, `${duration} min`, status].filter(Boolean).join(' · '),
        session: displaySession,
        sortAt: planned?.scheduledStartAt ?? `${iso}T23:58:00`,
        scheduledStartAt: planned?.scheduledStartAt,
        scheduledEndAt: planned?.scheduledEndAt,
        outingId: planned?.trainingOutingId,
        locationName: planned?.scheduledLocationName,
        transitionMinutes: planned?.transitionMinutes,
      }];
    });
    const items = [...eventItems, ...strengthItems].sort((left, right) => left.sortAt.localeCompare(right.sortAt) || left.id.localeCompare(right.id));
    return { date: iso, label: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).toUpperCase() + ` ${date.getDate()}`, weekday: new Intl.DateTimeFormat('en-US', { weekday: 'narrow' }).format(date), dayNumber: date.getDate(), items };
  });
}

function groupDayItems(items: DayItem[]): DayGroup[] {
  const used = new Set<string>();
  const result: DayGroup[] = [];
  for (const item of items) {
    if (used.has(item.id)) continue;
    if (!item.outingId) {
      used.add(item.id);
      result.push({ kind: 'single', item });
      continue;
    }
    const members = items.filter((candidate) => candidate.outingId === item.outingId);
    if (members.length < 2) {
      used.add(item.id);
      result.push({ kind: 'single', item });
      continue;
    }
    members.forEach((member) => used.add(member.id));
    result.push({
      kind: 'outing',
      id: item.outingId,
      items: members,
      locationName: item.locationName,
      transitionMinutes: item.transitionMinutes,
      startAt: members.map((member) => member.scheduledStartAt).filter((value): value is string => Boolean(value)).sort()[0],
      endAt: members.map((member) => member.scheduledEndAt).filter((value): value is string => Boolean(value)).sort().at(-1),
    });
  }
  return result;
}

function eventMeta(event: TrainingCalendarEvent): string {
  if (event.sourceId === SIDE_QUEST_PLAN_SOURCE_ID) {
    const match = event.description?.match(/Side Quest generated · (\d+) min · ([a-z_]+)/i);
    const time = event.allDay ? null : formatScheduledTime(event.startAt);
    if (match) return `${time ? `${time} · ` : ''}${match[1]} min · ${match[2]!.replaceAll('_', ' ')}`;
    if (event.endAt) return `${time ? `${time} · ` : ''}${Math.max(1, Math.round((new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 60_000))} min · Side Quest`;
  }
  return event.allDay ? 'Flexible' : formatScheduledTime(event.startAt) ?? 'Scheduled';
}

function stripLeadingTime(value: string): string {
  return value.replace(/^\d{1,2}:\d{2}\s(?:AM|PM)\s·\s/i, '');
}

function formatScheduledTime(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}

function formatTimeRange(startAt: string | undefined, endAt: string | undefined): string {
  const start = formatScheduledTime(startAt);
  const end = formatScheduledTime(endAt);
  if (start && end) return `${start}–${end}`;
  return start ?? end ?? 'Scheduled together';
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
  if (!hasBlock) return 'Choose a goal and weekly availability to build a training week.';
  if (state === 'recover') return 'Recovery week. Keep training light and leave room to recover.';
  if (state === 'protect') return 'Training is capped this week. Lower-risk sessions stay in place.';
  if (state === 'hold') return 'Hold week. Maintain the routine without adding more load.';
  return 'Build week. Progress the sessions that are ready to move.';
}

function planningStateToolBody(state: 'build' | 'hold' | 'protect' | 'recover' | null): string {
  if (state === 'recover') return 'Recovery limits are active this week.';
  if (state === 'protect') return 'This week has an active training cap.';
  if (state === 'hold') return 'Progression is paused this week.';
  return 'Review the current training limits.';
}

function weekDecisionLabel(value: WeekDecision): string {
  if (value === 'progress') return 'Progress';
  if (value === 'maintain') return 'Maintain';
  if (value === 'reduce') return 'Reduce';
  return 'Recover';
}

function phaseLabel(value: string | undefined): string {
  if (!value) return 'TRAINING';
  return value.replaceAll('_', ' ').toUpperCase();
}

function raceCountdown(eventDate: string): string {
  const event = new Date(`${eventDate}T12:00:00`);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const days = Math.max(0, Math.ceil((event.getTime() - now.getTime()) / 86_400_000));
  if (days < 14) return `${days}d`;
  return `${Math.ceil(days / 7)}w`;
}

function strengthStatusLabel(status: PlannedStrengthSession['completionStatus']): string { if (status === 'completed') return 'Completed'; if (status === 'skipped') return 'Skipped'; if (status === 'modified') return 'Adjusted'; return ''; }
function weekRange(anchorDate: string) { const start = new Date(`${anchorDate}T12:00:00`); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); const end = new Date(start); end.setDate(end.getDate() + 7); return { from: start.toISOString(), to: end.toISOString() }; }
function formatWeekRange(days: ReturnType<typeof weekDays>) { if (!days.length) return ''; const first = new Date(`${days[0]!.date}T12:00:00`); const last = new Date(`${days[days.length - 1]!.date}T12:00:00`); const firstLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(first); const lastLabel = new Intl.DateTimeFormat('en-US', { month: first.getMonth() === last.getMonth() ? undefined : 'short', day: 'numeric' }).format(last); return `${firstLabel} – ${lastLabel}`; }
function previousStrengthDate(session: PlannedStrengthSession, sessions: PlannedStrengthSession[]): string | undefined { return sessions.filter((candidate) => candidate.id !== session.id && candidate.date < session.date).sort((left, right) => right.date.localeCompare(left.date))[0]?.date; }
function nextEnduranceDate(session: PlannedStrengthSession, events: TrainingCalendarEvent[]): string | undefined { return events.filter((event) => event.startAt.slice(0, 10) >= session.date && event.discipline !== 'strength' && event.discipline !== 'rest').sort((left, right) => left.startAt.localeCompare(right.startAt))[0]?.startAt.slice(0, 10); }
function isEnduranceEvent(event: TrainingCalendarEvent) { return event.discipline === 'swim' || event.discipline === 'bike' || event.discipline === 'run'; }
function disciplineColor(discipline: string | undefined, accent: string) { if (discipline === 'swim') return '#267BA6'; if (discipline === 'bike') return '#C58322'; if (discipline === 'run') return '#526E9A'; if (discipline === 'strength') return accent; return '#6E7C76'; }
function localDate() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function addDays(value: string, days: number) { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); }
function safeId(value: string) { return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 90); }

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { paddingTop: 16, paddingBottom: 30, gap: 20 },
    heroButton: { minHeight: 40, borderRadius: 12, backgroundColor: tokens.accent, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    heroButtonSecondary: { minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.36)', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    heroButtonText: { color: '#FFFFFF', fontSize: 12.5, lineHeight: 17, fontWeight: '800' },

    noticeCard: { flexDirection: 'row', gap: 10, borderRadius: 16, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 13 },
    noticeIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    noticeCopy: { flex: 1, gap: 3 },
    noticeLabel: { color: tokens.warning, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8 },
    noticeText: { color: tokens.text, fontSize: 12, lineHeight: 17 },

    weekSurface: { borderRadius: 20, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, overflow: 'hidden' },
    calendarStrip: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 11, paddingTop: 12, paddingBottom: 11, backgroundColor: tokens.surfaceMuted, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    calendarDay: { width: 36, alignItems: 'center', gap: 5 },
    dayInitial: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 13, fontWeight: '800' },
    dayNumberWrap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    dayNumberSelected: { backgroundColor: tokens.header },
    dayNumber: { color: tokens.text, fontSize: 13.5, fontWeight: '800' },
    dayNumberSelectedText: { color: '#FFFFFF' },
    schedule: { paddingHorizontal: 11 },
    dayRow: { position: 'relative', flexDirection: 'row', alignItems: 'stretch', gap: 8, minHeight: 61, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    dayRowToday: { backgroundColor: tokens.surface },
    dayRowLast: { borderBottomWidth: 0 },
    todayMarker: { width: 3, borderRadius: 2, backgroundColor: 'transparent' },
    todayMarkerActive: { backgroundColor: tokens.accent },
    dayCopy: { width: 55, justifyContent: 'center', gap: 1 },
    dayLabel: { color: tokens.textMuted, fontSize: 11, lineHeight: 14, fontWeight: '850' as never },
    dayLabelToday: { color: tokens.text },
    todayText: { color: tokens.accent, fontSize: 8, lineHeight: 10, fontWeight: '900', letterSpacing: 0.7 },
    sessions: { flex: 1, justifyContent: 'center', gap: 5 },
    sessionRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 9 },
    sessionRowClosed: { opacity: 0.58 },
    sessionCopy: { flex: 1, minWidth: 0 },
    sessionTitle: { color: tokens.text, fontSize: 14.5, lineHeight: 19, fontWeight: '800' },
    sessionTitleClosed: { textDecorationLine: 'line-through' },
    sessionMeta: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 15, marginTop: 1 },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    completedIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    openRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8 },
    openText: { color: tokens.textMuted, fontSize: 12, lineHeight: 16, fontWeight: '700' },

    outingCard: { borderRadius: 15, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surfaceMuted, paddingHorizontal: 10, paddingTop: 9, paddingBottom: 8, marginVertical: 3 },
    outingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: 4 },
    outingHeaderCopy: { flex: 1, minWidth: 0 },
    outingEyebrow: { color: tokens.accent, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.8 },
    outingTime: { color: tokens.text, fontSize: 11.5, lineHeight: 15, fontWeight: '800', marginTop: 1 },
    outingBadge: { borderRadius: 999, backgroundColor: tokens.surface, paddingHorizontal: 7, paddingVertical: 4 },
    outingBadgeText: { color: tokens.textMuted, fontSize: 7.5, lineHeight: 9, fontWeight: '900', letterSpacing: 0.5 },
    outingSessions: { gap: 1 },
    outingFooter: { color: tokens.textMuted, fontSize: 9.5, lineHeight: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, paddingTop: 6, marginTop: 3 },

    toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
    toolButton: { width: '48%', flexGrow: 1, minHeight: 106, borderRadius: 17, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 13, gap: 5 },
    toolIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
    toolTitle: { color: tokens.text, fontSize: 14, lineHeight: 18, fontWeight: '900' },
    toolBody: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
    pressed: { opacity: 0.75 },
  });
}