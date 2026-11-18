/**
 * Product-scope gate for the first solo-athlete Side Quest release.
 *
 * Workout Together is intentionally NOT part of Milestone #1. This is a
 * build-time source constant, not an athlete preference or a remotely
 * controlled kill switch. Keep the existing shared workout code/data intact
 * for the later milestone; no existing invitations, rooms or workout records
 * are mutated when the feature is deferred.
 *
 * Keep all direct Expo route surfaces gated, including deep links, and all
 * entry actions hidden. Do not change this to true without separate signed
 * device acceptance of shared progress recovery, athlete restrictions,
 * crash handling, remote state, and data isolation.
 */
export const MILESTONE_1_WORKOUT_TOGETHER_ENABLED = false;
