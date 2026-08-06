import type {
  UnifiedCoachCandidate,
  UnifiedCoachingOsDecision,
  UnifiedCoachDisposition,
  UnifiedCoachRequest,
  UnifiedCoachStageResult,
  UnifiedCoachSummary,
} from '@circuit/domain';

const RANK: Record<UnifiedCoachCandidate['recommendationStrength'], number> = {
  strong: 5,
  moderate: 4,
  tentative: 3,
  insufficient_evidence: 2,
  do_not_recommend: 1,
};

export function evaluateUnifiedCoachCandidate(candidate: UnifiedCoachCandidate): UnifiedCoachStageResult[] {
  const safetyBlocked = candidate.safetyViolation || candidate.clinicianRestrictionViolation;
  return [
    {
      stage: 'evidence',
      status: candidate.recommendationStrength === 'insufficient_evidence' ? 'attention' : 'passed',
      summary: `Evidence support is ${candidate.recommendationStrength.replaceAll('_', ' ')}.`,
      evidenceRefs: [],
      blockingReasons: [],
    },
    {
      stage: 'causal_guardrails',
      status: 'passed',
      summary: 'Observational evidence is retained as context and not treated as proof of causality.',
      evidenceRefs: [],
      blockingReasons: [],
    },
    {
      stage: 'uncertainty',
      status: candidate.recommendationStrength === 'tentative' || candidate.recommendationStrength === 'insufficient_evidence' ? 'attention' : 'passed',
      summary: candidate.athleteConfirmationRequired ? 'Uncertainty requires athlete confirmation.' : 'Decision uncertainty is within the allowed range.',
      evidenceRefs: [],
      blockingReasons: [],
    },
    {
      stage: 'optimization',
      status: candidate.feasible ? 'passed' : 'blocked',
      summary: candidate.feasible ? 'Candidate satisfies declared objective constraints.' : 'Candidate is infeasible under current constraints.',
      evidenceRefs: [],
      blockingReasons: candidate.feasible ? [] : ['infeasible_candidate'],
    },
    {
      stage: 'simulation',
      status: candidate.robust ? 'passed' : 'attention',
      summary: candidate.robust ? 'Candidate remained acceptable across stress tests.' : 'Candidate was fragile or indeterminate in stress testing.',
      evidenceRefs: [],
      blockingReasons: [],
    },
    {
      stage: 'meta_learning',
      status: 'passed',
      summary: 'Prior strategy outcomes may inform this decision but cannot apply it automatically.',
      evidenceRefs: [],
      blockingReasons: [],
    },
    {
      stage: 'governance',
      status: safetyBlocked || !candidate.governanceApproved ? 'blocked' : 'passed',
      summary: safetyBlocked
        ? 'Safety or clinician authority blocks this candidate.'
        : candidate.governanceApproved
          ? 'Governance requirements are satisfied.'
          : 'Governance approval is missing.',
      evidenceRefs: [],
      blockingReasons: [
        ...(candidate.safetyViolation ? ['safety_violation'] : []),
        ...(candidate.clinicianRestrictionViolation ? ['clinician_restriction_violation'] : []),
        ...(!candidate.governanceApproved ? ['governance_not_approved'] : []),
      ],
    },
  ];
}

export function orchestrateUnifiedCoachDecision(
  request: UnifiedCoachRequest,
  candidates: UnifiedCoachCandidate[],
): UnifiedCoachingOsDecision {
  const requested = candidates.filter((candidate) => request.candidateIds.includes(candidate.candidateId));
  const evaluated = requested.map((candidate) => ({ candidate, stages: evaluateUnifiedCoachCandidate(candidate) }));
  const eligible = evaluated.filter(({ candidate, stages }) =>
    candidate.feasible &&
    candidate.robust &&
    candidate.recommendationStrength !== 'insufficient_evidence' &&
    candidate.recommendationStrength !== 'do_not_recommend' &&
    !stages.some((stage) => stage.status === 'blocked'),
  );
  const sorted = [...eligible].sort((a, b) => RANK[b.candidate.recommendationStrength] - RANK[a.candidate.recommendationStrength]);
  const selected = sorted[0]?.candidate;
  const unresolved = request.unresolvedInformationGaps;

  let disposition: UnifiedCoachDisposition;
  if (requested.length === 0) disposition = 'hold';
  else if (eligible.length === 0) disposition = unresolved.length > 0 ? 'request_information' : 'block';
  else if (unresolved.length > 0 && selected?.recommendationStrength !== 'strong') disposition = 'request_information';
  else if (eligible.length > 1 && RANK[eligible[0]!.candidate.recommendationStrength] === RANK[eligible[1]!.candidate.recommendationStrength]) disposition = 'offer_choice';
  else disposition = 'recommend';

  const athleteConfirmationRequired = disposition === 'offer_choice' ||
    disposition === 'request_information' ||
    Boolean(selected?.athleteConfirmationRequired);
  const automaticPlanChangeAllowed = Boolean(
    request.requestedAutomaticChange &&
    disposition === 'recommend' &&
    selected &&
    selected.recommendationStrength === 'strong' &&
    !athleteConfirmationRequired,
  );

  const selectedStages = selected
    ? evaluated.find((entry) => entry.candidate.candidateId === selected.candidateId)!.stages
    : evaluated.flatMap((entry) => entry.stages);
  const rejectedCandidateIds = requested
    .filter((candidate) => !eligible.some((entry) => entry.candidate.candidateId === candidate.candidateId))
    .map((candidate) => candidate.candidateId);

  return {
    decisionId: `unified-coach-${request.requestId}`,
    requestId: request.requestId,
    disposition,
    selectedCandidateId: disposition === 'recommend' ? selected?.candidateId : undefined,
    eligibleCandidateIds: eligible.map(({ candidate }) => candidate.candidateId),
    rejectedCandidateIds,
    stageResults: selectedStages,
    automaticPlanChangeAllowed,
    athleteConfirmationRequired,
    informationRequested: disposition === 'request_information' ? unresolved : [],
    explanation: buildUnifiedCoachExplanation(disposition, selected, eligible.map(({ candidate }) => candidate)),
    provenance: [...new Set(request.provenance)],
    auditable: true,
    governanceRequired: true,
  };
}

export function buildUnifiedCoachExplanation(
  disposition: UnifiedCoachDisposition,
  selected: UnifiedCoachCandidate | undefined,
  eligible: UnifiedCoachCandidate[],
): string[] {
  if (disposition === 'recommend' && selected) return [
    `${selected.label} is the strongest eligible option after evidence, uncertainty, optimization, simulation, and governance checks.`,
    ...selected.explanation,
  ];
  if (disposition === 'offer_choice') return [
    `${eligible.length} materially valid options remain. Athlete preference should resolve the tradeoff.`,
  ];
  if (disposition === 'request_information') return [
    'Missing information could materially change the recommendation, so no automatic plan change is allowed.',
  ];
  if (disposition === 'block') return ['No candidate passed the binding safety, feasibility, robustness, and governance requirements.'];
  return ['No requested candidate was available for evaluation.'];
}

export function summarizeUnifiedCoachDecision(
  decision: UnifiedCoachingOsDecision,
  candidates: UnifiedCoachCandidate[],
): UnifiedCoachSummary {
  const selected = candidates.find((candidate) => candidate.candidateId === decision.selectedCandidateId);
  const confidenceLabel = selected?.recommendationStrength.replaceAll('_', ' ') ?? 'not established';
  return {
    headline: decision.disposition === 'recommend' ? 'Recommended next step' :
      decision.disposition === 'offer_choice' ? 'Your preference is needed' :
        decision.disposition === 'request_information' ? 'One check-in is needed' :
          decision.disposition === 'block' ? 'No safe recommendation' : 'Decision on hold',
    recommendation: selected?.label,
    confidenceLabel,
    reason: decision.explanation[0] ?? 'No explanation available.',
    nextAction: decision.automaticPlanChangeAllowed ? 'Apply the approved plan change.' :
      decision.athleteConfirmationRequired ? 'Review and confirm before changing the plan.' :
        decision.informationRequested.length > 0 ? `Provide: ${decision.informationRequested.join(', ')}.` :
          'Keep the current plan unchanged.',
    technicalDetailsAvailable: true,
  };
}
