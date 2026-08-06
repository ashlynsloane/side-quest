import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { V23Card, V23Screen, V23SectionHeader } from '@/components/v23-ui';
import { V31_VISUAL_QA_AREAS, V31_VISUAL_QA_CHECKS, type VisualQaArea } from '@/data/v31-visual-qa';
import { useTheme } from '@/state/theme-context';

export default function VisualQaScreen() {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [completed, setCompleted] = useState<ReadonlySet<string>>(() => new Set());
  const total = V31_VISUAL_QA_CHECKS.length;
  const completeCount = completed.size;

  const toggle = (id: string) => setCompleted((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return <V23Screen>
    <View style={styles.intro}>
      <Text style={styles.eyebrow}>V31.7 RELEASE GATE</Text>
      <Text style={styles.title}>Visual QA</Text>
      <Text style={styles.body}>Review the implemented product experience on a physical device. Check items only after observing the named surfaces; this checklist does not alter training data.</Text>
    </View>

    <V23Card style={styles.statusCard}>
      <View style={styles.statusRow}>
        <View style={styles.statusCopy}>
          <Text style={styles.cardLabel}>CURRENT REVIEW</Text>
          <Text style={styles.statusTitle}>{completeCount} of {total} checks reviewed</Text>
        </View>
        <Text style={styles.statusMark}>{completeCount === total ? 'Ready' : 'In review'}</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.round((completeCount / total) * 100)}%` }]} /></View>
      <Text style={styles.body}>{completeCount === total ? 'All visual checks are marked complete. Run the repository validator and typecheck before creating the next TestFlight build.' : 'Incomplete checks remain local to this screen for the current app session.'}</Text>
    </V23Card>

    {V31_VISUAL_QA_AREAS.map((area: VisualQaArea) => {
      const checks = V31_VISUAL_QA_CHECKS.filter((check) => check.area === area);
      return <View key={area}>
        <V23SectionHeader>{area}</V23SectionHeader>
        <V23Card style={styles.checkCard}>
          {checks.map((check, index) => {
            const isComplete = completed.has(check.id);
            return <Pressable key={check.id} onPress={() => toggle(check.id)} style={({ pressed }) => [styles.checkRow, index > 0 && styles.divider, pressed && styles.pressed]}>
              <View style={[styles.checkbox, isComplete && styles.checkboxComplete]}><Text style={styles.checkboxText}>{isComplete ? '✓' : ''}</Text></View>
              <View style={styles.checkCopy}>
                <Text style={styles.checkTitle}>{check.title}</Text>
                <Text style={styles.checkCriterion}>{check.criterion}</Text>
                <Text style={styles.surfaceLabel}>{check.surfaces}</Text>
              </View>
            </Pressable>;
          })}
        </V23Card>
      </View>;
    })}

    <V23Card style={styles.noteCard}>
      <Text style={styles.noteTitle}>Release boundary</Text>
      <Text style={styles.body}>V31.7H adds a manual visual-review surface and a static release contract. It does not claim that device QA has passed, persist checkmarks, modify production logic, or create a TestFlight build.</Text>
    </V23Card>
  </V23Screen>;
}

function makeStyles(tokens: ReturnType<typeof useTheme>['tokens']) { return StyleSheet.create({
  intro: { gap: 6, marginBottom: 4 },
  eyebrow: { color: tokens.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: tokens.text, fontSize: 28, lineHeight: 33, fontWeight: '900' },
  body: { color: tokens.textMuted, fontSize: 14, lineHeight: 20 },
  statusCard: { gap: 11 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusCopy: { flex: 1, gap: 3 },
  cardLabel: { color: tokens.accent, fontSize: 10.5, fontWeight: '900', letterSpacing: 1 },
  statusTitle: { color: tokens.text, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  statusMark: { color: tokens.accent, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  track: { height: 7, borderRadius: 4, backgroundColor: tokens.surfaceMuted, overflow: 'hidden' },
  fill: { height: 7, borderRadius: 4, backgroundColor: tokens.accent },
  checkCard: { paddingVertical: 2, gap: 0 },
  checkRow: { minHeight: 92, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border },
  checkbox: { width: 25, height: 25, marginTop: 1, borderRadius: 8, borderWidth: 1.5, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.surface },
  checkboxComplete: { borderColor: tokens.accent, backgroundColor: tokens.accent },
  checkboxText: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '900' },
  checkCopy: { flex: 1, gap: 4 },
  checkTitle: { color: tokens.text, fontSize: 15, lineHeight: 20, fontWeight: '800' },
  checkCriterion: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19 },
  surfaceLabel: { color: tokens.accent, fontSize: 11.5, lineHeight: 16, fontWeight: '700' },
  noteCard: { gap: 6 },
  noteTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  pressed: { opacity: 0.72 },
}); }
