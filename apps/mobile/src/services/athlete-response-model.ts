import type { AthletePersonalizedAdjustment, AthleteResponseProfile } from '@circuit/domain';

export function athleteResponseProfileSummary(profile: AthleteResponseProfile): {
  title: string;
  body: string;
  details: string[];
} {
  const title = profile.globalSignalQuality === 'established'
    ? 'Your response pattern is becoming clear'
    : profile.globalSignalQuality === 'emerging'
      ? 'Learning how you respond'
      : 'Building your baseline';
  const body = profile.globalSignalQuality === 'insufficient'
    ? 'The planner will keep using conservative general rules until there is enough repeated evidence.'
    : 'Your recent completion, soreness, pain, and next-workout response can now refine the plan within strict safety limits.';
  return { title, body, details: profile.explanations };
}

export function personalizedAdjustmentExplanation(adjustment: AthletePersonalizedAdjustment): string[] {
  const lead = adjustment.direction === 'progress'
    ? 'A small athlete-specific progression is supported.'
    : adjustment.direction === 'reduce'
      ? 'The next dose is reduced based on your repeated response.'
      : 'The current dose is repeated while the model learns.';
  return [lead, ...adjustment.reasons];
}
