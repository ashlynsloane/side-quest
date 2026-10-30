import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PlanAdjustmentCandidate, TrainingDimensionComparison } from '@circuit/planner';
import { currentLocalWeekStart } from '@/services/core-training-week-evidence';
import {
  decideProposedPlanAdjustment, loadPlanAdjustmentReview,
  restoreAcceptedPlanAdjustment, type PlanAdjustmentReviewState,
} from '@/services/training-plan-adjustments';

const DAY_MS = 86_400_000;
function shiftWeek(value: string, days: number): string {
  return new Date(Date.parse(value + 'T00:00:00Z') + days * DAY_MS)
    .toISOString().slice(0, 10);
}
function dimensionLabel(dimension: TrainingDimensionComparison['dimension']): string {
  if (dimension === 'running_distance') return 'Running distance';
  if (dimension === 'cycling_duration') return 'Cycling time';
  return 'All training time';
}
function format(value: number, unit: string): string {
  return unit === 'km' ? (value / 1.609344).toFixed(1) + ' mi'
    : Math.round(value) + ' min';
}
function Compare({ candidate }: { candidate: PlanAdjustmentCandidate }) {
  const before = candidate.current.comparisons;
  const after = candidate.preview.comparisons;
  return <View style={styles.comparison}>
    {before.map((item, i) => {
      const next = after[i]!;
      return <View key={item.dimension} style={styles.compRow}>
        <Text style={styles.compName}>{dimensionLabel(item.dimension)}</Text>
        <Text style={styles.compValue}>
          {format(item.proposedKnownSubtotal, item.unit)}
          {' → '}{format(next.proposedKnownSubtotal, next.unit)}
        </Text>
        <Text style={styles.compHint}>Limit: {item.ceiling === null
          ? 'No approved increase' : format(item.ceiling, item.unit)}.
          {' '}{next.status.replaceAll('_', ' ')}.
        </Text>
      </View>;
    })}
  </View>;
}
export default function TrainingPlanAdjustmentsScreen() {
  const router = useRouter();
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const currentWeek = useMemo(() => currentLocalWeekStart(timezone), [timezone]);
  const [targetWeek, setTargetWeek] = useState(currentWeek);
  const [state, setState] = useState<PlanAdjustmentReviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const load = useCallback(async (week: string) => {
    const id = ++request.current;
    setError(null);
    const next = await loadPlanAdjustmentReview({ weekStartDate: week, timezone });
    if (id === request.current) setState(next);
  }, [timezone]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void load(targetWeek).catch(e => {
      if (active) setError(e instanceof Error ? e.message : 'Training review unavailable.');
    });
    return () => { active = false; request.current += 1; };
  }, [load, targetWeek]));
  function chooseWeek(week: string) {
    if (busy) return;
    request.current += 1;
    setTargetWeek(week);
    setState(null); setNotice(null); setError(null);
  }
  async function decide(candidate: PlanAdjustmentCandidate, decision: 'accepted' | 'declined') {
    const signature = state?.preview?.exposureSignature;
    if (!signature || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const fresh = await decideProposedPlanAdjustment({
        weekStartDate: targetWeek, timezone, candidate,
        expectedExposureSignature: signature, decision,
      });
      setState(fresh);
      setNotice(decision === 'accepted'
        ? 'Change accepted. Original generated session preserved; plan display uses the reviewed adjustment.'
        : 'Change declined. Your training plan was not modified.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record the decision.');
      await load(targetWeek).catch(() => {});
    } finally { setBusy(false); }
  }
  async function restore(eventId: string) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const fresh = await restoreAcceptedPlanAdjustment({
        weekStartDate: targetWeek, timezone, eventId,
      });
      setState(fresh);
      setNotice('Original generated workout restored. The prior decision remains in the audit.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not restore the session.');
    } finally { setBusy(false); }
  }
  const current = state?.preview?.current;
  // Duplicate controls for different options on the same event should not be
  // actionable after an accepted decision until explicitly restored.
  const accepted = new Set(state?.latestDecisions.filter(d => d.decision === 'accepted')
    .map(d => d.sourceEventId) ?? []);
  const candidates = state?.preview?.candidates.filter(c => !accepted.has(c.eventId)) ?? [];
  return <SafeAreaView style={styles.safe} edges={['left', 'right']}>
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable accessibilityRole="button" onPress={() => router.back()}>
        <Text style={styles.link}>‹ Plan</Text>
      </Pressable>
      <Text style={styles.eyebrow}>TRAINING PLAN REVIEW</Text>
      <Text style={styles.title}>Review a proposed adjustment</Text>
      <Text style={styles.body}>This compares your proposed training to experimental
        upper planning ceilings. It does not prescribe extra training, establish
        injury risk, or approve returning to exercise.</Text>
      <View style={styles.tabs}>
        <Pressable accessibilityRole="button" disabled={busy}
          onPress={() => chooseWeek(currentWeek)}
          style={[styles.tab, targetWeek === currentWeek && styles.activeTab]}>
          <Text style={styles.tabText}>This week</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy}
          onPress={() => chooseWeek(shiftWeek(currentWeek, 7))}
          style={[styles.tab, targetWeek !== currentWeek && styles.activeTab]}>
          <Text style={styles.tabText}>Next week</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Week starting {targetWeek}. Completed training is never edited.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.success}>{notice}</Text> : null}
      {!state ? <Text style={styles.hint}>Loading current baseline and source evidence…</Text> : <>
        <View style={styles.card}>
          <Text style={styles.heading}>Current evidence</Text>
          <Text style={styles.body}>Review status: {state.ready
            ? 'Provisional options available' : 'Plan changes require review'}</Text>
          {current?.comparisons.map(item =>
            <Text key={item.dimension} style={styles.body}>
              {dimensionLabel(item.dimension)}: {format(item.proposedKnownSubtotal, item.unit)}
              {' '}of {item.ceiling === null ? 'no authorized increase'
                : format(item.ceiling, item.unit)} · {item.status.replaceAll('_', ' ')}
            </Text>)}
          {state.explanations.map((reason, i) =>
            <Text key={i} style={styles.warning}>• {reason}</Text>)}
          <Text style={styles.hint}>Unknown durations, possible imported duplicates and
            incomplete future rolling coverage prevent a confirmed green result.</Text>
          <Pressable accessibilityRole="button" onPress={() =>
            router.push('/training-baseline-review' as never)}>
            <Text style={styles.link}>Review baseline and source coverage</Text>
          </Pressable>
        </View>
        <View style={styles.card}>
          <Text style={styles.heading}>Possible changes (never automatic)</Text>
          {candidates.length === 0 ? <Text style={styles.hint}>
            No available change candidates. This may mean the baseline is not
            approved, records need reconciliation, or the current calendar does
            not contain an eligible generated endurance session.
          </Text> : null}
          {candidates.map(candidate =>
            <View key={candidate.id} style={styles.candidate}>
              <Text style={styles.subheading}>{candidate.title}</Text>
              <Text style={styles.body}>{candidate.action === 'defer'
                ? 'Defer session'
                : 'Shorten session by 20% (rounded down)'}</Text>
              <Text style={styles.body}>{candidate.currentMinutes} min planned
                {' → '}{candidate.proposedMinutes === null
                  ? 'not scheduled' : candidate.proposedMinutes + ' min'}</Text>
              <Text style={styles.hint}>{candidate.summary}</Text>
              <Compare candidate={candidate} />
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" disabled={busy}
                  onPress={() => void decide(candidate, 'accepted')}
                  style={[styles.button, busy && styles.disabled]}>
                  <Text style={styles.buttonText}>Accept change</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={busy}
                  onPress={() => void decide(candidate, 'declined')}
                  style={[styles.button, styles.secondary, busy && styles.disabled]}>
                  <Text style={styles.secondaryText}>Decline</Text>
                </Pressable>
              </View>
            </View>)}
        </View>
        {state.latestDecisions.some(d => d.decision === 'accepted') ?
          <View style={styles.card}>
            <Text style={styles.heading}>Approved changes and restoration</Text>
            {state.latestDecisions.filter(d => d.decision === 'accepted').map(event =>
              <View key={event.id} style={styles.candidate}>
                <Text style={styles.body}>{event.sourceEventId} · {event.action.replaceAll('_', ' ')}</Text>
                <Text style={styles.hint}>Accepted {event.createdAt}. Original plan retained.</Text>
                <Pressable accessibilityRole="button" disabled={busy}
                  onPress={() => void restore(event.sourceEventId)}>
                  <Text style={styles.link}>Restore original generated session</Text>
                </Pressable>
              </View>)}
          </View> : null}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAF9F5' },
  page: { padding: 20, paddingBottom: 65, gap: 14 },
  eyebrow: { fontSize: 11, letterSpacing: 1.2, fontWeight: '800', color: '#397C71' },
  title: { fontSize: 26, fontWeight: '800', color: '#172F4C', lineHeight: 33 },
  heading: { fontSize: 17, color: '#172F4C', fontWeight: '800' },
  subheading: { fontSize: 15, fontWeight: '800', color: '#172F4C' },
  body: { fontSize: 14, color: '#30465B', lineHeight: 21 },
  hint: { fontSize: 12.5, color: '#63727B', lineHeight: 19 },
  warning: { color: '#955423', fontSize: 13, lineHeight: 20 },
  error: { color: '#B32929', fontSize: 14, lineHeight: 20 },
  success: { color: '#23705B', fontSize: 14, fontWeight: '700' },
  link: { color: '#24756B', fontSize: 14, fontWeight: '700', paddingVertical: 5 },
  card: { backgroundColor: '#FFFFFF', padding: 17, borderRadius: 15,
    borderWidth: 1, borderColor: '#DDE4E0', gap: 10 },
  candidate: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#E3E8E7', gap: 6 },
  comparison: { borderRadius: 9, backgroundColor: '#F2F6F4', padding: 10, gap: 7 },
  compRow: { gap: 2 },
  compName: { fontSize: 12, fontWeight: '700', color: '#1C374C' },
  compValue: { fontSize: 13, fontWeight: '700', color: '#275F55' },
  compHint: { fontSize: 11.5, color: '#63727B' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 5 },
  button: { backgroundColor: '#2B7468', borderRadius: 9, padding: 12, flex: 1,
    alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: '#E3EEEB' },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  secondaryText: { color: '#2C6C61', fontWeight: '800', fontSize: 13 },
  disabled: { opacity: 0.4 },
  tabs: { flexDirection: 'row', gap: 7 },
  tab: { flex: 1, borderRadius: 9, borderWidth: 1, borderColor: '#D1DDD7',
    padding: 12, alignItems: 'center' },
  activeTab: { borderColor: '#3D8779', backgroundColor: '#E0EEEA' },
  tabText: { fontWeight: '700', fontSize: 13, color: '#1C3C52' },
});
