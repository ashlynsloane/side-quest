import { summarizeTrainingUrges, type DailyTrainingCeiling, type RecoveryStatus,
  type TrainingEvent, type TrainingRegion } from '@circuit/planner';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { localTrainingDate } from '@/services/training-addition-gate';
import { cloudWorkoutLeasesEnabled } from '@/services/cloud-workout-coordination';
import { readRemoteTrainingSnapshot, type RemoteTrainingSnapshot } from '@/services/server-training-ledger';
import { loadDailyCeiling, loadTrainingEvents, recordObservedRecovery } from '@/services/training-guardrail-storage';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';

const REGIONS: Array<{ id: TrainingRegion; name: string; detail: string }> = [
  { id: 'general', name: 'Overall readiness', detail: 'Fatigue and overall recovery' },
  { id: 'achilles', name: 'Achilles / lower leg', detail: 'Symptoms during and after the previous loading exposure' },
  { id: 'upper_back', name: 'Upper back', detail: 'Scapular and thoracic symptom response' },
];
const OPTIONS: Array<{ value: RecoveryStatus; label: string }> = [
  { value: 'stable', label: 'Stable' },
  { value: 'uncertain', label: 'Unsure' },
  { value: 'worse', label: 'Worse' },
  { value: 'red_flag', label: 'Urgent concern' },
];

export default function DailyTrainingCeilingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { tokens } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    background: { flex: 1, backgroundColor: tokens.canvas },
    content: { padding: 20, gap: 18, paddingBottom: 48 },
    title: { fontSize: 25, fontWeight: '800', color: tokens.text },
    body: { color: tokens.textMuted, lineHeight: 21 },
    card: { borderRadius: 16, backgroundColor: tokens.surface, padding: 18, gap: 11 },
    cardTitle: { fontWeight: '700', fontSize: 17, color: tokens.text },
    option: { padding: 11, borderWidth: 1, borderRadius: 9, borderColor: tokens.border },
    optionSelected: { borderColor: tokens.accent, backgroundColor: tokens.accentSoft },
    optionText: { color: tokens.text, fontWeight: '600' },
    button: { backgroundColor: tokens.accent, padding: 15, borderRadius: 12 },
    buttonText: { textAlign: 'center', color: tokens.canvas, fontWeight: '800' },
  }), [tokens]);
  const [ceiling, setCeiling] = useState<DailyTrainingCeiling | null>(null);
  const [remote, setRemote] = useState<RemoteTrainingSnapshot | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const synchronized = user?.mode === 'cloud' && cloudWorkoutLeasesEnabled();
  const [events, setEvents] = useState<TrainingEvent[]>([]);
  const [readiness, setReadiness] = useState<Partial<Record<TrainingRegion, RecoveryStatus>>>({});
  const [recheckedRegions, setRecheckedRegions] = useState<TrainingRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const date = localTrainingDate();

  useEffect(() => {
    let mounted = true;
    if (!user?.id) { setLoading(false); return; }
    void Promise.all([loadDailyCeiling(user.id, date), loadTrainingEvents(user.id, date)]).then(([current, history]) => {
      if (!mounted) return;
      setCeiling(current);
      setReadiness(current?.recovery ?? {});
      setEvents(history);
    }).catch((cause) => {
      if (mounted) setMessage(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [user?.id, date]);

  useEffect(() => {
    if (!synchronized || !user?.id) {
      setRemote(null);
      setRemoteError(null);
      return;
    }
    let live = true;
    setRemote(null);
    setRemoteError(null);
    void readRemoteTrainingSnapshot(date).then((snapshot) => {
      if (live) setRemote(snapshot);
    }).catch((error) => {
      if (live) setRemoteError(error instanceof Error ? error.message : String(error));
    });
    return () => { live = false; };
  }, [synchronized, date, user?.id]);

  const urgeSummary = summarizeTrainingUrges(events);
  const plannedMinutes = ceiling?.planned.reduce((sum, item) => sum + (item.minutes ?? 0), 0) ?? 0;
  const locallyPerformedMinutes = events.filter((event) =>
    (event.kind === 'completed' || event.kind === 'unplanned') && event.activity?.activity === 'strength'
  ).reduce((sum, event) => sum + (event.activity?.minutes ?? 0), 0);
  const remotelyPerformedMinutes = remote?.exposures.filter((event) =>
    event.trainingDate === date && event.activity === 'strength'
  ).reduce((sum, event) => sum + event.minutes, 0);
  const performedMinutes = synchronized ? remotelyPerformedMinutes : locallyPerformedMinutes;
  const reservedSessionIds = new Set(remote?.reservations.filter((entry) =>
    entry.trainingDate === date).map((entry) => entry.sessionId) ?? []);
  const remoteReservedMinutes = remote?.reservations.filter((entry) =>
    entry.trainingDate === date).reduce((sum, entry) => sum + entry.minutes, 0) ?? 0;
  const unreservedActualMinutes = remote?.exposures.filter((entry) =>
    entry.trainingDate === date && entry.activity === 'strength' &&
    (!entry.sessionId || !reservedSessionIds.has(entry.sessionId))
  ).reduce((sum, entry) => sum + entry.minutes, 0) ?? 0;
  const remotePotentialMinutes = remoteReservedMinutes + unreservedActualMinutes;

  async function save() {
    if (!ceiling || !user?.id || saving || recheckedRegions.length === 0) return;
    setSaving(true);
    try {
      const observed = Object.fromEntries(
        recheckedRegions.map((region) => [region, readiness[region]]),
      ) as Partial<Record<TrainingRegion, RecoveryStatus>>;
      await recordObservedRecovery(user.id, date, observed, {
        syncCloud: synchronized,
      });
      router.back();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally { setSaving(false); }
  }

  return <SafeAreaView style={styles.background}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Today's training ceiling</Text>
      <Text style={styles.body}>{date} · Report how you responded to previous training. A good energy level alone does not clear an injured area for progression.</Text>
      {loading ? <ActivityIndicator /> : ceiling ? <>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Today's strength budget</Text>
          {synchronized ? <>
            <Text style={styles.body}>Synchronized activity across devices: {remote
              ? `${remotelyPerformedMinutes ?? 0} min reported today · ${remote.exposures.length} exposures in the last 48 hours · ${remote.reservations.length} reserved starts today`
              : 'Awaiting verified server history'}</Text>
            <Text style={styles.body}>{remote && remote.plan
              ? `Server remaining allowance: up to ${Math.max(0, remote.plan.reduce((total, session) => total + session.minutes, 0) - remotePotentialMinutes)} min (counts reserved starts even if completion was not uploaded)`
              : 'No verified synchronized prescription: new cloud workouts are not authorized.'}</Text>
            {remote?.recovery.map((item) =>
              <Text key={item.region} style={styles.body}>
                Cloud {item.region.replaceAll('_',' ')}: {item.status} · reviewed {new Date(item.observedAt).toLocaleString()}
              </Text>)}
            {remoteError ? <Text style={styles.body}>Cloud history unavailable: {remoteError}. Do not interpret this device's local budget as shared clearance.</Text> : null}
          </> : <>
            <Text style={styles.body}>{plannedMinutes} min prescribed · approximately {performedMinutes} min counted from completed workouts</Text>
            <Text style={styles.body}>Budget remaining: up to {Math.max(0, plannedMinutes - (performedMinutes ?? 0))} min (estimated). This is a ceiling, not a recommendation to add work.</Text>
          </>}
          {ceiling.planned.map((item, index) =>
            <Text style={styles.body} key={item.sessionId ?? index}>
              {item.activity} · {item.minutes ?? 0} minutes {item.sessionId ? '(planned session)' : ''}
            </Text>)}
          {ceiling.pauseTraining ? <Text style={styles.body}>Training is currently paused by your active check-in. Update that restriction separately.</Text> : null}
        </View>
        {urgeSummary.recordedUrges > 0 ? <View style={styles.card}>
          <Text style={styles.cardTitle}>Noticing the urge to do more</Text>
          <Text style={styles.body}>
            {urgeSummary.recordedUrges} post-workout training {urgeSummary.recordedUrges === 1 ? 'urge' : 'urges'} recorded today.
            These are observations, not completed training or evidence that you need a larger workout.
          </Text>
          {urgeSummary.mostFrequentReason ? <Text style={styles.body}>
            Most frequent reason: {({
              energy: 'I still had energy',
              faster_progress: 'I wanted to improve faster',
              restless: 'I felt restless',
            } as const)[urgeSummary.mostFrequentReason]}
          </Text> : null}
        </View> : null}
        {REGIONS.map((region) => <View style={styles.card} key={region.id}>
          <Text style={styles.cardTitle}>{region.name}</Text>
          <Text style={styles.body}>{region.detail}</Text>
          <Text style={styles.body}>{ceiling.recoveryObservedAt?.[region.id]
            ? `Last explicitly checked: ${new Date(ceiling.recoveryObservedAt[region.id]!).toLocaleString()}`
            : 'No explicit recovery observation recorded today'}</Text>
          {OPTIONS.map((option) => <Pressable
            key={option.value} accessibilityRole="radio"
            accessibilityState={{ checked: readiness[region.id] === option.value }}
            onPress={() => {
              setReadiness((current) => ({ ...current, [region.id]: option.value }));
              setRecheckedRegions((current) => current.includes(region.id) ? current : [...current, region.id]);
            }}
            style={[styles.option, readiness[region.id] === option.value && styles.optionSelected]}>
            <Text style={styles.optionText}>{option.label}</Text>
          </Pressable>)}
        </View>)}
        <Text style={styles.body}>Stable means no meaningful deterioration relative to your usual baseline after the previous exposure. It does not guarantee that a higher dose is safe. An urgent concern blocks training; seek appropriate medical advice.</Text>
        <Pressable accessibilityRole="button" disabled={saving || recheckedRegions.length === 0}
          style={[styles.button, (saving || recheckedRegions.length === 0) && { opacity: 0.5 }]}
          onPress={() => void save()}>
          <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save explicitly checked regions'}</Text>
        </Pressable>
      </> : <View style={styles.card}>
        <Text style={styles.cardTitle}>No daily prescription is available</Text>
        <Text style={styles.body}>Open a planned workout first to establish today's budget. Ad hoc training requires an explicitly documented exception.</Text>
        <Pressable onPress={() => router.replace('/train' as Href)} style={styles.button}>
          <Text style={styles.buttonText}>Return to training</Text>
        </Pressable>
      </View>}
      {message ? <Text style={styles.body}>{message}</Text> : null}
    </ScrollView>
  </SafeAreaView>;
}
