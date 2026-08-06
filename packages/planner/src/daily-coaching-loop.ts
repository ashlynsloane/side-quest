import type {
  AdaptiveCheckIn,
  DailyCoachBrief,
  DailyCoachDecision,
  DailyCoachOption,
  DailyCoachPriority,
  DailyCoachSession,
  DailyCoachSignal,
  ProtectedRecurringCommitment,
} from '@circuit/domain';

export interface BuildDailyCoachBriefInput {
  briefId: string;
  athleteId: string;
  localDate: string;
  generatedAt: string;
  sessions: DailyCoachSession[];
  protectedCommitments?: ProtectedRecurringCommitment[];
  signals?: DailyCoachSignal[];
  pendingDecisionIds?: string[];
}

function priorityForSession(session: DailyCoachSession): DailyCoachPriority {
  if (session.protected) {
    return {
      priorityId: `priority:${session.sessionId}`,
      kind: 'protect',
      sessionId: session.sessionId,
      headline: `Keep ${session.title}`,
      rationale: 'This session is protected and remains fixed unless the athlete explicitly changes it.',
      protected: true,
    };
  }
  return {
    priorityId: `priority:${session.sessionId}`,
    kind: 'complete',
    sessionId: session.sessionId,
    headline: session.title,
    rationale: 'This is the highest-ranked flexible session for today.',
    protected: false,
  };
}

export function buildDailyCoachBrief(input: BuildDailyCoachBriefInput): DailyCoachBrief {
  const sessions = [...input.sessions].sort((a, b) => a.priorityRank - b.priorityRank);
  const priorities = sessions.slice(0, 3).map(priorityForSession);
  const highConcern = (input.signals ?? []).find((signal) => signal.kind === 'pain' && signal.severity === 'high');
  if (highConcern) {
    priorities.unshift({
      priorityId: `priority:recover:${highConcern.signalId}`,
      kind: 'recover',
      headline: 'Recovery is today\'s priority',
      rationale: 'A high-severity pain signal requires review before training proceeds.',
      protected: true,
    });
  }
  const protectedCommitmentIds = (input.protectedCommitments ?? []).map((commitment) => commitment.commitmentId);
  return {
    briefId: input.briefId,
    athleteId: input.athleteId,
    localDate: input.localDate,
    headline: highConcern ? 'Pause and review today\'s plan' : priorities[0]?.headline ?? 'No structured priority today',
    summary: priorities.map((priority) => priority.rationale),
    priorities,
    protectedCommitmentIds,
    pendingDecisionIds: input.pendingDecisionIds ?? [],
    generatedAt: input.generatedAt,
    auditable: true,
  };
}

function option(
  optionId: string,
  label: string,
  summary: string,
  trainingEffect: string,
  recoveryImpact: string,
  raceImpact: string,
  confidence: DailyCoachOption['confidence'],
): DailyCoachOption {
  return { optionId, label, summary, trainingEffect, recoveryImpact, raceImpact, confidence, requiresAthleteApproval: true };
}

export function buildDailyCoachDecision(
  decisionId: string,
  signals: DailyCoachSignal[],
  sessions: DailyCoachSession[],
): DailyCoachDecision {
  const pain = signals.find((signal) => signal.kind === 'pain');
  if (pain) {
    return {
      decisionId,
      triggerSignalIds: signals.map((signal) => signal.signalId),
      status: 'pending_athlete',
      headline: 'Training needs review after a pain report',
      options: [
        option('recover', 'Recover today', 'Pause structured training and reassess symptoms.', 'Forgoes one session to protect continuity.', 'Lowest immediate loading.', 'Protects long-term availability.', 'high'),
        option('low-load', 'Choose a low-load alternative', 'Replace the planned session with recovery-oriented movement.', 'Preserves routine with reduced stimulus.', 'Lower load than the original session.', 'Small short-term effect.', 'moderate'),
      ],
      recommendedOptionId: 'recover',
      explanation: ['Pain is a material signal.', 'Protected and clinician restrictions remain binding.', 'No plan change is applied without athlete review.'],
      requiresAthleteApproval: true,
      auditable: true,
    };
  }
  const disruption = signals.find((signal) => ['skipped','cut_short','pool_closure','weather_change','travel_delay','equipment_unavailable'].includes(signal.kind));
  if (!disruption) {
    return { decisionId, triggerSignalIds: [], status: 'no_change', headline: 'No schedule change recommended', options: [], explanation: ['Today\'s plan remains feasible.'], requiresAthleteApproval: false, auditable: true };
  }
  const flexible = sessions.filter((session) => !session.protected).sort((a,b) => a.priorityRank-b.priorityRank);
  return {
    decisionId,
    triggerSignalIds: signals.map((signal) => signal.signalId),
    status: 'pending_athlete',
    headline: 'Choose how to adapt today',
    options: [
      option('move', 'Move the flexible session', 'Reschedule the affected flexible workout around protected commitments.', 'Preserves most intended training.', 'May compress recovery if moved too close to another session.', 'Usually neutral when spacing remains adequate.', 'moderate'),
      option('shorten', 'Shorten and preserve the priority', 'Keep the key intent with less duration.', 'Retains the main stimulus.', 'Reduces total load.', 'Usually small.', 'high'),
      option('skip', 'Skip it', 'Remove the affected session without treating it as a failure.', 'Reduces weekly stimulus.', 'Improves recovery.', 'Usually small for one isolated session.', 'high'),
    ],
    recommendedOptionId: flexible.length ? 'shorten' : 'skip',
    explanation: ['Protected commitments remain fixed.', 'The coach offers alternatives instead of silently rebuilding the week.'],
    requiresAthleteApproval: true,
    auditable: true,
  };
}

export function buildAdaptiveCheckIns(signals: DailyCoachSignal[]): AdaptiveCheckIn[] {
  const prompts: AdaptiveCheckIn[] = [];
  for (const signal of signals) {
    if (signal.kind === 'pain') prompts.push({ checkInId: `check:${signal.signalId}`, prompt: 'How does the painful area feel now?', reason: 'A symptom update is needed before training guidance can be finalized.', relatedSessionId: signal.sessionId, answerKind: 'single_select', options: ['Better','Unchanged','Worse'], requiredBeforeDecision: true });
    if (signal.kind === 'pool_closure') prompts.push({ checkInId: `check:${signal.signalId}`, prompt: 'Is another pool available today?', reason: 'Availability determines whether the swim can be preserved or should be replaced.', relatedSessionId: signal.sessionId, answerKind: 'yes_no', requiredBeforeDecision: false });
    if (signal.kind === 'equipment_unavailable') prompts.push({ checkInId: `check:${signal.signalId}`, prompt: 'What equipment is available?', reason: 'Only feasible substitutions should be proposed.', relatedSessionId: signal.sessionId, answerKind: 'text', requiredBeforeDecision: false });
  }
  return prompts;
}

export function explainDailyCoachDecision(decision: DailyCoachDecision): string[] {
  const recommended = decision.options.find((item) => item.optionId === decision.recommendedOptionId);
  return [decision.headline, ...decision.explanation, ...(recommended ? [`Recommended: ${recommended.label}. ${recommended.summary}`] : [])];
}
