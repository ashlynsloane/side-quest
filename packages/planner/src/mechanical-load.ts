import type {
  ExerciseMechanicalLoadProfile,
  MechanicalLoadCandidate,
  MechanicalLoadDimension,
  MechanicalLoadLevel,
  MechanicalLoadOverride,
  SessionMechanicalLoadSummary,
} from '@circuit/domain';

const LEVEL_SCORE: Record<MechanicalLoadLevel, number> = { none: 0, low: 1, moderate: 2, high: 3 };
const SCORE_LEVEL: MechanicalLoadLevel[] = ['none', 'low', 'moderate', 'high'];

const DIMENSIONS: MechanicalLoadDimension[] = [
  'axialLoad', 'spinalStabilization', 'spinalFlexion', 'spinalExtension', 'rotation', 'antiRotation',
  'eccentricDemand', 'impactDemand', 'tendonDemand', 'overheadDemand', 'shoulderRepetition',
  'gripDemand', 'balanceDemand', 'unilateralStabilization', 'technicalDemand', 'rangeOfMotionDemand',
];

function level(value: number): MechanicalLoadLevel {
  return SCORE_LEVEL[Math.max(0, Math.min(3, Math.round(value)))] as MechanicalLoadLevel;
}
function maxLevel(...values: MechanicalLoadLevel[]): MechanicalLoadLevel {
  return level(Math.max(...values.map((value) => LEVEL_SCORE[value])));
}
function fromLoadLevel(value: 0 | 1 | 2 | 3 | 4): MechanicalLoadLevel {
  if (value <= 0) return 'none';
  if (value === 1) return 'low';
  if (value === 2) return 'moderate';
  return 'high';
}
function has(candidate: MechanicalLoadCandidate, value: string): boolean {
  return candidate.movementPatterns.includes(value as never) || candidate.avoidanceTags.includes(value as never);
}
function hasEquipment(candidate: MechanicalLoadCandidate, values: string[]): boolean {
  return Boolean(candidate.equipmentIds?.some((item) => values.includes(item)));
}
function bodyLoad(candidate: MechanicalLoadCandidate, region: string): MechanicalLoadLevel {
  const score = Math.max(0, ...(candidate.bodyRegions ?? [])
    .filter((entry) => entry.region === region)
    .map((entry) => Math.min(3, entry.load)));
  return level(score);
}

export function deriveMechanicalLoadProfile(
  candidate: MechanicalLoadCandidate,
  override?: MechanicalLoadOverride,
): ExerciseMechanicalLoadProfile {
  const loadedEquipment = hasEquipment(candidate, ['dumbbell', 'kettlebell', 'barbell', 'trap_bar', 'weight_plate']);
  const carry = has(candidate, 'carry');
  const hinge = has(candidate, 'hinge');
  const squat = has(candidate, 'squat');
  const lunge = has(candidate, 'lunge');
  const overhead = has(candidate, 'overhead') || has(candidate, 'vertical_push');
  const jump = has(candidate, 'jump_hop') || has(candidate, 'jumping') || has(candidate, 'high_impact');
  const rotation = has(candidate, 'rotation');
  const antiRotation = has(candidate, 'anti_rotation');
  const flexion = has(candidate, 'trunk_flexion') || has(candidate, 'spinal_flexion');
  const antiExtension = has(candidate, 'anti_extension');
  const unilateral = candidate.laterality === 'unilateral' || candidate.laterality === 'alternating' || has(candidate, 'single_leg_loading');
  const shoulderLoad = bodyLoad(candidate, 'shoulders');
  const forearmLoad = bodyLoad(candidate, 'forearms_grip');
  const lowerBackLoad = bodyLoad(candidate, 'lower_back');
  const jointLumbar = maxLevel('none', ...(candidate.jointLoads ?? []).filter((item) => item.region === 'lumbar_spine').map((item) => fromLoadLevel(item.load)));
  const jointShoulder = maxLevel('none', ...(candidate.jointLoads ?? []).filter((item) => item.region === 'shoulder').map((item) => fromLoadLevel(item.load)));

  const base: ExerciseMechanicalLoadProfile = {
    exerciseId: candidate.exerciseId,
    axialLoad: loadedEquipment && (squat || hinge || carry || overhead) ? (carry || hinge ? 'high' : 'moderate') : 'low',
    spinalStabilization: maxLevel(lowerBackLoad, jointLumbar, carry || antiExtension || antiRotation ? 'high' : unilateral || hinge || overhead ? 'moderate' : 'low'),
    spinalFlexion: flexion ? 'high' : 'none',
    spinalExtension: hinge || lowerBackLoad === 'high' ? 'moderate' : 'low',
    rotation: rotation ? 'high' : 'none',
    antiRotation: antiRotation || unilateral || carry ? 'moderate' : 'none',
    eccentricDemand: jump || lunge || squat || hinge ? 'moderate' : 'low',
    impactDemand: jump ? 'high' : fromLoadLevel(candidate.impactLevel),
    tendonDemand: jump ? 'high' : lunge || squat || has(candidate, 'deep_knee_flexion') ? 'moderate' : 'low',
    overheadDemand: overhead ? 'high' : 'none',
    shoulderRepetition: maxLevel(shoulderLoad, jointShoulder, overhead || has(candidate, 'horizontal_push') || has(candidate, 'vertical_pull') ? 'moderate' : 'low'),
    gripDemand: maxLevel(forearmLoad, carry || has(candidate, 'horizontal_pull') || has(candidate, 'vertical_pull') ? 'moderate' : loadedEquipment ? 'low' : 'none'),
    balanceDemand: fromLoadLevel(candidate.balanceDemand),
    unilateralStabilization: unilateral ? (lunge || loadedEquipment ? 'high' : 'moderate') : 'none',
    technicalDemand: fromLoadLevel(candidate.technicalComplexity),
    rangeOfMotionDemand: has(candidate, 'deep_knee_flexion') || overhead || lunge ? 'moderate' : 'low',
    source: override ? 'explicit' : 'derived',
    confidence: override ? 'high' : 'moderate',
    reviewReasons: [],
  };

  if (!candidate.bodyRegions?.length) base.reviewReasons.push('Missing body-region load metadata.');
  if (!candidate.jointLoads?.length) base.reviewReasons.push('Missing joint-load metadata.');
  if (candidate.movementPatterns.length === 0) base.reviewReasons.push('Missing movement-pattern metadata.');
  if (base.reviewReasons.length > 0 && !override) base.confidence = 'low';
  if (override) Object.assign(base, override.values);
  return base;
}

export function summarizeSessionMechanicalLoad(
  profiles: ExerciseMechanicalLoadProfile[],
): SessionMechanicalLoadSummary {
  const accumulated = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, 0])) as Record<MechanicalLoadDimension, number>;
  const peak = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, 'none'])) as Record<MechanicalLoadDimension, MechanicalLoadLevel>;
  for (const profile of profiles) {
    for (const dimension of DIMENSIONS) {
      const value = profile[dimension];
      accumulated[dimension] += LEVEL_SCORE[value];
      peak[dimension] = maxLevel(peak[dimension], value);
    }
  }
  const dominantDimensions = [...DIMENSIONS]
    .sort((left, right) => accumulated[right] - accumulated[left])
    .filter((dimension) => accumulated[dimension] >= Math.max(4, profiles.length * 1.5))
    .slice(0, 4);
  const explanation = dominantDimensions.length
    ? [`This session concentrates load in: ${dominantDimensions.join(', ')}.`]
    : ['No mechanical-load dimension dominates this session.'];
  const spinalScore = accumulated.spinalStabilization + accumulated.axialLoad;
  if (spinalScore >= Math.max(8, profiles.length * 3)) explanation.push('Multiple exercises accumulate trunk or axial demand even if they target different muscles.');
  return {
    exerciseIds: profiles.map((profile) => profile.exerciseId),
    peak,
    accumulated,
    dominantDimensions,
    reviewExerciseIds: profiles.filter((profile) => profile.confidence === 'low').map((profile) => profile.exerciseId),
    explanation,
  };
}

export function mechanicalLoadLevelScore(value: MechanicalLoadLevel): number {
  return LEVEL_SCORE[value];
}
