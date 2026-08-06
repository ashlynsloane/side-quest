import type { AdaptationTrajectory, LongTermAdaptationResult } from '@circuit/domain';

export interface AdaptationTrendCard {
  title: string;
  summary: string;
  confidenceLabel: string;
  items: Array<{ objective: string; direction: string; change: string; evidence: string }>;
  note: string;
}

function itemFor(trajectory: AdaptationTrajectory) {
  const change = trajectory.changeOver28Days > 0
    ? `+${trajectory.changeOver28Days}`
    : `${trajectory.changeOver28Days}`;
  return {
    objective: trajectory.objective.replaceAll('_', ' '),
    direction: trajectory.direction,
    change,
    evidence: `${trajectory.evidenceCount} signals · ${trajectory.confidence} confidence`,
  };
}

export function buildAdaptationTrendCard(result: LongTermAdaptationResult): AdaptationTrendCard {
  const ranked = [...result.trajectories].sort((a, b) => b.estimatedLevel - a.estimatedLevel);
  const confidence = ranked.some((item) => item.confidence === 'high')
    ? 'Established trends'
    : ranked.some((item) => item.confidence === 'moderate')
      ? 'Emerging trends'
      : 'Early estimates';
  return {
    title: 'Training adaptations',
    summary: result.strongestObjective
      ? `Your strongest modeled adaptation is ${result.strongestObjective.replaceAll('_', ' ')}.`
      : 'More completed training is needed before adaptation trends can be estimated.',
    confidenceLabel: confidence,
    items: ranked.slice(0, 6).map(itemFor),
    note: 'These are planning estimates derived from your history, not lab measurements or diagnoses.',
  };
}
