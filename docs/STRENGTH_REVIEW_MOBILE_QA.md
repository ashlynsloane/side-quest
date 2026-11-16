# Side Quest — read-only strength review mobile acceptance

**Scope:** Development-only screens `strength-review-inbox` and
`strength-review-detail`. These screens have no executable approval action.
They must not be used as medical advice or as a way to start a generated
workout. PR #12 is a draft and the existing installed beta is not targeted.

## Implementation and evidence

- **Review inbox:** `apps/mobile/src/app/strength-review-inbox.tsx`
  lists athlete-owned, stored unapproved revisions. It uses explicitly
  `unknown` current evidence for symptoms, provider restrictions, readiness
  and source coverage rather than claiming those have been verified.
  Consequently, an old review is presented as needing verification, not as
  safe to execute.
- **Detail:** `apps/mobile/src/app/strength-review-detail.tsx`
  retrieves an exact saved preview and its review journal, validates the
  embedded source/candidate binding, and displays original/proposed duration,
  stations, repetitions, resistance units, removed exercises and historical
  pending/dismissed status. It cannot save, dismiss, restore or approve.
- **Planner:** `summarizeUnapprovedStrengthRevision` checks a complete saved
  source versus proposal before rendering; changed training instructions,
  escalating doses, a spoofed approval flag or binding mismatch block display.
- **Persistence:** The review screens use owner-scoped mobile database reads.
  A synthetic mobile SQLite integration test stores a draft against an actual
  training block and verifies that retrieving it through mobile service
  boundaries neither changes the source plan nor adds accepted decisions or
  workout completions.

The automated GitHub workflow validates planner and mobile TypeScript, full
planner tests, mobile SQLite acceptance and iOS **JavaScript export**. It does
**not** perform native installation, screen navigation, or physical device
interaction.

## Native checks that remain BLOCKING (isolated QA app only)

1. Verify QA app identity and database filename differ from the installed
   Side Quest beta. Do not overwrite the existing app or athlete database.
2. Sign into a synthetic QA athlete, navigate **Profile → Unapproved strength
   drafts**, and verify an empty inbox does not display an approval control.
3. In a QA database with a synthetic saved preview, verify the card title,
   target duration and status. Do not place this fixture into real athlete data.
4. Open a saved preview and compare each shown target, unit, removal,
   resistance and elapsed-time difference with the exact synthetic source.
5. Return to the inbox; verify the prior draft and audit history remain
   unchanged after backgrounding and a cold app restart.
6. Switch between synthetic athlete accounts and confirm that neither account
   can see the other account's review data or history.
7. Deliberately corrupt a synthetic review record and verify a visible,
   blocking error instead of an empty success state or unsafe fallback.
8. Trigger stale state by regenerating the source block, changing symptom
   status and introducing an active PT restriction in the **QA database only**;
   ensure none of these displays a safe or approved message.
9. Check VoiceOver labels, Dynamic Type, long exercise names, scroll
   accessibility and error-state readability on the native device.
10. Inspect all screen actions: only navigation is permitted. No route
    into starting training from a saved exercise-revision draft.
11. Verify no duplicate workout/completion ledger records and no accepted
    strength decision are created merely by opening or closing a review.
12. Re-run the isolated app after forced termination and test startup/profile
    switching without corrupting pending drafts.

**Stop condition:** Any claim that a saved preview is approved, any accidental
workout start, any cross-athlete data leak, or any destructive interaction with
the existing beta is a release blocker.

## Outstanding work beyond UI

- Authenticated evidence source integrations for injury/PT restrictions.
- An athlete-confirmed, exact-candidate executable approval transaction with
  fresh, independent write-time restriction checks and reliable undo.
- Verification of original athlete data backup/recovery and the full physical
  iPhone P01–P15 acceptance suite.
- Explicit owner release authorization.

Do not interpret CI success or read-only visual inspection as satisfaction of
these outstanding gates.
