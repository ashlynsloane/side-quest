import type { PainExperienceKind, ProtectiveTrainingRequestDecision } from './athlete-context-intelligence';
import type { CoachMessageAdaptation, CoachTargetDiscipline } from './coach-message-adaptation';
import type { AdjustmentOption, AdjustmentReason } from './daily-adjustment';

export type CoachExplanationTier = 'normal' | 'adaptation' | 'protection';
export type CoachOutcomeRating = 'helped' | 'neutral' | 'hurt' | 'not_completed';
export type CoachSymptomResponse = 'better' | 'same' | 'worse' | 'not_applicable';
export type CoachInterventionConfidence = 'low' | 'moderate' | 'high';

export interface CoachInterventionFingerprint {
  discipline: CoachTargetDiscipline;
  reason: AdjustmentReason;
  action: AdjustmentOption['action'];
  painKind?: PainExperienceKind;
  menstrual: boolean;
  affectedArea: 'lower_body' | 'upper_body' | 'general' | 'unknown';
}

export interface CoachInterventionOutcomeObservation {
  id: string;
  interventionId: string;
  observedAt: string;
  fingerprint: CoachInterventionFingerprint;
  rating: CoachOutcomeRating;
  symptomResponse: CoachSymptomResponse;
  completedAsPlanned?: boolean;
}

export interface CoachInterventionEffectPattern {
  key: string;
  fingerprint: CoachInterventionFingerprint;
  observations: number;
  helped: number;
  neutral: number;
  hurt: number;
  notCompleted: number;
  helpedRate: number;
  hurtRate: number;
  completionRate?: number;
  confidence: CoachInterventionConfidence;
  direction: 'helpful' | 'mixed' | 'caution';
  summary: string;
}

export interface CoachDecisionExplanation {
  tier: CoachExplanationTier;
  headline: string;
  whatChanged: string;
  whyThis: string;
  protecting: string;
  whatWouldChangeTheCall: string;
  learnedContext?: string;
}

export interface CoachFollowUpPlan {
  dueAt: string;
  question: string;
  promptKind: 'safety_check' | 'adaptation_outcome' | 'completion_check';
  priority: 'normal' | 'high';
}

export interface ProactiveCoachCue {
  level: 'info' | 'attention';
  headline: string;
  body: string;
  evidence: string;
  automaticChangeAllowed: false;
}

export function fingerprintCoachIntervention(
  discipline: CoachTargetDiscipline,
  adaptation: CoachMessageAdaptation,
  option: AdjustmentOption,
): CoachInterventionFingerprint {
  return {
    discipline,
    reason: adaptation.interpretation.reason,
    action: option.action,
    painKind: adaptation.interpretation.painContext?.kind,
    menstrual: Boolean(adaptation.interpretation.menstrualContext?.active),
    affectedArea: adaptation.interpretation.affectedArea,
  };
}

export function buildCoachDecisionExplanation(input: {
  discipline: CoachTargetDiscipline;
  adaptation: CoachMessageAdaptation;
  option: AdjustmentOption;
  protectiveDecision?: ProtectiveTrainingRequestDecision;
  learnedPattern?: CoachInterventionEffectPattern;
}): CoachDecisionExplanation {
  const protection = input.protectiveDecision?.action === 'protect'
    || input.adaptation.painAssessment?.level === 'protect'
    || Boolean(input.adaptation.adjustment.safetyMessage);
  const adaptation = input.option.action !== 'keep' || input.adaptation.interpretation.reason !== 'other';
  const tier: CoachExplanationTier = protection ? 'protection' : adaptation ? 'adaptation' : 'normal';
  const interpretation = input.adaptation.interpretation;
  const pain = interpretation.painContext;
  const whatChanged = pain?.stoppedSession
    ? `${pain.kind.replaceAll('_', ' ')} symptoms changed or stopped training; that functional effect carries more weight than the numeric pain score.`
    : interpretation.summary;
  const whyThis = input.option.description;
  const protecting = protection
    ? input.protectiveDecision?.explanations.at(-1)
      ?? input.adaptation.adjustment.safetyMessage
      ?? 'This keeps the next training decision below the current safety ceiling until normal tolerance is clearer.'
    : input.option.weeklyConsequences[0]
      ?? 'This keeps the change local instead of creating unnecessary training debt elsewhere in the week.';
  const whatWouldChangeTheCall = pain
    ? 'A clear change in symptoms or function should trigger a fresh check; a lower or higher pain number alone is not enough.'
    : interpretation.reason === 'fatigue'
      ? 'If energy or soreness changes materially, Side Quest should re-check the session rather than carrying this adjustment forward automatically.'
      : 'New schedule, recovery, pain, or completion information should trigger a fresh planner check.';
  const learnedContext = input.learnedPattern && input.learnedPattern.confidence !== 'low'
    ? input.learnedPattern.summary
    : undefined;
  return {
    tier,
    headline: tier === 'protection'
      ? 'Protect the next decision, not the missed workout.'
      : tier === 'adaptation'
        ? 'Adjust today without breaking the week.'
        : 'The original plan still fits.',
    whatChanged,
    whyThis,
    protecting,
    whatWouldChangeTheCall,
    learnedContext,
  };
}

export function scheduleCoachFollowUp(input: {
  appliedAt: string;
  sessionDate: string;
  adaptation: CoachMessageAdaptation;
  option: AdjustmentOption;
}): CoachFollowUpPlan {
  const isSafety = input.adaptation.painAssessment?.level === 'protect'
    || input.adaptation.interpretation.reason === 'pain'
    || input.adaptation.interpretation.reason === 'illness';
  const sessionDayFollowUp = new Date(`${input.option.targetDate ?? input.sessionDate}T20:00:00.000Z`).getTime();
  const appliedTime = new Date(input.appliedAt).getTime();
  const minimumDelay = isSafety ? 12 : 18;
  const maximumDelay = isSafety ? 30 : 48;
  const earliest = appliedTime + minimumDelay * 3_600_000;
  const latest = appliedTime + maximumDelay * 3_600_000;
  const dueMs = Math.min(latest, Math.max(earliest, sessionDayFollowUp));
  const discipline = input.adaptation.interpretation.targetDiscipline ?? 'session';
  return {
    dueAt: new Date(dueMs).toISOString(),
    question: isSafety
      ? `How did your symptoms and function respond after the ${discipline} adjustment?`
      : `Did ${input.option.title.toLowerCase()} work well for you?`,
    promptKind: isSafety ? 'safety_check' : input.option.action === 'skip' ? 'completion_check' : 'adaptation_outcome',
    priority: isSafety ? 'high' : 'normal',
  };
}

export function learnCoachInterventionEffects(
  observations: CoachInterventionOutcomeObservation[],
): CoachInterventionEffectPattern[] {
  const groups = new Map<string, CoachInterventionOutcomeObservation[]>();
  for (const observation of dedupeById(observations)) {
    const key = interventionKey(observation.fingerprint);
    groups.set(key, [...(groups.get(key) ?? []), observation]);
  }
  return [...groups.entries()].map(([key, items]) => {
    const helped = items.filter((item) => item.rating === 'helped').length;
    const neutral = items.filter((item) => item.rating === 'neutral').length;
    const hurt = items.filter((item) => item.rating === 'hurt').length;
    const notCompleted = items.filter((item) => item.rating === 'not_completed').length;
    const evaluable = Math.max(1, helped + neutral + hurt);
    const helpedRate = helped / evaluable;
    const hurtRate = hurt / evaluable;
    const completionKnown = items.filter((item) => item.completedAsPlanned !== undefined);
    const completionRate = completionKnown.length
      ? completionKnown.filter((item) => item.completedAsPlanned).length / completionKnown.length
      : undefined;
    const confidence: CoachInterventionConfidence = items.length >= 7 ? 'high' : items.length >= 3 ? 'moderate' : 'low';
    const direction = confidence !== 'low' && hurtRate >= 0.5
      ? 'caution' as const
      : confidence !== 'low' && helpedRate >= 0.67 && hurtRate <= 0.2
        ? 'helpful' as const
        : 'mixed' as const;
    const fingerprint = items[0]!.fingerprint;
    const context = `${fingerprint.action} ${fingerprint.discipline} for ${fingerprint.reason}`;
    const summary = direction === 'helpful'
      ? `${context} has helped in ${helped} of ${evaluable} evaluable outcomes for this athlete.`
      : direction === 'caution'
        ? `${context} has produced negative outcomes in ${hurt} of ${evaluable} evaluable outcomes; treat it as a lower-confidence option.`
        : `${context} does not yet show a consistent personal outcome pattern.`;
    return { key, fingerprint, observations: items.length, helped, neutral, hurt, notCompleted, helpedRate, hurtRate, completionRate, confidence, direction, summary };
  }).sort((left, right) => right.observations - left.observations || left.key.localeCompare(right.key));
}

export function findCoachInterventionEffectPattern(
  fingerprint: CoachInterventionFingerprint,
  patterns: CoachInterventionEffectPattern[],
): CoachInterventionEffectPattern | undefined {
  const exact = patterns.find((pattern) => pattern.key === interventionKey(fingerprint));
  if (exact) return exact;
  return patterns.find((pattern) =>
    pattern.fingerprint.discipline === fingerprint.discipline
    && pattern.fingerprint.reason === fingerprint.reason
    && pattern.fingerprint.action === fingerprint.action
    && pattern.fingerprint.menstrual === fingerprint.menstrual,
  );
}

export function buildProactiveCoachCue(pattern: CoachInterventionEffectPattern): ProactiveCoachCue | null {
  if (pattern.confidence === 'low' || pattern.direction === 'mixed') return null;
  if (pattern.direction === 'helpful') {
    return {
      level: 'info',
      headline: 'A personal response pattern is emerging.',
      body: `${pattern.summary} Side Quest can surface this option earlier when a similar situation happens again, but it will still re-check the current week first.`,
      evidence: `${pattern.observations} athlete-specific outcomes · ${pattern.confidence} confidence`,
      automaticChangeAllowed: false,
    };
  }
  return {
    level: 'attention',
    headline: 'A prior adjustment deserves more caution.',
    body: `${pattern.summary} Side Quest should offer alternatives rather than treating this adjustment as the default.`,
    evidence: `${pattern.observations} athlete-specific outcomes · ${pattern.confidence} confidence`,
    automaticChangeAllowed: false,
  };
}

export function outcomeRatingFromFollowUp(response: 'better' | 'same' | 'worse' | 'not_completed'): {
  rating: CoachOutcomeRating;
  symptomResponse: CoachSymptomResponse;
  completedAsPlanned?: boolean;
} {
  if (response === 'better') return { rating: 'helped', symptomResponse: 'better', completedAsPlanned: true };
  if (response === 'same') return { rating: 'neutral', symptomResponse: 'same', completedAsPlanned: true };
  if (response === 'worse') return { rating: 'hurt', symptomResponse: 'worse', completedAsPlanned: true };
  return { rating: 'not_completed', symptomResponse: 'not_applicable', completedAsPlanned: false };
}

function interventionKey(fingerprint: CoachInterventionFingerprint): string {
  return [
    fingerprint.discipline,
    fingerprint.reason,
    fingerprint.action,
    fingerprint.painKind ?? 'no_pain',
    fingerprint.menstrual ? 'menstrual' : 'not_menstrual',
    fingerprint.affectedArea,
  ].join('|');
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) byId.set(item.id, item);
  return [...byId.values()];
}
