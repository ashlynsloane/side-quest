/**
 * First-week onboarding provenance. A new athlete who has already started
 * first-week generation must not be treated as an established athlete merely
 * because the first write (performance goal) persisted before a later crash.
 *
 * Existing accounts with explicit historical bypass markers retain their
 * current behavior; this is only a guard for newly initiated first-run setup.
 */
export type FirstWeekProgress = {
  completedAt?: string;
  firstRunBypassedAt?: string;
  firstWeekSetupStartedAt?: string;
};

export function mustResumeFirstWeekSetup(progress: FirstWeekProgress): boolean {
  return Boolean(
    progress.firstWeekSetupStartedAt
    && !progress.completedAt
    && !progress.firstRunBypassedAt,
  );
}
