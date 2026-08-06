import type { PostWorkoutResponseDecision } from '@circuit/domain';

export interface PostWorkoutResponseCard {
  eyebrow: string;
  title: string;
  body: string;
  detail: string[];
}

export function postWorkoutResponseCard(decision: PostWorkoutResponseDecision): PostWorkoutResponseCard {
  switch (decision.sessionAction) {
    case 'progress':
      return { eyebrow: 'NEXT DOSE', title: 'Ready for one small progression', body: 'The session was completed cleanly and felt easier than intended.', detail: decision.explanations };
    case 'reduce':
      return { eyebrow: 'NEXT DOSE', title: 'Lower the cost, keep the purpose', body: 'The next comparable session will use a smaller recoverable dose.', detail: decision.explanations };
    case 'substitute':
      return { eyebrow: 'EXERCISE RESPONSE', title: 'Use a familiar alternative', body: 'A recurring exercise-specific response makes substitution more appropriate than forcing progression.', detail: decision.explanations };
    case 'restrict_region':
      return { eyebrow: 'REGION RESPONSE', title: 'Protect what carried into the next workout', body: 'This response is treated as a regional restriction, not routine soreness.', detail: decision.explanations };
    default:
      return { eyebrow: 'NEXT DOSE', title: 'Repeat and learn', body: 'Keep the current dose while Side Quest builds a more reliable tolerance history.', detail: decision.explanations };
  }
}
