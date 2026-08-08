import type { Exercise, ExerciseSwapReason } from '@circuit/domain';
import type { ExerciseSwapCandidate } from '@circuit/generator';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { V23Icon, type V23IconName } from '@/components/v23-ui';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

const OPTIONS: Array<{ reason: ExerciseSwapReason; title: string; detail: string; icon: V23IconName }> = [
  { reason: 'unfamiliar', title: 'I do not know this exercise', detail: 'Prioritize familiar, approachable options that still fit the station.', icon: 'info' },
  { reason: 'equipment_unavailable', title: 'Equipment is unavailable', detail: 'Respect the workout equipment profile and remove unavailable implements.', icon: 'equipment' },
  { reason: 'too_hard', title: 'Make this easier', detail: 'Try a lower dose or a related regression before changing the movement entirely.', icon: 'adjust' },
  { reason: 'too_easy', title: 'Make this harder', detail: 'Try a higher dose or a genuine progression in the same movement ladder first.', icon: 'train' },
  { reason: 'dislike', title: 'I dislike this exercise', detail: 'Replace it and lower its ranking in future generated workouts.', icon: 'heart' },
  { reason: 'variety', title: 'Just give me another option', detail: 'Keep the station purpose while changing the movement.', icon: 'swap' },
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
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
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
      if (!next.length) setError('No compatible replacement passed the workout’s equipment, fatigue, and balance checks.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }

  function resetReason() {
    setReason(null);
    setCandidates([]);
    setError(null);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={reason ? 'Back to swap reasons' : 'Close exercise swap'}
            onPress={reason ? resetReason : onClose}
            style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
          >
            <V23Icon name="back" color={tokens.text} size={18} />
            <Text style={styles.headerActionText}>{reason ? 'Back' : 'Close'}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Swap exercise</Text>
          <View style={styles.headerAction} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {!reason ? (
            <>
              <View style={styles.hero}>
                <View style={styles.heroIcon}><V23Icon name="swap" color={tokens.accent} size={20} /></View>
                <View style={styles.heroCopy}>
                  <Text style={styles.eyebrow}>CURRENT EXERCISE</Text>
                  <Text style={styles.title}>{exercise.name}</Text>
                  <Text style={styles.helper}>Tell Side Quest why this movement does not fit. That reason changes which replacements are considered first.</Text>
                </View>
              </View>

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionEyebrow}>WHY ARE YOU SWAPPING?</Text>
                <Text style={styles.sectionTitle}>Keep the reason attached to the decision.</Text>
              </View>

              <View style={styles.reasonList}>
                {OPTIONS.map((option) => (
                  <Pressable
                    key={option.reason}
                    accessibilityRole="button"
                    disabled={busy || loading}
                    onPress={() => void chooseReason(option.reason)}
                    style={({ pressed }) => [styles.reasonRow, (busy || loading) && styles.disabled, pressed && styles.pressed]}
                  >
                    <View style={styles.reasonIcon}><V23Icon name={option.icon} color={tokens.accent} size={17} /></View>
                    <View style={styles.reasonCopy}>
                      <Text style={styles.reasonTitle}>{option.title}</Text>
                      <Text style={styles.reasonDetail}>{option.detail}</Text>
                    </View>
                    <V23Icon name="chevron" color={tokens.textMuted} size={15} />
                  </Pressable>
                ))}
              </View>

              {onPain ? (
                <Pressable accessibilityRole="button" onPress={onPain} style={({ pressed }) => [styles.painRow, pressed && styles.pressed]}>
                  <View style={styles.painIcon}><V23Icon name="heart" color={tokens.danger} size={18} /></View>
                  <View style={styles.reasonCopy}>
                    <Text style={styles.painTitle}>Pain or unusual tightness</Text>
                    <Text style={styles.reasonDetail}>Do not solve this as a normal exercise preference. Open Training Protection so the whole session can adapt.</Text>
                  </View>
                  <V23Icon name="chevron" color={tokens.textMuted} size={15} />
                </Pressable>
              ) : null}
            </>
          ) : (
            <>
              <View style={styles.selectionHero}>
                <Text style={styles.eyebrow}>SMART SWAP</Text>
                <Text style={styles.selectionTitle}>{reasonLabel(reason)}</Text>
                <Text style={styles.helper}>Every option below has already been checked against the other exercises in this workout.</Text>
              </View>

              <View style={styles.currentStrip}>
                <View style={styles.currentIcon}><V23Icon name="train" color={tokens.accent} size={17} /></View>
                <View style={styles.currentCopy}>
                  <Text style={styles.currentLabel}>REPLACING</Text>
                  <Text style={styles.currentName}>{exercise.name}</Text>
                </View>
              </View>

              {loading ? <View style={styles.loadingCard}><Text style={styles.loadingTitle}>Building compatible options…</Text><Text style={styles.loadingBody}>Equipment, workout balance, and the selected reason stay in force.</Text></View> : null}
              {error ? <View style={styles.errorCard}><V23Icon name="info" color={tokens.danger} size={16} /><Text style={styles.error}>{error}</Text></View> : null}

              <View style={styles.candidateList}>
                {candidates.map((candidate, index) => (
                  <Pressable
                    key={candidate.id}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => onChooseCandidate(reason, candidate.id)}
                    style={({ pressed }) => [styles.candidate, busy && styles.disabled, pressed && styles.pressed]}
                  >
                    <View style={styles.candidateTop}>
                      <View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View>
                      <View style={styles.candidateCopy}>
                        <View style={styles.candidateTitleRow}>
                          <Text style={styles.candidateTitle}>{candidate.exercise.name}</Text>
                          <View style={styles.kindPill}><Text style={styles.kind}>{kindLabel(candidate.kind)}</Text></View>
                        </View>
                        <Text style={styles.prescription}>{formatTarget(candidate.prescription.target, candidate.prescription.unit)}</Text>
                      </View>
                      <V23Icon name="chevron" color={tokens.textMuted} size={15} />
                    </View>
                    <Text style={styles.candidateRationale}>{candidate.rationale}</Text>
                    {candidate.prescription.adaptationNote ? <View style={styles.note}><Text style={styles.noteLabel}>WHAT CHANGES</Text><Text style={styles.noteText}>{candidate.prescription.adaptationNote}</Text></View> : null}
                  </Pressable>
                ))}
              </View>
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

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: tokens.canvas },
    header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border, backgroundColor: tokens.surface },
    headerAction: { width: 82, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 3 },
    headerActionText: { color: tokens.text, fontSize: 13, lineHeight: 17, fontWeight: '800' },
    headerTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
    content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 44, gap: 14 },
    hero: { borderRadius: 20, backgroundColor: tokens.surfaceMuted, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
    heroIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
    heroCopy: { flex: 1, minWidth: 0, gap: 3 },
    eyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
    title: { color: tokens.text, fontSize: 23, lineHeight: 28, fontWeight: '900', letterSpacing: -0.35 },
    helper: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18 },
    sectionHeading: { gap: 2, paddingHorizontal: 2 },
    sectionEyebrow: { color: tokens.accent, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.85 },
    sectionTitle: { color: tokens.text, fontSize: 17, lineHeight: 22, fontWeight: '900' },
    reasonList: { borderRadius: 19, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, overflow: 'hidden' },
    reasonRow: { minHeight: 69, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    reasonIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    reasonCopy: { flex: 1, minWidth: 0, gap: 2 },
    reasonTitle: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
    reasonDetail: { color: tokens.textMuted, fontSize: 10.8, lineHeight: 15 },
    painRow: { minHeight: 76, borderRadius: 18, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surfaceMuted, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
    painIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
    painTitle: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },

    selectionHero: { gap: 4, paddingHorizontal: 2 },
    selectionTitle: { color: tokens.text, fontSize: 24, lineHeight: 29, fontWeight: '900', letterSpacing: -0.35 },
    currentStrip: { borderRadius: 16, backgroundColor: tokens.surfaceMuted, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 9 },
    currentIcon: { width: 35, height: 35, borderRadius: 12, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
    currentCopy: { flex: 1, minWidth: 0, gap: 1 },
    currentLabel: { color: tokens.textMuted, fontSize: 8, lineHeight: 10, fontWeight: '900', letterSpacing: 0.7 },
    currentName: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
    loadingCard: { borderRadius: 16, backgroundColor: tokens.accentSoft, padding: 13, gap: 3 },
    loadingTitle: { color: tokens.text, fontSize: 13, lineHeight: 17, fontWeight: '900' },
    loadingBody: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 15 },
    errorCard: { borderRadius: 14, borderWidth: 1, borderColor: tokens.danger, backgroundColor: tokens.surfaceMuted, padding: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
    error: { flex: 1, color: tokens.danger, fontSize: 11.5, lineHeight: 16, fontWeight: '700' },
    candidateList: { gap: 9 },
    candidate: { borderRadius: 18, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 13, gap: 9 },
    candidateTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    rank: { width: 31, height: 31, borderRadius: 16, backgroundColor: tokens.header, alignItems: 'center', justifyContent: 'center' },
    rankText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
    candidateCopy: { flex: 1, minWidth: 0, gap: 2 },
    candidateTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    candidateTitle: { color: tokens.text, fontSize: 14.5, lineHeight: 19, fontWeight: '900', flexShrink: 1 },
    kindPill: { borderRadius: 999, backgroundColor: tokens.accentSoft, paddingHorizontal: 7, paddingVertical: 4 },
    kind: { color: tokens.accent, fontSize: 8, lineHeight: 10, fontWeight: '900', letterSpacing: 0.5 },
    prescription: { color: tokens.accent, fontSize: 11.5, lineHeight: 15, fontWeight: '900' },
    candidateRationale: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
    note: { borderRadius: 12, backgroundColor: tokens.surfaceMuted, padding: 9, gap: 2 },
    noteLabel: { color: tokens.accent, fontSize: 8, lineHeight: 10, fontWeight: '900', letterSpacing: 0.7 },
    noteText: { color: tokens.text, fontSize: 10.5, lineHeight: 15 },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.72 },
  });
}
