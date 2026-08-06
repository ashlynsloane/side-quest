import type { DemandBand, ImpactBand, RecommendationConfidence, SessionPriority, UnifiedDiscipline } from './unified-training';

export type EndurancePurpose =
  | 'recovery'
  | 'technique'
  | 'aerobic'
  | 'long_endurance'
  | 'tempo'
  | 'threshold'
  | 'vo2'
  | 'race_specific'
  | 'brick'
  | 'return_to_sport';

export type StrengthRole = 'heavy_lower' | 'heavy_upper' | 'moderate_full_body' | 'upper_support' | 'stability' | 'maintenance';
export type DayPart = 'early_morning' | 'morning' | 'midday' | 'afternoon' | 'evening';

export interface TrainingWindow {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startMinutes: number;
  endMinutes: number;
  allowedDisciplines?: UnifiedDiscipline[];
  locationId?: string;
}

export interface EndurancePrescription {
  id: string;
  discipline: 'swim' | 'bike' | 'run';
  purpose: EndurancePurpose;
  priority: SessionPriority;
  durationRangeMinutes: [number, number];
  targetIntensity: 'recovery' | 'easy' | 'moderate' | 'hard';
  accumulatedQualityMinutes?: [number, number];
  minimumRecoveryBeforeNextHardSessionHours: number;
  cardiovascularDemand: DemandBand;
  musculoskeletalDemand: DemandBand;
  impact: ImpactBand;
  lowerBodyDemand: DemandBand;
  upperBodyDemand: DemandBand;
  compatibleStrengthRoles: StrengthRole[];
  conditionalStrengthRoles: StrengthRole[];
  incompatibleStrengthRoles: StrengthRole[];
  confidence: RecommendationConfidence;
  coachingNotes: string[];
}

export interface SessionPairAssessment {
  compatibility: 'good' | 'conditional' | 'poor';
  preferredOrder: 'first_then_second' | 'second_then_first' | 'either';
  minimumSeparationHours: number;
  rationale: string[];
  secondSessionAdjustment?: string;
}

export function createEndurancePrescription(input: {
  id: string;
  discipline: 'swim' | 'bike' | 'run';
  purpose: EndurancePurpose;
  durationRangeMinutes: [number, number];
  priority?: SessionPriority;
}): EndurancePrescription {
  const hard = ['tempo', 'threshold', 'vo2', 'race_specific', 'brick'].includes(input.purpose);
  const long = input.purpose === 'long_endurance';
  const recovery = input.purpose === 'recovery' || input.purpose === 'technique' || input.purpose === 'return_to_sport';
  const runImpact: ImpactBand = input.discipline === 'run' ? (hard ? 'high' : recovery ? 'low' : 'moderate') : 'none';
  const lower: DemandBand = input.discipline === 'bike' || input.discipline === 'run' ? (hard || long ? 'high' : recovery ? 'low' : 'moderate') : 'none';
  const upper: DemandBand = input.discipline === 'swim' ? (hard ? 'high' : recovery ? 'low' : 'moderate') : 'none';

  return {
    id: input.id,
    discipline: input.discipline,
    purpose: input.purpose,
    priority: input.priority ?? (hard || long ? 'required' : recovery ? 'optional' : 'recommended'),
    durationRangeMinutes: input.durationRangeMinutes,
    targetIntensity: recovery ? 'easy' : hard ? 'hard' : 'moderate',
    accumulatedQualityMinutes: input.purpose === 'vo2' ? [12, 24] : input.purpose === 'threshold' ? [20, 40] : undefined,
    minimumRecoveryBeforeNextHardSessionHours: hard || long ? 18 : recovery ? 4 : 10,
    cardiovascularDemand: hard || long ? 'high' : recovery ? 'low' : 'moderate',
    musculoskeletalDemand: input.discipline === 'run' ? (hard || long ? 'high' : 'moderate') : input.discipline === 'bike' ? (hard || long ? 'moderate' : 'low') : 'low',
    impact: runImpact,
    lowerBodyDemand: lower,
    upperBodyDemand: upper,
    compatibleStrengthRoles: input.discipline === 'swim'
      ? ['heavy_lower', 'stability', 'maintenance']
      : hard || long
        ? ['upper_support', 'stability', 'maintenance']
        : ['heavy_upper', 'upper_support', 'stability', 'maintenance'],
    conditionalStrengthRoles: input.discipline === 'swim'
      ? ['heavy_upper', 'upper_support', 'moderate_full_body']
      : ['moderate_full_body', 'heavy_lower'],
    incompatibleStrengthRoles: input.discipline === 'swim'
      ? (hard ? ['heavy_upper'] : [])
      : (hard || long ? ['heavy_lower'] : []),
    confidence: 'moderate',
    coachingNotes: purposeNotes(input.discipline, input.purpose),
  };
}

export function assessSessionPair(input: {
  first: EndurancePrescription | { discipline: 'strength'; role: StrengthRole; priority: SessionPriority };
  second: EndurancePrescription | { discipline: 'strength'; role: StrengthRole; priority: SessionPriority };
  separationHours: number;
  phasePriority: 'strength' | 'endurance' | 'balanced';
}): SessionPairAssessment {
  const strength = input.first.discipline === 'strength' ? input.first : input.second.discipline === 'strength' ? input.second : null;
  const endurance = input.first.discipline === 'strength' ? input.second : input.first;
  if (!strength || endurance.discipline === 'strength') {
    return {
      compatibility: input.separationHours >= 8 ? 'good' : 'conditional',
      preferredOrder: 'either',
      minimumSeparationHours: 6,
      rationale: ['Two endurance sessions are assessed by combined intensity and the athlete’s weekly hard-day budget.'],
    };
  }

  const poorRole = endurance.incompatibleStrengthRoles.includes(strength.role);
  const conditionalRole = endurance.conditionalStrengthRoles.includes(strength.role);
  const minimum = poorRole ? 18 : conditionalRole ? 8 : 4;
  const separated = input.separationHours >= minimum;
  const compatibility = poorRole && !separated ? 'poor' : conditionalRole && !separated ? 'conditional' : 'good';
  const enduranceFirst = input.phasePriority === 'endurance' || endurance.priority === 'required';
  const strengthFirst = input.phasePriority === 'strength' && strength.priority === 'required';

  return {
    compatibility,
    preferredOrder: enduranceFirst ? (input.first.discipline === 'strength' ? 'second_then_first' : 'first_then_second') : strengthFirst ? (input.first.discipline === 'strength' ? 'first_then_second' : 'second_then_first') : 'either',
    minimumSeparationHours: minimum,
    rationale: [
      poorRole
        ? `${strength.role.replaceAll('_', ' ')} can compromise the quality or recovery of this ${endurance.purpose.replaceAll('_', ' ')} session.`
        : 'The pairing is compatible when total daily stress and the next day are protected.',
      input.separationHours >= 8 ? 'The sessions are separated by several hours, reducing acute interference.' : 'Short separation increases the importance of ordering and reducing the second session.',
    ],
    secondSessionAdjustment: compatibility === 'poor'
      ? 'Move the lower-priority session or convert it to a brief maintenance dose.'
      : compatibility === 'conditional'
        ? 'Reduce the second session’s volume and avoid failure, new exercises, or plyometrics.'
        : undefined,
  };
}

function purposeNotes(discipline: 'swim' | 'bike' | 'run', purpose: EndurancePurpose): string[] {
  const notes: string[] = [];
  if (purpose === 'vo2') notes.push('Accumulate a limited amount of high-quality work rather than chasing exhaustion.');
  if (purpose === 'long_endurance') notes.push('Keep most of the session easy and practice fueling when appropriate.');
  if (purpose === 'technique') notes.push('Protect movement quality; fatigue should not be the main objective.');
  if (purpose === 'return_to_sport') notes.push('Progress exposure only when symptoms remain stable during and after the session.');
  if (discipline === 'swim') notes.push('Upper-body strength placement depends on whether the swim is technical, aerobic, or high intensity.');
  return notes;
}
