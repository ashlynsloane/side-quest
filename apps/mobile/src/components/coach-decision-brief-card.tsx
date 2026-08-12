import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { V23Icon } from '@/components/v23-ui';
import type { CoachDecisionBrief, CoachDecisionTraceItem } from '@/services/coach-decision-brief';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export function CoachDecisionBriefCard({ brief }: { brief: CoachDecisionBrief }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [expanded, setExpanded] = useState(false);

  return <View style={[styles.card, decisionBorderStyle(brief.decisionLevel, tokens)]}>
    <View style={styles.header}>
      <View style={[styles.iconWrap, decisionIconStyle(brief.decisionLevel, tokens)]}>
        <V23Icon name="insights" color={decisionAccent(brief.decisionLevel, tokens)} size={20} />
      </View>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>COACH DECISION · {brief.eyebrow}</Text>
        <Text style={styles.title}>{brief.headline}</Text>
      </View>
      <View style={styles.decisionPill}>
        <Text style={styles.decisionPillText}>{decisionLabel(brief.decisionLevel)}</Text>
      </View>
    </View>

    <Text style={styles.summary}>{brief.summary}</Text>

    {brief.statusChips.length ? <View style={styles.statusRow}>
      {brief.statusChips.map((chip) => <View key={`${chip.label}:${chip.value}`} style={styles.statusChip}>
        <Text style={styles.statusLabel}>{chip.label}</Text>
        <Text style={styles.statusValue}>{chip.value}</Text>
      </View>)}
    </View> : null}

    <TraceSection
      label="WHAT CHANGED"
      items={brief.whatChanged}
      limit={expanded ? undefined : 2}
      styles={styles}
      tokens={tokens}
    />

    <TraceSection
      label="WHY"
      items={brief.evidence}
      limit={expanded ? undefined : 2}
      styles={styles}
      tokens={tokens}
    />

    <TraceSection
      label="KEPT STABLE"
      items={brief.keptStable}
      limit={expanded ? undefined : 1}
      styles={styles}
      tokens={tokens}
    />

    {expanded ? <View style={styles.nextCheck}>
      <View style={styles.nextIcon}><V23Icon name="clock" color={tokens.accent} size={15} /></View>
      <View style={styles.nextCopy}>
        <Text style={styles.sectionLabel}>NEXT CHECK</Text>
        <Text style={styles.nextText}>{brief.nextCheck}</Text>
      </View>
    </View> : null}

    <Pressable
      accessibilityRole="button"
      accessibilityLabel={expanded ? 'Hide Coach decision trace' : 'Show Coach decision trace'}
      onPress={() => setExpanded((current) => !current)}
      style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]}
    >
      <Text style={styles.disclosureText}>{expanded ? 'Show less' : 'See decision trace'}</Text>
      <View style={[styles.chevron, expanded && styles.chevronExpanded]}>
        <V23Icon name="chevron" color={tokens.accent} size={16} />
      </View>
    </Pressable>
  </View>;
}

function TraceSection({
  label,
  items,
  limit,
  styles,
  tokens,
}: {
  label: string;
  items: CoachDecisionTraceItem[];
  limit?: number;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  const visible = limit === undefined ? items : items.slice(0, limit);
  if (!visible.length) return null;
  return <View style={styles.section}>
    <Text style={styles.sectionLabel}>{label}</Text>
    <View style={styles.traceList}>
      {visible.map((item, index) => <View key={`${label}:${item.label}:${index}`} style={styles.traceRow}>
        <View style={styles.traceDot} />
        <View style={styles.traceCopy}>
          <Text style={styles.traceTitle}>{item.label}</Text>
          <Text style={styles.traceText}>{item.text}</Text>
        </View>
        {label === 'WHAT CHANGED' && index === 0 ? <V23Icon name="chevron" color={tokens.textMuted} size={13} /> : null}
      </View>)}
    </View>
  </View>;
}

function decisionLabel(level: CoachDecisionBrief['decisionLevel']): string {
  if (level === 'protect') return 'PROTECT';
  if (level === 'hold') return 'HOLD';
  if (level === 'progress') return 'PROGRESS';
  return 'MAINTAIN';
}

function decisionAccent(level: CoachDecisionBrief['decisionLevel'], tokens: DesignTokens): string {
  if (level === 'protect') return tokens.warning;
  if (level === 'hold') return tokens.accent;
  if (level === 'progress') return tokens.success;
  return tokens.accent;
}

function decisionBorderStyle(level: CoachDecisionBrief['decisionLevel'], tokens: DesignTokens) {
  return {
    borderColor: level === 'protect'
      ? tokens.warning
      : level === 'progress'
        ? tokens.success
        : tokens.border,
  };
}

function decisionIconStyle(level: CoachDecisionBrief['decisionLevel'], tokens: DesignTokens) {
  return {
    backgroundColor: level === 'protect'
      ? tokens.surfaceMuted
      : level === 'progress'
        ? tokens.surfaceMuted
        : tokens.accentSoft,
  };
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    card: { borderRadius: 22, borderWidth: 1, backgroundColor: tokens.surface, padding: 16, gap: 13 },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    iconWrap: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    headerCopy: { flex: 1, minWidth: 0, gap: 3 },
    eyebrow: { color: tokens.textMuted, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.65 },
    title: { color: tokens.text, fontSize: 19, lineHeight: 24, fontWeight: '900', letterSpacing: -0.2 },
    decisionPill: { borderRadius: 999, backgroundColor: tokens.surfaceMuted, paddingHorizontal: 8, paddingVertical: 5 },
    decisionPillText: { color: tokens.textMuted, fontSize: 8, lineHeight: 10, fontWeight: '900', letterSpacing: 0.55 },
    summary: { color: tokens.textMuted, fontSize: 13, lineHeight: 19 },
    statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    statusChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, backgroundColor: tokens.surfaceMuted, paddingHorizontal: 8, paddingVertical: 5 },
    statusLabel: { color: tokens.text, fontSize: 8, lineHeight: 10, fontWeight: '900', letterSpacing: 0.45 },
    statusValue: { color: tokens.textMuted, fontSize: 8, lineHeight: 10, fontWeight: '800' },
    section: { gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, paddingTop: 11 },
    sectionLabel: { color: tokens.textMuted, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8 },
    traceList: { gap: 8 },
    traceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    traceDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.accent, marginTop: 6 },
    traceCopy: { flex: 1, minWidth: 0, gap: 1 },
    traceTitle: { color: tokens.text, fontSize: 12, lineHeight: 16, fontWeight: '850' as never },
    traceText: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 17 },
    nextCheck: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 14, backgroundColor: tokens.surfaceMuted, padding: 11 },
    nextIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
    nextCopy: { flex: 1, minWidth: 0, gap: 3 },
    nextText: { color: tokens.text, fontSize: 11.5, lineHeight: 17, fontWeight: '650' as never },
    disclosure: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -4 },
    disclosureText: { color: tokens.accent, fontSize: 12, lineHeight: 16, fontWeight: '850' as never },
    chevron: { transform: [{ rotate: '90deg' }] },
    chevronExpanded: { transform: [{ rotate: '-90deg' }] },
    pressed: { opacity: 0.68 },
  });
}
