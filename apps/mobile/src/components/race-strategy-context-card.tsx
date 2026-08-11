import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProductDisclosure } from '@/components/product-ui';
import { V23Chip, V23Icon } from '@/components/v23-ui';
import {
  loadRaceStrategyContext,
  presentRaceStrategyContext,
  tradeoffLabel,
  type RaceStrategyContext,
} from '@/services/race-strategy-context';
import {
  loadCurrentWeeklyStrategyContext,
  weeklyDisciplineLine,
  weeklyStrategyStateLabel,
  weeklyTargetSupportText,
  type CurrentWeeklyStrategyContext,
} from '@/services/weekly-strategy-context';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export function RaceStrategyContextCard({ surface }: { surface: 'plan' | 'coach' }) {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [context, setContext] = useState<RaceStrategyContext | null>(null);
  const [weekly, setWeekly] = useState<CurrentWeeklyStrategyContext | null>(null);
  const [expanded, setExpanded] = useState(false);

  useFocusEffect(useCallback(() => {
    let live = true;
    void (async () => {
      try {
        const next = await loadRaceStrategyContext();
        if (!live) return;
        setContext(next);
        if (!next) {
          setWeekly(null);
          return;
        }
        const week = await loadCurrentWeeklyStrategyContext(next);
        if (live) setWeekly(week);
      } catch {
        if (live) {
          setContext(null);
          setWeekly(null);
        }
      }
    })();
    return () => { live = false; };
  }, []));

  if (!context) return null;
  const presentation = presentRaceStrategyContext(context);
  const tradeoff = tradeoffLabel(context.effectiveStrategy.tradeoffTolerance);
  const targetSupport = weekly ? weeklyTargetSupportText(weekly.expression) : undefined;
  const activeOverride = context.approvedStrategyWindowState === 'active';
  const weekState = weekly ? weeklyStrategyStateLabel(weekly.expression.state) : undefined;

  return <View style={styles.card}>
    <View style={styles.header}>
      <View style={styles.icon}><V23Icon name="goal" color={tokens.accent} size={19} /></View>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>RACE PRIORITIES</Text>
        <Text style={styles.title}>{presentation.title}</Text>
        {presentation.summary ? <Text style={styles.summary} numberOfLines={2}>{presentation.summary}</Text> : null}
      </View>
    </View>

    <View style={styles.chips}>
      {weekly && weekState ? <V23Chip tone={weekly.expression.state === 'held' ? 'warm' : weekly.expression.state === 'expressed' ? 'info' : 'neutral'}>{weekState}</V23Chip> : null}
      {tradeoff ? <V23Chip tone="neutral">{tradeoff}</V23Chip> : null}
      {activeOverride ? <V23Chip tone="warm">Focus active</V23Chip> : null}
      {context.approvedStrategyWindowState === 'scheduled' ? <V23Chip tone="warm">Focus scheduled</V23Chip> : null}
      {presentation.target ? <V23Chip tone="neutral">{presentation.target}</V23Chip> : null}
    </View>

    {weekly ? <View style={styles.weekLine}>
      <View style={styles.weekAccent} />
      <View style={styles.weekCopy}>
        <Text style={styles.weekLabel}>{weekly.isCurrentWeek ? 'THIS WEEK' : 'NEXT WEEK'} · {formatWeekRange(weekly.week.weekStartDate, weekly.week.weekEndDate)}</Text>
        <Text style={styles.weekTitle}>{weekly.expression.headline}</Text>
        <Text style={styles.weekDisciplines}>{weeklyDisciplineLine(weekly.expression)}</Text>
      </View>
    </View> : null}

    <ProductDisclosure
      title="Why this week?"
      summary={weekly?.expression.summary ?? 'See how your race priorities affect this week.'}
      expanded={expanded}
      onPress={() => setExpanded((value) => !value)}
    >
      <View style={styles.whyBox}>
        <Text style={styles.whyLabel}>WHY</Text>
        <Text style={styles.whyBody}>{presentation.rationale}</Text>
      </View>

      {weekly ? <>
        <Text style={styles.weekSummary}>{weekly.expression.summary}</Text>
        {targetSupport || weekly.targetEvidence.status !== 'none' ? <View style={styles.targetBox}>
          <Text style={styles.targetLabel}>RACE TARGET</Text>
          {targetSupport ? <Text style={styles.targetBody}>{targetSupport}</Text> : null}
          {weekly.targetEvidence.targetLabel ? <Text style={styles.targetTitle}>{weekly.targetEvidence.targetLabel}</Text> : null}
          {weekly.targetEvidence.evidenceLabel ? <Text style={styles.targetEvidence}>{weekly.targetEvidence.evidenceLabel}</Text> : null}
          {weekly.targetEvidence.caveat ? <Text style={styles.targetCaveat}>{weekly.targetEvidence.caveat}</Text> : null}
        </View> : null}
        <View style={styles.reasonList}>
          {weekly.expression.reasons.slice(0, 3).map((reason) => <Text key={reason} style={styles.reasonText}>• {reason}</Text>)}
        </View>
      </> : null}

      {activeOverride ? <Text style={styles.overrideNote}>A temporary training focus is active for this date range. Your normal race priorities resume afterward.</Text> : null}
      {context.approvedStrategyWindowState === 'scheduled' ? <Text style={styles.overrideNote}>A temporary training focus is scheduled for a future date range.</Text> : null}
      {context.approvedStrategyWindowState === 'expired' ? <Text style={styles.overrideNote}>The temporary focus has ended.</Text> : null}
    </ProductDisclosure>

    <View style={styles.actions}>
      <Pressable onPress={() => router.push('/race-intent' as Href)} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}>
        <Text style={styles.primaryActionText}>Edit race priorities</Text>
      </Pressable>
      {surface === 'plan' ? <Pressable onPress={() => router.push('/(tabs)/coach-strategy' as Href)} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}>
        <Text style={styles.secondaryActionText}>Season focus</Text>
      </Pressable> : null}
    </View>
  </View>;
}

function formatWeekRange(start: string, end: string): string {
  const first = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  const firstLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(first);
  const lastLabel = new Intl.DateTimeFormat('en-US', { month: first.getMonth() === last.getMonth() ? undefined : 'short', day: 'numeric' }).format(last);
  return `${firstLabel} – ${lastLabel}`;
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    card: { borderRadius: 20, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, paddingHorizontal: 15, paddingTop: 15, paddingBottom: 10, gap: 10 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    headerCopy: { flex: 1, minWidth: 0 },
    eyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
    title: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '900', marginTop: 1 },
    summary: { color: tokens.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    weekLine: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
    weekAccent: { width: 3, borderRadius: 2, backgroundColor: tokens.accent },
    weekCopy: { flex: 1, minWidth: 0, gap: 2 },
    weekLabel: { color: tokens.textMuted, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.7 },
    weekTitle: { color: tokens.text, fontSize: 15, lineHeight: 20, fontWeight: '900' },
    weekDisciplines: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16, fontWeight: '700' },
    whyBox: { borderRadius: 13, backgroundColor: tokens.surfaceMuted, padding: 11, gap: 4 },
    whyLabel: { color: tokens.textMuted, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8 },
    whyBody: { color: tokens.text, fontSize: 12, lineHeight: 17 },
    weekSummary: { color: tokens.textMuted, fontSize: 12, lineHeight: 17 },
    targetBox: { borderRadius: 12, backgroundColor: tokens.accentSoft, padding: 10, gap: 3 },
    targetLabel: { color: tokens.accent, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8 },
    targetBody: { color: tokens.text, fontSize: 11.5, lineHeight: 16 },
    targetTitle: { color: tokens.text, fontSize: 12, lineHeight: 17, fontWeight: '800', marginTop: 2 },
    targetEvidence: { color: tokens.text, fontSize: 11.5, lineHeight: 16, fontWeight: '700' },
    targetCaveat: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 15 },
    reasonList: { gap: 3 },
    reasonText: { color: tokens.textMuted, fontSize: 11, lineHeight: 16 },
    overrideNote: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 17 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 1 },
    primaryAction: { minHeight: 38, borderRadius: 11, backgroundColor: tokens.accent, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
    primaryActionText: { color: '#FFFFFF', fontSize: 12.5, lineHeight: 16, fontWeight: '800' },
    secondaryAction: { minHeight: 38, borderRadius: 11, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
    secondaryActionText: { color: tokens.text, fontSize: 12.5, lineHeight: 16, fontWeight: '800' },
    pressed: { opacity: 0.76 },
  });
}
