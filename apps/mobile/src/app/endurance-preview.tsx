import { enduranceCoachLines } from '@circuit/planner/endurance-coach-format';
import type {
  EndurancePaceTarget,
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
import {
  enduranceEffortBody,
  enduranceHeroPresentation,
  mainSetCoachCue,
} from '@/services/endurance-detail-copy';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export default function EndurancePreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    date?: string;
    title?: string;
    discipline?: string;
    startAt?: string;
    endAt?: string;
  }>();
  const id = String(params.id ?? '');
  const date = String(params.date ?? '');
  const title = String(params.title ?? '');
  const discipline = String(params.discipline ?? '');
  const startAt = String(params.startAt ?? '');
  const endAt = String(params.endAt ?? '');
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [preview, setPreview] = useState<EndurancePrescriptionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    void loadEndurancePrescriptionPreview(id, date, {
      title: title || undefined,
      discipline: discipline === 'swim' || discipline === 'bike' || discipline === 'run' ? discipline : undefined,
      startAt: startAt || undefined,
      endAt: endAt || undefined,
    })
      .then((result) => {
        if (!live) return;
        setPreview(result);
        if (!result) setError('This session changed while your plan refreshed. Try loading the current prescription again.');
      })
      .catch((cause) => {
        if (!live) return;
        setError(cause instanceof Error ? cause.message : 'Could not load this endurance session.');
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [date, discipline, endAt, id, retryToken, startAt, title]);

  if (loading) {
    return <V23Screen contentStyle={styles.page}>
      <View style={styles.loading}><ActivityIndicator color={tokens.accent} /><Text style={styles.loadingText}>Building your workout…</Text></View>
    </V23Screen>;
  }

  if (!preview) {
    return <V23Screen contentStyle={styles.page}>
      <V23PageIntro
        label="ENDURANCE"
        title="Workout changed"
        body={error ?? 'The plan changed while this workout was opening. Reload the current prescription or return to Week.'}
      />
      <View style={styles.recoveryActions}>
        <Pressable accessibilityRole="button" onPress={() => setRetryToken((value) => value + 1)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Refresh workout</Text>
        </Pressable>
        <V23OutlineButton onPress={() => router.back()}>Back to Week</V23OutlineButton>
      </View>
    </V23Screen>;
  }

  const { prescription } = preview;
  const sport = sportPresentation(prescription.discipline);
  const compatible = compatibleEnvironments(prescription);
  const isSwim = prescription.discipline === 'swim';
  const showSetup = isSwim || prescription.workoutType === 'run_return_to_run';
  const heroPresentation = enduranceHeroPresentation(prescription);

  function askCoachAboutEnvironment() {
    const draft = `I want to adapt ${cleanTitle(prescription.title)} for a different surface, terrain, or setup. Can I do that without changing the purpose of the workout?`;
    router.push(`/coach?draft=${encodeURIComponent(draft)}&enduranceId=${encodeURIComponent(id)}&enduranceDate=${encodeURIComponent(date)}` as Href);
  }

  return <V23Screen contentStyle={styles.page}>
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <SportIcon kind={prescription.discipline} color={sport.color} backgroundColor={sport.background} size={23} />
        <View style={styles.heroCopy}>
          <Text style={[styles.sportLabel, { color: sport.color }]}>{sport.label}</Text>
          <Text style={styles.heroDate}>{formatDate(prescription.date)}</Text>
        </View>
        <V23Chip tone="neutral">{heroDose(prescription)}</V23Chip>
      </View>
      <Text style={styles.title}>{cleanTitle(prescription.title)}</Text>
      <Text style={styles.objective}>{heroPresentation.objective}</Text>
      <View style={styles.heroMeta}>
        <View style={styles.metaItem}><Text style={styles.metaLabel}>TYPE</Text><Text style={styles.metaValue}>{workoutTypeLabel(prescription)}</Text></View>
        <View style={styles.metaDivider} />
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>{isSwim ? 'SETUP' : heroPresentation.effortLabel}</Text>
          <Text style={styles.metaValue}>{isSwim ? (prescription.environmentLabel ?? 'Flexible') : heroPresentation.effortValue}</Text>
        </View>
      </View>
    </View>

    {prescription.setupRequired === 'return_to_run_protocol' ? <View>
      <V23SectionHeader>SETUP NEEDED</V23SectionHeader>
      <V23Card style={styles.setupCard}>
        <View style={styles.setupIcon}><V23Icon name="adjust" color={tokens.accent} size={18} /></View>
        <View style={styles.setupCopy}>
          <Text style={styles.infoTitle}>Choose your current run / walk stage</Text>
          <Text style={styles.infoBody}>Side Quest will not guess impact progression. Add the stage you are currently using, then the workout can use its exact run/walk dose.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/endurance-settings' as Href)} style={styles.setupButton}><Text style={styles.setupButtonText}>Set stage</Text></Pressable>
      </V23Card>
    </View> : null}

    <View>
      <V23SectionHeader detail={workoutDoseDetail(prescription)}>WORKOUT</V23SectionHeader>
      <V23Card style={styles.workoutCard}>
        {prescription.blocks.map((block, index) => (
          <WorkoutBlock
            key={block.id}
            prescription={prescription}
            block={block}
            index={index + 1}
            last={index === prescription.blocks.length - 1}
            styles={styles}
            tokens={tokens}
          />
        ))}
      </V23Card>
    </View>

    <View>
      <V23SectionHeader>EFFORT</V23SectionHeader>
      <V23Card style={styles.infoCard}>
        <Text style={styles.infoTitle}>{prescription.effortGuide}</Text>
        <Text style={styles.infoBody}>{prescription.discipline === 'swim' && prescription.blocks.some((block) => block.paceTarget)
          ? 'Set-specific pace ranges are calculated from your saved CSS. RPE remains useful when fatigue, traffic in the lane, or mechanics make pace less representative.'
          : enduranceEffortBody(prescription)}</Text>
      </V23Card>
    </View>

    {compatible.length ? <View>
      <V23SectionHeader>FLEXIBLE SETUP</V23SectionHeader>
      <V23Card style={styles.flexCard}>
        <Text style={styles.infoTitle}>Works well on</Text>
        <View style={styles.environmentChips}>
          {compatible.map((item) => <View key={item} style={styles.environmentChip}><Text style={styles.environmentChipText}>{item}</Text></View>)}
        </View>
        <Text style={styles.infoBody}>These are examples, not requirements. The training stimulus matters more than the venue.</Text>
        <Pressable accessibilityRole="button" onPress={askCoachAboutEnvironment} style={styles.coachLink}>
          <Text style={styles.coachLinkText}>Want hills, trail, treadmill, or something else? Ask Coach</Text>
          <V23Icon name="chevron" color={tokens.accent} size={14} />
        </Pressable>
      </V23Card>
    </View> : null}

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
      {!isSwim && compatible.length ? <Pressable accessibilityRole="button" onPress={askCoachAboutEnvironment} style={styles.settingsButton}>
        <Text style={styles.settingsButtonText}>Ask Coach about terrain or setup</Text>
      </Pressable> : null}
      {showSetup ? <Pressable accessibilityRole="button" onPress={() => router.push('/endurance-settings' as Href)} style={styles.settingsButton}>
        <Text style={styles.settingsButtonText}>Endurance setup</Text>
      </Pressable> : null}
      <V23OutlineButton onPress={() => router.back()}>Back to plan</V23OutlineButton>
    </View>
  </V23Screen>;
}

function WorkoutBlock({ prescription, block, index, last, styles, tokens }: {
  prescription: EnduranceSessionPrescription;
  block: EndurancePrescriptionBlock;
  index: number;
  last: boolean;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  const coachLines = enduranceCoachLines(prescription, block);
  const headline = blockHeadline(block);
  const recovery = recoveryText(block);
  const coachCue = mainSetCoachCue(block);
  return <View style={[styles.block, !last && styles.blockBorder]}>
    <View style={styles.blockIndex}><Text style={styles.blockIndexText}>{index}</Text></View>
    <View style={styles.blockCopy}>
      <View style={styles.blockTitleRow}>
        <Text style={styles.blockTitle}>{block.label}</Text>
        <Text style={styles.blockMinutes}>{blockDose(block)}</Text>
      </View>

      {coachLines.length ? <View style={styles.coachLines}>
        {coachLines.map((line, lineIndex) => <View key={`${block.id}-${lineIndex}`} style={styles.coachLine}>
          <Text style={styles.coachLineText}>{line.text}</Text>
          {line.secondary ? <Text style={styles.coachLineSecondary}>{line.secondary}</Text> : null}
        </View>)}
      </View> : <>
        <Text style={styles.blockHeadline}>{headline}</Text>
        {recovery ? <Text style={styles.blockRecovery}>{recovery}</Text> : null}
      </>}

      {block.paceTarget ? <Text style={styles.paceTarget}>PACE {formatPaceTarget(block.paceTarget)}</Text> : null}
      <View style={styles.rpeRow}><Text style={styles.rpeBadge}>RPE {block.target.low}–{block.target.high}</Text><Text style={styles.rpeCue}>{block.target.cue}</Text></View>
      {coachCue ? <View style={styles.coachCue}>
        <Text style={styles.coachCueLabel}>COACH CUE</Text>
        <Text style={styles.blockInstruction}>{coachCue}</Text>
      </View> : !coachLines.length ? <Text style={styles.blockInstruction}>{block.instruction}</Text> : null}
    </View>
  </View>;
}

function blockHeadline(block: EndurancePrescriptionBlock): string {
  if (block.repeatDistance && block.repeats && block.distanceUnit) return `${block.repeats} × ${block.repeatDistance} ${block.distanceUnit}`;
  if (block.totalDistance && block.distanceUnit) return `${block.totalDistance} ${block.distanceUnit}`;
  if (block.kind === 'walk_run' && block.repeats && block.workMinutes) return `${block.repeats} × ${block.workMinutes} min ${block.workLabel ?? 'run'}`;
  if (block.kind === 'walk_run') return 'Run / walk stage not configured';
  if (block.kind === 'intervals' && block.repeats && block.workMinutes) return `${block.repeats} × ${block.workMinutes} min`;
  if (block.workLabel === 'walk') return `${block.totalMinutes} min walk`;
  if (block.kind === 'drill') return 'Technique / drill work';
  return `${block.totalMinutes} min continuous`;
}

function recoveryText(block: EndurancePrescriptionBlock): string | null {
  if (block.restSeconds) return `${block.restSeconds} sec rest between repeats`;
  if (block.recoveryMinutes && block.kind === 'walk_run') return `${block.recoveryMinutes} min ${block.recoveryLabel ?? 'walk'} between run segments`;
  if (block.recoveryMinutes) return `${block.recoveryMinutes} min easy between efforts`;
  return null;
}

function blockDose(block: EndurancePrescriptionBlock): string {
  if (block.totalDistance && block.distanceUnit) return `${block.totalDistance} ${block.distanceUnit}`;
  return `${block.totalMinutes} min`;
}

function formatPaceTarget(target: EndurancePaceTarget): string {
  const fast = formatSeconds(target.fastSecondsPer100);
  const slow = formatSeconds(target.slowSecondsPer100);
  return `${fast}–${slow} /100 ${target.unit}`;
}

function formatSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function heroDose(prescription: EnduranceSessionPrescription): string {
  if (prescription.totalDistance && prescription.distanceUnit) return `${prescription.totalDistance} ${prescription.distanceUnit}`;
  return `${prescription.totalMinutes} min`;
}

function workoutDoseDetail(prescription: EnduranceSessionPrescription): string {
  if (prescription.totalDistance && prescription.distanceUnit) return `${prescription.totalDistance} ${prescription.distanceUnit} · ~${prescription.totalMinutes} min`;
  return `${prescription.totalMinutes} min total`;
}

function compatibleEnvironments(prescription: EnduranceSessionPrescription): string[] {
  if (prescription.discipline === 'swim') return [];
  if (prescription.workoutType === 'run_return_to_run') return ['Flat predictable surface', 'Treadmill'];
  if (prescription.workoutType === 'run_quality_intervals') return ['Track', 'Treadmill', 'Flat road', 'Smooth dirt path'];
  if (prescription.workoutType === 'run_long_aerobic') return ['Road or path', 'Nontechnical trail', 'Treadmill'];
  if (prescription.workoutType === 'run_recovery') return ['Flat road or path', 'Treadmill'];
  if (prescription.workoutType === 'run_easy_aerobic') return ['Road or path', 'Treadmill', 'Smooth trail'];
  if (prescription.workoutType === 'bike_quality_intervals') return ['Indoor trainer', 'Flat or rolling road'];
  if (prescription.workoutType === 'bike_long_aerobic') return ['Outdoor road', 'Indoor trainer'];
  if (prescription.workoutType === 'bike_recovery') return ['Indoor trainer', 'Easy flat route'];
  if (prescription.discipline === 'bike') return ['Outdoor road or path', 'Indoor trainer'];
  return [];
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
    heroDate: { color: tokens.textMuted, fontSize: 14, lineHeight: 20, marginTop: 1 },
    title: { color: tokens.text, fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: -0.5, marginTop: 4 },
    objective: { color: tokens.textMuted, fontSize: 17, lineHeight: 24 },
    heroMeta: { marginTop: 6, borderRadius: 15, backgroundColor: tokens.surfaceMuted, flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 14 },
    metaItem: { flex: 1, gap: 3 },
    metaDivider: { width: StyleSheet.hairlineWidth, backgroundColor: tokens.border, marginHorizontal: 12 },
    metaLabel: { color: tokens.textMuted, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.9 },
    metaValue: { color: tokens.text, fontSize: 14.5, lineHeight: 20, fontWeight: '800' },
    workoutCard: { paddingHorizontal: 16, paddingVertical: 2 },
    block: { flexDirection: 'row', gap: 12, paddingVertical: 17 },
    blockBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    blockIndex: { width: 30, height: 30, borderRadius: 15, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    blockIndexText: { color: tokens.accent, fontWeight: '900', fontSize: 12 },
    blockCopy: { flex: 1, minWidth: 0 },
    blockTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    blockTitle: { flex: 1, color: tokens.text, fontSize: 16.5, lineHeight: 21, fontWeight: '900' },
    blockMinutes: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
    blockHeadline: { color: tokens.text, fontSize: 21, lineHeight: 26, fontWeight: '900', marginTop: 5 },
    blockRecovery: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19, fontWeight: '700', marginTop: 2 },
    coachLines: { gap: 9, marginTop: 10 },
    coachLine: { gap: 2 },
    coachLineText: { color: tokens.text, fontSize: 16.5, lineHeight: 22, fontWeight: '800' },
    coachLineSecondary: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19, fontWeight: '600' },
    paceTarget: { alignSelf: 'flex-start', color: '#267BA6', backgroundColor: '#E4F2F8', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, overflow: 'hidden', fontSize: 10.5, lineHeight: 13, fontWeight: '900', marginTop: 8 },
    rpeRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 },
    rpeBadge: { color: tokens.accent, backgroundColor: tokens.accentSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, overflow: 'hidden', fontSize: 10.5, fontWeight: '900' },
    rpeCue: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
    coachCue: { marginTop: 10, borderRadius: 12, backgroundColor: tokens.surfaceMuted, paddingHorizontal: 11, paddingVertical: 10 },
    coachCueLabel: { color: tokens.accent, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.7 },
    blockInstruction: { color: tokens.textMuted, fontSize: 14, lineHeight: 21, marginTop: 4 },
    infoCard: { padding: 16, gap: 9 },
    infoTitle: { color: tokens.text, fontSize: 15, lineHeight: 21, fontWeight: '800' },
    infoBody: { color: tokens.textMuted, fontSize: 14, lineHeight: 21 },
    flexCard: { padding: 16, gap: 11 },
    environmentChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    environmentChip: { borderRadius: 999, backgroundColor: tokens.surfaceMuted, borderWidth: 1, borderColor: tokens.border, paddingHorizontal: 10, paddingVertical: 6 },
    environmentChipText: { color: tokens.text, fontSize: 11.5, lineHeight: 15, fontWeight: '800' },
    coachLink: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, paddingTop: 10, marginTop: 1 },
    coachLinkText: { flex: 1, color: tokens.accent, fontSize: 12.5, lineHeight: 17, fontWeight: '900' },
    setupCard: { padding: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
    setupIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    setupCopy: { flex: 1, minWidth: 0, gap: 2 },
    setupButton: { minHeight: 38, borderRadius: 11, backgroundColor: tokens.accent, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
    setupButtonText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '900' },
    reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
    reasonDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.accent, marginTop: 7 },
    reasonText: { flex: 1, color: tokens.textMuted, fontSize: 14, lineHeight: 21 },
    recoveryActions: { gap: 10 },
    actions: { gap: 10 },
    primaryButton: { minHeight: 50, borderRadius: 15, backgroundColor: tokens.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    primaryButtonText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '900' },
    settingsButton: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
    settingsButtonText: { color: tokens.accent, fontSize: 13, fontWeight: '900' },
  });
}
