import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { V23Card, V23Chip, V23Icon } from '@/components/v23-ui';
import {
  loadRaceStrategyContext,
  presentRaceStrategyContext,
  tradeoffLabel,
  type RaceStrategyContext,
} from '@/services/race-strategy-context';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export function RaceStrategyContextCard({ surface }: { surface: 'plan' | 'coach' }) {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [context, setContext] = useState<RaceStrategyContext | null>(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    void loadRaceStrategyContext()
      .then((next) => { if (live) setContext(next); })
      .catch(() => { if (live) setContext(null); });
    return () => { live = false; };
  }, []));

  if (!context) return null;
  const presentation = presentRaceStrategyContext(context);
  const tradeoff = tradeoffLabel(context.effectiveStrategy.tradeoffTolerance);

  return <V23Card elevated style={styles.card}>
    <View style={styles.header}>
      <View style={styles.icon}><V23Icon name="goal" color={tokens.accent} size={20} /></View>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>{presentation.sourceLabel}</Text>
        <Text style={styles.title}>{presentation.title}</Text>
      </View>
    </View>

    {presentation.summary ? <Text style={styles.summary}>{presentation.summary}</Text> : null}
    <View style={styles.chips}>
      {tradeoff ? <V23Chip tone="info">{tradeoff}</V23Chip> : null}
      {context.approvedStrategy ? <V23Chip tone="warm">Strategy Coach override</V23Chip> : null}
      {presentation.target ? <V23Chip tone="neutral">{presentation.target}</V23Chip> : null}
    </View>

    <View style={styles.whyBox}>
      <Text style={styles.whyLabel}>WHY THIS AFFECTS THE PLAN</Text>
      <Text style={styles.whyBody}>{presentation.rationale}</Text>
    </View>

    {context.approvedStrategy ? <Text style={styles.overrideNote}>Your approved Strategy Coach directive is layered on top of the saved race intent. Removing that directive returns to the race-priority baseline.</Text> : null}

    <View style={styles.actions}>
      <Pressable onPress={() => router.push('/race-intent' as Href)} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}>
        <Text style={styles.primaryActionText}>Edit race priorities</Text>
      </Pressable>
      {surface === 'plan' ? <Pressable onPress={() => router.push('/(tabs)/coach' as Href)} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}>
        <Text style={styles.secondaryActionText}>Talk strategy</Text>
      </Pressable> : null}
    </View>
  </V23Card>;
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    card: { gap: 11, padding: 16 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    headerCopy: { flex: 1, minWidth: 0 },
    eyebrow: { color: tokens.accent, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1 },
    title: { color: tokens.text, fontSize: 19, lineHeight: 24, fontWeight: '900', marginTop: 2 },
    summary: { color: tokens.text, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    whyBox: { borderRadius: 14, backgroundColor: tokens.surfaceMuted, padding: 12, gap: 4 },
    whyLabel: { color: tokens.textMuted, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.85 },
    whyBody: { color: tokens.text, fontSize: 12.5, lineHeight: 18 },
    overrideNote: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 17 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    primaryAction: { minHeight: 40, borderRadius: 12, backgroundColor: tokens.accent, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
    primaryActionText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '800' },
    secondaryAction: { minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
    secondaryActionText: { color: tokens.text, fontSize: 13, lineHeight: 17, fontWeight: '800' },
    pressed: { opacity: 0.76 },
  });
}
