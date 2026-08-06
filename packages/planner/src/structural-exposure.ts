import type {
  EnduranceStructuralExposureInput,
  ExerciseMechanicalLoadProfile,
  MechanicalLoadDimension,
  MechanicalLoadLevel,
  PlannedStructuralExposure,
  StructuralExposureDecision,
  StructuralExposureEntry,
  StructuralExposureRegionSummary,
  StructuralExposureSource,
  StructuralRegion,
} from '@circuit/domain';
import { mechanicalLoadLevelScore } from './mechanical-load';

const DAY_MS = 86_400_000;
const REGIONS: StructuralRegion[] = [
  'cervical_spine', 'thoracic_spine', 'lumbar_spine', 'shoulder_complex', 'elbow',
  'wrist_hand', 'hip', 'knee', 'achilles_calf', 'foot_plantar',
];

const DIMENSION_REGION_MAP: Partial<Record<MechanicalLoadDimension, StructuralRegion[]>> = {
  axialLoad: ['lumbar_spine', 'hip', 'knee'],
  spinalStabilization: ['thoracic_spine', 'lumbar_spine'],
  spinalFlexion: ['lumbar_spine'],
  spinalExtension: ['thoracic_spine', 'lumbar_spine'],
  rotation: ['thoracic_spine', 'lumbar_spine'],
  antiRotation: ['thoracic_spine', 'lumbar_spine'],
  eccentricDemand: ['hip', 'knee', 'achilles_calf'],
  impactDemand: ['knee', 'achilles_calf', 'foot_plantar'],
  tendonDemand: ['shoulder_complex', 'elbow', 'knee', 'achilles_calf', 'foot_plantar'],
  overheadDemand: ['shoulder_complex', 'thoracic_spine'],
  shoulderRepetition: ['shoulder_complex', 'elbow'],
  gripDemand: ['elbow', 'wrist_hand'],
  balanceDemand: ['hip', 'knee', 'achilles_calf', 'foot_plantar'],
  unilateralStabilization: ['lumbar_spine', 'hip', 'knee'],
  rangeOfMotionDemand: ['shoulder_complex', 'hip', 'knee'],
};

function isoMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function confidenceRank(value: 'low' | 'moderate' | 'high'): number {
  return value === 'high' ? 3 : value === 'moderate' ? 2 : 1;
}
function levelDose(level: MechanicalLoadLevel): number {
  return mechanicalLoadLevelScore(level);
}
function entryId(parts: string[]): string {
  return parts.join(':').replace(/[^a-zA-Z0-9:_-]/g, '_');
}

export function structuralExposureFromMechanicalProfiles({
  profiles,
  occurredAt,
  sessionId,
  stationMinutes = 8,
}: {
  profiles: ExerciseMechanicalLoadProfile[];
  occurredAt: string;
  sessionId: string;
  stationMinutes?: number;
}): StructuralExposureEntry[] {
  const entries: StructuralExposureEntry[] = [];
  for (const profile of profiles) {
    const regionDose = new Map<StructuralRegion, { dose: number; reasons: string[] }>();
    for (const [dimension, regions] of Object.entries(DIMENSION_REGION_MAP) as Array<[MechanicalLoadDimension, StructuralRegion[]]>) {
      if (!regions) continue;
      const score = levelDose(profile[dimension]);
      if (score === 0) continue;
      for (const region of regions) {
        const current = regionDose.get(region) ?? { dose: 0, reasons: [] };
        current.dose += score * Math.max(0.5, stationMinutes / 8);
        current.reasons.push(dimension);
        regionDose.set(region, current);
      }
    }
    for (const [region, value] of regionDose) {
      entries.push({
        id: entryId([sessionId, profile.exerciseId, region]),
        occurredAt,
        source: 'strength',
        region,
        dose: Number(value.dose.toFixed(2)),
        confidence: profile.confidence,
        rationale: `${profile.exerciseId}: ${[...new Set(value.reasons)].join(', ')}.`,
        exerciseId: profile.exerciseId,
        activityId: sessionId,
      });
    }
  }
  return entries;
}

export function structuralExposureFromEnduranceActivity(
  activity: EnduranceStructuralExposureInput,
): StructuralExposureEntry[] {
  const intensityMultiplier = activity.intensity === 'hard' ? 1.35 : activity.intensity === 'moderate' ? 1.1 : 0.85;
  const hours = Math.max(0.1, activity.durationMinutes / 60);
  const add = (region: StructuralRegion, factor: number, rationale: string): StructuralExposureEntry => ({
    id: entryId([activity.activityId, region]),
    occurredAt: activity.occurredAt,
    source: activity.discipline,
    region,
    dose: Number((hours * factor * intensityMultiplier).toFixed(2)),
    confidence: 'moderate',
    rationale,
    activityId: activity.activityId,
  });
  if (activity.discipline === 'swim') {
    const paddle = activity.usedPaddles ? 1.35 : 1;
    return [
      add('shoulder_complex', 3.2 * paddle, activity.usedPaddles ? 'Swimming shoulder repetition with paddle loading.' : 'Swimming shoulder repetition.'),
      add('thoracic_spine', 1.2, 'Swimming posture and rotation exposure.'),
      add('elbow', 0.8 * paddle, 'Repeated pulling exposure.'),
    ];
  }
  if (activity.discipline === 'bike') {
    return [
      add('lumbar_spine', 1.4, 'Prolonged cycling trunk stabilization.'),
      add('cervical_spine', 0.8, 'Sustained riding posture.'),
      add('knee', 1.3, 'Repeated cycling knee flexion-extension.'),
      add('wrist_hand', 0.5, 'Handlebar support exposure.'),
    ];
  }
  const downhill = activity.elevationLossMeters && activity.elevationLossMeters > 300 ? 1.35 : 1;
  const trail = activity.surface === 'trail' ? 1.2 : 1;
  return [
    add('knee', 2.2 * downhill * trail, downhill > 1 ? 'Running with elevated downhill eccentric demand.' : 'Running impact and repetition.'),
    add('achilles_calf', 2.1 * trail, 'Running calf-Achilles repetition and impact.'),
    add('foot_plantar', 1.8 * trail, 'Running foot and plantar impact exposure.'),
    add('hip', 1.4 * trail, 'Running hip stabilization exposure.'),
  ];
}

export function summarizeStructuralExposure({
  entries,
  planned = [],
  now = new Date().toISOString(),
}: {
  entries: StructuralExposureEntry[];
  planned?: PlannedStructuralExposure[];
  now?: string;
}): StructuralExposureRegionSummary[] {
  const nowMs = isoMs(now);
  return REGIONS.map((region) => {
    const relevant = entries.filter((entry) => entry.region === region && isoMs(entry.occurredAt) <= nowMs);
    const seven = relevant.filter((entry) => nowMs - isoMs(entry.occurredAt) <= 7 * DAY_MS);
    const twentyOne = relevant.filter((entry) => nowMs - isoMs(entry.occurredAt) <= 21 * DAY_MS);
    const recentDose7d = seven.reduce((sum, entry) => sum + entry.dose, 0);
    const recentDose21dPerWeek = twentyOne.reduce((sum, entry) => sum + entry.dose, 0) / 3;
    const plannedDose = planned.filter((entry) => entry.region === region).reduce((sum, entry) => sum + entry.dose, 0);
    const ratio = recentDose21dPerWeek > 0 ? (recentDose7d + plannedDose) / recentDose21dPerWeek : 0;
    const status = recentDose21dPerWeek === 0
      ? (plannedDose >= 6 ? 'building' : 'low')
      : ratio >= 1.75 || recentDose7d + plannedDose >= recentDose21dPerWeek + 10
        ? 'reduce'
        : ratio >= 1.3
          ? 'high'
          : ratio >= 0.75
            ? 'building'
            : 'low';
    const sourceTotals = new Map<StructuralExposureSource, number>();
    for (const entry of seven) sourceTotals.set(entry.source, (sourceTotals.get(entry.source) ?? 0) + entry.dose);
    for (const entry of planned.filter((item) => item.region === region)) sourceTotals.set(entry.source, (sourceTotals.get(entry.source) ?? 0) + entry.dose);
    const dominantSources = [...sourceTotals].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([source]) => source);
    const reasons: string[] = [];
    if (status === 'reduce') reasons.push('Recent plus planned exposure substantially exceeds the established three-week weekly pattern.');
    else if (status === 'high') reasons.push('Exposure is increasing faster than the recent weekly pattern.');
    if (dominantSources.length > 1) reasons.push(`Load overlaps across ${dominantSources.join(' and ')}.`);
    const confidence = relevant.length === 0 ? 'low' : relevant.some((entry) => entry.confidence === 'low') ? 'moderate' : relevant.reduce((best, entry) => Math.max(best, confidenceRank(entry.confidence)), 1) >= 3 ? 'high' : 'moderate';
    return {
      region,
      recentDose7d: Number(recentDose7d.toFixed(2)),
      recentDose21dPerWeek: Number(recentDose21dPerWeek.toFixed(2)),
      plannedDose: Number(plannedDose.toFixed(2)),
      status,
      confidence,
      dominantSources,
      reasons,
    };
  });
}

function dimensionsForRegion(region: StructuralRegion): MechanicalLoadDimension[] {
  return (Object.entries(DIMENSION_REGION_MAP) as Array<[MechanicalLoadDimension, StructuralRegion[]]>)
    .filter(([, regions]) => regions?.includes(region))
    .map(([dimension]) => dimension);
}

export function decideStructuralExposure(input: {
  entries: StructuralExposureEntry[];
  planned?: PlannedStructuralExposure[];
  symptomRegions?: StructuralRegion[];
  symptomsAffectDailyActivity?: boolean;
  now?: string;
}): StructuralExposureDecision {
  const summaries = summarizeStructuralExposure(input);
  const symptomRegions = input.symptomRegions ?? [];
  const reduceRegions = summaries.filter((summary) => summary.status === 'reduce').map((summary) => summary.region);
  const highRegions = summaries.filter((summary) => summary.status === 'high').map((summary) => summary.region);
  const constrainedRegions = [...new Set([...reduceRegions, ...symptomRegions])];
  const action = input.symptomsAffectDailyActivity && symptomRegions.length > 0
    ? 'restrict_region'
    : constrainedRegions.length > 0
      ? 'modify'
      : highRegions.length > 0
        ? 'hold_progression'
        : 'proceed';
  const avoidDimensions = [...new Set(constrainedRegions.flatMap(dimensionsForRegion))];
  const sessionScale = action === 'restrict_region' ? 0.5 : action === 'modify' ? 0.7 : action === 'hold_progression' ? 0.9 : 1;
  const explanations: string[] = [];
  if (action === 'modify') explanations.push(`The next session is modified because ${constrainedRegions.join(', ')} exposure is above the established pattern.`);
  if (action === 'restrict_region') explanations.push(`Training that substantially loads ${constrainedRegions.join(', ')} is restricted because symptoms affect daily activity.`);
  if (action === 'hold_progression') explanations.push(`Progression is held while ${highRegions.join(', ')} exposure consolidates.`);
  if (action === 'proceed') explanations.push('No structural region requires an automatic reduction based on current exposure history.');
  const overlaps = summaries.filter((summary) => summary.dominantSources.length > 1 && (summary.status === 'high' || summary.status === 'reduce'));
  for (const summary of overlaps) explanations.push(`${summary.region} load overlaps across ${summary.dominantSources.join(' and ')}.`);
  return { action, summaries, constrainedRegions, avoidDimensions, sessionScale, explanations };
}

export function candidateFitsStructuralDecision(
  profile: ExerciseMechanicalLoadProfile,
  decision: StructuralExposureDecision,
): boolean {
  if (decision.action === 'proceed' || decision.action === 'hold_progression') return true;
  return !decision.avoidDimensions.some((dimension) => levelDose(profile[dimension]) >= (decision.action === 'restrict_region' ? 2 : 3));
}
