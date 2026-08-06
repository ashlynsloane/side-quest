import type {
  ProtectedCommitmentConflict,
  ProtectedRecurringCommitment,
  ProposedSchedulePlacement,
  ScheduleProtectionResult,
} from '@circuit/domain';

function minutes(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new Error(`Invalid local time: ${time}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`Invalid local time: ${time}`);
  return hour * 60 + minute;
}

function weekday(localDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) throw new Error(`Invalid local date: ${localDate}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
}

function dateInRange(date: string, commitment: ProtectedRecurringCommitment): boolean {
  return date >= commitment.effectiveFrom && (!commitment.effectiveUntil || date <= commitment.effectiveUntil);
}

export function findProtectedCommitmentConflicts(
  placement: ProposedSchedulePlacement,
  commitments: ProtectedRecurringCommitment[],
): ProtectedCommitmentConflict[] {
  const day = weekday(placement.localDate);
  const placementStart = minutes(placement.localStartTime);
  const placementEnd = placementStart + placement.durationMinutes;

  return commitments.flatMap((commitment) => {
    if (!commitment.weekdays.includes(day) || !dateInRange(placement.localDate, commitment)) return [];
    if (commitment.timezone !== placement.timezone) return [];
    const commitmentStart = minutes(commitment.localStartTime);
    const commitmentEnd = commitmentStart + commitment.durationMinutes;
    const overlapMinutes = Math.max(0, Math.min(placementEnd, commitmentEnd) - Math.max(placementStart, commitmentStart));
    if (overlapMinutes === 0) return [];
    return [{
      commitmentId: commitment.commitmentId,
      placementId: placement.placementId,
      overlapMinutes,
      hardConflict: commitment.immovable,
      explanation: commitment.immovable
        ? `${commitment.title} is athlete-protected and cannot be displaced.`
        : `${commitment.title} overlaps this proposed session and requires review.`,
    }];
  });
}

export function evaluateScheduleProtection(
  placement: ProposedSchedulePlacement,
  commitments: ProtectedRecurringCommitment[],
): ScheduleProtectionResult {
  const conflicts = findProtectedCommitmentConflicts(placement, commitments);
  const hard = conflicts.filter((conflict) => conflict.hardConflict);
  return {
    placementId: placement.placementId,
    allowed: hard.length === 0,
    conflicts,
    requiresAthleteOverride: hard.length > 0,
    explanation: hard.length
      ? ['The proposed session overlaps an immovable athlete commitment.', 'Optimization must choose another open time; it may not silently move the protected commitment.']
      : conflicts.length
        ? ['The placement overlaps a flexible commitment and should be reviewed before scheduling.']
        : ['No protected recurring commitment conflicts with this placement.'],
    auditable: true,
  };
}

export function explainProtectedCommitment(commitment: ProtectedRecurringCommitment): string[] {
  const days = commitment.weekdays.join(', ');
  return [
    `${commitment.title} repeats on weekday values ${days} at ${commitment.localStartTime} for ${commitment.durationMinutes} minutes.`,
    commitment.immovable
      ? 'This is a hard scheduling constraint. The planner must place other workouts around it.'
      : 'This is a preferred commitment. The planner may propose a change but cannot apply it without athlete confirmation.',
  ];
}
