# Side Quest — Primary Complex Case, Contrast Cases, and Prototype Readiness

**Status:** Design strategy, October 2026. This is a **non-identifying** product specification for public source control; actual athlete health information remains private in the working conversation/files.

## Decision

**Use a complex real athlete's lived experience as the primary workflow anchor, without putting personal health history in public source control.** This exercises multiple simultaneous conditions, recurrent flares, changing clinical instructions, training interruptions, multi-sport records, onset-date corrections, incomplete measurements, and longitudinal function.

**Also test deliberately contrasting synthetic athletes.** A system optimized for one complex user is a strong stress test, but cannot be assumed generalizable for athletes with no injury history, little data, different disabilities, or different medical restrictions.

The personal case is a **design reference**, not a product seed file, not a modeled pTSS dataset, and not a validation claim.

## Phase 01 — Whole user journeys

Build and test *complete workflows* before screens, connecting entry, decision, outcome, persistence and downstream reporting.

| Journey | Critical starting state | End-to-end outcome | Critical failure avoided |
| --- | --- | --- | --- |
| A. Ordinary training day | Planned workout with potentially active/unknown clinical restrictions | Explain, safely review, perform or defer, record actual activity and symptom response | Generic high-intensity recommendation despite unresolved case |
| B. Unexpected injury | New pain/trauma during or following training | Capture actual onset/time precision and mechanism, screen concerning changes, preserve completed exercise data, mark relevant plan for review | Automatic diagnosis or incorrect creation date as onset |
| C. Persistent/recurrent flare | Durable ongoing case, changing symptoms and function | Attach a new episode/event to existing case, preserve authorized activity and historical restrictions | Duplicated injury cases or treating zero pain as the only success |
| D. PT-prescribed home program | Explicit clinician-origin instruction with known/unknown fields | Match reviewed exercises, execute within authorized bounds, record dose and next-day response, preserve clinician source | Invented prescription, silent dose increase or ambiguous exercise identity |
| E. PT follow-up | Actual dated training, symptom, function and clinical changes | Desktop timeline and user-controlled export with axes, provenance, gaps and selected scope | One-bar pseudo-trends, inflated activity totals, automatic sensitive-data sharing |

### Core acceptance criteria

1. **True event date:** `occurred_at` with precision/exactness, `recorded_at), and a durable correction audit are independent.
2. **Multiple conditions:** Independent injury cases and episodes coexist; all applicable restrictions constrain training, without inferring that every activity is forbidden.
3. **Task-specific symptoms:** Rest pain, walking pain, movement-evoked pain and functional capacity are different measures. Missing entries remain missing.
4. **Training provenance:** Planned sessions are not completed sessions, duplicate provider records aren't double counted, and zero/near-zero imported TSS values are not automatically trusted.
5. **Safety boundaries:** High readiness cannot override an active clinical restriction. No unassessed injury gets an autonomous therapeutic exercise protocol.
6. **Continuous workflow:** Onset -> review -> permitted actions -> actual exposure -> response -> history/report must work without losing records.
7. **User comprehension:** A person can identify what is observed, what is estimated, what is a clinician's instruction, and what remains uncertain.
8. **Privacy:** Nothing in the prototype requires uploading personal medical records or raw training history to public infrastructure.

### Contrast scenarios

- **No-injury novice:** No connected wearable or clinical history. The app must not require elaborate rehab onboarding.
- **Single traumatic event:** New functional limitation after a fall, no endurance training. The app must not interpret injury as load-related.
- **Postoperative clinical path:** Explicit hard restrictions and a documented clinician program. Favorable readiness must not override restrictions.
- **Incomplete data case:** Missing check-ins, conflicting provider entries and unmapped exercises. The app must show uncertainty instead of fabricating progress.

## Phase 02 — Mobile / web responsibilities

| User intent | Mobile primary entry | Desktop primary entry |
| --- | --- | --- |
| Understand next training action | Today | Overview |
| Start / adjust / log workout | Today or Train | Training |
| Record new concern immediately | Today -> Report concern | Overview or Rehabilitation |
| Manage a recurring injury | Rehab -> Existing case | Rehabilitation -> Case workspace |
| Follow PT-approved exercises | Today or Rehab -> Approved program | Rehabilitation -> Protocol |
| Interpret a setback and relevant exposure | Rehab -> Summary | Timeline + Rehabilitation |
| Correct historical onset | Rehab -> Case -> Correct | Rehabilitation -> Case revision |
| Prepare clinician visit | Rehab -> Summary/share | Reports -> Preview/export |
| Reconcile sources | You -> Source status | Data & settings / Training |

**Proposed mobile top-level destinations:** Today, Plan, Train, Rehab, You. This is an information architecture hypothesis, not a committed navigation change. Existing Coach information should appear next to relevant decisions instead of requiring a separate tab to learn *why*.

**Proposed web workspace:** Overview, Timeline, Training, Rehabilitation, Reports, Data & settings. Keep deeper analytics inside Timeline/Training initially unless user testing establishes need for a standalone section.

**Web is not equivalent to sync.** A synthetic-data prototype can run in the browser while the actual athlete records remain private on the iPhone. Live cross-device data access requires a separately reviewed export/import or synchronization design.

## Prototype sequence and test gates

**P0.1A — Ordinary day + unexpected injury:** One fictionalized-but-complex athlete profile with multiple recorded concerns, scheduled exercise, a new event, unknown clinical clearance and preserved completed training. No fabricated physiological readings.

**P0.1B — One current session:** Show allowed versus review-needed exercise outcomes, execution logging, and delayed-response capture.

**P0.2 — Persistent flare and PT program:** One durable case with recurrent episodes and an independently authorized rehabilitation plan.

**P0.3 — Desktop timeline and report:** Correct dates, time-aligned training/observations, missingness, and explicit report scope.

**Contrast passes:** Repeat key tasks for the novice, single fall and postoperative scenarios.

### Before production UI code

- Write tasks and expected paths; measure **unassisted** first action, completion, confusion and ability to correct errors.
- Include uncertainty, urgent clinical evaluation and no-data states, not just a happy path.
- Verify simulated state remains coherent across navigation and actions.
- Don't present a mock pTSS, minimum-effective-dose value, injury percentage or personalized threshold as a real result.
- Do not broaden the beta into production until backend correctness, clinical review, privacy and device backup/restore requirements are satisfied.

## Workstream boundaries

- **Personal pTSS analysis:** remains independent, retrospective and empirical. No data ingestion or threshold integration in this blueprint branch.
- **Side Quest rehab engineering:** remains separately tested in the existing feature branch; the current beta UI is a technical harness, not the design source of truth.
- **Design prototype:** new isolated branch/package, synthetic or explicitly de-identified fixture data, no phone migration and no personal medical history in public code.

## What is intentionally not complete

These are **design-complete drafts**, not validated journeys: no second participant has completed unassisted tests, no clinician has reviewed the proposed safety boundaries, no full web/phone data synchronization exists, and exact private training or medical data have not been verified for use in prototype charts.
