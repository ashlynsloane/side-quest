import type { EnduranceActivity, Exercise } from '@circuit/domain';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppScreen, Pill, SectionTitle, Surface } from '@/components/v12-ui';
import {
  deleteWorkoutLedgerEntry,
  getSocialPreferences,
  listWorkoutLedgerEntries,
  getWorkoutLedgerEntry,
  getWorkoutSensorContext,
  updateWorkoutLedgerEntry,
  type LoadBasis,
  type LoggedExercise,
  type WorkoutLedgerEntry,
} from '@/services/database';
import { useExerciseCatalog } from '@/services/exercise-catalog';
import { deleteWorkoutActivity, publishWorkoutActivity } from '@/services/social';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';
import { radius, typography, type AppPalette } from '@/theme';

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, cloudEnabled } = useAuth();
  const router = useRouter();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { exercises } = useExerciseCatalog();
  const [entry, setEntry] = useState<WorkoutLedgerEntry | null>(null);
  const [sensorActivity, setSensorActivity] = useState<EnduranceActivity | null>(null);
  const [matchingIndex, setMatchingIndex] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  useFocusEffect(useCallback(() => {
    if (!id) return;
    void Promise.all([getWorkoutLedgerEntry(id), getWorkoutSensorContext(id)]).then(([nextEntry, sensor]) => {
      setEntry(nextEntry);
      setSensorActivity(sensor?.activity ?? null);
    });
  }, [id]));

  if (!entry) return <AppScreen title="Workout not found"><Text style={styles.helper}>This workout may have been deleted.</Text></AppScreen>;
  const currentEntry = entry;

  function SensorMetric({ label, value }: { label: string; value: string }) {
    return <View style={styles.sensorMetric}><Text style={styles.sensorMetricLabel}>{label}</Text><Text style={styles.sensorMetricValue}>{value}</Text></View>;
  }

  function updateExercise(index: number, patch: Partial<LoggedExercise>) {
    setEntry((current) => current ? {
      ...current,
      exercises: current.exercises.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    } : current);
  }

  function updateSet(index: number, setIndex: number, field: 'reps' | 'load' | 'completed', value: string | boolean) {
    setEntry((current) => {
      if (!current) return current;
      return {
        ...current,
        exercises: current.exercises.map((item, itemIndex) => itemIndex !== index ? item : {
          ...item,
          sets: item.sets.map((set, currentSetIndex) => currentSetIndex !== setIndex ? set : {
            ...set,
            ...(field === 'reps'
              ? { reps: Number(value) || undefined, seconds: undefined }
              : field === 'load'
                ? { loadValue: Number(value) || undefined }
                : { completed: Boolean(value) }),
          }),
        }),
      };
    });
  }

  function addSet(index: number) {
    setEntry((current) => {
      if (!current) return current;
      return {
        ...current,
        exercises: current.exercises.map((item, itemIndex) => itemIndex !== index ? item : {
          ...item,
          sets: [
            ...item.sets,
            {
              ...(item.sets.at(-1) ?? { loadBasis: 'not_recorded' as LoadBasis, completed: true }),
              id: `${item.id}_set_${Date.now()}`,
            },
          ],
        }),
      };
    });
  }

  function changeLoadBasis(index: number, loadBasis: LoadBasis) {
    setEntry((current) => current ? {
      ...current,
      exercises: current.exercises.map((item, itemIndex) => itemIndex !== index ? item : {
        ...item,
        sets: item.sets.map((set) => ({
          ...set,
          loadBasis,
          loadValue: loadBasis === 'bodyweight' || loadBasis === 'not_recorded' ? undefined : set.loadValue,
          loadUnit: loadBasis === 'bodyweight' || loadBasis === 'not_recorded' || loadBasis === 'band_level' ? undefined : (set.loadUnit ?? 'lb'),
        })),
      }),
    } : current);
  }

  function toggleLoadUnit(index: number) {
    setEntry((current) => current ? {
      ...current,
      exercises: current.exercises.map((item, itemIndex) => itemIndex !== index ? item : {
        ...item,
        sets: item.sets.map((set) => set.loadValue ? { ...set, loadUnit: set.loadUnit === 'kg' ? 'lb' : 'kg' } : set),
      }),
    } : current);
  }

  function addExercise() {
    const nextIndex = currentEntry.exercises.length;
    const next: LoggedExercise = {
      id: `edited_exercise_${Date.now()}_${nextIndex}`,
      name: 'Choose an exercise',
      sets: [{ id: `edited_set_${Date.now()}`, reps: 10, loadBasis: 'not_recorded', completed: true }],
      bodyRegions: [],
      movementPatterns: [],
      matchConfidence: 'unmatched',
    };
    setEntry({ ...currentEntry, exercises: [...currentEntry.exercises, next] });
    setMatchingIndex(nextIndex);
    setQuery('');
  }

  function chooseMatch(index: number, exercise: Exercise) {
    updateExercise(index, {
      exerciseId: exercise.id,
      name: exercise.name,
      bodyRegions: exercise.bodyRegions,
      movementPatterns: exercise.movementPatterns,
      equipmentId: exercise.equipmentOptions.flatMap((option) => option.items).find((item) => item.equipmentId !== 'bodyweight')?.equipmentId
        ?? exercise.equipmentOptions[0]?.items[0]?.equipmentId,
      matchConfidence: 'manual',
    });
    setMatchingIndex(null);
  }

  async function save() {
    const latest = entry;
    if (!latest) return;
    await updateWorkoutLedgerEntry({ ...latest, updatedAt: new Date().toISOString() });
    if (cloudEnabled && user?.mode === 'cloud') {
      try {
        const [preferences, weekEntries] = await Promise.all([
          getSocialPreferences(),
          listWorkoutLedgerEntries({ from: startOfWeekIso(), limit: 100 }),
        ]);
        await publishWorkoutActivity({
          userId: user.id,
          ledgerId: latest.id,
          workoutType: latest.source === 'class' ? 'Strength class' : latest.source === 'workout_together' ? 'Workout Together' : 'Strength workout',
          title: latest.name,
          weeklyCount: weekEntries.length,
          completedAt: latest.completedAt,
          exercises: latest.exercises,
          preferences,
        });
      } catch {}
    }
    Alert.alert('Workout updated', 'Training memory, progression history, and any shared activity were recalculated.');
  }

  function remove() {
    const latest = entry;
    if (!latest) return;
    Alert.alert('Delete workout?', `Delete ${latest.name}? This will remove its muscle exposure and progression data.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void (async () => {
          await deleteWorkoutLedgerEntry(latest.id);
          if (cloudEnabled && user?.mode === 'cloud') {
            try { await deleteWorkoutActivity(user.id, latest.id); } catch {}
          }
          router.replace('/workout-history' as Href);
        })(),
      },
    ]);
  }

  const choices = matchingIndex === null
    ? []
    : exercises.filter((exercise) => matches(exercise, query || currentEntry.exercises[matchingIndex]?.name || '')).slice(0, 12);

  return <AppScreen eyebrow="EDIT WORKOUT" title={currentEntry.name} subtitle="Correct exercises, sets, reps, loads, completion, or notes. Changes immediately rebuild the derived training-memory record.">
    <View style={styles.headerRow}>
      <Pill tone={currentEntry.source === 'side_quest' ? 'good' : 'neutral'}>{currentEntry.source.replaceAll('_', ' ')}</Pill>
      <Text style={styles.date}>{formatDate(currentEntry.completedAt)}</Text>
    </View>
    {currentEntry.workout?.sharedContext ? <Surface style={styles.sensorCard}>
      <View style={styles.sensorHeader}><View style={{ flex: 1 }}><Text style={styles.sensorTitle}>{currentEntry.workout.sharedContext.selectionMode === 'combined' ? 'Combined friend workout' : 'Friend workout'}</Text><Text style={styles.helper}>{currentEntry.workout.sharedContext.sourceDisplayNames.join(' + ') || 'Workout Together'} · room {currentEntry.workout.sharedContext.roomCode}</Text></View><Pill tone={currentEntry.relationToPlan === 'replaced_planned' ? 'good' : 'neutral'}>{currentEntry.relationToPlan === 'replaced_planned' ? 'substituted plan' : 'additional'}</Pill></View>
      <Text style={styles.sensorNote}>{currentEntry.relationToPlan === 'replaced_planned' ? 'This shared session satisfied one of your planned strength workouts. The source workout and your personal completion remain separate from your friend’s history.' : 'This was recorded as an additional shared workout and did not replace a planned session.'}</Text>
    </Surface> : null}
    {sensorActivity ? <>
      <SectionTitle>Watch data</SectionTitle>
      <Surface style={styles.sensorCard}>
        <View style={styles.sensorHeader}><View style={{ flex: 1 }}><Text style={styles.sensorTitle}>{sensorActivity.name}</Text><Text style={styles.helper}>Strava sensor layer attached to this Side Quest workout</Text></View><Pill tone="neutral">watch</Pill></View>
        <View style={styles.sensorMetrics}>
          <SensorMetric label="Duration" value={`${Math.round(sensorActivity.movingTimeSeconds / 60)} min`} />
          <SensorMetric label="Avg HR" value={sensorActivity.averageHeartRate ? `${Math.round(sensorActivity.averageHeartRate)} bpm` : 'Not available'} />
          <SensorMetric label="Max HR" value={sensorActivity.maxHeartRate ? `${Math.round(sensorActivity.maxHeartRate)} bpm` : 'Not available'} />
          <SensorMetric label="Relative effort" value={sensorActivity.relativeEffort ? String(Math.round(sensorActivity.relativeEffort)) : 'Not available'} />
        </View>
        <Text style={styles.sensorNote}>Exercises, sets, loads, and muscle credit come from Side Quest. Watch data is retained as session context, and Strava relative effort may inform intensity. It does not add muscle credit, so this workout is counted once.</Text>
      </Surface>
    </> : null}

    <Text style={styles.label}>Workout name</Text>
    <TextInput value={currentEntry.name} onChangeText={(name: string) => setEntry({ ...currentEntry, name })} style={styles.input} />
    <Text style={styles.label}>Completion</Text>
    <View style={styles.completionRow}>{[0.25, 0.5, 0.75, 1].map((value) => <Pressable key={value} onPress={() => setEntry({ ...currentEntry, completionFraction: value })} style={[styles.completion, currentEntry.completionFraction === value && styles.completionActive]}><Text style={[styles.completionText, currentEntry.completionFraction === value && styles.completionTextActive]}>{value * 100}%</Text></Pressable>)}</View>

    <SectionTitle>Exercises and sets</SectionTitle>
    {currentEntry.exercises.map((exercise, index) => <Surface key={exercise.id} style={styles.exercise}>
      <View style={styles.exerciseTop}>
        <View style={{ flex: 1 }}><Text style={styles.exerciseName}>{exercise.name}</Text><Text style={styles.meta}>{exercise.bodyRegions[0]?.region.replaceAll('_', ' ') ?? 'No muscle match'}</Text></View>
        <Pressable onPress={() => { setMatchingIndex(index); setQuery(exercise.name); }}><Text style={styles.change}>Change match</Text></Pressable>
      </View>
      {exercise.sets.map((set, setIndex) => <View key={set.id} style={styles.setRow}>
        <Pressable onPress={() => updateSet(index, setIndex, 'completed', !set.completed)} style={[styles.check, set.completed && styles.checkActive]}><Text style={styles.checkText}>{set.completed ? '✓' : ''}</Text></Pressable>
        <Text style={styles.setLabel}>Set {setIndex + 1}</Text>
        <TextInput value={set.reps ? String(set.reps) : ''} onChangeText={(value: string) => updateSet(index, setIndex, 'reps', value)} keyboardType="number-pad" style={styles.smallInput} />
        <Text style={styles.unitLabel}>reps</Text>
        <TextInput value={set.loadValue ? String(set.loadValue) : ''} onChangeText={(value: string) => updateSet(index, setIndex, 'load', value)} keyboardType="decimal-pad" style={styles.smallInput} />
        <Text style={styles.unitLabel}>{set.loadUnit ?? 'lb'}</Text>
        <Pressable onPress={() => updateExercise(index, { sets: exercise.sets.filter((_, itemIndex) => itemIndex !== setIndex) })}><Text style={styles.minus}>−</Text></Pressable>
      </View>)}
      <View style={styles.basisRow}>{([
        ['each_hand', 'Each hand'], ['single_implement', 'One weight'], ['total', 'Total'],
        ['bodyweight', 'Bodyweight'], ['band_level', 'Band'], ['not_recorded', 'No load'],
      ] as Array<[LoadBasis, string]>).map(([basis, label]) => <Pressable key={basis} onPress={() => changeLoadBasis(index, basis)} style={[styles.basis, exercise.sets[0]?.loadBasis === basis && styles.basisActive]}><Text style={[styles.basisText, exercise.sets[0]?.loadBasis === basis && styles.basisTextActive]}>{label}</Text></Pressable>)}</View>
      {exercise.sets.some((set) => set.loadValue) ? <Pressable onPress={() => toggleLoadUnit(index)}><Text style={styles.change}>Units: {exercise.sets.find((set) => set.loadValue)?.loadUnit ?? 'lb'} · tap to switch</Text></Pressable> : null}
      <Pressable onPress={() => addSet(index)}><Text style={styles.addSet}>＋ Add set</Text></Pressable>
      <Pressable onPress={() => setEntry({ ...currentEntry, exercises: currentEntry.exercises.filter((_, itemIndex) => itemIndex !== index) })}><Text style={styles.remove}>Remove exercise</Text></Pressable>
    </Surface>)}
    <Pressable onPress={addExercise} style={styles.addExercise}><Text style={styles.addExerciseText}>＋ Add missing exercise</Text></Pressable>

    <Text style={styles.label}>Notes</Text>
    <TextInput value={currentEntry.notes ?? ''} onChangeText={(notes: string) => setEntry({ ...currentEntry, notes })} multiline style={[styles.input, styles.notes]} />
    <Pressable onPress={() => void save()} style={styles.save}><Text style={styles.saveText}>Save corrections</Text></Pressable>
    <Pressable onPress={remove} style={styles.delete}><Text style={styles.deleteText}>Delete workout</Text></Pressable>

    {matchingIndex !== null ? <Surface style={styles.matcher}>
      <View style={styles.matcherTop}><Text style={styles.matcherTitle}>Choose exercise</Text><Pressable onPress={() => setMatchingIndex(null)}><Text style={styles.change}>Close</Text></Pressable></View>
      <TextInput value={query} onChangeText={setQuery} style={styles.input} placeholder="Search 150 curated exercises" placeholderTextColor={palette.inkMuted} />
      {choices.map((exercise) => <Pressable key={exercise.id} onPress={() => chooseMatch(matchingIndex, exercise)} style={styles.choice}><Text style={styles.exerciseName}>{exercise.name}</Text><Text style={styles.meta}>{exercise.movementPatterns[0]?.replaceAll('_', ' ')} · {exercise.bodyRegions[0]?.region.replaceAll('_', ' ')}</Text></Pressable>)}
    </Surface> : null}
  </AppScreen>;
}

function startOfWeekIso(): string {
  const date = new Date();
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}
function matches(exercise: Exercise, raw: string) {
  const tokens = raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const text = [exercise.name, ...exercise.aliases, ...exercise.movementPatterns, ...exercise.bodyRegions.map((item) => item.region)].join(' ').toLowerCase();
  return tokens.some((token) => text.includes(token));
}
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
function makeStyles(palette: AppPalette) { return StyleSheet.create({
  helper: { ...typography.small, color: palette.inkMuted }, sensorCard: { gap: 10, backgroundColor: palette.surfaceMuted }, sensorHeader: { flexDirection: 'row', gap: 8, alignItems: 'center' }, sensorTitle: { fontSize: 16, fontWeight: '900', color: palette.ink }, sensorMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, sensorMetric: { minWidth: '46%', flexGrow: 1, backgroundColor: palette.surface, borderRadius: 11, padding: 10 }, sensorMetricLabel: { ...typography.small, color: palette.inkMuted, fontWeight: '700' }, sensorMetricValue: { fontSize: 15, fontWeight: '900', color: palette.forest, marginTop: 2 }, sensorNote: { ...typography.small, color: palette.inkMuted, lineHeight: 18 }, headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, date: { ...typography.small, color: palette.inkMuted }, label: { ...typography.eyebrow, color: palette.forest }, input: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: radius.sm, padding: 12, color: palette.ink }, notes: { minHeight: 90, textAlignVertical: 'top' }, completionRow: { flexDirection: 'row', gap: 7 }, completion: { flex: 1, borderWidth: 1, borderColor: palette.border, borderRadius: 11, padding: 10, alignItems: 'center' }, completionActive: { backgroundColor: palette.forest }, completionText: { fontWeight: '900', color: palette.ink }, completionTextActive: { color: palette.white }, exercise: { gap: 10 }, exerciseTop: { flexDirection: 'row', gap: 8 }, exerciseName: { fontSize: 16, fontWeight: '900', color: palette.ink }, meta: { fontSize: 11, fontWeight: '800', color: palette.forest, textTransform: 'capitalize' }, change: { color: palette.forest, fontWeight: '900', fontSize: 12 }, setRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, check: { width: 25, height: 25, borderRadius: 7, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }, checkActive: { backgroundColor: palette.forest }, checkText: { color: palette.white, fontWeight: '900' }, setLabel: { fontSize: 11, fontWeight: '800', color: palette.inkMuted }, smallInput: { width: 48, backgroundColor: palette.canvas, borderWidth: 1, borderColor: palette.border, borderRadius: 9, padding: 8, textAlign: 'center', color: palette.ink }, unitLabel: { fontSize: 10, color: palette.inkMuted }, minus: { fontSize: 22, color: palette.danger }, basisRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, basis: { borderWidth: 1, borderColor: palette.border, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 7 }, basisActive: { backgroundColor: palette.forest, borderColor: palette.forest }, basisText: { fontSize: 10, fontWeight: '800', color: palette.inkMuted }, basisTextActive: { color: palette.white }, addSet: { color: palette.forest, fontWeight: '900' }, remove: { color: palette.danger, fontWeight: '800', fontSize: 12 }, addExercise: { borderWidth: 1, borderStyle: 'dashed', borderColor: palette.forest, borderRadius: 14, padding: 13, alignItems: 'center' }, addExerciseText: { color: palette.forest, fontWeight: '900' }, save: { backgroundColor: palette.forest, borderRadius: 14, padding: 14, alignItems: 'center' }, saveText: { color: palette.white, fontWeight: '900' }, delete: { borderWidth: 1, borderColor: palette.danger, borderRadius: 14, padding: 13, alignItems: 'center' }, deleteText: { color: palette.danger, fontWeight: '900' }, matcher: { borderWidth: 2, borderColor: palette.forest, gap: 9 }, matcherTop: { flexDirection: 'row', justifyContent: 'space-between' }, matcherTitle: { fontSize: 17, fontWeight: '900', color: palette.ink }, choice: { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 9 },
}); }
