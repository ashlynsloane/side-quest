import type { WorkoutFlowValidationReport } from '@circuit/domain';

export interface WorkoutFlowHealthModel {
  status: 'ready' | 'warning' | 'blocked';
  title: string;
  details: string[];
}

export function buildWorkoutFlowHealthModel(report: WorkoutFlowValidationReport): WorkoutFlowHealthModel {
  const errors = report.issues.filter((issue) => issue.severity === 'error');
  if (errors.length) return { status: 'blocked', title: 'Workout needs repair', details: errors.map((issue) => issue.message) };
  if (report.issues.length) return { status: 'warning', title: 'Workout saved with warnings', details: report.issues.map((issue) => issue.message) };
  return { status: 'ready', title: 'Workout flow verified', details: ['Completion, persistence, favorites, and sharing are consistent.'] };
}
