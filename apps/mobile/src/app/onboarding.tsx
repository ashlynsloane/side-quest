import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScreen, Pill, SectionTitle, Surface } from '@/components/v12-ui';
import { buildSetupReadiness, type SetupReadiness, type SetupReadinessItem } from '@/services/onboarding';
import { useAuth } from '@/state/auth-context';
import { useOnboarding } from '@/state/onboarding-context';
import { useTheme } from '@/state/theme-context';
import { typography, type AppPalette } from '@/theme';

export default function OnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    state,
    acknowledgeStrengthModel,
    acknowledgePrivacyModel,
    markReviewed,
    complete,
    refresh,
  } = useOnboarding();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [readiness, setReadiness] = useState<SetupReadiness | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setReadiness(await buildSetupReadiness({ userId: user.id, accountMode: user.mode, state }));
  }, [state, user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const requiredLabel = readiness
    ? `${readiness.requiredComplete} of ${readiness.requiredTotal} core principles reviewed`
    : 'Loading setup status';

  async function finish() {
    setBusy(true);
    try {
      await complete();
      await refresh();
      router.replace('/(tabs)' as Href);
    } catch (cause) {
      Alert.alert('Review the core principles', cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return <AppScreen
    eyebrow="WELCOME TO SIDE QUEST"
    title="Set strength up around your real training."
    subtitle="This guide establishes how Side Quest interprets endurance load, protects direct strength, and handles private information. The detailed setup can be finished now or later."
  >
    <Surface style={styles.progressCard}>
      <View style={styles.progressHeader}>
        <Pill tone={readiness?.coreReady ? 'good' : 'warn'}>{readiness?.coreReady ? 'CORE READY' : 'REVIEW NEEDED'}</Pill>
        <Text style={styles.progressTitle}>{requiredLabel}</Text>
      </View>
      <ProgressBar value={readiness ? readiness.requiredComplete / readiness.requiredTotal : 0} palette={palette} />
      <Text style={styles.helper}>Goal, equipment, restrictions, and integrations improve recommendations but do not block entry after the two core principles are reviewed.</Text>
    </Surface>

    <SectionTitle>How Side Quest makes decisions</SectionTitle>
    <AcknowledgementCard
      checked={state.strengthModelAcknowledged}
      title="Endurance informs strength—it does not replace it"
      body="Swim, bike, and run provide fatigue and scheduling context. Direct exercise-specific strength remains its own training stimulus, especially in the offseason and during controlled return to strength."
      onPress={() => acknowledgeStrengthModel(!state.strengthModelAcknowledged)}
      styles={styles}
    />
    <AcknowledgementCard
      checked={state.privacyModelAcknowledged}
      title="Private details stay separated"
      body="Coaches receive sanitized future strength sessions only. Workout history, pain, readiness, heart rate, Strava details, private notes, and completed loads are not included in coach access."
      onPress={() => acknowledgePrivacyModel(!state.privacyModelAcknowledged)}
      styles={styles}
    />

    <Surface>
      <Text style={styles.principleTitle}>Adjustment policy</Text>
      <Text style={styles.principleBody}>Most changes are proposals that you accept, reject, or edit. Limited high-confidence guardrails may move—but never delete—strength after an extreme load when a safer date exists. Every applied change retains an undo path.</Text>
    </Surface>

    <SectionTitle detail={readiness ? `${readiness.recommendedComplete}/${readiness.recommendedTotal} reviewed` : undefined}>Build your training context</SectionTitle>
    {readiness?.items.slice(2, 6).map((item) => <SetupTask key={item.id} item={item} onOpen={() => item.route ? router.push(item.route as Href) : undefined} onReview={item.reviewKey ? () => markReviewed(item.reviewKey!, item.status !== 'complete') : undefined} styles={styles} />)}

    <SectionTitle detail="Optional">Connections and first workout</SectionTitle>
    {readiness?.items.slice(6).map((item) => <SetupTask key={item.id} item={item} onOpen={() => item.route ? router.push(item.route as Href) : undefined} styles={styles} />)}

    <SectionTitle>Where things live</SectionTitle>
    <Surface>
      <TourRow label="Today" detail="Readiness, next action, and training context." styles={styles} />
      <TourRow label="Train" detail="Generate, preview, and complete strength sessions." styles={styles} />
      <TourRow label="Plan" detail="Goals, schedule, coach proposals, and Training Intelligence." styles={styles} />
      <TourRow label="Progress" detail="Direct-strength status, sport-load context, history, and progression." styles={styles} />
      <TourRow label="You" detail="Equipment, restrictions, connections, privacy, Human Coach Access, and beta operations." styles={styles} last />
    </Surface>

    <Pressable disabled={busy || !readiness?.coreReady} onPress={() => void finish()} style={[styles.primary, (!readiness?.coreReady || busy) && styles.disabled]}>
      <Text style={styles.primaryText}>{busy ? 'Saving…' : state.completedAt ? 'Return to Side Quest' : 'Enter Side Quest'}</Text>
    </Pressable>
    <Text style={styles.footer}>You can reopen this guide from You. Setup status is stored only in the active Side Quest profile on this device.</Text>
  </AppScreen>;
}

function ProgressBar({ value, palette }: { value: number; palette: AppPalette }) {
  const safe = Math.max(0, Math.min(1, value));
  return <View style={{ height: 9, borderRadius: 999, overflow: 'hidden', backgroundColor: palette.surfaceMuted }}><View style={{ width: `${safe * 100}%`, height: '100%', backgroundColor: palette.forest }} /></View>;
}

function AcknowledgementCard({ checked, title, body, onPress, styles }: { checked: boolean; title: string; body: string; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={[styles.ackCard, checked && styles.ackCardChecked]}>
    <View style={[styles.check, checked && styles.checkActive]}><Text style={[styles.checkText, checked && styles.checkTextActive]}>{checked ? '✓' : ''}</Text></View>
    <View style={styles.flex}><Text style={styles.taskTitle}>{title}</Text><Text style={styles.taskBody}>{body}</Text></View>
  </Pressable>;
}

function SetupTask({ item, onOpen, onReview, styles }: { item: SetupReadinessItem; onOpen: () => void; onReview?: () => void; styles: ReturnType<typeof makeStyles> }) {
  const complete = item.status === 'complete';
  return <Surface style={styles.taskCard}>
    <View style={styles.taskTop}>
      <Pill tone={complete ? 'good' : item.status === 'optional' ? 'neutral' : 'warn'}>{complete ? 'COMPLETE' : item.status === 'optional' ? 'OPTIONAL' : 'TO REVIEW'}</Pill>
      <Text style={styles.taskTitle}>{item.title}</Text>
    </View>
    <Text style={styles.taskBody}>{item.detail}</Text>
    <View style={styles.actions}>
      {item.route ? <Pressable onPress={onOpen} style={styles.secondary}><Text style={styles.secondaryText}>Open</Text></Pressable> : null}
      {onReview ? <Pressable onPress={onReview} style={[styles.reviewButton, complete && styles.reviewButtonDone]}><Text style={[styles.reviewText, complete && styles.reviewTextDone]}>{complete ? 'Mark not reviewed' : 'Mark reviewed'}</Text></Pressable> : null}
    </View>
  </Surface>;
}

function TourRow({ label, detail, styles, last = false }: { label: string; detail: string; styles: ReturnType<typeof makeStyles>; last?: boolean }) {
  return <View style={[styles.tourRow, last && styles.tourRowLast]}><Text style={styles.tourLabel}>{label}</Text><Text style={styles.tourDetail}>{detail}</Text></View>;
}

function makeStyles(palette: AppPalette) {
  return StyleSheet.create({
    flex: { flex: 1 },
    progressCard: { gap: 11 },
    progressHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    progressTitle: { fontSize: 15, fontWeight: '900', color: palette.ink },
    helper: { ...typography.small, color: palette.inkMuted },
    ackCard: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 18, padding: 15, flexDirection: 'row', gap: 12 },
    ackCardChecked: { borderColor: palette.forest, backgroundColor: palette.mint },
    check: { width: 28, height: 28, borderRadius: 9, borderWidth: 2, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
    checkActive: { backgroundColor: palette.forest, borderColor: palette.forest },
    checkText: { fontWeight: '900', color: palette.inkMuted },
    checkTextActive: { color: palette.white },
    principleTitle: { fontSize: 16, fontWeight: '900', color: palette.ink, marginBottom: 6 },
    principleBody: { ...typography.body, color: palette.inkMuted },
    taskCard: { gap: 9 },
    taskTop: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    taskTitle: { fontSize: 16, lineHeight: 21, fontWeight: '900', color: palette.ink, flexShrink: 1 },
    taskBody: { ...typography.small, color: palette.inkMuted },
    actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    secondary: { borderWidth: 1, borderColor: palette.forest, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
    secondaryText: { color: palette.forest, fontWeight: '900' },
    reviewButton: { backgroundColor: palette.forest, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
    reviewButtonDone: { backgroundColor: palette.surfaceMuted },
    reviewText: { color: palette.white, fontWeight: '900' },
    reviewTextDone: { color: palette.inkMuted },
    tourRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.border, gap: 2 },
    tourRowLast: { borderBottomWidth: 0 },
    tourLabel: { fontSize: 15, fontWeight: '900', color: palette.ink },
    tourDetail: { ...typography.small, color: palette.inkMuted },
    primary: { backgroundColor: palette.forest, borderRadius: 15, padding: 15, alignItems: 'center' },
    primaryText: { color: palette.white, fontWeight: '900', fontSize: 16 },
    disabled: { opacity: 0.42 },
    footer: { ...typography.small, color: palette.inkMuted, textAlign: 'center' },
  });
}
