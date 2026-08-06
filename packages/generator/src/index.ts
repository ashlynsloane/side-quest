import type {
  AvoidanceTag,
  BodyRegion,
  EquipmentId,
  Exercise,
  ExercisePreference,
  ExerciseSwapReason,
  GeneratedWorkout,
  GenerationContext,
  GenerationResult,
  MovementPattern,
  RegionRestriction,
  StationRole,
  WorkoutExercisePrescription,
  WorkoutGenerationRequest,
  WorkoutStation,
  WorkoutVariantLevel,
} from '@circuit/domain';

const EMPHASIS_WEIGHT = { light: 1.5, moderate: 3, strong: 5 } as const;

const REGION_LABELS: Partial<Record<BodyRegion, string>> = {
  core_anterior: 'Core',
  core_lateral: 'Lateral Core',
  core_rotation: 'Rotational Core',
  feet_ankles: 'Calves + Ankles',
  gastrocnemius: 'Calves',
  soleus: 'Soleus',
  quadriceps: 'Quads',
  hip_abductors: 'Lateral Hips',
  hip_adductors: 'Adductors',
  upper_back: 'Upper Back',
};

type SlotRule = {
  roles: StationRole[];
  patterns?: MovementPattern[];
  preferredRegions?: BodyRegion[];
  regionRoles?: Array<'primary' | 'secondary' | 'stabilizer'>;
};

type StationTemplate = {
  id: string;
  purpose: string;
  slots: SlotRule[];
};

const BALANCED_TEMPLATES: StationTemplate[] = [
  {
    id: 'lower_strength',
    purpose: 'Lower-body strength with complementary stability',
    slots: [
      { roles: ['primary_strength'], patterns: ['squat', 'lunge'] },
      {
        roles: ['core', 'stability'],
        patterns: ['anti_rotation', 'anti_extension', 'rotation', 'trunk_flexion', 'lateral_flexion'],
        preferredRegions: ['core_anterior', 'core_lateral', 'core_rotation'],
        regionRoles: ['primary'],
      },
      { roles: ['accessory', 'stability', 'conditioning'] },
    ],
  },
  {
    id: 'posterior_chain',
    purpose: 'Posterior-chain strength and trunk control',
    slots: [
      { roles: ['primary_strength', 'secondary_strength'], patterns: ['hinge'] },
      { roles: ['accessory', 'stability', 'core'] },
      { roles: ['conditioning', 'stability', 'accessory'] },
    ],
  },
  {
    id: 'upper_strength',
    purpose: 'Upper-body push, pull, and trunk support',
    slots: [
      {
        roles: ['primary_strength', 'secondary_strength'],
        patterns: ['horizontal_pull', 'vertical_pull'],
      },
      {
        roles: ['primary_strength', 'secondary_strength'],
        patterns: ['horizontal_push', 'vertical_push'],
      },
      { roles: ['core', 'stability', 'conditioning'] },
    ],
  },
  {
    id: 'core_stability',
    purpose: 'Core strength, balance, and movement control',
    slots: [
      {
        roles: ['core', 'stability'],
        patterns: ['anti_rotation', 'anti_extension', 'rotation', 'trunk_flexion', 'lateral_flexion', 'balance'],
        preferredRegions: ['core_anterior', 'core_lateral', 'core_rotation'],
        regionRoles: ['primary'],
      },
      { roles: ['stability', 'accessory', 'conditioning'] },
      { roles: ['conditioning', 'core', 'stability'] },
    ],
  },
  {
    id: 'power_conditioning',
    purpose: 'Athletic power and strength-cardio conditioning',
    slots: [
      { roles: ['power', 'conditioning'], patterns: ['jump_hop', 'squat', 'lunge', 'hinge', 'locomotion'] },
      { roles: ['conditioning', 'accessory', 'stability'] },
      { roles: ['core', 'conditioning', 'stability'] },
    ],
  },
  {
    id: 'accessory_finish',
    purpose: 'Accessory strength and movement quality',
    slots: [
      { roles: ['accessory', 'stability', 'secondary_strength'] },
      { roles: ['core', 'conditioning', 'stability'] },
      { roles: ['accessory', 'conditioning'] },
    ],
  },
];

const FOCUS_TEMPLATE_OVERRIDES: Partial<Record<BodyRegion, StationTemplate[]>> = {
  hamstrings: [
    {
      id: 'hamstring_hinge',
      purpose: 'Hamstring-dominant hinge strength',
      slots: [
        { roles: ['primary_strength', 'secondary_strength'], patterns: ['hinge'], preferredRegions: ['hamstrings'] },
        { roles: ['accessory', 'stability'], preferredRegions: ['hamstrings', 'glutes'] },
        { roles: ['core', 'conditioning', 'stability'] },
      ],
    },
    {
      id: 'single_leg_posterior',
      purpose: 'Single-leg posterior-chain strength and balance',
      slots: [
        { roles: ['primary_strength', 'secondary_strength'], patterns: ['hinge', 'lunge'], preferredRegions: ['hamstrings', 'glutes'] },
        { roles: ['stability', 'accessory'], preferredRegions: ['hamstrings', 'feet_ankles'] },
        { roles: ['core', 'conditioning'] },
      ],
    },
    BALANCED_TEMPLATES[0],
    BALANCED_TEMPLATES[2],
    BALANCED_TEMPLATES[4],
    BALANCED_TEMPLATES[3],
  ],
  glutes: [
    BALANCED_TEMPLATES[0],
    {
      id: 'glute_hinge',
      purpose: 'Glute and posterior-chain strength',
      slots: [
        { roles: ['primary_strength', 'secondary_strength'], patterns: ['hinge'], preferredRegions: ['glutes'] },
        { roles: ['accessory', 'stability'], preferredRegions: ['glutes', 'hip_abductors'] },
        { roles: ['core', 'conditioning'] },
      ],
    },
    {
      id: 'lateral_hips',
      purpose: 'Lateral hip strength and pelvic control',
      slots: [
        { roles: ['accessory', 'stability'], preferredRegions: ['hip_abductors', 'glutes'] },
        { roles: ['secondary_strength', 'stability'], patterns: ['lunge', 'balance'] },
        { roles: ['conditioning', 'core'] },
      ],
    },
    BALANCED_TEMPLATES[2],
    BALANCED_TEMPLATES[4],
    BALANCED_TEMPLATES[3],
  ],
  quadriceps: [
    BALANCED_TEMPLATES[0],
    {
      id: 'quad_single_leg',
      purpose: 'Single-leg quadriceps strength and control',
      slots: [
        { roles: ['primary_strength', 'secondary_strength'], patterns: ['squat', 'lunge'], preferredRegions: ['quadriceps'] },
        { roles: ['stability', 'accessory'], preferredRegions: ['quadriceps', 'glutes'] },
        { roles: ['core', 'conditioning'] },
      ],
    },
    BALANCED_TEMPLATES[1],
    BALANCED_TEMPLATES[2],
    BALANCED_TEMPLATES[4],
    BALANCED_TEMPLATES[3],
  ],
  upper_back: [
    BALANCED_TEMPLATES[2],
    BALANCED_TEMPLATES[0],
    {
      id: 'upper_back_repeat',
      purpose: 'Upper-back pulling and scapular control',
      slots: [
        { roles: ['primary_strength', 'secondary_strength'], patterns: ['horizontal_pull', 'vertical_pull'], preferredRegions: ['upper_back', 'lats'] },
        { roles: ['accessory', 'stability'], preferredRegions: ['upper_back', 'shoulders'] },
        { roles: ['core', 'conditioning'] },
      ],
    },
    BALANCED_TEMPLATES[1],
    BALANCED_TEMPLATES[3],
    BALANCED_TEMPLATES[4],
  ],
  feet_ankles: [
    BALANCED_TEMPLATES[0],
    {
      id: 'ankle_strength',
      purpose: 'Calf, ankle, and foot strength',
      slots: [
        { roles: ['accessory', 'secondary_strength'], preferredRegions: ['gastrocnemius', 'soleus', 'feet_ankles'] },
        {
          roles: ['stability', 'accessory'],
          patterns: ['balance'],
          preferredRegions: ['feet_ankles'],
          regionRoles: ['primary', 'secondary', 'stabilizer'],
        },
        { roles: ['conditioning', 'power'], patterns: ['jump_hop', 'locomotion'] },
      ],
    },
    BALANCED_TEMPLATES[1],
    BALANCED_TEMPLATES[2],
    BALANCED_TEMPLATES[3],
    BALANCED_TEMPLATES[4],
  ],
  core_anterior: [
    BALANCED_TEMPLATES[3],
    BALANCED_TEMPLATES[0],
    BALANCED_TEMPLATES[2],
    {
      id: 'core_repeat',
      purpose: 'Trunk strength and anti-movement control',
      slots: [
        {
          roles: ['core', 'stability'],
          patterns: ['anti_rotation', 'anti_extension', 'rotation', 'trunk_flexion', 'lateral_flexion'],
          preferredRegions: ['core_anterior', 'core_lateral', 'core_rotation'],
          regionRoles: ['primary'],
        },
        { roles: ['core', 'stability', 'conditioning'] },
        { roles: ['conditioning', 'accessory'] },
      ],
    },
    BALANCED_TEMPLATES[1],
    BALANCED_TEMPLATES[4],
  ],
};


export function generateWorkout(
  request: WorkoutGenerationRequest,
  context: GenerationContext,
): GenerationResult {
  const baseSeed = request.randomSeed ?? `${Date.now()}-${request.workMinutes}`;
  const attemptCount = request.focusTargets.length === 0 ? 96 : 48;
  let lastFailure: GenerationResult | undefined;

  for (let attempt = 0; attempt < attemptCount; attempt += 1) {
    const attemptSeed = attempt === 0 ? baseSeed : `${baseSeed}:retry:${attempt}`;
    const result = generateWorkoutAttempt(
      { ...request, randomSeed: attemptSeed },
      context,
    );
    if (result.ok) return result;
    lastFailure = result;
  }

  return lastFailure ?? {
    ok: false,
    reason: 'VALIDATION_FAILED',
    messages: ['A valid workout could not be assembled after multiple deterministic attempts.'],
  };
}

function generateWorkoutAttempt(
  request: WorkoutGenerationRequest,
  context: GenerationContext,
): GenerationResult {
  const plan = buildStationPlan(request.workMinutes, request.allowedStationMinutes);
  if (!plan) {
    return {
      ok: false,
      reason: 'NO_VALID_STATION_PLAN',
      messages: [
        `${request.workMinutes} minutes cannot be assembled from ${request.allowedStationMinutes.join(', ')}-minute stations while keeping three to six stations.`,
      ],
    };
  }

  const available = new Set<EquipmentId>(['bodyweight', ...request.availableEquipment]);
  const preferenceMap = new Map(
    (context.exercisePreferences ?? []).map((item) => [item.exerciseId, item]),
  );
  const recentLoad = calculateRecentLoad(context);
  const recentAdjustments = buildRecentLoadMessages(recentLoad);

  const candidates = context.exercises.filter((exercise) =>
    isExerciseEligible(exercise, request, available, preferenceMap.get(exercise.id)),
  );

  if (candidates.length < plan.length * 2) {
    return {
      ok: false,
      reason: 'INSUFFICIENT_EXERCISES',
      messages: [
        `Only ${candidates.length} exercises satisfy the current equipment and exclusion filters.`,
        'Add equipment or relax a hard exclusion.',
      ],
    };
  }

  const seed = request.randomSeed ?? `${Date.now()}-${request.workMinutes}`;
  const random = seededRandom(seed);
  const used = new Set<string>();
  const globalFamilyCounts = new Map<string, number>();
  const globalGroupCounts = new Map<string, number>();
  const globalCoverage = new Set<CoverageKey>();
  const previousGroupIds = new Set(
    candidates
      .filter((exercise) => (context.previousExerciseIds ?? []).includes(exercise.id))
      .flatMap((exercise) => exercise.substitutionGroupIds),
  );
  const stations: WorkoutStation[] = [];
  const requestedTemplates = stationTemplatesForRequest(request);
  const viableTemplates = requestedTemplates.filter((template) =>
    candidates.filter((exercise) => matchesSlot(exercise, template.slots[0])).length >= 2,
  );
  const templates = viableTemplates.length >= 3 ? viableTemplates : requestedTemplates;

  for (let stationIndex = 0; stationIndex < plan.length; stationIndex += 1) {
    const desiredCount = resolveExerciseCount(
      request.exercisesPerStation,
      stationIndex,
      plan[stationIndex],
      random,
    );
    const template = templates[stationIndex % templates.length];
    const selected: WorkoutExercisePrescription[] = [];
    const stationPatterns = new Set<MovementPattern>();
    const stationTags = new Set<AvoidanceTag>();

    for (let exerciseIndex = 0; exerciseIndex < desiredCount; exerciseIndex += 1) {
      const slot = template.slots[Math.min(exerciseIndex, template.slots.length - 1)];
      const eligibleForSlot = candidates
        .filter((exercise) => !used.has(exercise.id))
        .filter((exercise) => isCompatibleWithStation(exercise, stationPatterns, stationTags))
        .filter((exercise) => canAddToWorkout({
          exercise,
          selectedInStation: selected,
          priorStations: stations,
          globalFamilyCounts,
          globalGroupCounts,
          request,
        }));

      const strictPool = eligibleForSlot.filter((exercise) => matchesSlot(exercise, slot));
      const sourcePool = strictPool.length > 0 ? strictPool : eligibleForSlot;

      const ranked = sourcePool
        .map((exercise) => ({
          exercise,
          score: scoreExercise({
            exercise,
            slot,
            request,
            recentLoad,
            preference: preferenceMap.get(exercise.id),
            previousExerciseIds: context.previousExerciseIds ?? [],
            previousGroupIds,
            globalFamilyCounts,
            globalCoverage,
            random,
          }),
        }))
        .sort((a, b) => b.score - a.score);

      const choicePool = ranked.slice(0, Math.min(7, ranked.length));
      const chosen = weightedChoice(choicePool, random);
      if (!chosen) break;

      const equipmentOption = selectEquipmentOption(chosen.exercise, available);
      const prescription = selectPrescription(chosen.exercise, plan[stationIndex], desiredCount);
      if (!equipmentOption || !prescription) continue;

      used.add(chosen.exercise.id);
      for (const family of exerciseFamilies(chosen.exercise)) {
        globalFamilyCounts.set(family, (globalFamilyCounts.get(family) ?? 0) + 1);
      }
      for (const group of chosen.exercise.substitutionGroupIds) {
        globalGroupCounts.set(group, (globalGroupCounts.get(group) ?? 0) + 1);
      }
      for (const key of coverageKeys(chosen.exercise)) globalCoverage.add(key);
      chosen.exercise.movementPatterns.forEach((pattern) => stationPatterns.add(pattern));
      chosen.exercise.avoidanceTags.forEach((tag) => stationTags.add(tag));
      selected.push({
        exerciseId: chosen.exercise.id,
        exerciseSnapshot: chosen.exercise,
        equipmentOptionId: equipmentOption.id,
        prescriptionId: prescription.id,
        target: prescription.target,
        unit: prescription.unit,
        order: selected.length + 1,
      });
    }

    if (selected.length < 2) {
      return {
        ok: false,
        reason: 'VALIDATION_FAILED',
        messages: [`Station ${stationIndex + 1} could not be filled without violating constraints.`],
      };
    }

    stations.push({
      id: `station_${stationIndex + 1}`,
      order: stationIndex + 1,
      durationSeconds: plan[stationIndex] * 60,
      format: 'amrap',
      purpose: template.purpose,
      exercises: selected,
    });
  }

  const totalWorkSeconds = stations.reduce((sum, station) => sum + station.durationSeconds, 0);
  const totalRestSeconds = Math.max(0, stations.length - 1) * request.restSeconds;
  const requiredEquipment = collectRequiredEquipment(stations);

  const workout: GeneratedWorkout = {
    id: `workout_${hashString(seed).toString(16)}`,
    name: workoutName(request, seed),
    createdAt: context.now ?? new Date().toISOString(),
    randomSeed: seed,
    request,
    stations,
    totalWorkSeconds,
    totalRestSeconds,
    estimatedElapsedSeconds: totalWorkSeconds + totalRestSeconds,
    requiredEquipment,
    targetRegions: request.focusTargets.map((target) => target.region),
    recentLoadAdjustments: request.recoveryAware ? recentAdjustments : [],
    source: 'generated',
  };

  const issues = validateGeneratedWorkout(workout);
  if (issues.length > 0) {
    return { ok: false, reason: 'VALIDATION_FAILED', messages: issues };
  }

  return { ok: true, workout };
}


export function createWorkoutVariant(
  workout: GeneratedWorkout,
  level: WorkoutVariantLevel,
): GeneratedWorkout {
  if (level === 'full') {
    return {
      ...workout,
      variantLevel: 'full',
      variantOfWorkoutId: workout.variantOfWorkoutId ?? workout.id,
      variantLabel: 'Full session',
    };
  }

  const targetFraction = level === 'reduced' ? 0.62 : 0.30;
  const targetSeconds = level === 'reduced'
    ? Math.max(16 * 60, Math.round(workout.totalWorkSeconds * targetFraction / 240) * 240)
    : Math.min(16 * 60, Math.max(8 * 60, Math.round(workout.totalWorkSeconds * targetFraction / 240) * 240));
  const selected = selectStationsNearTarget(workout.stations, targetSeconds);
  const stations = selected.map((station, index) => ({
    ...station,
    id: `${station.id}_${level}`,
    order: index + 1,
    exercises: station.exercises.map((item) => ({ ...item })),
  }));
  const totalWorkSeconds = stations.reduce((sum, station) => sum + station.durationSeconds, 0);
  const totalRestSeconds = Math.max(0, stations.length - 1) * workout.request.restSeconds;
  const label = level === 'reduced' ? 'Reduced session' : 'Minimum effective session';

  return {
    ...workout,
    id: `${workout.id}_${level}_${hashString(stations.map((station) => station.id).join('|')).toString(16)}`,
    name: `${label}: ${workout.name}`,
    createdAt: new Date().toISOString(),
    request: {
      ...workout.request,
      workMinutes: Math.round(totalWorkSeconds / 60),
    },
    stations,
    totalWorkSeconds,
    totalRestSeconds,
    estimatedElapsedSeconds: totalWorkSeconds + totalRestSeconds,
    requiredEquipment: collectRequiredEquipment(stations),
    variantLevel: level,
    variantOfWorkoutId: workout.variantOfWorkoutId ?? workout.id,
    variantLabel: label,
  };
}

export function createReentryWorkout(
  workout: GeneratedWorkout,
  {
    conservative = false,
    level = conservative ? 'minimum' : 'reduced',
  }: {
    conservative?: boolean;
    level?: WorkoutVariantLevel;
  } = {},
): GeneratedWorkout {
  const base = createWorkoutVariant(workout, level);
  const factor = conservative ? 0.72 : 0.85;
  const stations = base.stations.map((station) => ({
    ...station,
    exercises: station.exercises.map((item) => {
      const target = item.unit === 'seconds'
        ? Math.max(10, Math.round(item.target * factor / 5) * 5)
        : Math.max(4, Math.round(item.target * factor));
      return {
        ...item,
        target,
        adaptationNote: conservative
          ? 'Conservative return dose: use a familiar variation, stop well before failure, and keep symptoms at baseline.'
          : 'Re-entry dose after interrupted strength training: rebuild from below the prior volume before progressing again.',
      };
    }),
  }));
  const totalWorkSeconds = stations.reduce((sum, station) => sum + station.durationSeconds, 0);
  const totalRestSeconds = Math.max(0, stations.length - 1) * base.request.restSeconds;
  return {
    ...base,
    id: `${base.id}_reentry_${conservative ? 'conservative' : 'standard'}`,
    name: `${conservative ? 'Conservative return' : 'Return-to-strength'}: ${workout.name}`,
    stations,
    totalWorkSeconds,
    totalRestSeconds,
    estimatedElapsedSeconds: totalWorkSeconds + totalRestSeconds,
    variantLabel: conservative ? 'Conservative return session' : 'Return-to-strength session',
  };
}

export interface ExerciseSwapCandidate {
  id: string;
  exercise: Exercise;
  prescription: WorkoutExercisePrescription;
  kind: 'dose_adjustment' | 'same_ladder' | 'same_purpose';
  rationale: string;
}

export type ExerciseSwapCandidateResult =
  | { ok: true; candidates: ExerciseSwapCandidate[] }
  | { ok: false; message: string };

export type ExerciseSwapResult =
  | { ok: true; workout: GeneratedWorkout; replacement: Exercise }
  | { ok: false; message: string };

export function listExerciseSwapCandidates({
  workout,
  stationId,
  exerciseId,
  reason,
  context,
}: {
  workout: GeneratedWorkout;
  stationId: string;
  exerciseId: string;
  reason: ExerciseSwapReason;
  context: GenerationContext;
}): ExerciseSwapCandidateResult {
  const station = workout.stations.find((item) => item.id === stationId);
  const original = station?.exercises.find((item) => item.exerciseId === exerciseId);
  if (!station || !original) return { ok: false, message: 'The exercise could not be found in this workout.' };

  const available = new Set<EquipmentId>(['bodyweight', ...workout.request.availableEquipment]);
  const preferenceMap = new Map((context.exercisePreferences ?? []).map((item) => [item.exerciseId, item]));
  const usedIds = new Set(
    workout.stations.flatMap((item) => item.exercises
      .filter((exercise) => exercise.exerciseId !== exerciseId)
      .map((exercise) => exercise.exerciseId)),
  );
  for (const record of workout.swapHistory ?? []) {
    usedIds.add(record.replacedExerciseId);
    usedIds.add(record.replacementExerciseId);
  }
  usedIds.delete(exerciseId);

  const otherExercises = station.exercises
    .filter((item) => item.exerciseId !== exerciseId)
    .map((item) => item.exerciseSnapshot);
  const stationPatterns = new Set(otherExercises.flatMap((exercise) => exercise.movementPatterns));
  const stationTags = new Set(otherExercises.flatMap((exercise) => exercise.avoidanceTags));
  const originalExercise = original.exerciseSnapshot;
  const originalOrder = original.order;
  const output: ExerciseSwapCandidate[] = [];
  const seen = new Set<string>();

  function addCandidate(
    exercise: Exercise,
    prescription: WorkoutExercisePrescription,
    kind: ExerciseSwapCandidate['kind'],
    rationale: string,
  ) {
    const candidate: ExerciseSwapCandidate = {
      id: `${exercise.id}:${prescription.prescriptionId}:${prescription.target}:${prescription.unit}`,
      exercise,
      prescription: { ...prescription, order: originalOrder },
      kind,
      rationale,
    };
    if (seen.has(candidate.id)) return;
    const preview = replaceExercisePrescription(workout, stationId, exerciseId, candidate.prescription);
    if (validateGeneratedWorkout(preview).length > 0) return;
    seen.add(candidate.id);
    output.push(candidate);
  }

  if (reason === 'too_hard' || reason === 'too_easy') {
    const directed = buildDifficultyAdaptation({
      workout,
      station,
      original,
      originalExercise,
      direction: reason === 'too_hard' ? 'easier' : 'harder',
      context,
      available,
      usedIds,
      preferenceMap,
      stationPatterns,
      stationTags,
    });
    if (directed) {
      const sameExercise = directed.replacement.id === originalExercise.id;
      addCandidate(
        directed.replacement,
        directed.prescription,
        sameExercise ? 'dose_adjustment' : 'same_ladder',
        sameExercise
          ? directed.prescription.adaptationNote ?? 'Keep the same movement and change the dose before changing exercises.'
          : directed.prescription.adaptationNote ?? 'Use a related exercise from the same progression ladder.',
      );
    }
  }

  const originalChallenge = exerciseChallengeScore(originalExercise);
  const ranked = context.exercises
    .filter((exercise) => exercise.id !== originalExercise.id)
    .filter((exercise) => !usedIds.has(exercise.id))
    .filter((exercise) => isExerciseEligible(exercise, workout.request, available, preferenceMap.get(exercise.id)))
    .filter((exercise) => isCompatibleWithStation(exercise, stationPatterns, stationTags))
    .map((exercise) => ({
      exercise,
      score: substitutionScore(exercise, originalExercise, reason, preferenceMap.get(exercise.id)),
      sameLadder: intersectionSize(exercise.substitutionGroupIds, originalExercise.substitutionGroupIds) > 0,
      challenge: exerciseChallengeScore(exercise),
    }))
    .filter((candidate) => {
      if (reason === 'too_hard') return candidate.challenge < originalChallenge
        && candidate.exercise.impactLevel <= originalExercise.impactLevel;
      if (reason === 'too_easy') return candidate.challenge > originalChallenge;
      return true;
    })
    .sort((left, right) => Number(right.sameLadder) - Number(left.sameLadder) || right.score - left.score);

  for (const candidate of ranked) {
    if (output.length >= 5) break;
    const equipmentOption = selectEquipmentOption(candidate.exercise, available);
    const prescription = selectPrescription(candidate.exercise, station.durationSeconds / 60, station.exercises.length);
    if (!equipmentOption || !prescription) continue;
    addCandidate(
      candidate.exercise,
      {
        exerciseId: candidate.exercise.id,
        exerciseSnapshot: candidate.exercise,
        equipmentOptionId: equipmentOption.id,
        prescriptionId: prescription.id,
        target: prescription.target,
        unit: prescription.unit,
        order: original.order,
        adaptationNote: reason === 'too_hard'
          ? `Regressed from ${originalExercise.name} to a lower-demand compatible variation.`
          : reason === 'too_easy'
            ? `Progressed from ${originalExercise.name} to a higher-demand compatible variation.`
            : candidate.sameLadder
              ? `Changed from ${originalExercise.name} to a related variation in the same movement ladder.`
              : `Changed from ${originalExercise.name} while preserving the station's main training purpose.`,
      },
      candidate.sameLadder ? 'same_ladder' : 'same_purpose',
      candidate.sameLadder
        ? 'Same movement family with a different balance, loading, stance, or difficulty demand.'
        : 'Different movement that preserves the station role without duplicating the rest of the workout.',
    );
  }

  if (output.length === 0) {
    return { ok: false, message: 'No compatible replacement satisfies the current equipment, fatigue, balance, and restriction rules.' };
  }
  return { ok: true, candidates: output.slice(0, 5) };
}

export function swapExerciseInWorkout({
  workout,
  stationId,
  exerciseId,
  reason,
  context,
  candidateId,
}: {
  workout: GeneratedWorkout;
  stationId: string;
  exerciseId: string;
  reason: ExerciseSwapReason;
  context: GenerationContext;
  candidateId?: string;
}): ExerciseSwapResult {
  const result = listExerciseSwapCandidates({ workout, stationId, exerciseId, reason, context });
  if (!result.ok) return result;
  const candidate = candidateId
    ? result.candidates.find((item) => item.id === candidateId)
    : result.candidates[0];
  if (!candidate) return { ok: false, message: 'That replacement is no longer available. Reopen Smart Swap to refresh the options.' };

  const swappedAt = new Date().toISOString();
  const stations = replaceExercisePrescription(workout, stationId, exerciseId, candidate.prescription).stations;
  return {
    ok: true,
    replacement: candidate.exercise,
    workout: {
      ...workout,
      id: `${workout.id}_swap_${hashString(`${exerciseId}-${candidate.id}-${swappedAt}`).toString(16)}`,
      createdAt: swappedAt,
      stations,
      requiredEquipment: collectRequiredEquipment(stations),
      swapHistory: [
        ...(workout.swapHistory ?? []),
        {
          replacedExerciseId: exerciseId,
          replacementExerciseId: candidate.exercise.id,
          reason,
          swappedAt,
        },
      ],
    },
  };
}

function replaceExercisePrescription(
  workout: GeneratedWorkout,
  stationId: string,
  exerciseId: string,
  prescription: WorkoutExercisePrescription,
): GeneratedWorkout {
  return {
    ...workout,
    stations: workout.stations.map((station) => station.id !== stationId
      ? station
      : {
          ...station,
          exercises: station.exercises.map((exercise) => exercise.exerciseId === exerciseId
            ? { ...prescription, order: exercise.order }
            : exercise),
        }),
  };
}

function buildDifficultyAdaptation({
  workout,
  station,
  original,
  originalExercise,
  direction,
  context,
  available,
  usedIds,
  preferenceMap,
  stationPatterns,
  stationTags,
}: {
  workout: GeneratedWorkout;
  station: WorkoutStation;
  original: WorkoutExercisePrescription;
  originalExercise: Exercise;
  direction: 'easier' | 'harder';
  context: GenerationContext;
  available: Set<EquipmentId>;
  usedIds: Set<string>;
  preferenceMap: Map<string, ExercisePreference>;
  stationPatterns: Set<MovementPattern>;
  stationTags: Set<AvoidanceTag>;
}): { replacement: Exercise; prescription: WorkoutExercisePrescription } | null {
  const sourcePrescription = originalExercise.prescriptions.find((item) => item.id === original.prescriptionId);
  const minimum = sourcePrescription?.minimum ?? (original.unit === 'seconds' ? 10 : 4);
  const maximum = sourcePrescription?.maximum ?? (original.unit === 'seconds' ? 60 : 15);

  if (direction === 'harder' && original.target < maximum) {
    const target = nextPrescriptionTarget(original.target, original.unit, maximum);
    if (target > original.target) {
      return {
        replacement: originalExercise,
        prescription: {
          ...original,
          target,
          adaptationNote: `Progressed from ${formatTarget(original.target, original.unit)} to ${formatTarget(target, original.unit)} before increasing external load or complexity.`,
        },
      };
    }
  }

  const originalScore = exerciseChallengeScore(originalExercise);
  const candidates = context.exercises
    .filter((exercise) => !usedIds.has(exercise.id))
    .filter((exercise) => isExerciseEligible(exercise, workout.request, available, preferenceMap.get(exercise.id)))
    .filter((exercise) => isCompatibleWithStation(exercise, stationPatterns, stationTags))
    .filter((exercise) => intersectionSize(exercise.substitutionGroupIds, originalExercise.substitutionGroupIds) > 0)
    .filter((exercise) => direction !== "easier" || exercise.impactLevel <= originalExercise.impactLevel)
    .map((exercise) => ({
      exercise,
      challenge: exerciseChallengeScore(exercise),
      externallyLoaded: usesExternalLoad(exercise),
    }))
    .filter(({ challenge }) => direction === 'easier'
      ? challenge <= originalScore - 2
      : challenge >= originalScore + 2)
    .sort((left, right) => direction === 'easier'
      ? Number(left.externallyLoaded) - Number(right.externallyLoaded) || right.challenge - left.challenge
      : left.challenge - right.challenge);

  const candidate = candidates[0]?.exercise;
  if (candidate) {
    const equipmentOption = selectEquipmentOption(candidate, available);
    const prescription = selectPrescription(candidate, station.durationSeconds / 60, station.exercises.length);
    if (equipmentOption && prescription) {
      return {
        replacement: candidate,
        prescription: {
          exerciseId: candidate.id,
          exerciseSnapshot: candidate,
          equipmentOptionId: equipmentOption.id,
          prescriptionId: prescription.id,
          target: prescription.target,
          unit: prescription.unit,
          order: original.order,
          adaptationNote: direction === 'easier'
            ? `Regressed from ${originalExercise.name} to a closely related lower-demand variation.`
            : `Progressed from ${originalExercise.name} after the current rep range was already near its useful upper limit.`,
        },
      };
    }
  }

  if (direction === 'easier' && original.target > minimum) {
    const target = previousPrescriptionTarget(original.target, original.unit, minimum);
    return {
      replacement: originalExercise,
      prescription: {
        ...original,
        target,
        adaptationNote: `Kept the same movement but reduced the dose from ${formatTarget(original.target, original.unit)} to ${formatTarget(target, original.unit)}. Use support or a smaller comfortable range when needed.`,
      },
    };
  }

  if (direction === 'harder') {
    const canAddLoad = [...available].some((item) => item === 'dumbbell' || item === 'kettlebell' || item === 'weight_plate');
    return {
      replacement: originalExercise,
      prescription: {
        ...original,
        adaptationNote: canAddLoad
          ? 'Keep the movement and add the smallest practical dumbbell, kettlebell, or plate only if every repetition remains controlled.'
          : 'Use a slower three-second lowering phase or a brief pause at the hardest position rather than inventing an unavailable weight jump.',
      },
    };
  }

  return null;
}

function usesExternalLoad(exercise: Exercise): boolean {
  return exercise.equipmentOptions.some((option) => option.items.some((item) =>
    item.equipmentId === 'dumbbell'
      || item.equipmentId === 'kettlebell'
      || item.equipmentId === 'barbell'
      || item.equipmentId === 'weight_plate'
      || item.equipmentId === 'trap_bar'));
}

function exerciseChallengeScore(exercise: Exercise): number {
  const weighted = usesExternalLoad(exercise);
  return exercise.technicalComplexity * 2
    + exercise.balanceDemand * 2
    + exercise.impactLevel
    + (exercise.laterality === 'unilateral' ? 4 : exercise.laterality === 'alternating' ? 2 : 0)
    + (weighted ? 3 : 0);
}

function nextPrescriptionTarget(current: number, unit: WorkoutExercisePrescription['unit'], maximum: number) {
  const rungs = unit === 'seconds' ? [15, 20, 30, 40, 45, 60, 75, 90] : [4, 6, 8, 10, 12, 15, 20, 25];
  return Math.min(maximum, rungs.find((value) => value > current) ?? maximum);
}

function previousPrescriptionTarget(current: number, unit: WorkoutExercisePrescription['unit'], minimum: number) {
  const rungs = unit === 'seconds' ? [10, 15, 20, 30, 40, 45, 60, 75, 90] : [3, 4, 6, 8, 10, 12, 15, 20, 25];
  return Math.max(minimum, rungs.filter((value) => value < current).at(-1) ?? minimum);
}

function formatTarget(value: number, unit: WorkoutExercisePrescription['unit']) {
  if (unit === 'seconds') return `${value} seconds`;
  return unit === 'per_side' ? `${value} per side` : `${value} reps`;
}

function selectStationsNearTarget(stations: WorkoutStation[], targetSeconds: number): WorkoutStation[] {
  if (stations.length === 0) return [];
  const prefixes: WorkoutStation[][] = [];
  for (let count = 1; count <= stations.length; count += 1) prefixes.push(stations.slice(0, count));
  prefixes.sort((left, right) => {
    const leftTotal = left.reduce((sum, station) => sum + station.durationSeconds, 0);
    const rightTotal = right.reduce((sum, station) => sum + station.durationSeconds, 0);
    return Math.abs(leftTotal - targetSeconds) - Math.abs(rightTotal - targetSeconds)
      || left.length - right.length;
  });
  return prefixes[0] ?? [stations[0]];
}

function substitutionScore(
  candidate: Exercise,
  original: Exercise,
  reason: ExerciseSwapReason,
  preference?: ExercisePreference,
): number {
  let score = 0;
  score += intersectionSize(candidate.substitutionGroupIds, original.substitutionGroupIds) * 24;
  score += intersectionSize(candidate.movementPatterns, original.movementPatterns) * 12;
  score += intersectionSize(candidate.stationRoles, original.stationRoles) * 7;

  for (const load of original.bodyRegions) {
    const candidateLoad = candidate.bodyRegions.find((item) => item.region === load.region);
    if (candidateLoad) score += Math.min(load.load, candidateLoad.load) * (load.role === 'primary' ? 5 : 2);
  }

  if (preference?.preference === 'liked') score += 8;
  if (preference?.preference === 'disliked') score -= 10;
  if (reason === 'unfamiliar' && candidate.suitableForBeginners) score += 8;
  if (reason === 'too_hard') {
    score += (4 - candidate.technicalComplexity) * 5;
    score += (4 - candidate.balanceDemand) * 2;
    score += (4 - candidate.impactLevel) * 2;
  }
  if (reason === 'too_easy') {
    score += candidate.technicalComplexity * 3;
    score += candidate.cardiovascularDemand * 3;
  }
  if (reason === 'equipment_unavailable') score += candidate.classification === 'bodyweight' ? 10 : 0;
  if (reason === 'variety') score += candidate.id !== original.id ? 5 : 0;
  return score;
}

function intersectionSize<T>(left: T[], right: T[]): number {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
}

export function buildStationPlan(
  workMinutes: number,
  allowedDurations: Array<4 | 8 | 12>,
): Array<4 | 8 | 12> | null {
  const durations = [...new Set(allowedDurations)].sort((a, b) => b - a) as Array<4 | 8 | 12>;
  const plans: Array<Array<4 | 8 | 12>> = [];

  function search(remaining: number, current: Array<4 | 8 | 12>) {
    if (remaining === 0) {
      if (current.length >= 3 && current.length <= 6) plans.push([...current]);
      return;
    }
    if (remaining < 0 || current.length >= 6) return;
    for (const duration of durations) {
      current.push(duration);
      search(remaining - duration, current);
      current.pop();
    }
  }

  search(workMinutes, []);
  if (plans.length === 0) return null;

  plans.sort((a, b) => planScore(b) - planScore(a));
  return plans[0];
}

export function calculateRecentLoad(context: GenerationContext): Map<BodyRegion, number> {
  const result = new Map<BodyRegion, number>();
  const now = new Date(context.now ?? new Date().toISOString()).getTime();

  for (const exposure of context.recentRegionExposures ?? []) {
    const ageHours = (now - new Date(exposure.completedAt).getTime()) / 3_600_000;
    const decay = ageHours < 0 ? 1 : ageHours <= 24 ? 1 : ageHours <= 48 ? Math.max(0, 1 - ((ageHours - 24) / 24)) : 0;
    if (decay === 0) continue;
    result.set(exposure.region, (result.get(exposure.region) ?? 0) + exposure.rawExposure * decay);
  }

  return result;
}

function stationTemplatesForRequest(request: WorkoutGenerationRequest): StationTemplate[] {
  const primaryFocus = request.focusTargets[0]?.region;
  return (primaryFocus && FOCUS_TEMPLATE_OVERRIDES[primaryFocus]) || BALANCED_TEMPLATES;
}

function matchesSlot(exercise: Exercise, slot: SlotRule): boolean {
  const roleMatch = slot.roles.some((role) => exercise.stationRoles.includes(role));
  const patternMatch = !slot.patterns || slot.patterns.some((pattern) => exercise.movementPatterns.includes(pattern));
  const allowedRegionRoles = slot.regionRoles ?? ['primary', 'secondary'];
  const regionMatch = !slot.preferredRegions || slot.preferredRegions.some((region) =>
    exercise.bodyRegions.some((load) =>
      load.region === region && load.load >= 2 && allowedRegionRoles.includes(load.role),
    ),
  );
  return roleMatch && patternMatch && regionMatch;
}

function isExerciseEligible(
  exercise: Exercise,
  request: WorkoutGenerationRequest,
  available: Set<EquipmentId>,
  preference?: ExercisePreference,
): boolean {
  if (!exercise.defaultEnabled || exercise.status !== 'active' || !exercise.suitableForAmrap) return false;
  if (preference?.preference === 'hidden') return false;
  if (!request.allowUnfamiliarExercises && preference?.familiarity === 'unreviewed') return false;
  if (exercise.impactLevel > request.maximumImpact) return false;
  if (exercise.avoidanceTags.some((tag) => request.excludedMovementTags.includes(tag))) return false;
  if ((request.excludedMovementPatterns ?? []).some((pattern) => exercise.movementPatterns.includes(pattern))) return false;
  if ((request.regionRestrictions ?? []).some((restriction) => violatesRegionRestriction(exercise, restriction))) return false;

  const excluded = new Set(request.excludedRegions);
  if (exercise.bodyRegions.some((load) => load.load >= 2 && excluded.has(load.region))) return false;
  if (exercise.jointLoads.some((load) => load.load >= 2 && excluded.has(load.region))) return false;

  return exercise.equipmentOptions.some((option) =>
    option.items.every((item) => item.optional || available.has(item.equipmentId)),
  );
}

function violatesRegionRestriction(exercise: Exercise, restriction: RegionRestriction): boolean {
  const bodyLoads = exercise.bodyRegions.filter((load) => load.region === restriction.region);
  const jointLoads = exercise.jointLoads.filter((load) => load.region === restriction.region);
  if (restriction.mode === 'avoid') {
    return bodyLoads.some((load) => load.load >= 2) || jointLoads.some((load) => load.load >= 2);
  }
  if (restriction.mode === 'direct_only') {
    return bodyLoads.some((load) => load.role === 'primary' && load.load >= 2)
      || jointLoads.some((load) => load.load >= 3);
  }
  return bodyLoads.some((load) => load.load >= 4) || jointLoads.some((load) => load.load >= 4);
}

function regionRestrictionPenalty(exercise: Exercise, restrictions: RegionRestriction[]): number {
  let penalty = 0;
  for (const restriction of restrictions) {
    if (restriction.mode !== 'keep_light') continue;
    for (const load of exercise.bodyRegions) {
      if (load.region !== restriction.region) continue;
      if (load.load === 3) penalty += load.role === 'primary' ? 18 : 10;
      if (load.load === 2) penalty += load.role === 'primary' ? 7 : 3;
    }
    for (const load of exercise.jointLoads) {
      if (load.region !== restriction.region) continue;
      if (load.load === 3) penalty += 14;
      if (load.load === 2) penalty += 5;
    }
  }
  return penalty;
}

function scoreExercise({
  exercise,
  slot,
  request,
  recentLoad,
  preference,
  previousExerciseIds,
  previousGroupIds,
  globalFamilyCounts,
  globalCoverage,
  random,
}: {
  exercise: Exercise;
  slot: SlotRule;
  request: WorkoutGenerationRequest;
  recentLoad: Map<BodyRegion, number>;
  preference?: ExercisePreference;
  previousExerciseIds: string[];
  previousGroupIds: Set<string>;
  globalFamilyCounts: Map<string, number>;
  globalCoverage: Set<CoverageKey>;
  random: () => number;
}): number {
  let score = 10;

  if (slot.roles.some((role) => exercise.stationRoles.includes(role))) score += 8;
  if (slot.patterns?.some((pattern) => exercise.movementPatterns.includes(pattern))) score += 10;
  const allowedRegionRoles = slot.regionRoles ?? ['primary', 'secondary'];
  if (slot.preferredRegions?.some((region) =>
    exercise.bodyRegions.some((load) =>
      load.region === region && load.load >= 2 && allowedRegionRoles.includes(load.role),
    ),
  )) score += 8;

  for (const focus of request.focusTargets) {
    const regionLoad = exercise.bodyRegions.find((load) => load.region === focus.region)?.load ?? 0;
    score += regionLoad * EMPHASIS_WEIGHT[focus.emphasis];
  }

  if (request.recoveryAware) {
    for (const load of exercise.bodyRegions) {
      score -= (recentLoad.get(load.region) ?? 0) * load.load * 0.12;
    }
  }

  score -= regionRestrictionPenalty(exercise, request.regionRestrictions ?? []);

  if (preference?.preference === 'liked') score += 5;
  if (preference?.preference === 'disliked') score -= 8;
  if (request.favorFamiliarExercises && preference?.familiarity === 'familiar') score += 3;
  if (request.avoidPreviousWorkoutExercises && previousExerciseIds.includes(exercise.id)) score -= 16;
  if (exercise.substitutionGroupIds.some((group) => previousGroupIds.has(group))) score -= 7;
  for (const family of exerciseFamilies(exercise)) {
    score -= (globalFamilyCounts.get(family) ?? 0) * 5;
  }

  if (request.workoutStyle === 'strength_cardio_amrap') {
    score += exercise.cardiovascularDemand * 1.2;
    if (exercise.stationRoles.includes('primary_strength')) score += 2;
  }
  if (request.workoutStyle === 'low_impact') score -= exercise.impactLevel * 3;
  if (request.workoutStyle === 'stability_control') score += exercise.balanceDemand * 2;
  if (request.workoutStyle === 'power_athleticism' && exercise.stationRoles.includes('power')) score += 8;
  if (request.workoutStyle === 'bodyweight_conditioning' && exercise.classification === 'bodyweight') score += 8;

  if (request.focusTargets.length === 0) {
    for (const key of coverageKeys(exercise)) {
      if (!globalCoverage.has(key)) score += 24;
    }
  }

  score += random() * 3;
  return score;
}

function isCompatibleWithStation(
  exercise: Exercise,
  existingPatterns: Set<MovementPattern>,
  existingTags: Set<AvoidanceTag>,
): boolean {
  if (exercise.compatibility.avoidPairingPatterns?.some((pattern) => existingPatterns.has(pattern))) {
    return false;
  }
  if (exercise.avoidanceTags.includes('unstable_surface') && existingTags.has('unstable_surface')) return false;
  if (exercise.avoidanceTags.includes('jumping') && existingTags.has('jumping')) return false;
  if (exercise.avoidanceTags.includes('high_impact') && existingTags.has('high_impact')) return false;

  const mainPattern = exercise.movementPatterns[0];
  if (mainPattern && existingPatterns.has(mainPattern) && !['balance', 'mobility'].includes(mainPattern)) {
    return false;
  }
  return true;
}


type CoverageKey = 'knee' | 'hinge' | 'push' | 'pull' | 'trunk';

function coverageKeys(exercise: Exercise): CoverageKey[] {
  const keys = new Set<CoverageKey>();
  const primaryPattern = exercise.movementPatterns[0];

  // Balanced coverage requires a dedicated primary movement for each pillar.
  // A compound exercise may contribute secondary push, pull, hinge, or trunk work,
  // but it must not replace the session's true anchor for that movement family.
  if (primaryPattern === 'squat' || primaryPattern === 'lunge') keys.add('knee');
  if (primaryPattern === 'hinge') keys.add('hinge');
  if (primaryPattern === 'horizontal_push' || primaryPattern === 'vertical_push') keys.add('push');
  if (primaryPattern === 'horizontal_pull' || primaryPattern === 'vertical_pull') keys.add('pull');
  if (primaryPattern === 'anti_rotation'
      || primaryPattern === 'anti_extension'
      || primaryPattern === 'rotation'
      || primaryPattern === 'trunk_flexion'
      || primaryPattern === 'lateral_flexion') keys.add('trunk');
  return [...keys];
}

function exerciseFamilies(exercise: Exercise): string[] {
  const families = new Set<string>();
  for (const load of exercise.bodyRegions) {
    if (load.load < 2) continue;
    if (['gastrocnemius', 'soleus', 'feet_ankles', 'tibialis_anterior'].includes(load.region)) families.add('calf_ankle');
    else if (['quadriceps'].includes(load.region)) families.add('knee_dominant');
    else if (['glutes', 'hamstrings', 'lower_back'].includes(load.region)) families.add('posterior_chain');
    else if (['hip_abductors', 'hip_adductors'].includes(load.region)) families.add('lateral_hip');
    else if (['core_anterior', 'core_lateral', 'core_rotation'].includes(load.region)) families.add('trunk');
    else if (['chest', 'shoulders', 'triceps'].includes(load.region)) families.add('upper_push');
    else if (['upper_back', 'lats', 'biceps'].includes(load.region)) families.add('upper_pull');
    else families.add(load.region);
  }
  if (exercise.avoidanceTags.includes('jumping') || exercise.movementPatterns.includes('jump_hop')) families.add('impact');
  if (exercise.avoidanceTags.includes('unstable_surface') || exercise.balanceDemand >= 4) families.add('high_balance');
  return [...families];
}

function canAddToWorkout({
  exercise,
  selectedInStation,
  priorStations,
  globalFamilyCounts,
  globalGroupCounts,
  request,
}: {
  exercise: Exercise;
  selectedInStation: WorkoutExercisePrescription[];
  priorStations: WorkoutStation[];
  globalFamilyCounts: Map<string, number>;
  globalGroupCounts: Map<string, number>;
  request: WorkoutGenerationRequest;
}): boolean {
  const balanced = request.focusTargets.length === 0;
  const families = exerciseFamilies(exercise);
  if (exercise.substitutionGroupIds.some((group) => (globalGroupCounts.get(group) ?? 0) >= 1)) return false;
  if (balanced) {
    if (families.includes('calf_ankle') && (globalFamilyCounts.get('calf_ankle') ?? 0) >= 2) return false;
    if (families.includes('impact') && (globalFamilyCounts.get('impact') ?? 0) >= 1) return false;
    if (families.includes('high_balance') && (globalFamilyCounts.get('high_balance') ?? 0) >= 3) return false;
    for (const family of families) {
      if (!['trunk', 'high_balance'].includes(family) && (globalFamilyCounts.get(family) ?? 0) >= 3) return false;
    }
  }
  const stationFamilies = new Set(selectedInStation.flatMap((item) => exerciseFamilies(item.exerciseSnapshot)));
  if (families.includes('calf_ankle') && stationFamilies.has('calf_ankle')) return false;
  if (families.includes('impact') && stationFamilies.has('impact')) return false;
  if (families.includes('high_balance') && stationFamilies.has('high_balance')) return false;
  return true;
}

function selectEquipmentOption(exercise: Exercise, available: Set<EquipmentId>) {
  return exercise.equipmentOptions
    .filter((option) => option.items.every((item) => item.optional || available.has(item.equipmentId)))
    .sort((a, b) => a.items.length - b.items.length)[0];
}

function selectPrescription(exercise: Exercise, stationMinutes: number, exerciseCount: number) {
  const prescriptions = exercise.prescriptions.filter((item) => item.style === 'amrap');
  if (prescriptions.length === 0) return exercise.prescriptions[0];
  const targetRoundSeconds = Math.max(55, Math.min(130, stationMinutes * 12));
  const targetPerExercise = targetRoundSeconds / exerciseCount;
  return [...prescriptions].sort(
    (a, b) => Math.abs(a.estimatedSeconds - targetPerExercise) - Math.abs(b.estimatedSeconds - targetPerExercise),
  )[0];
}

function resolveExerciseCount(
  setting: 2 | 3 | 'mixed',
  stationIndex: number,
  stationMinutes: 4 | 8 | 12,
  random: () => number,
): 2 | 3 {
  if (stationMinutes === 4) return 2;
  if (setting === 2 || setting === 3) return setting;
  return (stationIndex % 2 === 0 ? random() > 0.4 : random() > 0.65) ? 3 : 2;
}

function weightedChoice<T extends { score: number }>(items: T[], random: () => number): T | undefined {
  if (items.length === 0) return undefined;
  const minimum = Math.min(...items.map((item) => item.score));
  const weights = items.map((item) => Math.max(0.1, item.score - minimum + 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = random() * total;
  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return items[index];
  }
  return items.at(-1);
}

function planScore(plan: Array<4 | 8 | 12>): number {
  const targetStationCount = 5;
  const variety = new Set(plan).size;
  const shortStations = plan.filter((minutes) => minutes === 4).length;
  return 20 - Math.abs(plan.length - targetStationCount) * 3 + variety * 2 - shortStations;
}

function collectRequiredEquipment(stations: WorkoutStation[]): EquipmentId[] {
  const ids = new Set<EquipmentId>();
  for (const station of stations) {
    for (const item of station.exercises) {
      const option = item.exerciseSnapshot.equipmentOptions.find(
        (candidate) => candidate.id === item.equipmentOptionId,
      );
      option?.items.forEach((equipment) => {
        if (equipment.equipmentId !== 'bodyweight') ids.add(equipment.equipmentId);
      });
    }
  }
  return [...ids].sort();
}

function workoutName(request: WorkoutGenerationRequest, seed: string): string {
  const number = hashString(seed);
  const equipment = new Set(request.availableEquipment);
  const focus = request.focusTargets.map((target) => target.region);
  const candidates: string[] = [];
  if (equipment.size === 0) candidates.push('Bodyweight Plot Twist');
  if (equipment.size === 1 && equipment.has('dumbbell')) candidates.push('Dumbbell Diplomacy');
  if (equipment.has('dumbbell') && equipment.has('bench')) candidates.push('Bench, Bells and Bad Decisions');
  if (equipment.has('kettlebell')) candidates.push('Kettlebell Side Quest');
  if (equipment.has('barbell')) candidates.push('Barbell Business');
  if (request.minimizeEquipmentChanges) candidates.push('One-Corner Gym Mission');
  if (focus.includes('glutes') || focus.includes('hamstrings')) candidates.push('Posterior Chain Side Quest');
  if (focus.includes('upper_back') || focus.includes('lats')) candidates.push('Pulling Strings');
  if (focus.includes('core_anterior') || focus.includes('core_rotation')) candidates.push('Core Curriculum');
  if (request.allowedStationMinutes.every((minutes) => minutes === 12)) candidates.push('Twelve-Minute Trouble');
  if (request.workMinutes <= 24) candidates.push('The Quick Detour');
  if (request.workMinutes >= 48) candidates.push('The Long Way Around');
  candidates.push('Full-Body Field Trip', 'Controlled Mayhem', 'The Equipment Shuffle', 'Sweat Equity', 'The Side Quest Special');
  return candidates[number % candidates.length] ?? 'The Side Quest Special';
}

function buildRecentLoadMessages(recentLoad: Map<BodyRegion, number>): string[] {
  return [...recentLoad.entries()]
    .filter(([, score]) => score >= 8)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([region]) => `${titleCase(region.replaceAll('_', ' '))} loading was adjusted based on the previous 24–48 hours.`);
}

function validateGeneratedWorkout(workout: GeneratedWorkout): string[] {
  const issues: string[] = [];
  if (workout.totalWorkSeconds !== workout.request.workMinutes * 60) {
    issues.push('Generated station durations do not equal the requested work time.');
  }
  if (workout.stations.length < 3 || workout.stations.length > 6) {
    issues.push('A workout must contain three to six stations.');
  }
  const allItems = workout.stations.flatMap((station) => station.exercises);
  const ids = allItems.map((exercise) => exercise.exerciseId);
  if (new Set(ids).size !== ids.length) issues.push('An exercise was repeated in the same workout.');
  const groups = allItems.flatMap((item) => item.exerciseSnapshot.substitutionGroupIds);
  if (new Set(groups).size !== groups.length) issues.push('Two exercises from the same variation ladder were used in one workout.');
  if (workout.stations.some((station) => station.exercises.length < 2 || station.exercises.length > 3)) {
    issues.push('Every station must contain two or three exercises.');
  }
  const balanced = workout.request.focusTargets.length === 0;
  if (balanced) {
    const counts = new Map<string, number>();
    for (const item of allItems) for (const family of exerciseFamilies(item.exerciseSnapshot)) counts.set(family, (counts.get(family) ?? 0) + 1);
    if ((counts.get('calf_ankle') ?? 0) > 2) issues.push('Balanced workouts may not contain more than two calf/ankle exposures.');
    if ((counts.get('impact') ?? 0) > 1) issues.push('Balanced workouts may not contain more than one impact exercise.');
    const coverage = new Set(allItems.flatMap((item) => coverageKeys(item.exerciseSnapshot)));
    if (!coverage.has('knee')) issues.push('Balanced workouts require a knee-dominant movement.');
    if (!coverage.has('hinge')) issues.push('Balanced workouts require a hip-hinge movement.');
    if (!coverage.has('push')) issues.push('Balanced workouts require an upper-body push.');
    if (!coverage.has('pull')) issues.push('Balanced workouts require an upper-body pull.');
    if (!coverage.has('trunk')) issues.push('Balanced workouts require direct trunk work.');
    for (const station of workout.stations) {
      const stationFamilies = station.exercises.flatMap((item) => exerciseFamilies(item.exerciseSnapshot));
      if (stationFamilies.filter((family) => family === 'calf_ankle').length > 1) issues.push(`Station ${station.order} repeats calf/ankle loading.`);
      if (stationFamilies.filter((family) => family === 'impact').length > 1) issues.push(`Station ${station.order} repeats impact loading.`);
    }
  }
  return [...new Set(issues)];
}

function seededRandom(seed: string): () => number {
  let state = hashString(seed) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4_294_967_296;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

export type { GeneratedWorkout, WorkoutGenerationRequest } from '@circuit/domain';
