import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppScreen } from '@/components/v12-ui';
import { getTodayReadinessCheckIn, saveReadinessCheckIn } from '@/services/database';
import { readinessBand, readinessDetail, readinessHeadline, readinessScore, type DailyReadinessCheckIn } from '@/services/readiness';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

const DIMENSIONS: Array<{ key: 'sleep' | 'energy' | 'muscleFreshness' | 'stress' | 'motivation'; title: string; low: string; high: string }> = [
  { key: 'sleep', title: 'Sleep quality', low: 'Very poor', high: 'Excellent' },
  { key: 'energy', title: 'Energy', low: 'Drained', high: 'High' },
  { key: 'muscleFreshness', title: 'Muscle freshness', low: 'Very sore/heavy', high: 'Fresh' },
  { key: 'stress', title: 'Stress', low: 'Low', high: 'Very high' },
  { key: 'motivation', title: 'Motivation to train', low: 'None', high: 'High' },
];

export default function ReadinessScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const today = localIsoDate(new Date());
  const [values, setValues] = useState({ sleep: 3, energy: 3, muscleFreshness: 3, stress: 3, motivation: 3 });
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    void getTodayReadinessCheckIn().then((existing) => {
      if (cancelled || !existing) return;
      setValues({ sleep: existing.sleep, energy: existing.energy, muscleFreshness: existing.muscleFreshness, stress: existing.stress, motivation: existing.motivation });
      setNotes(existing.notes ?? '');
      setSaved(true);
    });
    return () => { cancelled = true; };
  }, []));

  const preview = useMemo<DailyReadinessCheckIn>(() => { const now = new Date().toISOString(); return { id: `readiness_${today}`, date: today, ...values, notes: notes.trim() || undefined, createdAt: now, updatedAt: now }; }, [notes, today, values]);
  const score = readinessScore(preview);
  const band = readinessBand(score);

  async function save() { const existing = await getTodayReadinessCheckIn(); const now = new Date().toISOString(); await saveReadinessCheckIn({ ...preview, createdAt: existing?.createdAt ?? now, updatedAt: now }); setSaved(true); }

  return <AppScreen eyebrow="30-SECOND CHECK-IN" title="How ready are you today?" subtitle="This adjusts the dose of a scheduled workout. Use the separate pain and injury check-in for symptoms or movement limitations.">
    <View style={[styles.summaryCard, band === 'recover' && styles.summaryCardWarm]}>
      <Text style={styles.summaryEyebrow}>{band.replace('_', ' ').toUpperCase()} · {score.toFixed(1)} / 5</Text>
      <Text style={styles.summaryTitle}>{readinessHeadline(preview)}</Text>
      <Text style={styles.summaryBody}>{readinessDetail(preview)}</Text>
    </View>

    {DIMENSIONS.map((dimension) => <View key={dimension.key} style={styles.dimensionCard}>
      <View style={styles.dimensionHeader}><Text style={styles.dimensionTitle}>{dimension.title}</Text><Text style={styles.dimensionValue}>{values[dimension.key]}</Text></View>
      <View style={styles.scaleRow}>{[1, 2, 3, 4, 5].map((value) => { const selected = values[dimension.key] === value; return <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { setValues((current) => ({ ...current, [dimension.key]: value })); setSaved(false); }} style={[styles.scaleButton, selected && styles.scaleButtonSelected]}><Text style={[styles.scaleText, selected && styles.scaleTextSelected]}>{value}</Text></Pressable>; })}</View>
      <View style={styles.anchorRow}><Text style={styles.anchorText}>{dimension.low}</Text><Text style={styles.anchorText}>{dimension.high}</Text></View>
    </View>)}

    <View style={styles.notesCard}><Text style={styles.dimensionTitle}>Optional context</Text><TextInput multiline value={notes} onChangeText={(value) => { setNotes(value); setSaved(false); }} placeholder="Travel, poor sleep, hard long run yesterday, unusually good energy…" placeholderTextColor={tokens.textMuted} style={styles.notesInput} /></View>

    <Pressable accessibilityRole="button" onPress={() => void save()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{saved ? 'Saved for today' : 'Save readiness check-in'}</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => router.push('/today-check-in' as never)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Log pain, tightness, or a movement limitation</Text></Pressable>
    {process.env.EXPO_PUBLIC_ENABLE_REHAB_BETA === 'true' ? <Pressable accessibilityRole="button" onPress={() => router.push('/rehab' as never)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Open longitudinal rehabilitation history (beta)</Text></Pressable> : null}
  </AppScreen>;
}

function localIsoDate(date: Date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, '0'); const day = String(date.getDate()).padStart(2, '0'); return `${year}-${month}-${day}`; }
function makeStyles(tokens: DesignTokens) { return StyleSheet.create({
  summaryCard: { backgroundColor: tokens.accent, borderRadius: 20, padding: 19, gap: 7 }, summaryCardWarm: { backgroundColor: '#665139' }, summaryEyebrow: { color: 'rgba(255,255,255,0.76)', fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 1 }, summaryTitle: { color: '#FFFFFF', fontSize: 22, lineHeight: 28, fontWeight: '800' }, summaryBody: { color: 'rgba(255,255,255,0.86)', fontSize: 14, lineHeight: 20 },
  dimensionCard: { backgroundColor: tokens.surface, borderRadius: 18, borderWidth: 1, borderColor: tokens.border, padding: 16, gap: 11 }, dimensionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, dimensionTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '700' }, dimensionValue: { color: tokens.accent, fontSize: 18, lineHeight: 22, fontWeight: '800' }, scaleRow: { flexDirection: 'row', gap: 8 }, scaleButton: { flex: 1, height: 44, borderRadius: 13, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' }, scaleButtonSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent }, scaleText: { color: tokens.text, fontWeight: '700' }, scaleTextSelected: { color: tokens.accent }, anchorRow: { flexDirection: 'row', justifyContent: 'space-between' }, anchorText: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 15 },
  notesCard: { backgroundColor: tokens.surface, borderRadius: 18, borderWidth: 1, borderColor: tokens.border, padding: 16, gap: 9 }, notesInput: { minHeight: 96, borderWidth: 1, borderColor: tokens.border, borderRadius: 13, padding: 12, color: tokens.text, backgroundColor: tokens.canvas, fontSize: 15, lineHeight: 21, textAlignVertical: 'top' }, primaryButton: { backgroundColor: tokens.header, borderRadius: 15, paddingVertical: 16, alignItems: 'center' }, primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' }, secondaryButton: { borderWidth: 1, borderColor: tokens.border, borderRadius: 15, paddingVertical: 14, paddingHorizontal: 14, alignItems: 'center', backgroundColor: tokens.surface }, secondaryButtonText: { color: tokens.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
}); }
