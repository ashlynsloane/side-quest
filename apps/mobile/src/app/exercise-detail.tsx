import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FullscreenGuideViewer } from '@/components/fullscreen-guide-viewer';
import { AppScreen, Pill, SectionTitle, Surface } from '@/components/v12-ui';
import { listWorkoutLedgerEntries, type WorkoutLedgerEntry } from '@/services/database';
import { useExerciseCatalog } from '@/services/exercise-catalog';
import { visualGuideForExercise } from '@/services/exercise-media';
import { useTheme } from '@/state/theme-context';
import { typography, type AppPalette } from '@/theme';

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { exercises } = useExerciseCatalog();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const exercise = exercises.find((item) => item.id === id) ?? null;
  const [history, setHistory] = useState<WorkoutLedgerEntry[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!id) return;
    let live = true;
    void listWorkoutLedgerEntries({ limit: 500 }).then((entries) => {
      if (live) setHistory(entries.filter((entry) => entry.exercises.some((item) => item.exerciseId === id)).slice(0, 8));
    });
    return () => { live = false; };
  }, [id]));

  if (!exercise) {
    return (
      <AppScreen title="Exercise not found">
        <Text style={styles.body}>This exercise may have been removed from the local catalog.</Text>
      </AppScreen>
    );
  }

  const visual = visualGuideForExercise(exercise);
  const groups = exercise.substitutionGroupIds.map((group) => group.replaceAll('_', ' '));

  return (
    <AppScreen eyebrow="EXERCISE DETAIL" title={exercise.name} subtitle={exercise.shortDescription}>
      <Surface style={styles.summary}>
        <View style={styles.pills}>
          <Pill tone="neutral">{friendly(exercise.movementPatterns[0] ?? 'movement')}</Pill>
          <Pill tone={exercise.balanceDemand >= 3 ? 'warn' : 'neutral'}>Balance {exercise.balanceDemand}/5</Pill>
          <Pill tone={visual ? 'good' : 'neutral'}>{visual ? 'Illustrated guide' : 'Written guide'}</Pill>
        </View>
        <Text style={styles.meta}>
          {exercise.bodyRegions.slice(0, 4).map((item) => `${friendly(item.region)} · ${item.role}`).join('\n')}
        </Text>
      </Surface>

      <SectionTitle>Illustrated guide</SectionTitle>
      {visual ? (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={`Expand ${exercise.name} guide`} onPress={() => setGuideOpen(true)} style={styles.guideCard}>
            <Image source={visual.source} style={styles.guideImage} contentFit="contain" transition={120} />
            <View style={styles.expandBadge}><Text style={styles.expandText}>Tap to expand</Text></View>
          </Pressable>
          <FullscreenGuideViewer
            visible={guideOpen}
            title={exercise.name}
            source={visual.source}
            onClose={() => setGuideOpen(false)}
          />
        </>
      ) : (
        <Surface><Text style={styles.body}>Use the written setup, movement, and cue sections below.</Text></Surface>
      )}

      <Instruction title="Set up" items={exercise.instructions.setup} styles={styles} />
      <Instruction title="Movement" items={exercise.instructions.execution} styles={styles} />
      <Instruction title="Useful cues" items={exercise.instructions.cues} styles={styles} />
      <Instruction title="Common mistakes" items={exercise.instructions.commonMistakes} styles={styles} />

      <SectionTitle>Variation ladder</SectionTitle>
      <Surface>
        <Text style={styles.cardTitle}>{groups.length ? groups.map(titleCase).join(' · ') : 'No curated ladder assigned'}</Text>
        <Text style={styles.body}>Smart Swap uses these movement families to show a lower dose, regression, progression, or related variation before jumping to an unrelated exercise.</Text>
      </Surface>

      <SectionTitle detail={`${history.length}`}>Your recent exposures</SectionTitle>
      {!history.length ? (
        <Surface>
          <Text style={styles.cardTitle}>No completed exposure yet</Text>
          <Text style={styles.body}>Once this exercise is logged, its sets and loads will appear here and inform Progression Lab.</Text>
        </Surface>
      ) : null}
      {history.map((entry) => {
        const logged = entry.exercises.find((item) => item.exerciseId === exercise.id);
        const set = logged?.sets.filter((item) => item.completed).at(-1);
        return (
          <Surface key={entry.id} style={styles.history}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{formatDate(entry.completedAt)}</Text>
              <Text style={styles.body}>{entry.name}</Text>
            </View>
            <Text style={styles.dose}>{formatDose(logged?.sets.length ?? 0, set?.reps, set?.seconds, set?.loadValue, set?.loadUnit, set?.loadBasis)}</Text>
          </Surface>
        );
      })}
    </AppScreen>
  );
}

function Instruction({ title, items, styles }: { title: string; items: string[]; styles: ReturnType<typeof makeStyles> }) {
  if (!items.length) return null;
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <Surface>
        {items.map((item, index) => (
          <View key={`${title}-${index}`} style={styles.bulletRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.body}>{item}</Text>
          </View>
        ))}
      </Surface>
    </>
  );
}

function friendly(value: string) { return titleCase(value.replaceAll('_', ' ')); }
function titleCase(value: string) { return value.replace(/\b\w/g, (character) => character.toUpperCase()); }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
function formatDose(sets: number, reps?: number, seconds?: number, load?: number, unit?: 'lb' | 'kg', basis?: string) {
  const target = seconds ? `${seconds}s` : reps ? `${reps} reps` : 'dose logged';
  const loadText = load && unit ? ` · ${load} ${unit}${basis === 'each_hand' ? ' each' : ''}` : '';
  return `${sets} sets · ${target}${loadText}`;
}

function makeStyles(palette: AppPalette) {
  return StyleSheet.create({
    summary: { gap: 10 },
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    meta: { ...typography.small, color: palette.inkMuted, textTransform: 'capitalize', lineHeight: 20 },
    guideCard: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: '#FFFFFF',
    },
    guideImage: { width: '100%', aspectRatio: 3 / 2, backgroundColor: '#FFFFFF' },
    expandBadge: {
      position: 'absolute',
      right: 12,
      bottom: 12,
      backgroundColor: 'rgba(23,58,43,0.90)',
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    expandText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
    cardTitle: { fontSize: 16, fontWeight: '900', color: palette.ink },
    body: { ...typography.body, color: palette.inkMuted, flex: 1 },
    bulletRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginBottom: 7 },
    bullet: { fontSize: 16, color: palette.forest, fontWeight: '900' },
    history: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    dose: { fontSize: 11, fontWeight: '900', color: palette.forest, textAlign: 'right', maxWidth: 145 },
  });
}
