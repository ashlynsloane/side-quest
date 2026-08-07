import type { GeneratedWorkout } from '@circuit/domain';
import { StyleSheet, Text, View } from 'react-native';

import { V23Card, V23Chip, V23Icon, V23PrimaryButton } from '@/components/v23-ui';
import type { ActiveWorkoutPlanLink } from '@/services/active-workout-persistence';
import { useTheme } from '@/state/theme-context';

export function ActiveWorkoutResumeCard({
  workout,
  planLink,
  onResume,
  compact = false,
}: {
  workout: GeneratedWorkout;
  planLink?: ActiveWorkoutPlanLink | null;
  onResume: () => void;
  compact?: boolean;
}) {
  const { tokens } = useTheme();
  return (
    <V23Card elevated style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: tokens.accentSoft }]}>
          <V23Icon name="play" color={tokens.accent} size={19} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: tokens.accent }]}>WORKOUT IN PROGRESS</Text>
          <Text numberOfLines={2} style={[styles.title, { color: tokens.text }]}>{workout.name}</Text>
          {planLink ? <Text style={[styles.planLabel, { color: tokens.textMuted }]}>Planned {formatPlanDate(planLink.sessionDate)} · {planLink.sessionTitle}</Text> : null}
        </View>
      </View>
      <View style={styles.chips}>
        <V23Chip>{workout.stations.length} stations</V23Chip>
        <V23Chip tone="neutral">{Math.round(workout.estimatedElapsedSeconds / 60)} min planned</V23Chip>
        {planLink?.modifiedFromPlan ? <V23Chip tone="warm">Customized</V23Chip> : null}
      </View>
      <Text style={[styles.body, { color: tokens.textMuted }]}>Your timer, station, and logged sets are saved. Resume when you are ready.</Text>
      <V23PrimaryButton onPress={onResume} icon="play">Resume workout</V23PrimaryButton>
    </V23Card>
  );
}

function formatPlanDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 17 },
  cardCompact: { marginBottom: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 10.5, lineHeight: 14, fontWeight: '900', letterSpacing: 1 },
  title: { fontSize: 18, lineHeight: 23, fontWeight: '800', marginTop: 2 },
  planLabel: { fontSize: 12.5, lineHeight: 17, marginTop: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  body: { fontSize: 13.5, lineHeight: 19 },
});
