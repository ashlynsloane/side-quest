import type { CoachSemanticStrategyChange } from '@circuit/planner/coach-semantic-frame';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { V23Card, V23Chip, V23Icon, V23OutlineButton, V23PrimaryButton } from '@/components/v23-ui';
import {
  approveCurrentCoachStrategyDraft,
  discardCurrentCoachStrategyDraft,
  stopApprovedCoachStrategy,
} from '@/services/coach-strategy-runtime';
import {
  loadStrategyWorkspace,
  formatStrategyWeek,
  phaseLabel,
  strategyWindowLabel,
  strategyWindowSummary,
  type StrategyWorkspaceData,
} from '@/services/strategy-workspace';
import { sendStrategyCoachMessage } from '@/services/strategy-conversation-runtime';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export function CoachStrategyWorkspace() {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [workspace, setWorkspace] = useState<StrategyWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const reload = useCallback(async (isLive: () => boolean = () => true) => {
    try {
      const next = await loadStrategyWorkspace();
      if (isLive()) setWorkspace(next);
    } finally {
      if (isLive()) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let live = true;
    setLoading(true);
    void reload(() => live);
    return () => { live = false; };
  }, [reload]));

  async function sendMessage() {
    if (busy || !message.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await sendStrategyCoachMessage(message);
      setMessage('');
      setFeedback(result.needsClarification ? result.response : 'Draft updated. Review it before applying.');
      await reload();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Side Quest could not update the season focus.');
    } finally {
      setBusy(false);
    }
  }

  async function applyDraft() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await approveCurrentCoachStrategyDraft();
      setFeedback('Season focus saved.');
      await reload();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Side Quest could not apply that focus safely.');
    } finally {
      setBusy(false);
    }
  }

  async function discardDraft() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await discardCurrentCoachStrategyDraft();
      setFeedback('Draft discarded.');
      await reload();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Side Quest could not discard that draft.');
    } finally {
      setBusy(false);
    }
  }

  async function stopStrategy() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await stopApprovedCoachStrategy();
      setFeedback('Temporary focus removed.');
      await reload();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Side Quest could not remove that focus safely.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator color={tokens.accent} /><Text style={styles.loadingText}>Loading season plan…</Text></View>;
  if (!workspace) return <V23Card elevated style={styles.card}><Text style={styles.title}>Build a race plan first</Text><Text style={styles.body}>Add an event goal to plan across multiple weeks.</Text></V23Card>;

  const review = workspace.review;
  const draft = review.hasUnapprovedChanges ? review.draft : undefined;
  const approved = review.approved?.strategy;
  const turns = workspace.conversation.turns.slice(-10);
  const macro = workspace.macrocycle;

  return <View style={styles.stack}>
    <View style={styles.intro}>
      <Text style={styles.eyebrow}>SEASON</Text>
      <Text style={styles.hero}>Season strategy</Text>
      <Text style={styles.body}>Set priorities that span several weeks.</Text>
    </View>

    <V23Card elevated style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.icon}><V23Icon name="goal" color={tokens.accent} size={20} /></View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>CURRENT GOAL</Text>
          <Text style={styles.title}>{workspace.goalName}</Text>
        </View>
        <V23Chip tone={macro.approvedWindowState === 'active' ? 'info' : macro.approvedWindowState === 'scheduled' ? 'warm' : 'neutral'}>{friendlyWindowLabel(strategyWindowLabel(workspace))}</V23Chip>
      </View>
      {workspace.eventDate ? <Text style={styles.meta}>Race · {formatStrategyWeek(workspace.eventDate)}</Text> : null}
      <Text style={styles.body}>{friendlyWindowSummary(strategyWindowSummary(workspace))}</Text>
      {macro.strategyContinuesBeyondBlock ? <Text style={styles.note}>This focus continues beyond the weeks currently shown.</Text> : null}
      {macro.nextPhaseTransition ? <View style={styles.callout}>
        <Text style={styles.calloutLabel}>NEXT PHASE</Text>
        <Text style={styles.calloutText}>{phaseLabel(macro.nextPhaseTransition.from)} → {phaseLabel(macro.nextPhaseTransition.to)} · {formatStrategyWeek(macro.nextPhaseTransition.startsAt)}</Text>
      </View> : null}
    </V23Card>

    <V23Card elevated style={styles.card}>
      <Text style={styles.eyebrow}>PHASES</Text>
      <Text style={styles.title}>Training phases</Text>
      <View style={styles.phaseGrid}>
        {macro.phases.map((phase) => <View key={`${phase.phase}_${phase.startDate}`} style={styles.phaseCard}>
          <Text style={styles.phaseName}>{phaseLabel(phase.phase)}</Text>
          <Text style={styles.phaseDates}>{formatStrategyWeek(phase.startDate)} – {formatStrategyWeek(phase.endDate)}</Text>
          <Text style={styles.phaseWeeks}>{phase.weeks} week{phase.weeks === 1 ? '' : 's'}</Text>
        </View>)}
      </View>
    </V23Card>

    <V23Card elevated style={styles.card}>
      <Text style={styles.eyebrow}>WEEK BY WEEK</Text>
      <Text style={styles.title}>Upcoming weeks</Text>
      <View style={styles.timeline}>
        {macro.weeks.map((week, index) => <View key={week.weekStartDate} style={[styles.weekRow, index === macro.weeks.length - 1 && styles.weekRowLast]}>
          <View style={styles.weekMarker}><Text style={styles.weekNumber}>{index + 1}</Text></View>
          <View style={styles.weekCopy}>
            <View style={styles.weekTop}>
              <Text style={styles.weekDate}>{formatStrategyWeek(week.weekStartDate)}</Text>
              <V23Chip tone={week.source === 'strategy_coach' ? 'info' : 'neutral'}>{week.source === 'strategy_coach' ? 'Focus block' : 'Race priorities'}</V23Chip>
            </View>
            <Text style={styles.weekTitle}>{phaseLabel(week.phase)} · {week.expression.headline}</Text>
            <Text style={styles.weekMeta}>{week.plannedMinutes} min planned</Text>
            {week.overrideWindowState === 'scheduled' ? <Text style={styles.weekNote}>Temporary focus starts later.</Text> : null}
            {week.overrideWindowState === 'expired' ? <Text style={styles.weekNote}>Temporary focus has ended.</Text> : null}
          </View>
        </View>)}
      </View>
    </V23Card>

    {(draft || approved) ? <V23Card elevated style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{draft ? 'DRAFT' : 'SAVED FOCUS'}</Text>
          <Text style={styles.title}>{strategyTitle(draft ?? approved!)}</Text>
        </View>
        {draft ? <V23Chip tone="warm">Approval required</V23Chip> : <V23Chip tone="info">Saved</V23Chip>}
      </View>
      <Text style={styles.strategyText}>{strategyDescription(draft ?? approved!)}</Text>
      {draft ? <>
        <Text style={styles.note}>Nothing changes until you approve this draft.</Text>
        <V23PrimaryButton onPress={() => void applyDraft()} icon="check">{busy ? 'Applying…' : 'Apply focus'}</V23PrimaryButton>
        <V23OutlineButton onPress={() => void discardDraft()}>Discard draft</V23OutlineButton>
      </> : <>
        <Text style={styles.note}>{macro.approvedWindowState === 'expired' ? 'This focus is no longer affecting the plan.' : 'This focus applies only inside its selected date range.'}</Text>
        <V23OutlineButton onPress={() => void stopStrategy()}>{macro.approvedWindowState === 'expired' ? 'Clear saved focus' : 'Stop focus now'}</V23OutlineButton>
      </>}
    </V23Card> : null}

    <V23Card elevated style={styles.chatCard}>
      <View style={styles.cardHeader}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>SET A FOCUS</Text>
          <Text style={styles.title}>Tell Side Quest what to prioritize</Text>
        </View>
        <View style={styles.icon}><V23Icon name="adjust" color={tokens.accent} size={20} /></View>
      </View>
      <Text style={styles.body}>Example: “For the next 8 weeks, make bike my main focus while I maintain swim and run.”</Text>
      {turns.length ? <View style={styles.thread}>
        {turns.map((turn) => <View key={turn.id} style={[styles.turnRow, turn.role === 'athlete' && styles.turnRowAthlete]}>
          <View style={[styles.bubble, turn.role === 'athlete' ? styles.athleteBubble : styles.coachBubble]}>
            <Text style={styles.turnRole}>{turn.role === 'athlete' ? 'YOU' : 'SIDE QUEST'}</Text>
            <Text style={styles.turnText}>{turn.text}</Text>
          </View>
        </View>)}
      </View> : null}
      <TextInput
        value={message}
        onChangeText={(value) => { setMessage(value); setFeedback(null); }}
        multiline
        maxLength={700}
        placeholder="For the next 8 weeks, keep bike as my main focus but develop the run too…"
        placeholderTextColor={tokens.textMuted}
        style={styles.input}
        accessibilityLabel="Set a season focus"
      />
      <Pressable
        onPress={() => void sendMessage()}
        disabled={busy || !message.trim()}
        style={({ pressed }) => [styles.send, (!message.trim() || busy) && styles.disabled, pressed && styles.pressed]}
      >
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.sendText}>Update draft</Text><V23Icon name="chevron" color="#FFFFFF" size={18} /></>}
      </Pressable>
      {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
      <Text style={styles.note}>Nothing changes until you approve the draft above.</Text>
    </V23Card>
  </View>;
}

function friendlyWindowLabel(value: string): string {
  return value.replace(/Race Intent/gi, 'Race priorities').replace(/Strategy Coach/gi, 'Focus block');
}

function friendlyWindowSummary(value: string): string {
  return value.replace(/Race Intent/gi, 'Race priorities').replace(/Strategy Coach/gi, 'temporary focus');
}

function strategyTitle(strategy: CoachSemanticStrategyChange): string {
  if (strategy.primaryFocus) return `${titleCase(strategy.primaryFocus)} focus`;
  return 'Season focus';
}

function strategyDescription(strategy: CoachSemanticStrategyChange): string {
  const lines = Object.entries(strategy.disciplineObjectives)
    .filter(([, objective]) => Boolean(objective))
    .map(([discipline, objective]) => `${titleCase(discipline)} · ${String(objective).replaceAll('_', ' ')}`);
  if (strategy.tradeoffTolerance) lines.push(`Balance · ${strategy.tradeoffTolerance.replaceAll('_', ' ')}`);
  if (strategy.startsAt || strategy.endsAt) lines.push(`Dates · ${strategy.startsAt ?? 'now'} → ${strategy.endsAt ?? 'open-ended'}`);
  if (strategy.racePriority?.objective) lines.push(`Race priority · ${strategy.racePriority.discipline ? `${titleCase(strategy.racePriority.discipline)} · ` : ''}${strategy.racePriority.objective.replaceAll('_', ' ')}`);
  return lines.join('\n');
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    stack: { gap: 17 },
    intro: { gap: 4 },
    eyebrow: { color: tokens.accent, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1 },
    hero: { color: tokens.text, fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: -0.4 },
    title: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '900' },
    body: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19 },
    card: { gap: 11, padding: 17 },
    chatCard: { gap: 12, padding: 17 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerCopy: { flex: 1, minWidth: 0, gap: 2 },
    icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    meta: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
    note: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 17 },
    callout: { borderRadius: 13, backgroundColor: tokens.accentSoft, padding: 11, gap: 3 },
    calloutLabel: { color: tokens.accent, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8 },
    calloutText: { color: tokens.text, fontSize: 12.5, lineHeight: 18, fontWeight: '700' },
    phaseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    phaseCard: { minWidth: '46%', flexGrow: 1, borderRadius: 13, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surfaceMuted, padding: 11, gap: 2 },
    phaseName: { color: tokens.text, fontSize: 14, lineHeight: 18, fontWeight: '800' },
    phaseDates: { color: tokens.textMuted, fontSize: 11, lineHeight: 15 },
    phaseWeeks: { color: tokens.accent, fontSize: 10.5, lineHeight: 14, fontWeight: '800' },
    timeline: { gap: 0 },
    weekRow: { flexDirection: 'row', gap: 11, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    weekRowLast: { borderBottomWidth: 0 },
    weekMarker: { width: 29, height: 29, borderRadius: 10, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    weekNumber: { color: tokens.accent, fontSize: 11.5, fontWeight: '900' },
    weekCopy: { flex: 1, minWidth: 0, gap: 3 },
    weekTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
    weekDate: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16, fontWeight: '800' },
    weekTitle: { color: tokens.text, fontSize: 13.5, lineHeight: 19, fontWeight: '800' },
    weekMeta: { color: tokens.textMuted, fontSize: 11, lineHeight: 15 },
    weekNote: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 15, fontStyle: 'italic' },
    strategyText: { color: tokens.text, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
    thread: { gap: 8, borderRadius: 15, backgroundColor: tokens.surfaceMuted, padding: 10 },
    turnRow: { alignItems: 'flex-start' },
    turnRowAthlete: { alignItems: 'flex-end' },
    bubble: { maxWidth: '89%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, gap: 2 },
    athleteBubble: { backgroundColor: tokens.accentSoft },
    coachBubble: { backgroundColor: tokens.surface },
    turnRole: { color: tokens.textMuted, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8 },
    turnText: { color: tokens.text, fontSize: 13, lineHeight: 18 },
    input: { minHeight: 100, borderRadius: 15, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surfaceMuted, color: tokens.text, fontSize: 15, lineHeight: 21, paddingHorizontal: 13, paddingVertical: 12, textAlignVertical: 'top' },
    send: { minHeight: 47, borderRadius: 14, backgroundColor: tokens.accent, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sendText: { color: '#FFFFFF', fontSize: 14, lineHeight: 19, fontWeight: '800' },
    feedback: { color: tokens.text, fontSize: 12.5, lineHeight: 18, fontWeight: '700' },
    loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 },
    loadingText: { color: tokens.textMuted, fontSize: 13, lineHeight: 18 },
    pressed: { opacity: 0.75 },
    disabled: { opacity: 0.45 },
  });
}
