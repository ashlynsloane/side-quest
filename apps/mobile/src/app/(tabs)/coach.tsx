import type { PlannedStrengthSession, TrainingBlockPlan, TrainingCalendarEvent, WorkoutRecommendationExplanation } from '@circuit/domain';
import { explainPlannedStrengthSession } from '@circuit/planner';
import { COACH_QUICK_SIGNALS, type CoachQuickSignal } from '@circuit/planner/coach-message-adaptation';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActiveWorkoutResumeCard } from '@/components/active-workout-resume-card';
import { CoachClosedLoopPanel, CoachDecisionExplanationPanel } from '@/components/coach-closed-loop';
import { CoachInsights } from '@/components/coach-insights';
import { V23Card, V23Chip, V23Icon, V23OutlineButton, V23PrimaryButton, V23ScenicBanner, V23Screen } from '@/components/v23-ui';
import {
  answerCoachFollowUp,
  applyCoachMessageProposalClosedLoop,
  buildCoachMessageProposalClosedLoop,
  loadCoachClosedLoopDashboard,
  undoLatestCoachIntervention,
} from '@/services/coach-closed-loop-runtime';
import type { CoachClosedLoopSummary, CoachFollowUpResponse } from '@/services/coach-closed-loop-state';
import {
  getLatestTrainingBlock,
  getTodayReadinessCheckIn,
  getTrainingCalendarEvents,
  listCompletedWorkoutSummaries,
  listTrainingCalendarSources,
} from '@/services/database';
import {
  cancelCoachMessageProposal,
  loadCurrentCoachConversation,
  saveCoachMessageProposalSelection,
  type CoachMessageProposal,
} from '@/services/coach-message-adaptation';
import type { CoachConversationState } from '@/services/coach-conversation-state';
import { useTheme } from '@/state/theme-context';
import { useWorkoutContext } from '@/state/workout-context';
import type { DesignTokens } from '@/theme';

export default function CoachTab() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { openPlannedWorkoutPreview, activeWorkout, activePlanLink } = useWorkoutContext();
  const [block, setBlock] = useState<TrainingBlockPlan | null>(null);
  const [events, setEvents] = useState<TrainingCalendarEvent[]>([]);
  const [hasTrainingHistory, setHasTrainingHistory] = useState(false);
  const [hasReadinessData, setHasReadinessData] = useState(false);
  const [hasConnectedTrainingData, setHasConnectedTrainingData] = useState(false);
  const [message, setMessage] = useState('');
  const [quickSignal, setQuickSignal] = useState<CoachQuickSignal | undefined>();
  const [proposal, setProposal] = useState<CoachMessageProposal | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<CoachConversationState | null>(null);
  const [closedLoopSummary, setClosedLoopSummary] = useState<CoachClosedLoopSummary | null>(null);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coachResult, setCoachResult] = useState<string | null>(null);
  const [buildingProposal, setBuildingProposal] = useState(false);
  const [applyingProposal, setApplyingProposal] = useState(false);
  const [closedLoopBusy, setClosedLoopBusy] = useState(false);

  const loadCoachData = useCallback(async (isLive: () => boolean = () => true) => {
    const saved = await getLatestTrainingBlock();
    const nextBlock = saved?.block ?? null;
    const now = new Date();
    const rangeStart = new Date(now);
    rangeStart.setDate(rangeStart.getDate() - 7);
    const rangeEnd = new Date(now);
    rangeEnd.setDate(rangeEnd.getDate() + 21);
    const historyStart = new Date(now);
    historyStart.setDate(historyStart.getDate() - 90);
    const [calendar, history, readiness, sources, thread] = await Promise.all([
      getTrainingCalendarEvents({ from: rangeStart.toISOString(), to: rangeEnd.toISOString() }),
      listCompletedWorkoutSummaries({ from: historyStart.toISOString(), to: now.toISOString() }),
      getTodayReadinessCheckIn(),
      listTrainingCalendarSources(),
      nextBlock ? loadCurrentCoachConversation() : Promise.resolve(null),
    ]);
    if (!isLive()) return;
    setBlock(nextBlock);
    setEvents(calendar);
    setHasTrainingHistory(history.length > 0);
    setHasReadinessData(Boolean(readiness));
    setHasConnectedTrainingData(sources.some((source) => source.active && source.sourceType !== 'manual'));
    setConversation(thread);
    setProposal(thread?.pendingProposal ?? null);
    setSelectedOptionId(thread?.selectedOptionId ?? thread?.pendingProposal?.adaptation.adjustment.recommendedOptionId ?? null);
    setClosedLoopSummary(loadCoachClosedLoopDashboard());
  }, []);

  useFocusEffect(useCallback(() => {
    let live = true;
    void loadCoachData(() => live);
    return () => { live = false; };
  }, [loadCoachData]));

  const sessions = useMemo(() => block?.weeks.flatMap((week) => week.sessions) ?? [], [block]);
  const nextSession = useMemo(() => selectNextSession(sessions), [sessions]);
  const explanation = useMemo<WorkoutRecommendationExplanation | null>(() => {
    if (!nextSession) return null;
    return explainPlannedStrengthSession(nextSession, {
      goal: block?.goal,
      previousSessionDate: previousStrengthDate(nextSession, sessions),
      nextKeyEnduranceDate: nextEnduranceDate(nextSession, events),
      hasTrainingHistory,
      hasConnectedTrainingData,
      hasReadinessData,
    });
  }, [block?.goal, events, hasConnectedTrainingData, hasReadinessData, hasTrainingHistory, nextSession, sessions]);

  function openNextSession() {
    if (!nextSession) return;
    openPlannedWorkoutPreview(nextSession, {
      goal: block?.goal,
      previousSessionDate: previousStrengthDate(nextSession, sessions),
      nextKeyEnduranceDate: nextEnduranceDate(nextSession, events),
      hasTrainingHistory,
      hasConnectedTrainingData,
      hasReadinessData,
    });
    router.push('/workout-preview' as Href);
  }

  async function reviewMessage() {
    if (buildingProposal || applyingProposal || closedLoopBusy) return;
    setBuildingProposal(true);
    setCoachError(null);
    setCoachResult(null);
    try {
      const result = await buildCoachMessageProposalClosedLoop(message, quickSignal);
      if (!result.ok) {
        setConversation(result.conversation ?? conversation);
        setProposal(null);
        setSelectedOptionId(null);
        if (result.reason === 'cancelled') {
          setCoachError(null);
          setCoachResult(result.message);
          setMessage('');
          setQuickSignal(undefined);
        } else {
          setCoachError(result.message);
        }
        return;
      }
      setConversation(result.conversation);
      const optionId = result.conversation.selectedOptionId ?? result.proposal.adaptation.adjustment.recommendedOptionId;
      setProposal(result.proposal);
      setSelectedOptionId(optionId);
      setMessage('');
      setQuickSignal(undefined);
      if (result.autoApply) {
        await applyProposal(result.proposal, optionId);
      }
    } catch (caught) {
      setProposal(null);
      setSelectedOptionId(null);
      setCoachError(caught instanceof Error ? caught.message : 'Side Quest could not build an adaptation proposal.');
    } finally {
      setBuildingProposal(false);
    }
  }

  async function applyProposal(proposalToApply: CoachMessageProposal, optionId: string) {
    if (applyingProposal || closedLoopBusy) return;
    setApplyingProposal(true);
    setCoachError(null);
    try {
      const applied = await applyCoachMessageProposalClosedLoop(proposalToApply, optionId);
      setConversation(applied.conversation);
      setCoachResult(applied.replanWarning ?? `${applied.optionTitle} applied. Side Quest will check how the adjustment worked before learning from it.`);
      setProposal(null);
      setSelectedOptionId(null);
      setMessage('');
      setQuickSignal(undefined);
      await loadCoachData();
    } catch (caught) {
      setCoachError(caught instanceof Error ? caught.message : 'Side Quest could not apply this change.');
    } finally {
      setApplyingProposal(false);
    }
  }

  async function acceptProposal() {
    if (!proposal || !selectedOptionId || applyingProposal || closedLoopBusy) return;
    await applyProposal(proposal, selectedOptionId);
  }

  function selectProposalOption(optionId: string) {
    setSelectedOptionId(optionId);
    void saveCoachMessageProposalSelection(optionId);
  }

  async function keepOriginalPlan() {
    const next = await cancelCoachMessageProposal();
    setConversation(next);
    setProposal(null);
    setSelectedOptionId(null);
    setMessage('');
    setQuickSignal(undefined);
    setCoachError(null);
    setCoachResult('Keeping the original plan.');
  }

  async function handleCoachFollowUp(interventionId: string, response: CoachFollowUpResponse) {
    if (closedLoopBusy || applyingProposal || buildingProposal) return;
    setClosedLoopBusy(true);
    setCoachError(null);
    try {
      const result = await answerCoachFollowUp(interventionId, response);
      setCoachResult(result.message);
      setClosedLoopSummary(result.summary);
      await loadCoachData();
    } catch (caught) {
      setCoachError(caught instanceof Error ? caught.message : 'Side Quest could not save that follow-up.');
    } finally {
      setClosedLoopBusy(false);
    }
  }

  async function handleUndoCoachChange() {
    if (closedLoopBusy || applyingProposal || buildingProposal) return;
    setClosedLoopBusy(true);
    setCoachError(null);
    try {
      const result = await undoLatestCoachIntervention();
      setCoachResult(result.replanWarning ?? result.conversationMessage);
      setProposal(null);
      setSelectedOptionId(null);
      await loadCoachData();
    } catch (caught) {
      setCoachError(caught instanceof Error ? caught.message : 'Side Quest could not safely undo that change.');
    } finally {
      setClosedLoopBusy(false);
    }
  }

  const selectedOption = proposal?.adaptation.adjustment.options.find((option) => option.id === selectedOptionId) ?? null;
  const recentTurns = conversation?.turns.slice(-6) ?? [];
  const hasThread = recentTurns.length > 0;

  return (
    <V23Screen contentStyle={styles.page}>
      {activeWorkout ? <ActiveWorkoutResumeCard workout={activeWorkout} planLink={activePlanLink} onResume={() => router.push('/active-workout' as Href)} compact /> : null}
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>CURRENT COACHING CALL</Text>
        <Text style={styles.title}>{nextSession ? 'Here is the next useful session.' : 'Start with the week.'}</Text>
        <Text style={styles.body}>
          {nextSession
            ? 'This recommendation uses your goal, current plan, schedule, and the training evidence Side Quest can actually see.'
            : 'Side Quest can make a specific recommendation after you set a goal, availability, and race priority.'}
        </Text>
      </View>

      <V23Card elevated style={styles.messageCard}>
        <View style={styles.messageHeader}>
          <View style={styles.messageHeaderCopy}>
            <Text style={styles.callLabel}>{hasThread ? 'CONTINUE WITH SIDE QUEST' : 'TELL SIDE QUEST WHAT CHANGED'}</Text>
            <Text style={styles.messageTitle}>{hasThread ? 'Keep the same coaching thread.' : 'Don’t rewrite the plan yourself.'}</Text>
          </View>
          <View style={styles.messageIcon}><V23Icon name="adjust" color={tokens.accent} size={21} /></View>
        </View>
        <Text style={styles.callBody}>
          {hasThread
            ? 'Reply naturally. Side Quest remembers the session and prior constraint, then re-checks every refinement against the week.'
            : 'Say what is different today. Side Quest will turn it into planner inputs, propose a change, and re-check the week after you approve it.'}
        </Text>

        {hasThread ? (
          <View style={styles.thread}>
            {recentTurns.map((turn) => (
              <View key={turn.id} style={[styles.turnRow, turn.role === 'athlete' && styles.turnRowAthlete]}>
                <View style={[styles.turnBubble, turn.role === 'athlete' ? styles.athleteBubble : styles.coachBubble]}>
                  <Text style={styles.turnRole}>{turn.role === 'athlete' ? 'YOU' : 'SIDE QUEST'}</Text>
                  <Text style={styles.turnText}>{turn.text}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <TextInput
          value={message}
          onChangeText={(value) => { setMessage(value); setCoachError(null); }}
          placeholder={hasThread ? 'Move it to Friday instead…' : 'My legs are sore and I’m not feeling this workout…'}
          placeholderTextColor={tokens.textMuted}
          multiline
          maxLength={500}
          style={styles.messageInput}
          accessibilityLabel="Tell Side Quest what changed"
        />
        <View style={styles.quickSignals}>
          {COACH_QUICK_SIGNALS.map((signal) => {
            const selected = quickSignal === signal.id;
            return (
              <Pressable
                key={signal.id}
                onPress={() => { setQuickSignal(selected ? undefined : signal.id); setCoachError(null); }}
                style={({ pressed }) => [styles.quickSignal, selected && styles.quickSignalSelected, pressed && styles.pressed]}
              >
                <Text style={[styles.quickSignalText, selected && styles.quickSignalTextSelected]}>{signal.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => void reviewMessage()}
          disabled={buildingProposal || applyingProposal || closedLoopBusy || (!message.trim() && !quickSignal)}
          style={({ pressed }) => [
            styles.reviewButton,
            (!message.trim() && !quickSignal) && styles.reviewButtonDisabled,
            pressed && styles.pressed,
          ]}
        >
          {buildingProposal ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.reviewButtonText}>{hasThread ? 'Send update' : 'Review adaptation'}</Text><V23Icon name="chevron" color="#FFFFFF" size={18} /></>}
        </Pressable>
        <Text style={styles.messageFootnote}>The conversation supplies context. The planner still decides whether a requested move, replacement, or load change actually fits.</Text>
      </V23Card>

      {coachError ? <V23Card tone="muted" style={styles.feedbackCard}><Text style={styles.errorText}>{coachError}</Text></V23Card> : null}
      {coachResult ? <V23Card tone="accent" style={styles.feedbackCard}><Text style={styles.resultText}>{coachResult}</Text></V23Card> : null}

      <CoachClosedLoopPanel
        summary={closedLoopSummary}
        busy={closedLoopBusy || applyingProposal || buildingProposal}
        onOutcome={(interventionId, response) => void handleCoachFollowUp(interventionId, response)}
        onUndo={() => void handleUndoCoachChange()}
      />

      {proposal ? (
        <V23Card elevated style={styles.proposalCard}>
          <Text style={styles.callLabel}>SIDE QUEST READ THAT AS</Text>
          <Text style={styles.proposalSummary}>{proposal.adaptation.interpretation.summary}</Text>
          <View style={styles.chips}>
            {proposal.adaptation.interpretation.signals.map((signal) => <V23Chip key={signal} tone="neutral">{signal}</V23Chip>)}
            <V23Chip tone="info">{proposal.adaptation.interpretation.confidence} confidence</V23Chip>
          </View>
          <View style={styles.proposalDivider} />
          <Text style={styles.proposalFor}>For {proposal.sessionTitle} · {formatSessionDate(proposal.sessionDate)}</Text>
          <Text style={styles.proposalHeadline}>{proposal.adaptation.adjustment.headline}</Text>
          {proposal.adaptation.adjustment.safetyMessage ? <Text style={styles.safetyText}>{proposal.adaptation.adjustment.safetyMessage}</Text> : null}
          <CoachDecisionExplanationPanel explanation={proposal.decisionExplanation} />

          <View style={styles.optionList}>
            {proposal.adaptation.adjustment.options.map((option) => {
              const selected = option.id === selectedOptionId;
              const recommended = option.id === proposal.adaptation.adjustment.recommendedOptionId;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => selectProposalOption(option.id)}
                  style={({ pressed }) => [styles.optionCard, selected && styles.optionCardSelected, pressed && styles.pressed]}
                >
                  <View style={styles.optionTop}>
                    <Text style={styles.optionLabel}>{recommended ? 'RECOMMENDED' : option.recommendationLevel.toUpperCase()}</Text>
                    <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
                  </View>
                  <Text style={styles.optionTitle}>{option.title}</Text>
                  <Text style={styles.optionBody}>{option.description}</Text>
                  {selected ? (
                    <View style={styles.consequenceBox}>
                      <Text style={styles.consequenceLabel}>EFFECT ON THE WEEK</Text>
                      {option.weeklyConsequences.map((line) => <Text key={line} style={styles.consequenceText}>• {line}</Text>)}
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.followUpHint}>You can also reply above: “move it to Friday,” “make it 30 minutes,” “I’d rather swim,” or “actually I feel worse.”</Text>
          {selectedOption ? <Text style={styles.approvalNote}>{selectedOption.requiresApproval ? 'This changes a meaningful part of the plan, so Side Quest will not apply it until you approve.' : 'You are still in control: nothing changes until you approve.'}</Text> : null}
          <V23PrimaryButton onPress={() => void acceptProposal()} icon="check">{applyingProposal ? 'Applying…' : 'Accept this change'}</V23PrimaryButton>
          <V23OutlineButton onPress={() => void keepOriginalPlan()}>Keep original plan</V23OutlineButton>
        </V23Card>
      ) : null}

      {nextSession && explanation ? (
        <>
          <V23Card elevated style={styles.nextCard}>
            <View style={styles.nextHeader}>
              <View style={styles.nextCopy}>
                <Text style={styles.callLabel}>NEXT PLANNED STRENGTH</Text>
                <Text style={styles.callTitle}>{nextSession.title}</Text>
                <Text style={styles.dateText}>{formatSessionDate(nextSession.date)}</Text>
              </View>
              <View style={styles.icon}><V23Icon name="train" color={tokens.accent} size={22} /></View>
            </View>
            <View style={styles.chips}>
              <V23Chip>{nextSession.intendedLoad} load</V23Chip>
              <V23Chip tone="neutral">{Math.round(nextSession.workout.estimatedElapsedSeconds / 60)} min</V23Chip>
              <V23Chip tone="neutral">{nextSession.purpose.replaceAll('_', ' ')}</V23Chip>
            </View>
            <V23PrimaryButton onPress={openNextSession} icon="play">Review workout</V23PrimaryButton>
          </V23Card>
          <CoachInsights explanation={explanation} initiallyExpanded />
        </>
      ) : (
        <>
          <V23ScenicBanner variant="morning" />
          <V23Card elevated style={styles.callCard}>
            <View style={styles.callTop}>
              <View style={styles.nextCopy}>
                <Text style={styles.callLabel}>BEST NEXT MOVE</Text>
                <Text style={styles.callTitle}>Build a provisional week</Text>
              </View>
              <View style={styles.icon}><V23Icon name="goal" color={tokens.accent} size={22} /></View>
            </View>
            <Text style={styles.callBody}>You do not need perfect data. Start with what you know, then let the plan adapt as workouts arrive.</Text>
            <V23PrimaryButton onPress={() => router.push('/goal-catalog' as Href)}>Create my week</V23PrimaryButton>
          </V23Card>
        </>
      )}

      <View style={styles.questions}>
        {[
          ['What changed?', 'Review recent adjustments and activity matches.', '/weekly-review'],
          ['What needs attention?', 'Open the training body map and regional priorities.', '/insights'],
          ['How does this work?', 'Review the evidence and limits behind coaching decisions.', '/training-intelligence'],
        ].map(([title, body, route], index, rows) => (
          <Pressable
            key={title}
            onPress={() => router.push(route as Href)}
            style={({ pressed }) => [styles.question, index === rows.length - 1 && styles.questionLast, pressed && styles.pressed]}
          >
            <View style={styles.questionCopy}>
              <Text style={styles.questionTitle}>{title}</Text>
              <Text style={styles.questionBody}>{body}</Text>
            </View>
            <V23Icon name="chevron" color={tokens.textMuted} size={17} />
          </Pressable>
        ))}
      </View>
    </V23Screen>
  );
}

function selectNextSession(sessions: PlannedStrengthSession[]): PlannedStrengthSession | null {
  if (!sessions.length) return null;
  const today = localDate();
  const upcoming = sessions
    .filter((session) => (session.completionStatus === 'planned' || session.completionStatus === 'modified') && session.date >= today)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (upcoming[0]) return upcoming[0];
  return sessions
    .filter((session) => session.completionStatus === 'planned' || session.completionStatus === 'modified')
    .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null;
}

function previousStrengthDate(session: PlannedStrengthSession, sessions: PlannedStrengthSession[]): string | undefined {
  return sessions
    .filter((candidate) => candidate.id !== session.id && candidate.date < session.date)
    .sort((left, right) => right.date.localeCompare(left.date))[0]?.date;
}

function nextEnduranceDate(session: PlannedStrengthSession, events: TrainingCalendarEvent[]): string | undefined {
  return events
    .filter((event) => event.startAt.slice(0, 10) >= session.date && event.discipline !== 'strength' && event.discipline !== 'rest')
    .sort((left, right) => left.startAt.localeCompare(right.startAt))[0]?.startAt.slice(0, 10);
}

function formatSessionDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { gap: 18, paddingTop: 22 },
    intro: { gap: 6 },
    eyebrow: { color: tokens.accent, fontSize: 11, lineHeight: 14, fontWeight: '900', letterSpacing: 1.25 },
    title: { color: tokens.text, fontSize: 31, lineHeight: 36, fontWeight: '900', letterSpacing: -0.7 },
    body: { color: tokens.textMuted, fontSize: 15.5, lineHeight: 22 },
    messageCard: { gap: 13, padding: 18 },
    messageHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    messageHeaderCopy: { flex: 1, minWidth: 0 },
    messageTitle: { color: tokens.text, fontSize: 21, lineHeight: 26, fontWeight: '900', marginTop: 3 },
    messageIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    thread: { gap: 8, borderRadius: 16, backgroundColor: tokens.surfaceMuted, padding: 10 },
    turnRow: { alignItems: 'flex-start' },
    turnRowAthlete: { alignItems: 'flex-end' },
    turnBubble: { maxWidth: '88%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, gap: 2 },
    athleteBubble: { backgroundColor: tokens.accentSoft },
    coachBubble: { backgroundColor: tokens.surface },
    turnRole: { color: tokens.textMuted, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8 },
    turnText: { color: tokens.text, fontSize: 13.5, lineHeight: 19 },
    messageInput: { minHeight: 92, borderRadius: 16, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surfaceMuted, color: tokens.text, fontSize: 16, lineHeight: 22, paddingHorizontal: 14, paddingVertical: 12, textAlignVertical: 'top' },
    quickSignals: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    quickSignal: { minHeight: 36, borderRadius: 18, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
    quickSignalSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent },
    quickSignalText: { color: tokens.textMuted, fontSize: 13, lineHeight: 17, fontWeight: '700' },
    quickSignalTextSelected: { color: tokens.accent },
    reviewButton: { minHeight: 48, borderRadius: 15, backgroundColor: tokens.accent, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    reviewButtonDisabled: { opacity: 0.42 },
    reviewButtonText: { color: '#FFFFFF', fontSize: 15.5, lineHeight: 20, fontWeight: '800' },
    messageFootnote: { color: tokens.textMuted, fontSize: 12, lineHeight: 17 },
    feedbackCard: { padding: 14 },
    errorText: { color: tokens.danger, fontSize: 13.5, lineHeight: 19, fontWeight: '700' },
    resultText: { color: tokens.text, fontSize: 13.5, lineHeight: 19, fontWeight: '700' },
    proposalCard: { gap: 12, padding: 18 },
    proposalSummary: { color: tokens.text, fontSize: 20, lineHeight: 26, fontWeight: '800' },
    proposalDivider: { height: StyleSheet.hairlineWidth, backgroundColor: tokens.border },
    proposalFor: { color: tokens.textMuted, fontSize: 13, lineHeight: 18, fontWeight: '700' },
    proposalHeadline: { color: tokens.text, fontSize: 23, lineHeight: 28, fontWeight: '900' },
    safetyText: { color: tokens.danger, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
    optionList: { gap: 9 },
    optionCard: { borderRadius: 16, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 14, gap: 5 },
    optionCardSelected: { borderColor: tokens.accent, borderWidth: 2, backgroundColor: tokens.accentSoft },
    optionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    optionLabel: { color: tokens.accent, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1 },
    optionTitle: { color: tokens.text, fontSize: 17, lineHeight: 22, fontWeight: '800' },
    optionBody: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19 },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' },
    radioSelected: { borderColor: tokens.accent },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: tokens.accent },
    consequenceBox: { marginTop: 4, gap: 3 },
    consequenceLabel: { color: tokens.text, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0.9 },
    consequenceText: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18 },
    followUpHint: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18, fontStyle: 'italic' },
    approvalNote: { color: tokens.textMuted, fontSize: 12, lineHeight: 17 },
    nextCard: { gap: 16, padding: 20 },
    nextHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    nextCopy: { flex: 1, minWidth: 0 },
    callCard: { gap: 16, padding: 20 },
    callTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    callLabel: { color: tokens.accent, fontSize: 10.5, lineHeight: 14, fontWeight: '900', letterSpacing: 1.1 },
    callTitle: { color: tokens.text, fontSize: 23, lineHeight: 28, fontWeight: '900', marginTop: 3 },
    dateText: { color: tokens.textMuted, fontSize: 14, lineHeight: 19, marginTop: 4 },
    callBody: { color: tokens.textMuted, fontSize: 15, lineHeight: 22 },
    icon: { width: 48, height: 48, borderRadius: 16, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    questions: { backgroundColor: tokens.surface, borderRadius: 22, borderWidth: 1, borderColor: tokens.border, overflow: 'hidden' },
    question: { minHeight: 78, paddingHorizontal: 17, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    questionLast: { borderBottomWidth: 0 },
    questionCopy: { flex: 1, gap: 2 },
    questionTitle: { color: tokens.text, fontSize: 16.5, lineHeight: 21, fontWeight: '800' },
    questionBody: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19 },
    pressed: { opacity: 0.7 },
  });
}
