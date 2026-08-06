import type { Exercise, ExerciseSwapReason } from '@circuit/domain';
import type { ExerciseSwapCandidate } from '@circuit/generator';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const OPTIONS: Array<{ reason: ExerciseSwapReason; title: string; detail: string }> = [
  { reason: 'unfamiliar', title: 'I do not know this exercise', detail: 'Show familiar, beginner-friendly options that still fit the station.' },
  { reason: 'equipment_unavailable', title: 'Equipment is unavailable', detail: 'Use the selected equipment profile and avoid unavailable implements.' },
  { reason: 'too_hard', title: 'Make this easier', detail: 'Show a lower dose and related regressions before unrelated exercises.' },
  { reason: 'too_easy', title: 'Make this harder', detail: 'Show a higher dose or a genuine progression from the same movement ladder.' },
  { reason: 'dislike', title: 'I dislike this exercise', detail: 'Replace it and lower its ranking in future workouts.' },
  { reason: 'variety', title: 'Just give me another option', detail: 'Preserve the station purpose while changing the movement.' },
];

export function ExerciseSwapModal({
  exercise,
  visible,
  busy,
  onClose,
  onLoadCandidates,
  onChooseCandidate,
  onPain,
}: {
  exercise: Exercise | null;
  visible: boolean;
  busy?: boolean;
  onClose: () => void;
  onLoadCandidates: (reason: ExerciseSwapReason) => Promise<ExerciseSwapCandidate[]>;
  onChooseCandidate: (reason: ExerciseSwapReason, candidateId: string) => void;
  onPain?: () => void;
}) {
  const [reason, setReason] = useState<ExerciseSwapReason | null>(null);
  const [candidates, setCandidates] = useState<ExerciseSwapCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setReason(null);
      setCandidates([]);
      setLoading(false);
      setError(null);
    }
  }, [visible, exercise?.id]);

  if (!exercise) return null;

  async function chooseReason(nextReason: ExerciseSwapReason) {
    setReason(nextReason);
    setLoading(true);
    setError(null);
    try {
      const next = await onLoadCandidates(nextReason);
      setCandidates(next);
      if (!next.length) setError('No compatible options passed the full-workout fatigue, equipment, and balance checks.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          {reason ? (
            <Pressable accessibilityRole="button" onPress={() => { setReason(null); setCandidates([]); setError(null); }} style={styles.backButton}>
              <Text style={styles.backText}>‹ Reasons</Text>
            </Pressable>
          ) : null}
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>SMART SWAP</Text>
            <Text style={styles.title}>{exercise.name}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>Cancel</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {!reason ? (
            <>
              <Text style={styles.helper}>
                First tell Side Quest why this exercise does not fit. You will then choose from up to five replacements instead of silently cycling between two movements.
              </Text>
              {OPTIONS.map((option) => (
                <Pressable
                  key={option.reason}
                  accessibilityRole="button"
                  disabled={busy || loading}
                  onPress={() => void chooseReason(option.reason)}
                  style={[styles.option, (busy || loading) && styles.disabled]}
                >
                  <Text style={styles.optionTitle}>{option.title}</Text>
                  <Text style={styles.optionDetail}>{option.detail}</Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
              {onPain ? (
                <Pressable accessibilityRole="button" onPress={onPain} style={styles.painOption}>
                  <Text style={styles.painTitle}>Pain or unusual tightness</Text>
                  <Text style={styles.optionDetail}>Open Today’s Check-In so the entire session can adapt.</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryEyebrow}>CHOOSE THE ACTUAL REPLACEMENT</Text>
                <Text style={styles.summaryTitle}>{reasonLabel(reason)}</Text>
                <Text style={styles.helper}>Every option below has already been checked against the other exercises in this workout.</Text>
              </View>
              {loading ? <Text style={styles.loading}>Building compatible options…</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {candidates.map((candidate, index) => (
                <Pressable
                  key={candidate.id}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => onChooseCandidate(reason, candidate.id)}
                  style={[styles.candidate, busy && styles.disabled]}
                >
                  <View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View>
                  <View style={styles.candidateCopy}>
                    <View style={styles.candidateTop}>
                      <Text style={styles.candidateTitle}>{candidate.exercise.name}</Text>
                      <Text style={styles.kind}>{kindLabel(candidate.kind)}</Text>
                    </View>
                    <Text style={styles.prescription}>{formatTarget(candidate.prescription.target, candidate.prescription.unit)}</Text>
                    <Text style={styles.optionDetail}>{candidate.rationale}</Text>
                    {candidate.prescription.adaptationNote ? <Text style={styles.note}>{candidate.prescription.adaptationNote}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function formatTarget(target: number, unit: 'seconds' | 'total' | 'per_side') {
  if (unit === 'seconds') return `${target} seconds`;
  return unit === 'per_side' ? `${target} per side` : `${target} reps`;
}
function kindLabel(kind: ExerciseSwapCandidate['kind']) {
  if (kind === 'dose_adjustment') return 'SAME EXERCISE';
  if (kind === 'same_ladder') return 'SAME LADDER';
  return 'SAME PURPOSE';
}
function reasonLabel(reason: ExerciseSwapReason) {
  return OPTIONS.find((item) => item.reason === reason)?.title ?? 'Choose another option';
}

const colors = {
  background: '#F4F6F3', card: '#FFFFFF', ink: '#17211B', muted: '#627067', border: '#D9E0DA',
  accent: '#173A2B', accentSoft: '#DDE9E1', warm: '#F3EDE2', warmBorder: '#D7C9AF', danger: '#9B3D35',
};
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card, gap: 8 },
  headerCopy: { flex: 1, gap: 3 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: colors.ink, fontSize: 21, fontWeight: '800' },
  backButton: { paddingVertical: 8, paddingRight: 4 }, backText: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  closeButton: { paddingHorizontal: 8, paddingVertical: 8 }, closeText: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  content: { padding: 18, paddingBottom: 48, gap: 12 },
  helper: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  option: { position: 'relative', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 17, padding: 16, paddingRight: 38, gap: 4 },
  optionTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' }, optionDetail: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  chevron: { position: 'absolute', right: 16, top: 24, fontSize: 26, color: colors.accent },
  painOption: { backgroundColor: colors.warm, borderWidth: 1, borderColor: colors.warmBorder, borderRadius: 17, padding: 16, gap: 4, marginTop: 4 },
  painTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' }, disabled: { opacity: 0.5 },
  summaryCard: { backgroundColor: colors.accentSoft, borderRadius: 17, padding: 15, gap: 5 },
  summaryEyebrow: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  summaryTitle: { color: colors.ink, fontSize: 19, fontWeight: '900' },
  loading: { color: colors.accent, fontSize: 14, fontWeight: '800', textAlign: 'center', padding: 12 },
  error: { color: colors.danger, fontSize: 13, fontWeight: '800', lineHeight: 19, backgroundColor: '#F7E9E7', padding: 12, borderRadius: 12 },
  candidate: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14, flexDirection: 'row', gap: 11 },
  rank: { width: 31, height: 31, borderRadius: 16, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: colors.accent, fontWeight: '900' }, candidateCopy: { flex: 1, gap: 5 },
  candidateTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, flexWrap: 'wrap' },
  candidateTitle: { color: colors.ink, fontSize: 17, fontWeight: '900', flexShrink: 1 },
  kind: { color: colors.accent, backgroundColor: colors.accentSoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4, fontSize: 9, fontWeight: '900' },
  prescription: { color: colors.accent, fontSize: 13, fontWeight: '900' },
  note: { color: colors.ink, fontSize: 12, lineHeight: 18, backgroundColor: colors.accentSoft, borderRadius: 10, padding: 9 },
});
