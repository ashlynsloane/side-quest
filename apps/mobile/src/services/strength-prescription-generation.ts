import type { BodyRegion, FocusTarget, RegionRestriction, WorkoutGenerationRequest } from '@circuit/domain';
import type {
  StrengthStimulus,
  WeeklyStrengthPrescription,
} from '@circuit/planner/whole-athlete-strength-coherence';

const STIMULUS_TARGETS: Record<StrengthStimulus, FocusTarget[]> = {
  heavy_lower: [
    { region: 'quadriceps', emphasis: 'strong' },
    { region: 'glutes', emphasis: 'strong' },
  ],
  posterior_chain: [
    { region: 'hamstrings', emphasis: 'strong' },
    { region: 'glutes', emphasis: 'moderate' },
  ],
  unilateral_control: [
    { region: 'hip_abductors', emphasis: 'moderate' },
    { region: 'glutes', emphasis: 'moderate' },
  ],
  lower_leg_capacity: [
    { region: 'feet_ankles', emphasis: 'strong' },
    { region: 'soleus', emphasis: 'strong' },
  ],
  upper_pull: [
    { region: 'lats', emphasis: 'strong' },
    { region: 'upper_back', emphasis: 'strong' },
  ],
  upper_push: [
    { region: 'chest', emphasis: 'strong' },
    { region: 'shoulders', emphasis: 'moderate' },
  ],
  trunk_control: [
    { region: 'core_anterior', emphasis: 'strong' },
    { region: 'core_lateral', emphasis: 'moderate' },
  ],
  general_maintenance: [
    { region: 'glutes', emphasis: 'moderate' },
    { region: 'core_anterior', emphasis: 'moderate' },
  ],
};

const STIMULUS_REGIONS: Record<StrengthStimulus, BodyRegion[]> = {
  heavy_lower: ['quadriceps', 'glutes'],
  posterior_chain: ['hamstrings', 'glutes'],
  unilateral_control: ['hip_abductors'],
  lower_leg_capacity: ['feet_ankles', 'soleus'],
  upper_pull: ['lats', 'upper_back'],
  upper_push: ['chest', 'shoulders'],
  trunk_control: ['core_anterior', 'core_lateral'],
  general_maintenance: [],
};

/**
 * Converts the whole-athlete weekly strength role into constraints the exercise
 * generator already understands. This is intentionally a biasing layer rather
 * than a hard exercise prescription: safety restrictions and equipment
 * availability still win.
 */
export function applyWeeklyStrengthPrescriptionToRequest(
  request: WorkoutGenerationRequest,
  prescription: WeeklyStrengthPrescription | undefined,
): WorkoutGenerationRequest {
  if (!prescription) return request;

  const focusTargets = mergeFocusTargets(
    prescription.emphasis.flatMap((stimulus) => STIMULUS_TARGETS[stimulus]),
    request.focusTargets,
  ).slice(0, 3);

  const deEmphasizedRegions = new Set(
    prescription.deEmphasize.flatMap((stimulus) => STIMULUS_REGIONS[stimulus]),
  );
  const regionRestrictions = mergeKeepLightRestrictions(
    request.regionRestrictions ?? [],
    [...deEmphasizedRegions],
  );

  const doseMultiplier = prescription.lowerBodyDose === 'light'
    ? 0.85
    : prescription.lowerBodyDose === 'moderate'
      ? 0.95
      : 1;

  return {
    ...request,
    workMinutes: Math.max(8, Math.round(request.workMinutes * doseMultiplier)),
    focusTargets,
    regionRestrictions,
    maximumImpact: prescription.lowerBodyDose === 'light'
      ? Math.min(request.maximumImpact, 2) as WorkoutGenerationRequest['maximumImpact']
      : request.maximumImpact,
    randomSeed: `${request.randomSeed ?? 'strength'}-coherent-${prescription.emphasis.join('-')}`,
  };
}

function mergeFocusTargets(primary: FocusTarget[], fallback: FocusTarget[]): FocusTarget[] {
  const rank = { light: 1, moderate: 2, strong: 3 } as const;
  const merged = new Map<BodyRegion, FocusTarget>();
  for (const target of [...primary, ...fallback]) {
    const current = merged.get(target.region);
    if (!current || rank[target.emphasis] > rank[current.emphasis]) merged.set(target.region, target);
  }
  return [...merged.values()];
}

function mergeKeepLightRestrictions(
  existing: RegionRestriction[],
  regions: BodyRegion[],
): RegionRestriction[] {
  const rank = { direct_only: 1, keep_light: 2, avoid: 3 } as const;
  const merged = new Map(existing.map((restriction) => [restriction.region, restriction]));
  for (const region of regions) {
    const next: RegionRestriction = { region, mode: 'keep_light' };
    const current = merged.get(region);
    if (!current || rank[next.mode] > rank[current.mode]) merged.set(region, next);
  }
  return [...merged.values()];
}
