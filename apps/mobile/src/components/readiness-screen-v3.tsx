import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ProductAction, ProductDisclosure } from '@/components/product-ui';
import { V23Icon, V23Screen } from '@/components/v23-ui';
import { getTodayReadinessCheckIn, saveReadinessCheckIn } from '@/services/database';
import {
  readinessBand,
  readinessDetail,
  readinessHeadline,
  readinessScore,
  type DailyReadinessCheckIn,
} from '@/services/readiness';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

type ReadinessKey = 'sleep' | 'energy' | 'muscleFreshness' | 'stress' | 'motivation';

const DIMENSIONS: Array<{
  key: ReadinessKey;
  title: string;
  low: string;
  middle: string;
  high: string;
}> = [
  { key: 'sleep', title: 'Sleep', low: 'Very poor', middle: 'Okay', high: 'Excellent' },
  { key: 'energy', title: 'Energy', low: 'Drained', middle: 'Normal', high: 'High' },
  { key: 'muscleFreshness', title: 'Muscles', low: 'Very sore / heavy', middle: 'Normal', high: 'Fresh' },
  { key: 'stress', title: 'Stress', low: 'Low', middle: 'Moderate', high: 'Very high' },
  { key: 'motivation', title: 'Motivation', low: 'None', middle: 'Normal', high: 'High' },
];

export default function ReadinessScreenV3() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const today = localIsoDate(new Date());
  const [values, setValues] = useState({ sleep: 3, energy: 3, muscleFreshness: 3, stress: 3, motivation: 3 });
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    void getTodayReadinessCheckIn().then((existing) => {
      if (cancelled || !existing) return;
      setValues({
        sleep: existing.sleep,
        energy: existing.energy,
        muscleFreshness: existing.muscleFreshness,
        stress: existing.stress,
        motivation: existing.motivation,
      });
      setNotes(existing.notes ?? '');
      setSaved(true);
      setContextOpen(Boolean(existing.notes?.trim()));
    });
    return () => { cancelled = true; };
  }, []));

  const preview = useMemo<DailyReadinessCheckIn>(() => {
    const now = new Date().toISOString();
    return {
      id: `readiness_${today}`,
      date: today,
      ...values,
      notes: notes.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
  }, [notes, today, values]);

  const band = readinessBand(readinessScore(preview));

  async function save() {
    const existing = await getTodayReadinessCheckIn();
    const now = new Date().toISOString();
    await saveReadinessCheckIn({
      ...preview,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    setSaved(true);
  }

  function setDimension(key: ReadinessKey, value: number) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  return <V23Screen contentStyle={styles.page}>
    <View style={styles.header}>
      <Text style={styles.eyebrow}>TODAY’S CHECK-IN</Text>
      <Text style={styles.title}>How does training feel available today?</Text>
      <Text style={styles.subtitle}>This is recovery context, not a grade. Side Quest can scale a planned dose from it, but symptoms and movement limitations are handled separately.</Text>
    </View>

    <View style={[styles.interpretation, band === 'recover' && styles.interpretationReview]}>
      <View style={styles.interpretationTop}>
        <View style={[styles.interpretationIcon, band === 'recover' && styles.interpretationIconReview]}>
          <V23Icon name={band === 'ready' || band === 'steady' ? 'check' : 'adjust'} color="#FFFFFF" size={17} />
        </View>
        <Text style={styles.interpretationLabel}>CURRENT COACHING READ</Text>
      </View>
      <Text style={styles.interpretationTitle}>{readinessHeadline(preview)}</Text>
      <Text style={styles.interpretationBody}>{readinessDetail(preview)}</Text>
      <Text style={styles.interpretationFootnote}>No readiness score is shown or rewarded. This is one input alongside the training calendar, recent work, and any active restriction.</Text>
    </View>

    <View style={styles.sectionHeading}>
      <Text style={styles.sectionEyebrow}>RECOVERY CONTEXT</Text>
      <Text style={styles.sectionTitle}>Use the answer that best describes today.</Text>
    </View>

    <View style={styles.dimensionStack}>
      {DIMENSIONS.map((dimension) => <DimensionRow
        key={dimension.key}
        dimension={dimension}
        value={values[dimension.key]}
        onChange={(value) => setDimension(dimension.key, value)}
        styles={styles}
      />)}
    </View>

    <ProductDisclosure
      title="Add context"
      summary={notes.trim() ? 'A note is included with today’s check-in.' : 'Optional — travel, schedule, unusual fatigue, or other context.'}
      expanded={contextOpen}
      onPress={() => setContextOpen((value) => !value)}
    >
      <TextInput
        multiline
        value={notes}
        onChangeText={(value) => { setNotes(value); setSaved(false); }}
        placeholder="Example: late flight last night, long ride yesterday, unusually good energy…"
        placeholderTextColor={tokens.textMuted}
        style={styles.notesInput}
      />
    </ProductDisclosure>

    <View style={styles.actions}>
      <ProductAction label={saved ? 'Saved for today' : 'Save check-in'} icon="check" onPress={() => void save()} />
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/today-check-in' as Href)}
        style={({ pressed }) => [styles.symptomAction, pressed && styles.pressed]}
      >
        <View style={styles.symptomIcon}><V23Icon name="heart" color={tokens.accent} size={18} /></View>
        <View style={styles.symptomCopy}>
          <Text style={styles.symptomTitle}>Something hurts or movement is limited?</Text>
          <Text style={styles.symptomBody}>Use the protection check-in instead. Symptoms can change what training is allowed, not just how hard it feels.</Text>
        </View>
        <V23Icon name="chevron" color={tokens.textMuted} size={15} />
      </Pressable>
    </View>
  </V23Screen>;
}

function DimensionRow({
  dimension,
  value,
  onChange,
  styles,
}: {
  dimension: (typeof DIMENSIONS)[number];
  value: number;
  onChange: (value: number) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return <View style={styles.dimensionRow}>
    <View style={styles.dimensionHeader}>
      <Text style={styles.dimensionTitle}>{dimension.title}</Text>
      <Text style={styles.dimensionRead}>{dimensionLabel(dimension, value)}</Text>
    </View>
    <View style={styles.scaleRow}>
      {[1, 2, 3, 4, 5].map((option) => {
        const selected = option === value;
        return <Pressable
          key={option}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={`${dimension.title}: ${dimensionLabel(dimension, option)}`}
          onPress={() => onChange(option)}
          style={({ pressed }) => [styles.scaleButton, selected && styles.scaleButtonSelected, pressed && styles.pressed]}
        >
          <View style={[styles.scaleDot, selected && styles.scaleDotSelected]} />
        </Pressable>;
      })}
    </View>
    <View style={styles.anchorRow}>
      <Text style={styles.anchorText}>{dimension.low}</Text>
      <Text style={styles.anchorTextCenter}>{dimension.middle}</Text>
      <Text style={styles.anchorTextRight}>{dimension.high}</Text>
    </View>
  </View>;
}

function dimensionLabel(dimension: (typeof DIMENSIONS)[number], value: number): string {
  if (value <= 1) return dimension.low;
  if (value >= 5) return dimension.high;
  if (value === 3) return dimension.middle;
  return value === 2 ? `Below ${dimension.middle.toLowerCase()}` : `Above ${dimension.middle.toLowerCase()}`;
}

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { gap: 18, paddingTop: 16, paddingBottom: 38 },
    header: { gap: 5, paddingHorizontal: 2 },
    eyebrow: { color: tokens.accent, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1.05 },
    title: { color: tokens.text, fontSize: 28, lineHeight: 33, fontWeight: '900', letterSpacing: -0.5 },
    subtitle: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 20 },

    interpretation: { borderRadius: 22, backgroundColor: tokens.accentSoft, borderWidth: 1, borderColor: tokens.border, padding: 17, gap: 6 },
    interpretationReview: { backgroundColor: tokens.surfaceMuted },
    interpretationTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    interpretationIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: tokens.accent, alignItems: 'center', justifyContent: 'center' },
    interpretationIconReview: { backgroundColor: tokens.header },
    interpretationLabel: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
    interpretationTitle: { color: tokens.text, fontSize: 21, lineHeight: 26, fontWeight: '900', letterSpacing: -0.25 },
    interpretationBody: { color: tokens.textMuted, fontSize: 13, lineHeight: 19 },
    interpretationFootnote: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 15, marginTop: 3 },

    sectionHeading: { gap: 2, paddingHorizontal: 2 },
    sectionEyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
    sectionTitle: { color: tokens.text, fontSize: 18.5, lineHeight: 23, fontWeight: '900' },
    dimensionStack: { borderRadius: 20, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, overflow: 'hidden' },
    dimensionRow: { paddingHorizontal: 15, paddingVertical: 14, gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    dimensionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
    dimensionTitle: { color: tokens.text, fontSize: 14.5, lineHeight: 19, fontWeight: '900' },
    dimensionRead: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 15, fontWeight: '700', textAlign: 'right' },
    scaleRow: { flexDirection: 'row', gap: 5 },
    scaleButton: { flex: 1, height: 28, borderRadius: 8, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    scaleButtonSelected: { backgroundColor: tokens.accentSoft, borderWidth: 1, borderColor: tokens.accent },
    scaleDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: tokens.borderStrong },
    scaleDotSelected: { width: 10, height: 10, borderRadius: 5, backgroundColor: tokens.accent },
    anchorRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
    anchorText: { flex: 1, color: tokens.textMuted, fontSize: 9.5, lineHeight: 13 },
    anchorTextCenter: { flex: 1, color: tokens.textMuted, fontSize: 9.5, lineHeight: 13, textAlign: 'center' },
    anchorTextRight: { flex: 1, color: tokens.textMuted, fontSize: 9.5, lineHeight: 13, textAlign: 'right' },

    notesInput: { minHeight: 92, borderWidth: 1, borderColor: tokens.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, color: tokens.text, backgroundColor: tokens.surface, fontSize: 14, lineHeight: 20, textAlignVertical: 'top' },
    actions: { gap: 9 },
    symptomAction: { minHeight: 76, borderRadius: 18, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
    symptomIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    symptomCopy: { flex: 1, minWidth: 0, gap: 2 },
    symptomTitle: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
    symptomBody: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
    pressed: { opacity: 0.75 },
  });
}
