export type BetaScenarioId =
  | 'cold-start'
  | 'steady-build'
  | 'adjusted-week'
  | 'return-to-training'
  | 'travel-week';

export interface BetaScenario {
  id: BetaScenarioId;
  label: string;
  status: string;
  purpose: string;
  athleteContext: string[];
  expectedSurfaces: string[];
  reviewQuestions: string[];
}

export const V31_BETA_SCENARIOS: readonly BetaScenario[] = [
  {
    id: 'cold-start',
    label: 'Cold start',
    status: 'Intake-based',
    purpose: 'Verify that Side Quest is immediately useful before training history exists.',
    athleteContext: ['70.3 goal', 'Three strength windows', 'Home dumbbells and bands', 'No imported training history'],
    expectedSurfaces: ['Today explains why the first session fits', 'Progress shows a useful baseline instead of an empty state', 'Coach labels the recommendation as intake-based'],
    reviewQuestions: ['Is the first action obvious?', 'Does the app avoid implying certainty it does not have?'],
  },
  {
    id: 'steady-build',
    label: 'Steady build week',
    status: 'History-informed',
    purpose: 'Review the normal experience after the app has enough recent training context.',
    athleteContext: ['Four weeks of history', 'Ordinary swim, bike, and strength load', 'No active symptoms', 'One planned race'],
    expectedSurfaces: ['Today presents one primary recommendation', 'Coach evidence is concise and specific', 'Progress uses plan-relative regional language'],
    reviewQuestions: ['Does the recommendation feel appropriately confident?', 'Can the athlete understand the evidence without opening several screens?'],
  },
  {
    id: 'adjusted-week',
    label: 'Adjusted week',
    status: 'Athlete-approved change',
    purpose: 'Test how a recommendation change is explained after schedule or fatigue feedback.',
    athleteContext: ['Long ride completed', 'Limited time tomorrow', 'Strength session moved, not deleted', 'Athlete approval required'],
    expectedSurfaces: ['Coach shows what changed and why', 'Today reflects the approved schedule', 'History preserves recommendation → response → adjustment'],
    reviewQuestions: ['Is the athlete clearly in control?', 'Is the difference between a proposal and an applied change obvious?'],
  },
  {
    id: 'return-to-training',
    label: 'Return to training',
    status: 'Guardrail-limited',
    purpose: 'Review conservative language and safeguards when recent symptoms restrict training.',
    athleteContext: ['Recent lower-body restriction', 'No automatic diagnosis', 'Reduced impact exposure', 'Direct strength preserved where appropriate'],
    expectedSurfaces: ['Today avoids performance pressure', 'Coach states the respected restriction', 'Body map separates symptoms from training exposure'],
    reviewQuestions: ['Does the app avoid sounding clinical?', 'Are safeguards clear without making the athlete feel punished?'],
  },
  {
    id: 'travel-week',
    label: 'Travel week',
    status: 'Constraint-aware',
    purpose: 'Verify that equipment and availability changes produce a coherent temporary plan.',
    athleteContext: ['Hotel gym', 'Two short windows', 'No barbell access', 'Normal plan resumes afterward'],
    expectedSurfaces: ['Today uses the active equipment location', 'Workout preview names the travel variant', 'Coach distinguishes a temporary substitution from a plan rewrite'],
    reviewQuestions: ['Is the temporary context visible?', 'Can the athlete return to the normal plan without cleanup?'],
  },
] as const;
