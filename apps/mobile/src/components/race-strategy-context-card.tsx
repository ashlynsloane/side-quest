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
      {activeOverride ? <V23Chip tone="warm">Strategy Coach override</V23Chip> : null}
      {context.approvedStrategyWindowState === 'scheduled' ? <V23Chip tone="warm">Strategy scheduled</V23Chip> : null}
      {context.approvedStrategyWindowState === 'expired' ? <V23Chip tone="neutral">Prior strategy expired</V23Chip> : null}
      {presentation.target ? <V23Chip tone="neutral">{presentation.target}</V23Chip> : null}
    </View>

    <View style={styles.whyBox}>
      <Text style={styles.whyLabel}>WHY THIS AFFECTS THE PLAN</Text>
      <Text style={styles.whyBody}>{presentation.rationale}</Text>
    </View>

    {weekly ? <View style={styles.weekBox}>
      <View style={styles.weekTop}>
        <View style={styles.weekTopCopy}>
          <Text style={styles.weekLabel}>{weekly.isCurrentWeek ? 'THIS WEEK' : 'NEXT PLANNED WEEK'}</Text>
          <Text style={styles.weekTitle}>{weekly.expression.headline}</Text>
        </View>
        <V23Chip tone={weekly.expression.state === 'held' ? 'warm' : weekly.expression.state === 'expressed' ? 'info' : 'neutral'}>
          {weeklyStrategyStateLabel(weekly.expression.state)}
        </V23Chip>
      </View>
      <Text style={styles.weekRange}>{formatWeekRange(weekly.week.weekStartDate, weekly.week.weekEndDate)}</Text>
      <Text style={styles.weekSummary}>{weekly.expression.summary}</Text>
      <Text style={styles.weekDisciplines}>{weeklyDisciplineLine(weekly.expression)}</Text>
      {targetSupport || weekly.targetEvidence.status !== 'none' ? <View style={styles.targetBox}>
        <Text style={styles.targetLabel}>RACE TARGET CONNECTION</Text>
        {targetSupport ? <Text style={styles.targetBody}>{targetSupport}</Text> : null}
        {weekly.targetEvidence.targetLabel ? <Text style={styles.targetTitle}>{weekly.targetEvidence.targetLabel}</Text> : null}
        {weekly.targetEvidence.evidenceLabel ? <Text style={styles.targetEvidence}>{weekly.targetEvidence.evidenceLabel}</Text> : null}
        {weekly.targetEvidence.caveat ? <Text style={styles.targetCaveat}>{weekly.targetEvidence.caveat}</Text> : null}
      </View> : null}
      <View style={styles.reasonList}>
        {weekly.expression.reasons.slice(0, 3).map((reason) => <Text key={reason} style={styles.reasonText}>• {reason}</Text>)}
      </View>
    </View> : null}

    {activeOverride ? <Text style={styles.overrideNote}>The approved Strategy Coach directive is active on top of Race Intent for this planning week. Outside its window, Race Intent resumes automatically.</Text> : null}
    {context.approvedStrategyWindowState === 'scheduled' ? <Text style={styles.overrideNote}>A Strategy Coach override is saved for a future planning window. Race Intent is still driving the current week.</Text> : null}
    {context.approvedStrategyWindowState === 'expired' ? <Text style={styles.overrideNote}>The saved Strategy Coach window has ended. Race Intent is already back in control; the old directive is retained only for context until you clear or replace it.</Text> : null}

    <View style={styles.actions}>
      <Pressable onPress={() => router.push('/race-intent' as Href)} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}>
        <Text style={styles.primaryActionText}>Edit race priorities</Text>
      </Pressable>
      {surface === 'plan' ? <Pressable onPress={() => router.push('/(tabs)/coach-strategy' as Href)} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}>
        <Text style={styles.secondaryActionText}>Talk strategy</Text>
      </Pressable> : null}
    </View>
  </V23Card>;
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
    weekBox: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, paddingTop: 13, gap: 8 },
    weekTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    weekTopCopy: { flex: 1, minWidth: 0 },
    weekLabel: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
    weekTitle: { color: tokens.text, fontSize: 17, lineHeight: 22, fontWeight: '900', marginTop: 2 },
    weekRange: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16, fontWeight: '700' },
    weekSummary: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18 },
    weekDisciplines: { color: tokens.text, fontSize: 12.5, lineHeight: 19, fontWeight: '700' },
    targetBox: { borderRadius: 12, backgroundColor: tokens.accentSoft, padding: 10, gap: 3 },
    targetLabel: { color: tokens.accent, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8 },
    targetBody: { color: tokens.text, fontSize: 11.5, lineHeight: 16 },
    targetTitle: { color: tokens.text, fontSize: 12, lineHeight: 17, fontWeight: '800', marginTop: 2 },
    targetEvidence: { color: tokens.text, fontSize: 11.5, lineHeight: 16, fontWeight: '700' },
    targetCaveat: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 15 },
    reasonList: { gap: 3 },
    reasonText: { color: tokens.textMuted, fontSize: 11, lineHeight: 16 },
    overrideNote: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 17 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    primaryAction: { minHeight: 40, borderRadius: 12, backgroundColor: tokens.accent, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
    primaryActionText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '800' },
    secondaryAction: { minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
    secondaryActionText: { color: tokens.text, fontSize: 13, lineHeight: 17, fontWeight: '800' },
    pressed: { opacity: 0.76 },
  });
}
