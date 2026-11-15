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

## Stage 2: Read-only readiness and workout-feedback interpretation

`buildDailyFeedbackAdvice` combines the athlete-local daily training review with
the latest recorded difficulty feedback in the displayed week, today's
readiness band, and an active symptom restriction check-in.

Priority order (highest first): active symptom/restriction -> today's
`recover` readiness -> recent `too_hard` feedback or reduced readiness
-> incomplete/unlinked source records -> no usable inputs -> maintain with
review. A `too_easy` workout or high readiness **never** causes automatic
progression. Every response declares `approvalRequired: true` and
`autoChangedSessions: 0`.

The Week screen displays the headline and rationale alongside reconciled
training evidence and links to the existing review tools. It does not write
calendar events, silently alter duration or infer running clearance.

**Limitations:** The feedback source currently describes recorded workout
difficulty, not a comprehensive athlete-wide physiological response. Readiness
bands are self-reported and are not validated injury-risk estimates.
Missing provider sources and missing injury information remain unknown. This
stage is review guidance, **not an independently authorized clinical or
rehabilitation dose prescription**.

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
