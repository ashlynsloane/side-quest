import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { V23Card, V23GroupedList, V23Icon, V23Row, V23Screen, V23SectionHeader } from '@/components/v23-ui';
import { SportIcon, normalizeSportKind } from '@/components/sport-icon';
import { getRegionalStrengthStatusSnapshot, type RegionalStrengthStatusSnapshot } from '@/services/regional-status';
import { conciseSessionLabel, sessionMeaning } from '@/services/training-synthesis';
import { loadTrainingHistory, type TrainingHistoryItem } from '@/services/training-history';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export default function ProgressTab() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [history, setHistory] = useState<TrainingHistoryItem[]>([]);
  const [snapshot, setSnapshot] = useState<RegionalStrengthStatusSnapshot | null>(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    void Promise.all([loadTrainingHistory(150), getRegionalStrengthStatusSnapshot(new Date(), 14)]).then(([items, nextSnapshot]) => {
      if (!live) return;
      setHistory(items);
      setSnapshot(nextSnapshot);
    });
    return () => { live = false; };
  }, []));

  const now = Date.now();
  const reviewCount = history.filter((item) => item.needsReview).length;
  const recent = history.filter((item) => now - Date.parse(item.occurredAt) <= 7 * 86_400_000).slice(0, 4);
  const regions = snapshot?.regions ?? [];
  const onPlanCount = regions.filter((item) => item.status === 'on_plan' || item.status === 'recently_loaded').length;
  const opportunityCount = regions.filter((item) => item.status === 'strength_opportunity' || item.status === 'sport_loaded_strength_needed').length;
  const reviewRegions = regions.filter((item) => item.status === 'restricted' || item.status === 'review_before_loading');
  const priorityRegions = regions.filter((item) => item.status === 'review_before_loading' || item.status === 'restricted' || item.status === 'sport_loaded_strength_needed' || item.status === 'strength_opportunity').slice(0, 3);
  const coldStart = history.length < 3;

  return <V23Screen>
    <View style={styles.intro}>
      <Text style={styles.eyebrow}>PROGRESS</Text>
      <Text style={styles.title}>{coldStart ? 'Your starting point' : 'Your training picture'}</Text>
      <Text style={styles.body}>{coldStart ? 'Your plan establishes the baseline. Completed sessions make it more personal.' : 'A concise view of what is loaded, what needs attention, and what changed.'}</Text>
    </View>

    <V23Card elevated style={styles.hero}>
      <Text style={styles.heroLabel}>LAST 14 DAYS</Text>
      <View style={styles.metricRow}>
        <Metric value={String(onPlanCount)} label="On plan" styles={styles} />
        <Metric value={String(opportunityCount)} label="Opportunities" styles={styles} />
        <Metric value={String(reviewRegions.length)} label="Review" styles={styles} />
      </View>
      <Text style={styles.heroNote}>{snapshot?.hasPlan ? 'Status is relative to your current plan and recent training.' : 'Create a plan to compare completed strength with intended regional targets.'}</Text>
    </V23Card>

    {priorityRegions.length > 0 ? <>
      <V23SectionHeader>Needs attention</V23SectionHeader>
      <V23GroupedList>{priorityRegions.map((item, index) => <V23Row
        key={item.region}
        title={formatRegion(item.region)}
        detail={item.statusLabel}
        onPress={() => router.push({ pathname: '/training-region', params: { region: item.region } } as never)}
        icon={<View style={[styles.regionDot, { backgroundColor: item.statusColor }]} />}
        trailing={item.warning ? <View style={styles.reviewPill}><Text style={styles.reviewText}>Review</Text></View> : undefined}
        last={index === priorityRegions.length - 1}
      />)}</V23GroupedList>
    </> : null}

    <V23SectionHeader>Explore</V23SectionHeader>
    <V23GroupedList>
      <V23Row title="Training body map" detail="See regional status and select a body area." onPress={() => router.push('/insights' as Href)} icon={<V23Icon name="insights" color={tokens.accent} size={19} />} />
      <V23Row title="Side Quest Coach" detail="Review today’s recommendation and recent adjustments." onPress={() => router.push('/side-quest-coach' as Href)} icon={<V23Icon name="home" color={tokens.accent} size={19} />} />
      <V23Row title={reviewCount ? `${reviewCount} ${reviewCount === 1 ? 'activity needs' : 'activities need'} review` : 'Training history'} detail={reviewCount ? 'Add context so recommendations use the right activity record.' : 'See completed strength and endurance sessions.'} onPress={() => router.push('/training-history' as Href)} icon={<V23Icon name="plan" color={tokens.accent} size={19} />} last />
    </V23GroupedList>

    <V23SectionHeader detail="7 days">Recent training</V23SectionHeader>
    {recent.length ? <V23GroupedList>{recent.map((item, index) => {
      const discipline = item.kind === 'strength' ? 'strength' : item.activity.discipline;
      const title = item.kind === 'strength' ? item.workout.name : conciseSessionLabel({ discipline: item.activity.discipline, name: item.activity.name, trainer: item.activity.trainer });
      const detail = item.kind === 'strength' ? 'Direct strength added to training memory.' : sessionMeaning(item.activity, item.plannedMatch);
      return <V23Row key={item.id} title={title} detail={shorten(detail)} onPress={() => router.push('/training-history' as Href)} icon={<SportIcon kind={normalizeSportKind(discipline)} color={sportColor(discipline, tokens.accent)} backgroundColor={tokens.surfaceMuted} size={18} />} trailing={item.needsReview ? <View style={styles.reviewPill}><Text style={styles.reviewText}>Review</Text></View> : undefined} last={index === recent.length - 1} />;
    })}</V23GroupedList> : <V23Card><Text style={styles.emptyTitle}>No completed sessions yet</Text><Text style={styles.body}>Your first completed workout will appear here.</Text></V23Card>}
  </V23Screen>;
}

function Metric({ value, label, styles }: { value: string; label: string; styles: ReturnType<typeof makeStyles> }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function shorten(text: string) { const clean = text.replace(/\s+/g, ' ').trim(); return clean.length > 82 ? `${clean.slice(0, 79)}…` : clean; }
function formatRegion(region: string) { return region.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function sportColor(discipline: string, accent: string) { if (discipline === 'swim') return '#267BA6'; if (discipline === 'bike') return '#C58322'; if (discipline === 'run') return '#526E9A'; return accent; }
function makeStyles(tokens: DesignTokens) { return StyleSheet.create({
  intro: { gap: 5, marginBottom: 4 }, eyebrow: { color: tokens.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 }, title: { color: tokens.text, fontSize: 29, lineHeight: 34, fontWeight: '900' }, body: { color: tokens.textMuted, fontSize: 14, lineHeight: 20 },
  hero: { gap: 14, paddingVertical: 18 }, heroLabel: { color: tokens.accent, fontSize: 10.5, fontWeight: '900', letterSpacing: 1 }, heroNote: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18 }, metricRow: { flexDirection: 'row', gap: 8 }, metric: { flex: 1, minHeight: 78, paddingHorizontal: 10, paddingVertical: 12, borderRadius: 16, backgroundColor: tokens.surfaceMuted, justifyContent: 'center' }, metricValue: { color: tokens.text, fontSize: 25, lineHeight: 29, fontWeight: '900' }, metricLabel: { color: tokens.textMuted, fontSize: 11, lineHeight: 14, marginTop: 3 },
  regionDot: { width: 12, height: 12, borderRadius: 6 }, reviewPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: tokens.surfaceMuted }, reviewText: { color: tokens.warning, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 }, emptyTitle: { color: tokens.text, fontSize: 16, fontWeight: '800', marginBottom: 4 },
}); }
