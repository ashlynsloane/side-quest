# Training Guardrails: Release QA Matrix

**Status:** integration code committed to draft PR #20. GitHub Actions checks are automated, but a green CI run does **not** certify clinical safety, app-store readiness, real-device behavior, or cross-device synchronization.

## Automated release gate

- `pnpm --dir packages/planner typecheck`
- `pnpm --dir apps/mobile typecheck`
- `pnpm --dir packages/planner test` (including 900 seeded safety invariants)
- `node scripts/audit-training-guardrail-integration.mjs` (cross-route contract)
- Review any failed workflow; do not merge when the latest commit is red or pending.

## Device-level test scenarios (not yet executed)

| ID | Scenario | Expected result |
| --- | --- | --- |
| G01 | Complete scheduled workout and press "I want to do more" | Displays the pause interaction; no additional exercise begins |
| G02 | Record interest in calf raises due to remaining energy | Creates an `urge` event, never a `completed` activity |
| G03 | Reopen after app kill and relaunch | Saved ceiling and recorded load remain intact |
| G04 | Tap Start repeatedly during a slow database query | Only one start authorization runs |
| G05 | Start via quick workout | Routes through guarded preview |
| G06 | Start via favorite workout | Routes through guarded preview |
| G07 | Join, mark ready, and start shared workout | Every participating athlete receives their own readiness decision |
| G08 | Finish shared session, force quit during save, reopen | Reconciliation reconstructs correct ledger-linked load without duplicates |
| G09 | Complete workout then attempt second planned session before rechecking | Requires an updated post-exposure recovery observation |
| G10 | Update only Achilles recovery | General/upper-back last-observed timestamps remain unchanged |
| G11 | Report worsening upper-back pain | Relevant workouts do not receive an automatic allowance |
| G12 | Report urgent concern | Start is blocked without a normal override option |
| G13 | Set "unable to train" after an earlier normal check-in | Existing ceiling cannot override the active pause |
| G14 | Start more work after today's budget is exhausted | No automatic authorization |
| G15 | Edit plan to add more strength mid-day | Previously approved ceiling does not expand silently |
| G16 | Move a planned session to another date | The previous date no longer authorizes that session |
| G17 | Reduce a planned session's duration | The reduced dose becomes the maximum allowance |
| G18 | Replace exercise with calf-loading option | Exercise-level muscle/joint inference still detects Achilles involvement |
| G19 | Import same-day cycling before Achilles-related strength | Triggers an overlap review |
| G20 | Import same-day swimming before upper-back strength | Triggers an overlap review |
| G21 | Correct completed workout duration | Previous audit dose is retracted and revised dose is counted once |
| G22 | Delete completed workout | Deleted history does not remain as active budget load after reconciliation |
| G23 | Restore account or change local profiles | Events stay scoped to the correct athlete |
| G24 | Save recovery while a plan is updated concurrently | Latest plan is retained; only explicitly checked recovery fields change |
| G25 | Lose database write permission or fill storage | App reports failure; no false "saved" state or inferred completion |
| G26 | Complete a workout at 11:59 pm, reopen after midnight | Local dates and histories remain consistent |
| G27 | Change device timezone while events are pending | No unreviewed load increase from a timezone mismatch |
| G28 | Verify data export and deletion | Guardrail records follow local privacy controls |
| G29 | Shared workout history already saved under idempotency key | Retry verifies the existing workout rather than fabricating a second |
| G30 | Manually log strength after an earlier workout | Ledger reconciliation accounts for the extra exposure before another start |

## Behavioral acceptance criteria

1. The UI must not imply that an unused budget must be spent.
2. "Feeling energetic" is neither clinical clearance nor evidence of adaptation.
3. Prescribed workouts, training urges, and assessment events must never count as performed exercise.
4. All warnings identify which evidence triggered the decision.
5. Exceptions remain user-controlled and recorded; explicit red flags and active training pauses are not bypassable through ordinary UI.
6. Pain from distinct body regions is not merged into a generic positive readiness signal.
7. Estimated duration is labeled as estimated; actual logged sets remain authoritative when available.
8. Recording motivation/urge is never framed as misconduct or a psychiatric finding.

## Unresolved architectural limitations

- **No true cross-device atomic lock or synchronization:** a second device can hold stale daily limits.
- **No validated tissue-equivalent load model:** same-day cross-sport overlap is a conservative review trigger, not a physiological exposure conversion.
- **No guarantee of complete activity capture:** unlogged manual exercise, walking, and missing imports are unknown.
- **Incomplete prospective clinical validation:** algorithmic decisions and manual rehab rules require external clinical review before medical claims.
- **UI/device tests and offline race scenarios:** this matrix is a test plan, not evidence these cases passed.
- **Existing workout logger estimates duration:** actual elapsed active time may differ from planned duration and completion fraction.
- **System clock anomalies and app/database errors:** verify behavior on real devices before rollout.

**Release recommendation:** keep the PR in draft until G01–G30 are manually or automatically exercised, failures are addressed, and the product explicitly communicates remaining limitations.
