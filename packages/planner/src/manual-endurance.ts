import type { EnduranceActivity, EnduranceIntensity } from '@circuit/domain';

/** A real athlete-entered completed workout, not a scheduled session or invented dose. */
export interface ManualEnduranceInput {
  id: string;
  name: string;
  discipline: 'swim' | 'bike' | 'run';
  localDate: string;
  durationMinutes: number;
  distanceKm?: number | null;
  intensity: EnduranceIntensity;
  recordedAt: string;
}
export function createManualEnduranceActivity(input: ManualEnduranceInput): EnduranceActivity {
  if (!input.id.trim() || !input.name.trim()) throw new Error('Name and record ID required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localDate)) {
    throw new Error('Date must be YYYY-MM-DD.');
  }
  const [year, month, day] = input.localDate.split('-').map(Number);
  const localStart = new Date(year!, month! - 1, day!, 12, 0, 0, 0);
  if (localStart.getFullYear() !== year || localStart.getMonth() !== month! - 1
      || localStart.getDate() !== day) {
    throw new Error('Invalid local workout date.');
  }
  if (!Number.isFinite(input.durationMinutes) || input.durationMinutes <= 0
      || input.durationMinutes > 24 * 60) {
    throw new Error('Enter a completed duration between 1 and 1,440 minutes.');
  }
  if (input.distanceKm !== undefined && input.distanceKm !== null &&
      (!Number.isFinite(input.distanceKm) || input.distanceKm <= 0)) {
    throw new Error('Distance must be positive, or left unknown.');
  }
  if (!Number.isFinite(Date.parse(input.recordedAt))) {
    throw new Error('Invalid recording time.');
  }
  const recorded = new Date(input.recordedAt);
  const recordedCalendarDay = new Date(recorded.getFullYear(), recorded.getMonth(),
    recorded.getDate());
  const chosenCalendarDay = new Date(year!, month! - 1, day!);
  if (chosenCalendarDay.getTime() > recordedCalendarDay.getTime()) {
    throw new Error('A completed workout cannot be recorded on a future date.');
  }
  const seconds = Math.round(input.durationMinutes * 60);
  return {
    id: input.id.trim(),
    source: 'manual',
    externalId: input.id.trim(),
    name: input.name.trim(),
    discipline: input.discipline,
    classification: 'conditioning',
    startAt: localStart.toISOString(),
    startLocal: input.localDate + 'T12:00:00',
    movingTimeSeconds: seconds,
    elapsedTimeSeconds: seconds,
    ...(input.distanceKm == null ? {} : {
      distanceMeters: Math.round(input.distanceKm * 1000),
    }),
    intensity: input.intensity,
    manual: true,
    importedAt: input.recordedAt,
    updatedAt: input.recordedAt,
  };
}
