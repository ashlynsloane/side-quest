import type { TrainingAdaptation, WorkoutRecommendationExplanation } from '@circuit/domain';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { V23Card, V23Chip, V23Icon } from '@/components/v23-ui';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export function WorkoutCoachInsights({
  explanation,
  compact = false,
}: {
  explanation: WorkoutRecommendationExplanation;
  compact?: boolean;
}) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [expanded, setExpanded] = useState(!compact);
  const confidencePercent = Math.round(explanation.confidence.score * 100);

  return (
    <V23Card tone="muted" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>COACH INSIGHTS</Text>
          <Text style={styles.title}>Why this workout</Text>
        </View>
        <V23Chip tone={explanation.confidence.label === 'high' ? 'accent' : 'neutral'}>
          {capitalize(explanation.confidence.label)} confidence
        </V23Chip>
      </View>

      <View style={styles.reasonList}>
        {explanation.conciseWhy.slice(0, compact ? 2 : 4).map((reason) => (
          <View key={reason} style={styles.reasonRow}>
            <View style={styles.check}><Text style={styles.checkText}>✓</Text></View>
            <Text style={styles.reasonText}>{reason}</Text>
          </View>
        ))}
      </View>

      {expanded ? (
        <>
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>EXPECTED ADAPTATIONS</Text>
          <View style={styles.adaptationList}>
            {explanation.expectedAdaptations.slice(0, 4).map((adaptation, index) => (
              <View key={adaptation} style={styles.metricRow}>
                <Text style={styles.metricLabel}>{adaptationLabel(adaptation)}</Text>
                <LevelBar level={Math.max(2, 5 - index)} tokens={tokens} />
              </View>
            ))}
          </View>

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>EXPECTED FATIGUE</Text>
          <View style={styles.adaptationList}>
            <View style={styles.metricRow}><Text style={styles.metricLabel}>Muscular</Text><LevelBar level={explanation.fatigue.muscular} tokens={tokens} /></View>
            <View style={styles.metricRow}><Text style={styles.metricLabel}>Neural</Text><LevelBar level={explanation.fatigue.neural} tokens={tokens} /></View>
            <View style={styles.metricRow}><Text style={styles.metricLabel}>Cardiovascular</Text><LevelBar level={explanation.fatigue.cardiovascular} tokens={tokens} /></View>
          </View>
          <Text style={styles.recovery}>Estimated recovery: about {explanation.fatigue.recoveryHours} hours</Text>

          {explanation.whyNotHarder ? (
            <View style={styles.note}>
              <Text style={styles.noteTitle}>Why not harder?</Text>
              <Text style={styles.noteBody}>{explanation.whyNotHarder}</Text>
            </View>
          ) : null}

          <View style={styles.divider} />
          <View style={styles.confidenceHeader}>
            <Text style={styles.sectionLabel}>COACH CONFIDENCE</Text>
            <Text style={styles.confidenceScore}>{confidencePercent}%</Text>
          </View>
          <Text style={styles.confidenceBody}>{explanation.confidence.rationale[0]}</Text>
          <View style={styles.evidenceWrap}>
            {explanation.confidence.evidenceInputs.slice(0, 5).map((input) => <V23Chip key={input} tone="accent">{input}</V23Chip>)}
          </View>
          {explanation.confidence.missingInputs.length ? (
            <Text style={styles.missing}>Confidence can improve with {explanation.confidence.missingInputs.slice(0, 2).join(' and ')}.</Text>
          ) : null}
          <Text style={styles.safeguard}>{explanation.safeguards[0]}</Text>
        </>
      ) : null}

      {compact ? (
        <Pressable onPress={() => setExpanded((value) => !value)} style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]}>
          <Text style={styles.disclosureText}>{expanded ? 'Show less' : 'See full reasoning'}</Text>
          <V23Icon name="chevron" color={tokens.accent} size={16} />
        </Pressable>
      ) : null}
    </V23Card>
  );
}

function LevelBar({ level, tokens }: { level: number; tokens: DesignTokens }) {
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  return <View style={styles.levelBar}>{Array.from({ length: 5 }, (_, index) => <View key={index} style={[styles.levelSegment, index < level && styles.levelSegmentActive]} />)}</View>;
}

function adaptationLabel(adaptation: TrainingAdaptation): string {
  return adaptation.split('_').map(capitalize).join(' ');
}

function capitalize(value: string): string {
  return value.length ? value[0]!.toUpperCase() + value.slice(1) : value;
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    card: { gap: 14, padding: 18 },
    header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
    headerCopy: { flex: 1, gap: 2 },
    eyebrow: { color: tokens.accent, fontSize: 10.5, lineHeight: 14, fontWeight: '900', letterSpacing: 1.15 },
    title: { color: tokens.text, fontSize: 21, lineHeight: 26, fontWeight: '900' },
    reasonList: { gap: 10 },
    reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    check: { width: 22, height: 22, borderRadius: 11, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    checkText: { color: tokens.accent, fontSize: 13, lineHeight: 16, fontWeight: '900' },
    reasonText: { flex: 1, color: tokens.text, fontSize: 14.5, lineHeight: 21 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: tokens.border },
    sectionLabel: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 14, fontWeight: '900', letterSpacing: 1.05 },
    adaptationList: { gap: 9 },
    metricRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    metricLabel: { flex: 1, color: tokens.text, fontSize: 14, lineHeight: 18, fontWeight: '700' },
    levelBar: { width: 104, flexDirection: 'row', gap: 4 },
    levelSegment: { flex: 1, height: 7, borderRadius: 4, backgroundColor: tokens.surface },
    levelSegmentActive: { backgroundColor: tokens.accent },
    recovery: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 18 },
    note: { gap: 5, padding: 14, borderRadius: 16, backgroundColor: tokens.surface },
    noteTitle: { color: tokens.text, fontSize: 14.5, lineHeight: 19, fontWeight: '800' },
    noteBody: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 20 },
    confidenceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    confidenceScore: { color: tokens.accent, fontSize: 18, lineHeight: 22, fontWeight: '900' },
    confidenceBody: { color: tokens.text, fontSize: 13.5, lineHeight: 19 },
    evidenceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    missing: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18 },
    safeguard: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 17, fontStyle: 'italic' },
    disclosure: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, paddingTop: 10 },
    disclosureText: { color: tokens.accent, fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
    pressed: { opacity: 0.7 },
  });
}
