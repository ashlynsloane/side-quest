import type {
  EnduranceLoadAssessment,
  StrengthAdjustmentProposal,
  TrainingAdjustmentMode,
  TrainingIntelligencePreferences,
  TrainingIntelligenceSnapshot,
} from '@circuit/domain';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen, Pill, SectionTitle, Surface } from '@/components/v12-ui';
import {
  acceptTrainingAdjustment,
  dismissTrainingAdjustment,
  getTrainingIntelligenceSnapshot,
  loadTrainingIntelligencePreferences,
  refreshTrainingIntelligence,
  updateTrainingIntelligencePreferences,
} from '@/services/training-intelligence';
import { useTheme } from '@/state/theme-context';
import { radius, typography, type AppPalette } from '@/theme';

const LOOKBACKS: TrainingIntelligencePreferences['lookbackDays'][] = [14, 21, 28, 30];

export default function TrainingIntelligenceScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [snapshot, setSnapshot] = useState<TrainingIntelligenceSnapshot | null>(null);
  const [preferences, setPreferences] = useState<TrainingIntelligencePreferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [saved, prefs] = await Promise.all([
      getTrainingIntelligenceSnapshot(),
      loadTrainingIntelligencePreferences(),
    ]);
    if (saved) setSnapshot(saved);
    setPreferences(prefs);
    const refreshed = await refreshTrainingIntelligence();
    if (refreshed.snapshot) setSnapshot(refreshed.snapshot);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function updatePreferences(patch: Partial<Pick<TrainingIntelligencePreferences, 'mode' | 'lookbackDays' | 'useStravaRelativeEffort'>>) {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await updateTrainingIntelligencePreferences(patch);
      setPreferences(updated);
      const refreshed = await refreshTrainingIntelligence();
      setSnapshot(refreshed.snapshot);
    } catch (error) {
      Alert.alert('Could not update Training Intelligence', error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }

  async function accept(proposal: StrengthAdjustmentProposal) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await acceptTrainingAdjustment(proposal.id);
      setMessage(result);
      setSnapshot(await getTrainingIntelligenceSnapshot());
    } catch (error) {
      Alert.alert('Could not apply recommendation', error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }

  async function dismiss(proposal: StrengthAdjustmentProposal) {
    setBusy(true);
    try {
      await dismissTrainingAdjustment(proposal.id);
      setSnapshot(await getTrainingIntelligenceSnapshot());
    } finally { setBusy(false); }
  }

  const pending = snapshot?.proposals.filter((proposal) => proposal.status === 'pending') ?? [];
  const reviewed = snapshot?.proposals.filter((proposal) => proposal.status !== 'pending') ?? [];
  const recentAssessments = [...(snapshot?.assessments ?? [])].sort((a, b) => b.assessedAt.localeCompare(a.assessedAt)).slice(-8).reverse();

  return <AppScreen
    eyebrow="TRAINING INTELLIGENCE"
    title="Strength and endurance"
    subtitle="Choose how recent endurance training may influence upcoming strength sessions."
  >
    <Surface style={styles.hero}>
      <Text style={styles.heroEyebrow}>CURRENT PRIORITY</Text>
      <Text style={styles.heroTitle}>{snapshot ? priorityLabel(snapshot.priority) : 'Calculating…'}</Text>
      <Text style={styles.heroBody}>{snapshot?.summary ?? 'Reviewing the active phase, recent Strava activities, and upcoming strength sessions.'}</Text>
      {snapshot ? <View style={styles.pills}><Pill tone="good">{phaseLabel(snapshot.phase)}</Pill><Pill tone="neutral">{snapshot.preferences.lookbackDays}-day baseline</Pill></View> : null}
    </Surface>

    {message ? <Surface style={styles.success}><Text style={styles.successText}>{message}</Text></Surface> : null}

    <SectionTitle>Adjustment settings</SectionTitle>
    <Surface>
      <Text style={styles.heading}>When may Side Quest apply a change?</Text>
      <Text style={styles.body}>The default permits only high-confidence extreme-load guardrails, such as moving a substantially overlapping strength session after an ultradistance effort. All ordinary reductions, complementary-focus changes, and race-phase adjustments remain proposals that you approve or reject.</Text>
      <View style={styles.choiceRow}>
        <ModeChoice
          label="Auto high-confidence only"
          detail="Extreme guardrails may move strength, with a snapshot and undo."
          selected={preferences?.mode === 'auto_high_confidence'}
          disabled={busy}
          onPress={() => void updatePreferences({ mode: 'auto_high_confidence' })}
          styles={styles}
        />
        <ModeChoice
          label="Suggestions only"
          detail="Nothing changes until you approve it."
          selected={preferences?.mode === 'suggestions_only'}
          disabled={busy}
          onPress={() => void updatePreferences({ mode: 'suggestions_only' })}
          styles={styles}
        />
      </View>
      <Text style={styles.label}>Personal baseline window</Text>
      <View style={styles.segmentRow}>{LOOKBACKS.map((days) => <Pressable key={days} disabled={busy} onPress={() => void updatePreferences({ lookbackDays: days })} style={[styles.segment, preferences?.lookbackDays === days && styles.segmentActive]}><Text style={[styles.segmentText, preferences?.lookbackDays === days && styles.segmentTextActive]}>{days} days</Text></Pressable>)}</View>
      <Pressable disabled={busy} onPress={() => void updatePreferences({ useStravaRelativeEffort: !preferences?.useStravaRelativeEffort })} style={styles.toggleRow}>
        <View style={{ flex: 1 }}><Text style={styles.heading}>Use Strava Relative Effort</Text><Text style={styles.body}>Use Strava's provided effort summary when available. Side Quest still compares duration and distance against your own recent history and does not recreate a proprietary training-load score.</Text></View>
        <View style={[styles.toggle, preferences?.useStravaRelativeEffort && styles.toggleActive]}><View style={[styles.knob, preferences?.useStravaRelativeEffort && styles.knobActive]} /></View>
      </Pressable>
    </Surface>

    <SectionTitle>Recommendations requiring review</SectionTitle>
    {pending.length === 0 ? <Surface><Text style={styles.heading}>No pending strength changes</Text><Text style={styles.body}>Recent endurance training is currently being treated as context without displacing the strength plan.</Text></Surface> : pending.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} busy={busy} onAccept={() => void accept(proposal)} onDismiss={() => void dismiss(proposal)} styles={styles} />)}

    <SectionTitle>Recent load context</SectionTitle>
    {recentAssessments.length === 0 ? <Surface><Text style={styles.body}>Sync Strava or record endurance sessions to build a personal 14–30 day comparison.</Text></Surface> : recentAssessments.map((assessment) => <AssessmentCard key={assessment.id} assessment={assessment} styles={styles} />)}

    {reviewed.length ? <><SectionTitle>Reviewed this cycle</SectionTitle><Surface>{reviewed.slice(0, 6).map((proposal) => <View key={proposal.id} style={styles.reviewedRow}><View style={{ flex: 1 }}><Text style={styles.heading}>{proposal.headline}</Text><Text style={styles.body}>{proposal.sessionTitle}</Text></View><Pill tone={proposal.status === 'dismissed' ? 'neutral' : 'good'}>{proposal.status.replaceAll('_', ' ')}</Pill></View>)}</Surface></> : null}

    <Surface>
      <Text style={styles.heading}>How Side Quest uses this data</Text>
      <Text style={styles.body}>Endurance contributes sport-load context, not direct strength credit. Heart rate is not used to infer muscle recruitment, and ordinary endurance sessions do not automatically remove strength work.</Text>
      <Pressable onPress={() => router.back()} style={styles.secondary}><Text style={styles.secondaryText}>Back to Plan</Text></Pressable>
    </Surface>
  </AppScreen>;
}

function ModeChoice({ label, detail, selected, disabled, onPress, styles }: { label: string; detail: string; selected: boolean; disabled: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.mode, selected && styles.modeActive]}><Text style={[styles.modeTitle, selected && styles.modeTitleActive]}>{label}</Text><Text style={[styles.modeDetail, selected && styles.modeDetailActive]}>{detail}</Text></Pressable>;
}

function ProposalCard({ proposal, busy, onAccept, onDismiss, styles }: { proposal: StrengthAdjustmentProposal; busy: boolean; onAccept: () => void; onDismiss: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <Surface style={proposal.automaticEligible ? styles.guardrail : undefined}>
    <View style={styles.cardHeader}><View style={{ flex: 1 }}><Text style={styles.eyebrow}>{proposal.automaticEligible ? 'HIGH-CONFIDENCE GUARDRAIL' : 'ATHLETE APPROVAL REQUIRED'}</Text><Text style={styles.cardTitle}>{proposal.headline}</Text></View><Pill tone={proposal.confidence === 'high' ? 'good' : 'neutral'}>{proposal.confidence}</Pill></View>
    <Text style={styles.session}>{proposal.sessionTitle} · {formatDate(proposal.sessionDate)}</Text>
    <Text style={styles.body}>{proposal.explanation}</Text>
    {proposal.preservedStrengthRegions.length ? <Text style={styles.evidence}><Text style={styles.bold}>Direct strength preserved:</Text> {proposal.preservedStrengthRegions.map(regionLabel).join(', ')}</Text> : null}
    {proposal.complementaryRegions.length ? <Text style={styles.evidence}><Text style={styles.bold}>Complementary support retained:</Text> {proposal.complementaryRegions.map(regionLabel).join(', ')}</Text> : null}
    {proposal.suggestedDate ? <Text style={styles.evidence}><Text style={styles.bold}>Suggested date:</Text> {formatDate(proposal.suggestedDate)}</Text> : null}
    <View style={styles.buttonRow}><Pressable disabled={busy} onPress={onDismiss} style={styles.dismiss}><Text style={styles.dismissText}>Keep original</Text></Pressable><Pressable disabled={busy} onPress={onAccept} style={styles.accept}><Text style={styles.acceptText}>{proposal.action === 'keep_strength' ? 'Confirm full strength' : 'Accept proposal'}</Text></Pressable></View>
  </Surface>;
}

function AssessmentCard({ assessment, styles }: { assessment: EnduranceLoadAssessment; styles: ReturnType<typeof makeStyles> }) {
  const signals = [...assessment.stravaSignals, ...assessment.objectiveSignals].slice(0, 4);
  return <Surface>
    <View style={styles.cardHeader}><View><Text style={styles.cardTitle}>{disciplineLabel(assessment.discipline)} · {assessment.loadClass}</Text><Text style={styles.body}>{Math.round(assessment.durationMinutes)} min · compared with {assessment.historyCount} prior session{assessment.historyCount === 1 ? '' : 's'}</Text></View><Pill tone={assessment.extremeGuardrail ? 'warn' : 'neutral'}>{assessment.confidence}</Pill></View>
    {signals.map((signal) => <Text key={signal} style={styles.signal}>• {signal}</Text>)}
    <Text style={styles.note}>This is whole-session and sport-load context. It is not direct muscle credit.</Text>
  </Surface>;
}

function priorityLabel(value: TrainingIntelligenceSnapshot['priority']) {
  if (value === 'strength_build') return 'Strength build priority';
  if (value === 'return_to_strength') return 'Return-to-strength priority';
  if (value === 'race_specific') return 'Race-specific maintenance';
  return 'Balanced strength + endurance';
}
function phaseLabel(value: TrainingIntelligenceSnapshot['phase']) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function disciplineLabel(value: EnduranceLoadAssessment['discipline']) { return value[0]!.toUpperCase() + value.slice(1); }
function regionLabel(value: string) { return value.replaceAll('_', ' '); }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)); }

function makeStyles(palette: AppPalette) { return StyleSheet.create({
  hero: { backgroundColor: palette.forest, borderColor: palette.forest }, heroEyebrow: { ...typography.eyebrow, color: palette.mint }, heroTitle: { ...typography.h1, color: palette.white }, heroBody: { ...typography.body, color: palette.white, opacity: 0.92 }, pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 },
  success: { backgroundColor: palette.mint }, successText: { ...typography.body, color: palette.forest, fontWeight: '800' },
  heading: { ...typography.h2, color: palette.ink }, body: { ...typography.body, color: palette.inkMuted }, label: { ...typography.eyebrow, color: palette.forest, marginTop: 15 },
  choiceRow: { gap: 9, marginTop: 12 }, mode: { borderWidth: 1, borderColor: palette.border, borderRadius: 20, padding: 16 }, modeActive: { backgroundColor: palette.forest, borderColor: palette.forest }, modeTitle: { ...typography.h2, color: palette.ink }, modeTitleActive: { color: palette.white }, modeDetail: { ...typography.small, color: palette.inkMuted, marginTop: 3 }, modeDetailActive: { color: palette.white },
  segmentRow: { flexDirection: 'row', gap: 6, marginTop: 8 }, segment: { flex: 1, borderWidth: 1, borderColor: palette.border, borderRadius: 14, paddingVertical: 11, alignItems: 'center' }, segmentActive: { backgroundColor: palette.forest, borderColor: palette.forest }, segmentText: { ...typography.small, color: palette.ink, fontWeight: '800' }, segmentTextActive: { color: palette.white },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 14 }, toggle: { width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: palette.border }, toggleActive: { backgroundColor: palette.forest }, knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: palette.white }, knobActive: { marginLeft: 20 },
  guardrail: { borderWidth: 2, borderColor: palette.warning }, cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }, eyebrow: { ...typography.eyebrow, color: palette.forest }, cardTitle: { ...typography.h2, color: palette.ink, marginTop: 3 }, session: { ...typography.small, color: palette.forest, fontWeight: '900' }, evidence: { ...typography.small, color: palette.inkMuted }, bold: { fontWeight: '900', color: palette.ink },
  buttonRow: { flexDirection: 'row', gap: 9, marginTop: 7 }, dismiss: { flex: 1, borderWidth: 1, borderColor: palette.forest, borderRadius: 16, padding: 13, alignItems: 'center' }, dismissText: { color: palette.forest, fontWeight: '900' }, accept: { flex: 1, backgroundColor: palette.forest, borderRadius: 16, padding: 13, alignItems: 'center' }, acceptText: { color: palette.white, fontWeight: '900' },
  signal: { ...typography.small, color: palette.inkMuted }, note: { ...typography.small, color: palette.forest, fontWeight: '800', marginTop: 3 }, reviewedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  secondary: { marginTop: 12, borderWidth: 1, borderColor: palette.forest, borderRadius: 16, padding: 13, alignItems: 'center' }, secondaryText: { color: palette.forest, fontWeight: '900' },
}); }
