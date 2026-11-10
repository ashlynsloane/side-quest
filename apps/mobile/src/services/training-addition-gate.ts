import { evaluateTrainingAddition, type ProposedActivity, type TrainingGuardrailResult } from '@circuit/planner';
import { loadDailyCeiling, recordTrainingEvent } from './training-guardrail-storage';

export interface TrainingAdditionRequest {
  userId: string;
  date: string;
  proposed: ProposedActivity;
  requestId: string;
  occurredAt: string;
}

/**
 * Fail closed when no daily budget exists. Call from every add-more entry point.
 * This function evaluates and records the decision, but does not start workouts.
 */
export function assessTrainingAddition(request: TrainingAdditionRequest): TrainingGuardrailResult {
  const ceiling = loadDailyCeiling(request.userId, request.date);
  const result: TrainingGuardrailResult = ceiling
    ? evaluateTrainingAddition(ceiling, request.proposed)
    : {
      decision: 'defer',
      reasons: ['No daily training ceiling is available. Create or refresh today\'s prescription first.'],
      requiresReassessment: true,
    };
  recordTrainingEvent(request.userId, {
    id: request.requestId,
    occurredAt: request.occurredAt,
    kind: 'assessment',
    note: JSON.stringify({
      category: 'addition_assessment',
      decision: result.decision,
      reasons: result.reasons,
      proposed: request.proposed,
    }),
  });
  return result;
}
