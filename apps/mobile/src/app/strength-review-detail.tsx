import {
  localCalendarDate,
  type StrengthReviewDoseChange,
  type UnapprovedStrengthReviewDetail,
  type CurrentStrengthReviewEvidence,
} from '@circuit/planner';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getUnapprovedStrengthReviewDetail, setUnapprovedStrengthReviewDisposition,
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
  currentAthlete.current = athleteId;
  const [detail, setDetail] = useState<UnapprovedStrengthReviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDisposition, setSavingDisposition] = useState(false);
  const [dispositionError, setDispositionError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    setDetail(null);
    setError(null);
    setDispositionError(null);
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

  const changeDisposition = async (action: 'dismiss' | 'restore') => {
    if (savingDisposition || !athleteId || !detail
      || typeof previewId !== 'string'
      || currentAthlete.current !== athleteId) return;
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
      if (currentAthlete.current === athleteId) setDetail(updated);
    } catch {
      if (currentAthlete.current === athleteId) {
        setDispositionError(
          'The draft update could not be verified. Reopen this screen to refresh before trying again.',
        );
      }
    } finally {
      if (currentAthlete.current === athleteId) setSavingDisposition(false);
    }
  };

  const confirmDisposition = (action: 'dismiss' | 'restore') => {
    if (!detail || savingDisposition || !athleteId) return;
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
                disabled={savingDisposition}
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
  center: { padding: 32, gap: 12, alignItems: 'center' },
  footer: { fontSize: 12, lineHeight: 19, color: colors.muted },
  dispositionAction: { borderRadius: 12, minHeight: 48,
    backgroundColor: colors.accent, justifyContent: 'center',
    alignItems: 'center', paddingHorizontal: 15, paddingVertical: 11 },
  dispositionText: { fontSize: 14, fontWeight: '800', color: colors.paper },
  disabledAction: { opacity: 0.55 },
});
