/**
 * An opt-in *synthetic simulator only* interruption seam for verifying
 * athlete switching during a completed-but-not-yet-persisted first-week
 * generation. This module does not expose the option in beta builds.
 *
 * Live beta bundle IDs can never satisfy the synthetic bundle guard,
 * even when an athlete happens to type the QA fixture email.
 */
export const SYNTHETIC_RACE_EMAIL = 'synthetic-first-week-race-a@example.invalid';
export const SYNTHETIC_RACE_BUNDLE = 'com.sidequest.synthetic.qa';
export const SYNTHETIC_RACE_HOLD_MS = 75_000;

export type RaceProfile = { email: string; mode: 'cloud' | 'local' };

export function isSyntheticNativeGenerationRace(
  bundleId: string | null | undefined,
  profile: RaceProfile | null | undefined,
): boolean {
  return bundleId === SYNTHETIC_RACE_BUNDLE
    && profile?.mode === 'local'
    && profile.email.toLowerCase().trim() === SYNTHETIC_RACE_EMAIL;
}

export async function holdSyntheticFirstWeekBeforePersistence(
  enabled: boolean,
  delayMs: number = SYNTHETIC_RACE_HOLD_MS,
): Promise<void> {
  if (!enabled) return;
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}
