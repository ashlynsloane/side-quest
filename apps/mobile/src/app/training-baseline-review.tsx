import {
  assessWeekForBaseline, baselineSourceSignature, localTrainingDate,
  type CoverageReviewAttestation,
  type PlanningInterruptionState,
} from '@circuit/planner';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { currentLocalWeekStart } from '@/services/core-training-week-evidence';
import {
  approveAndSaveTrainingBaseline, loadTrainingBaselineReviewState,
  withdrawTrainingBaselineApproval, type TrainingBaselineReviewState,
} from '@/services/training-baseline-review';

const NO_REVIEW: CoverageReviewAttestation = {
  allTrainingRecorded: false,
  providersAndManualLogsReviewed: false,
  duplicateRecordsReconciled: false,
  estimatedDurationsReviewed: false,
  symptomContextReviewed: false,
  planningState: 'uninitialized',
  clinicalContext: 'unknown',
  notes: '',
};
const CHOICES: Array<{ id: PlanningInterruptionState; name: string }> = [
  { id: 'ordinary_progression', name: 'Ordinary training, no interruption' },
  { id: 'planned_recovery_or_vacation', name: 'Recovery week or vacation' },
  { id: 'illness_interruption', name: 'Illness interruption' },
  { id: 'injury_or_worsening_interruption', name: 'Injury, new pain or worsening symptoms' },
  { id: 'rehabilitation_or_return', name: 'Rehabilitation or return to training' },
  { id: 'high_contextual_stress_interruption', name: 'Unusually high life stress' },
];

const DAY = 86_400_000;
function addDays(value: string, count: number): string {
  return new Date(Date.parse(value + 'T00:00:00Z') + count * DAY)
    .toISOString().slice(0, 10);
}
function fmtMin(value: number | null): string {
  return value === null ? 'Unavailable' : Math.round(value) + ' min';
}
function fmtMiles(km: number | null): string {
  return km === null ? 'No running increase from a zero-mile baseline'
    : (km / 1.609344).toFixed(1) + ' mi';
}
function Check({ label, value, onPress }: {
  label: string; value: boolean; onPress: () => void;
}) {
  return <Pressable
    accessibilityRole="checkbox" accessibilityState={{ checked: value }}
    onPress={onPress} style={styles.check}
  ><Text style={styles.checkMark}>{value ? '☑' : '☐'}</Text>
    <Text style={styles.body}>{label}</Text>
  </Pressable>;
}

export default function TrainingBaselineReviewScreen() {
  const router = useRouter();
  const timezone = useMemo(() =>
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const currentMonday = useMemo(() => currentLocalWeekStart(timezone), [timezone]);
  const [targetWeek, setTargetWeek] = useState(currentMonday);
  const [review, setReview] = useState<CoverageReviewAttestation>(NO_REVIEW);
  const [state, setState] = useState<TrainingBaselineReviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const latestRequest = useRef(0);

  const load = useCallback(async (week: string) => {
    const request = ++latestRequest.current;
    setError(null);
    const next = await loadTrainingBaselineReviewState({
      planningWeekStart: week, timezone,
    });
    if (latestRequest.current === request) setState(next);
  }, [timezone]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void load(targetWeek).catch(e => {
      if (active) setError(e instanceof Error ? e.message : 'Could not load the training audit.');
    });
    return () => { active = false; latestRequest.current += 1; };
  }, [load, targetWeek]));

  const today = localTrainingDate(new Date().toISOString(), timezone);
  const assessment = state ? assessWeekForBaseline(
    state.previousWeek.evidence, targetWeek, today, review,
    state.proposedWeek.evidence.completed.count,
  ) : null;
  const blocks = [
    ...(assessment?.issues ?? []),
    ...(state?.previousWeek.historyPossiblyTruncated
      || state?.proposedWeek.historyPossiblyTruncated
      ? [{ code: 'truncated', detail: 'History query may be truncated; approval is unavailable.' }]
      : []),
    ...(state?.forcedClinicalContext === 'active' ? [{
      code: 'clinical', detail: 'An active PT or pain restriction is on file. Use a reviewed return plan.',
    }] : []),
  ];
  const canApprove = Boolean(state?.planningWeekStart === targetWeek
    && blocks.length === 0 && !busy);
  const updateCheck = (key: 'allTrainingRecorded' | 'providersAndManualLogsReviewed'
    | 'duplicateRecordsReconciled' | 'estimatedDurationsReviewed'
    | 'symptomContextReviewed') =>
    setReview(current => ({ ...current, [key]: !current[key] }));
  function switchWeek(next: string) {
    latestRequest.current += 1;
    setTargetWeek(next);
    setReview({ ...NO_REVIEW });
    setState(null);
    setError(null);
    setResult(null);
  }

  async function approve() {
    if (!state || !canApprove) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const outcome = await approveAndSaveTrainingBaseline({
        planningWeekStart: targetWeek, timezone, attestation: review,
        expectedSourceSignature: baselineSourceSignature(state.previousWeek.evidence),
        now: new Date(),
      });
      if (outcome.status === 'approved') {
        setState(outcome.state);
        setResult('Review recorded. These are experimental ceilings, not targets or medical clearance.');
      } else {
        setError(outcome.issues.map(issue => issue.detail).join(' '));
        await load(targetWeek);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the baseline.');
    } finally { setBusy(false); }
  }
  async function withdraw() {
    if (!state?.saved || busy) return;
    setBusy(true); setError(null);
    try {
      await withdrawTrainingBaselineApproval({
        planningWeekStart: targetWeek,
        reason: 'Athlete withdrew baseline policy eligibility for review.',
      });
      await load(targetWeek);
      setResult('Baseline approval withdrawn. The previous snapshot remains in the audit history.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not withdraw approval.');
    } finally { setBusy(false); }
  }
  const previous = state?.previousWeek.evidence;
  const proposed = state?.proposedWeek.evidence;
  const allowance = state?.savedStatus === 'active' ? state.saved?.frozenAllowance : null;

  return <SafeAreaView style={styles.safe} edges={['left', 'right']}>
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text style={styles.link}>‹ Weekly review</Text>
      </Pressable>
      <Text style={styles.eyebrow}>TRAINING BASELINE REVIEW</Text>
      <Text style={styles.title}>Before increasing next week's training</Text>
      <Text style={styles.body}>Compare actual training with an explicitly reviewed
        prior week. This is a personal planning policy—not an injury-risk
        prediction, return-to-sport clearance, or instruction to train more.</Text>

      <View style={styles.weekPicker}>
        <Pressable onPress={() => switchWeek(currentMonday)}
          accessibilityRole="button" style={[
            styles.pickerButton, targetWeek === currentMonday && styles.selected,
          ]}>
          <Text style={styles.pickerText}>Current week</Text>
        </Pressable>
        <Pressable onPress={() => switchWeek(addDays(currentMonday, 7))}
          accessibilityRole="button" style={[
            styles.pickerButton, targetWeek !== currentMonday && styles.selected,
          ]}>
          <Text style={styles.pickerText}>Next week</Text>
        </Pressable>
      </View>
      <Text style={styles.subheading}>Plan week: {targetWeek} – {addDays(targetWeek, 6)}</Text>
      <Text style={styles.helper}>Review the completed week ending {addDays(targetWeek, -1)}.
        Review cannot be completed until that calendar week is over.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {result ? <Text style={styles.success}>{result}</Text> : null}
      {!state ? <Text style={styles.helper}>Loading source-aware training evidence…</Text> : <>
        <View style={styles.card}>
          <Text style={styles.subheading}>What the training ledger currently shows</Text>
          <Text style={styles.body}>{previous?.completed.count} completed records;
            {' '}{fmtMin(previous?.completed.combinedMinutes ?? null)} with available durations.
          </Text>
          <Text style={styles.body}>Running: {previous
            ? (previous.completed.runDistanceKm / 1.609344).toFixed(1) + ' mi' : 'Unavailable'}
            {' '}· Cycling: {fmtMin(previous?.completed.cyclingMinutes ?? null)}
          </Text>
          <Text style={styles.helper}>These are recorded/estimated subtotals, NOT verified
            total training. Days with no records are not automatically rest days.</Text>
          <Text style={styles.helper}>Sources present: {state.previousWeek.activitySources.join(', ')
            || 'none recorded'}.</Text>
          {state.previousWeek.sourceDiagnostics.length ? <View style={styles.issueList}>
            <Text style={styles.helper}>Connected calendar feed status (calendar plans
              are not proof of completed workouts):</Text>
            {state.previousWeek.sourceDiagnostics.map((source, i) =>
              <Text key={source.name + i} style={styles.helper}>
                • {source.name}: {source.status}; last successful sync:
                {' '}{source.lastSuccessfulAt ?? 'not recorded'}
              </Text>)}
          </View> : <Text style={styles.helper}>No active external calendar
            sources are recorded. This does not prove all training is captured.</Text>}
          {previous?.unresolvedRecords.length || previous?.sourceConflicts.length
            ? <Text style={styles.warning}>{(previous?.unresolvedRecords.length ?? 0)
              + (previous?.sourceConflicts.length ?? 0)} incomplete measurements
              or reconciliation issues require review.</Text> : null}
          <Text style={styles.helper}>Scoped source audit:
            {' '}{state.previousWeek.rowsRead.strength}/{state.previousWeek.rowsExpected.strength}
            {' '}strength rows and
            {' '}{state.previousWeek.rowsRead.endurance}/{state.previousWeek.rowsExpected.endurance}
            {' '}endurance rows decoded.</Text>
          {state.previousWeek.historyPossiblyTruncated
            ? <Text style={styles.warning}>Activity source audit incomplete. A baseline
              cannot be approved until every stored record is readable.</Text> : null}
          {state.previousWeek.historyAuditIssues.map((issue, i) =>
            <Text key={i} style={styles.warning}>{issue}</Text>)}
          <Pressable accessibilityRole="button" style={styles.secondaryButton}
            onPress={() => router.push('/training-history' as never)}>
            <Text style={styles.link}>Inspect or reconcile activity records</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.subheading}>Confirm data coverage and context</Text>
          <Text style={styles.helper}>Check only what you have actually reviewed.
            This is an athlete attestation; Side Quest has not independently
            verified every Garmin, TrainingPeaks, manual, or off-app session.</Text>
          <Check label="All completed workouts and intentionally tracked training for this week are represented, including any days of rest."
            value={review.allTrainingRecorded} onPress={() => updateCheck('allTrainingRecorded')} />
          <Check label="I reviewed connected-source records and any manual/off-app workouts."
            value={review.providersAndManualLogsReviewed}
            onPress={() => updateCheck('providersAndManualLogsReviewed')} />
          <Check label="Duplicate watch, TrainingPeaks, calendar and strength records were reconciled."
            value={review.duplicateRecordsReconciled}
            onPress={() => updateCheck('duplicateRecordsReconciled')} />
          <Check label="I reviewed estimated workout durations and they reasonably represent this week's training."
            value={review.estimatedDurationsReviewed}
            onPress={() => updateCheck('estimatedDurationsReviewed')} />
          <Check label="I considered pain, symptoms, training interruption and recovery context."
            value={review.symptomContextReviewed}
            onPress={() => updateCheck('symptomContextReviewed')} />
          <Text style={styles.subheading}>What describes this planning period?</Text>
          {CHOICES.map(choice => <Pressable key={choice.id}
            accessibilityRole="radio" accessibilityState={{
              checked: review.planningState === choice.id,
            }} onPress={() => setReview(prev => ({ ...prev, planningState: choice.id }))}
            style={styles.radio}>
            <Text style={styles.body}>{review.planningState === choice.id ? '◉' : '○'} {choice.name}</Text>
          </Pressable>)}
          <Text style={styles.subheading}>Current injury / clinical restrictions</Text>
          {([
            ['none_reported', 'No active restrictions reported (not medical clearance)'],
            ['active', 'Active symptoms or clinician restrictions'],
            ['unknown', 'Not sure / needs review'],
          ] as const).map(([id, label]) =>
            <Pressable key={id} accessibilityRole="radio"
              accessibilityState={{ checked: review.clinicalContext === id }}
              style={styles.radio}
              onPress={() => setReview(prev => ({ ...prev, clinicalContext: id }))}>
              <Text style={styles.body}>{review.clinicalContext === id ? '◉' : '○'} {label}</Text>
            </Pressable>)}
          <Text style={styles.subheading}>Evidence and review notes</Text>
          <TextInput
            accessibilityLabel="Which data sources and interruption context did you review?"
            multiline placeholder="Which sources did you check? Any missing sessions or symptoms?"
            value={review.notes} onChangeText={notes => setReview(prev => ({ ...prev, notes }))}
            style={styles.textInput} />
          {blocks.length ? <View style={styles.issueList}>
            <Text style={styles.warning}>Approval unavailable:</Text>
            {blocks.slice(0, 8).map((issue, i) =>
              <Text key={issue.code + i} style={styles.helper}>• {issue.detail}</Text>)}
          </View> : null}
          <Pressable accessibilityRole="button" disabled={!canApprove}
            onPress={() => void approve()} style={[
              styles.primaryButton, !canApprove && styles.disabled,
            ]}>
            <Text style={styles.primaryLabel}>
              {busy ? 'Saving review…' : 'Approve prior week for planning comparison'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.subheading}>Frozen experimental limits</Text>
          <Text style={styles.helper}>Status: {state.savedStatus.replaceAll('_', ' ')}.
            Any changed completed history or new restrictions invalidate the saved
            comparison; old decisions remain auditable.</Text>
          {allowance ? <>
            <Text style={styles.body}>Running ceiling: {fmtMiles(allowance.runDistanceCapKm)}</Text>
            <Text style={styles.body}>Cycling ceiling: {fmtMin(allowance.cyclingMinutesCap)}</Text>
            <Text style={styles.body}>All training ceiling: {fmtMin(allowance.combinedMinutesCap)}</Text>
            <Text style={styles.helper}>Based on reviewed week {state.completedWeekStart}.
              Frozen at {state.saved?.reviewedAt}. No unused allowance is carried forward.</Text>
            <Text style={styles.warning}>Planned/recorded subtotal for {targetWeek}:
              {' '}{fmtMin(proposed?.plannedOrCompleted.combinedMinutes ?? null)}.
              Source coverage is not verified. Being under these experimental
              ceilings does not establish safety.</Text>
            {state.planningComparison ? <View style={styles.issueList}>
              <Text style={styles.subheading}>How this proposed week compares</Text>
              {state.planningComparison.comparisons.map(check =>
                <View key={check.dimension} style={styles.issueList}>
                  <Text style={styles.body}>{
                    check.dimension === 'running_distance' ? 'Running distance'
                      : check.dimension === 'cycling_duration' ? 'Cycling time'
                        : 'All training time'
                  }: {check.unit === 'km'
                    ? (check.proposedKnownSubtotal / 1.609344).toFixed(1) + ' known mi'
                    : Math.round(check.proposedKnownSubtotal) + ' known min'}
                    {' '}· {check.status.replaceAll('_', ' ')}</Text>
                  {check.reasons.slice(0, 2).map((reason, i) =>
                    <Text key={i} style={styles.helper}>• {reason}</Text>)}
                </View>)}
              <Text style={styles.helper}>The difference from a ceiling is not an amount
                to fill. Planned strength durations may be estimates and
                planned running distances may be unknown.</Text>
            </View> : null}
            {state.detectedWindowOverages.length ? <View style={styles.issueList}>
              <Text style={styles.warning}>The apparent subtotals exceed a ceiling in these windows.
                Source overlap may change these totals:</Text>
              {state.detectedWindowOverages.slice(0, 10).map((issue, i) =>
                <Text key={issue.window + issue.dimension + i} style={styles.warning}>
                  • {issue.window}: {issue.dimension} {Math.round(issue.proposed * 10) / 10}
                  {' '}vs {Math.round(issue.ceiling * 10) / 10} ceiling
                </Text>)}
            </View> : <Text style={styles.helper}>No overage detected in available
              records. Rolling seven-day compliance remains unverified because
              individual-day source coverage and future-week allowances may be missing.</Text>}
          </> : <Text style={styles.helper}>No currently usable approved baseline.
            A proposed training week cannot be called within-policy yet.</Text>}
          {state.savedReasons.map((reason, i) =>
            <Text key={i} style={styles.warning}>{reason}</Text>)}
          <Pressable accessibilityRole="button" style={styles.secondaryButton}
            onPress={() => router.push('/training-plan-adjustments' as never)}>
            <Text style={styles.link}>Preview and review training-plan changes</Text>
          </Pressable>
          {state.saved ? <Pressable onPress={() => void withdraw()}
            accessibilityRole="button" style={styles.secondaryButton}>
            <Text style={styles.link}>Withdraw saved approval</Text>
          </Pressable> : null}
        </View>
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAF9F5' },
  content: { paddingHorizontal: 19, paddingTop: 16, paddingBottom: 54, gap: 15 },
  title: { fontSize: 27, lineHeight: 34, fontWeight: '800', color: '#172F4C' },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, color: '#397C71' },
  subheading: { fontSize: 17, fontWeight: '800', color: '#172F4C', marginBottom: 3 },
  body: { fontSize: 14, lineHeight: 21, color: '#27384A' },
  helper: { fontSize: 12.5, lineHeight: 19, color: '#586B77' },
  warning: { fontSize: 13, lineHeight: 19, color: '#955423', fontWeight: '600' },
  error: { fontSize: 14, lineHeight: 21, color: '#B52323' },
  success: { fontSize: 13.5, color: '#247264', fontWeight: '700' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 17,
    borderColor: '#DAE2E1', borderWidth: 1, gap: 10 },
  check: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 },
  checkMark: { fontSize: 21, color: '#397C71', minWidth: 26 },
  radio: { paddingVertical: 5 },
  textInput: { borderColor: '#BBCAC8', borderWidth: 1, borderRadius: 10, minHeight: 77,
    paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top', fontSize: 14,
    color: '#172F4C' },
  weekPicker: { flexDirection: 'row', gap: 7 },
  pickerButton: { padding: 12, borderWidth: 1, borderColor: '#C3D1CD', borderRadius: 9,
    flex: 1, alignItems: 'center' },
  selected: { backgroundColor: '#E0EDE7', borderColor: '#397C71' },
  pickerText: { fontSize: 14, fontWeight: '700', color: '#172F4C' },
  primaryButton: { borderRadius: 11, padding: 15, backgroundColor: '#2D7367',
    alignItems: 'center', marginTop: 10 },
  primaryLabel: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
  disabled: { opacity: 0.42 },
  secondaryButton: { alignSelf: 'flex-start', paddingTop: 10 },
  issueList: { gap: 4, paddingVertical: 5 },
  link: { color: '#277468', fontWeight: '700', fontSize: 14 },
});
