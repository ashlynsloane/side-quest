import type {
  EnduranceActivity,
  PlannedCompletedMatch,
  PlannedStrengthSession,
  TrainingBlockPlan,
  TrainingCalendarEvent,
} from '@circuit/domain';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProductAction, ProductDisclosure } from '@/components/product-ui';
import { SportIcon, normalizeSportKind } from '@/components/sport-icon';
import { V23Icon, V23ScenicBanner, V23Screen } from '@/components/v23-ui';
import {
  getLatestTrainingBlock,
  getTodayReadinessCheckIn,
  getTrainingCalendarEvents,
  listEnduranceActivities,
  listPlannedCompletedMatches,
} from '@/services/database';
import {
  readinessBand,
  readinessHeadline,
  type DailyReadinessCheckIn,
} from '@/services/readiness';
import { conciseSessionLabel } from '@/services/training-synthesis';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';
import { useWorkoutContext } from '@/state/workout-context';
import type { DesignTokens } from '@/theme';

export default function TodayScreenV2() {
  const router = useRouter();
  const { user } = useAuth();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { setPreviewWorkout } = useWorkoutContext();
  const [block, setBlock] = useState<TrainingBlockPlan | null>(null);
  const [readiness, setReadiness] = useState<DailyReadinessCheckIn | null>(null);
  const [events, setEvents] = useState<TrainingCalendarEvent[]>([]);
  const [activities, setActivities] = useState<EnduranceActivity[]>([]);
  const [matches, setMatches] = useState<PlannedCompletedMatch[]>([]);
  const [weekExpanded, setWeekExpanded] = useState(false);

  useFocusEffect(useCallback(() => {
    let live = true;
    const from = startOfToday();
    const to = new Date(from);
    to.setDate(to.getDate() + 1);

    void Promise.all([
      getLatestTrainingBlock(),
      getTodayReadinessCheckIn(),
      getTrainingCalendarEvents({ from: from.toISOString(), to: to.toISOString() }),
      listEnduranceActivities({ from: from.toISOString(), to: to.toISOString(), limit: 30 }),
      listPlannedCompletedMatches(),
    ]).then(([saved, ready, calendar, completed, plannedMatches]) => {
      if (!live) return;
      setBlock(saved?.block ?? null);
      setReadiness(ready);
      setEvents(calendar);
      setActivities(completed.filter((activity) => activity.classification !== 'ignored'));
      setMatches(plannedMatches);
    });

    return () => { live = false; };
  }, []));

  const today = localDate();
  const allStrength = block?.weeks.flatMap((week) => week.sessions) ?? [];
  const todayStrength = allStrength.filter((session) => session.date === today && session.completionStatus !== 'skipped');
  const strength = todayStrength[0];
  const calendar = firstUpcomingEvent(events);
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || 'Athlete';
  const hasPlan = Boolean(block && (allStrength.length > 0 || block.weeks.length > 0));
  const ambiguous = matches.filter((match) => match.status === 'ambiguous').length;

  function startStrength() {
    if (!strength) {
      router.push('/generate' as Href);
      return;
    }
    setPreviewWorkout(strength.workout);
    router.push('/workout-preview' as Href);
  }

  return <V23Screen contentStyle={styles.page}>
    <View style={styles.headerRow}>
      <View style={styles.headerCopy}>
        <Text style={styles.greeting}>{timeAwareGreeting()}, {firstName}.</Text>
        <Text style={styles.date}>{longDate()}</Text>
      </View>
      {hasPlan ? <Pressable accessibilityRole="button" onPress={() => router.push('/readiness' as Href)} style={({ pressed }) => [styles.checkInButton, pressed && styles.pressed]}>
        <V23Icon name="heart" color={tokens.accent} size={16} />
        <Text style={styles.checkInText}>{readiness ? 'Check-in logged' : 'Check in'}</Text>
      </Pressable> : null}
    </View>

    {!hasPlan ? <ColdStart router={router} tokens={tokens} styles={styles} /> : <>
      <TodayCall
        strength={strength}
        calendar={calendar}
        readiness={readiness}
        onPrimary={strength ? startStrength : () => calendar ? router.push('/plan' as Href) : startStrength()}
        onCoach={() => router.push('/coach' as Href)}
        tokens={tokens}
        styles={styles}
      />

      <View style={styles.coachStrip}>
        <View style={styles.coachStripIcon}><V23Icon name="insights" color={tokens.accent} size={18} /></View>
        <View style={styles.coachStripCopy}>
          <Text style={styles.coachStripLabel}>COACH</Text>
          <Text style={styles.coachStripTitle}>{coachPrompt(readiness, activities.length, ambiguous)}</Text>
          <Text style={styles.coachStripBody}>{coachBody(readiness, ambiguous)}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/coach' as Href)} style={({ pressed }) => [styles.coachStripAction, pressed && styles.pressed]}>
          <Text style={styles.coachStripActionText}>Talk</Text>
          <V23Icon name="chevron" color={tokens.accent} size={13} />
        </Pressable>
      </View>

      <View style={styles.weekShell}>
        <View style={styles.weekHeading}>
          <View>
            <Text style={styles.sectionEyebrow}>THIS WEEK</Text>
            <Text style={styles.sectionTitle}>Stay oriented, not scored.</Text>
          </View>
          <Pressable onPress={() => router.push('/plan' as Href)}><Text style={styles.sectionLink}>Open week</Text></Pressable>
        </View>
        <View style={styles.weekStrip}>
          {weekDays().map((day) => <View key={day.key} style={styles.dayItem}>
            <Text style={[styles.dayLabel, day.today && styles.dayLabelToday]}>{day.label}</Text>
            <View style={[styles.dayDot, day.today && styles.dayDotToday, day.past && styles.dayDotPast]}>
              {day.past ? <V23Icon name="check" color="#FFFFFF" size={10} /> : <Text style={[styles.dayNumber, day.today && styles.dayNumberToday]}>{day.day}</Text>}
            </View>
          </View>)}
        </View>
        <ProductDisclosure
          title="What else is on today"
          summary={secondarySessionSummary(strength, calendar)}
          expanded={weekExpanded}
          onPress={() => setWeekExpanded((value) => !value)}
        >
          <SecondarySessions strength={strength} calendar={calendar} tokens={tokens} styles={styles} />
          <View style={styles.toolRow}>
            <ProductAction label="Adjust today" variant="secondary" onPress={() => router.push('/session-adjustment' as Href)} />
            <ProductAction label="Full schedule" variant="quiet" onPress={() => router.push('/plan' as Href)} />
          </View>
        </ProductDisclosure>
      </View>
    </>}
  </V23Screen>;
}

function TodayCall({
  strength,
  calendar,
  readiness,
  onPrimary,
  onCoach,
  tokens,
  styles,
}: {
  strength?: PlannedStrengthSession;
  calendar?: TrainingCalendarEvent;
  readiness: DailyReadinessCheckIn | null;
  onPrimary: () => void;
  onCoach: () => void;
  tokens: DesignTokens;
  styles: ReturnType<typeof makeStyles>;
}) {
  const primaryKind = strength ? 'strength' : calendar?.discipline ?? 'recovery';
  const title = strength
    ? strength.title
    : calendar
      ? conciseSessionLabel({ discipline: calendar.discipline, title: calendar.title }) ?? calendar.title ?? 'Scheduled training'
      : 'Your day is open';
  const meta = strength
    ? `${Math.round(strength.workout.totalWorkSeconds / 60)} min · ${friendlyLoad(strength.intendedLoad)}`
    : calendar
      ? calendarTime(calendar)
      : 'No planned session is demanding your attention.';
  const call = readinessCall(readiness, Boolean(strength || calendar));

  return <View style={styles.todayHero}>
    <View style={styles.heroScene}><V23ScenicBanner variant="morning" /></View>
    <View style={styles.heroContent}>
      <View style={styles.heroTopRow}>
        <View style={styles.heroEyebrowWrap}>
          <SportIcon kind={normalizeSportKind(primaryKind)} color={tokens.accent} backgroundColor={tokens.accentSoft} size={20} />
          <Text style={styles.heroEyebrow}>{strength || calendar ? 'TODAY’S CALL' : 'OPEN DAY'}</Text>
        </View>
        {readiness ? <View style={styles.readinessPill}><Text style={styles.readinessPillText}>{friendlyReadiness(readiness)}</Text></View> : null}
      </View>
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroMeta}>{meta}</Text>
      <Text style={styles.heroReason}>{call}</Text>
      <View style={styles.heroActions}>
        <Pressable accessibilityRole="button" onPress={onPrimary} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>{strength ? 'Start workout' : calendar ? 'Open today’s plan' : 'Build a workout'}</Text>
          <V23Icon name={strength ? 'play' : 'chevron'} color="#FFFFFF" size={17} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onCoach} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={styles.secondaryButtonText}>Something changed?</Text>
        </Pressable>
      </View>
    </View>
  </View>;
}

function SecondarySessions({
  strength,
  calendar,
  tokens,
  styles,
}: {
  strength?: PlannedStrengthSession;
  calendar?: TrainingCalendarEvent;
  tokens: DesignTokens;
  styles: ReturnType<typeof makeStyles>;
}) {
  if (!strength && !calendar) return <Text style={styles.emptyDetail}>Nothing else is scheduled. An open day does not need to be filled.</Text>;
  return <View style={styles.secondaryList}>
    {strength ? <SessionRow
      kind="strength"
      title={strength.title}
      body={`${Math.round(strength.workout.totalWorkSeconds / 60)} min · ${friendlyLoad(strength.intendedLoad)}`}
      tokens={tokens}
      styles={styles}
    /> : null}
    {calendar ? <SessionRow
      kind={calendar.discipline}
      title={conciseSessionLabel({ discipline: calendar.discipline, title: calendar.title }) ?? calendar.title ?? 'Scheduled training'}
      body={calendarTime(calendar)}
      tokens={tokens}
      styles={styles}
    /> : null}
  </View>;
}

function SessionRow({ kind, title, body, tokens, styles }: { kind: string; title: string; body: string; tokens: DesignTokens; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.sessionRow}>
    <SportIcon kind={normalizeSportKind(kind)} color={tokens.accent} backgroundColor={tokens.accentSoft} size={18} />
    <View style={styles.sessionCopy}><Text style={styles.sessionTitle}>{title}</Text><Text style={styles.sessionBody}>{body}</Text></View>
  </View>;
}

function ColdStart({ router, tokens, styles }: { router: ReturnType<typeof useRouter>; tokens: DesignTokens; styles: ReturnType<typeof makeStyles> }) {
  return <>
    <View style={styles.coldHero}>
      <View style={styles.heroScene}><V23ScenicBanner variant="morning" /></View>
      <View style={styles.heroContent}>
        <Text style={styles.heroEyebrow}>YOUR FIRST WEEK</Text>
        <Text style={styles.heroTitle}>Build around the week you actually have.</Text>
        <Text style={styles.heroReason}>Set the goal, race outcome, weekly capacity, and realistic training setup. Side Quest will build the coordinated week from there.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/onboarding' as Href)} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>Build my plan</Text><V23Icon name="chevron" color="#FFFFFF" size={17} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/generate' as Href)} style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}>
          <Text style={styles.textActionText}>Quick workout instead</Text><V23Icon name="chevron" color={tokens.accent} size={13} />
        </Pressable>
      </View>
    </View>
    <View style={styles.coldPromise}>
      <Text style={styles.sectionEyebrow}>WHAT SIDE QUEST BUILDS</Text>
      <Text style={styles.sectionTitle}>One plan, not disconnected workouts.</Text>
      <Text style={styles.coldPromiseBody}>Race strategy, endurance commitments, strength, recovery, and later Coach changes all resolve through the same week.</Text>
    </View>
  </>;
}

function readinessCall(readiness: DailyReadinessCheckIn | null, hasTraining: boolean): string {
  if (!readiness) return hasTraining
    ? 'This is the plan’s current recommendation. Check in or tell Coach if today no longer matches the assumptions.'
    : 'Leave the day open unless you deliberately want an additional session.';
  return readinessHeadline(readiness);
}

function friendlyReadiness(readiness: DailyReadinessCheckIn): string {
  const band = readinessBand((readiness.sleep + readiness.energy + readiness.muscleFreshness + (6 - readiness.stress) + readiness.motivation) / 5);
  if (band === 'ready') return 'Ready';
  if (band === 'steady') return 'Steady';
  if (band === 'reduced') return 'Reduce';
  return 'Recover';
}

function coachPrompt(readiness: DailyReadinessCheckIn | null, activityCount: number, ambiguous: number): string {
  if (ambiguous) return `${ambiguous} imported activit${ambiguous === 1 ? 'y needs' : 'ies need'} context.`;
  if (readiness) return 'Today’s check-in is already part of the call.';
  if (activityCount) return 'Recent training is informing today.';
  return 'The plan is carrying today’s decision.';
}

function coachBody(readiness: DailyReadinessCheckIn | null, ambiguous: number): string {
  if (ambiguous) return 'Coach will not treat an uncertain match as settled training history.';
  if (readiness) return 'If something changed after the check-in, say it naturally instead of editing the plan by hand.';
  return 'Use Coach when soreness, time, symptoms, access, or the schedule no longer match the plan.';
}

function secondarySessionSummary(strength?: PlannedStrengthSession, calendar?: TrainingCalendarEvent): string {
  const count = Number(Boolean(strength)) + Number(Boolean(calendar));
  if (!count) return 'No additional planned work.';
  if (count === 1) return '1 planned item on today’s schedule.';
  return '2 planned items on today’s schedule.';
}

function firstUpcomingEvent(events: TrainingCalendarEvent[]): TrainingCalendarEvent | undefined {
  return [...events].sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
}

function calendarTime(event: TrainingCalendarEvent): string {
  const date = new Date(event.startAt);
  if (Number.isNaN(date.getTime())) return 'Scheduled today';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}

function friendlyLoad(value: PlannedStrengthSession['intendedLoad']): string {
  return value === 'high' ? 'high load' : value === 'moderate' ? 'moderate load' : 'light load';
}

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function longDate(): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
}

function timeAwareGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'You’re up late';
}

function weekDays() {
  const current = new Date();
  const monday = new Date(current);
  monday.setDate(current.getDate() - ((current.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const today = date.toDateString() === current.toDateString();
    return {
      key: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
      label: new Intl.DateTimeFormat('en-US', { weekday: 'narrow' }).format(date),
      day: date.getDate(),
      today,
      past: date < current && !today,
    };
  });
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { paddingTop: 16, paddingBottom: 34, gap: 18 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    headerCopy: { flex: 1, minWidth: 0, gap: 2 },
    greeting: { color: tokens.text, fontSize: 27, lineHeight: 32, fontWeight: '900', letterSpacing: -0.65 },
    date: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 18 },
    checkInButton: { minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
    checkInText: { color: tokens.text, fontSize: 11.5, lineHeight: 15, fontWeight: '800' },

    todayHero: { borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface },
    coldHero: { borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface },
    heroScene: { height: 92, overflow: 'hidden', backgroundColor: tokens.surfaceMuted },
    heroContent: { padding: 19, gap: 7 },
    heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    heroEyebrowWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    heroEyebrow: { color: tokens.accent, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1.05 },
    readinessPill: { borderRadius: 999, backgroundColor: tokens.accentSoft, paddingHorizontal: 9, paddingVertical: 5 },
    readinessPillText: { color: tokens.accent, fontSize: 10.5, lineHeight: 13, fontWeight: '900' },
    heroTitle: { color: tokens.text, fontSize: 28, lineHeight: 33, fontWeight: '900', letterSpacing: -0.65 },
    heroMeta: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
    heroReason: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 20 },
    heroActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9, marginTop: 6 },
    primaryButton: { minHeight: 46, borderRadius: 14, backgroundColor: tokens.accent, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    primaryButtonText: { color: '#FFFFFF', fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
    secondaryButton: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
    secondaryButtonText: { color: tokens.accent, fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
    textAction: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
    textActionText: { color: tokens.accent, fontSize: 12.5, lineHeight: 17, fontWeight: '800' },

    coachStrip: { borderRadius: 18, backgroundColor: tokens.surfaceMuted, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
    coachStripIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
    coachStripCopy: { flex: 1, minWidth: 0, gap: 2 },
    coachStripLabel: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
    coachStripTitle: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
    coachStripBody: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
    coachStripAction: { minHeight: 36, borderRadius: 18, backgroundColor: tokens.surface, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 3 },
    coachStripActionText: { color: tokens.accent, fontSize: 11.5, fontWeight: '900' },

    weekShell: { gap: 11 },
    weekHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
    sectionEyebrow: { color: tokens.accent, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1 },
    sectionTitle: { color: tokens.text, fontSize: 19, lineHeight: 24, fontWeight: '900', letterSpacing: -0.2 },
    sectionLink: { color: tokens.accent, fontSize: 12, lineHeight: 16, fontWeight: '800' },
    weekStrip: { borderRadius: 18, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, paddingHorizontal: 10, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between' },
    dayItem: { flex: 1, alignItems: 'center', gap: 6 },
    dayLabel: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 13, fontWeight: '800' },
    dayLabelToday: { color: tokens.accent },
    dayDot: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.surfaceMuted },
    dayDotToday: { backgroundColor: tokens.accentSoft, borderWidth: 1, borderColor: tokens.accent },
    dayDotPast: { backgroundColor: tokens.header },
    dayNumber: { color: tokens.text, fontSize: 11.5, lineHeight: 14, fontWeight: '800' },
    dayNumberToday: { color: tokens.accent, fontWeight: '900' },
    secondaryList: { gap: 8 },
    sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 48 },
    sessionCopy: { flex: 1, minWidth: 0, gap: 1 },
    sessionTitle: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
    sessionBody: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
    emptyDetail: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18 },
    toolRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

    coldPromise: { gap: 4, paddingHorizontal: 2 },
    coldPromiseBody: { color: tokens.textMuted, fontSize: 13, lineHeight: 19 },
    pressed: { opacity: 0.76 },
  });
}
