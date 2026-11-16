import {
  localCalendarDate,
  type StrengthReviewDoseChange,
  type UnapprovedStrengthReviewDetail,
  type CurrentStrengthReviewEvidence,
} from '@circuit/planner';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getUnapprovedStrengthReviewDetail, setUnapprovedStrengthReviewDisposition,
  flagUnverifiedStrengthReviewConcern,
} from '@/services/database';
import { useAuth } from '@/state/auth-context';

function duration(seconds: number): string {
  const rounded = seconds / 60;
  return Number.isInteger(rounded)
    ? `${rounded} min` : `${Number(rounded.toFixed(1))} min`;
}
function dose(value: number | null, unit: string): string {
  if (value === null) return 'Removed';
  if (unit === 'seconds') return duration(value);
  return `${value} ${unit}`;
}
function changeHeadline(change: StrengthReviewDoseChange): string {
  switch (change.kind) {
    case 'station_removed': return 'Station removed';
    case 'exercise_removed': return 'Exercise removed';
    case 'station_duration': return 'Station duration reduced';
    case 'exercise_target': return 'Exercise target reduced';
    case 'exercise_resistance': return 'Resistance reduced';
  }
}

/** Historical dose is read-only. Dismiss/restore only changes the
 * unapproved draft's inbox visibility; exercise approval is not exposed.
 */
function unknownEvidence(athleteId: string): CurrentStrengthReviewEvidence {
  return {
    athleteId, todayLocalDate: localCalendarDate(new Date()),
    symptoms: 'unknown', readiness: 'unknown',
    providerRestrictions: 'unknown', sourceCoverage: 'unknown',
    exerciseRestrictionsReviewed: false,
  };
}
export default function StrengthReviewDetailScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { previewId } = useLocalSearchParams<{ previewId?: string }>();
  const athleteId = user?.id;
  const currentAthlete = useRef(athleteId);
  const currentPreview = useRef(previewId);
  currentAthlete.current = athleteId;
  currentPreview.current = previewId;
  const [detail, setDetail] = useState<UnapprovedStrengthReviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDisposition, setSavingDisposition] = useState(false);
  const [savingConcern, setSavingConcern] = useState(false);
  const [concernError, setConcernError] = useState<string | null>(null);
  const [dispositionError, setDispositionError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    setDetail(null);
    setError(null);
    setDispositionError(null);
    setSavingDisposition(false);
    setConcernError(null);
    setSavingConcern(false);
    if (!athleteId || typeof previewId !== 'string' || !previewId.trim()) {
      setLoading(false);
      setError('A valid saved preview and athlete profile are required.');
      return () => { live = false; };
    }
    setLoading(true);
    void getUnapprovedStrengthReviewDetail(
      athleteId, previewId, unknownEvidence(athleteId),
    ).then(result => {
      if (live) setDetail(result);
    }).catch(() => {
      if (live) {
        setDetail(null);
        setError('This preview or its history could not be verified. No exercise changes are available.');
      }
    }).finally(() => {
      if (live) setLoading(false);
    });
    return () => { live = false; };
  }, [athleteId, previewId]));

  const flagConcern = async (kind: 'provider_restriction' | 'training_coverage') => {
    if (savingConcern || savingDisposition || !detail || !athleteId
      || typeof previewId !== 'string'
      || currentAthlete.current !== athleteId
      || currentPreview.current !== previewId) return;
    setSavingConcern(true);
    setConcernError(null);
    try {
      await flagUnverifiedStrengthReviewConcern({
        athleteId, previewId, kind,
        expectedLastEventId: kind === 'provider_restriction'
          ? detail.provenance.restriction.latestEventId
          : detail.provenance.coverage.latestEventId,
      });
      const updated = await getUnapprovedStrengthReviewDetail(
        athleteId, previewId, unknownEvidence(athleteId),
      );
      if (currentAthlete.current === athleteId
        && currentPreview.current === previewId) setDetail(updated);
    } catch {
      if (currentAthlete.current === athleteId
        && currentPreview.current === previewId) {
        setConcernError(
          'The concern could not be verified as saved. Reopen this draft before trying again.',
        );
      }
    } finally {
      if (currentAthlete.current === athleteId
        && currentPreview.current === previewId) setSavingConcern(false);
    }
  };

  const confirmConcern = (kind: 'provider_restriction' | 'training_coverage') => {
    if (!detail || savingConcern || savingDisposition || !athleteId) return;
    const restriction = kind === 'provider_restriction';
    Alert.alert(
      restriction ? 'Flag an active exercise restriction?' : 'Flag incomplete training history?',
      restriction
        ? 'Record that a restriction may apply to this draft. This report is not clinician verification or medical advice.'
        : 'Record that training, injury, or recovery information may be missing. This does not verify any outside source.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Record concern', onPress: () => { void flagConcern(kind); } },
      ],
    );
  };

  const changeDisposition = async (action: 'dismiss' | 'restore') => {
    if (savingDisposition || savingConcern || !athleteId || !detail
      || typeof previewId !== 'string'
      || currentAthlete.current !== athleteId
      || currentPreview.current !== previewId) return;
    setSavingDisposition(true);
    setDispositionError(null);
    try {
      await setUnapprovedStrengthReviewDisposition({
        athleteId, previewId, action,
        expectedLastEventId: detail.review.latestEventId,
      });
      const updated = await getUnapprovedStrengthReviewDetail(
        athleteId, previewId, unknownEvidence(athleteId),
      );
      if (currentAthlete.current === athleteId
        && currentPreview.current === previewId) setDetail(updated);
    } catch {
      if (currentAthlete.current === athleteId
        && currentPreview.current === previewId) {
        setDispositionError(
          'The draft update could not be verified. Reopen this screen to refresh before trying again.',
        );
      }
    } finally {
      if (currentAthlete.current === athleteId
        && currentPreview.current === previewId) setSavingDisposition(false);
    }
  };

  const confirmDisposition = (action: 'dismiss' | 'restore') => {
    if (!detail || savingDisposition || savingConcern || !athleteId) return;
    const dismiss = action === 'dismiss';
    Alert.alert(
      dismiss ? 'Dismiss this draft?' : 'Return draft to inbox?',
      dismiss
        ? 'This only changes the draft\'s review-list status. It does not modify your workouts.'
        : 'The draft will become visible for review again. Stale evidence and all exercise restrictions remain in effect.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: dismiss ? 'Dismiss draft' : 'Return to inbox',
          style: dismiss ? 'destructive' : 'default',
          onPress: () => { void changeDisposition(action); },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}
          style={styles.back}><Text style={styles.backText}>‹ Reviews</Text></Pressable>
        <Text style={styles.headerText}>Unapproved draft</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>EXERCISE COMPARISON · READ ONLY DOSE</Text>
        <Text style={styles.title}>Before and after</Text>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Not approved for training</Text>
          <Text style={styles.noticeText}>
            This is a historical proposed change. It has not been cleared against current external clinician restrictions and cannot be applied or started here.
          </Text>
        </View>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={styles.helper}>Verifying the saved proposal and audit history…</Text>
          </View>
        ) : error ? (
          <View style={styles.card}><Text style={styles.error}>{error}</Text></View>
        ) : detail ? (
          <>
            {detail.stale ? (
              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>Current review is blocked</Text>
                <Text style={styles.noticeText}>
                  This comparison is historical. The original source or current
                  safety evidence is missing, changed, or unverified.
                </Text>
                {detail.reasons.slice(0, 5).map((reason, index) => (
                  <Text key={index} style={styles.noticeText}>• {reason}</Text>
                ))}
              </View>
            ) : null}
            <View style={styles.card}>
              <Text style={styles.cardEyebrow}>
                {detail.status === 'stale' ? 'STALE / UNVERIFIED DRAFT' : detail.status === 'dismissed' ? 'DISMISSED DRAFT' : 'PENDING REVIEW'}
              </Text>
              <Text style={styles.cardTitle}>{detail.summary.sourceTitle}</Text>
              <Text style={styles.helper}>Original session: {detail.summary.sourceDate}</Text>
              <View style={styles.durationRow}>
                <View style={styles.durationCell}>
                  <Text style={styles.durationLabel}>Original</Text>
                  <Text style={styles.durationValue}>{duration(detail.summary.originalSeconds)}</Text>
                </View>
                <Text style={styles.durationArrow}>→</Text>
                <View style={styles.durationCell}>
                  <Text style={styles.durationLabel}>Proposed</Text>
                  <Text style={styles.durationValue}>{duration(detail.summary.proposedSeconds)}</Text>
                </View>
              </View>
              <Text style={styles.helper}>
                Proposed reduction: {duration(detail.summary.secondsReduced)}.
                This is a comparison, not a prescription.
              </Text>
            </View>
            <Text style={styles.sectionTitle}>Proposed changes</Text>
            {detail.summary.changes.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.helper}>
                  No individually identifiable exercise or station reductions were saved.
                  This does not prove the proposal is safe.
                </Text>
              </View>
            ) : detail.summary.changes.map((change, index) => (
              <View style={styles.card} key={`${change.stationId}:${change.exerciseId ?? 'station'}:${change.kind}:${index}`}>
                <Text style={styles.cardEyebrow}>{changeHeadline(change).toUpperCase()}</Text>
                <Text style={styles.cardTitle}>{change.label}</Text>
                <Text style={styles.doseText}>
                  {dose(change.before, change.unit)} → {dose(change.after, change.unit)}
                </Text>
              </View>
            ))}
            <Text style={styles.sectionTitle}>Your training context</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {detail.trainingPolicy.track === 'routine_training_review'
                  ? 'Ordinary training does not require clinical paperwork'
                  : detail.trainingPolicy.track === 'restriction_aware_review'
                    ? 'Training restrictions still need to be respected'
                    : detail.trainingPolicy.track === 'rehabilitation_review'
                      ? 'Rehabilitation needs injury-specific safeguards'
                      : 'Training context has not been selected'}
              </Text>
              <Text style={styles.helper}>
                {detail.trainingPolicy.track === 'routine_training_review'
                  ? 'A healthy athlete can review routine training without a clinician sign-off. This specific exercise-revision draft is still not executable.'
                  : 'Earlier reported limitations remain active even if you select general training. A good readiness score never clears a protected movement.'}
              </Text>
              {detail.trainingPolicy.reasons.slice(0, 4).map((reason, index) => (
                <Text style={styles.helper} key={index}>• {reason}</Text>
              ))}
              <Text style={styles.noticeText}>
                Movement-specific restriction matching and exercise approval
                are not enabled in this development build.
              </Text>
              <Pressable accessibilityRole="button"
                accessibilityLabel="Review training context and protected movements"
                style={styles.contextAction}
                onPress={() => router.push('/training-safety-context' as Href)}>
                <Text style={styles.contextActionText}>
                  Review training context and protected movements
                </Text>
              </Pressable>
            </View>
            <Text style={styles.sectionTitle}>What blocks workout approval?</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Not cleared for exercise</Text>
              <Text style={styles.helper}>
                {detail.preflight.blockingGateCount} prerequisites remain blocked,
                unverified, or unavailable. Passing a local check does not mean
                a clinician has approved the exercise.
              </Text>
              {detail.preflight.gates.map(gate => (
                <View key={gate.id} style={styles.gateRow}>
                  <Text style={styles.gateTitle}>{gate.title}</Text>
                  <Text style={styles.gateStatus}>
                    {gate.status === 'local_check_passed' ? 'LOCAL CHECK ONLY'
                      : gate.status === 'blocked' ? 'BLOCKED'
                        : gate.status === 'unverified' ? 'NOT VERIFIED'
                          : 'NOT IMPLEMENTED'}
                  </Text>
                  <Text style={styles.helper}>{gate.detail}</Text>
                </View>
              ))}
              <Text style={styles.noticeText}>
                Side Quest cannot currently save or start this proposed workout.
                Dismissing or restoring the draft only organizes the review inbox.
              </Text>
            </View>
            <Text style={styles.sectionTitle}>Protected-movement review</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Exercise-specific restriction flags</Text>
              <Text style={styles.helper}>
                Training track: {detail.movementRestrictions.track.replaceAll('_', ' ')}.
                Potential conflicts: {detail.movementRestrictions.potentialConflictCount}.
                Individual reviews needed: {detail.movementRestrictions.needsIndividualReviewCount}.
              </Text>
              {detail.movementRestrictions.findings.map((finding, index) => (
                <View style={styles.gateRow}
                  key={finding.stationId + ':' + finding.exerciseId + ':' + index}>
                  <Text style={styles.gateTitle}>{finding.exerciseName}</Text>
                  <Text style={styles.gateStatus}>
                    {finding.status === 'potential_conflict' ? 'POTENTIAL CONFLICT'
                      : finding.status === 'needs_individual_review' ? 'NEEDS REVIEW'
                        : finding.status === 'routine_not_applicable'
                          ? 'NO RESTRICTION RECORDED'
                          : 'NO TAGGED CONFLICT DETECTED'}
                  </Text>
                  <Text style={styles.helper}>{finding.explanation}</Text>
                </View>
              ))}
              <Text style={styles.noticeText}>
                Catalog tags cannot establish movement safety or medical clearance.
                No exercise here can be started or confirmed from this screen.
              </Text>
            </View>
            <Text style={styles.sectionTitle}>Evidence reconciliation</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>What still needs to be resolved</Text>
              <Text style={styles.helper}>
                {detail.reconciliation.unresolvedCount} unresolved checks.
                These are review steps, not workout instructions or medical clearance.
              </Text>
              {detail.reconciliation.tasks.map(task => (
                <View key={task.id} style={styles.gateRow}>
                  <Text style={styles.gateTitle}>{task.title}</Text>
                  <Text style={styles.gateStatus}>
                    {task.kind === 'safety_hold' ? 'SAFETY HOLD'
                      : task.kind === 'feature_unavailable'
                        ? 'NOT AVAILABLE' : 'SOURCE NOT VERIFIED'}
                  </Text>
                  <Text style={styles.helper}>{task.nextStep}</Text>
                </View>
              ))}
              <Text style={styles.noticeText}>
                A local check-in cannot replace an authenticated provider
                source. No task on this list automatically unlocks exercise.
              </Text>
            </View>
            <Text style={styles.sectionTitle}>Report missing safety information</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Raise a concern</Text>
              <Text style={styles.helper}>
                Reports are recorded as unverified observations. They cannot
                remove clinician restrictions or enable a workout.
              </Text>
              <Text style={styles.helper}>
                Restriction reports: {detail.provenance.restriction.eventCount}.
                Training-source reports: {detail.provenance.coverage.eventCount}.
              </Text>
              {detail.provenance.events.length ? (
                <View style={styles.evidenceHistory}>
                  <Text style={styles.gateTitle}>Unverified report history</Text>
                  {detail.provenance.events.slice(-10).map(event => (
                    <View key={event.id} style={styles.gateRow}>
                      <Text style={styles.history}>
                        {event.kind === 'provider_restriction'
                          ? 'Exercise restriction' : 'Training-source coverage'}
                        {' · '}{event.observedAt.slice(0, 10)}
                      </Text>
                      <Text style={styles.helper}>
                        {event.claim === 'reported_present'
                          ? 'Possible restriction reported'
                          : event.claim === 'reported_none'
                            ? 'No restriction claimed — not authenticated'
                            : event.claim === 'partial'
                              ? 'Incomplete history reported'
                              : event.claim === 'claimed_complete'
                                ? 'Complete history claimed — not authenticated'
                                : 'Information unknown'}
                        {' · Unverified'}
                      </Text>
                    </View>
                  ))}
                  {detail.provenance.events.length > 10 ? (
                    <Text style={styles.helper}>
                      Earlier reports remain preserved in the audit journal.
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {concernError ? <Text style={styles.error}>{concernError}</Text> : null}
              <Pressable accessibilityRole="button"
                accessibilityLabel="Report an active strength exercise restriction"
                disabled={savingConcern || savingDisposition}
                style={[styles.concernAction,
                  savingConcern && styles.disabledAction]}
                onPress={() => confirmConcern('provider_restriction')}>
                <Text style={styles.concernText}>
                  {savingConcern ? 'Saving concern…' : 'Flag an exercise restriction'}
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button"
                accessibilityLabel="Report incomplete training or injury history"
                disabled={savingConcern || savingDisposition}
                style={[styles.concernAction,
                  savingConcern && styles.disabledAction]}
                onPress={() => confirmConcern('training_coverage')}>
                <Text style={styles.concernText}>
                  {savingConcern ? 'Saving concern…' : 'Flag missing training history'}
                </Text>
              </Pressable>
              <Text style={styles.helper}>
                Concerns do not verify clinician documents. The draft stays
                unapproved and recorded restrictions remain unresolved.
              </Text>
            </View>
            <Text style={styles.sectionTitle}>Review history</Text>
            <View style={styles.card}>
              <Text style={styles.helper}>
                {detail.review.events.length} recorded review event(s).
                Current state: {detail.review.status === 'dismissed'
                  ? 'Dismissed' : 'Pending review'}.
              </Text>
              {detail.review.events.map(event => (
                <Text key={event.id} style={styles.history}>
                  {event.action === 'dismiss' ? 'Dismissed' : 'Reopened as pending'}
                  {' · '}{event.createdAt.slice(0, 10)}
                </Text>
              ))}
              <Text style={styles.helper}>
                A restored draft is still unapproved. No exercises or scheduled sessions were changed.
              </Text>
              {dispositionError ? (
                <Text style={styles.error}>{dispositionError}</Text>
              ) : null}
              <Pressable accessibilityRole="button"
                accessibilityLabel={detail.review.status === 'dismissed'
                  ? 'Return unapproved draft to review inbox'
                  : 'Dismiss unapproved draft from review inbox'}
                disabled={savingDisposition || savingConcern}
                onPress={() => confirmDisposition(
                  detail.review.status === 'dismissed' ? 'restore' : 'dismiss',
                )}
                style={[styles.dispositionAction,
                  savingDisposition && styles.disabledAction]}>
                <Text style={styles.dispositionText}>
                  {savingDisposition ? 'Saving review status…'
                    : detail.review.status === 'dismissed'
                      ? 'Return draft to inbox' : 'Dismiss draft'}
                </Text>
              </Pressable>
              <Text style={styles.helper}>
                These controls organize saved drafts only. They cannot approve, start,
                or modify a strength session. A stale draft remains stale after restoration.
              </Text>
            </View>
            <Text style={styles.footer}>
              Stored snapshots are not independent verification of current symptoms, readiness, or outside PT restrictions. Exercise-level approval and automatic progression remain disabled.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const colors = {
  background: '#E4EBE3', paper: '#FFFDF8', ink: '#01234D',
  muted: '#536761', border: '#B7CDC0', accent: '#153E2F',
  warning: '#6E2C2C', soft: '#ECF3EA',
};
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 54, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.paper, borderBottomWidth: 1,
    borderBottomColor: colors.border, paddingHorizontal: 18, gap: 8,
  },
  back: { paddingVertical: 10, paddingRight: 8 },
  backText: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  headerText: { color: colors.ink, fontSize: 16, fontWeight: '800', flexShrink: 1 },
  content: { padding: 20, gap: 14, paddingBottom: 64 },
  eyebrow: { fontSize: 11, letterSpacing: 1.1, color: colors.accent, fontWeight: '800' },
  title: { color: colors.ink, fontWeight: '800', fontSize: 28 },
  notice: { padding: 16, borderRadius: 15, backgroundColor: colors.soft, gap: 6 },
  noticeTitle: { fontSize: 16, fontWeight: '800', color: colors.warning },
  noticeText: { fontSize: 13, lineHeight: 20, color: colors.ink },
  card: { padding: 17, borderRadius: 16, backgroundColor: colors.paper, gap: 9,
    borderWidth: 1, borderColor: colors.border },
  cardEyebrow: { fontSize: 10, letterSpacing: 1, fontWeight: '800', color: colors.accent },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.ink },
  helper: { fontSize: 13, lineHeight: 20, color: colors.muted },
  error: { fontSize: 14, lineHeight: 21, color: colors.warning, fontWeight: '700' },
  sectionTitle: { fontSize: 19, color: colors.ink, fontWeight: '800' },
  durationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  durationCell: { flex: 1, backgroundColor: colors.soft, padding: 13, borderRadius: 12 },
  durationLabel: { fontSize: 11, color: colors.muted, fontWeight: '700' },
  durationValue: { color: colors.ink, fontSize: 21, fontWeight: '800' },
  durationArrow: { paddingHorizontal: 10, fontSize: 20, color: colors.accent },
  doseText: { fontSize: 15, color: colors.ink, fontWeight: '800' },
  history: { fontSize: 13, color: colors.ink, lineHeight: 20 },
  evidenceHistory: { gap: 6, paddingVertical: 5 },
  contextAction: { borderWidth: 1, borderColor: colors.accent,
    borderRadius: 12, minHeight: 48, justifyContent: 'center',
    alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  contextActionText: { fontSize: 13, fontWeight: '800', color: colors.accent },
  gateRow: { gap: 4, paddingVertical: 9, borderTopWidth: 1,
    borderTopColor: colors.border },
  gateTitle: { fontSize: 14, color: colors.ink, fontWeight: '800' },
  gateStatus: { fontSize: 11, color: colors.warning, letterSpacing: 0.6,
    fontWeight: '800' },
  center: { padding: 32, gap: 12, alignItems: 'center' },
  footer: { fontSize: 12, lineHeight: 19, color: colors.muted },
  dispositionAction: { borderRadius: 12, minHeight: 48,
    backgroundColor: colors.accent, justifyContent: 'center',
    alignItems: 'center', paddingHorizontal: 15, paddingVertical: 11 },
  dispositionText: { fontSize: 14, fontWeight: '800', color: colors.paper },
  disabledAction: { opacity: 0.55 },
  concernAction: { borderWidth: 1, borderColor: colors.warning,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  concernText: { fontSize: 13, fontWeight: '800', color: colors.warning },
});
