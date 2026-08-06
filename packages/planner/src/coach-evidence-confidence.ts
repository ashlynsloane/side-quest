import type {
  AdaptiveDecisionConfidence,
  CoachDecisionAction,
  CoachDecisionExplanation,
  CoachEvidenceConfidenceInput,
  CoachEvidenceConfidenceResult,
  CoachEvidenceItem,
  UnifiedCoachSignal,
} from '@circuit/domain';

const CONFIDENCE_VALUE: Record<AdaptiveDecisionConfidence, number> = {
  low: 0.35,
  moderate: 0.65,
  high: 0.9,
};

const SEVERITY_VALUE: Record<UnifiedCoachSignal['severity'], number> = {
  info: 0.45,
  watch: 0.65,
  meaningful: 0.82,
  critical: 1,
};

const SOURCE_QUALITY: Record<UnifiedCoachSignal['source'], CoachEvidenceItem['quality']> = {
  athlete_response: 'self_reported',
  capacity_forecast: 'derived',
  calendar: 'direct',
  multi_week_optimizer: 'derived',
  training_block: 'derived',
  adaptation: 'derived',
  goal_specific: 'derived',
  safety: 'direct',
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function labelFor(score: number, evidenceCount: number): AdaptiveDecisionConfidence {
  if (score >= 0.76 && evidenceCount >= 2) return 'high';
  if (score >= 0.52) return 'moderate';
  return 'low';
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ');
}

function recommendationFor(action: CoachDecisionAction, title: string): string {
  const recommendation: Record<CoachDecisionAction, string> = {
    keep: 'Keep the session as planned.',
    move: 'Move the session to a better-fitting time.',
    shorten: 'Shorten the session while preserving its primary purpose.',
    replace: 'Replace the session with a better-fitting alternative.',
    remove: 'Remove the session from the current plan.',
    recover: 'Pause training and prioritize recovery and review.',
    review: 'Review the session before making a change.',
  };
  return recommendation[action] ?? title;
}

function expectedSources(action: CoachDecisionAction): UnifiedCoachSignal['source'][] {
  if (action === 'move') return ['calendar'];
  if (action === 'shorten') return ['capacity_forecast', 'athlete_response'];
  if (action === 'replace') return ['training_block', 'goal_specific'];
  if (action === 'recover') return ['safety', 'athlete_response'];
  if (action === 'remove') return ['capacity_forecast', 'calendar'];
  return [];
}

function signalEvidence(decisionId: string, signal: UnifiedCoachSignal): CoachEvidenceItem {
  const weight = round(CONFIDENCE_VALUE[signal.confidence] * SEVERITY_VALUE[signal.severity]);
  return {
    evidenceId: `evidence:${decisionId}:${signal.signalId}`,
    decisionId,
    signalId: signal.signalId,
    source: signal.source,
    role: 'supporting',
    quality: SOURCE_QUALITY[signal.source],
    confidence: signal.confidence,
    weight,
    summary: signal.message,
    details: signal.reasons,
  };
}

export function buildCoachEvidenceConfidence(
  input: CoachEvidenceConfidenceInput,
): CoachEvidenceConfidenceResult {
  const signalById = new Map(input.coachResult.signals.map((signal) => [signal.signalId, signal]));
  const allEvidence: CoachEvidenceItem[] = [];
  const explanations: CoachDecisionExplanation[] = [];

  for (const decision of input.coachResult.decisions) {
    const evidence: CoachEvidenceItem[] = decision.supportingSignalIds
      .map((signalId) => signalById.get(signalId))
      .filter((signal): signal is UnifiedCoachSignal => Boolean(signal))
      .map((signal) => signalEvidence(decision.decisionId, signal));

    const observedSources = new Set(evidence.map((item) => item.source));
    for (const source of expectedSources(decision.action)) {
      if (observedSources.has(source)) continue;
      evidence.push({
        evidenceId: `evidence:${decision.decisionId}:missing:${source}`,
        decisionId: decision.decisionId,
        source: 'missing_data',
        role: 'missing',
        quality: 'unknown',
        confidence: 'low',
        weight: 0,
        summary: `${humanize(source)} evidence was not available for this decision.`,
        details: ['Missing evidence lowers confidence but does not create a negative signal.'],
      });
    }

    const aggregate = input.outcomeLearning?.aggregates.find((item) => item.action === decision.action);
    if (aggregate && aggregate.observations > 0) {
      const helpedRate = aggregate.helped / Math.max(1, aggregate.observations);
      const hurtRate = aggregate.hurt / Math.max(1, aggregate.observations);
      const role: CoachEvidenceItem['role'] = hurtRate > helpedRate ? 'opposing' : 'context';
      evidence.push({
        evidenceId: `evidence:${decision.decisionId}:outcomes:${decision.action}`,
        decisionId: decision.decisionId,
        source: 'outcome_learning',
        role,
        quality: 'derived',
        confidence: aggregate.confidence,
        weight: round(Math.abs(helpedRate - hurtRate) * CONFIDENCE_VALUE[aggregate.confidence]),
        summary: aggregate.summary,
        details: [`Based on ${aggregate.observations} recorded outcome${aggregate.observations === 1 ? '' : 's'}.`],
      });
    }

    if (input.preferences) {
      evidence.push({
        evidenceId: `evidence:${decision.decisionId}:preference`,
        decisionId: decision.decisionId,
        source: 'athlete_preference',
        role: 'context',
        quality: 'direct',
        confidence: 'high',
        weight: 0.25,
        summary: `Athlete autonomy is set to ${humanize(input.preferences.autonomyLevel)}.`,
        details: ['Preferences govern how a recommendation may be presented or applied, not whether safety evidence is shown.'],
      });
    }

    const supporting = evidence.filter((item) => item.role === 'supporting');
    const opposing = evidence.filter((item) => item.role === 'opposing');
    const contextual = evidence.filter((item) => item.role === 'context');
    const missing = evidence.filter((item) => item.role === 'missing');
    const supportingWeight = supporting.reduce((sum, item) => sum + item.weight, 0);
    const opposingWeight = opposing.reduce((sum, item) => sum + item.weight, 0);
    const denominator = Math.max(1, supporting.length + opposing.length);
    const evidenceScore = clamp((supportingWeight - opposingWeight) / denominator);
    // The coach decision's upstream confidence is the prior; traceable evidence
    // calibrates it rather than replacing it. This prevents two coherent signals
    // from being downgraded solely because severity and confidence weights are
    // intentionally conservative. Missing expected evidence is still capped below.
    let score = clamp(
      evidenceScore * 0.4 + CONFIDENCE_VALUE[decision.confidence] * 0.6,
    );
    const cappedByMissingEvidence = missing.length > 0 && score > 0.74;
    if (cappedByMissingEvidence) score = 0.74;
    const label = labelFor(score, supporting.length + opposing.length);
    const rationale = [
      `${supporting.length} supporting and ${opposing.length} opposing evidence item${supporting.length + opposing.length === 1 ? '' : 's'} were evaluated.`,
      `The upstream ${decision.confidence} decision confidence was calibrated against the evidence strength.`,
      missing.length ? `${missing.length} expected evidence source${missing.length === 1 ? ' was' : 's were'} unavailable.` : 'No expected evidence source was missing.',
    ];
    if (cappedByMissingEvidence) rationale.push('Confidence was capped because expected evidence was missing.');

    const explanation: CoachDecisionExplanation = {
      decisionId: decision.decisionId,
      title: decision.title,
      recommendation: recommendationFor(decision.action, decision.title),
      conciseWhy: supporting.slice(0, 3).map((item) => item.summary),
      detailedWhy: supporting.flatMap((item) => [item.summary, ...item.details]).slice(0, 8),
      primaryEvidenceIds: supporting.map((item) => item.evidenceId),
      opposingEvidenceIds: opposing.map((item) => item.evidenceId),
      contextualEvidenceIds: contextual.map((item) => item.evidenceId),
      missingEvidenceIds: missing.map((item) => item.evidenceId),
      rejectedAlternatives: decision.rejectedAlternatives,
      confidence: {
        decisionId: decision.decisionId,
        score: round(score),
        label,
        supportingWeight: round(supportingWeight),
        opposingWeight: round(opposingWeight),
        evidenceCount: supporting.length + opposing.length + contextual.length,
        missingEvidenceCount: missing.length,
        cappedByMissingEvidence,
        rationale,
      },
    };
    allEvidence.push(...evidence);
    explanations.push(explanation);
  }

  return {
    generatedAt: input.generatedAt,
    evidence: allEvidence,
    explanations,
    explanationByDecisionId: Object.fromEntries(explanations.map((item) => [item.decisionId, item])),
    safeguards: [
      'Evidence explanations do not apply, move, remove, or replace sessions.',
      'Missing evidence lowers or caps confidence; it is never treated as evidence of athlete risk.',
      'Safety evidence remains visible regardless of athlete notification or autonomy preferences.',
      'Outcome learning is contextual and cannot independently authorize an automatic plan change.',
      'Confidence is a calibrated decision aid, not a medical diagnosis or guarantee.',
    ],
  };
}
