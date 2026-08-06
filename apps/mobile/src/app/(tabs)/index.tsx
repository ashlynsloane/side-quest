import type { EnduranceActivity, PlannedCompletedMatch, PlannedStrengthSession, TrainingBlockPlan, TrainingCalendarEvent } from '@circuit/domain';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { V23Card, V23Chip, V23Icon, V23PrimaryButton, V23ScenicBanner, V23Screen } from '@/components/v23-ui';
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
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(from); to.setDate(to.getDate() + 1);
    void Promise.all([
      getLatestTrainingBlock(), getTodayReadinessCheckIn(),
      getTrainingCalendarEvents({ from: from.toISOString(), to: to.toISOString() }),
      listEnduranceActivities({ from: from.toISOString(), to: to.toISOString(), limit: 30 }),
      listPlannedCompletedMatches(),
    ]).then(([saved, ready, calendar, completed, plannedMatches]) => {
      if (!live) return;
      setBlock(saved?.block ?? null); setReadiness(ready); setEvents(calendar);
      setActivities(completed.filter((activity) => activity.classification !== 'ignored')); setMatches(plannedMatches);
    });
    return () => { live = false; };
  }, []));

  const today = localDate();
  const strength = block?.weeks.flatMap((week) => week.sessions).filter((session) => session.date === today && session.completionStatus !== 'skipped') ?? [];
  const recommendation = strength[0];
  const nextEvent = events[0];
  const completedToday = activities.length;

  const start = () => {
    if (recommendation) { setPreviewWorkout(recommendation.workout); router.push('/workout-preview' as Href); return; }
    router.push((block ? '/generate' : '/goal-catalog') as Href);
  };

  return <V23Screen contentStyle={styles.page}>
    <View style={styles.hero}>
      <V23ScenicBanner variant="morning" />
      <View style={styles.heroCopy}><Text style={styles.greeting}>Good morning, {user?.displayName.split(' ')[0] ?? 'Athlete'}.</Text><Text style={styles.date}>{longDate()}</Text></View>
    </View>

    <V23Card elevated style={styles.recommendationCard}>
      <View style={styles.cardTop}><Text style={styles.eyebrow}>TODAY'S RECOMMENDATION</Text><V23Chip tone={readiness || completedToday ? 'accent' : 'neutral'}>{readiness || completedToday ? 'History-informed' : 'Provisional'}</V23Chip></View>
      <View style={styles.recommendationLine}>
        <View style={styles.recommendationCopy}>
          <Text style={styles.recommendationTitle}>{recommendation?.title ?? (block ? 'Quick strength session' : 'Build your first week')}</Text>
          <Text style={styles.recommendationMeta}>{recommendation ? `${Math.round(recommendation.workout.totalWorkSeconds / 60)} min · ${recommendation.intendedLoad}` : block ? '30–45 min · Adapted to today' : 'A useful plan in a few focused steps'}</Text>
        </View>
        <View style={styles.roundIcon}><V23Icon name={recommendation || block ? 'train' : 'goal'} color={tokens.accent} size={23} /></View>
      </View>
      <Text style={styles.recommendationBody}>{recommendation ? 'Build strength while protecting the rest of the week.' : block ? 'Generate a session from your current plan, equipment, and restrictions.' : 'Choose a goal, race priority, availability, and equipment. Side Quest will propose a week immediately.'}</Text>
      <V23PrimaryButton onPress={start}>{recommendation ? 'Start workout' : block ? 'Generate workout' : 'Build my week'}</V23PrimaryButton>
      <View style={styles.inlineActions}>
        <Pressable onPress={() => router.push('/side-quest-coach' as Href)} style={styles.inlineAction}><Text style={styles.inlineText}>Why this?</Text></Pressable>
        <Pressable onPress={() => router.push('/session-adjustment' as Href)} style={styles.inlineAction}><Text style={styles.inlineText}>Adjust</Text></Pressable>
        <Pressable onPress={() => router.push('/readiness' as Href)} style={styles.inlineAction}><Text style={styles.inlineText}>{readiness ? 'Update' : 'Check in'}</Text></Pressable>
      </View>
    </V23Card>

    <View style={styles.sectionTop}><Text style={styles.sectionTitle}>Your week</Text><Pressable onPress={() => router.push('/plan' as Href)}><Text style={styles.sectionLink}>Open week</Text></Pressable></View>
    <V23Card style={styles.weekCard}>
      <View style={styles.weekStrip}>{weekLetters().map((day) => <View key={day.label} style={styles.weekDay}><View style={[styles.weekCircle, day.today && styles.weekCircleToday, day.done && styles.weekCircleDone]}>{day.done ? <V23Icon name="check" color="#FFFFFF" size={11} /> : <Text style={[styles.weekLetter, day.today && styles.weekLetterToday]}>{day.label}</Text>}</View></View>)}</View>
      <View style={styles.nextRow}>
        <SportIcon kind={normalizeSportKind(nextEvent?.discipline ?? (recommendation ? 'strength' : 'recovery'))} color={tokens.accent} backgroundColor={tokens.accentSoft} size={20} />
        <View style={styles.nextCopy}><Text style={styles.nextTitle}>{nextEvent ? conciseSessionLabel({ discipline: nextEvent.discipline, title: nextEvent.title }) : recommendation ? recommendation.title : 'Provisional week ready after setup'}</Text><Text style={styles.nextBody}>{nextEvent ? 'Next scheduled session' : block ? 'Strength can adapt around your real schedule.' : 'No dead-end dashboard. Start and see a usable week.'}</Text></View>
        <V23Icon name="chevron" color={tokens.textMuted} size={16} />
      </View>
    </V23Card>

    <Pressable onPress={() => router.push('/coach' as Href)} style={({ pressed }) => [styles.coachStrip, pressed && styles.pressed]}>
      <View style={styles.coachIcon}><V23Icon name="insights" color={tokens.accent} size={20} /></View>
      <View style={styles.nextCopy}><Text style={styles.nextTitle}>Ask Coach why</Text><Text style={styles.nextBody}>{matches.filter((match) => match.status === 'ambiguous').length ? `${matches.filter((match) => match.status === 'ambiguous').length} activity matches need context.` : 'See what changed and what matters next.'}</Text></View>
      <V23Icon name="chevron" color={tokens.textMuted} size={16} />
    </Pressable>
  </V23Screen>;
}

function localDate() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function longDate() { return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()); }
function weekLetters() { const current = new Date(); const monday = new Date(current); monday.setDate(current.getDate() - ((current.getDay() + 6) % 7)); return ['M','T','W','T','F','S','S'].map((label, index) => { const d = new Date(monday); d.setDate(monday.getDate() + index); const today = d.toDateString() === current.toDateString(); return { label, today, done: d < current && !today }; }); }
function makeStyles(tokens: DesignTokens) { return StyleSheet.create({
  page: { paddingTop: 0, gap: 18 }, hero: { marginHorizontal: -20, marginTop: -18, backgroundColor: tokens.surface }, heroCopy: { paddingHorizontal: 20, paddingTop: 17, paddingBottom: 5 }, greeting: { color: tokens.text, fontSize: 29, lineHeight: 35, fontWeight: '900', letterSpacing: -0.6 }, date: { color: tokens.textMuted, fontSize: 14.5, lineHeight: 20, marginTop: 2 },
  recommendationCard: { padding: 20, gap: 15 }, cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, eyebrow: { color: tokens.accent, fontSize: 10.5, lineHeight: 14, fontWeight: '900', letterSpacing: 1.15 }, recommendationLine: { flexDirection: 'row', alignItems: 'center', gap: 14 }, recommendationCopy: { flex: 1 }, recommendationTitle: { color: tokens.text, fontSize: 24, lineHeight: 29, fontWeight: '900', letterSpacing: -0.35 }, recommendationMeta: { color: tokens.textMuted, fontSize: 14, lineHeight: 19, marginTop: 4 }, recommendationBody: { color: tokens.textMuted, fontSize: 15, lineHeight: 22 }, roundIcon: { width: 50, height: 50, borderRadius: 17, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' }, inlineActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, inlineAction: { minHeight: 38, flex: 1, alignItems: 'center', justifyContent: 'center' }, inlineText: { color: tokens.accent, fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
  sectionTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2 }, sectionTitle: { color: tokens.text, fontSize: 20, lineHeight: 25, fontWeight: '900' }, sectionLink: { color: tokens.accent, fontSize: 13.5, lineHeight: 18, fontWeight: '800' }, weekCard: { padding: 17, gap: 15 }, weekStrip: { flexDirection: 'row', justifyContent: 'space-between' }, weekDay: { width: 34, alignItems: 'center' }, weekCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: tokens.border }, weekCircleToday: { backgroundColor: tokens.header, borderColor: tokens.header }, weekCircleDone: { backgroundColor: tokens.accent, borderColor: tokens.accent }, weekLetter: { color: tokens.textMuted, fontSize: 11, fontWeight: '800' }, weekLetterToday: { color: '#FFFFFF' }, nextRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border }, nextCopy: { flex: 1 }, nextTitle: { color: tokens.text, fontSize: 16.5, lineHeight: 21, fontWeight: '800' }, nextBody: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19, marginTop: 2 }, coachStrip: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, borderRadius: 22, backgroundColor: tokens.accentSoft, borderWidth: 1, borderColor: tokens.border }, coachIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' }, pressed: { opacity: 0.72 },
}); }
