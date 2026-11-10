import 'expo-sqlite/localStorage/install';

import {
  releaseCloudWorkoutLease,
  validCloudWorkoutLease,
  type CloudWorkoutLease,
} from './cloud-workout-coordination';

const PREFIX = 'sidequest.shared-workout.lease.v1';

function key(athleteId: string, roomId: string): string {
  if (!athleteId.trim() || !roomId.trim()) {
    throw new Error('Shared workout lease requires athlete and room IDs.');
  }
  return `${PREFIX}:${encodeURIComponent(athleteId)}:${encodeURIComponent(roomId)}`;
}
type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
function storage(): StorageLike {
  const store = (globalThis as typeof globalThis & { localStorage?: StorageLike }).localStorage;
  if (!store) throw new Error('Shared workout lease storage is unavailable.');
  return store;
}

export function loadSharedWorkoutCloudLease(
  athleteId: string, roomId: string,
): CloudWorkoutLease | null {
  const raw = storage().getItem(key(athleteId, roomId));
  if (!raw) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch {
    throw new Error('Saved shared workout lease is unreadable.');
  }
  if (!validCloudWorkoutLease(parsed)) {
    throw new Error('Saved shared workout lease is invalid.');
  }
  return parsed;
}

export function storeSharedWorkoutCloudLease(
  athleteId: string, roomId: string, lease: CloudWorkoutLease,
): void {
  if (!validCloudWorkoutLease(lease) || Date.parse(lease.expiresAt) <= Date.now()) {
    throw new Error('Cannot save an invalid or expired shared workout lease.');
  }
  const previous = loadSharedWorkoutCloudLease(athleteId, roomId);
  if (previous && (previous.leaseId !== lease.leaseId
      || previous.deviceId !== lease.deviceId)) {
    throw new Error('Another shared workout lease is already saved for this room.');
  }
  if (previous && Date.parse(previous.expiresAt) > Date.parse(lease.expiresAt)) {
    return;
  }
  storage().setItem(key(athleteId, roomId), JSON.stringify(lease));
}

export async function clearSharedWorkoutCloudLease(
  athleteId: string, roomId: string,
): Promise<void> {
  const previous = loadSharedWorkoutCloudLease(athleteId, roomId);
  storage().removeItem(key(athleteId, roomId));
  if (previous) {
    // Unavailable backend cannot extend the lease; the server expires it.
    await releaseCloudWorkoutLease(previous).catch(() => undefined);
  }
}
