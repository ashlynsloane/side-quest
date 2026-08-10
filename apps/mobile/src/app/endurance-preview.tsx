import type {
  EndurancePrescriptionBlock,
  EnduranceSessionPrescription,
} from '@circuit/planner/endurance-prescription';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { SportIcon } from '@/components/sport-icon';
import {
  V23Card,
  V23Chip,
  V23Icon,
  V23OutlineButton,
  V23PageIntro,
  V23Screen,
  V23SectionHeader,
} from '@/components/v23-ui';
import {
  loadEndurancePrescriptionPreview,
  type EndurancePrescriptionPreview,
} from '@/services/endurance-prescription-runtime';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export default function EndurancePreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const id = String(params.id ?? '');
  const date = String(params.date ?? '');
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [preview, setPreview] = useState<EndurancePrescriptionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    void loadEndurancePrescriptionPreview(id, date)
      .then((result) => {
        if (!live) return;
        setPreview(result);
        if (!result) setError('This endurance session is no longer available in the current plan.');
      })
      .catch((cause) => {
        if (!live) return;
        setError(cause instanceof Error ? cause.message : 'Could not load this endurance session.');
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [date, id]);

  if (loading) {
    return <V23Screen contentStyle={styles.page}>
      <View style={styles.loading}><ActivityIndicator color={tokens.accent} /><Text style={styles.loadingText}>Building your workout…</Text></View>
    </V23Screen>;
  }

  if (!preview) {
    return <V23Screen contentStyle={styles.page}>
      <V23PageIntro label="ENDURANCE" title="Workout unavailable" body={error ?? 'Return to Week and refresh the plan.'} />
      <V23OutlineButton onPress={() => router.back()}>Back</V23OutlineButton>
    </V23Screen>;
  }

  const { prescription } = preview;
  const sport = sportPresentation(prescription.discipline);

  return <V23Screen contentStyle={styles.page}>
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <SportIcon kind={prescription.discipline} color={sport.color} backgroundColor={sport.background} size={23} />
        <View style={styles.heroCopy}>
          <Text style={[styles.sportLabel, { color: sport.color }]}>{sport.label}</Text>
          <Text style={styles.heroDate}>{formatDate(prescription.date)}</Text>
        </View>
        <V23Chip tone="neutral">{prescription.totalMinutes} min</V23Chip>
      </View>
      <Text style={styles.title}>{cleanTitle(prescription.title)}</Text>
      <Text style={styles.objective}>{prescription.objective}</Text>
      <View style={styles.heroMeta}>
        <View style={styles.metaItem}><Text style={styles.metaLabel}>TYPE</Text><Text style={styles.metaValue}>{workoutTypeLabel(prescription)}</Text></View>
        <View style={styles.metaDivider} />
        <View style={styles.metaItem}><Text style={styles.metaLabel}>EFFORT</Text><Text style={styles.metaValue}>{overallEffort(prescription)}</Text></View>
      </View>
    </View>

    <View>
      <V23SectionHeader detail={`${prescription.totalMinutes} min total`}>WORKOUT</V23SectionHeader>
      <V23Card style={styles.workoutCard}>
        {prescription.blocks.map((block, index) => (
          <WorkoutBlock key={block.id} block={block} index={index + 1} last={index === prescription.blocks.length - 1} styles={styles} tokens={tokens} />
        ))}
      </V23Card>
    </View>

    <View>
      <V23SectionHeader>EFFORT</V23SectionHeader>
      <V23Card style={styles.infoCard}>
        <Text style={styles.infoTitle}>{prescription.effortGuide}</Text>
        <Text style={styles.infoBody}>Use the written RPE as the primary target. Side Quest will only add athlete-specific pace or power targets when it has enough trustworthy evidence.</Text>
      </V23Card>
    </View>

    {prescription.whyThisSession.length ? <View>
      <V23SectionHeader>WHY TODAY</V23SectionHeader>
      <V23Card style={styles.infoCard}>
        {prescription.whyThisSession.slice(0, 4).map((reason, index) => <View key={`${reason}-${index}`} style={styles.reasonRow}><View style={styles.reasonDot} /><Text style={styles.reasonText}>{athleteFacingReason(reason)}</Text></View>)}
      </V23Card>
    </View> : null}

    <View>
      <V23SectionHeader>KEEP IN MIND</V23SectionHeader>
      <V23Card style={styles.infoCard}>
        {prescription.guardrails.slice(0, 4).map((guardrail, index) => <View key={`${guardrail}-${index}`} style={styles.reasonRow}><V23Icon name="check" color={tokens.accent} size={15} /><Text style={styles.reasonText}>{guardrail}</Text></View>)}
      </V23Card>
    </View>

    <View style={styles.actions}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/session-adjustment' as Href)} style={styles.primaryButton}>
        <V23Icon name="adjust" color="#FFFFFF" size={17} />
        <Text style={styles.primaryButtonText}>Adjust session</Text>
      </Pressable>
      <V23OutlineButton onPress={() => router.back()}>Back to plan</V23OutlineButton>
    </View>
  </V23Screen>;
}

function WorkoutBlock({ block, index, last, styles, tokens }: {
  block: EndurancePrescriptionBlock;
  index: number;
  last: boolean;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  const headline = blockHeadline(block);
  return <View style={[styles.block, !last && styles.blockBorder]}>
    <View style={styles.blockIndex}><Text style={styles.blockIndexText}>{index}</Text></View>
    <View style={styles.blockCopy}>
      <View style={styles.blockTitleRow}>
        <Text style={styles.blockTitle}>{block.label}</Text>
        <Text style={styles.blockMinutes}>{block.totalMinutes} min</Text>
      </View>
      <Text style={styles.blockHeadline}>{headline}</Text>
      {block.kind === 'intervals' && block.recoveryMinutes ? <Text style={styles.blockRecovery}>{block.recoveryMinutes} min easy between efforts</Text> : null}
      <View style={styles.rpeRow}><Text style={styles.rpeBadge}>RPE {block.target.low}–{block.target.high}</Text><Text style={styles.rpeCue}>{block.target.cue}</Text></View>
      <Text style={styles.blockInstruction}>{block.instruction}</Text>
    </View>
  </View>;
}

function blockHeadline(block: EndurancePrescriptionBlock): string {
  if (block.kind === 'intervals' && block.repeats && block.workMinutes) return `${block.repeats} × ${block.workMinutes} min`;
  if (block.kind === 'drill') return 'Technique / drill work';
  if (block.kind === 'walk_run') return 'Return-to-run protocol';
  return `${block.totalMinutes} min continuous`;
}

function sportPresentation(discipline: EnduranceSessionPrescription['discipline']) {
  if (discipline === 'swim') return { label: 'SWIM', color: '#267BA6', background: '#E4F2F8' };
  if (discipline === 'bike') return { label: 'BIKE', color: '#C58322', background: '#FBF0DB' };
  return { label: 'RUN', color: '#526E9A', background: '#E9EDF6' };
}

function workoutTypeLabel(prescription: EnduranceSessionPrescription): string {
  return prescription.workoutType
    .replace(`${prescription.discipline}_`, '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function overallEffort(prescription: EnduranceSessionPrescription): string {
  const lows = prescription.blocks.map((block) => block.target.low);
  const highs = prescription.blocks.map((block) => block.target.high);
  return `RPE ${Math.min(...lows)}–${Math.max(...highs)}`;
}

function cleanTitle(title: string): string {
  return title.replace(/^(Swim|Bike|Run)\s*[·:-]\s*/i, '');
}

function athleteFacingReason(reason: string): string {
  return reason
    .replace(/^Side Quest placed (swim|bike|run) on [a-z]+ to move the .* plan forward\.?$/i, 'Placed here to fit the rest of your training week.')
    .replace('The progression governor never adds missed-session volume elsewhere in the week.', 'Missed training is not added back elsewhere in the week.');
}

function formatDate(date: string): string {
  const value = new Date(`${date}T12:00:00`);
  return Number.isNaN(value.getTime()) ? date : new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(value);
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { paddingTop: 18, paddingBottom: 36, gap: 22 },
    loading: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingText: { color: tokens.textMuted, fontSize: 14, fontWeight: '700' },
    hero: { borderRadius: 24, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, padding: 20, gap: 10 },
    heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    heroCopy: { flex: 1 },
    sportLabel: { fontSize: 11, lineHeight: 14, fontWeight: '900', letterSpacing: 1.2 },
    heroDate: { color: tokens.textMuted, fontSize: 13, lineHeight: 18, marginTop: 1 },
    title: { color: tokens.text, fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: -0.5, marginTop: 4 },
    objective: { color: tokens.textMuted, fontSize: 16, lineHeight: 23 },
    heroMeta: { marginTop: 6, borderRadius: 15, backgroundColor: tokens.surfaceMuted, flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 14 },
    metaItem: { flex: 1, gap: 3 },
    metaDivider: { width: StyleSheet.hairlineWidth, backgroundColor: tokens.border, marginHorizontal: 12 },
    metaLabel: { color: tokens.textMuted, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.9 },
    metaValue: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
    workoutCard: { paddingHorizontal: 16, paddingVertical: 2 },
    block: { flexDirection: 'row', gap: 12, paddingVertical: 17 },
    blockBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    blockIndex: { width: 30, height: 30, borderRadius: 15, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    blockIndexText: { color: tokens.accent, fontWeight: '900', fontSize: 12 },
    blockCopy: { flex: 1, minWidth: 0 },
    blockTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    blockTitle: { flex: 1, color: tokens.text, fontSize: 16.5, lineHeight: 21, fontWeight: '900' },
    blockMinutes: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16, fontWeight: '700' },
    blockHeadline: { color: tokens.text, fontSize: 21, lineHeight: 26, fontWeight: '900', marginTop: 5 },
    blockRecovery: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18, fontWeight: '700', marginTop: 2 },
    rpeRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 },
    rpeBadge: { color: tokens.accent, backgroundColor: tokens.accentSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, overflow: 'hidden', fontSize: 10.5, fontWeight: '900' },
    rpeCue: { color: tokens.textMuted, fontSize: 11.5, fontWeight: '700' },
    blockInstruction: { color: tokens.textMuted, fontSize: 13, lineHeight: 19, marginTop: 8 },
    infoCard: { padding: 16, gap: 9 },
    infoTitle: { color: tokens.text, fontSize: 15, lineHeight: 21, fontWeight: '800' },
    infoBody: { color: tokens.textMuted, fontSize: 13, lineHeight: 19 },
    reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
    reasonDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.accent, marginTop: 7 },
    reasonText: { flex: 1, color: tokens.textMuted, fontSize: 13, lineHeight: 19 },
    actions: { gap: 10 },
    primaryButton: { minHeight: 50, borderRadius: 15, backgroundColor: tokens.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    primaryButtonText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '900' },
  });
}
