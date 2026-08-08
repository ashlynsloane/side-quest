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
      setFeedback(result.needsClarification ? result.response : 'Strategy draft updated. Review the draft below before applying it.');
      await reload();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Side Quest could not update the strategy conversation.');
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
      setFeedback('Strategy approved. The block was reconciled with Race Intent remaining underneath it as the baseline.');
      await reload();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Side Quest could not apply that strategy safely.');
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
      setFeedback('Draft discarded. The approved strategy and Race Intent were left unchanged.');
      await reload();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Side Quest could not discard that strategy draft.');
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
      setFeedback('Strategy Coach override removed. Race Intent is again the long-horizon planning baseline.');
      await reload();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Side Quest could not remove that strategy safely.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator color={tokens.accent} /><Text style={styles.loadingText}>Building strategy horizon…</Text></View>;
  if (!workspace) return <V23Card elevated style={styles.card}><Text style={styles.title}>Build a race plan first.</Text><Text style={styles.body}>Strategy Coach needs an event goal and a generated whole-athlete block before it can reason across weeks.</Text></V23Card>;

  const review = workspace.review;
  const draft = review.hasUnapprovedChanges ? review.draft : undefined;
  const approved = review.approved?.strategy;
  const turns = workspace.conversation.turns.slice(-10);
  const macro = workspace.macrocycle;

  return <View style={styles.stack}>
    <View style={styles.intro}>
      <Text style={styles.eyebrow}>LONG-HORIZON COACHING</Text>
      <Text style={styles.hero}>Shape the next training blocks.</Text>
      <Text style={styles.body}>Use Strategy for priorities that span weeks or months. Daily workout changes, soreness, and immediate schedule problems still belong in Today.</Text>
    </View>

    <V23Card elevated style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.icon}><V23Icon name="goal" color={tokens.accent} size={20} /></View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>STRATEGY HORIZON</Text>
          <Text style={styles.title}>{workspace.goalName}</Text>
        </View>
        <V23Chip tone={macro.approvedWindowState === 'active' ? 'info' : macro.approvedWindowState === 'scheduled' ? 'warm' : 'neutral'}>{strategyWindowLabel(workspace)}</V23Chip>
      </View>
      {workspace.eventDate ? <Text style={styles.meta}>Race · {formatStrategyWeek(workspace.eventDate)}</Text> : null}
      <Text style={styles.body}>{strategyWindowSummary(workspace)}</Text>
      {macro.strategyContinuesBeyondBlock ? <Text style={styles.note}>This strategy continues beyond the currently generated block. Side Quest will carry the approved intent forward when the next block is created, subject to its date window.</Text> : null}
      {macro.nextPhaseTransition ? <View style={styles.callout}>
        <Text style={styles.calloutLabel}>NEXT PHASE SHIFT</Text>
        <Text style={styles.calloutText}>{phaseLabel(macro.nextPhaseTransition.from)} → {phaseLabel(macro.nextPhaseTransition.to)} · {formatStrategyWeek(macro.nextPhaseTransition.startsAt)}</Text>
      </View> : null}
    </V23Card>

    <V23Card elevated style={styles.card}>
      <Text style={styles.eyebrow}>PHASE ROADMAP</Text>
      <Text style={styles.title}>How the block changes over time</Text>
      <View style={styles.phaseGrid}>
        {macro.phases.map((phase) => <View key={`${phase.phase}_${phase.startDate}`} style={styles.phaseCard}>
          <Text style={styles.phaseName}>{phaseLabel(phase.phase)}</Text>
          <Text style={styles.phaseDates}>{formatStrategyWeek(phase.startDate)} – {formatStrategyWeek(phase.endDate)}</Text>
          <Text style={styles.phaseWeeks}>{phase.weeks} week{phase.weeks === 1 ? '' : 's'}</Text>
        </View>)}
      </View>
    </V23Card>

    <V23Card elevated style={styles.card}>
      <Text style={styles.eyebrow}>BLOCK TIMELINE</Text>
      <Text style={styles.title}>What each week is trying to do</Text>
      <View style={styles.timeline}>
        {macro.weeks.map((week, index) => <View key={week.weekStartDate} style={[styles.weekRow, index === macro.weeks.length - 1 && styles.weekRowLast]}>
          <View style={styles.weekMarker}><Text style={styles.weekNumber}>{index + 1}</Text></View>
          <View style={styles.weekCopy}>
            <View style={styles.weekTop}>
              <Text style={styles.weekDate}>{formatStrategyWeek(week.weekStartDate)}</Text>
              <V23Chip tone={week.source === 'strategy_coach' ? 'info' : 'neutral'}>{week.source === 'strategy_coach' ? 'Strategy Coach' : 'Race Intent'}</V23Chip>
            </View>
            <Text style={styles.weekTitle}>{phaseLabel(week.phase)} · {week.expression.headline}</Text>
            <Text style={styles.weekMeta}>{week.plannedMinutes} min planned · {week.expression.state.replaceAll('_', ' ')}</Text>
            {week.overrideWindowState === 'scheduled' ? <Text style={styles.weekNote}>Strategy Coach window has not started yet.</Text> : null}
            {week.overrideWindowState === 'expired' ? <Text style={styles.weekNote}>Strategy Coach window has ended; Race Intent is back in control.</Text> : null}
          </View>
        </View>)}
      </View>
    </V23Card>

    {(draft || approved) ? <V23Card elevated style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{draft ? 'STRATEGY DRAFT' : 'APPROVED STRATEGY'}</Text>
          <Text style={styles.title}>{strategyTitle(draft ?? approved!)}</Text>
        </View>
        {draft ? <V23Chip tone="warm">Approval required</V23Chip> : <V23Chip tone="info">Saved</V23Chip>}
      </View>
      <Text style={styles.strategyText}>{strategyDescription(draft ?? approved!)}</Text>
      {draft ? <>
        <Text style={styles.note}>Nothing changes until you approve this draft. Applying it reconciles every generated week through the same race, safety, phase, and time-budget rules.</Text>
        <V23PrimaryButton onPress={() => void applyDraft()} icon="check">{busy ? 'Applying…' : 'Apply strategy'}</V23PrimaryButton>
        <V23OutlineButton onPress={() => void discardDraft()}>Discard draft</V23OutlineButton>
      </> : <>
        <Text style={styles.note}>{macro.approvedWindowState === 'expired' ? 'This saved strategy is no longer affecting the plan because its window ended.' : 'Race Intent remains underneath this override and automatically resumes outside the strategy window.'}</Text>
        <V23OutlineButton onPress={() => void stopStrategy()}>{macro.approvedWindowState === 'expired' ? 'Clear saved strategy' : 'Stop strategy now'}</V23OutlineButton>
      </>}
    </V23Card> : null}

    <V23Card elevated style={styles.chatCard}>
      <View style={styles.cardHeader}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>STRATEGY CONVERSATION</Text>
          <Text style={styles.title}>Talk in weeks and months.</Text>
        </View>
        <View style={styles.icon}><V23Icon name="adjust" color={tokens.accent} size={20} /></View>
      </View>
      <Text style={styles.body}>Examples: “For the next 8 weeks, bike is my main focus while I maintain swim and run,” “Actually I want to develop the run too,” or “Do that until November.”</Text>
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
        accessibilityLabel="Talk to Strategy Coach"
      />
      <Pressable
        onPress={() => void sendMessage()}
        disabled={busy || !message.trim()}
        style={({ pressed }) => [styles.send, (!message.trim() || busy) && styles.disabled, pressed && styles.pressed]}
      >
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.sendText}>Update strategy draft</Text><V23Icon name="chevron" color="#FFFFFF" size={18} /></>}
      </Pressable>
      {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
      <Text style={styles.note}>Strategy conversation only changes the semantic draft. The whole-athlete plan is not mutated until you approve the draft above.</Text>
    </V23Card>
  </View>;
}

function strategyTitle(strategy: CoachSemanticStrategyChange): string {
  if (strategy.primaryFocus) return `${titleCase(strategy.primaryFocus)} focus`;
  return 'Long-horizon allocation';
}

function strategyDescription(strategy: CoachSemanticStrategyChange): string {
  const lines = Object.entries(strategy.disciplineObjectives)
    .filter(([, objective]) => Boolean(objective))
    .map(([discipline, objective]) => `${titleCase(discipline)} · ${String(objective).replaceAll('_', ' ')}`);
  if (strategy.tradeoffTolerance) lines.push(`Tradeoff · ${strategy.tradeoffTolerance.replaceAll('_', ' ')}`);
  if (strategy.startsAt || strategy.endsAt) lines.push(`Window · ${strategy.startsAt ?? 'now'} → ${strategy.endsAt ?? 'open-ended'}`);
  if (strategy.racePriority?.objective) lines.push(`Race priority · ${strategy.racePriority.discipline ? `${titleCase(strategy.racePriority.discipline)} · ` : ''}${strategy.racePriority.objective.replaceAll('_', ' ')}`);
  return lines.join('\n');
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    stack: { gap: 18 },
    intro: { gap: 6 },
    eyebrow: { color: tokens.accent, fontSize: 10.5, lineHeight: 14, fontWeight: '900', letterSpacing: 1.05 },
    hero: { color: tokens.text, fontSize: 30, lineHeight: 35, fontWeight: '900', letterSpacing: -0.6 },
    title: { color: tokens.text, fontSize: 19, lineHeight: 24, fontWeight: '900' },
    body: { color: tokens.textMuted, fontSize: 14.5, lineHeight: 21 },
    card: { gap: 12, padding: 17 },
    chatCard: { gap: 13, padding: 17 },
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
