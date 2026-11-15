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

## Stage 3: Bounded next-session options (preview only)

The pure planner function `buildDailySessionChoices` selects at most one
upcoming, not-yet-closed strength session in the displayed local training week.
It generates an explicit menu of **hypothetical** choices without changing
the stored workout, the training block, session status, SQLite or scheduling.

- **Active restriction / recovery hold:** only review rest or deferral. Neither
  original full dose nor reduced training is presented as clearance.
- **Reduced readiness / recent too-hard workout:** a provisional 20% shorter
  time cap can be shown **only when duration is finite and at least 20 min**.
  It never increases intensity or prescribes new exercises. The athlete may
  instead review deferral.
- **Source conflicts / missing feedback:** no fabricated numerical reduction.
- **Unrestricted positive feedback:** original plan can be reviewed, but there
  is no additional training or positive-readiness progression.

Preview input validation now fails closed for malformed athlete-local dates, blank session identities, and missing, zero, negative, or non-finite source minutes. Those inputs cannot generate a `keep` or `reduce` dose choice; the current source plan remains unchanged. Regression tests cover these cases. **The new commit's GitHub Actions results have not yet been verified.**

Every `DailySessionChoice` has `requiresAthleteApproval: true`, and the
result has `autoAppliedCount: 0`. The current Week UI **shows** these choices
as explanations but does not provide a misleading `Apply` button.
A future implementation must validate the current owner, plan version,
clinical restrictions, and fresh workout history **again at approval time**,
then persist an auditable decision atomically. That part is **not yet built**.

### Existing adjustment-screen safety

The pre-existing `/session-adjustment` planner now marks **all** proposed
actions as requiring approval, including shorter/easier options. Its UI also
uses local calendar dates rather than UTC-derived dates. Active symptom
restrictions or today's recover-level readiness override user-selected
time/fatigue/preference reasons and return a recovery-only preview.
This is defensive review behavior and does not persist a change.

## Stage 4: Transactional, reversible strength approval journal — backend only

Added platform-neutral `daily-strength-decision-sqlite.ts`, using the
same SQLite driver abstraction as the already verified endurance decision
repository. On the draft branch, the mobile SQLite initialization also creates
`daily_strength_choice_events`, and exposes an athlete-locked **read-only**
history query. There is deliberately **no enabled mobile approval button**.

The new append helper is callable by a future explicitly reviewed mobile
workflow. Inside a SQLite transaction it checks the embedded athlete owner,
the current training block, an exact JSON signature of the original planned
strength session, the still-open session status and local date, and the exact
approved 20% duration reduction (or null duration for deferral). The helper
requires a caller-supplied explicit athlete-confirmation and safety-review
gate, refuses an unresolved prior approval or invalid undo, and appends an
immutable decision rather than changing the generator's source workout.
Restoration appends another event, preserving the full audit.

Tests use **actual file-backed SQLite**, exercising acceptance, restoration,
stale source regeneration, a changed/closed session, wrong athlete, corrupt
audit records, injected rollback, duplicate acceptance, and restart/reopen
durability. No actual athlete files are accessed.

**Write-time safety hardening:** The transaction now re-reads the
active symptom/soreness check-in and the athlete-local day's readiness row.
A persisted active restriction, recover-level readiness, missing/corrupt
readiness, obsolete block or a linked completed workout prevents a reduced
dose or restoration regardless of the caller's proposed safety flag. Deferral
remains auditable without inventing an alternate dose.

**Critical remaining gate:** These checks still do not independently prove
provider/source completeness, an active physical-therapy restriction, the
precise modified exercise-level dose, or clinician-directed return-to-sport
permission. A caller-supplied safety boolean does **not** supply this evidence.
The future mobile approval action must incorporate all pertinent current
constraints and recheck them under the verified athlete before activating an
`Apply` control. Until that is implemented and tested, the write helper
remains inaccessible from the live UI. The effective duration overlay is a planning **limit**, not a
modified exercise program or clinical prescription. In particular, do not
claim that reducing `estimatedElapsedSeconds` alone scales station
durations, sets, repetitions, exercise loading, or tissue stress.

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
