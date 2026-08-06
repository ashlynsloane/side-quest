import type { ExerciseMechanicalLoadProfile, SessionMechanicalLoadSummary } from '@circuit/domain';
import { deriveMechanicalLoadProfile, summarizeSessionMechanicalLoad } from '@circuit/planner';

export function buildMechanicalLoadSummary(profiles: ExerciseMechanicalLoadProfile[]): SessionMechanicalLoadSummary {
  return summarizeSessionMechanicalLoad(profiles);
}

export function mechanicalLoadSummaryText(summary: SessionMechanicalLoadSummary): string[] {
  const lines = [...summary.explanation];
  if (summary.reviewExerciseIds.length) lines.push(`${summary.reviewExerciseIds.length} exercise profile${summary.reviewExerciseIds.length === 1 ? '' : 's'} need${summary.reviewExerciseIds.length === 1 ? 's' : ''} metadata review.`);
  return lines;
}

export { deriveMechanicalLoadProfile };
