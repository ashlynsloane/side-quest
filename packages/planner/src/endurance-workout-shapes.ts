export type TimedQualityDiscipline = 'swim' | 'bike' | 'run';
export type SwimPoolShapeType = 'swim_technique' | 'swim_aerobic' | 'swim_endurance' | 'swim_quality';
export type SwimSetPurpose = 'quality' | 'aerobic' | 'endurance' | 'easy';

export interface TimedQualityShape {
  id: string;
  discipline: TimedQualityDiscipline;
  repeats: number;
  workMinutes: number;
  recoveryMinutes: number;
  family: 'short' | 'balanced' | 'sustained';
}

export interface SwimRepeatSetShape {
  repeats: number;
  repeatDistance: number;
  restSeconds: number;
  purpose: SwimSetPurpose;
}

export interface SwimDrillSetShape {
  repeats: 4 | 6 | 8;
  repeatDistance: 50;
  restSeconds: number;
}

export interface SwimPoolWorkoutShape {
  id: string;
  type: SwimPoolShapeType;
  warmupDistance: number;
  drill?: SwimDrillSetShape;
  main: SwimRepeatSetShape;
  secondary?: SwimRepeatSetShape;
  cooldownDistance: number;
}

const TIMED_QUALITY_SHAPES: TimedQualityShape[] = [
  { id: 'run-4x4-r3', discipline: 'run', repeats: 4, workMinutes: 4, recoveryMinutes: 3, family: 'short' },
  { id: 'run-4x6-r2', discipline: 'run', repeats: 4, workMinutes: 6, recoveryMinutes: 2, family: 'balanced' },
  { id: 'run-3x8-r3', discipline: 'run', repeats: 3, workMinutes: 8, recoveryMinutes: 3, family: 'sustained' },
  { id: 'run-2x15-r5', discipline: 'run', repeats: 2, workMinutes: 15, recoveryMinutes: 5, family: 'sustained' },
  { id: 'run-3x10-r5', discipline: 'run', repeats: 3, workMinutes: 10, recoveryMinutes: 5, family: 'sustained' },
  { id: 'run-4x10-r5', discipline: 'run', repeats: 4, workMinutes: 10, recoveryMinutes: 5, family: 'balanced' },
  { id: 'run-3x15-r5', discipline: 'run', repeats: 3, workMinutes: 15, recoveryMinutes: 5, family: 'sustained' },

  { id: 'bike-4x6-r2', discipline: 'bike', repeats: 4, workMinutes: 6, recoveryMinutes: 2, family: 'short' },
  { id: 'bike-4x8-r1', discipline: 'bike', repeats: 4, workMinutes: 8, recoveryMinutes: 1, family: 'balanced' },
  { id: 'bike-2x15-r5', discipline: 'bike', repeats: 2, workMinutes: 15, recoveryMinutes: 5, family: 'sustained' },
  { id: 'bike-3x10-r5', discipline: 'bike', repeats: 3, workMinutes: 10, recoveryMinutes: 5, family: 'balanced' },
  { id: 'bike-3x12-r2', discipline: 'bike', repeats: 3, workMinutes: 12, recoveryMinutes: 2, family: 'sustained' },
  { id: 'bike-2x20-r5', discipline: 'bike', repeats: 2, workMinutes: 20, recoveryMinutes: 5, family: 'sustained' },
  { id: 'bike-4x10-r5', discipline: 'bike', repeats: 4, workMinutes: 10, recoveryMinutes: 5, family: 'balanced' },
  { id: 'bike-3x15-r5', discipline: 'bike', repeats: 3, workMinutes: 15, recoveryMinutes: 5, family: 'sustained' },
  { id: 'bike-2x30-r5', discipline: 'bike', repeats: 2, workMinutes: 30, recoveryMinutes: 5, family: 'sustained' },

  { id: 'open-water-4x6-r2', discipline: 'swim', repeats: 4, workMinutes: 6, recoveryMinutes: 2, family: 'balanced' },
  { id: 'open-water-3x8-r3', discipline: 'swim', repeats: 3, workMinutes: 8, recoveryMinutes: 3, family: 'sustained' },
  { id: 'open-water-3x10-r5', discipline: 'swim', repeats: 3, workMinutes: 10, recoveryMinutes: 5, family: 'sustained' },
];

const SWIM_POOL_SHAPES: SwimPoolWorkoutShape[] = [
  technique('swim-technique-800', 200, 4, set(2, 100, 15, 'aerobic'), 200),
  technique('swim-technique-1200', 200, 4, set(3, 200, 15, 'aerobic'), 200),
  technique('swim-technique-1400', 300, 6, set(3, 200, 15, 'aerobic'), 200),
  technique('swim-technique-1800', 300, 8, set(3, 300, 15, 'aerobic'), 200),
  technique('swim-technique-2200', 400, 8, set(6, 200, 15, 'aerobic'), 200),
  technique('swim-technique-2600', 400, 8, set(4, 400, 20, 'aerobic'), 200),
  technique('swim-technique-3000', 400, 8, set(5, 400, 20, 'aerobic'), 200),

  pool('swim-aerobic-800', 'swim_aerobic', 200, set(2, 200, 15, 'aerobic'), 200),
  pool('swim-aerobic-1000', 'swim_aerobic', 200, set(3, 200, 15, 'aerobic'), 200),
  pool('swim-aerobic-1400', 'swim_aerobic', 300, set(3, 300, 15, 'aerobic'), 200),
  pool('swim-aerobic-1800', 'swim_aerobic', 300, set(3, 400, 20, 'aerobic'), 300),
  pool('swim-aerobic-2200', 'swim_aerobic', 400, set(4, 400, 20, 'aerobic'), 200),
  pool('swim-aerobic-2600', 'swim_aerobic', 400, set(5, 400, 20, 'aerobic'), 200),
  pool('swim-aerobic-3000', 'swim_aerobic', 400, set(6, 400, 20, 'aerobic'), 200),
  pool('swim-aerobic-3800', 'swim_aerobic', 400, set(6, 500, 20, 'aerobic'), 400),

  pool('swim-endurance-800', 'swim_endurance', 200, set(2, 200, 20, 'endurance'), 200),
  pool('swim-endurance-1200', 'swim_endurance', 200, set(2, 400, 20, 'endurance'), 200),
  pool('swim-endurance-1400', 'swim_endurance', 300, set(3, 300, 20, 'endurance'), 200),
  pool('swim-endurance-1800', 'swim_endurance', 300, set(3, 400, 20, 'endurance'), 300),
  pool('swim-endurance-2200', 'swim_endurance', 400, set(4, 400, 20, 'endurance'), 200),
  pool('swim-endurance-2600', 'swim_endurance', 400, set(5, 400, 20, 'endurance'), 200),
  pool('swim-endurance-3000', 'swim_endurance', 400, set(4, 600, 25, 'endurance'), 200),
  pool('swim-endurance-3600', 'swim_endurance', 400, set(5, 600, 25, 'endurance'), 200),

  pool('swim-quality-800', 'swim_quality', 200, set(4, 100, 20, 'quality'), 200),
  pool('swim-quality-1200', 'swim_quality', 300, set(6, 100, 20, 'quality'), 300),
  pool('swim-quality-1400', 'swim_quality', 300, set(8, 100, 20, 'quality'), 300),
  pool('swim-quality-1600', 'swim_quality', 300, set(5, 200, 25, 'quality'), 300),
  pool('swim-quality-1800', 'swim_quality', 300, set(6, 200, 25, 'quality'), 300),
  pool('swim-quality-2200', 'swim_quality', 400, set(6, 200, 25, 'quality'), 400, set(2, 100, 15, 'easy')),
  pool('swim-quality-2600', 'swim_quality', 400, set(6, 300, 30, 'quality'), 400),
  pool('swim-quality-3200', 'swim_quality', 400, set(6, 300, 30, 'quality'), 400, set(3, 200, 15, 'aerobic')),
  pool('swim-quality-4200', 'swim_quality', 400, set(6, 300, 30, 'quality'), 400, set(8, 200, 15, 'aerobic')),
];

export function timedQualityShapeMinutes(shape: TimedQualityShape): number {
  return shape.repeats * shape.workMinutes + Math.max(0, shape.repeats - 1) * shape.recoveryMinutes;
}

export function selectTimedQualityShape(
  discipline: TimedQualityDiscipline,
  availableMainMinutes: number,
  titleHint = '',
): TimedQualityShape | null {
  const candidates = TIMED_QUALITY_SHAPES
    .filter((shape) => shape.discipline === discipline)
    .filter((shape) => timedQualityShapeMinutes(shape) <= availableMainMinutes);
  if (!candidates.length) return null;

  const sustainedHint = /tempo|threshold|sweet|steady|cruise/i.test(titleHint);
  return [...candidates].sort((left, right) => {
    const used = timedQualityShapeMinutes(right) - timedQualityShapeMinutes(left);
    if (used !== 0) return used;
    if (sustainedHint) {
      if (right.workMinutes !== left.workMinutes) return right.workMinutes - left.workMinutes;
      if (left.repeats !== right.repeats) return left.repeats - right.repeats;
    }
    const family = familyRank(left.family) - familyRank(right.family);
    if (family !== 0) return family;
    if (right.repeats !== left.repeats) return right.repeats - left.repeats;
    return left.id.localeCompare(right.id);
  })[0] ?? null;
}

export function swimPoolWorkoutShapeDistance(shape: SwimPoolWorkoutShape): number {
  return shape.warmupDistance
    + (shape.drill ? shape.drill.repeats * shape.drill.repeatDistance : 0)
    + shape.main.repeats * shape.main.repeatDistance
    + (shape.secondary ? shape.secondary.repeats * shape.secondary.repeatDistance : 0)
    + shape.cooldownDistance;
}

export function selectSwimPoolWorkoutShape(
  type: SwimPoolShapeType,
  targetDistance: number,
): SwimPoolWorkoutShape {
  const candidates = SWIM_POOL_SHAPES.filter((shape) => shape.type === type);
  if (!candidates.length) throw new Error(`No swim workout shapes registered for ${type}.`);
  return [...candidates].sort((left, right) => {
    const leftDistance = swimPoolWorkoutShapeDistance(left);
    const rightDistance = swimPoolWorkoutShapeDistance(right);
    const delta = Math.abs(leftDistance - targetDistance) - Math.abs(rightDistance - targetDistance);
    if (delta !== 0) return delta;
    return leftDistance - rightDistance;
  })[0]!;
}

export function listTimedQualityShapes(): readonly TimedQualityShape[] {
  return TIMED_QUALITY_SHAPES;
}

export function listSwimPoolWorkoutShapes(): readonly SwimPoolWorkoutShape[] {
  return SWIM_POOL_SHAPES;
}

function set(
  repeats: number,
  repeatDistance: number,
  restSeconds: number,
  purpose: SwimSetPurpose,
): SwimRepeatSetShape {
  return { repeats, repeatDistance, restSeconds, purpose };
}

function technique(
  id: string,
  warmupDistance: number,
  drillRepeats: 4 | 6 | 8,
  main: SwimRepeatSetShape,
  cooldownDistance: number,
): SwimPoolWorkoutShape {
  return {
    id,
    type: 'swim_technique',
    warmupDistance,
    drill: { repeats: drillRepeats, repeatDistance: 50, restSeconds: 15 },
    main,
    cooldownDistance,
  };
}

function pool(
  id: string,
  type: Exclude<SwimPoolShapeType, 'swim_technique'>,
  warmupDistance: number,
  main: SwimRepeatSetShape,
  cooldownDistance: number,
  secondary?: SwimRepeatSetShape,
): SwimPoolWorkoutShape {
  return { id, type, warmupDistance, main, cooldownDistance, ...(secondary ? { secondary } : {}) };
}

function familyRank(family: TimedQualityShape['family']): number {
  if (family === 'balanced') return 0;
  if (family === 'sustained') return 1;
  return 2;
}
