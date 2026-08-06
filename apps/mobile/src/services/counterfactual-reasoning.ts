import type { CounterfactualExplanation, DecisionBoundary } from '@circuit/domain';

export interface CounterfactualCardModel {
  title: string;
  status: string;
  summary: string;
  rows: string[];
  technicalDetailsAvailable: boolean;
}

export function buildWhyRecommendationCard(explanation: CounterfactualExplanation): CounterfactualCardModel {
  return {
    title: 'Why this recommendation?',
    status: explanation.sensitivity.replace('_', ' '),
    summary: explanation.primaryDrivers.length
      ? `Main drivers: ${explanation.primaryDrivers.join(', ')}.`
      : 'No single tested factor changed the recommendation.',
    rows: [...explanation.minimalChanges, explanation.safetyNote],
    technicalDetailsAvailable: true,
  };
}

export function buildWhatWouldChangeCard(
  explanation: CounterfactualExplanation,
  boundaries: DecisionBoundary[],
): CounterfactualCardModel {
  const found = boundaries.filter((boundary) => boundary.found);
  return {
    title: 'What would change it?',
    status: explanation.noRealisticChangeWouldAlterDecision ? 'No realistic tested change' : `${found.length} decision boundary${found.length === 1 ? '' : 'ies'}`,
    summary: found.length
      ? found.map((boundary) => `${boundary.variable}: ${String(boundary.boundaryValue)}`).join(' · ')
      : 'The recommendation remained unchanged across the realistic scenarios tested.',
    rows: boundaries.flatMap((boundary) => boundary.explanation),
    technicalDetailsAvailable: true,
  };
}
