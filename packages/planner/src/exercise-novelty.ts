import type {
  ExerciseDemandBand,
  ExerciseExposureRecord,
  ExerciseFamiliarity,
  ExerciseNoveltyCandidate,
  ExerciseNoveltyDecision,
  ExerciseNoveltyProfile,
  StrengthLoadDecision,
} from '@circuit/domain';

const DAY_MS = 86_400_000;
const RECENT_WINDOW_DAYS = 42;
const DETRAINED_WINDOW_DAYS = 56;

function asTime(value: string): number {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function demandCost(demand: ExerciseDemandBand): 1 | 2 | 3 {
  if (demand === 'high') return 3;
  if (demand === 'moderate') return 2;
  return 1;
}

export function classifyExerciseFamiliarity({
  exerciseId,
  exposureHistory,
  now = new Date().toISOString(),
}: {
  exerciseId: string;
  exposureHistory: ExerciseExposureRecord[];
  now?: string;
}): ExerciseFamiliarity {
  const end = asTime(now) || Date.now();
  const exposures = exposureHistory
    .filter((entry) => entry.exerciseId === exerciseId && asTime(entry.completedAt) <= end)
    .sort((left, right) => asTime(right.completedAt) - asTime(left.completedAt));
  if (exposures.length === 0) return 'new';

  const daysSinceLast = Math.floor((end - asTime(exposures[0].completedAt)) / DAY_MS);
  const recent = exposures.filter((entry) => end - asTime(entry.completedAt) <= RECENT_WINDOW_DAYS * DAY_MS);
  if (exposures.length >= 3 && daysSinceLast > DETRAINED_WINDOW_DAYS) return 'detrained';
  if (recent.length >= 3 && recent.some((entry) => entry.response === 'tolerated')) return 'familiar';
  if (recent.length >= 2 && recent.every((entry) => entry.response !== 'poorly_tolerated')) return 'familiar';
  return 'recently_introduced';
}

export function profileExerciseNovelty({
  candidate,
  exposureHistory,
  now = new Date().toISOString(),
}: {
  candidate: ExerciseNoveltyCandidate;
  exposureHistory: ExerciseExposureRecord[];
  now?: string;
}): ExerciseNoveltyProfile {
  const end = asTime(now) || Date.now();
  const exposures = exposureHistory
    .filter((entry) => entry.exerciseId === candidate.exerciseId && asTime(entry.completedAt) <= end)
    .sort((left, right) => asTime(right.completedAt) - asTime(left.completedAt));
  const recent = exposures.filter((entry) => end - asTime(entry.completedAt) <= RECENT_WINDOW_DAYS * DAY_MS);
  const familiarity = classifyExerciseFamiliarity({ exerciseId: candidate.exerciseId, exposureHistory, now });
  const last = exposures[0];
  const daysSinceLastExposure = last ? Math.max(0, Math.floor((end - asTime(last.completedAt)) / DAY_MS)) : undefined;
  const adverse = recent.some((entry) => entry.response === 'poorly_tolerated');
  const baseCost = familiarity === 'familiar' ? 0 : demandCost(candidate.demand);
  const noveltyCost = Math.min(3, baseCost + (adverse ? 1 : 0)) as 0 | 1 | 2 | 3;
  const introductoryDoseMultiplier: ExerciseNoveltyProfile['introductoryDoseMultiplier'] =
    familiarity === 'familiar' ? 1
      : noveltyCost >= 3 ? 0.5
        : noveltyCost === 2 ? 0.67
          : 0.8;
  const rationale: string[] = [];
  if (familiarity === 'new') rationale.push('No completed exposure is recorded for this exercise.');
  if (familiarity === 'recently_introduced') rationale.push('The movement has not yet accumulated enough tolerated repetitions to count as familiar.');
  if (familiarity === 'detrained') rationale.push('Past experience exists, but recent exposure is too remote to assume current tolerance.');
  if (familiarity === 'familiar') rationale.push('Repeated recent exposures support normal dosing.');
  if (candidate.demand === 'high' && familiarity !== 'familiar') rationale.push('High-demand novelty receives a smaller introductory dose.');
  if (adverse) rationale.push('A recent poor response increases the novelty cost.');

  return {
    exerciseId: candidate.exerciseId,
    familiarity,
    lifetimeExposures: exposures.length,
    recentExposures: recent.length,
    daysSinceLastExposure,
    demand: candidate.demand,
    noveltyCost,
    introductoryDoseMultiplier,
    rationale,
  };
}

function noveltyBudget(loadDecision: StrengthLoadDecision): { maximumNovel: number; maximumHigh: number } {
  if (loadDecision.action === 'restrict') return { maximumNovel: 0, maximumHigh: 0 };
  if (loadDecision.action === 'consolidate') return { maximumNovel: 1, maximumHigh: 0 };
  if (loadDecision.action === 'hold' || loadDecision.reduceNovelty) return { maximumNovel: 1, maximumHigh: 1 };
  return { maximumNovel: 2, maximumHigh: 1 };
}

export function buildExerciseNoveltyDecision({
  candidates,
  exposureHistory = [],
  loadDecision,
  now = new Date().toISOString(),
}: {
  candidates: ExerciseNoveltyCandidate[];
  exposureHistory?: ExerciseExposureRecord[];
  loadDecision: StrengthLoadDecision;
  now?: string;
}): ExerciseNoveltyDecision {
  const profiles = candidates.map((candidate) => profileExerciseNovelty({ candidate, exposureHistory, now }));
  const profileById = new Map(profiles.map((profile) => [profile.exerciseId, profile]));
  const budget = noveltyBudget(loadDecision);
  let novelCount = 0;
  let highNovelCount = 0;
  const selectedExerciseIds: string[] = [];
  const deferredExerciseIds: string[] = [];

  // Preserve requested order while allowing familiar exercises and regressions through first.
  for (const candidate of candidates) {
    const profile = profileById.get(candidate.exerciseId)!;
    const novel = profile.familiarity !== 'familiar';
    const highNovel = novel && candidate.demand === 'high';
    const requiredRegression = Boolean(candidate.isRegression && candidate.isRequiredForGoal);
    const withinBudget = (!novel || novelCount < budget.maximumNovel)
      && (!highNovel || highNovelCount < budget.maximumHigh);

    if (withinBudget || requiredRegression) {
      selectedExerciseIds.push(candidate.exerciseId);
      if (novel) novelCount += 1;
      if (highNovel) highNovelCount += 1;
    } else {
      deferredExerciseIds.push(candidate.exerciseId);
    }
  }

  const reasons: string[] = [];
  if (budget.maximumNovel === 0) reasons.push('No unfamiliar exercises are introduced while the plan is restricted.');
  else reasons.push(`This session may introduce up to ${budget.maximumNovel} unfamiliar exercise${budget.maximumNovel === 1 ? '' : 's'}.`);
  if (budget.maximumHigh === 0) reasons.push('High-demand unfamiliar exercises are deferred during consolidation or restriction.');
  if (deferredExerciseIds.length) reasons.push(`${deferredExerciseIds.length} exercise${deferredExerciseIds.length === 1 ? ' was' : 's were'} deferred to prevent novelty from accumulating with other load progression.`);

  return {
    maximumNovelExercises: budget.maximumNovel,
    maximumHighDemandNovelExercises: budget.maximumHigh,
    selectedExerciseIds,
    deferredExerciseIds,
    profiles,
    reasons,
  };
}
