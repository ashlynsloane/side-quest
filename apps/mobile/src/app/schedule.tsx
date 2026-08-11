import type {
  EnduranceActivity,
  EnduranceDiscipline,
  PlannedCompletedMatch,
  PlannedStrengthSession,
  TrainingBlockPlan,
  TrainingCalendarEvent,
} from '@circuit/domain';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  deleteManualCalendarEvent,
  getLatestTrainingBlock,
  listEnduranceActivities,
  listPlannedCompletedMatches,
  getTrainingCalendarEvents,
  saveTrainingBlock,
  upsertManualCalendarEvent,
  updatePlannedSessionStatus,
} from '@/services/database';
import { SIDE_QUEST_PLAN_SOURCE_ID } from '@/services/whole-athlete-plan';
import { useWorkoutContext } from '@/state/workout-context';

const DISCIPLINES: Array<{ value: EnduranceDiscipline | 'strength' | 'rest' | 'other'; label: string }> = [
  { value: 'swim', label: 'Swim' },
  { value: 'bike', label: 'Bike' },
  { value: 'run', label: 'Run' },
  { value: 'strength', label: 'Strength' },
  { value: 'rest', label: 'Rest' },
  { value: 'other', label: 'Other' },
];

export default function ScheduleScreen() {
  const router = useRouter();
  const { setPreviewWorkout } = useWorkoutContext();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [block, setBlock] = useState<TrainingBlockPlan | null>(null);
  const [events, setEvents] = useState<TrainingCalendarEvent[]>([]);
  const [activities, setActivities] = useState<EnduranceActivity[]>([]);
  const [matches, setMatches] = useState<PlannedCompletedMatch[]>([]);
  const [moveTarget, setMoveTarget] = useState<PlannedStrengthSession | null>(null);
  const [showManualEvent, setShowManualEvent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  const load = useCallback(async () => {
    const from = `${weekStart}T00:00:00.000Z`;
    const to = `${addDays(weekStart, 7)}T00:00:00.000Z`;
    const [savedBlock, savedEvents, savedActivities, savedMatches] = await Promise.all([
      getLatestTrainingBlock(),
      getTrainingCalendarEvents({ from, to }),
      listEnduranceActivities({ from, to, limit: 200 }),
      listPlannedCompletedMatches(),
    ]);
    setBlock(savedBlock?.block ?? null);
    setEvents(savedEvents);
    setActivities(savedActivities);
    setMatches(savedMatches);
  }, [weekStart]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const sessions = useMemo(() => block?.weeks.flatMap((week) => week.sessions)
    .filter((session) => session.date >= weekStart && session.date < addDays(weekStart, 7)) ?? [], [block, weekStart]);

  async function moveSession(targetDate: string) {
    if (!block || !moveTarget) return;
    const targetWeekIndex = block.weeks.findIndex((week) =>
      targetDate >= week.weekStartDate && targetDate <= addDays(week.weekStartDate, 6));
    if (targetWeekIndex < 0) {
      setMessage('That day is outside the current goal-plan block. Extend or rebuild the plan before moving a session there.');
      setMoveTarget(null);
      return;
    }

    const conflict = eventsForDate(events, targetDate).filter((event) =>
      event.discipline && event.discipline !== 'rest' && event.discipline !== 'other');
    const movedSession: PlannedStrengthSession = {
      ...moveTarget,
      date: targetDate,
      completionStatus: moveTarget.completionStatus === 'planned' ? 'modified' : moveTarget.completionStatus,
      placementNote: conflict.length
        ? `Moved by the athlete. Shares the day with ${conflict.map((item) => item.title).join(', ')}.`
        : 'Moved by the athlete from the original generated date.',
    };

    const weeksWithoutSession = block.weeks.map((week) => ({
      ...week,
      sessions: week.sessions.filter((session) => session.id !== moveTarget.id),
    }));
    const updatedWeeks = weeksWithoutSession.map((week, index) => {
      const sessions = index === targetWeekIndex
        ? [...week.sessions, movedSession]
        : week.sessions;
      return {
        ...week,
        sessions: sessions
          .sort((left, right) => left.date.localeCompare(right.date))
          .map((session, order) => ({ ...session, order: order + 1 })),
      };
    });
    const updated: TrainingBlockPlan = { ...block, weeks: updatedWeeks };

    await saveTrainingBlock(updated);
    setBlock(updated);
    setMoveTarget(null);
    setMessage(conflict.length
      ? `Moved to ${formatLongDate(targetDate)}. Review the same-day training conflict.`
      : `Moved to ${formatLongDate(targetDate)}.`);
  }

  function preview(session: PlannedStrengthSession) {
    setPreviewWorkout(session.workout);
    router.push('/workout-preview' as Href);
  }

  function previewEndurance(event: TrainingCalendarEvent) {
    router.push(`/endurance-preview?id=${encodeURIComponent(event.id)}&date=${event.startAt.slice(0, 10)}` as Href);
  }

  async function toggleSkipped(session: PlannedStrengthSession) {
    const status = session.completionStatus === 'skipped' ? 'planned' : 'skipped';
    const updated = await updatePlannedSessionStatus(session.id, status);
    if (updated) setBlock(updated);
    setMessage(status === 'skipped'
      ? `${session.title} marked skipped. The rest of the block remains unchanged.`
      : `${session.title} returned to the plan.`);
  }

  async function deleteEvent(event: TrainingCalendarEvent) {
    await deleteManualCalendarEvent(event.id);
    await load();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Home</Text>
        </Pressable>
        <Text style={styles.topTitle}>Training schedule</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>ONE TRAINING WEEK</Text>
          <Text style={styles.title}>See endurance and strength together</Text>
          <Text style={styles.subtitle}>
            Planned calendar events, completed Strava training, and goal-plan strength sessions appear together. Swim, bike, run, strength, and HIIT/class completions can match conservatively to one planned item.
          </Text>
        </View>

        <View style={styles.weekControls}>
          <Pressable onPress={() => setWeekStart(addDays(weekStart, -7))} style={styles.weekButton}>
            <Text style={styles.weekButtonText}>‹ Previous</Text>
          </Pressable>
          <View style={styles.weekLabel}>
            <Text style={styles.weekLabelTitle}>{formatRange(weekStart)}</Text>
            <Pressable onPress={() => setWeekStart(startOfWeek(new Date()))}>
              <Text style={styles.todayLink}>Today</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => setWeekStart(addDays(weekStart, 7))} style={styles.weekButton}>
            <Text style={styles.weekButtonText}>Next ›</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => setShowManualEvent(true)} style={styles.addButton}>
          <Text style={styles.addButtonText}>+ Add Manual Training Event</Text>
        </Pressable>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        {days.map((date) => {
          const dayEvents = eventsForDate(events, date);
          const daySessions = sessions.filter((session) => session.date === date);
          const dayActivities = activities.filter((activity) => activity.classification !== 'ignored' && activityDate(activity) === date);
          const dayMatchByEvent = new Map(matches.filter((match) => match.calendarEventId).map((match) => [match.calendarEventId!, match]));
          const dayActivityById = new Map(dayActivities.map((activity) => [activity.id, activity]));
          const visibleEvents = dayEvents.filter((event) => { const match = dayMatchByEvent.get(event.id); return !match || !dayActivityById.has(match.activityId) || (match.status !== 'matched' && match.status !== 'ambiguous'); });
          const isToday = date === localIsoDate(new Date());
          return (
            <View key={date} style={[styles.dayCard, isToday && styles.dayCardToday]}>
              <View style={styles.dayHeader}>
                <View>
                  <Text style={styles.dayName}>{formatWeekday(date)}</Text>
                  <Text style={styles.dayDate}>{formatMonthDay(date)}</Text>
                </View>
                {isToday ? <Text style={styles.todayBadge}>TODAY</Text> : null}
              </View>

              {visibleEvents.length === 0 && daySessions.length === 0 && dayActivities.length === 0 ? (
                <Text style={styles.emptyDay}>No scheduled training.</Text>
              ) : null}

              {visibleEvents.map((event) => {
                const prescribed = event.sourceId === SIDE_QUEST_PLAN_SOURCE_ID && isEnduranceEvent(event);
                const content = <>
                  <View style={styles.eventCopy}>
                    <Text style={styles.eventLabel}>{(event.discipline ?? 'other').toUpperCase()}</Text>
                    <Text style={styles.eventTitle}>{event.title}</Text>
                    <Text style={styles.helper}>{prescribed ? plannedEnduranceMeta(event) : event.allDay ? 'All day' : formatTime(event.startAt)}</Text>
                  </View>
                  {prescribed ? <View style={styles.sessionActions}><View style={styles.smallButton}><Text style={styles.smallButtonText}>Open</Text></View></View> : event.sourceId === 'manual' ? (
                    <Pressable onPress={() => void deleteEvent(event)} style={styles.deleteButton}>
                      <Text style={styles.deleteText}>Remove</Text>
                    </Pressable>
                  ) : null}
                </>;
                return prescribed
                  ? <Pressable accessibilityRole="button" key={event.id} onPress={() => previewEndurance(event)} style={[styles.eventCard, disciplineStyle(event.discipline)]}>{content}</Pressable>
                  : <View key={event.id} style={[styles.eventCard, disciplineStyle(event.discipline)]}>{content}</View>;
              })}

              {dayActivities.map((activity) => {
                const match = matches.find((candidate) => candidate.activityId === activity.id);
                const matchedEvent = match?.calendarEventId ? dayEvents.find((event) => event.id === match.calendarEventId) : undefined;
                const needsReview = match?.status === 'ambiguous';
                return (
                  <Pressable key={activity.id} onPress={() => router.push({ pathname: '/activity-review', params: { id: activity.id } } as Href)} style={[styles.completedCard, disciplineStyle(activity.discipline)]}>
                    <View style={styles.eventCopy}>
                      <Text style={styles.completedLabel}>{needsReview ? 'REVIEW MATCH' : 'COMPLETED'} · {activityDisciplineLabel(activity)}</Text>
                      <Text style={styles.eventTitle}>{activity.name}</Text>
                      <Text style={styles.helper}>{formatActivityTime(activity)} · {Math.max(1, Math.round(activity.movingTimeSeconds / 60))} min · {activityContextLabel(activity)}</Text>
                      <Text style={styles.matchText}>{matchedEvent ? `${needsReview ? 'Possible match' : 'Planned as'}: ${matchedEvent.title} · ${Math.round((match?.confidence ?? 0) * 100)}% confidence` : matchLabel(match)}</Text>
                    </View>
                    <Text style={styles.cardArrow}>›</Text>
                  </Pressable>
                );
              })}

              {daySessions.map((session) => (
                <View key={session.id} style={styles.strengthCard}>
                  <View style={styles.eventCopy}>
                    <Text style={styles.strengthLabel}>GOAL-PLAN STRENGTH</Text>
                    <Text style={styles.eventTitle}>{session.title}</Text>
                    <Text style={styles.helper}>{titleCase(session.intendedLoad)} load · {Math.round(session.workout.totalWorkSeconds / 60)} min</Text>
                    {session.coachReview ? <Text style={styles.placement}>Coach edit by {session.coachReview.coachDisplayName}{session.coachReview.note ? ` · ${session.coachReview.note}` : ''}</Text> : null}
                    {session.friendSubstitution ? <Text style={styles.placement}>Substituted with {session.friendSubstitution.replacementWorkoutName} · {session.friendSubstitution.sourceDisplayNames.join(' + ')}</Text> : null}
                    {session.placementNote ? <Text style={styles.placement}>{session.placementNote}</Text> : null}
                  </View>
                  <View style={styles.sessionActions}>
                    <Pressable onPress={() => preview(session)} style={styles.smallButton}>
                      <Text style={styles.smallButtonText}>Open</Text>
                    </Pressable>
                    <Pressable onPress={() => setMoveTarget(session)} style={styles.smallButton}>
                      <Text style={styles.smallButtonText}>Move</Text>
                    </Pressable>
                    <Pressable onPress={() => void toggleSkipped(session)} style={styles.smallButton}>
                      <Text style={styles.smallButtonText}>{session.completionStatus === 'skipped' ? 'Restore' : 'Skip'}</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          );
        })}

        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>How rescheduling works</Text>
          <Text style={styles.helper}>
            Completed Strava activities can trigger a snapshot-backed strength move when the conflict is clear. Ambiguous planned-versus-completed matches remain labeled for review, and every automatic replan can be undone.
          </Text>
        </View>
      </ScrollView>

      <MoveSessionModal
        session={moveTarget}
        days={days}
        events={events}
        onClose={() => setMoveTarget(null)}
        onSelect={(date) => void moveSession(date)}
      />
      <ManualEventModal
        visible={showManualEvent}
        initialDate={days[0]}
        onClose={() => setShowManualEvent(false)}
        onSaved={async () => {
          setShowManualEvent(false);
          await load();
        }}
      />
    </SafeAreaView>
  );
}

function MoveSessionModal({
  session,
  days,
  events,
  onClose,
  onSelect,
}: {
  session: PlannedStrengthSession | null;
  days: string[];
  events: TrainingCalendarEvent[];
  onClose: () => void;
  onSelect: (date: string) => void;
}) {
  return (
    <Modal visible={Boolean(session)} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <View style={styles.eventCopy}>
            <Text style={styles.eyebrow}>MOVE STRENGTH SESSION</Text>
            <Text style={styles.modalTitle}>{session?.title}</Text>
          </View>
          <Pressable onPress={onClose}><Text style={styles.doneText}>Done</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <Text style={styles.subtitle}>Choose a day. Same-day endurance sessions are shown before you confirm.</Text>
          {days.map((date) => {
            const conflicts = eventsForDate(events, date).filter((event) => event.discipline !== 'rest' && event.discipline !== 'other');
            return (
              <Pressable key={date} onPress={() => onSelect(date)} style={[styles.moveDay, session?.date === date && styles.moveDayCurrent]}>
                <View style={styles.eventCopy}>
                  <Text style={styles.moveDayTitle}>{formatLongDate(date)}</Text>
                  <Text style={styles.helper}>
                    {conflicts.length ? `Also scheduled: ${conflicts.map((item) => item.title).join(' · ')}` : 'No imported endurance conflict.'}
                  </Text>
                </View>
                <Text style={styles.cardArrow}>{session?.date === date ? 'Current' : '→'}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ManualEventModal({
  visible,
  initialDate,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initialDate: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(initialDate);
  const [discipline, setDiscipline] = useState<TrainingCalendarEvent['discipline']>('run');
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setMessage(null);
    if (!title.trim()) {
      setMessage('Add a session title.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setMessage('Use YYYY-MM-DD for the date.');
      return;
    }
    await upsertManualCalendarEvent({
      id: `manual_${Date.now()}`,
      sourceId: 'manual',
      title: title.trim(),
      startAt: `${date}T12:00:00.000Z`,
      allDay: true,
      discipline,
      description: 'Manually added in Side Quest.',
      externalUid: `manual-${Date.now()}`,
    });
    setTitle('');
    await onSaved();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add training event</Text>
          <Pressable onPress={onClose}><Text style={styles.doneText}>Cancel</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>Session title</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="e.g., Long trail run" placeholderTextColor="#7B867F" style={styles.input} />
          <Text style={styles.fieldLabel}>Date</Text>
          <TextInput value={date} onChangeText={setDate} autoCapitalize="none" placeholder="YYYY-MM-DD" placeholderTextColor="#7B867F" style={styles.input} />
          <Text style={styles.fieldLabel}>Discipline</Text>
          <View style={styles.chipWrap}>
            {DISCIPLINES.map((item) => (
              <Pressable key={item.value} onPress={() => setDiscipline(item.value)} style={[styles.chip, discipline === item.value && styles.chipSelected]}>
                <Text style={[styles.chipText, discipline === item.value && styles.chipTextSelected]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          {message ? <Text style={styles.error}>{message}</Text> : null}
          <Pressable onPress={() => void save()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Add to Schedule</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function matchLabel(match?: PlannedCompletedMatch) {
  if (!match || match.status === 'unmatched') return 'No planned session matched automatically.';
  if (match.status === 'ambiguous') return `Possible planned match · ${Math.round(match.confidence * 100)}% confidence`;
  if (match.status === 'dismissed') return 'Planned match dismissed.';
  return `Matched to planned session · ${Math.round(match.confidence * 100)}% confidence`;
}

function activityDisciplineLabel(activity: EnduranceActivity) {
  if (activity.discipline === 'hiit') return 'HIIT / CLASS';
  return activity.discipline.toUpperCase();
}
function activityContextLabel(activity: EnduranceActivity) {
  if (activity.discipline === 'strength' || activity.discipline === 'hiit') {
    if (activity.classification === 'full_body_strength') return 'full-body strength credit';
    if (activity.classification === 'conditioning') return 'conditioning only';
    return 'muscle credit not classified';
  }
  return activity.intensity === 'unknown' ? 'intensity not estimated' : `${titleCase(activity.intensity)} intensity`;
}
function activityDate(activity: EnduranceActivity) {
  return activity.startLocal?.slice(0, 10) || localIsoDate(new Date(activity.startAt));
}
function formatActivityTime(activity: EnduranceActivity) {
  if (!activity.startLocal) return formatTime(activity.startAt);
  const localValue = activity.startLocal.replace(/Z$/, '').replace(/[+-]\d{2}:?\d{2}$/, '');
  return formatTime(localValue);
}
function eventsForDate(events: TrainingCalendarEvent[], date: string) {
  return events.filter((event) => localIsoDate(new Date(event.startAt)) === date);
}
function isEnduranceEvent(event: TrainingCalendarEvent) { return event.discipline === 'swim' || event.discipline === 'bike' || event.discipline === 'run'; }
function plannedEnduranceMeta(event: TrainingCalendarEvent) {
  const match = event.description?.match(/Side Quest generated · (\d+) min · ([a-z_]+)/i);
  if (match) return `${match[1]} min · ${titleCase(match[2] ?? 'planned')}`;
  if (event.endAt) return `${Math.max(1, Math.round((new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 60_000))} min · Planned`;
  return 'Planned workout';
}
function disciplineStyle(discipline: TrainingCalendarEvent['discipline'] | EnduranceActivity['discipline']) {
  switch (discipline) {
    case 'swim': return styles.swimEvent;
    case 'bike': return styles.bikeEvent;
    case 'run': return styles.runEvent;
    case 'strength': return styles.strengthEvent;
    case 'hiit': return styles.hiitEvent;
    case 'rest': return styles.restEvent;
    default: return styles.otherEvent;
  }
}
function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day));
  return localIsoDate(result);
}
function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}
function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function formatRange(start: string) {
  return `${formatMonthDay(start)} – ${formatMonthDay(addDays(start, 6))}`;
}
function formatWeekday(value: string) { return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(`${value}T12:00:00`)); }
function formatMonthDay(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
function formatLongDate(value: string) { return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
function formatTime(value: string) { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
function titleCase(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase()); }

const colors = {
  background: '#E4EBE3', card: '#FFFDF8', ink: '#01234D', muted: '#6B7770', border: '#164C73',
  accent: '#153E2F', accentSoft: '#D8E9DF', warm: '#F4E7D2', danger: '#9C3C31',
};
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  backButton: { flex: 1, paddingVertical: 6 },
  backText: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  topTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 72, gap: 14 },
  intro: { gap: 6 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 29, fontWeight: '700', lineHeight: 35 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  weekControls: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 10 },
  weekButton: { paddingHorizontal: 8, paddingVertical: 10 },
  weekButtonText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  weekLabel: { flex: 1, alignItems: 'center', gap: 2 },
  weekLabelTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  todayLink: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  addButton: { borderWidth: 1, borderColor: colors.accent, borderRadius: 14, paddingVertical: 13, alignItems: 'center', backgroundColor: colors.accentSoft },
  addButtonText: { color: colors.accent, fontWeight: '800' },
  message: { color: colors.accent, backgroundColor: colors.accentSoft, borderRadius: 12, padding: 12, fontSize: 13, fontWeight: '700' },
  dayCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 16, gap: 10 },
  dayCardToday: { borderWidth: 2, borderColor: colors.accent },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayName: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  dayDate: { color: colors.muted, fontSize: 13 },
  todayBadge: { color: colors.accent, backgroundColor: colors.accentSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '800' },
  emptyDay: { color: colors.muted, fontSize: 13, fontStyle: 'italic', paddingVertical: 5 },
  eventCard: { flexDirection: 'row', gap: 10, borderRadius: 15, padding: 12, borderLeftWidth: 5 },
  swimEvent: { backgroundColor: '#E7F1F5', borderLeftColor: '#4B88A2' },
  bikeEvent: { backgroundColor: '#F3EEDC', borderLeftColor: '#A4872E' },
  runEvent: { backgroundColor: '#F7E8E1', borderLeftColor: '#B76A47' },
  strengthEvent: { backgroundColor: colors.accentSoft, borderLeftColor: colors.accent },
  hiitEvent: { backgroundColor: '#F0EBF5', borderLeftColor: '#80639A' },
  restEvent: { backgroundColor: '#EEF0EF', borderLeftColor: '#87938C' },
  otherEvent: { backgroundColor: '#F0EBF5', borderLeftColor: '#80639A' },
  eventCopy: { flex: 1, gap: 3 },
  eventLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  strengthLabel: { color: colors.accent, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  eventTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  placement: { color: colors.accent, fontSize: 12, lineHeight: 17 },
  strengthCard: { flexDirection: 'row', gap: 10, borderRadius: 15, padding: 12, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: '#BDD0C3' },
  completedCard: { flexDirection: 'row', gap: 10, borderRadius: 15, padding: 12, borderLeftWidth: 5, borderWidth: 1, borderColor: colors.border },
  completedLabel: { color: colors.accent, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  matchText: { color: colors.accent, fontSize: 11, fontWeight: '700', lineHeight: 16 },
  sessionActions: { gap: 6, justifyContent: 'center' },
  smallButton: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#BDD0C3', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center' },
  smallButtonText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  deleteButton: { justifyContent: 'center', padding: 6 },
  deleteText: { color: colors.danger, fontSize: 11, fontWeight: '700' },
  noticeCard: { backgroundColor: colors.warm, borderRadius: 18, padding: 16, gap: 5 },
  noticeTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  modalSafeArea: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { color: colors.ink, fontSize: 21, fontWeight: '800' },
  doneText: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  modalContent: { padding: 20, paddingBottom: 60, gap: 13 },
  moveDay: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 15 },
  moveDayCurrent: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  moveDayTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  cardArrow: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, color: colors.ink, fontSize: 15 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.card },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  chipTextSelected: { color: colors.accent },
  primaryButton: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 5 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 13, fontWeight: '700' },
});
