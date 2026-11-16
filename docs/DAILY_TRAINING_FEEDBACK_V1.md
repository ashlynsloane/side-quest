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

**Unknown or expired symptom status fails closed:** A missing active training check-in is not equivalent to an explicit `normal` symptom status. The SQLite strength reduction/restoration path now requires an active, readable check-in confirming normal status with an unexpired `activeUntil` timestamp; a missing check-in blocks new dose decisions and restoring an earlier deferral. Recording a deferral remains possible without asserting exercise clearance. Synthetic SQLite regressions cover the unknown state. This does not establish provider/PT completeness or make the approval UI available.

**Audit and execution provenance hardening:** Read-back now verifies that each event JSON's ID and timestamp match the corresponding persisted SQLite row. A mismatch is treated as corrupted audit history, blocking a subsequent append. The read-only effective-choice result explicitly declares `executableWorkoutModified: false` and `requiresExerciseLevelReview: true`, including when a valid 20% planning-time limit is present. These fields must not be interpreted as completion of exercise-level review or clinical clearance. Synthetic file-backed SQLite tests cover row tampering and the unchanged workout payload.

## Stage 5: Exercise-level structural revision review (backend only)

Added `evaluateStrengthWorkoutRevision` as an isolated, read-only guard for a *separately constructed* candidate strength workout. It compares actual proposed station durations and exercise targets/loads against an original source workout and rejects increased duration, additional stations/exercises, changed prescriptions, equipment, exercise snapshots, changed generator constraints, invalid durations and missing/duplicated identities. It also checks a proposed elapsed-time cap against the candidate's actual station and rest-time accounting. Synthetic regression tests cover reductions, hidden dose increases, substitutions, tampered constraints and malformed structures.

A `structurallyValid: true` result means only that this limited data-structure comparison passed; it does **not** mean the exercise is safe or medically appropriate. Every result includes `requiresCurrentRestrictionReview: true` and `autoApproved: false`. This is **not connected to the mobile approval UI or the SQLite decision append**. There is no executable exercise-level approval, automatic training change, provider restriction reconciliation, or release authorization. Those require independent validation of current injury/rehab restrictions and explicit athlete review at write time.

## Stage 6: Cross-check preview decision against exercise and evidence (read-only)

The exported `reviewStrengthRevisionForDecision` composes the source-session signature, proposed action and bounded duration, independent exercise-structure review, athlete identity, session date/status, and explicit completeness of symptom, readiness, provider-restriction and training-history inputs. Missing, incomplete, stale or active restriction evidence blocks the *reviewable* designation. The regression suite covers ownership mismatch, regeneration, malformed dates, missing candidate, invalid dose, symptoms, low readiness, incomplete coverage and exercise escalation.

This is deliberately a **read-only preflight**, not a trusted approval endpoint. Even `status: 'reviewable'` returns `executableWorkoutApproved: false`, `requiresAthleteApproval: true` and `requiresWriteTimeRevalidation: true`. The `CurrentStrengthReviewEvidence` arguments are caller-supplied and therefore **cannot establish actual source completeness or PT clearance**. The existing SQLite append does not yet invoke this helper, and an approval button must not be enabled on its basis. The next integration must resolve authoritative evidence from the athlete-owned database/providers and recheck the same constraints atomically with writing a versioned exercise-level proposal.

## Stage 7: Transactional PT-profile restriction gate (backend only)

The SQLite decision transaction now re-reads the most recently stored `pt_profiles` record before appending any reduced-dose acceptance or restoring a previous decision. An **absent, malformed, incomplete or active** PT profile blocks both paths, including when the caller supplies `safeToReview: true`. Append-only deferral remains available without suggesting exercise clearance. Synthetic file-backed SQLite tests verify denied writes, unchanged audit history, and deferral behavior for these four cases.

A stored `active: false` profile means only that this particular in-app profile is inactive; it **does not independently prove the athlete has no external restrictions**. The helper does not yet reconcile clinician data or authorize an executable workout. The UI remains read-only, and physical-iPhone and original-data acceptance gates are still outstanding.

## Stage 8: Exact-source exercise preview identity (read-only)

Added `createStrengthRevisionPreviewBinding` and `verifyStrengthRevisionPreviewBinding`. A reviewable candidate is associated with the exact serialized source session, proposed exercise-level workout, decision event, athlete/block/session identity and review evidence. Reopening the preview with different exercise targets, changed source provenance, a different decision ID, changed evidence or injected binding metadata invalidates the prior review. Tests exercise intact previews, source regeneration, exercise mutation, changed provider/history evidence and tampering.

These JSON identities are **exact-match stale-detection values, not cryptographic signatures or independently authenticated evidence**. This module **does not save a revision, update SQLite, confer provider clearance, start a workout or create a user-facing approval button**. The actual persist-and-execute flow still requires durable candidate storage, authoritative source reconciliation and atomic write-time revalidation before release.

## Stage 9: Durable unapproved exercise revision previews (SQLite, draft only)

Added `strength_revision_previews` as a separate append-only athlete-scoped SQLite table. It stores a full candidate workout, the exact source/decision/evidence preview binding, and an explicit `status: 'unapproved'` / `executableWorkoutApproved: false` marker. `appendStrengthRevisionPreview` verifies embedded athlete owner, latest source block/session/signature, source session status, no linked completed workout, the bounded exercise-level proposal and **current persisted** symptom, readiness and latest PT-profile evidence inside one SQLite transaction. Missing or invalid in-app evidence, active symptoms, recover readiness and active PT restrictions block creation. The table has no link to workout execution or the accepted strength decision journal.

`readStrengthRevisionPreview` checks the SQLite row metadata against its JSON identity and fails closed on corruption. `reassessStoredStrengthRevisionPreview` re-reads current source/workout completion and persisted symptoms, readiness and PT status, marking stale or changed candidates unavailable for further review. Neither function claims an independently verified outside-provider record: the original review's source coverage and clinician assertions are still caller-supplied, and an inactive in-app PT profile alone is **not** a medical clearance.

The draft mobile database initializes this table, includes it in local data export/deletion, and exposes only an athlete-locked **read-only** preview fetch; there is no UI creation/approval or workout modification. Synthetic tests use an actual file-backed SQLite database to cover writes, restart/reopen, owner isolation, stale plan, completion collision, missing/changed health evidence, malformed payloads, duplicates and rollback. Integration tests exercise the mobile database table and absence of accepted strength decisions. Physical device verification, provider/source completeness, an independent write-time executable approval gate, and recovery of any legacy athlete data remain unresolved. **Do not treat saved previews as accepted strength plans or workout prescriptions.**

## Stage 10: Immutable snapshots and audit-safe export (draft only)

The preview append now makes a JSON-value snapshot **before** any asynchronous SQLite access. The exact binding is recalculated and compared after copying; the resulting frozen-by-value payload is serialized once, so mutations to caller-owned UI objects while writes are in flight cannot silently change the stored candidate, decision or review evidence. A synthetic transaction-interleaving test confirms that a late, unsafe caller edit does not alter the persisted review snapshot.

The mobile local-data export/deletion registry now includes all relevant append-only journals: `training_plan_adjustment_events`, `daily_strength_choice_events`, `training_baseline_review_events`, and `strength_revision_previews` (plus the existing training adjustment history). Critical journal export errors now **abort the export**, instead of substituting an empty list; critical journal deletion errors **abort and roll back** the database transaction rather than reporting success with undisclosed records. A synthetic mobile SQLite test intentionally drops a journal table and verifies export failure and deletion rollback without losing the preexisting generated training block.

These safeguards improve local data durability and truthful error reporting, but neither CSV/JSON export nor test-driven rollback proves real-device backup/restore safety. Real athlete data migration and physical iPhone acceptance are separate release gates.

## Stage 11: Append-only preview disposition and safe review inbox (backend/read-only mobile)

Added `strength_revision_preview_review_events` as an independent athlete-owned SQLite journal of **dismiss** and **restore-to-pending** transitions for the *unapproved preview*, never the workout. The initial state is `pending_review`. Dismissal is permissible even after plan regeneration or new symptoms, because it authorizes no training. Restoration was originally constrained to fresh review evidence, but the Stage 13 design explicitly separates **returning draft visibility** from **exercise eligibility**. Restoration still requires the most recent state to be dismissed and the exact bound preview identity, while the independent read-only reassessment continues to report a stale proposal as stale. Neither disposition authorizes exercise.

Each event is bound to the exact serialized preview identity, row ID, athlete, timestamp and action. The reader validates every historical transition and fails closed for corrupted JSON, mismatched identity, overlapping dismissals or orphaned restorations. Failed writes roll back without editing the original preview or the training decision journal. File-backed synthetic SQLite tests cover restart, dismissal/restoration, active or changed restrictions, stale regenerated source, corrupt history, wrong owner and injected write failure.

Added `listUnapprovedStrengthReviewInbox`, a bounded (1–50 records), owner-verified, newest-first, **read-only** query. Every preview and event history must be readable; the inbox never silently hides corrupted records. It reports `needs_review`, `dismissed` or `stale`, with explicit stale reasons and `executableWorkoutApproved: false` for every item. A dismissed preview can simultaneously be stale; both facts remain visible.

The draft mobile database now creates and exports the new journal, includes it in critical audit deletion/backup failure handling, and exposes athlete-locked **read-only** retrieval and inbox functions. The UI originally exposed no disposition writes; Stage 13 adds only the explicitly confirmed dismiss/restore-to-inbox controls, never workout execution. Any 'needs_review' status is not exercise clearance or provider verification; the final confirmation transaction, trusted external medical information, full original-data recovery testing and physical iPhone acceptance are still missing.

**Audit-chain defense:** The existing strength decision history reader now rejects impossible accepted/restored sequences, mismatched restoration payloads and malformed event timestamps, instead of treating individually well-formed rows as a valid audit history. Existing effective workout overrides remain planning metadata only.

## Stage 12: Conflicting decisions and canonical audit timestamps

Preview creation and read-only reassessment now consult the existing **validated** strength planning-decision journal. A currently accepted planning choice for the same athlete, block and session blocks a competing new exercise preview and marks an older preview stale. Corrupted planning history is not treated as empty; read failure blocks preview creation. Real SQLite tests cover conflicts both before and after preview creation, and an unreadable existing audit.

Strength decision writes now require a canonical, valid UTC event timestamp before inserting any audit row. The history reader uses the same validation, including rejecting impossible calendar dates that native date parsers would normalize. Synthetic tests cover malformed dates, noncanonical offsets and event histories.

These checks prevent misleading parallel review states; they **do not** merge a planning-minute choice with an executable revised workout or certify clinical clearance. Real write-time exercise approval remains a separate, intentionally disabled release gate.

## Stage 13: Athlete-controlled draft disposition without exercise authorization

The strength-review detail screen now permits an explicit, confirmed **Dismiss draft**
or **Return draft to inbox** action. These events change only the visibility
status of a stored **unapproved** workout candidate. A restored draft may
still be **stale** because of changed symptoms, readiness, PT restrictions,
source plans or completion records; restoration cannot mark it safe, change
the original workout, modify the strength-choice journal or authorize exercise.

The native mobile service keeps the athlete database activation lock while
preparing and committing an event. It reads the bound preview, constructs an
append-only event, and validates the athlete identity, exact binding, full
history, allowable transition and **last-seen event ID** inside one dedicated
`withExclusiveTransactionAsync` SQLite transaction. Missing exclusive
transaction support fails closed; stale-screen actions are rejected even after
an intervening dismiss/restore sequence returns to the same state.
The native transaction handle is used for every read and write, avoiding
interleaving through the ordinary connection-level async transaction API.

Synthetic file-backed and mobile SQLite tests cover dismiss/restore, stale
drafts remaining stale, optimistic concurrency mismatch, invalid ownership,
restart recovery, injected write failure and rollback, and unchanged
workout/completion journals. These are **not** physical-device UI acceptance
or clinical clearance. No executable strength-confirmation endpoint or
automatic training progression has been exposed.

## Stage 14: Structured approval-prerequisite report (diagnostic only)

`inspectStrengthApprovalPreflight` now produces twelve stable, typed review
gates from a single athlete-owned, read-only SQLite snapshot. These include
exact source/version, structural exercise-dose comparison, linked completion,
conflicting planning decision, dismiss/restore disposition, active symptoms,
same-day readiness, and latest in-app PT-profile status. Every local check has
a concrete evidence explanation, and failures remain visible even when a draft
can be reopened for organizational purposes.

Separate, permanently blocking gates represent **independent provider
restriction verification**, **authoritative training-source coverage**,
**explicit executable-workout consent**, and **atomic executable approval**.
They are intentionally not inferred from caller-supplied `verified_none`,
`sourceCoverage: complete`, or `pt.active: false`. This read-only diagnostic
**always** returns `executableWorkoutApproved: false`,
`canConfirmExecutableWorkout: false` and
`requiresIndependentProviderVerification: true`.

The mobile review-detail screen renders every gate and its explanation rather
than a misleading generic "safe" label. Real file-backed SQLite tests cover
local data gaps, active restrictions, lower readiness, source regeneration,
completed-session conflict, dismissed drafts, and the unimplemented approval
boundary. The mobile SQLite acceptance test verifies that a dismiss/restore
cycle cannot unlock executable exercise. Neither the number of passing local
checks nor the presence of a preview constitutes clearance; original-data
migration and physical iPhone acceptance remain separate release gates.

## Stage 15: Unverified restriction and training-source provenance (risk-only intake)

Added `strength_evidence_provenance_events`, an independent athlete-owned
append-only SQLite journal for **unverified source claims** attached to an
exact saved strength-revision preview. Records distinguish possible
provider/exercise restrictions from incomplete training/injury data.
A source may be a self-report or a document/integration **reference**;
neither the presence of a reference nor a saved `reported_none` statement
authenticates a clinician, completes a training-data sync, or clears exercise.

New events carry source/type, observed and recorded UTC dates, optional
expiry, fixed `verification: 'unverified'`, fixed
`executableWorkoutApproved: false`, exact preview binding, athlete identity,
and a last-seen-event optimistic concurrency check. All readbacks enforce
row-to-JSON identity, valid timestamps, exact allowed schema, and source
ownership. Contradictory restriction reports remain unresolved even if a later
unverified `reported_none` claim appears; old or missing observations never
constitute independently verified evidence.

The mobile review-detail page now offers only two additional **confirmed
risk-reporting actions**: *Flag an exercise restriction* and
*Flag missing training history*. Neither action records no-restriction,
confirms coverage, changes training, or unlocks workouts. Each writes through
the athlete-locked exclusive SQLite journal, then refreshes the read-only
review. Draft detail, inbox and 12-gate preflight all mark these concerns as
blocking or stale while continuing to report independent clinician/source
verification as absent.

Synthetic file-backed and mobile SQLite tests cover self-reports,
contradictory claims, obsolete references, owner mismatch, forged verification
metadata, missed/duplicate updates, restart recovery, transaction rollback,
critical export/deletion failure, and unchanged exercise/decision journals.
These tests do not establish medical authority or real-device readiness.
The executable approval transaction remains intentionally unimplemented.

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
