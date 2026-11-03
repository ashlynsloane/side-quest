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

/** Only discrete planning answers are hashed; do not put injury answers in IDs. */
export type FirstWeekAnswers = {
  goal?: string; priority?: string; hours?: string; days?: string;
  equipment?: string; restriction?: string; background?: string;
  runStatus?: string; injury?: string; strength?: string;
};
const ANSWER_FIELDS: ReadonlyArray<keyof FirstWeekAnswers> = [
  'goal', 'priority', 'hours', 'days', 'equipment', 'restriction',
  'background', 'runStatus', 'injury', 'strength',
];
function fnv32(value: string, offset: number): string {
  let hash = offset >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
/**
 * Stable plan identity across app restart and interrupted writes.
 * The start timestamp is saved once when the first-run questionnaire begins.
 * The requested week must be computed from that timestamp, not wall clock
 * time on retry. Two independent hashes reduce accidental ID collisions.
 * No raw answers or health-related strings are written into the seed.
 */
export function firstWeekAttemptSeed(
  answers: FirstWeekAnswers,
  weekStartDate: string,
): string {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(weekStartDate)) {
    throw new Error('Expected an ISO training week start date.');
  }
  const canonical = JSON.stringify(ANSWER_FIELDS.map((key) => [
    key, answers[key] ?? '',
  ]));
  return 'onboarding-first-week-v2-' + weekStartDate + '-' +
    fnv32(canonical, 2166136261) + fnv32(canonical, 0x9e3779b9);
}
