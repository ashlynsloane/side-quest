/**
 * Deterministic synthetic iOS simulator release QA for issue #19.
 *
 * A's completed draft is suspended immediately BEFORE the verified SQLite
 * goal/block transaction. It resumes only AFTER the independently verified
 * B profile has been committed to the local auth store. The UI's identity
 * guard must then discard A's result. This is intentionally impossible to
 * activate from the real beta bundle, even with the same fixture email.
 */
export const SYNTHETIC_RACE_EMAIL = 'synthetic-first-week-race-a@example.invalid';
export const SYNTHETIC_RACE_B_EMAIL = 'synthetic-first-week-race-b@example.invalid';
export const SYNTHETIC_RACE_BUNDLE = 'com.sidequest.synthetic.qa';
export const SYNTHETIC_RACE_B_ID = 'local_' + SYNTHETIC_RACE_B_EMAIL;
export const SYNTHETIC_RACE_MAX_WAIT_MS = 180_000;
const PROFILE_KEY = 'circuit.v12.beta-profile';

export type RaceProfile = { email: string; mode: 'cloud' | 'local' };

export function isSyntheticNativeGenerationRace(
  bundleId: string | null | undefined,
  profile: RaceProfile | null | undefined,
): boolean {
  return bundleId === SYNTHETIC_RACE_BUNDLE
    && profile?.mode === 'local'
    && profile.email.toLowerCase().trim() === SYNTHETIC_RACE_EMAIL;
}

export function readSyntheticLocalProfileId(): string | null {
  try {
    const storage = (globalThis as typeof globalThis & {
      localStorage?: { getItem(key: string): string | null };
    }).localStorage;
    const raw = storage?.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const profile = parsed as Partial<{ id: string; mode: string }>;
    return profile.mode === 'local' && typeof profile.id === 'string'
      ? profile.id : null;
  } catch {
    return null;
  }
}

export async function holdSyntheticFirstWeekBeforePersistence(
  enabled: boolean,
  readActiveProfileId: () => string | null = readSyntheticLocalProfileId,
  options: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<void> {
  if (!enabled) return;
  const pollIntervalMs = options.pollIntervalMs ?? 100;
  const timeoutMs = options.timeoutMs ?? SYNTHETIC_RACE_MAX_WAIT_MS;
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 1
      || !Number.isFinite(timeoutMs) || timeoutMs < pollIntervalMs) {
    throw new Error('Invalid synthetic-only generation race timing configuration.');
  }
  const started = Date.now();
  while (true) {
    // continueLocal activates B's SQLite database BEFORE persisting B here.
    // Therefore observing this exact synthetic identity certifies the
    // ownership switch has completed, without guesses based on elapsed time.
    if (readActiveProfileId() === SYNTHETIC_RACE_B_ID) return;
    if (Date.now() - started >= timeoutMs) {
      throw new Error('Synthetic generation race: verified athlete B did not activate.');
    }
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
