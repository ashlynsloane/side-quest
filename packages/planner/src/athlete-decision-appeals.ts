import type {
  AthleteAppealAssessment,
  AthleteAppealDisposition,
  AthleteDecisionAppeal,
  AthleteDecisionResponse,
  AthleteDecisionResponseKind,
  AthleteResponseSummary,
  UnifiedCoachingOsDecision,
} from '@circuit/domain';

export interface AthleteResponseContext {
  decision: UnifiedCoachingOsDecision;
  response: AthleteDecisionResponse;
  eligibleAlternativeCandidateIds?: string[];
  clinicianRestrictionRefs?: string[];
  currentSafetyConcern?: boolean;
}

export function createAthleteDecisionResponse(input: {
  responseId: string;
  decisionId: string;
  athleteId: string;
  kind: AthleteDecisionResponseKind;
  submittedAt: string;
  reasonKinds?: AthleteDecisionResponse['reasonKinds'];
  note?: string;
  requestedCandidateId?: string;
  requestedChanges?: string[];
  provenance?: string[];
}): AthleteDecisionResponse {
  return {
    responseId: input.responseId,
    decisionId: input.decisionId,
    athleteId: input.athleteId,
    kind: input.kind,
    submittedAt: input.submittedAt,
    reasonKinds: [...(input.reasonKinds ?? [])],
    note: input.note,
    requestedCandidateId: input.requestedCandidateId,
    requestedChanges: [...(input.requestedChanges ?? [])],
    provenance: [...(input.provenance ?? [])],
  };
}

export function createAthleteDecisionAppeal(
  response: AthleteDecisionResponse,
  createdAt: string,
): AthleteDecisionAppeal {
  const allegesSafetyConcern = response.reasonKinds.includes('safety_concern');
  const citesClinicianGuidance = response.reasonKinds.includes('clinician_guidance');
  const materialNewInformation = response.reasonKinds.some((reason) =>
    ['symptoms_changed', 'schedule_changed', 'equipment_unavailable', 'safety_concern', 'clinician_guidance'].includes(reason),
  );
  return {
    appealId: `${response.responseId}:appeal`,
    decisionId: response.decisionId,
    responseId: response.responseId,
    createdAt,
    reasonKinds: [...response.reasonKinds],
    materialNewInformation,
    allegesSafetyConcern,
    citesClinicianGuidance,
    requestedResolution: response.note,
    provenance: [...response.provenance, response.responseId],
    auditable: true,
  };
}

export function determineAppealDisposition(
  context: AthleteResponseContext,
  appeal: AthleteDecisionAppeal,
): AthleteAppealDisposition {
  if (appeal.citesClinicianGuidance) return 'clinician_review_required';
  if (appeal.allegesSafetyConcern || context.currentSafetyConcern) return 'reassessment_required';
  if (appeal.materialNewInformation) return 'reassessment_required';
  if (context.response.requestedCandidateId) {
    return (context.eligibleAlternativeCandidateIds ?? []).includes(context.response.requestedCandidateId)
      ? 'accepted'
      : 'alternative_required';
  }
  if (context.response.kind === 'request_alternative' || context.response.kind === 'accept_with_modification') {
    return 'alternative_required';
  }
  return 'declined_with_explanation';
}

export function assessAthleteDecisionAppeal(
  context: AthleteResponseContext,
  appeal: AthleteDecisionAppeal,
): AthleteAppealAssessment {
  const disposition = determineAppealDisposition(context, appeal);
  const selectedAlternativeCandidateId =
    disposition === 'accepted' && context.response.requestedCandidateId
      ? context.response.requestedCandidateId
      : undefined;
  const fullReassessmentRequired = disposition === 'reassessment_required' || disposition === 'clinician_review_required';
  const clinicianReviewRequired = disposition === 'clinician_review_required';
  const automaticOverrideAllowed =
    disposition === 'accepted' &&
    Boolean(selectedAlternativeCandidateId) &&
    !appeal.allegesSafetyConcern &&
    !appeal.citesClinicianGuidance &&
    context.decision.eligibleCandidateIds.includes(selectedAlternativeCandidateId as string);

  const explanation = buildAppealExplanation(disposition, context, appeal);
  return {
    assessmentId: `${appeal.appealId}:assessment`,
    appealId: appeal.appealId,
    disposition,
    automaticOverrideAllowed,
    fullReassessmentRequired,
    clinicianReviewRequired,
    selectedAlternativeCandidateId,
    explanation,
    provenance: [...appeal.provenance, context.decision.decisionId],
    auditable: true,
  };
}

export function buildAppealExplanation(
  disposition: AthleteAppealDisposition,
  context: AthleteResponseContext,
  appeal: AthleteDecisionAppeal,
): string[] {
  const lines: string[] = [];
  if (disposition === 'clinician_review_required') {
    lines.push('The appeal cites clinician guidance, so the recommendation cannot be changed automatically.');
  } else if (disposition === 'reassessment_required') {
    lines.push('The appeal contains material new information or a safety concern, so the coaching decision must be recomputed.');
  } else if (disposition === 'accepted') {
    lines.push(`The requested alternative ${context.response.requestedCandidateId ?? ''} remains eligible under the existing decision.`.trim());
  } else if (disposition === 'alternative_required') {
    lines.push('The requested change cannot be applied directly; the system must present safe, eligible alternatives.');
  } else {
    lines.push('The original recommendation remains unchanged, but the athlete response is preserved in the audit trail.');
  }
  if (appeal.reasonKinds.length) lines.push(`Athlete reasons: ${appeal.reasonKinds.join(', ')}.`);
  lines.push('Athlete disagreement never removes binding safety or clinician restrictions.');
  return lines;
}

export function buildAthleteResponseSummary(
  response: AthleteDecisionResponse,
  assessment?: AthleteAppealAssessment,
): AthleteResponseSummary {
  if (!assessment) {
    return {
      headline: 'Your response was saved',
      status: response.kind.replaceAll('_', ' '),
      explanation: 'Side Quest recorded your choice and will not treat silence as consent.',
      nextAction: response.kind === 'accept' ? 'Continue with the accepted plan.' : 'Review the next coaching step.',
      technicalDetailsAvailable: true,
    };
  }
  const nextAction = assessment.clinicianReviewRequired
    ? 'Wait for clinician or coach review before applying a change.'
    : assessment.fullReassessmentRequired
      ? 'Re-run the coaching decision with the new information.'
      : assessment.disposition === 'alternative_required'
        ? 'Choose from newly generated safe alternatives.'
        : assessment.disposition === 'accepted'
          ? 'Confirm the selected eligible alternative.'
          : 'Review the explanation or submit new information.';
  return {
    headline: 'Your coaching response was reviewed',
    status: assessment.disposition.replaceAll('_', ' '),
    explanation: assessment.explanation[0] ?? 'The response was reviewed.',
    nextAction,
    technicalDetailsAvailable: true,
  };
}
