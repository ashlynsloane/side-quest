import type { TwinGovernanceState, TwinReliabilitySummary } from '@circuit/domain';

export interface CoachModelReliabilityCard {
  title: string;
  status: 'Stable' | 'Reviewing' | 'Using defaults';
  summary: string[];
  frozenParameterCount: number;
  excludedEvidenceCount: number;
  rollbackCount: number;
}

export function buildCoachModelReliabilityCard(
  state: TwinGovernanceState,
  summary: TwinReliabilitySummary,
): CoachModelReliabilityCard {
  return {
    title: 'Coach model reliability',
    status: summary.overall === 'stable' ? 'Stable' : summary.overall === 'watch' ? 'Reviewing' : 'Using defaults',
    summary: summary.summary,
    frozenParameterCount: state.frozenParameters.length,
    excludedEvidenceCount: state.exclusions.length,
    rollbackCount: state.rollbacks.length,
  };
}
