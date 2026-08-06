import type { BodyRegion, ExerciseLoadHistoryEntry } from '@circuit/domain';
import type { RegionalStatusResult } from '@circuit/planner';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TrainingBodyMap } from '@/components/training-body-map';
import { getLatestExerciseLoads } from '@/services/database';
import {
  getRegionalStrengthStatusSnapshot,
  type RegionalStrengthStatusSnapshot,
} from '@/services/regional-status';
import { useTheme } from '@/state/theme-context';
import type { AppPalette } from '@/theme';

const REGION_ORDER: BodyRegion[] = [
  'quadriceps', 'hamstrings', 'glutes', 'hip_abductors', 'hip_adductors', 'hip_flexors',
  'gastrocnemius', 'soleus', 'tibialis_anterior', 'feet_ankles',
  'upper_back', 'lats', 'lower_back', 'shoulders', 'chest', 'biceps', 'triceps',
  'forearms_grip', 'core_anterior', 'core_lateral', 'core_rotation',
];

type MemoryView = 'status' | 'sport' | 'symptoms';

const STATUS_ORDER: RegionalStatusResult['status'][] = [
  'restricted',
  'review_before_loading',
  'sport_loaded_strength_needed',
  'strength_opportunity',
  'recently_loaded',
  'on_plan',
  'not_targeted',
];

export default function InsightsScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [view, setView] = useState<MemoryView>('status');
  const [windowDays, setWindowDays] = useState<14 | 28>(14);
  const [snapshot, setSnapshot] = useState<RegionalStrengthStatusSnapshot | null>(null);
  const [loads, setLoads] = useState<Record<string, ExerciseLoadHistoryEntry>>({});

  const loadData = useCallback(async () => {
    const [nextSnapshot, nextLoads] = await Promise.all([
      getRegionalStrengthStatusSnapshot(new Date(), windowDays),
      getLatestExerciseLoads(),
    ]);
    setSnapshot(nextSnapshot);
    setLoads(nextLoads);
  }, [windowDays]);

  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));

  const byRegion = useMemo(() => new Map((snapshot?.regions ?? []).map((item) => [item.region, item])), [snapshot]);
  const ordered = useMemo(() => [...(snapshot?.regions ?? [])].sort((left, right) => {
    const statusDifference = STATUS_ORDER.indexOf(left.status) - STATUS_ORDER.indexOf(right.status);
    if (statusDifference !== 0) return statusDifference;
    return REGION_ORDER.indexOf(left.region) - REGION_ORDER.indexOf(right.region);
  }), [snapshot]);
  const sportRows = useMemo(() => [...(snapshot?.regions ?? [])]
    .filter((item) => item.sportDemand !== 'low' || item.completedExposures > 0 || item.plannedExposures > 0)
    .sort((left, right) => sportRank(right.sportDemand) - sportRank(left.sportDemand)), [snapshot]);
  const symptomRows = useMemo(() => (snapshot?.regions ?? []).filter((item) =>
    item.status === 'restricted'
    || item.status === 'review_before_loading'
    || item.recoveryContext === 'recovery_uncertain'
  ), [snapshot]);
  const recentLoads = Object.values(loads).sort((left, right) => right.completedAt.localeCompare(left.completedAt)).slice(0, 8);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loadsOpen, setLoadsOpen] = useState(false);
  const selectedRows = view === 'status' ? ordered : view === 'sport' ? sportRows : symptomRows;

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>‹ Back</Text></Pressable>
        <Text style={styles.topTitle}>Training body map</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>TRAINING BODY MAP</Text>
          <Text style={styles.title}>Select a region to see what matters now</Text>
          <Text style={styles.subtitle}>Direct strength, sport demand, and restrictions remain separate layers.</Text>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}><Text style={styles.summaryValue}>{ordered.filter((item) => item.status === 'on_plan' || item.status === 'recently_loaded').length}</Text><Text style={styles.summaryLabel}>On plan</Text></View>
          <View style={styles.summaryItem}><Text style={styles.summaryValue}>{ordered.filter((item) => item.status === 'strength_opportunity' || item.status === 'sport_loaded_strength_needed').length}</Text><Text style={styles.summaryLabel}>Opportunities</Text></View>
          <View style={styles.summaryItem}><Text style={styles.summaryValue}>{ordered.filter((item) => item.status === 'restricted' || item.status === 'review_before_loading').length}</Text><Text style={styles.summaryLabel}>Review</Text></View>
        </View>

        <View style={styles.controlCard}>
          <View style={styles.toggleRow}>
            {([['status', 'Strength'], ['sport', 'Sport load'], ['symptoms', 'Restrictions']] as const).map(([value, label]) => (
              <Pressable key={value} onPress={() => setView(value)} style={[styles.toggle, view === value && styles.toggleSelected]}>
                <Text style={[styles.toggleText, view === value && styles.selectedText]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.toggleRow}>
            {([14, 28] as const).map((days) => (
              <Pressable key={days} onPress={() => setWindowDays(days)} style={[styles.toggle, windowDays === days && styles.toggleSelected]}>
                <Text style={[styles.toggleText, windowDays === days && styles.selectedText]}>{days} days</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <TrainingBodyMap
            memory={Object.fromEntries(REGION_ORDER.map((region) => {
              const item = byRegion.get(region);
              return [region, {
                exposure: item?.completedExposures ?? 0,
                statusLabel: item?.statusLabel ?? 'No status available',
                statusColor: item?.statusColor ?? '#AEB8B1',
                detail: item ? `${item.coverageLabel}. ${item.sportDemandLabel}. ${item.recoveryLabel}.` : 'No status available.',
                sportDemand: item?.sportDemand,
                warning: item?.warning,
              }];
            }))}
            onSelect={(region: BodyRegion) => router.push({ pathname: '/training-region', params: { region } } as never)}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{view === 'status' ? 'Regional status' : view === 'sport' ? 'Sport-load context' : 'Restrictions and recovery'}</Text>
          {selectedRows.slice(0, 6).map((item) => (
            <Pressable key={item.region} onPress={() => router.push({ pathname: '/training-region', params: { region: item.region } } as never)} style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: item.statusColor }]} />
              <View style={styles.statusCopy}>
                <View style={styles.rowTop}><Text style={styles.regionName}>{formatRegion(item.region)}</Text>{item.warning ? <Text style={styles.warning}>REVIEW</Text> : null}</View>
                <Text style={styles.statusName}>{view === 'sport' ? item.sportDemandLabel : view === 'symptoms' ? item.recoveryLabel : item.statusLabel}</Text>
                <Text style={styles.helper}>{view === 'sport' ? item.coverageLabel : view === 'symptoms' ? item.recommendation : item.coverageLabel}</Text>
              </View>
            </Pressable>
          ))}
          {selectedRows.length === 0 ? <Text style={styles.helper}>No regions currently need attention in this layer.</Text> : null}
          {selectedRows.length > 6 ? <Pressable onPress={() => setDetailsOpen((value) => !value)} style={styles.actionButton}><Text style={styles.actionText}>{detailsOpen ? 'Hide remaining regions' : `Show ${selectedRows.length - 6} more regions`}</Text></Pressable> : null}
          {detailsOpen ? selectedRows.slice(6).map((item) => (
            <Pressable key={item.region} onPress={() => router.push({ pathname: '/training-region', params: { region: item.region } } as never)} style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: item.statusColor }]} />
              <View style={styles.statusCopy}><Text style={styles.regionName}>{formatRegion(item.region)}</Text><Text style={styles.statusName}>{view === 'sport' ? item.sportDemandLabel : view === 'symptoms' ? item.recoveryLabel : item.statusLabel}</Text></View>
            </Pressable>
          )) : null}
        </View>

        {view === 'symptoms' ? <View style={styles.actionRow}>
          <Pressable onPress={() => router.push('/readiness' as never)} style={styles.actionButton}><Text style={styles.actionText}>Update readiness</Text></Pressable>
          <Pressable onPress={() => router.push('/today-check-in' as never)} style={styles.actionButton}><Text style={styles.actionText}>Log a restriction</Text></Pressable>
        </View> : null}

        <Pressable onPress={() => setLoadsOpen((value) => !value)} style={styles.layerExplainer}>
          <View style={styles.rowTop}><Text style={styles.calloutTitle}>Recent strength-load memory</Text><Text style={styles.statusName}>{loadsOpen ? 'Hide' : 'Show'}</Text></View>
          <Text style={styles.helper}>Exercise-specific loads used for progression.</Text>
          {loadsOpen ? recentLoads.map((entry) => (
            <View key={entry.exerciseId} style={styles.loadRow}>
              <View style={styles.loadCopy}><Text style={styles.loadTitle}>{entry.exerciseName}</Text><Text style={styles.helper}>{formatDate(entry.completedAt)}</Text></View>
              <Text style={styles.loadValue}>{entry.loadValue} {entry.loadUnit}</Text>
            </View>
          )) : null}
          {loadsOpen && recentLoads.length === 0 ? <Text style={styles.helper}>No exercise loads have been saved yet.</Text> : null}
        </Pressable>

        <View style={styles.callout}>
          <Text style={styles.calloutTitle}>About this map</Text>
          <Text style={styles.helper}>Statuses are plan-relative context. They do not diagnose overtraining, prove recovery, or prescribe a universal muscle ratio.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DemandPill({ value, styles }: { value: RegionalStatusResult['sportDemand']; styles: ReturnType<typeof makeStyles> }) {
  return <Text style={[styles.demandPill, value === 'much_above_usual' && styles.demandHigh, value === 'above_usual' && styles.demandModerate]}>{demandShort(value)}</Text>;
}

function demandShort(value: RegionalStatusResult['sportDemand']) {
  switch (value) {
    case 'much_above_usual': return 'MUCH ABOVE';
    case 'above_usual': return 'ABOVE';
    case 'typical': return 'TYPICAL';
    case 'low': return 'LOW';
    case 'insufficient_history': return 'BUILDING BASELINE';
  }
}
function sportRank(value: RegionalStatusResult['sportDemand']) { return ({ low: 0, insufficient_history: 1, typical: 2, above_usual: 3, much_above_usual: 4 })[value]; }
function formatRegion(region: BodyRegion) { return region.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase()).replace('Gastrocnemius', 'Calves').replace('Hip Abductors', 'Lateral Hips'); }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
function formatShortDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)); }

function makeStyles(palette: AppPalette) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: palette.canvas },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.surface },
    backButton: { flex: 1, paddingVertical: 6 }, backText: { color: palette.forest, fontSize: 16, fontWeight: '700' }, topTitle: { color: palette.ink, fontSize: 17, fontWeight: '700' },
    content: { padding: 20, paddingBottom: 56, gap: 14 }, intro: { gap: 6 }, eyebrow: { color: palette.forest, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }, title: { color: palette.ink, fontSize: 30, fontWeight: '700', lineHeight: 36 }, subtitle: { color: palette.inkMuted, fontSize: 15, lineHeight: 22 },
    summaryCard: { flexDirection: 'row', gap: 8, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 22, padding: 12 },
    summaryItem: { flex: 1, minHeight: 76, borderRadius: 14, backgroundColor: palette.surfaceMuted, padding: 10, justifyContent: 'center' },
    summaryValue: { color: palette.ink, fontSize: 20, fontWeight: '900' },
    summaryLabel: { color: palette.inkMuted, fontSize: 10.5, lineHeight: 14, marginTop: 3 },
    controlCard: { backgroundColor: palette.surface, borderRadius: 18, borderWidth: 1, borderColor: palette.border, padding: 14, gap: 8 }, controlLabel: { color: palette.ink, fontSize: 12, fontWeight: '800' }, toggleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, toggle: { flexGrow: 1, borderWidth: 1, borderColor: palette.border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 9, alignItems: 'center', backgroundColor: palette.surface }, toggleSelected: { backgroundColor: palette.forest, borderColor: palette.forest }, toggleText: { color: palette.ink, fontSize: 11, fontWeight: '800' }, selectedText: { color: palette.white },
    layerExplainer: { backgroundColor: palette.surfaceMuted, borderRadius: 18, borderWidth: 1, borderColor: palette.border, padding: 16, gap: 7 }, calloutTitle: { color: palette.ink, fontSize: 17, fontWeight: '800' }, helper: { color: palette.inkMuted, fontSize: 13, lineHeight: 19 }, disclaimer: { color: palette.inkMuted, fontSize: 11, lineHeight: 17, fontWeight: '700' },
    section: { backgroundColor: palette.surface, borderRadius: 20, borderWidth: 1, borderColor: palette.border, padding: 16, gap: 12 }, sectionTitle: { color: palette.ink, fontSize: 21, fontWeight: '800' },
    statusRow: { flexDirection: 'row', gap: 12, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 12 }, statusDot: { width: 15, height: 15, borderRadius: 8, marginTop: 3 }, statusCopy: { flex: 1, gap: 3 }, rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, regionName: { flex: 1, color: palette.ink, fontSize: 16, fontWeight: '800' }, statusName: { color: palette.forest, fontSize: 14, fontWeight: '800' }, contextLine: { color: palette.inkMuted, fontSize: 11, lineHeight: 16, fontWeight: '700' }, warning: { color: palette.statusWarn, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
    contextCard: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 15, padding: 13, gap: 5 }, demandPill: { color: palette.forest, backgroundColor: palette.surfaceMuted, borderRadius: 999, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 5, fontSize: 9, fontWeight: '900' }, demandModerate: { backgroundColor: palette.sand, color: palette.warning }, demandHigh: { backgroundColor: palette.coral, color: palette.white },
    sportProfileList: { gap: 4 }, sportProfile: { color: palette.inkMuted, fontSize: 12, lineHeight: 18 }, sportName: { color: palette.forest, fontWeight: '900' },
    actionRow: { flexDirection: 'row', gap: 8 }, actionButton: { flex: 1, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.forest, borderRadius: 14, padding: 12, alignItems: 'center' }, actionText: { color: palette.forest, fontSize: 12, fontWeight: '800', textAlign: 'center' },
    loadRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 10 }, loadCopy: { flex: 1 }, loadTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' }, loadValue: { color: palette.forest, fontSize: 15, fontWeight: '900' },
    callout: { backgroundColor: palette.surfaceMuted, borderRadius: 18, borderWidth: 1, borderColor: palette.border, padding: 16, gap: 5 },
  });
}
