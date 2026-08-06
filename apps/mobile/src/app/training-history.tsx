import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen, Pill, SectionTitle, Surface } from '@/components/v12-ui';
import {
  filterTrainingHistory,
  loadTrainingHistory,
  type TrainingHistoryFilter,
  type TrainingHistoryItem,
} from '@/services/training-history';
import { useTheme } from '@/state/theme-context';
import { typography, type AppPalette } from '@/theme';

const FILTERS: Array<{ id: TrainingHistoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'strength', label: 'Strength' },
  { id: 'endurance', label: 'Endurance' },
  { id: 'review', label: 'Needs review' },
];

export default function TrainingHistoryScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [items, setItems] = useState<TrainingHistoryItem[]>([]);
  const [filter, setFilter] = useState<TrainingHistoryFilter>('all');
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let live = true;
    setLoading(true);
    void loadTrainingHistory().then((next) => {
      if (!live) return;
      setItems(next);
      setLoading(false);
    });
    return () => { live = false; };
  }, []));

  const visible = filterTrainingHistory(items, filter);
  const reviewCount = items.filter((item) => item.needsReview).length;

  return <AppScreen
    eyebrow="HISTORY"
    title="Training history"
    subtitle="Strength and imported endurance activities in one timeline. Linked watch recordings are counted once."
  >
    <View style={styles.filters}>
      {FILTERS.map((option) => <Pressable
        key={option.id}
        accessibilityRole="button"
        accessibilityState={{ selected: filter === option.id }}
        onPress={() => setFilter(option.id)}
        style={[styles.filter, filter === option.id && styles.filterActive]}
      >
        <Text style={[styles.filterText, filter === option.id && styles.filterTextActive]}>
          {option.label}{option.id === 'review' && reviewCount ? ` (${reviewCount})` : ''}
        </Text>
      </Pressable>)}
    </View>

    <Surface style={styles.explainer}>
      <Text style={styles.explainerTitle}>Counting rules</Text>
      <Text style={styles.helper}>Exercises, sets, and regional strength credit come from Side Quest. Watch duration, heart rate, and Relative Effort stay attached as sensor context. Imported endurance contributes sport-load context, not direct strength credit.</Text>
    </Surface>

    <SectionTitle detail={`${visible.length} record${visible.length === 1 ? '' : 's'}`}>
      {filter === 'review' ? 'Records needing a decision' : 'Recent training'}
    </SectionTitle>
    {!loading && visible.length === 0 ? <Surface>
      <Text style={styles.emptyTitle}>{filter === 'review' ? 'Nothing needs review' : 'No training records yet'}</Text>
      <Text style={styles.helper}>{filter === 'review' ? 'Side Quest has no uncertain matches or unresolved watch-recorded strength activities.' : 'Complete a Side Quest workout or connect an endurance source to build this timeline.'}</Text>
    </Surface> : null}
    {loading ? <Surface><Text style={styles.helper}>Loading training history…</Text></Surface> : null}

    {visible.map((item) => item.kind === 'strength'
      ? <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.workout.name} strength workout`}
          onPress={() => router.push({ pathname: '/workout-detail', params: { id: item.workout.id } } as never)}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <View style={styles.top}>
            <View style={styles.dateBox}><Text style={styles.month}>{month(item.occurredAt)}</Text><Text style={styles.day}>{day(item.occurredAt)}</Text></View>
            <View style={styles.content}>
              <View style={styles.titleRow}><Text style={styles.title}>{item.workout.name}</Text><Pill tone="good">STRENGTH</Pill></View>
              <Text style={styles.meta}>{strengthSummary(item.workout)}</Text>
              {item.sensorActivity ? <Text style={styles.linked}>Watch data attached · counted once{sensorSummary(item.sensorActivity)}</Text> : null}
              {item.workout.relationToPlan === 'replaced_planned' ? <Text style={styles.plan}>Satisfied a planned strength session</Text> : null}
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </Pressable>
      : <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`Review ${item.activity.name} activity`}
          onPress={() => router.push({ pathname: '/activity-review', params: { id: item.activity.id } } as never)}
          style={({ pressed }) => [styles.card, item.needsReview && styles.reviewCard, pressed && styles.pressed]}
        >
          <View style={styles.top}>
            <View style={styles.dateBox}><Text style={styles.month}>{month(item.occurredAt)}</Text><Text style={styles.day}>{day(item.occurredAt)}</Text></View>
            <View style={styles.content}>
              <View style={styles.titleRow}><Text style={styles.title}>{item.activity.name}</Text><Pill tone={item.needsReview ? 'warn' : 'neutral'}>{item.needsReview ? 'REVIEW' : item.activity.discipline.toUpperCase()}</Pill></View>
              <Text style={styles.meta}>{Math.round(item.activity.movingTimeSeconds / 60)} min · {intensity(item.activity.intensity)}{item.activity.deletedAt ? ' · deleted at source' : ''}</Text>
              <Text style={styles.plan}>{matchSummary(item)}</Text>
              {item.activity.classification === 'ignored' ? <Text style={styles.ignored}>Ignored in Side Quest calculations</Text> : null}
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </Pressable>)}
  </AppScreen>;
}

function strengthSummary(workout: Extract<TrainingHistoryItem, { kind: 'strength' }>['workout']) {
  const completedSets = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length, 0);
  return `${workout.exercises.length} exercises · ${completedSets} completed sets · ${Math.round(workout.completionFraction * 100)}% completed`;
}
function sensorSummary(activity: Extract<TrainingHistoryItem, { kind: 'endurance' }>['activity']) {
  const details = [`${Math.round(activity.movingTimeSeconds / 60)} min`];
  if (activity.averageHeartRate) details.push(`avg HR ${Math.round(activity.averageHeartRate)}`);
  if (activity.relativeEffort) details.push(`Relative Effort ${Math.round(activity.relativeEffort)}`);
  return ` · ${details.join(' · ')}`;
}
function matchSummary(item: Extract<TrainingHistoryItem, { kind: 'endurance' }>) {
  if (item.sensorLink?.status === 'ambiguous') return 'Possible Side Quest duplicate · choose whether to link it';
  if ((item.activity.discipline === 'strength' || item.activity.discipline === 'hiit') && item.needsReview) return 'Watch-recorded strength · classify or link to a Side Quest workout';
  if (item.plannedMatch?.status === 'matched') return `Matched to planned session · ${Math.round(item.plannedMatch.confidence * 100)}% confidence`;
  if (item.plannedMatch?.status === 'ambiguous') return 'Possible planned-session match · review recommended';
  if (item.plannedMatch?.status === 'dismissed') return 'Confirmed as not matched to a planned session';
  return 'No planned-session match';
}
function month(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(value)).toUpperCase(); }
function day(value: string) { return new Intl.DateTimeFormat('en-US', { day: 'numeric' }).format(new Date(value)); }
function intensity(value: string) { return value === 'unknown' ? 'intensity unavailable' : `${value} intensity`; }
function makeStyles(p: AppPalette) { return StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filter: { borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  filterActive: { backgroundColor: p.forest, borderColor: p.forest },
  filterText: { color: p.ink, fontSize: 12, fontWeight: '800' },
  filterTextActive: { color: p.white },
  explainer: { backgroundColor: p.sand, gap: 5 },
  explainerTitle: { color: p.ink, fontSize: 16, fontWeight: '900' },
  helper: { ...typography.small, color: p.inkMuted },
  emptyTitle: { color: p.ink, fontSize: 17, fontWeight: '900', marginBottom: 4 },
  card: { backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 22, padding: 16 },
  reviewCard: { borderWidth: 2, borderColor: p.warning },
  pressed: { opacity: 0.7 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dateBox: { width: 47, minHeight: 50, borderRadius: 16, backgroundColor: p.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  month: { color: p.forest, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  day: { color: p.ink, fontSize: 22, fontWeight: '900' },
  content: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, flexWrap: 'wrap' },
  title: { flex: 1, minWidth: 150, color: p.ink, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  meta: { ...typography.small, color: p.inkMuted },
  linked: { color: p.forest, fontSize: 11, lineHeight: 15, fontWeight: '800' },
  plan: { color: p.ink, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  ignored: { color: p.inkMuted, fontSize: 10, fontWeight: '800' },
  chevron: { color: p.forest, fontSize: 25, lineHeight: 28 },
}); }
