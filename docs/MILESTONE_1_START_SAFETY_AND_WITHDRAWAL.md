# Milestone 1 — Routine strength withdrawal and pre-start screening

**Status:** Source implementation on isolated draft PR #12. NOT a native workout start gate, release clearance, clinician approval, or a change to the installed beta.

## Implemented boundaries

The athlete may explicitly authorize an immutable routine-training strength candidate only after the existing atomic review transaction. The source workout and actual execution ledger stay unchanged. Two additional backend capabilities now exist:

1. **One-way withdrawal transaction.** An athlete can explicitly withdraw a specific authorization using its exact ID. The transaction verifies the athlete-owned database, original immutable authorization and absence of an earlier withdrawal, then appends one immutable event in the strength_workout_authorization_withdrawals table. Duplicate, wrong owner, missing consent, invalid ID, corrupt audit or SQL failure aborts without erasing the original record. Withdrawal does not delete training already performed. A fresh authorization may not silently replace the revoked one.
2. **Fresh, non-executable pre-start inspection.** The backend reads a single consistent SQLite snapshot of the authorized preview, withdrawal journal, planning source, today's readiness and symptom rows, completed-session links, safety context and restrictions. It holds when authorization differs, was withdrawn, source/constraints drift, the plan is no longer reviewable, an applicable restriction appears, or the planned date is not **today's local day**. The status eligible_for_atomic_start_gate is a diagnostic, **not permission for workout playback**. Player-start authorization and workout-started indicators are always false.

The athlete-scoped mobile data service exposes these functions but intentionally does not call them from the live workout player. A consent withdrawal does not itself cancel an already-running workout. Those execution controls require a separate native transaction and player integration.

## Database and backup

- New table: strength_workout_authorization_withdrawals with one withdrawal per original authorization ID, immutable event JSON, timestamp and athlete/session identity.
- Included in the profile SQLite initializers, local export roster and mandatory critical-audit-export set. Export failure cannot silently omit withdrawal history.
- No destructive migration, production data edit, cloud migration, existing workout mutation or automatic workout start.
- Historic rows are read through an owner-verified snapshot. Corrupt/mismatched JSON fails closed rather than being treated as no withdrawal.

## Synthetic regression expectations

The real disk-backed SQLite acceptance suite now covers:
- Same-day routine authorization reaches pre-start inspection but never creates a workout or authorizes playback.
- Future-dated and previous-day evidence blocks.
- Explicit withdrawal preserves original consent, survives a close/reopen cycle, and disqualifies later start inspections.
- Duplicate withdrawal, wrong athlete, wrong authorization, missing snapshot and damaged withdrawal audit fail closed.
- New readiness deterioration, symptoms, rehabilitation intent and changed plan block inspection.
- Injected write failures leave no partially committed withdrawal and permit clean retry.

These are regression scenarios, not evidence that an iPhone has executed the new path. Only count them as PASS after exact-head CI results are green.

## Remaining release gates

1. **Atomic native start transaction:** The player must re-read restrictions, authorization, withdrawal, workout version and current-day evidence under the same locked transaction that records the start. A prior screen result must never grant execution after evidence changes.
2. **Active-player revocation and recovery:** Define what happens if withdrawal occurs while the athlete has a paused/running workout, including explicit stop behavior, crash recovery and immutable observed dose.
3. **Authoritative provider integration:** External provider records and source-coverage claims cannot be inferred from local fields or caller-supplied booleans; rehabilitation, restricted movements and return-to-sport remain outside routine athlete-only approval.
4. **Device release acceptance:** Isolated signed physical-iPhone P01–P15, actual data-ownership/migration determination and verified rollback/restore; explicit release-owner signoff.
5. **UI and accessibility:** Explicit withdrawal confirmation, view of retained audit history, fresh start-screen feedback and recovery from a refused start. Do not expose a Start button by consuming the current read-only result.

Keep PR #12 draft/unmerged and separate from cloud PR #20 and the installed beta.
