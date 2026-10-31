import { createManualEnduranceActivity, localCalendarDate } from '@circuit/planner';
import type { EnduranceIntensity } from '@circuit/domain';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { AppScreen, Surface } from '@/components/v12-ui';
import { upsertEnduranceActivities } from '@/services/database';
import { useTheme } from '@/state/theme-context';
import type { AppPalette } from '@/theme';

type Sport = 'run' | 'bike' | 'swim';
const SPORT_OPTIONS: Array<{ id: Sport; label: string }> = [
  { id: 'run', label: 'Run' }, { id: 'bike', label: 'Ride' },
  { id: 'swim', label: 'Swim' },
];
const INTENSITIES: EnduranceIntensity[] = ['unknown', 'recovery', 'easy', 'moderate', 'hard'];
export default function LogEnduranceScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [sport, setSport] = useState<Sport>('bike');
  const [date, setDate] = useState(localCalendarDate(new Date()));
  const [minutes, setMinutes] = useState('');
  const [distance, setDistance] = useState('');
  const [name, setName] = useState('');
  const [intensity, setIntensity] = useState<EnduranceIntensity>('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const now = new Date();
      const entry = createManualEnduranceActivity({
        id: 'manual-' + now.getTime() + '-' + Math.random().toString(36).slice(2, 10),
        name: name.trim() || 'Completed ' + sport,
        discipline: sport,
        localDate: date.trim(),
        durationMinutes: Number(minutes),
        distanceKm: distance.trim() ? Number(distance) : null,
        intensity, recordedAt: now.toISOString(),
      });
      await upsertEnduranceActivities([entry]);
      // Matching an actual workout to a planned calendar event is an explicit
      // follow-up; don't guess what the athlete completed.
      router.replace(`/activity-review?id=${encodeURIComponent(entry.id)}` as Href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message
        : 'Could not save this completed activity. Please review your entries.');
    } finally {
      setBusy(false);
    }
  }
  return <AppScreen
    eyebrow="COMPLETED TRAINING" title="Log what you actually did"
    subtitle="Record a run, ride, or swim when you don't have an imported workout. Missing distance stays unknown—not zero.">
    <Surface style={styles.card}>
      <Text style={styles.heading}>Sport</Text>
      <View style={styles.choices}>{SPORT_OPTIONS.map(option =>
        <Pressable key={option.id} accessibilityRole="button"
          accessibilityState={{ selected: sport === option.id }}
          onPress={() => setSport(option.id)}
          style={[styles.choice, sport === option.id && styles.selected]}>
          <Text style={[styles.choiceText, sport === option.id && styles.selectedText]}>
            {option.label}
          </Text>
        </Pressable>)}</View>

      <Text style={styles.heading}>Training date (YYYY-MM-DD)</Text>
      <TextInput accessibilityLabel="Training date" value={date} onChangeText={setDate}
        autoCapitalize="none" placeholder="2026-11-02" style={styles.field} />

      <Text style={styles.heading}>Duration (completed minutes)</Text>
      <TextInput accessibilityLabel="Completed duration in minutes" value={minutes}
        onChangeText={setMinutes} keyboardType="decimal-pad" placeholder="e.g. 45"
        style={styles.field} />

      <Text style={styles.heading}>Distance in kilometers — optional</Text>
      <TextInput accessibilityLabel="Distance in kilometers if known" value={distance}
        onChangeText={setDistance} keyboardType="decimal-pad"
        placeholder="Leave blank when unknown" style={styles.field} />
      <Text style={styles.helper}>A time estimate or missing run distance cannot
        establish a verified progression baseline without review.</Text>

      <Text style={styles.heading}>Optional workout name</Text>
      <TextInput accessibilityLabel="Workout name" value={name}
        onChangeText={setName} placeholder={'Completed ' + sport}
        style={styles.field} />

      <Text style={styles.heading}>How hard was it?</Text>
      <View style={styles.choices}>{INTENSITIES.map(option =>
        <Pressable key={option} accessibilityRole="button"
          accessibilityState={{ selected: intensity === option }}
          onPress={() => setIntensity(option)}
          style={[styles.choice, intensity === option && styles.selected]}>
          <Text style={[styles.choiceText, intensity === option && styles.selectedText]}>
            {option.replaceAll('_', ' ')}
          </Text>
        </Pressable>)}</View>
    </Surface>
    <Surface style={styles.note}>
      <Text style={styles.helper}>This is a completed workout, not a scheduled
        workout or clearance to increase training. After saving, you can review
        whether it belongs to a specific planned session. No plan is modified automatically.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable testID="sidequest-qa-save-endurance" accessibilityRole="button" disabled={busy}
        onPress={() => void save()} style={[styles.save, busy && styles.disabled]}>
        <Text style={styles.saveText}>{busy ? 'Saving locally…' : 'Save completed activity'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy}
        onPress={() => router.back()}>
        <Text style={styles.back}>Cancel</Text>
      </Pressable>
    </Surface>
  </AppScreen>;
}
function makeStyles(palette: AppPalette) {
  return StyleSheet.create({
    card: { padding: 18, gap: 11 }, note: { padding: 18, gap: 12 },
    heading: { color: palette.ink, fontSize: 15, fontWeight: '800', marginTop: 8 },
    helper: { color: palette.inkMuted, fontSize: 13, lineHeight: 20 },
    choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    choice: { borderColor: palette.border, borderWidth: 1, borderRadius: 10,
      paddingVertical: 10, paddingHorizontal: 11 },
    selected: { backgroundColor: palette.mint },
    choiceText: { color: palette.inkMuted, fontSize: 13, fontWeight: '700' },
    selectedText: { color: palette.forest },
    field: { borderColor: palette.border, borderWidth: 1,
      borderRadius: 10, padding: 13, color: palette.ink, fontSize: 15 },
    save: { backgroundColor: palette.forest, borderRadius: 12,
      padding: 15, alignItems: 'center' },
    saveText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
    disabled: { opacity: 0.5 },
    error: { color: '#AA3939', fontSize: 14, lineHeight: 20 },
    back: { color: palette.forest, fontWeight: '700', textAlign: 'center', padding: 7 },
  });
}
