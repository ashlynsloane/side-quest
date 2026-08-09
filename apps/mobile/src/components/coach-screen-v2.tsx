import type {
  PlannedStrengthSession,
  TrainingBlockPlan,
  TrainingCalendarEvent,
  WorkoutRecommendationExplanation,
} from '@circuit/domain';
import { explainPlannedStrengthSession } from '@circuit/planner';
import { COACH_QUICK_SIGNALS, type CoachQuickSignal } from '@circuit/planner/coach-message-adaptation';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActiveWorkoutResumeCard } from '@/components/active-workout-resume-card';
import { CoachClosedLoopPanel, CoachDecisionExplanationPanel } from '@/components/coach-closed-loop';
import { CoachInsights } from '@/components/coach-insights';
import { CoachOperatingInboxPanel } from '@/components/coach-operating-inbox';
import { ProductAction, ProductDisclosure } from '@/components/product-ui';
import { SportIcon, normalizeSportKind } from '@/components/sport-icon';
import { V23Icon, V23Screen } from '@/components/v23-ui';
import {
  answerCoachFollowUp,
  applyCoachMessageProposalClosedLoop,
  buildCoachMessageProposalClosedLoop,
  loadCoachClosedLoopDashboard,
  undoLatestCoachIntervention,
} from '@/services/coach-closed-loop-runtime';
import type { CoachClosedLoopSummary, CoachFollowUpResponse } from '@/services/coach-closed-loop-state';
import { refreshCoachObservedOutcomes } from '@/services/coach-observed-outcomes';
import { buildCoachOperatingInbox, type CoachOperatingInboxItem } from '@/services/coach-operating-inbox';
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

export default function CoachScreenV2() {
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
  const [coachInbox, setCoachInbox] = useState<CoachOperatingInboxItem[]>([]);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coachResult, setCoachResult] = useState<string | null>(null);
  const [buildingProposal, setBuildingProposal] = useState(false);
  const [applyingProposal, setApplyingProposal] = useState(false);
  const [closedLoopBusy, setClosedLoopBusy] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [reasoningExpanded, setReasoningExpanded] = useState(false);

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
    const [calendar, history, readiness, sources, thread, observed] = await Promise.all([
      getTrainingCalendarEvents({ from: rangeStart.toISOString(), to: rangeEnd.toISOString() }),
      listCompletedWorkoutSummaries({ from: historyStart.toISOString(), to: now.toISOString() }),
      getTodayReadinessCheckIn(),
      listTrainingCalendarSources(),
      nextBlock ? loadCurrentCoachConversation() : Promise.resolve(null),
      nextBlock ? refreshCoachObservedOutcomes() : Promise.resolve([]),
    ]);
    if (!isLive()) return;
    const summary = nextBlock ? loadCoachClosedLoopDashboard(nextBlock.id) : null;
    setBlock(nextBlock);
    setEvents(calendar);
    setHasTrainingHistory(history.length > 0);
    setHasReadinessData(Boolean(readiness));
    setHasConnectedTrainingData(sources.some((source) => source.active && source.sourceType !== 'manual'));
    setConversation(thread);
    setProposal(thread?.pendingProposal ?? null);
    setSelectedOptionId(thread?.selectedOptionId ?? thread?.pendingProposal?.adaptation.adjustment.recommendedOptionId ?? null);
    setClosedLoopSummary(summary);
    setCoachInbox(buildCoachOperatingInbox({ block: nextBlock, calendarEvents: calendar, closedLoop: summary, observedOutcomes: observed, now: now.toISOString() }));
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

  const selectedOption = proposal?.adaptation.adjustment.options.find((option) => option.id === selectedOptionId) ?? null;
  const recentTurns = conversation?.turns.slice(-8) ?? [];
  const hasThread = recentTurns.length > 0;
  const followUpDue = Boolean(closedLoopSummary?.dueFollowUp);
  const busy = buildingProposal || applyingProposal || closedLoopBusy;

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
    if (busy) return;
    setBuildingProposal(true);
    setCoachError(null);
    setCoachResult(null);
    try {
      const result = await buildCoachMessageProposalClosedLoop(message, quickSignal);
      if (!result.ok) {
        setConversation(result.conversation ?? conversation);
        setProposal(null);
        setSelectedOptionId(null);
        if (result.reason === 'cancelled' || result.reason === 'needs_clarification') {
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
      if (result.autoApply) await applyProposal(result.proposal, optionId);
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
      setCoachResult(applied.replanWarning ?? `${applied.optionTitle} applied. Side Quest will check the result before learning from it.`);
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
    if (!proposal || !selectedOptionId || busy) return;
    await applyProposal(proposal, selectedOptionId);
  }

  function selectProposalOption(optionId: string) {
    setSelectedOptionId(optionId);
    void saveCoachMessageProposalSelection(optionId);
  }

  async function keepOriginalPlan() {
    if (busy) return;
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
    if (busy) return;
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
    if (busy) return;
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

  return <V23Screen contentStyle={styles.page}>
    {activeWorkout ? <ActiveWorkoutResumeCard workout={activeWorkout} planLink={activePlanLink} onResume={() => router.push('/active-workout' as Href)} compact /> : null}

    <CoachOperatingInboxPanel items={coachInbox} />

    <CurrentCall session={nextSession} onOpen={openNextSession} tokens={tokens} styles={styles} />

    <View style={styles.conversationSection}>
      <View style={styles.conversationHeading}>
        <View style={styles.conversationHeadingCopy}>
          <Text style={styles.eyebrow}>{hasThread ? 'COACH THREAD' : 'WHAT CHANGED?'}</Text>
          <Text style={styles.title}>{hasThread ? 'Keep talking.' : 'Your plan can handle a change.'}</Text>
          <Text style={styles.body}>{hasThread
            ? 'Add anything that changed since the last message.'
            : 'Tell Coach about soreness, energy, time, access, or schedule changes.'}</Text>
        </View>
      </View>

      {hasThread ? <View style={styles.thread}>
        {recentTurns.map((turn) => <View key={turn.id} style={[styles.turnRow, turn.role === 'athlete' && styles.turnRowAthlete]}>
          <View style={[styles.turnBubble, turn.role === 'athlete' ? styles.athleteBubble : styles.coachBubble]}>
            <Text style={styles.turnRole}>{turn.role === 'athlete' ? 'YOU' : 'SIDE QUEST'}</Text>
            <Text style={styles.turnText}>{turn.text}</Text>
          </View>
        </View>)}
      </View> : null}

      {coachResult ? <View style={styles.inlineFeedback}><V23Icon name="info" color={tokens.accent} size={16} /><Text style={styles.inlineFeedbackText}>{coachResult}</Text></View> : null}
      {coachError ? <View style={[styles.inlineFeedback, styles.errorFeedback]}><V23Icon name="info" color={tokens.danger} size={16} /><Text style={[styles.inlineFeedbackText, styles.errorText]}>{coachError}</Text></View> : null}

      <View style={styles.composer}>
        <TextInput
          value={message}
          onChangeText={(value) => { setMessage(value); setCoachError(null); }}
          placeholder={hasThread ? 'Tell Side Quest what changed next…' : 'My legs are sore after yesterday’s ride…'}
          placeholderTextColor={tokens.textMuted}
          multiline
          maxLength={500}
          style={styles.messageInput}
          accessibilityLabel="Tell Side Quest what changed"
        />
        <View style={styles.quickSignals}>
          {COACH_QUICK_SIGNALS.map((signal) => {
            const selected = quickSignal === signal.id;
            return <Pressable
              key={signal.id}
              onPress={() => { setQuickSignal(selected ? undefined : signal.id); setCoachError(null); }}
              style={({ pressed }) => [styles.quickSignal, selected && styles.quickSignalSelected, pressed && styles.pressed]}
            ><Text style={[styles.quickSignalText, selected && styles.quickSignalTextSelected]}>{signal.label}</Text></Pressable>;
          })}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => void reviewMessage()}
          disabled={busy || (!message.trim() && !quickSignal)}
          style={({ pressed }) => [styles.sendButton, (busy || (!message.trim() && !quickSignal)) && styles.disabled, pressed && styles.pressed]}
        >
          {buildingProposal ? <ActivityIndicator color="#FFFFFF" /> : <>
            <Text style={styles.sendButtonText}>{hasThread ? 'Send' : 'Review with Coach'}</Text>
            <V23Icon name="chevron" color="#FFFFFF" size={17} />
          </>}
        </Pressable>
      </View>
      <Text style={styles.composerFootnote}>You’ll see any meaningful plan change before it is applied.</Text>
    </View>

    {proposal ? <ProposalReview
      proposal={proposal}
      selectedOptionId={selectedOptionId}
      selectedOption={selectedOption}
      applying={applyingProposal}
      onSelect={selectProposalOption}
      onAccept={() => void acceptProposal()}
      onKeep={() => void keepOriginalPlan()}
      tokens={tokens}
      styles={styles}
    /> : null}

    <ProductDisclosure
      title={followUpDue ? 'Coach follow-up' : 'Recent changes'}
      summary={followUpDue ? 'How did the last adjustment go?' : 'Recent adjustments and undo.'}
      expanded={followUpDue || historyExpanded}
      onPress={() => { if (!followUpDue) setHistoryExpanded((value) => !value); }}
    >
      <CoachClosedLoopPanel
        summary={closedLoopSummary}
        busy={busy}
        onOutcome={(interventionId, response) => void handleCoachFollowUp(interventionId, response)}
        onUndo={() => void handleUndoCoachChange()}
      />
    </ProductDisclosure>

    {nextSession && explanation ? <ProductDisclosure
      title="Why this session?"
      summary={explanation.conciseWhy[0] ?? 'See why this workout is here.'}
      expanded={reasoningExpanded}
      onPress={() => setReasoningExpanded((value) => !value)}
    >
      <CoachInsights explanation={explanation} />
      <View style={styles.reasoningActions}>
        <ProductAction label="Review workout" onPress={openNextSession} />
        <ProductAction label="Open week" variant="secondary" onPress={() => router.push('/plan' as Href)} />
      </View>
    </ProductDisclosure> : null}

    {!block ? <View style={styles.noPlan}>
      <Text style={styles.eyebrow}>NO ACTIVE PLAN</Text>
      <Text style={styles.noPlanTitle}>Build a plan first</Text>
      <Text style={styles.noPlanBody}>Coach works from your current training week.</Text>
      <ProductAction label="Build my plan" onPress={() => router.push('/goal-plan' as Href)} />
    </View> : null}
  </V23Screen>;
}

function CurrentCall({ session, onOpen, tokens, styles }: {
  session: PlannedStrengthSession | null;
  onOpen: () => void;
  tokens: DesignTokens;
  styles: ReturnType<typeof makeStyles>;
}) {
  if (!session) return <View style={styles.currentCallEmpty}>
    <View style={styles.currentCallCopy}>
      <Text style={styles.eyebrow}>NEXT STRENGTH</Text>
      <Text style={styles.currentCallTitle}>No upcoming strength session.</Text>
    </View>
  </View>;
  return <View style={styles.currentCall}>
    <SportIcon kind={normalizeSportKind('strength')} color={tokens.accent} backgroundColor={tokens.accentSoft} size={20} />
    <View style={styles.currentCallCopy}>
      <Text style={styles.eyebrow}>NEXT STRENGTH</Text>
      <Text style={styles.currentCallTitle}>{session.title}</Text>
      <Text style={styles.currentCallMeta}>{formatSessionDate(session.date)} · {Math.round(session.workout.estimatedElapsedSeconds / 60)} min · {friendlyLoad(session.intendedLoad)}</Text>
    </View>
    <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.currentCallAction, pressed && styles.pressed]}>
      <Text style={styles.currentCallActionText}>Open</Text><V23Icon name="chevron" color={tokens.accent} size={13} />
    </Pressable>
  </View>;
}

function ProposalReview({
  proposal,
  selectedOptionId,
  selectedOption,
  applying,
  onSelect,
  onAccept,
  onKeep,
  tokens,
  styles,
}: {
  proposal: CoachMessageProposal;
  selectedOptionId: string | null;
  selectedOption: CoachMessageProposal['adaptation']['adjustment']['options'][number] | null;
  applying: boolean;
  onSelect: (optionId: string) => void;
  onAccept: () => void;
  onKeep: () => void;
  tokens: DesignTokens;
  styles: ReturnType<typeof makeStyles>;
}) {
  return <View style={styles.proposalShell}>
    <View style={styles.proposalHeading}>
      <View style={styles.proposalHeadingCopy}>
        <Text style={styles.eyebrow}>PROPOSED CHANGE</Text>
        <Text style={styles.proposalTitle}>{proposal.adaptation.adjustment.headline}</Text>
        <Text style={styles.proposalInterpretation}>{proposal.adaptation.interpretation.summary}</Text>
      </View>
      <View style={styles.proposalBadge}><Text style={styles.proposalBadgeText}>{proposal.adaptation.interpretation.confidence.toUpperCase()}</Text></View>
    </View>

    <View style={styles.beforeAfter}>
      <View style={styles.beforeAfterCell}>
        <Text style={styles.beforeAfterLabel}>CURRENT</Text>
        <Text style={styles.beforeAfterTitle}>{proposal.sessionTitle}</Text>
        <Text style={styles.beforeAfterBody}>{formatSessionDate(proposal.sessionDate)} · {friendlyDiscipline(proposal.sessionDiscipline)}</Text>
      </View>
      <View style={styles.arrowCircle}><Text style={styles.arrowText}>→</Text></View>
      <View style={[styles.beforeAfterCell, styles.afterCell]}>
        <Text style={styles.beforeAfterLabel}>PROPOSED</Text>
        <Text style={styles.beforeAfterTitle}>{selectedOption?.title ?? 'Choose an option'}</Text>
        <Text style={styles.beforeAfterBody}>{selectedOption?.description ?? 'Choose an option to see how it changes the week.'}</Text>
      </View>
    </View>

    {proposal.adaptation.adjustment.safetyMessage ? <View style={styles.safetyCallout}><V23Icon name="heart" color={tokens.danger} size={17} /><Text style={styles.safetyText}>{proposal.adaptation.adjustment.safetyMessage}</Text></View> : null}

    <View style={styles.optionList}>
      {proposal.adaptation.adjustment.options.map((option) => {
        const selected = option.id === selectedOptionId;
        const recommended = option.id === proposal.adaptation.adjustment.recommendedOptionId;
        return <Pressable
          key={option.id}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          onPress={() => onSelect(option.id)}
          style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
        >
          <View style={styles.optionTopRow}>
            <View style={styles.optionCopy}>
              <Text style={[styles.optionKicker, recommended && styles.optionKickerRecommended]}>{recommended ? 'RECOMMENDED' : option.recommendationLevel.replaceAll('_', ' ').toUpperCase()}</Text>
              <Text style={styles.optionTitle}>{option.title}</Text>
              <Text style={styles.optionBody}>{option.description}</Text>
            </View>
            <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
          </View>
          {selected ? <View style={styles.weekEffect}>
            <Text style={styles.weekEffectLabel}>EFFECT ON THE WEEK</Text>
            {option.weeklyConsequences.map((line) => <Text key={line} style={styles.weekEffectText}>• {line}</Text>)}
          </View> : null}
        </Pressable>;
      })}
    </View>

    <CoachDecisionExplanationPanel explanation={proposal.decisionExplanation} />

    <View style={styles.proposalActions}>
      <Pressable accessibilityRole="button" disabled={!selectedOptionId || applying} onPress={onAccept} style={({ pressed }) => [styles.applyButton, (!selectedOptionId || applying) && styles.disabled, pressed && styles.pressed]}>
        {applying ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.applyButtonText}>Apply selected change</Text><V23Icon name="check" color="#FFFFFF" size={16} /></>}
      </Pressable>
      <Pressable accessibilityRole="button" disabled={applying} onPress={onKeep} style={({ pressed }) => [styles.keepButton, applying && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.keepButtonText}>Keep original plan</Text>
      </Pressable>
    </View>
    <Text style={styles.approvalNote}>{selectedOption?.requiresApproval
      ? 'This change needs your approval.'
      : 'Nothing changes until you approve the selected option.'}</Text>
  </View>;
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
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function friendlyLoad(value: PlannedStrengthSession['intendedLoad']): string {
  return value === 'high' ? 'high load' : value === 'moderate' ? 'moderate load' : 'light load';
}

function friendlyDiscipline(value: CoachMessageProposal['sessionDiscipline']): string {
  if (value === 'swim') return 'Swim';
  if (value === 'bike') return 'Bike';
  if (value === 'run') return 'Run';
  return 'Strength';
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { gap: 16, paddingTop: 16, paddingBottom: 36 },
    eyebrow: { color: tokens.accent, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1 },
    title: { color: tokens.text, fontSize: 24, lineHeight: 29, fontWeight: '900', letterSpacing: -0.4 },
    body: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19 },

    currentCall: { borderRadius: 17, backgroundColor: tokens.surfaceMuted, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
    currentCallEmpty: { borderRadius: 17, backgroundColor: tokens.surfaceMuted, padding: 13 },
    currentCallCopy: { flex: 1, minWidth: 0, gap: 2 },
    currentCallTitle: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
    currentCallMeta: { color: tokens.textMuted, fontSize: 11, lineHeight: 15 },
    currentCallAction: { minHeight: 34, borderRadius: 17, backgroundColor: tokens.surface, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 3 },
    currentCallActionText: { color: tokens.accent, fontSize: 11, fontWeight: '900' },

    conversationSection: { gap: 11 },
    conversationHeading: { paddingHorizontal: 2 },
    conversationHeadingCopy: { gap: 4 },
    thread: { gap: 7, paddingVertical: 3 },
    turnRow: { alignItems: 'flex-start' },
    turnRowAthlete: { alignItems: 'flex-end' },
    turnBubble: { maxWidth: '88%', borderRadius: 17, paddingHorizontal: 12, paddingVertical: 9, gap: 2 },
    athleteBubble: { backgroundColor: tokens.accentSoft, borderBottomRightRadius: 5 },
    coachBubble: { backgroundColor: tokens.surfaceMuted, borderBottomLeftRadius: 5 },
    turnRole: { color: tokens.textMuted, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.75 },
    turnText: { color: tokens.text, fontSize: 13.5, lineHeight: 19 },
    inlineFeedback: { borderRadius: 13, backgroundColor: tokens.accentSoft, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
    errorFeedback: { backgroundColor: tokens.surfaceMuted, borderWidth: 1, borderColor: tokens.danger },
    inlineFeedbackText: { flex: 1, color: tokens.text, fontSize: 12, lineHeight: 17, fontWeight: '700' },
    errorText: { color: tokens.danger },

    composer: { borderRadius: 21, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 12, gap: 10 },
    messageInput: { minHeight: 84, color: tokens.text, fontSize: 15.5, lineHeight: 22, paddingHorizontal: 2, paddingTop: 2, paddingBottom: 6, textAlignVertical: 'top' },
    quickSignals: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    quickSignal: { minHeight: 33, borderRadius: 17, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surfaceMuted, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
    quickSignalSelected: { borderColor: tokens.accent, backgroundColor: tokens.accentSoft },
    quickSignalText: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 14, fontWeight: '800' },
    quickSignalTextSelected: { color: tokens.accent },
    sendButton: { minHeight: 44, borderRadius: 14, backgroundColor: tokens.accent, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    sendButtonText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '900' },
    composerFootnote: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 15, paddingHorizontal: 2 },

    proposalShell: { borderRadius: 23, borderWidth: 1, borderColor: tokens.accent, backgroundColor: tokens.surface, padding: 16, gap: 13 },
    proposalHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    proposalHeadingCopy: { flex: 1, minWidth: 0, gap: 3 },
    proposalTitle: { color: tokens.text, fontSize: 22, lineHeight: 27, fontWeight: '900', letterSpacing: -0.3 },
    proposalInterpretation: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18 },
    proposalBadge: { borderRadius: 999, backgroundColor: tokens.accentSoft, paddingHorizontal: 8, paddingVertical: 5 },
    proposalBadgeText: { color: tokens.accent, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.7 },
    beforeAfter: { gap: 8 },
    beforeAfterCell: { borderRadius: 14, backgroundColor: tokens.surfaceMuted, padding: 11, gap: 2 },
    afterCell: { backgroundColor: tokens.accentSoft },
    beforeAfterLabel: { color: tokens.textMuted, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.8 },
    beforeAfterTitle: { color: tokens.text, fontSize: 14, lineHeight: 19, fontWeight: '900' },
    beforeAfterBody: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
    arrowCircle: { width: 27, height: 27, borderRadius: 14, backgroundColor: tokens.header, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginVertical: -2, zIndex: 1 },
    arrowText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
    safetyCallout: { borderRadius: 13, borderWidth: 1, borderColor: tokens.danger, backgroundColor: tokens.surfaceMuted, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
    safetyText: { flex: 1, color: tokens.text, fontSize: 11.5, lineHeight: 17, fontWeight: '700' },
    optionList: { gap: 8 },
    option: { borderRadius: 15, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 12, gap: 8 },
    optionSelected: { borderColor: tokens.accent, backgroundColor: tokens.surfaceMuted },
    optionTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    optionCopy: { flex: 1, minWidth: 0, gap: 2 },
    optionKicker: { color: tokens.textMuted, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.75 },
    optionKickerRecommended: { color: tokens.accent },
    optionTitle: { color: tokens.text, fontSize: 14.5, lineHeight: 19, fontWeight: '900' },
    optionBody: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
    radio: { width: 19, height: 19, borderRadius: 10, borderWidth: 1.5, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    radioSelected: { borderColor: tokens.accent },
    radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.accent },
    weekEffect: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, paddingTop: 8, gap: 3 },
    weekEffectLabel: { color: tokens.textMuted, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.75 },
    weekEffectText: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 15 },
    proposalActions: { gap: 8 },
    applyButton: { minHeight: 45, borderRadius: 14, backgroundColor: tokens.accent, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    applyButtonText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '900' },
    keepButton: { minHeight: 42, borderRadius: 14, borderWidth: 1, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' },
    keepButtonText: { color: tokens.text, fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
    approvalNote: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 15, textAlign: 'center' },

    reasoningActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    noPlan: { borderRadius: 19, backgroundColor: tokens.surfaceMuted, padding: 15, gap: 6 },
    noPlanTitle: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '900' },
    noPlanBody: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18 },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.76 },
  });
}
