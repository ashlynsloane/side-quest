import type {
  AdaptiveDecisionConfidence,
  CoachDecisionAction,
  CoachDecisionPriority,
  IntelligentTrainingSession,
  UnifiedCoachDecision,
  UnifiedCoachEngineInput,
  UnifiedCoachEngineResult,
  UnifiedCoachSignal,
} from '@circuit/domain';

const CONFIDENCE_WEIGHT: Record<AdaptiveDecisionConfidence, number> = { low: 1, moderate: 2, high: 3 };
const SEVERITY_WEIGHT = { info: 1, watch: 2, meaningful: 3, critical: 4 } as const;

function confidenceFromSignals(signals: UnifiedCoachSignal[]): AdaptiveDecisionConfidence {
  if (!signals.length) return 'low';
  const weighted = signals.reduce((sum, signal) => sum + CONFIDENCE_WEIGHT[signal.confidence] * SEVERITY_WEIGHT[signal.severity], 0);
  const denominator = signals.reduce((sum, signal) => sum + SEVERITY_WEIGHT[signal.severity], 0);
  const mean = weighted / Math.max(1, denominator);
  if (mean >= 2.55 && signals.length >= 2) return 'high';
  if (mean >= 1.65) return 'moderate';
  return 'low';
}

function priorityFor(signal: UnifiedCoachSignal): CoachDecisionPriority {
  if (signal.source === 'safety' || signal.severity === 'critical') return 'critical';
  if (signal.severity === 'meaningful') return 'high';
  if (signal.severity === 'watch') return 'normal';
  return 'low';
}

function actionFor(signal: UnifiedCoachSignal, protectedSessionIds: Set<string>): CoachDecisionAction {
  if (signal.source === 'safety') return 'recover';
  if (signal.sessionId && protectedSessionIds.has(signal.sessionId)) return 'review';
  if (signal.source === 'calendar') return 'move';
  if (signal.source === 'capacity_forecast') return 'shorten';
  if (signal.source === 'goal_specific' || signal.source === 'training_block') return 'replace';
  return 'review';
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function collectSignals(input: UnifiedCoachEngineInput): UnifiedCoachSignal[] {
  const signals: UnifiedCoachSignal[] = [];
  if (input.painOrInjuryRestriction || input.illnessOrMedicalRestriction) {
    signals.push({
      signalId: 'safety:restriction', source: 'safety', severity: 'critical', confidence: 'high',
      message: 'A pain, injury, illness, or medical restriction requires a conservative planning hold.',
      reasons: ['Safety restrictions override performance optimization and training debt.'],
    });
  }
  for (const conflict of input.capacityForecast?.conflicts ?? []) {
    signals.push({
      signalId: `capacity:${conflict.id}`, source: 'capacity_forecast', sessionId: conflict.affectedSessionId,
      severity: conflict.severity === 'critical' ? 'critical' : 'meaningful',
      confidence: input.capacityForecast?.confidence ?? 'low', message: conflict.reasons[0] ?? `${conflict.resource} capacity is forecast below the planning threshold.`,
      reasons: [`Projected ${conflict.resource} capacity falls below the planning threshold.`],
    });
  }
  for (const proposal of input.calendar?.proposals ?? []) {
    if (proposal.action === 'keep') continue;
    signals.push({
      signalId: `calendar:${proposal.proposalId}`, source: 'calendar', sessionId: proposal.sessionId,
      severity: proposal.action === 'remove' ? 'meaningful' : 'watch', confidence: proposal.confidence,
      message: proposal.reasons[0] ?? 'Calendar constraints require a proposed session adjustment.', reasons: proposal.reasons,
    });
  }
  for (const finding of input.trainingBlock?.interferenceFindings ?? []) {
    signals.push({
      signalId: `block:${finding.findingId}`, source: 'training_block', sessionId: finding.sessionIds[0],
      severity: finding.severity === 'high' ? 'meaningful' : 'watch', confidence: 'moderate',
      message: finding.reasons[0] ?? 'Training objectives may interfere when scheduled too closely.',
      reasons: finding.reasons,
    });
  }
  for (const finding of input.goalCoaching?.findings ?? []) {
    if (finding.severity === 'info') continue;
    signals.push({
      signalId: `goal:${finding.findingId}`, source: 'goal_specific', sessionId: finding.affectedSessionIds[0],
      severity: finding.severity === 'important' ? 'meaningful' : 'watch', confidence: 'moderate',
      message: finding.message, reasons: finding.reasons,
    });
  }
  const atRisk = input.adaptation?.mostAtRiskObjective;
  if (atRisk) {
    const trajectory = input.adaptation?.trajectories.find((item) => item.objective === atRisk);
    signals.push({
      signalId: `adaptation:${atRisk}`, source: 'adaptation', severity: 'watch',
      confidence: trajectory?.confidence ?? 'low', message: `${atRisk.replaceAll('_', ' ')} is the most at-risk adaptation.` ,
      reasons: trajectory?.reasons ?? ['Long-term adaptation evidence suggests maintenance may be needed.'],
    });
  }
  if (input.optimization && input.optimization.recommendedCandidateId !== input.optimization.baselineCandidateId) {
    signals.push({
      signalId: `optimizer:${input.optimization.proposalId}`, source: 'multi_week_optimizer', severity: 'watch',
      confidence: input.optimization.confidence, message: `The multi-week optimizer prefers ${input.optimization.recommendedCandidateId}.`,
      reasons: input.optimization.reasons,
    });
  }
  return signals;
}

export function runUnifiedCoachEngine(input: UnifiedCoachEngineInput): UnifiedCoachEngineResult {
  const protectedSessionIds = new Set(dedupe([
    ...(input.trainingBlock?.protectedSessionIds ?? []),
    ...(input.goalCoaching?.protectedSessionIds ?? []),
    ...input.sessions.filter((session) => session.role === 'event' || session.role === 'key' || !session.movable).map((session) => session.sessionId),
  ]));
  const signals = collectSignals(input).sort((left, right) =>
    SEVERITY_WEIGHT[right.severity] - SEVERITY_WEIGHT[left.severity] || left.signalId.localeCompare(right.signalId));
  const safetyHold = signals.some((signal) => signal.source === 'safety');
  const grouped = new Map<string, UnifiedCoachSignal[]>();
  for (const signal of signals) {
    const key = signal.sessionId ?? signal.signalId;
    grouped.set(key, [...(grouped.get(key) ?? []), signal]);
  }
  const decisions: UnifiedCoachDecision[] = [...grouped.entries()].map(([key, group]) => {
    const lead = group[0]!;
    const protectedSession = lead.sessionId ? protectedSessionIds.has(lead.sessionId) : false;
    const approved = lead.sessionId ? (input.athleteApprovedSessionIds ?? []).includes(lead.sessionId) : false;
    const action = safetyHold ? 'recover' : actionFor(lead, protectedSessionIds);
    const requiresApproval = action !== 'keep' && !approved;
    return {
      decisionId: `coach:${input.generatedAt}:${key}`, sessionId: lead.sessionId, action,
      priority: priorityFor(lead), confidence: confidenceFromSignals(group), requiresAthleteApproval: requiresApproval,
      title: safetyHold ? 'Pause and review training' : protectedSession ? 'Review protected session' : `${action[0]!.toUpperCase()}${action.slice(1)} session`,
      explanation: protectedSession
        ? `${lead.message} The session remains protected, so the coach requests review rather than changing it automatically.`
        : lead.message,
      supportingSignalIds: group.map((signal) => signal.signalId),
      rejectedAlternatives: protectedSession ? ['Automatic removal', 'Silent rescheduling'] : ['Compensatory volume', 'Unexplained automatic change'],
    };
  });
  const requiresAthleteApproval = decisions.some((decision) => decision.requiresAthleteApproval);
  const status = safetyHold ? 'safety_hold' : decisions.length ? (requiresAthleteApproval ? 'adjustment_proposed' : 'review') : 'stable';
  return {
    generatedAt: input.generatedAt, status, confidence: confidenceFromSignals(signals), signals, decisions,
    protectedSessionIds: [...protectedSessionIds], requiresAthleteApproval,
    coachSummary: safetyHold
      ? ['Safety signals supersede performance goals. Training changes should be reviewed before proceeding.']
      : decisions.length
        ? [`The coach reconciled ${signals.length} signals into ${decisions.length} explainable decisions.`, 'Protected sessions and athlete approval remain hard constraints.']
        : ['No material conflict requires a plan change. The current plan remains stable.'],
    safeguards: [
      'Pain, injury, illness, and medical restrictions override performance optimization.',
      'No calendar-changing decision is applied without athlete approval.',
      'Protected event and key sessions cannot be silently removed or displaced.',
      'Training debt never authorizes compensatory exercise or automatic replay of missed volume.',
      'Low-confidence evidence cannot independently trigger a major plan change.',
    ],
  };
}
