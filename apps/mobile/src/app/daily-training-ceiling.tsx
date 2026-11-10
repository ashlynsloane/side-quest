import type { DailyTrainingCeiling, RecoveryStatus, TrainingEvent, TrainingRegion } from '@circuit/planner';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { localTrainingDate } from '@/services/training-addition-gate';
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

  const plannedMinutes = ceiling?.planned.reduce((sum, item) => sum + (item.minutes ?? 0), 0) ?? 0;
  const performedMinutes = events.filter((event) =>
    (event.kind === 'completed' || event.kind === 'unplanned') && event.activity?.activity === 'strength'
  ).reduce((sum, event) => sum + (event.activity?.minutes ?? 0), 0);

  async function save() {
    if (!ceiling || !user?.id || saving || recheckedRegions.length === 0) return;
    setSaving(true);
    try {
      const observed = Object.fromEntries(
        recheckedRegions.map((region) => [region, readiness[region]]),
      ) as Partial<Record<TrainingRegion, RecoveryStatus>>;
      await recordObservedRecovery(user.id, date, observed);
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
          <Text style={styles.body}>{plannedMinutes} min prescribed · {performedMinutes} min recorded as completed</Text>
          <Text style={styles.body}>Remaining: {Math.max(0, plannedMinutes - performedMinutes)} min. This is a ceiling, not an invitation to add work.</Text>
          {ceiling.planned.map((item, index) =>
            <Text style={styles.body} key={item.sessionId ?? index}>
              {item.activity} · {item.minutes ?? 0} minutes {item.sessionId ? '(planned session)' : ''}
            </Text>)}
          {ceiling.pauseTraining ? <Text style={styles.body}>Training is currently paused by your active check-in. Update that restriction separately.</Text> : null}
        </View>
        {REGIONS.map((region) => <View style={styles.card} key={region.id}>
          <Text style={styles.cardTitle}>{region.name}</Text>
          <Text style={styles.body}>{region.detail}</Text>
          <Text style={styles.body}>{ceiling.recoveryObservedAt?.[region.id]
            ? `Last explicitly checked: ${new Date(ceiling.recoveryObservedAt[region.id]).toLocaleString()}`
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
