import type { TrainingAdaptation, WorkoutRecommendationExplanation } from '@circuit/domain';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { V23Card, V23Chip, V23Icon } from '@/components/v23-ui';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export function CoachInsights({
  explanation,
  title = 'Why this workout',
  initiallyExpanded = false,
}: {
  explanation: WorkoutRecommendationExplanation;
  title?: string;
  initiallyExpanded?: boolean;
}) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const visibleReasons = expanded ? explanation.conciseWhy : explanation.conciseWhy.slice(0, 2);

  return (
    <V23Card elevated style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.iconWrap}><V23Icon name="info" color={tokens.accent} size={20} /></View>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>COACH INSIGHT</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.confidenceBadge}>
          <Text style={styles.confidenceText}>{capitalize(explanation.confidence.label)}</Text>
        </View>
      </View>

      <View style={styles.reasonList}>
        {visibleReasons.map((reason) => (
          <View key={reason} style={styles.reasonRow}>
            <View style={styles.reasonDot} />
            <Text style={styles.reasonText}>{reason}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>EXPECTED ADAPTATIONS</Text>
        <View style={styles.chips}>
          {explanation.expectedAdaptations.slice(0, expanded ? 5 : 3).map((adaptation) => (
            <V23Chip key={adaptation} tone="neutral">{adaptationLabel(adaptation)}</V23Chip>
          ))}
        </View>
      </View>

      <View style={styles.costGrid}>
        <CostCell label="Muscular" value={loadLabel(explanation.fatigue.muscular)} styles={styles} />
        <CostCell label="Cardio" value={loadLabel(explanation.fatigue.cardiovascular)} styles={styles} />
        <CostCell label="Neural" value={loadLabel(explanation.fatigue.neural)} styles={styles} />
        <CostCell label="Recovery" value={recoveryWindow(explanation.fatigue.recoveryHours)} styles={styles} />
      </View>

      {expanded ? (
        <View style={styles.details}>
          {explanation.whyNotHarder ? (
            <View style={styles.detailBlock}>
              <Text style={styles.sectionLabel}>WHY NOT HARDER?</Text>
              <Text style={styles.detailText}>{explanation.whyNotHarder}</Text>
            </View>
          ) : null}
          <View style={styles.detailBlock}>
            <Text style={styles.sectionLabel}>WHAT THIS USES</Text>
            <Text style={styles.detailText}>{sentenceList(explanation.confidence.evidenceInputs)}.</Text>
          </View>
          {explanation.confidence.missingInputs.length ? (
            <View style={styles.detailBlock}>
              <Text style={styles.sectionLabel}>WHAT IS STILL MISSING</Text>
              <Text style={styles.detailText}>{sentenceList(explanation.confidence.missingInputs)}. Missing data lowers confidence; it does not count against you.</Text>
            </View>
          ) : null}
          <Text style={styles.safeguard}>{explanation.safeguards[0]}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Hide coach reasoning details' : 'Show coach reasoning details'}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]}
      >
        <Text style={styles.disclosureText}>{expanded ? 'Show less' : 'See full reasoning'}</Text>
        <View style={[styles.chevron, expanded && styles.chevronExpanded]}>
          <V23Icon name="chevron" color={tokens.accent} size={17} />
        </View>
      </Pressable>
    </V23Card>
  );
}

function CostCell({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.costCell}>
      <Text style={styles.costValue}>{value}</Text>
      <Text style={styles.costLabel}>{label}</Text>
    </View>
  );
}

function loadLabel(value: 1 | 2 | 3 | 4 | 5): string {
  if (value <= 2) return 'Low';
  if (value === 3) return 'Moderate';
  return 'High';
}

function recoveryWindow(hours: number): string {
  const lower = Math.max(12, Math.floor(hours / 12) * 12);
  const upper = Math.min(60, lower + 12);
  return `${lower}–${upper} hr`;
}

function adaptationLabel(adaptation: TrainingAdaptation): string {
  const labels: Record<TrainingAdaptation, string> = {
    run_durability: 'Run durability',
    swim_support: 'Swim support',
    bike_support: 'Bike support',
    hip_stability: 'Hip stability',
    single_leg_strength: 'Single-leg strength',
    posterior_chain_capacity: 'Posterior chain',
    calf_ankle_capacity: 'Calf + ankle',
    trunk_control: 'Trunk control',
    upper_body_strength: 'Upper-body strength',
    movement_quality: 'Movement quality',
    power: 'Power',
    general_strength: 'General strength',
  };
  return labels[adaptation];
}

function sentenceList(values: string[]): string {
  if (values.length === 0) return 'No additional inputs';
  if (values.length === 1) return capitalize(values[0]!);
  if (values.length === 2) return `${capitalize(values[0]!)} and ${values[1]}`;
  return `${capitalize(values[0]!)}, ${values.slice(1, -1).join(', ')}, and ${values.at(-1)}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    card: { gap: 16, padding: 18 },
    headingRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    iconWrap: { width: 42, height: 42, borderRadius: 14, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    headingCopy: { flex: 1, minWidth: 0 },
    eyebrow: { color: tokens.accent, fontSize: 10.5, lineHeight: 14, fontWeight: '900', letterSpacing: 1.05 },
    title: { color: tokens.text, fontSize: 20, lineHeight: 25, fontWeight: '900', marginTop: 2 },
    confidenceBadge: { borderRadius: 999, backgroundColor: tokens.surfaceMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.border, paddingHorizontal: 9, paddingVertical: 5 },
    confidenceText: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 14, fontWeight: '800' },
    reasonList: { gap: 9 },
    reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
    reasonDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.accent, marginTop: 7 },
    reasonText: { flex: 1, color: tokens.text, fontSize: 14.5, lineHeight: 21, fontWeight: '600' },
    section: { gap: 8 },
    sectionLabel: { color: tokens.textMuted, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0.85 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    costGrid: { flexDirection: 'row', gap: 7 },
    costCell: { flex: 1, minWidth: 0, minHeight: 62, borderRadius: 14, backgroundColor: tokens.surfaceMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    costValue: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900', textAlign: 'center' },
    costLabel: { color: tokens.textMuted, fontSize: 9.5, lineHeight: 13, fontWeight: '700', marginTop: 2, textAlign: 'center' },
    details: { gap: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, paddingTop: 14 },
    detailBlock: { gap: 5 },
    detailText: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 20 },
    safeguard: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 17, fontStyle: 'italic' },
    disclosure: { minHeight: 42, marginHorizontal: -4, marginBottom: -5, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    disclosureText: { color: tokens.accent, fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
    chevron: { transform: [{ rotate: '90deg' }] },
    chevronExpanded: { transform: [{ rotate: '-90deg' }] },
    pressed: { opacity: 0.65 },
  });
}
