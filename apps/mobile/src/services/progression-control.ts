import type { ProgressionControlDecision, ProgressionVariable } from '@circuit/domain';

const LABELS: Record<ProgressionVariable, string> = {
  load: 'weight', reps: 'repetitions', duration: 'duration', frequency: 'weekly frequency', novelty: 'exercise novelty', complexity: 'technical complexity',
};

export function progressionControlHeadline(decision: ProgressionControlDecision): string {
  if (decision.action === 'reduce') return 'Reduce one demand';
  if (decision.action === 'hold') return 'Hold this dose';
  if (decision.selections.length === 1) return `Progress ${LABELS[decision.selections[0]!.variable]}`;
  return 'Progress from a strong baseline';
}

export function progressionControlSummary(decision: ProgressionControlDecision): string {
  if (decision.action === 'hold') return decision.explanations[0] ?? 'Keep the current prescription while recent training consolidates.';
  const changes = decision.selections.map((item) => `${LABELS[item.variable]} ${item.currentValue} → ${item.targetValue}`);
  return `${changes.join(' · ')}. ${decision.explanations[0] ?? ''}`.trim();
}
