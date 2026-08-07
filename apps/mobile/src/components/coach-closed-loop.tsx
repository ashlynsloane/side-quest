import type { CoachDecisionExplanation } from '@circuit/planner/coach-closed-loop';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CoachClosedLoopSummary, CoachFollowUpResponse } from '@/services/coach-closed-loop-state';
import { useTheme } from '@/state/theme-context';

export function CoachDecisionExplanationPanel({ explanation }: { explanation?: CoachDecisionExplanation }) {
  const { tokens } = useTheme();
  if (!explanation) return null;
  const styles = makeStyles(tokens);
  return (
    <View style={[styles.explanation, explanation.tier === 'protection' && styles.protection]}>
      <Text style={styles.eyebrow}>{explanation.tier === 'protection' ? 'WHY SIDE QUEST IS PUSHING BACK' : 'WHY SIDE QUEST RECOMMENDS THIS'}</Text>
      <Text style={styles.headline}>{explanation.headline}</Text>
      <Reason label="WHAT CHANGED" text={explanation.whatChanged} styles={styles} />
      <Reason label="WHY THIS" text={explanation.whyThis} styles={styles} />
      <Reason label="WHAT IT PROTECTS" text={explanation.protecting} styles={styles} />
      <Reason label="WHAT WOULD CHANGE THE CALL" text={explanation.whatWouldChangeTheCall} styles={styles} />
      {explanation.learnedContext ? <Reason label="YOUR HISTORY" text={explanation.learnedContext} styles={styles} /> : null}
    </View>
  );
}

export function CoachClosedLoopPanel({
  summary,
  busy,
  onOutcome,
  onUndo,
}: {
  summary: CoachClosedLoopSummary | null;
  busy?: boolean;
  onOutcome: (interventionId: string, response: CoachFollowUpResponse) => void;
  onUndo: () => void;
}) {
  const { tokens } = useTheme();
  if (!summary) return null;
  const styles = makeStyles(tokens);
  const followUp = summary.dueFollowUp;
  const undoable = summary.latestUndoable;
  const cue = summary.proactiveCue;
  if (!followUp && !undoable && !cue) return null;
  const promptKind = followUp?.followUp.promptKind;
  const symptomFollowUp = promptKind === 'safety_check' || promptKind === 'symptom_check';

  return (
    <View style={styles.stack}>
      {followUp ? (
        <View style={[styles.card, followUp.followUp.priority === 'high' && styles.protection]}>
          <Text style={styles.eyebrow}>{followUp.followUp.priority === 'high' ? 'CHECK THE RESPONSE' : 'CLOSE THE LOOP'}</Text>
          <Text style={styles.headline}>{followUp.followUp.question}</Text>
          <Text style={styles.body}>Your answer becomes one structured outcome for this exact kind of adjustment. Side Quest will not generalize from a single result.</Text>
          <View style={styles.actions}>
            <ResponseButton label={symptomFollowUp ? 'Better' : 'Worked well'} disabled={busy} onPress={() => onOutcome(followUp.id, 'better')} styles={styles} />
            <ResponseButton label={symptomFollowUp ? 'Same' : 'Neutral'} disabled={busy} onPress={() => onOutcome(followUp.id, 'same')} styles={styles} />
            <ResponseButton label={symptomFollowUp ? 'Worse' : 'Didn’t work'} disabled={busy} onPress={() => onOutcome(followUp.id, 'worse')} styles={styles} />
            <ResponseButton label="Didn't do it" disabled={busy} onPress={() => onOutcome(followUp.id, 'not_completed')} styles={styles} />
          </View>
        </View>
      ) : null}

      {cue ? (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>PERSONAL RESPONSE PATTERN</Text>
          <Text style={styles.headline}>{cue.headline}</Text>
          <Text style={styles.body}>{cue.body}</Text>
          <Text style={styles.evidence}>{cue.evidence} · never auto-applied</Text>
        </View>
      ) : null}

      {undoable ? (
        <View style={styles.undoRow}>
          <View style={styles.undoCopy}>
            <Text style={styles.undoTitle}>Last coach change: {undoable.optionTitle}</Text>
            <Text style={styles.undoBody}>Undo restores only this coach intervention. Later unrelated edits are preserved.</Text>
          </View>
          <Pressable disabled={busy} onPress={onUndo} style={({ pressed }) => [styles.undoButton, pressed && styles.pressed, busy && styles.disabled]}>
            <Text style={styles.undoButtonText}>Undo</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Reason({ label, text, styles }: { label: string; text: string; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.reason}><Text style={styles.reasonLabel}>{label}</Text><Text style={styles.body}>{text}</Text></View>;
}

function ResponseButton({ label, disabled, onPress, styles }: { label: string; disabled?: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.responseButton, pressed && styles.pressed, disabled && styles.disabled]}>
      <Text style={styles.responseText}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(tokens: ReturnType<typeof useTheme>['tokens']) {
  return StyleSheet.create({
    stack: { gap: 12 },
    card: { borderWidth: 1, borderColor: tokens.border, borderRadius: 18, backgroundColor: tokens.surface, padding: 16, gap: 8 },
    protection: { borderColor: tokens.danger },
    explanation: { borderWidth: 1, borderColor: tokens.border, borderRadius: 16, backgroundColor: tokens.surfaceMuted, padding: 14, gap: 10, marginTop: 12 },
    eyebrow: { color: tokens.accent, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1.05 },
    headline: { color: tokens.text, fontSize: 17, lineHeight: 22, fontWeight: '800' },
    body: { color: tokens.textMuted, fontSize: 13, lineHeight: 19 },
    reason: { gap: 3 },
    reasonLabel: { color: tokens.text, fontSize: 10, lineHeight: 13, fontWeight: '800', letterSpacing: 0.7 },
    evidence: { color: tokens.textMuted, fontSize: 11, lineHeight: 15, fontWeight: '700' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    responseButton: { minHeight: 38, borderRadius: 12, borderWidth: 1, borderColor: tokens.border, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.surface },
    responseText: { color: tokens.text, fontSize: 12, fontWeight: '800' },
    undoRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
    undoCopy: { flex: 1, gap: 2 },
    undoTitle: { color: tokens.text, fontSize: 13, fontWeight: '800' },
    undoBody: { color: tokens.textMuted, fontSize: 11, lineHeight: 16 },
    undoButton: { borderWidth: 1, borderColor: tokens.border, borderRadius: 12, paddingHorizontal: 14, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
    undoButtonText: { color: tokens.text, fontSize: 12, fontWeight: '800' },
    pressed: { opacity: 0.7 },
    disabled: { opacity: 0.45 },
  });
}
