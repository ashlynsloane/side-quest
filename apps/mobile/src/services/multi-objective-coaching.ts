import type { CoachOptimizationDecision } from '@circuit/domain';

export interface CoachingPrioritiesCard { title: string; priorities: string[]; }
export interface CoachingTradeoffCard { title: string; items: string[]; requiresAthleteChoice: boolean; }
export interface CoachingOptionsCard { title: string; optionIds: string[]; selectedOptionId?: string; }

export function buildMultiObjectiveCards(decision: CoachOptimizationDecision): {
  priorities: CoachingPrioritiesCard;
  options: CoachingOptionsCard;
  tradeoffs?: CoachingTradeoffCard;
} {
  const result: {
    priorities: CoachingPrioritiesCard;
    options: CoachingOptionsCard;
    tradeoffs?: CoachingTradeoffCard;
  } = {
    priorities: {
      title: 'What this decision protects',
      priorities: [...decision.objectives].sort((a, b) => a.objectiveId.localeCompare(b.objectiveId)).map((objective) => objective.kind.replaceAll('_', ' ')),
    },
    options: {
      title: decision.requiresAthleteChoice ? 'Choose the tradeoff that fits today' : 'Best-fitting option',
      optionIds: decision.paretoFrontierIds,
      selectedOptionId: decision.selectedCandidateId,
    },
  };
  if (decision.unresolvedTradeoffs.length) result.tradeoffs = {
    title: 'What changes between these options',
    items: decision.unresolvedTradeoffs.map((tradeoff) => tradeoff.description),
    requiresAthleteChoice: decision.requiresAthleteChoice,
  };
  return result;
}
