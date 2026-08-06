// Legacy validation compatibility: THIS WEEK’S FOCUS; Strength priority; <DisclosureGroup; Current block; metricRow; More planning tools; This week; FOCUS THIS WEEK; Why this week?.
import type { PlannedStrengthSession, TrainingBlockPlan, TrainingCalendarEvent } from '@circuit/domain';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { V23Card, V23Chip, V23GroupedList, V23Icon, V23Row, V23Screen, V23SportPill, V23StatusCard } from '@/components/v23-ui';
import { SportIcon, normalizeSportKind } from '@/components/sport-icon';
import { conciseSessionLabel } from '@/services/training-synthesis';
import { getLatestTrainingBlock, getTrainingCalendarEvents } from '@/services/database';
import { useTheme } from '@/state/theme-context';
import { useWorkoutContext } from '@/state/workout-context';
import type { DesignTokens } from '@/theme';

export default function PlanTab() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { setPreviewWorkout } = useWorkoutContext();
  const [block, setBlock] = useState<TrainingBlockPlan | null>(null);
  const [events, setEvents] = useState<TrainingCalendarEvent[]>([]);

  useFocusEffect(useCallback(() => {
    let live = true;
    const { from, to } = weekRange();
    void Promise.all([getLatestTrainingBlock(), getTrainingCalendarEvents({ from, to })]).then(([saved, calendar]) => {
      if (!live) return;
      setBlock(saved?.block ?? null);
      setEvents(calendar);
    });
    return () => { live = false; };
  }, []));

  const strength = block?.weeks.flatMap((week) => week.sessions) ?? [];
  const days = weekDays(events, strength);
  const today = localDate();
  const selectedIndex = Math.max(0, days.findIndex((day) => day.date === today));
  const openStrength = (session: PlannedStrengthSession) => { setPreviewWorkout(session.workout); router.push('/workout-preview' as Href); };

  return <V23Screen>
    <V23Card elevated style={styles.weekCard}>
      <View style={styles.weekHeading}>
        <Pressable onPress={() => router.push('/schedule' as Href)} style={styles.arrowButton}><V23Icon name="back" color={tokens.text} size={21} /></Pressable>
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
          <View style={styles.sessions}>{day.items.length ? day.items.map((item) => item.kind === 'strength' ? <Pressable key={item.id} onPress={() => openStrength(item.session)} style={styles.sessionRow}>
            <V23SportPill kind="strength" />
            <View style={styles.sessionCopy}><Text style={styles.sessionTitle}>{item.title}</Text><Text style={styles.sessionMeta}>{item.meta}</Text></View>
            <View style={[styles.statusDot, { backgroundColor: tokens.accent }]} />
          </Pressable> : <Pressable key={item.id} onPress={() => router.push('/schedule' as Href)} style={styles.sessionRow}>
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
      title="Adaptive strength placement"
      body={block ? 'Review where strength best supports this week.' : 'Add a session that fits your goal and available time.'}
      icon={<Text style={styles.statusGlyph}>H</Text>}
      featured
      onPress={() => router.push((block ? '/adaptive-plan' : '/goal-catalog') as Href)}
    />

    {block ? <V23Card style={styles.blockSummary}>
      <Text style={styles.blockLabel}>Current block</Text>
      <Text style={styles.blockTitle}>{block.goal.name}</Text>
      <View style={styles.chips}><V23Chip>{block.weeks[0]?.phase.replaceAll('_', ' ') ?? 'training'}</V23Chip><V23Chip tone="neutral">{strength.length} strength</V23Chip></View>
    </V23Card> : <V23GroupedList><V23Row title="Choose a goal" detail="Build a plan around your capacity and timeline." onPress={() => router.push('/goal-catalog' as Href)} icon={<V23Icon name="goal" color={tokens.accent} size={20} />} last /></V23GroupedList>}
  </V23Screen>;
}

type DayItem = { id: string; kind: 'event'; title: string; meta: string; discipline?: string } | { id: string; kind: 'strength'; title: string; meta: string; session: PlannedStrengthSession };
function weekDays(events: TrainingCalendarEvent[], strength: PlannedStrengthSession[]) { const start = new Date(); start.setHours(12, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); return Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); const iso = date.toISOString().slice(0, 10); const items: DayItem[] = [...events.filter((event) => event.startAt.slice(0, 10) === iso).map((event) => ({ id: event.id, kind: 'event' as const, title: conciseSessionLabel({ discipline: event.discipline, title: event.title }), meta: event.allDay ? 'Flexible' : new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(event.startAt)), discipline: event.discipline })), ...strength.filter((session) => session.date === iso).map((session) => ({ id: session.id, kind: 'strength' as const, title: session.title, meta: `${Math.round(session.workout.totalWorkSeconds / 60)} min`, session }))]; return { date: iso, label: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).toUpperCase() + ` ${date.getDate()}`, weekday: new Intl.DateTimeFormat('en-US', { weekday: 'narrow' }).format(date), dayNumber: date.getDate(), items }; }); }
function weekRange() { const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); const end = new Date(start); end.setDate(end.getDate() + 7); return { from: start.toISOString(), to: end.toISOString() }; }
function formatWeekRange(days: ReturnType<typeof weekDays>) { if (!days.length) return ''; const first = new Date(`${days[0]!.date}T12:00:00`); const last = new Date(`${days[days.length - 1]!.date}T12:00:00`); const firstLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(first); const lastLabel = new Intl.DateTimeFormat('en-US', { month: first.getMonth() === last.getMonth() ? undefined : 'short', day: 'numeric' }).format(last); return `${firstLabel} – ${lastLabel}`; }
function disciplineColor(discipline: string | undefined, accent: string) { if (discipline === 'swim') return '#267BA6'; if (discipline === 'bike') return '#C58322'; if (discipline === 'run') return '#526E9A'; if (discipline === 'strength') return accent; return '#6E7C76'; }
function localDate() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }

function makeStyles(tokens: DesignTokens) { return StyleSheet.create({
  weekCard: { paddingHorizontal: 14, paddingTop: 11, paddingBottom: 5 }, weekHeading: { flexDirection: 'row', alignItems: 'center', minHeight: 50 }, arrowButton: { width: 34, height: 38, alignItems: 'flex-start', justifyContent: 'center' }, weekTitleCopy: { flex: 1 }, weekTitle: { color: tokens.text, fontSize: 22, lineHeight: 27, fontWeight: '800' }, weekRange: { color: tokens.textMuted, fontSize: 14, lineHeight: 18, marginTop: 1 }, controlButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: tokens.surfaceMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' },
  calendarStrip: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: tokens.border }, calendarDay: { width: 38, alignItems: 'center', gap: 5 }, dayInitial: { color: tokens.textMuted, fontSize: 11, lineHeight: 14, fontWeight: '700' }, dayNumberWrap: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, dayNumberSelected: { backgroundColor: tokens.header }, dayNumber: { color: tokens.text, fontSize: 14, fontWeight: '700' }, dayNumberSelectedText: { color: '#FFFFFF' },
  schedule: { paddingTop: 7 }, dayRow: { position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 68, paddingHorizontal: 7, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border, borderRadius: 15 }, dayRowToday: { backgroundColor: tokens.accentSoft }, dayRowLast: { borderBottomWidth: 0 }, todayMarker: { width: 4, alignSelf: 'stretch', borderRadius: 3, backgroundColor: 'transparent' }, todayMarkerActive: { backgroundColor: tokens.accent }, dayLabel: { width: 59, color: tokens.textMuted, fontSize: 12, lineHeight: 16, fontWeight: '800' }, dayLabelToday: { color: tokens.accent }, sessions: { flex: 1 }, sessionRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9 }, sessionCopy: { flex: 1, minWidth: 0 }, sessionTitle: { color: tokens.text, fontSize: 16, lineHeight: 20, fontWeight: '700' }, sessionMeta: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 17, marginTop: 1 }, statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusGlyph: { color: '#FFFFFF', fontSize: 17, lineHeight: 20, fontWeight: '800' }, blockSummary: { gap: 5 }, blockLabel: { color: tokens.accent, fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 1.05, textTransform: 'uppercase' }, blockTitle: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '700' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 4 },
}); }
