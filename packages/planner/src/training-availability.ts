export type TrainingAvailabilityDiscipline = 'swim' | 'bike' | 'run' | 'strength';
export type TrainingDayPart = 'morning' | 'midday' | 'evening' | 'any';
export type TrainingAvailabilitySource = 'recurring' | 'exception' | 'manual';

export interface TrainingAvailabilityWindow {
  id: string;
  date: string;
  startsAt: string;
  endsAt: string;
  /** Local wall-clock minutes after midnight; retained so scoring is timezone-safe. */
  localStartMinutes: number;
  localEndMinutes: number;
  source: TrainingAvailabilitySource;
}

export interface TrainingTimePreference {
  discipline: TrainingAvailabilityDiscipline;
  preferredWeekdays?: number[]; // Monday = 0 ... Sunday = 6.
  preferredDayPart?: TrainingDayPart;
}

export interface TrainingScheduledOccupancy {
  startsAt: string;
  endsAt: string;
}

export interface TrainingAvailabilityPlacement {
  windowId: string;
  startsAt: string;
  endsAt: string;
  localStartMinutes: number;
  localEndMinutes: number;
  preferenceScore: number;
}

const SLOT_STEP_MINUTES = 30;

export function findTrainingAvailabilityPlacements(input: {
  date: string;
  durationMinutes: number;
  discipline: TrainingAvailabilityDiscipline;
  windows: TrainingAvailabilityWindow[];
  occupied?: TrainingScheduledOccupancy[];
  preference?: TrainingTimePreference;
  minimumGapMinutes?: number;
}): TrainingAvailabilityPlacement[] {
  const duration = Math.max(1, Math.round(input.durationMinutes));
  const occupied = input.occupied ?? [];
  const gapMs = Math.max(0, Math.round(input.minimumGapMinutes ?? 0)) * 60_000;
  const weekday = weekdayIndex(input.date);
  const placements: TrainingAvailabilityPlacement[] = [];

  for (const window of input.windows.filter((candidate) => candidate.date === input.date)) {
    const windowStart = Date.parse(window.startsAt);
    const windowEnd = Date.parse(window.endsAt);
    if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart) continue;
    if (window.localEndMinutes - window.localStartMinutes < duration) continue;

    const latestStartMinutes = window.localEndMinutes - duration;
    const startMinutes = candidateStartMinutes(window.localStartMinutes, latestStartMinutes, input.preference?.preferredDayPart);
    for (const localStartMinutes of startMinutes) {
      const offsetMinutes = localStartMinutes - window.localStartMinutes;
      const startsAtMs = windowStart + offsetMinutes * 60_000;
      const endsAtMs = startsAtMs + duration * 60_000;
      if (endsAtMs > windowEnd + 1) continue;
      if (occupied.some((item) => conflictsWithGap(startsAtMs, endsAtMs, item, gapMs))) continue;

      placements.push({
        windowId: window.id,
        startsAt: new Date(startsAtMs).toISOString(),
        endsAt: new Date(endsAtMs).toISOString(),
        localStartMinutes,
        localEndMinutes: localStartMinutes + duration,
        preferenceScore: preferenceScore(input.preference, weekday, localStartMinutes),
      });
    }
  }

  return dedupePlacements(placements).sort((left, right) =>
    right.preferenceScore - left.preferenceScore
      || left.localStartMinutes - right.localStartMinutes
      || left.startsAt.localeCompare(right.startsAt));
}

export function trainingDayPart(localMinutes: number): Exclude<TrainingDayPart, 'any'> {
  if (localMinutes < 11 * 60) return 'morning';
  if (localMinutes < 16 * 60) return 'midday';
  return 'evening';
}

export function weekdayIndex(date: string): number {
  const value = new Date(`${date}T12:00:00Z`).getUTCDay();
  return (value + 6) % 7;
}

function preferenceScore(
  preference: TrainingTimePreference | undefined,
  weekday: number,
  localStartMinutes: number,
): number {
  if (!preference) return 0;
  let score = 0;
  const preferredDays = preference.preferredWeekdays ?? [];
  if (preferredDays.length) score += preferredDays.includes(weekday) ? 18 : -4;
  const preferredPart = preference.preferredDayPart;
  if (preferredPart && preferredPart !== 'any') score += trainingDayPart(localStartMinutes) === preferredPart ? 14 : 0;
  return score;
}

function candidateStartMinutes(start: number, latest: number, preferredPart: TrainingDayPart | undefined): number[] {
  if (latest < start) return [];
  const values = new Set<number>();
  values.add(start);
  values.add(latest);
  const firstGrid = Math.ceil(start / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
  for (let minute = firstGrid; minute <= latest; minute += SLOT_STEP_MINUTES) values.add(minute);

  const anchor = preferredPart === 'morning'
    ? 7 * 60
    : preferredPart === 'midday'
      ? 12 * 60
      : preferredPart === 'evening'
        ? 17 * 60 + 30
        : undefined;
  if (anchor !== undefined) values.add(Math.max(start, Math.min(latest, anchor)));
  return [...values].filter((minute) => minute >= start && minute <= latest);
}

function conflictsWithGap(
  startsAtMs: number,
  endsAtMs: number,
  occupied: TrainingScheduledOccupancy,
  gapMs: number,
): boolean {
  const occupiedStart = Date.parse(occupied.startsAt);
  const occupiedEnd = Date.parse(occupied.endsAt);
  if (!Number.isFinite(occupiedStart) || !Number.isFinite(occupiedEnd)) return false;
  return startsAtMs < occupiedEnd + gapMs && occupiedStart < endsAtMs + gapMs;
}

function dedupePlacements(values: TrainingAvailabilityPlacement[]): TrainingAvailabilityPlacement[] {
  const byStart = new Map<string, TrainingAvailabilityPlacement>();
  for (const value of values) {
    const existing = byStart.get(value.startsAt);
    if (!existing || value.preferenceScore > existing.preferenceScore) byStart.set(value.startsAt, value);
  }
  return [...byStart.values()];
}
