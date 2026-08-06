export interface WorkoutCuePreferences {
  audioEnabled: boolean;
  hapticsEnabled: boolean;
  finalCountdownEnabled: boolean;
  workCueSeconds: number[];
  restCueSeconds: number[];
}

const STORAGE_KEY = 'side-quest.workout-cue-preferences.v24';

export const DEFAULT_WORKOUT_CUE_PREFERENCES: WorkoutCuePreferences = {
  audioEnabled: true,
  hapticsEnabled: true,
  finalCountdownEnabled: true,
  workCueSeconds: [120, 60, 30, 10],
  restCueSeconds: [15, 5],
};

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function storage(): StorageLike | null {
  const candidate = (globalThis as typeof globalThis & { localStorage?: StorageLike }).localStorage;
  return candidate ?? null;
}

export function getWorkoutCuePreferences(): WorkoutCuePreferences {
  try {
    const value = storage()?.getItem(STORAGE_KEY);
    if (!value) return DEFAULT_WORKOUT_CUE_PREFERENCES;
    const parsed = JSON.parse(value) as Partial<WorkoutCuePreferences>;
    return {
      ...DEFAULT_WORKOUT_CUE_PREFERENCES,
      ...parsed,
      workCueSeconds: Array.isArray(parsed.workCueSeconds) ? parsed.workCueSeconds.filter(Number.isFinite) : DEFAULT_WORKOUT_CUE_PREFERENCES.workCueSeconds,
      restCueSeconds: Array.isArray(parsed.restCueSeconds) ? parsed.restCueSeconds.filter(Number.isFinite) : DEFAULT_WORKOUT_CUE_PREFERENCES.restCueSeconds,
    };
  } catch {
    return DEFAULT_WORKOUT_CUE_PREFERENCES;
  }
}

export function saveWorkoutCuePreferences(preferences: WorkoutCuePreferences): void {
  storage()?.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
