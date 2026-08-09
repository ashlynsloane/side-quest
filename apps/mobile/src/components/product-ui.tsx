import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { V23Icon, type V23IconName } from '@/components/v23-ui';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export function ProductHero({
  eyebrow,
  title,
  body,
  meta,
  actions,
  tone = 'navy',
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  tone?: 'navy' | 'surface';
}) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const dark = tone === 'navy';
  return <View style={[styles.hero, dark ? styles.heroNavy : styles.heroSurface]}>
    {eyebrow ? <Text style={[styles.eyebrow, dark && styles.heroEyebrow]}>{eyebrow}</Text> : null}
    <Text style={[styles.heroTitle, dark && styles.heroTitleDark]}>{title}</Text>
    {body ? <Text style={[styles.heroBody, dark && styles.heroBodyDark]}>{body}</Text> : null}
    {meta ? <View style={styles.heroMeta}>{meta}</View> : null}
    {actions ? <View style={styles.heroActions}>{actions}</View> : null}
  </View>;
}

export function ProductSection({
  eyebrow,
  title,
  body,
  children,
  style,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  return <View style={[styles.section, style]}>
    <View style={styles.sectionHeading}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.sectionTitle}>{title}</Text>
      {body ? <Text style={styles.sectionBody}>{body}</Text> : null}
    </View>
    {children}
  </View>;
}

export function ProductDisclosure({
  title,
  summary,
  expanded,
  onPress,
  children,
  badge,
}: {
  title: string;
  summary?: string;
  expanded: boolean;
  onPress: () => void;
  children?: ReactNode;
  badge?: ReactNode;
}) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  return <View style={styles.disclosure}>
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={({ pressed }) => [styles.disclosureHeader, pressed && styles.pressed]}
    >
      <View style={styles.disclosureCopy}>
        <Text style={styles.disclosureTitle}>{title}</Text>
        {summary ? <Text style={styles.disclosureSummary} numberOfLines={2}>{summary}</Text> : null}
      </View>
      {badge ? <View>{badge}</View> : null}
      <View style={styles.disclosureMark}><Text style={styles.disclosureMarkText}>{expanded ? '−' : '+'}</Text></View>
    </Pressable>
    {expanded ? <View style={styles.disclosureBody}>{children}</View> : null}
  </View>;
}

export function ProductChoiceRow({
  title,
  body,
  selected,
  onPress,
  icon,
}: {
  title: string;
  body?: string;
  selected: boolean;
  onPress: () => void;
  icon?: V23IconName;
}) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  return <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected }}
    onPress={onPress}
    style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}
  >
    {icon ? <View style={[styles.choiceIcon, selected && styles.choiceIconSelected]}><V23Icon name={icon} color={selected ? tokens.accent : tokens.textMuted} size={17} /></View> : null}
    <View style={styles.choiceCopy}>
      <Text style={[styles.choiceTitle, selected && styles.choiceTitleSelected]}>{title}</Text>
      {body ? <Text style={styles.choiceBody}>{body}</Text> : null}
    </View>
    <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
  </Pressable>;
}

export function ProductAction({
  label,
  onPress,
  icon = 'chevron',
  variant = 'primary',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  icon?: V23IconName | '';
  variant?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
}) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  return <Pressable
    accessibilityRole="button"
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      styles.action,
      variant === 'secondary' && styles.actionSecondary,
      variant === 'quiet' && styles.actionQuiet,
      disabled && styles.disabled,
      pressed && styles.pressed,
    ]}
  >
    <Text style={[
      styles.actionText,
      variant !== 'primary' && styles.actionTextSecondary,
    ]}>{label}</Text>
    {icon ? <V23Icon name={icon} color={variant === 'primary' ? '#FFFFFF' : tokens.accent} size={16} /> : null}
  </Pressable>;
}

export function ProductMetric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  return <View style={[styles.metric, emphasis && styles.metricEmphasis]}>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>;
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    hero: { borderRadius: 24, paddingHorizontal: 19, paddingVertical: 18, gap: 7, overflow: 'hidden' },
    heroNavy: { backgroundColor: tokens.header },
    heroSurface: { backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border },
    eyebrow: { color: tokens.accent, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1.05 },
    heroEyebrow: { color: '#D7E3EA' },
    heroTitle: { color: tokens.text, fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: -0.5 },
    heroTitleDark: { color: '#FFFFFF' },
    heroBody: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19 },
    heroBodyDark: { color: '#D9E3EA' },
    heroMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 },

    section: { gap: 12 },
    sectionHeading: { gap: 3 },
    sectionTitle: { color: tokens.text, fontSize: 19, lineHeight: 24, fontWeight: '800', letterSpacing: -0.15 },
    sectionBody: { color: tokens.textMuted, fontSize: 13, lineHeight: 19 },

    disclosure: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border },
    disclosureHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
    disclosureCopy: { flex: 1, minWidth: 0, gap: 2 },
    disclosureTitle: { color: tokens.text, fontSize: 15.5, lineHeight: 20, fontWeight: '800' },
    disclosureSummary: { color: tokens.textMuted, fontSize: 12, lineHeight: 17 },
    disclosureMark: { width: 30, height: 30, borderRadius: 15, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    disclosureMarkText: { color: tokens.accent, fontSize: 19, lineHeight: 22, fontWeight: '700' },
    disclosureBody: { paddingBottom: 17, gap: 9 },

    choice: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface },
    choiceSelected: { borderColor: tokens.accent, backgroundColor: tokens.surface },
    choiceIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    choiceIconSelected: { backgroundColor: tokens.surfaceMuted },
    choiceCopy: { flex: 1, minWidth: 0, gap: 2 },
    choiceTitle: { color: tokens.text, fontSize: 14.5, lineHeight: 19, fontWeight: '800' },
    choiceTitleSelected: { color: tokens.accent },
    choiceBody: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
    radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' },
    radioSelected: { borderColor: tokens.accent },
    radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.accent },

    action: { minHeight: 42, borderRadius: 13, backgroundColor: tokens.accent, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    actionSecondary: { backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border },
    actionQuiet: { backgroundColor: 'transparent', paddingHorizontal: 4 },
    actionText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '800' },
    actionTextSecondary: { color: tokens.accent },
    disabled: { opacity: 0.48 },

    metric: { minWidth: 64, minHeight: 52, borderRadius: 13, backgroundColor: tokens.surfaceMuted, paddingHorizontal: 11, paddingVertical: 8, justifyContent: 'center' },
    metricEmphasis: { backgroundColor: tokens.surfaceMuted, borderWidth: 1, borderColor: tokens.border },
    metricValue: { color: tokens.text, fontSize: 15, lineHeight: 18, fontWeight: '900' },
    metricLabel: { color: tokens.textMuted, fontSize: 9.5, lineHeight: 12, fontWeight: '800', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.55 },

    pressed: { opacity: 0.76 },
  });
}
