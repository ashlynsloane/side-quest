import type { CoachUncertaintyAssessment } from '@circuit/domain';

export interface CoachConfidenceCard {
  title: string;
  recommendationStrength: string;
  summary: string[];
}
export interface EvidenceConflictCard { title: string; conflicts: string[]; }
export interface InformationGapCard { title: string; items: string[]; }
export interface DecisionStabilityCard { title: string; stable: boolean; detail: string; requiresAthleteConfirmation: boolean; }
export interface WhatWouldChangeThisCard { title: string; items: string[]; }

export function buildCoachUncertaintyCards(assessment: CoachUncertaintyAssessment): {
  confidence: CoachConfidenceCard;
  conflict?: EvidenceConflictCard;
  information?: InformationGapCard;
  stability: DecisionStabilityCard;
  whatWouldChangeThis?: WhatWouldChangeThisCard;
} {
  const cards: {
    confidence: CoachConfidenceCard;
    conflict?: EvidenceConflictCard;
    information?: InformationGapCard;
    stability: DecisionStabilityCard;
    whatWouldChangeThis?: WhatWouldChangeThisCard;
  } = {
    confidence: {
      title: assessment.explanation.headline,
      recommendationStrength: assessment.recommendationStrength,
      summary: assessment.explanation.summary,
    },
    stability: {
      title: assessment.stability.stable ? 'Decision is stable' : 'Check with the athlete',
      stable: assessment.stability.stable,
      detail: assessment.stability.reasons.join(' '),
      requiresAthleteConfirmation: assessment.stability.requiresAthleteConfirmation,
    },
  };
  if (assessment.explanation.conflicts.length) cards.conflict = { title: 'Evidence does not fully agree', conflicts: assessment.explanation.conflicts };
  if (assessment.explanation.missingInformation.length) cards.information = { title: 'Information that matters', items: assessment.explanation.missingInformation };
  if (assessment.explanation.whatWouldChangeThis.length) cards.whatWouldChangeThis = { title: 'What could change this', items: assessment.explanation.whatWouldChangeThis };
  return cards;
}
