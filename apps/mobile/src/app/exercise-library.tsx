import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen, SectionTitle, Surface } from '@/components/v12-ui';
import { exerciseMediaCoverage } from '@/services/exercise-media';
import { useExerciseCatalog } from '@/services/exercise-catalog';
import { useTheme } from '@/state/theme-context';
import { typography, type AppPalette } from '@/theme';

const FILTERS = [
  ['all', 'All'],
  ['bosu', 'BOSU'],
  ['balance', 'Balance'],
  ['lateral', 'Lateral'],
  ['core', 'Core'],
  ['push', 'Push'],
  ['pull', 'Pull'],
  ['single_leg', 'Single-leg'],
] as const;

type FilterId = (typeof FILTERS)[number][0];

export default function ExerciseLibraryScreen() {
  const router = useRouter();
  const { exercises } = useExerciseCatalog();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  const coverage = useMemo(() => exerciseMediaCoverage(exercises), [exercises]);

  const shown = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return exercises.filter((exercise) => {
      const searchable = [
        exercise.name,
        exercise.shortDescription,
        exercise.category,
        exercise.classification,
        ...exercise.movementPatterns,
        ...exercise.stationRoles,
        ...exercise.bodyRegions.map((item) => item.region),
        ...exercise.equipmentOptions.map((option) => option.label),
      ].join(' ').toLowerCase();

      if (normalizedQuery && !searchable.includes(normalizedQuery)) return false;
      if (filter === 'all') return true;
      if (filter === 'bosu') return searchable.includes('bosu');
      if (filter === 'balance') return exercise.balanceDemand >= 3 || exercise.movementPatterns.includes('balance');
      if (filter === 'lateral') return searchable.includes('lateral');
      if (filter === 'core') return exercise.stationRoles.includes('core') || exercise.bodyRegions.some((item) => item.region.includes('core'));
      if (filter === 'push') return exercise.movementPatterns.some((pattern) => pattern.includes('push')) || /push|press/.test(searchable);
      if (filter === 'pull') return exercise.movementPatterns.some((pattern) => pattern.includes('pull')) || /pull|row/.test(searchable);
      if (filter === 'single_leg') return exercise.laterality === 'unilateral' || /single[- ]leg/.test(searchable);
      return true;
    });
  }, [exercises, filter, query]);

  return (
    <AppScreen
      title={`${exercises.length} curated movements`}
      subtitle="Browse the full Side Quest catalog. Search by movement, region, equipment, balance demand, or variation type."
    >
      <Surface style={styles.coverageCard}>
        <View style={styles.statsRow}>
          <Stat value={coverage.total} label="curated exercises" styles={styles} />
          <Stat value={coverage.illustrated} label="illustrated guides" styles={styles} />
          <Stat value={coverage.writtenOnly} label="missing guides" styles={styles} />
        </View>
        <Text style={styles.coverageStrong}>
          Every catalog exercise includes an approved Side Quest illustrated guide.
        </Text>
        <Text style={styles.coverageCopy}>
          Written setup, movement cues, and common mistakes remain directly below each image.
        </Text>
      </Surface>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search exercise, muscle, equipment…"
        placeholderTextColor={palette.inkMuted}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.search}
      />

      <View style={styles.filters}>
        {FILTERS.map(([id, label]) => (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === id }}
            onPress={() => setFilter(id)}
            style={[styles.filter, filter === id && styles.filterActive]}
          >
            <Text style={[styles.filterText, filter === id && styles.filterTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle detail={`${shown.length} shown`}>Curated exercises</SectionTitle>
      {shown.map((exercise) => (
        <Pressable
          key={exercise.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/exercise-detail', params: { id: exercise.id } })}
        >
          <Surface style={styles.exerciseCard}>
            <View style={styles.exerciseCopy}>
              <Text style={styles.exerciseName}>{exercise.name}</Text>
              <Text style={styles.exerciseMeta}>
                {friendly(exercise.movementPatterns[0] ?? 'movement')} · {exercise.category} · {friendly(exercise.classification)}
              </Text>
              <Text style={styles.exerciseDescription}>{exercise.shortDescription}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Surface>
        </Pressable>
      ))}
    </AppScreen>
  );
}

function Stat({ value, label, styles }: { value: number; label: string; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function friendly(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function makeStyles(palette: AppPalette) {
  return StyleSheet.create({
    coverageCard: { gap: 13 },
    statsRow: { flexDirection: 'row', gap: 12 },
    stat: { flex: 1, gap: 3 },
    statValue: { color: palette.forest, fontSize: 31, lineHeight: 34, fontWeight: '900' },
    statLabel: { ...typography.small, color: palette.inkMuted, lineHeight: 19 },
    coverageStrong: { ...typography.small, color: palette.forest, fontWeight: '900', lineHeight: 20 },
    coverageCopy: { ...typography.body, color: palette.inkMuted, lineHeight: 22 },
    search: {
      ...typography.body,
      color: palette.ink,
      backgroundColor: '#FFFFFF',
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 22,
      paddingHorizontal: 18,
      paddingVertical: 15,
    },
    filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
    filter: {
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: '#FFFFFF',
      borderRadius: 999,
      paddingHorizontal: 17,
      paddingVertical: 10,
    },
    filterActive: { backgroundColor: palette.forest, borderColor: palette.forest },
    filterText: { color: palette.inkMuted, fontSize: 13, fontWeight: '800' },
    filterTextActive: { color: '#FFFFFF' },
    exerciseCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    exerciseCopy: { flex: 1, gap: 6 },
    exerciseName: { color: palette.ink, fontSize: 20, fontWeight: '900' },
    exerciseMeta: { color: palette.forest, fontSize: 12, lineHeight: 17, fontWeight: '900' },
    exerciseDescription: { ...typography.small, color: palette.inkMuted, lineHeight: 20 },
    chevron: { color: palette.forest, fontSize: 38, lineHeight: 40, fontWeight: '400' },
  });
}
