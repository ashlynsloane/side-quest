import type { BodyRegion } from '@circuit/domain';
import type { RegionalStatusResult } from '@circuit/planner';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScreen, Pill, SectionTitle, Surface } from '@/components/v12-ui';
import {
  listEnduranceRegionEvidence,
  listRegionWorkoutEvidence,
  type EnduranceRegionEvidence,
  type RegionWorkoutEvidence,
} from '@/services/database';
import { getRegionalStrengthStatusSnapshot } from '@/services/regional-status';
import { useTheme } from '@/state/theme-context';
import { typography, type AppPalette } from '@/theme';

const LABELS: Partial<Record<BodyRegion, string>> = {
  shoulders: 'Shoulders', chest: 'Chest', biceps: 'Biceps', triceps: 'Triceps', forearms_grip: 'Forearms + grip', upper_back: 'Upper back', lats: 'Lats', lower_back: 'Lower back', core_anterior: 'Anterior core', core_lateral: 'Lateral core', core_rotation: 'Rotational core', hip_flexors: 'Hip flexors', hip_abductors: 'Lateral hips', hip_adductors: 'Adductors', glutes: 'Glutes', quadriceps: 'Quadriceps', hamstrings: 'Hamstrings', gastrocnemius: 'Calves', soleus: 'Soleus', tibialis_anterior: 'Tibialis anterior', feet_ankles: 'Feet + ankles',
};

export default function TrainingRegionScreen() {
  const { region: rawRegion } = useLocalSearchParams<{ region?: string }>();
  const region = String(rawRegion ?? '') as BodyRegion;
  const router = useRouter();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [strengthEvidence, setStrengthEvidence] = useState<RegionWorkoutEvidence[]>([]);
  const [enduranceEvidence, setEnduranceEvidence] = useState<EnduranceRegionEvidence[]>([]);
  const [status, setStatus] = useState<RegionalStatusResult | null>(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    void Promise.all([
      listRegionWorkoutEvidence(region),
      listEnduranceRegionEvidence(region),
      getRegionalStrengthStatusSnapshot(),
    ]).then(([nextStrength, nextEndurance, snapshot]) => {
      if (!live) return;
      setStrengthEvidence(nextStrength);
      setEnduranceEvidence(nextEndurance);
      setStatus(snapshot.regions.find((item) => item.region === region) ?? null);
    });
    return () => { live = false; };
  }, [region]));

  const primaryCount = strengthEvidence.filter((item) => item.role === 'primary').length;
  const supportingCount = strengthEvidence.length - primaryCount;

  return <AppScreen eyebrow="REGIONAL STATUS" title={LABELS[region] ?? region.replaceAll('_', ' ')} subtitle="This region is assessed against its own current strength-plan target, your personal sport-load baseline, and the recovery information you logged. It is not compared with a universal body-part percentage.">
    <Surface style={{ ...styles.hero, borderColor: status?.statusColor ?? palette.border }}>
      <View style={[styles.heroDot, { backgroundColor: status?.statusColor ?? palette.border }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.statusEyebrow}>CURRENT STRENGTH DECISION</Text>
        <Text style={styles.heroTitle}>{status?.statusLabel ?? 'Calculating status'}</Text>
        <Text style={styles.helper}>{status?.explanation ?? 'Regional status is being calculated.'}</Text>
      </View>
    </Surface>

    {status ? <View style={styles.statusStack}>
      <Surface style={styles.statusCard}>
        <Text style={styles.statusEyebrow}>DIRECT STRENGTH COVERAGE</Text>
        <Text style={styles.statusTitle}>{status.coverageLabel}</Text>
        <Text style={styles.helper}>The target comes from this region’s actual exercises in the current Side Quest training week. No universal quota is imposed.</Text>
      </Surface>
      <Surface style={styles.statusCard}>
        <Text style={styles.statusEyebrow}>SPORT LOAD</Text>
        <Text style={styles.statusTitle}>{status.sportDemandLabel}</Text>
        <Text style={styles.helper}>Compared with your own prior regional sport-load pattern. Swim, bike, and run remain estimated context rather than direct strength credit.</Text>
      </Surface>
      <Surface style={styles.statusCard}>
        <Text style={styles.statusEyebrow}>RECOVERY CONTEXT</Text>
        <Text style={styles.statusTitle}>{status.recoveryLabel}</Text>
        <Text style={styles.helper}>{status.recommendation}</Text>
      </Surface>
    </View> : null}

    <View style={styles.metrics}>
      <Surface style={styles.metric}><Text style={styles.metricNumber}>{primaryCount}</Text><Text style={styles.metricLabel}>primary strength records</Text></Surface>
      <Surface style={styles.metric}><Text style={styles.metricNumber}>{supportingCount}</Text><Text style={styles.metricLabel}>supporting strength records</Text></Surface>
      <Surface style={styles.metric}><Text style={styles.metricNumber}>{enduranceEvidence.length}</Text><Text style={styles.metricLabel}>sport-context records</Text></Surface>
    </View>

    <SectionTitle detail={`${strengthEvidence.length} records`}>Direct strength loading</SectionTitle>
    {strengthEvidence.length === 0 ? <Surface><Text style={styles.emptyTitle}>No direct loading recorded</Text><Text style={styles.helper}>Sport participation does not substitute for an exercise-specific strength exposure.</Text></Surface> : null}
    {strengthEvidence.map((item, index) => (
      <Pressable key={`${item.workoutId}-${item.exerciseId ?? item.exerciseName}-${index}`} onPress={() => router.push({ pathname: '/workout-detail', params: { id: item.workoutId } } as Href)} style={styles.record}>
        <View style={styles.recordTop}><Text style={styles.exerciseName}>{item.exerciseName}</Text><Pill tone={item.role === 'primary' ? 'good' : 'neutral'}>{item.role}</Pill></View>
        <Text style={styles.workoutName}>{item.workoutName}</Text>
        <View style={styles.recordMeta}><Text style={styles.meta}>{formatDate(item.completedAt)}</Text><Text style={styles.meta}>{formatDose(item)}</Text>{item.loadValue && item.loadUnit ? <Text style={styles.meta}>{item.loadValue} {item.loadUnit} {basisLabel(item.loadBasis)}</Text> : null}</View>
      </Pressable>
    ))}

    <SectionTitle detail={`${enduranceEvidence.length} records`}>Sport-load evidence</SectionTitle>
    {enduranceEvidence.length === 0 ? <Surface><Text style={styles.emptyTitle}>No sport context recorded</Text><Text style={styles.helper}>Connect Strava or complete an imported activity to populate this layer.</Text></Surface> : null}
    {enduranceEvidence.map((item) => (
      <Surface key={`${item.activityId}-${item.completedAt}`} style={styles.enduranceRecord}>
        <View style={styles.recordTop}><Text style={styles.exerciseName}>{item.activityName}</Text><Pill tone="neutral">{item.discipline}</Pill></View>
        <View style={styles.recordMeta}><Text style={styles.meta}>{formatDate(item.completedAt)}</Text><Text style={styles.meta}>{item.confidence} mapping confidence</Text></View>
        <Text style={styles.helper}>{item.rationale}</Text>
      </Surface>
    ))}

    <Surface style={styles.explainer}>
      <Text style={styles.explainerTitle}>Interpretation limits</Text>
      <Text style={styles.helper}>Side Quest can identify plan coverage, unusually high or low sport-load patterns, and user-entered symptoms or restrictions. It cannot diagnose overtraining, prove recovery, or predict an injury from a regional score.</Text>
    </Surface>
  </AppScreen>;
}

function formatDose(item: RegionWorkoutEvidence) { if (item.seconds) return `${item.completedSets} × ${item.seconds} sec`; if (item.reps) return `${item.completedSets} × ${item.reps} reps`; return `${item.completedSets} completed set${item.completedSets === 1 ? '' : 's'}`; }
function basisLabel(value?: string) { const labels: Record<string, string> = { each_hand: 'each hand', single_implement: 'one weight', total: 'total', bodyweight: 'bodyweight', assisted: 'assisted', band_level: 'band', not_recorded: '' }; return value ? labels[value] ?? '' : ''; }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
function makeStyles(palette: AppPalette) { return StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 2 }, heroDot: { width: 18, height: 18, borderRadius: 9, marginTop: 4 }, heroTitle: { fontSize: 23, lineHeight: 29, fontWeight: '900', color: palette.ink },
  statusStack: { gap: 8 }, statusCard: { gap: 5 }, statusEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1, color: palette.forest }, statusTitle: { fontSize: 18, fontWeight: '900', color: palette.ink }, helper: { ...typography.small, color: palette.inkMuted },
  metrics: { flexDirection: 'row', gap: 7 }, metric: { flex: 1, padding: 11 }, metricNumber: { fontSize: 24, fontWeight: '900', color: palette.forest }, metricLabel: { fontSize: 10, lineHeight: 14, color: palette.inkMuted, fontWeight: '700' },
  record: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 17, padding: 14, gap: 5 }, enduranceRecord: { gap: 7, backgroundColor: palette.surfaceMuted }, recordTop: { flexDirection: 'row', gap: 8, alignItems: 'center' }, exerciseName: { flex: 1, fontSize: 17, fontWeight: '900', color: palette.ink }, workoutName: { color: palette.inkMuted, fontSize: 13, fontWeight: '700' }, recordMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, meta: { color: palette.forest, fontSize: 11, fontWeight: '800', backgroundColor: palette.surfaceMuted, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 }, emptyTitle: { fontSize: 17, fontWeight: '900', color: palette.ink, marginBottom: 5 }, explainer: { backgroundColor: palette.sand, gap: 5 }, explainerTitle: { fontSize: 16, fontWeight: '900', color: palette.ink },
}); }
