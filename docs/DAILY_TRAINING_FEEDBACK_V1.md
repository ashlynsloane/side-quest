# Daily completed-versus-planned reconciliation — Milestone 1

**Status:** Draft local-first change on PR #12. No installed beta change.

## Implemented

`buildDailyTrainingReview` is a deterministic read-only planner function. It
consumes the same athlete-scoped training-exposure records used in weekly
planning, with an explicit athlete-local date and optional displayed-week range.

- A completion with an explicit `linkedPlanRecordId` supersedes the linked
  planned record, regardless of whether the activity was shorter than proposed.
- An earlier planned session with no **verified explicit completion link** is
  shown as *earlier plan without linked completion*, not asserted as a missed
  workout or a completed zero-minute session.
- Same-day same-sport completions without a canonical link trigger source
  review instead of automatic matching.
- Today's and future planned sessions remain distinct from earlier plans.
- Source coverage remains unverified in the current mobile integration.
- The result explicitly records zero automatically rescheduled sessions.
- This only informs the Week training-evidence card. It does not alter SQLite
  rows, workouts, athlete-selected ceilings, injury restrictions or calendar
  schedules.

## Current limitations

A missing link may reflect a missed workout, an offline workout, a late import,
or a different session. The current evidence cannot distinguish those
possibilities automatically. Likewise, a completion record alone does not
establish that prescribed sets, duration or intensity were fully achieved.
Physical-device acceptance, reliable source imports, and user-reviewed
confirmation remain separate gates.

## Next candidate work (not implemented)

Add explicit athlete confirmation of skipped/moved sessions, plus reviewable
replanning proposals that preserve completed training, original plan
provenance, rest constraints and injury restrictions. Never shift missed volume
into tomorrow by default.
