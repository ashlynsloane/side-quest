export type SharedLeaseStatus = 'checking' | 'verified' | 'lost';

/**
 * A globally synchronized room clock is not proof that one athlete trained.
 * Count only elapsed room time after this device verified its remote lease.
 * On lease loss, stop at the last verified point (conservative estimate).
 */
export function authorizedSharedParticipationFraction(input: {
  startsAt: string;
  workoutSeconds: number;
  firstVerifiedAt: number | null;
  lastVerifiedAt: number | null;
  leaseStatus: SharedLeaseStatus;
  now: number;
}): number {
  const beganAt = Date.parse(input.startsAt);
  if (!Number.isFinite(beganAt) || !Number.isFinite(input.workoutSeconds)
      || input.workoutSeconds <= 0 || !Number.isFinite(input.now)
      || input.firstVerifiedAt === null || !Number.isFinite(input.firstVerifiedAt)) {
    return 0;
  }
  const endsAt = beganAt + input.workoutSeconds * 1000;
  const until = input.leaseStatus === 'verified'
    ? input.now
    : input.lastVerifiedAt ?? input.firstVerifiedAt;
  const from = Math.max(beganAt, input.firstVerifiedAt);
  const to = Math.min(until, endsAt);
  return Math.max(0, Math.min(1, (to - from) / (input.workoutSeconds * 1000)));
}
