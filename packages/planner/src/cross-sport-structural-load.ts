import type {
  CrossSportRegionOverlap,
  CrossSportSessionAdjustment,
  CrossSportStructuralPlanDecision,
  CrossSportStructuralSession,
  PlannedStructuralExposure,
  StructuralExposureDecision,
  StructuralRegion,
} from '@circuit/domain';

const HOUR_MS = 3_600_000;
const HIGH_DOSE = 5;
const MODERATE_DOSE = 3;

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function doseForRegion(exposure: PlannedStructuralExposure[], region: StructuralRegion): number {
  return exposure.filter((item) => item.region === region).reduce((sum, item) => sum + item.dose, 0);
}

function overlapWindowHours(left: CrossSportStructuralSession, right: CrossSportStructuralSession): number {
  return Math.abs(timestamp(right.startsAt) - timestamp(left.startsAt)) / HOUR_MS;
}

function severityFor(combinedDose: number, windowHours: number): CrossSportRegionOverlap['severity'] {
  if (combinedDose >= 8 && windowHours <= 12) return 'separate';
  if (combinedDose >= HIGH_DOSE && windowHours <= 24) return 'modify';
  return 'watch';
}

export function detectCrossSportStructuralOverlaps(
  sessions: CrossSportStructuralSession[],
  windowHours = 36,
): CrossSportRegionOverlap[] {
  const overlaps: CrossSportRegionOverlap[] = [];
  for (let leftIndex = 0; leftIndex < sessions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sessions.length; rightIndex += 1) {
      const left = sessions[leftIndex];
      const right = sessions[rightIndex];
      if (!left || !right || left.discipline === right.discipline) continue;
      const hours = overlapWindowHours(left, right);
      if (hours > windowHours) continue;
      const regions = unique([...left.exposure.map((item) => item.region), ...right.exposure.map((item) => item.region)]);
      for (const region of regions) {
        const leftDose = doseForRegion(left.exposure, region);
        const rightDose = doseForRegion(right.exposure, region);
        if (leftDose < 1 || rightDose < 1) continue;
        const combinedDose = leftDose + rightDose;
        if (combinedDose < MODERATE_DOSE) continue;
        const severity = severityFor(combinedDose, hours);
        overlaps.push({
          region,
          sessionIds: [left.sessionId, right.sessionId],
          disciplines: [left.discipline, right.discipline],
          combinedDose: Number(combinedDose.toFixed(2)),
          windowHours: Number(hours.toFixed(1)),
          severity,
          rationale: `${left.discipline} and ${right.discipline} both load ${region} within ${Number(hours.toFixed(1))} hours.`,
        });
      }
    }
  }
  return overlaps.sort((left, right) => {
    const rank = { separate: 3, modify: 2, watch: 1 } as const;
    return rank[right.severity] - rank[left.severity] || right.combinedDose - left.combinedDose;
  });
}

function sessionAdjustment(
  session: CrossSportStructuralSession,
  overlaps: CrossSportRegionOverlap[],
  constrainedRegions: StructuralRegion[],
): CrossSportSessionAdjustment {
  const related = overlaps.filter((overlap) => overlap.sessionIds.includes(session.sessionId));
  const protectedRegions = unique([
    ...constrainedRegions.filter((region) => doseForRegion(session.exposure, region) > 0),
    ...related.filter((item) => item.severity !== 'watch').map((item) => item.region),
  ]);
  if (protectedRegions.length === 0) return { sessionId: session.sessionId, action: 'keep', protectedRegions: [], rationale: ['No material cross-sport structural conflict was detected.'] };

  const severe = related.some((item) => item.severity === 'separate');
  const isKey = session.priority === 'key';
  if (severe && session.movable && !isKey) {
    return { sessionId: session.sessionId, action: 'move', moveByHours: 24, protectedRegions, rationale: ['Move this supporting session to create recovery time between overlapping structural demands.'] };
  }
  if (session.discipline === 'strength') {
    return { sessionId: session.sessionId, action: 'replace', scale: 0.7, protectedRegions, rationale: ['Replace high-demand strength exercises for the overlapping regions while preserving unrelated work.'] };
  }
  if (!isKey) {
    return { sessionId: session.sessionId, action: 'reduce', scale: severe ? 0.7 : 0.85, protectedRegions, rationale: ['Reduce the supporting endurance dose rather than compromising the key session.'] };
  }
  return { sessionId: session.sessionId, action: 'keep', protectedRegions, rationale: ['Keep the key session and modify or move the lower-priority companion session.'] };
}

export function decideCrossSportStructuralPlan(input: {
  sessions: CrossSportStructuralSession[];
  currentDecision?: StructuralExposureDecision;
  windowHours?: number;
}): CrossSportStructuralPlanDecision {
  const overlaps = detectCrossSportStructuralOverlaps(input.sessions, input.windowHours);
  const currentConstrained = input.currentDecision?.constrainedRegions ?? [];
  const overlapConstrained = overlaps.filter((item) => item.severity !== 'watch').map((item) => item.region);
  const constrainedRegions = unique([...currentConstrained, ...overlapConstrained]);
  const adjustments = input.sessions.map((session) => sessionAdjustment(session, overlaps, constrainedRegions));
  const hasProtectedRegion = currentConstrained.length > 0;
  const hasSeparation = overlaps.some((item) => item.severity === 'separate');
  const hasModification = overlaps.some((item) => item.severity === 'modify');
  const action: CrossSportStructuralPlanDecision['action'] = hasProtectedRegion
    ? 'protect_region'
    : hasSeparation
      ? 'separate_sessions'
      : hasModification
        ? 'redistribute'
        : 'proceed';
  const explanations: string[] = [];
  if (action === 'protect_region') explanations.push('The plan protects regions already constrained by recent exposure or symptoms across every sport.');
  if (action === 'separate_sessions') explanations.push('Two different sports create a high structural dose inside a short recovery window, so the lower-priority session should move.');
  if (action === 'redistribute') explanations.push('Cross-sport load is redistributed without removing unrelated training.');
  if (action === 'proceed') explanations.push('No material cross-sport structural conflict was detected in the planning window.');
  return { action, overlaps, adjustments, constrainedRegions, explanations };
}

export function applyCrossSportAdjustmentToExposure(
  exposure: PlannedStructuralExposure[],
  adjustment: CrossSportSessionAdjustment,
): PlannedStructuralExposure[] {
  if (adjustment.action === 'keep' || adjustment.action === 'move') return exposure;
  const scale = adjustment.scale ?? 1;
  return exposure.map((item) => adjustment.protectedRegions.includes(item.region)
    ? { ...item, dose: Number((item.dose * scale).toFixed(2)), rationale: `${item.rationale} Cross-sport adjustment applied.` }
    : item);
}
