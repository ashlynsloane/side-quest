import { localCalendarDate, type CurrentStrengthReviewEvidence,
  type UnapprovedStrengthReviewInboxItem } from '@circuit/planner';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listUnapprovedStrengthReviewItems } from '@/services/database';
import { useAuth } from '@/state/auth-context';

/**
 * Athlete-owned read-only preview history. We deliberately pass UNKNOWN
 * independent evidence rather than inventing current PT/provider clearance.
 * No action here creates, accepts, or executes a workout.
 */
export default function StrengthReviewInboxScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const athleteId = user?.id;
  const [items, setItems] = useState<UnapprovedStrengthReviewInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    setItems([]);
    setError(null);
    if (!athleteId) {
      setLoading(false);
      setError('An athlete profile is required to view saved proposals.');
      return () => { live = false; };
    }
    setLoading(true);
    const evidence: CurrentStrengthReviewEvidence = {
      athleteId,
      todayLocalDate: localCalendarDate(new Date()),
      symptoms: 'unknown',
      readiness: 'unknown',
      providerRestrictions: 'unknown',
      sourceCoverage: 'unknown',
      exerciseRestrictionsReviewed: false,
    };
    void listUnapprovedStrengthReviewItems(athleteId, evidence)
      .then(result => {
        if (live) setItems(result);
      })
      .catch(() => {
        if (live) {
          setItems([]);
          setError('The saved review history could not be verified. No proposals were loaded.');
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => { live = false; };
  }, [athleteId]));

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}
          style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>
        <Text style={styles.headerText}>Strength review drafts</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>SAVED PROPOSALS · READ ONLY</Text>
        <Text style={styles.title}>Review what would change.</Text>
        <Text style={styles.description}>
          These are historical exercise-revision drafts, not training instructions.
          Current symptoms, readiness, and external provider restrictions have not been independently verified here.
        </Text>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Approval and workout start are disabled.</Text>
          <Text style={styles.noticeText}>
            Viewing a draft does not modify the training plan or exercise dose.
          </Text>
        </View>
        {loading ? (
          <View style={styles.center}><ActivityIndicator /><Text style={styles.helper}>Checking saved review history…</Text></View>
        ) : error ? (
          <View style={styles.card}><Text style={styles.error}>{error}</Text></View>
        ) : items.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>No saved exercise-revision drafts</Text>
            <Text style={styles.helper}>Your existing workouts are not affected.</Text>
          </View>
        ) : items.map(item => (
          <Pressable accessibilityRole="button" key={item.previewId}
            accessibilityLabel={`Inspect unapproved strength draft ${item.previewId}`}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            onPress={() => router.push({
              pathname: '/strength-review-detail',
              params: { previewId: item.previewId },
            } as Href)}>
            <View style={styles.cardTop}>
              <Text style={styles.cardEyebrow}>
                {item.status === 'dismissed' ? 'DISMISSED DRAFT' : 'VERIFICATION REQUIRED'}
              </Text>
              <Text style={styles.arrow}>›</Text>
            </View>
            <Text style={styles.cardTitle}>Session review · {item.proposedMinutes} min ceiling</Text>
            <Text style={styles.helper}>
              Saved {item.createdAt.slice(0, 10)} · Draft {item.previewId}
            </Text>
            {item.stale ? (
              <Text style={styles.hold}>Current evidence must be refreshed before any further review.</Text>
            ) : null}
            <Text style={styles.helper}>Inspect exact before-and-after exercise changes.</Text>
          </Pressable>
        ))}
        <Text style={styles.footer}>
          A stored preview is never an approved workout. Stale or unavailable evidence means the app must stop, not infer clearance.
        </Text>
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
  description: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  notice: { padding: 16, borderRadius: 15, backgroundColor: colors.soft, gap: 6 },
  noticeTitle: { fontSize: 15, fontWeight: '800', color: colors.warning },
  noticeText: { fontSize: 13, lineHeight: 20, color: colors.ink },
  card: { padding: 17, borderRadius: 16, backgroundColor: colors.paper, gap: 8,
    borderWidth: 1, borderColor: colors.border },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardEyebrow: { fontSize: 10, letterSpacing: 1, fontWeight: '800', color: colors.warning },
  cardTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  arrow: { fontSize: 23, color: colors.accent },
  helper: { fontSize: 13, lineHeight: 19, color: colors.muted },
  hold: { fontSize: 13, lineHeight: 19, color: colors.warning, fontWeight: '700' },
  error: { fontSize: 14, lineHeight: 21, color: colors.warning, fontWeight: '700' },
  center: { alignItems: 'center', gap: 12, padding: 32 },
  pressed: { opacity: 0.75 },
  footer: { fontSize: 12, lineHeight: 18, color: colors.muted },
});
