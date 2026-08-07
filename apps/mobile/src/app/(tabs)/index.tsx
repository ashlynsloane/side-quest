import type { EnduranceActivity, PlannedCompletedMatch, PlannedStrengthSession, TrainingBlockPlan, TrainingCalendarEvent } from '@circuit/domain';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { V23Icon, V23ScenicBanner, V23Screen } from '@/components/v23-ui';
import { SportIcon, normalizeSportKind } from '@/components/sport-icon';
import { conciseSessionLabel } from '@/services/training-synthesis';
import { getLatestTrainingBlock, getTodayReadinessCheckIn, getTrainingCalendarEvents, listEnduranceActivities, listPlannedCompletedMatches } from '@/services/database';
import type { DailyReadinessCheckIn } from '@/services/readiness';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';
import { useWorkoutContext } from '@/state/workout-context';
import type { DesignTokens } from '@/theme';

export default function Home() {
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

  useFocusEffect(useCallback(() => {
    let live = true;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
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
  const allSessions = block?.weeks.flatMap((week) => week.sessions) ?? [];
  const hasUsablePlan = allSessions.length > 0;
  const strength = allSessions.filter((session) => session.date === today && session.completionStatus !== 'skipped');
  const recommendation = strength[0];
  const nextEvent = events[0];
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || 'Athlete';

  const startWorkout = () => {
    if (recommendation) {
      setPreviewWorkout(recommendation.workout);
      router.push('/workout-preview' as Href);
      return;
    }
    router.push('/generate' as Href);
  };

  return (
    <V23Screen contentStyle={styles.page}>
      <View style={styles.intro}>
        <Text style={styles.greeting}>{timeAwareGreeting()}, {firstName}.</Text>
        <Text style={styles.date}>{longDate()}</Text>
      </View>

      {!hasUsablePlan ? (
        <ColdStartExperience styles={styles} tokens={tokens} router={router} />
      ) : (
        <LiveTodayExperience
          styles={styles}
          tokens={tokens}
          router={router}
          recommendation={recommendation}
          nextEvent={nextEvent}
          readiness={readiness}
          activities={activities}
          matches={matches}
          startWorkout={startWorkout}
        />
      )}
    </V23Screen>
  );
}

function ColdStartExperience({
  styles,
  tokens,
  router,
}: {
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
  router: ReturnType<typeof useRouter>;
}) {
  return <>
    <View style={styles.coldHero}>
      <View style={styles.heroArt}><V23ScenicBanner variant="morning" /></View>
      <View style={styles.heroContent}>
        <Text style={styles.eyebrow}>YOUR FIRST WEEK</Text>
        <Text style={styles.coldTitle}>Build around your real schedule.</Text>
        <Text style={styles.coldBody}>About 90 seconds. Start with goal, time, and what is available today.</Text>

        <View style={styles.setupGrid}>
          <SetupItem styles={styles} tokens={tokens} icon="goal" label="Goal + priority" />
          <SetupItem styles={styles} tokens={tokens} icon="clock" label="Schedule" />
          <SetupItem styles={styles} tokens={tokens} icon="equipment" label="Equipment + restrictions" />
        </View>

        <Pressable accessibilityRole="button" onPress={() => router.push('/onboarding' as Href)} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>Build my week</Text>
          <V23Icon name="chevron" color="#FFFFFF" size={18} />
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => router.push('/generate' as Href)} style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}>
          <Text style={styles.textActionText}>Do a quick workout instead</Text>
          <V23Icon name="chevron" color={tokens.accent} size={14} />
        </Pressable>
      </View>
    </View>

    <View style={styles.compactValue}>
      <Text style={styles.sectionEyebrow}>WHAT YOU’LL GET</Text>
      <Text style={styles.compactValueTitle}>A complete week, a workout for today, and room to adapt.</Text>
      <Text style={styles.compactValueBody}>Training history improves precision later; it is not required to begin.</Text>
    </View>

    <View style={styles.coachNote}>
      <View style={styles.noteIcon}><V23Icon name="insights" color={tokens.accent} size={18} /></View>
      <View style={styles.noteCopy}>
        <Text style={styles.noteLabel}>COACH NOTE</Text>
        <Text style={styles.noteTitle}>Start before the data is perfect.</Text>
        <Pressable onPress={() => router.push('/side-quest-coach' as Href)} style={styles.noteLink}>
          <Text style={styles.noteLinkText}>How the first recommendation works</Text>
          <V23Icon name="chevron" color={tokens.accent} size={13} />
        </Pressable>
      </View>
    </View>

    <View style={styles.quickLinks}>
      <Pressable onPress={() => router.push('/generate' as Href)} style={({ pressed }) => [styles.quickLink, pressed && styles.pressed]}>
        <V23Icon name="clock" color={tokens.accent} size={20} />
        <Text style={styles.quickLinkTitle}>Quick workout</Text>
        <Text style={styles.quickLinkBody}>Set time and equipment.</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/exercise-library' as Href)} style={({ pressed }) => [styles.quickLink, pressed && styles.pressed]}>
        <V23Icon name="search" color={tokens.accent} size={20} />
        <Text style={styles.quickLinkTitle}>Browse exercises</Text>
        <Text style={styles.quickLinkBody}>See movements and demos.</Text>
      </Pressable>
    </View>
  </>;
}
function LiveTodayExperience({
  styles,
  tokens,
  router,
  recommendation,
  nextEvent,
  readiness,
  activities,
  matches,
  startWorkout,
}: {
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
  router: ReturnType<typeof useRouter>;
  recommendation?: PlannedStrengthSession;
  nextEvent?: TrainingCalendarEvent;
  readiness: DailyReadinessCheckIn | null;
  activities: EnduranceActivity[];
  matches: PlannedCompletedMatch[];
  startWorkout: () => void;
}) {
  const ambiguous = matches.filter((match) => match.status === 'ambiguous').length;
  const callTitle = recommendation?.title ?? 'Choose today’s strength session';
  const callMeta = recommendation
    ? `${Math.round(recommendation.workout.totalWorkSeconds / 60)} min · ${recommendation.intendedLoad}`
    : 'Your plan is active';

  return <>
    <View style={styles.liveHero}>
      <Text style={styles.eyebrow}>TODAY</Text>
      <Text style={styles.liveTitle}>{callTitle}</Text>
      <Text style={styles.liveMeta}>{callMeta}</Text>
      <Text style={styles.liveReason}>{recommendation ? 'Placed to support the rest of your training week.' : 'Generate from your current goal, equipment, and restrictions.'}</Text>
      <Pressable onPress={startWorkout} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
        <Text style={styles.primaryButtonText}>{recommendation ? 'Start workout' : 'Generate workout'}</Text>
        <V23Icon name={recommendation ? 'play' : 'chevron'} color="#FFFFFF" size={18} />
      </Pressable>
    </View>

    <View style={styles.liveWeek}>
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionTitle}>This week</Text>
        <Pressable onPress={() => router.push('/plan' as Href)}><Text style={styles.sectionLink}>Open week</Text></Pressable>
      </View>
      <View style={styles.weekStrip}>
        {weekDays().map((day) => <View key={day.key} style={styles.dayItem}>
          <Text style={styles.dayLabel}>{day.label}</Text>
          <View style={[styles.dayDot, day.today && styles.dayDotToday, day.past && styles.dayDotPast]}>
            {day.past ? <V23Icon name="check" color="#FFFFFF" size={10} /> : <Text style={[styles.dayNumber, day.today && styles.dayNumberToday]}>{day.day}</Text>}
          </View>
        </View>)}
      </View>
      <View style={styles.nextSessionRow}>
        <SportIcon kind={normalizeSportKind(nextEvent?.discipline ?? (recommendation ? 'strength' : 'recovery'))} color={tokens.accent} backgroundColor={tokens.accentSoft} size={20} />
        <View style={styles.nextSessionCopy}>
          <Text style={styles.nextSessionTitle}>{nextEvent ? conciseSessionLabel({ discipline: nextEvent.discipline, title: nextEvent.title }) : 'No additional session scheduled today'}</Text>
          <Text style={styles.nextSessionBody}>{nextEvent ? 'Next on your calendar' : 'Keep the rest of the day flexible.'}</Text>
        </View>
      </View>
    </View>

    <View style={styles.coachNote}>
      <View style={styles.noteIcon}><V23Icon name="insights" color={tokens.accent} size={18} /></View>
      <View style={styles.noteCopy}>
        <Text style={styles.noteLabel}>COACH</Text>
        <Text style={styles.noteTitle}>{readiness ? 'Today’s check-in is included.' : activities.length ? 'Recent training is informing today.' : 'Your plan is carrying the decision for now.'}</Text>
        <Text style={styles.noteBody}>{ambiguous ? `${ambiguous} imported activit${ambiguous === 1 ? 'y needs' : 'ies need'} context before Coach uses the full picture.` : 'Open Coach for the evidence, uncertainty, and any proposed change.'}</Text>
        <View style={styles.noteActions}>
          <Pressable onPress={() => router.push('/coach' as Href)} style={styles.noteLink}><Text style={styles.noteLinkText}>Why today?</Text><V23Icon name="chevron" color={tokens.accent} size={13} /></Pressable>
          <Pressable onPress={() => router.push('/session-adjustment' as Href)} style={styles.noteLink}><Text style={styles.noteLinkText}>Adjust</Text><V23Icon name="chevron" color={tokens.accent} size={13} /></Pressable>
          <Pressable onPress={() => router.push('/readiness' as Href)} style={styles.noteLink}><Text style={styles.noteLinkText}>Check in</Text><V23Icon name="chevron" color={tokens.accent} size={13} /></Pressable>
        </View>
      </View>
    </View>
  </>;
}

function SetupItem({ styles, tokens, icon, label }: { styles: ReturnType<typeof makeStyles>; tokens: DesignTokens; icon: 'goal' | 'clock' | 'plan' | 'equipment'; label: string }) {
  return <View style={styles.setupItem}><View style={styles.setupIcon}><V23Icon name={icon} color={tokens.accent} size={16} /></View><Text style={styles.setupLabel}>{label}</Text></View>;
}

function PromiseRow({ styles, tokens, title, body }: { styles: ReturnType<typeof makeStyles>; tokens: DesignTokens; title: string; body: string }) {
  return <View style={styles.promiseRow}><View style={styles.checkCircle}><V23Icon name="check" color="#FFFFFF" size={10} /></View><View style={styles.promiseCopy}><Text style={styles.promiseTitle}>{title}</Text><Text style={styles.promiseBody}>{body}</Text></View></View>;
}

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function longDate() {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
}

function timeAwareGreeting() {
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
      key: localKey(date),
      label: new Intl.DateTimeFormat('en-US', { weekday: 'narrow' }).format(date),
      day: date.getDate(),
      today,
      past: date < current && !today,
    };
  });
}

function localKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { paddingTop: 18, paddingBottom: 28, gap: 22 },
    intro: { gap: 3 },
    greeting: { color: tokens.text, fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: -0.8 },
    date: { color: tokens.textMuted, fontSize: 15, lineHeight: 21 },

    coldHero: { marginHorizontal: -4, borderRadius: 28, overflow: 'hidden', backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border },
    heroArt: { height: 104, overflow: 'hidden', backgroundColor: tokens.surfaceMuted },
    heroContent: { paddingHorizontal: 21, paddingTop: 20, paddingBottom: 17 },
    eyebrow: { color: tokens.accent, fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 1.35 },
    coldTitle: { color: tokens.text, fontSize: 28, lineHeight: 33, fontWeight: '900', letterSpacing: -0.7, marginTop: 8 },
    coldBody: { color: tokens.textMuted, fontSize: 16, lineHeight: 23, marginTop: 10 },
    setupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 17, marginBottom: 18 },
    setupItem: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: tokens.surfaceMuted, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7 },
    setupIcon: { width: 24, height: 24, borderRadius: 8, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    setupLabel: { color: tokens.text, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
    primaryButton: { minHeight: 58, borderRadius: 18, backgroundColor: tokens.accentStrong, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    primaryButtonText: { color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '900' },
    textAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 8 },
    textActionText: { color: tokens.accent, fontSize: 14, lineHeight: 19, fontWeight: '800' },

    compactValue: { gap: 5, paddingVertical: 2 },
    compactValueTitle: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '900' },
    compactValueBody: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19 },
    promiseSection: { gap: 12 },
    sectionEyebrow: { color: tokens.accent, fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 1.35, paddingHorizontal: 2 },
    promiseList: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: tokens.border },
    promiseRow: { flexDirection: 'row', gap: 13, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    checkCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: tokens.accent, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    promiseCopy: { flex: 1 },
    promiseTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '800' },
    promiseBody: { color: tokens.textMuted, fontSize: 14, lineHeight: 20, marginTop: 3 },

    coachNote: { flexDirection: 'row', gap: 14, paddingVertical: 2 },
    noteIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    noteCopy: { flex: 1 },
    noteLabel: { color: tokens.accent, fontSize: 10.5, lineHeight: 14, fontWeight: '900', letterSpacing: 1.15 },
    noteTitle: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '900', marginTop: 4 },
    noteBody: { color: tokens.textMuted, fontSize: 14, lineHeight: 21, marginTop: 5 },
    noteLink: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 38 },
    noteLinkText: { color: tokens.accent, fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
    noteActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 4 },

    quickLinks: { flexDirection: 'row', gap: 12 },
    quickLink: { flex: 1, minHeight: 112, borderRadius: 22, padding: 17, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, justifyContent: 'flex-end' },
    quickLinkTitle: { color: tokens.text, fontSize: 15.5, lineHeight: 20, fontWeight: '900', marginTop: 10 },
    quickLinkBody: { color: tokens.textMuted, fontSize: 13, lineHeight: 18, marginTop: 3 },

    liveHero: { paddingBottom: 4 },
    liveTitle: { color: tokens.text, fontSize: 34, lineHeight: 39, fontWeight: '900', letterSpacing: -0.85, marginTop: 7 },
    liveMeta: { color: tokens.text, fontSize: 16, lineHeight: 22, fontWeight: '800', marginTop: 8 },
    liveReason: { color: tokens.textMuted, fontSize: 15, lineHeight: 22, marginTop: 7, marginBottom: 19 },
    liveWeek: { gap: 16, paddingTop: 4 },
    sectionHeadingRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    sectionTitle: { color: tokens.text, fontSize: 22, lineHeight: 27, fontWeight: '900' },
    sectionLink: { color: tokens.accent, fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
    weekStrip: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
    dayItem: { width: 38, alignItems: 'center', gap: 7 },
    dayLabel: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 14, fontWeight: '800' },
    dayDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.surface },
    dayDotToday: { backgroundColor: tokens.header, borderColor: tokens.header },
    dayDotPast: { backgroundColor: tokens.accent, borderColor: tokens.accent },
    dayNumber: { color: tokens.text, fontSize: 12, fontWeight: '800' },
    dayNumberToday: { color: '#FFFFFF' },
    nextSessionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 15, borderTopWidth: 1, borderTopColor: tokens.border },
    nextSessionCopy: { flex: 1 },
    nextSessionTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '800' },
    nextSessionBody: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19, marginTop: 2 },
    pressed: { opacity: 0.7 },
  });
}
