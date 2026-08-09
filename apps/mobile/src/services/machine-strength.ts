import type {
  AvoidanceTag,
  BodyRegion,
  EquipmentId,
  Exercise,
  GeneratedWorkout,
  JointRegion,
  MovementPattern,
  PTProfile,
  RegionRestriction,
  TrainingCheckIn,
  WorkoutExercisePrescription,
  WorkoutStation,
} from '@circuit/domain';

export type MachineStrengthAvailability = {
  selectorizedMachines: boolean;
  legPress: boolean;
};

export type MachineStrengthMetadata = {
  mode: 'machine_sets';
  setsPerExercise: 2 | 3;
  repRange: [number, number];
  restSeconds: number;
  estimatedMinutes: [number, number];
  supplemental: true;
};

export type MachineStrengthWorkout = GeneratedWorkout & {
  machineStrength: MachineStrengthMetadata;
};

export type MachineStrengthBuildResult =
  | { ok: true; workout: MachineStrengthWorkout; warnings: string[] }
  | { ok: false; reason: string };

export function isMachineStrengthWorkout(workout: GeneratedWorkout | null | undefined): workout is MachineStrengthWorkout {
  if (!workout) return false;
  const candidate = workout as Partial<MachineStrengthWorkout>;
  return candidate.machineStrength?.mode === 'machine_sets';
}

export function buildMachineStrengthWorkout({
  exercises,
  availability,
  ptProfile,
  checkIn,
  seed = localDate(),
}: {
  exercises: Exercise[];
  availability: MachineStrengthAvailability;
  ptProfile?: PTProfile | null;
  checkIn?: TrainingCheckIn | null;
  seed?: string;
}): MachineStrengthBuildResult {
  if (!availability.selectorizedMachines && !availability.legPress) {
    return { ok: false, reason: 'Select at least one type of machine available in the gym.' };
  }
  if (checkIn?.status === 'unable_to_train') {
    return { ok: false, reason: 'Your active Training Protection check-in currently pauses strength training.' };
  }

  const availableEquipment = new Set<EquipmentId>();
  if (availability.selectorizedMachines) availableEquipment.add('cable_machine');
  if (availability.legPress) availableEquipment.add('leg_press');

  const protection = combinedProtection(ptProfile, checkIn);
  const candidates = exercises
    .filter((exercise) => exercise.status === 'active' && exercise.defaultEnabled)
    .filter((exercise) => !exercise.suitableForAmrap)
    .filter((exercise) => exercise.prescriptions.some((prescription) => prescription.style === 'strength'))
    .filter((exercise) => exercise.equipmentOptions.some((option) => option.items.every((item) => item.optional || availableEquipment.has(item.equipmentId))))
    .filter((exercise) => machineExerciseAllowed(exercise, protection));

  if (candidates.length < 4) {
    return {
      ok: false,
      reason: 'Not enough machine exercises remain after equipment and active Training Protection filters. Keep the current protection in place and use another strength option today.',
    };
  }

  const random = seededRandom(`machine-strength:${seed}`);
  const selected = balancedMachineSelection(candidates, random, Math.min(6, candidates.length));
  if (selected.length < 4) {
    return { ok: false, reason: 'A balanced machine session could not be assembled from the available exercises.' };
  }

  const reducedDose = checkIn?.status === 'muscle_soreness' || (checkIn?.severity ?? 0) >= 2;
  const setsPerExercise: 2 | 3 = reducedDose ? 2 : 3;
  const restSeconds = 90;
  const repRange: [number, number] = [6, 10];
  const stations = pairIntoStations(selected, setsPerExercise);
  const requiredEquipment = unique(
    selected.flatMap((exercise) => exercise.equipmentOptions[0]?.items.map((item) => item.equipmentId) ?? []),
  );
  const targetRegions = unique(
    selected.flatMap((exercise) => exercise.bodyRegions.filter((item) => item.role === 'primary').map((item) => item.region)),
  );
  const totalWorkSeconds = selected.length * setsPerExercise * 45;
  const totalRestSeconds = selected.length * Math.max(0, setsPerExercise - 1) * restSeconds;
  const createdAt = new Date().toISOString();
  const lowerEstimate = Math.max(15, Math.round((totalWorkSeconds + totalRestSeconds * 0.45) / 60));
  const upperEstimate = Math.max(lowerEstimate + 8, Math.round((totalWorkSeconds + totalRestSeconds + selected.length * 75) / 60));

  const warnings: string[] = [
    'Machine strength is supplemental. Keep it to one session per week unless the training plan explicitly says otherwise.',
    'Use controlled challenging loads and stop with roughly 1–3 good repetitions in reserve rather than training to failure.',
  ];
  if (reducedDose) warnings.unshift('Recent athlete feedback reduced this session from 3 working sets to 2 per exercise.');
  if (protection.hasActiveProtection) warnings.unshift('Active Training Protection filters were applied before selecting exercises.');

  const workout: MachineStrengthWorkout = {
    id: `machine_${hashString(`${seed}:${selected.map((exercise) => exercise.id).join('|')}`).toString(16)}`,
    name: 'Machine Strength',
    createdAt,
    randomSeed: `machine-strength:${seed}`,
    request: {
      workMinutes: Math.max(24, Math.min(48, Math.round(totalWorkSeconds / 60 / 4) * 4)) as 24 | 32 | 40 | 48,
      allowedStationMinutes: [4],
      restSeconds,
      exercisesPerStation: 2,
      focusTargets: [],
      excludedRegions: [...protection.excludedRegions],
      excludedMovementTags: [...protection.excludedMovementTags],
      regionRestrictions: protection.regionRestrictions,
      excludedMovementPatterns: [...protection.excludedMovementPatterns],
      availableEquipment: [...availableEquipment],
      workoutStyle: 'strength_amrap',
      difficulty: 'intermediate',
      maximumImpact: 0,
      recoveryAware: true,
      avoidPreviousWorkoutExercises: false,
      favorFamiliarExercises: true,
      allowUnfamiliarExercises: true,
      minimizeEquipmentChanges: false,
      randomSeed: `machine-strength:${seed}`,
    },
    stations,
    totalWorkSeconds,
    totalRestSeconds,
    estimatedElapsedSeconds: Math.round(((lowerEstimate + upperEstimate) / 2) * 60),
    requiredEquipment,
    targetRegions,
    recentLoadAdjustments: warnings,
    source: 'generated',
    machineStrength: {
      mode: 'machine_sets',
      setsPerExercise,
      repRange,
      restSeconds,
      estimatedMinutes: [lowerEstimate, upperEstimate],
      supplemental: true,
    },
  };

  return { ok: true, workout, warnings };
}

type Protection = {
  excludedRegions: Set<BodyRegion | JointRegion>;
  excludedMovementTags: Set<AvoidanceTag>;
  excludedMovementPatterns: Set<MovementPattern>;
  regionRestrictions: RegionRestriction[];
  hasActiveProtection: boolean;
};

function combinedProtection(ptProfile?: PTProfile | null, checkIn?: TrainingCheckIn | null): Protection {
  const activePt = ptProfile?.active ? ptProfile : null;
  const painCheckIn = checkIn?.status === 'tightness_pain' ? checkIn : null;
  const excludedRegions = new Set<BodyRegion | JointRegion>([
    ...(activePt?.excludedRegions ?? []),
    ...(painCheckIn?.affectedRegions ?? []),
  ]);
  const excludedMovementTags = new Set<AvoidanceTag>([
    ...(activePt?.excludedMovementTags ?? []),
    ...(painCheckIn?.aggravatedMovementTags ?? []),
  ]);
  const excludedMovementPatterns = new Set<MovementPattern>(activePt?.excludedMovementPatterns ?? []);
  const regionRestrictions = activePt?.regionRestrictions ?? [];
  return {
    excludedRegions,
    excludedMovementTags,
    excludedMovementPatterns,
    regionRestrictions,
    hasActiveProtection: Boolean(activePt || painCheckIn),
  };
}

function machineExerciseAllowed(exercise: Exercise, protection: Protection): boolean {
  if (exercise.bodyRegions.some((load) => protection.excludedRegions.has(load.region))) return false;
  if (exercise.jointLoads.some((load) => protection.excludedRegions.has(load.region))) return false;
  if (exercise.avoidanceTags.some((tag) => protection.excludedMovementTags.has(tag))) return false;
  if (exercise.movementPatterns.some((pattern) => protection.excludedMovementPatterns.has(pattern))) return false;

  for (const restriction of protection.regionRestrictions) {
    if (restriction.mode === 'direct_only') continue;
    if (exercise.bodyRegions.some((load) => load.region === restriction.region && load.load >= 2)) return false;
    if (exercise.jointLoads.some((load) => load.region === restriction.region && load.load >= 2)) return false;
  }
  return true;
}

function balancedMachineSelection(exercises: Exercise[], random: () => number, count: number): Exercise[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const slots: string[][] = [
    ['ex_machine_lat_pulldown', 'ex_machine_seated_cable_row'],
    ['ex_machine_reverse_fly', 'ex_machine_seated_cable_row'],
    ['ex_machine_chest_press', 'ex_machine_triceps_pressdown'],
    ['ex_machine_leg_press', 'ex_machine_seated_leg_curl'],
    ['ex_machine_leg_extension', 'ex_machine_hip_abduction', 'ex_machine_hip_adduction'],
    ['ex_machine_calf_raise', 'ex_machine_triceps_pressdown', 'ex_machine_reverse_fly'],
  ];
  const selected: Exercise[] = [];
  const used = new Set<string>();

  for (const slot of slots) {
    const options = slot.map((id) => byId.get(id)).filter((exercise): exercise is Exercise => Boolean(exercise && !used.has(exercise.id)));
    if (!options.length) continue;
    const choice = options[Math.floor(random() * options.length)]!;
    selected.push(choice);
    used.add(choice.id);
    if (selected.length >= count) return selected;
  }

  const remaining = shuffle(exercises.filter((exercise) => !used.has(exercise.id)), random);
  selected.push(...remaining.slice(0, Math.max(0, count - selected.length)));
  return selected.slice(0, count);
}

function pairIntoStations(exercises: Exercise[], setsPerExercise: 2 | 3): WorkoutStation[] {
  const stations: WorkoutStation[] = [];
  for (let index = 0; index < exercises.length; index += 2) {
    const pair = exercises.slice(index, index + 2);
    const stationExercises: WorkoutExercisePrescription[] = pair.map((exercise, exerciseIndex) => {
      const prescription = exercise.prescriptions.find((item) => item.style === 'strength')!;
      const equipment = exercise.equipmentOptions[0]!;
      return {
        exerciseId: exercise.id,
        exerciseSnapshot: exercise,
        equipmentOptionId: equipment.id,
        prescriptionId: prescription.id,
        target: prescription.target,
        unit: prescription.unit,
        order: exerciseIndex + 1,
        adaptationNote: `${setsPerExercise} working sets · ${prescription.minimum ?? prescription.target}–${prescription.maximum ?? prescription.target} reps · ${prescription.loadGuidance ?? 'controlled challenging load'}`,
      };
    });
    stations.push({
      id: `machine_station_${stations.length + 1}`,
      order: stations.length + 1,
      durationSeconds: setsPerExercise * 4 * 60,
      format: 'amrap',
      purpose: 'Set-based machine strength — no timer',
      exercises: stationExercises,
    });
  }
  return stations;
}

function seededRandom(seed: string): () => number {
  let state = hashString(seed) || 0x12345678;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!];
  }
  return copy;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
