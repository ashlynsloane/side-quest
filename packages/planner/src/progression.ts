import type {
  EquipmentId,
  WorkoutDifficultyFeedback,
} from '@circuit/domain';

export interface ExerciseLoadObservation {
  exerciseId: string;
  exerciseName: string;
  loadValue?: number;
  loadUnit?: 'lb' | 'kg';
  equipmentId?: EquipmentId;
  targetValue?: number;
  targetUnit?: 'total' | 'per_side' | 'seconds';
  completionFraction?: number;
  completedAt: string;
}

export interface ExerciseProgressionMetadata {
  exerciseId: string;
  equipmentIds?: EquipmentId[];
  defaultTarget?: number;
  targetUnit?: 'total' | 'per_side' | 'seconds';
  minimumTarget?: number;
  maximumTarget?: number;
}

export interface AvailableLoadOptions {
  unit: 'lb' | 'kg';
  values: number[];
}

export interface ExerciseProgressionContext {
  daysSinceLastStrength?: number;
  missedSessionsLast28Days?: number;
  returningFromInjury?: boolean;
  activePainRestriction?: boolean;
}

export type ExerciseProgressionStrategy =
  | 'collect_more'
  | 'hold'
  | 'reps_up'
  | 'load_up'
  | 'dose_down'
  | 'reentry';

export interface ExerciseProgressionRecommendation {
  exerciseId: string;
  exerciseName: string;
  currentLoad?: number;
  loadUnit?: 'lb' | 'kg';
  suggestedLoad?: number;
  currentTarget?: number;
  suggestedTarget?: number;
  targetUnit?: 'total' | 'per_side' | 'seconds';
  equipmentId?: EquipmentId;
  action: 'increase' | 'hold' | 'reduce' | 'collect_more';
  strategy: ExerciseProgressionStrategy;
  confidence: 'low' | 'moderate' | 'high';
  observations: number;
  rationale: string[];
}

export function recommendExerciseProgressions({
  history,
  exerciseMetadata = [],
  recentFeedback = [],
  recentRpe = [],
  continuity = {},
  availableLoads = {},
}: {
  history: ExerciseLoadObservation[];
  exerciseMetadata?: ExerciseProgressionMetadata[];
  recentFeedback?: WorkoutDifficultyFeedback[];
  recentRpe?: number[];
  continuity?: ExerciseProgressionContext;
  availableLoads?: Partial<Record<EquipmentId, AvailableLoadOptions>>;
}): ExerciseProgressionRecommendation[] {
  const metadataByExercise = new Map(exerciseMetadata.map((item) => [item.exerciseId, item]));
  const byExercise = new Map<string, ExerciseLoadObservation[]>();
  for (const observation of history) {
    if (observation.loadValue !== undefined && (!Number.isFinite(observation.loadValue) || observation.loadValue <= 0)) continue;
    const group = byExercise.get(observation.exerciseId) ?? [];
    group.push(observation);
    byExercise.set(observation.exerciseId, group);
  }

  const tooEasy = recentFeedback.filter((item) => item === 'too_easy').length;
  const tooHard = recentFeedback.filter((item) => item === 'too_hard').length;
  const averageRpe = recentRpe.length
    ? recentRpe.reduce((sum, value) => sum + value, 0) / recentRpe.length
    : null;

  return [...byExercise.values()].map((group) => {
    const observations = [...group].sort((left, right) => right.completedAt.localeCompare(left.completedAt));
    const latest = observations[0];
    if (!latest) throw new Error('Unexpected empty exercise history group.');
    const metadata = metadataByExercise.get(latest.exerciseId);
    const loadUnit = latest.loadUnit ?? observations.find((item) => item.loadUnit)?.loadUnit;
    const equipmentId = latest.equipmentId
      ?? observations.find((item) => item.equipmentId)?.equipmentId
      ?? selectLikelyEquipment(metadata?.equipmentIds);
    const currentLoad = latest.loadValue ?? observations.find((item) => item.loadValue !== undefined)?.loadValue;
    const savedLoadOptions = equipmentId ? availableLoads[equipmentId] : undefined;
    const savedAvailableLoads = savedLoadOptions && savedLoadOptions.unit === loadUnit ? savedLoadOptions.values : undefined;
    const targetUnit = latest.targetUnit ?? metadata?.targetUnit ?? 'total';
    const currentTarget = latest.targetValue ?? metadata?.defaultTarget;
    const minimumTarget = metadata?.minimumTarget ?? defaultMinimum(targetUnit);
    const maximumTarget = metadata?.maximumTarget ?? defaultMaximum(targetUnit);

    const comparable = observations.filter((item) => {
      if (loadUnit && item.loadUnit && item.loadUnit !== loadUnit) return false;
      if (equipmentId && item.equipmentId && item.equipmentId !== equipmentId) return false;
      return true;
    });
    const loadObservations = comparable.filter((item) => item.loadValue !== undefined);
    const previousLoad = loadObservations[1]?.loadValue;
    const stableRecentLoads = currentLoad !== undefined
      && loadObservations.slice(0, 3).every((item) => item.loadValue !== undefined && relativeDifference(item.loadValue, currentLoad) <= 0.03);
    const recentIncrease = currentLoad !== undefined && previousLoad !== undefined
      ? currentLoad > previousLoad * 1.03
      : false;
    const hardSignal = tooHard > tooEasy || (averageRpe !== null && averageRpe >= 8.5);
    const easySignal = tooEasy > tooHard || (averageRpe !== null && averageRpe <= 6);
    const interrupted = (continuity.daysSinceLastStrength ?? 0) >= 14
      || (continuity.missedSessionsLast28Days ?? 0) >= 2;
    const conservativeReturn = Boolean(continuity.returningFromInjury || continuity.activePainRestriction);

    let action: ExerciseProgressionRecommendation['action'] = 'hold';
    let strategy: ExerciseProgressionStrategy = 'hold';
    let suggestedLoad = currentLoad;
    let suggestedTarget = currentTarget;
    let confidence: ExerciseProgressionRecommendation['confidence'] = 'moderate';
    const rationale: string[] = [];

    if (conservativeReturn || interrupted) {
      action = 'reduce';
      strategy = 'reentry';
      confidence = conservativeReturn ? 'high' : 'moderate';
      if (currentLoad !== undefined && loadUnit) {
        const factor = conservativeReturn ? 0.8 : 0.9;
        suggestedLoad = previousAvailableLoad(currentLoad * factor, equipmentId, loadUnit, savedAvailableLoads);
      }
      if (currentTarget !== undefined) {
        const factor = conservativeReturn ? 0.75 : 0.85;
        suggestedTarget = clampTarget(roundTarget(currentTarget * factor, targetUnit), minimumTarget, currentTarget);
      }
      rationale.push(conservativeReturn
        ? 'An active return-from-injury or pain context favors a deliberate re-entry dose rather than linear progression.'
        : 'Strength training has been interrupted for about two weeks or multiple planned sessions were missed. Resume below the prior dose and rebuild.'
      );
      rationale.push('Return recommendations reduce one or both variables, then hold until the movement again feels routine and controlled.');
    } else if (comparable.length < 2) {
      action = 'collect_more';
      strategy = 'collect_more';
      confidence = 'low';
      rationale.push('Only one comparable exposure has been recorded. Repeat the exercise before changing the prescription.');
    } else if (hardSignal) {
      action = 'reduce';
      strategy = 'dose_down';
      confidence = comparable.length >= 3 ? 'high' : 'moderate';
      if (currentTarget !== undefined && currentTarget > minimumTarget) {
        suggestedTarget = previousTargetRung(currentTarget, targetUnit, minimumTarget);
        rationale.push('Recent effort or difficulty feedback suggests reducing repetitions or time before making a large load change.');
      } else if (currentLoad !== undefined && loadUnit) {
        suggestedLoad = previousAvailableLoad(currentLoad, equipmentId, loadUnit, savedAvailableLoads);
        rationale.push('Recent effort or difficulty feedback suggests stepping down to the next realistic available implement.');
      } else {
        rationale.push('Recent effort or difficulty feedback indicates that the current training dose may be too demanding.');
      }
    } else if (recentIncrease) {
      action = 'hold';
      strategy = 'hold';
      rationale.push('The most recent load already increased. Confirm it for another exposure before progressing again.');
    } else if (stableRecentLoads && comparable.length >= 2 && easySignal) {
      if (currentTarget !== undefined && currentTarget < maximumTarget) {
        action = 'increase';
        strategy = 'reps_up';
        suggestedTarget = nextTargetRung(currentTarget, targetUnit, maximumTarget);
        confidence = comparable.length >= 3 ? 'high' : 'moderate';
        rationale.push('The current load appears manageable. Progress repetitions or time first while keeping the implement unchanged.');
        rationale.push('Load progression is considered only after the top of the useful rep or time range is controlled.');
      } else if (currentLoad !== undefined && loadUnit) {
        action = 'increase';
        strategy = 'load_up';
        suggestedLoad = nextAvailableLoad(currentLoad, equipmentId, loadUnit, savedAvailableLoads);
        suggestedTarget = resetTargetAfterLoadIncrease(currentTarget, targetUnit, minimumTarget);
        confidence = comparable.length >= 3 ? 'high' : 'moderate';
        rationale.push('The upper end of the current rep or time range is controlled, so the next realistic equipment increment is appropriate.');
        rationale.push('After increasing load, return toward the lower end of the rep range rather than increasing both variables together.');
      } else {
        action = 'hold';
        strategy = 'hold';
        rationale.push('The exercise is ready for a harder variation, but no external load has been recorded. Use the exercise variation ladder rather than inventing a weight target.');
      }
    } else {
      action = 'hold';
      strategy = 'hold';
      rationale.push('The current dose does not yet show a clear reason to increase or reduce it.');
      if (averageRpe !== null) rationale.push(`Recent average session effort is ${averageRpe.toFixed(1)} out of 10.`);
    }

    if (suggestedLoad !== undefined && currentLoad !== undefined && strategy === 'load_up' && suggestedLoad <= currentLoad) {
      if (savedAvailableLoads?.length) {
        action = 'hold';
        strategy = 'hold';
        suggestedLoad = currentLoad;
        rationale.push('No heavier saved implement is available in the active equipment profile. Hold the load and use repetitions, tempo, range, or a harder variation instead.');
      } else {
        suggestedLoad = nextAvailableLoad(currentLoad, equipmentId, loadUnit ?? 'lb');
      }
    }
    if (suggestedLoad !== undefined && suggestedLoad <= 0) suggestedLoad = currentLoad;

    return {
      exerciseId: latest.exerciseId,
      exerciseName: latest.exerciseName,
      currentLoad,
      loadUnit,
      suggestedLoad,
      currentTarget,
      suggestedTarget,
      targetUnit,
      equipmentId,
      action,
      strategy,
      confidence,
      observations: comparable.length,
      rationale,
    };
  }).sort((left, right) => progressionRank(left.action) - progressionRank(right.action)
    || right.observations - left.observations
    || left.exerciseName.localeCompare(right.exerciseName));
}

export function nextAvailableLoad(
  current: number,
  equipmentId: EquipmentId | undefined,
  unit: 'lb' | 'kg',
  availableLoads?: number[],
): number {
  const savedSequence = normalizedAvailableLoads(availableLoads);
  const sequence = savedSequence ?? loadSequence(equipmentId, unit);
  const exactOrNext = sequence.find((value) => value > current + 0.001);
  if (exactOrNext !== undefined) return exactOrNext;
  if (savedSequence) return current;
  const increment = fallbackIncrement(equipmentId, unit);
  return Math.ceil((current + 0.001) / increment) * increment;
}

export function previousAvailableLoad(
  current: number,
  equipmentId: EquipmentId | undefined,
  unit: 'lb' | 'kg',
  availableLoads?: number[],
): number {
  const savedSequence = normalizedAvailableLoads(availableLoads);
  const sequence = savedSequence ?? loadSequence(equipmentId, unit);
  const candidates = sequence.filter((value) => value < current - 0.001);
  if (candidates.length) return candidates.at(-1)!;
  if (savedSequence) return current;
  const increment = fallbackIncrement(equipmentId, unit);
  return Math.max(increment, Math.floor((current - 0.001) / increment) * increment);
}


function normalizedAvailableLoads(values: number[] | undefined): number[] | null {
  if (!values?.length) return null;
  const normalized = [...new Set(values.filter((value) => Number.isFinite(value) && value > 0))].sort((left, right) => left - right);
  return normalized.length ? normalized : null;
}

function progressionRank(action: ExerciseProgressionRecommendation['action']) {
  if (action === 'reduce') return 0;
  if (action === 'increase') return 1;
  if (action === 'hold') return 2;
  return 3;
}

function relativeDifference(left: number, right: number) {
  const denominator = Math.max(Math.abs(left), Math.abs(right), 1);
  return Math.abs(left - right) / denominator;
}

function selectLikelyEquipment(values: EquipmentId[] | undefined): EquipmentId | undefined {
  return values?.find((item) => item !== 'bodyweight') ?? values?.[0];
}

function defaultMinimum(unit: 'total' | 'per_side' | 'seconds') {
  return unit === 'seconds' ? 15 : 6;
}

function defaultMaximum(unit: 'total' | 'per_side' | 'seconds') {
  return unit === 'seconds' ? 60 : 15;
}

function roundTarget(value: number, unit: 'total' | 'per_side' | 'seconds') {
  const increment = unit === 'seconds' ? 5 : 1;
  return Math.round(value / increment) * increment;
}

function clampTarget(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function nextTargetRung(current: number, unit: 'total' | 'per_side' | 'seconds', maximum: number) {
  const rungs = unit === 'seconds'
    ? [15, 20, 30, 40, 45, 60, 75, 90]
    : [4, 6, 8, 10, 12, 15, 20, 25];
  return Math.min(maximum, rungs.find((value) => value > current) ?? maximum);
}

function previousTargetRung(current: number, unit: 'total' | 'per_side' | 'seconds', minimum: number) {
  const rungs = unit === 'seconds'
    ? [10, 15, 20, 30, 40, 45, 60, 75, 90]
    : [3, 4, 6, 8, 10, 12, 15, 20, 25];
  const candidates = rungs.filter((value) => value < current);
  return Math.max(minimum, candidates.at(-1) ?? minimum);
}

function resetTargetAfterLoadIncrease(
  current: number | undefined,
  unit: 'total' | 'per_side' | 'seconds',
  minimum: number,
) {
  if (current === undefined) return undefined;
  if (unit === 'seconds') return Math.max(minimum, Math.min(current, 30));
  return Math.max(minimum, Math.min(current, 10));
}

function fallbackIncrement(equipmentId: EquipmentId | undefined, unit: 'lb' | 'kg') {
  if (unit === 'kg') {
    if (equipmentId === 'kettlebell') return 4;
    if (equipmentId === 'barbell' || equipmentId === 'trap_bar' || equipmentId === 'weight_plate') return 2.5;
    return 2;
  }
  if (equipmentId === 'kettlebell') return 5;
  if (equipmentId === 'barbell' || equipmentId === 'trap_bar' || equipmentId === 'weight_plate') return 5;
  return 5;
}

function loadSequence(equipmentId: EquipmentId | undefined, unit: 'lb' | 'kg'): number[] {
  if (unit === 'kg') {
    if (equipmentId === 'kettlebell') return [4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48];
    if (equipmentId === 'dumbbell') return [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 44, 48, 50];
    if (equipmentId === 'barbell' || equipmentId === 'trap_bar' || equipmentId === 'weight_plate') {
      return Array.from({ length: 81 }, (_, index) => index * 2.5).filter((value) => value > 0);
    }
    return Array.from({ length: 50 }, (_, index) => (index + 1) * 2);
  }
  if (equipmentId === 'kettlebell') return [5, 8, 10, 12, 15, 18, 20, 22, 25, 26, 30, 35, 40, 44, 45, 50, 53, 60, 62, 70, 80, 88, 97, 106];
  if (equipmentId === 'dumbbell') return [1, 2, 3, 5, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
  if (equipmentId === 'barbell' || equipmentId === 'trap_bar' || equipmentId === 'weight_plate') {
    return Array.from({ length: 80 }, (_, index) => (index + 1) * 5);
  }
  return Array.from({ length: 40 }, (_, index) => (index + 1) * 5);
}
