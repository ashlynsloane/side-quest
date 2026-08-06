import type {
  ExerciseExposureRecord,
  ExerciseNoveltyCandidate,
  ExerciseNoveltyDecision,
  StrengthLoadDecision,
} from '@circuit/domain';
import { buildExerciseNoveltyDecision } from '@circuit/planner';

export function makeExerciseNoveltyDecision({
  candidates,
  exposureHistory,
  loadDecision,
  now,
}: {
  candidates: ExerciseNoveltyCandidate[];
  exposureHistory?: ExerciseExposureRecord[];
  loadDecision: StrengthLoadDecision;
  now?: string;
}): ExerciseNoveltyDecision {
  return buildExerciseNoveltyDecision({ candidates, exposureHistory, loadDecision, now });
}

export function exerciseNoveltySummary(decision: ExerciseNoveltyDecision): string {
  if (decision.maximumNovelExercises === 0) return 'Today uses familiar movements only while your current training response settles.';
  if (decision.deferredExerciseIds.length > 0) {
    return `${decision.deferredExerciseIds.length} unfamiliar movement${decision.deferredExerciseIds.length === 1 ? ' was' : 's were'} deferred so novelty does not increase at the same time as overall training load.`;
  }
  if (decision.maximumNovelExercises === 1) return 'This workout introduces no more than one unfamiliar movement while tolerance develops.';
  return 'Exercise variety fits the current novelty budget, with high-demand additions limited to one at a time.';
}
