/**
 * Fail-closed startup policy for a persisted local athlete profile.
 *
 * A populated database without independently verifiable ownership must
 * never be assigned to another account just to finish launching the app.
 * The storage adapter owns all SQLite mutation; this helper never edits
 * profile identity, localStorage, or database bytes on failure.
 */
export type StartupProfile = { id: string };

export type StartupActivationResult<T extends StartupProfile> =
  | { profile: T; recoveryError: null }
  | { profile: null; recoveryError: string };

export function startupDatabaseRecoveryMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/owner|ownership|legacy|unverifiable|verif|migration/i.test(message)) {
    return 'Side Quest could not verify ownership of this device\'s existing training database. Your stored training files were preserved. Do not reinstall or clear app data. Retry opening the database, or request owner-verified recovery.';
  }
  return 'Side Quest could not safely open your local training database. Your stored profile and training files were not intentionally cleared. Retry opening the database; if it still fails, preserve the app data for recovery.';
}

export async function activateStartupProfile<T extends StartupProfile>(
  candidate: T,
  activate: (athleteId: string) => Promise<void>,
): Promise<StartupActivationResult<T>> {
  try {
    await activate(candidate.id);
    return { profile: candidate, recoveryError: null };
  } catch (error) {
    return { profile: null, recoveryError: startupDatabaseRecoveryMessage(error) };
  }
}
