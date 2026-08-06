import type { TrainingBlockIntelligenceResult } from '@circuit/domain';

export interface TrainingBlockCoachCard {
  title: string;
  body: string;
  primaryObjective: string;
  phase: string;
  warnings: string[];
  debtSummary: string[];
}

export function trainingBlockCoachCard(result: TrainingBlockIntelligenceResult): TrainingBlockCoachCard {
  const imbalance = result.adaptationBalance.filter((finding) => finding.status !== 'balanced');
  return {
    title: 'Block intelligence',
    body: [
      ...result.explanations,
      imbalance.length ? `${imbalance.length} adaptation balance issue${imbalance.length === 1 ? '' : 's'} need review.` : 'Adaptation exposure is balanced for this block.',
    ].join(' '),
    primaryObjective: result.primaryObjective,
    phase: result.phase,
    warnings: result.interferenceFindings.map((finding) => finding.reasons.join(' ')),
    debtSummary: result.trainingDebt.map((debt) => `${debt.objective}: ${debt.amount} prioritized debt unit${debt.amount === 1 ? '' : 's'}.`),
  };
}
