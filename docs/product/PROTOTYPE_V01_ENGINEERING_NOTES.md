# Prototype v0.1 — implementation notes and experience test gate

**Status:** Isolated interactive browser prototype built and browser-tested on October 29, 2026. **Prototype source and user-specific history are not committed to this public repo.** This file records generalizable design progress only.

## Scope exercised
- **Mobile Today:** illustrative planned workout, clinical uncertainty, direct new-concern intake, rationale and navigation to Rehab.
- **Rehab:** durable-in-session case; actual onset precision (exact day/month/unknown), separate record creation; existing case flares; task-specific dated symptom observations; onset corrections with revision history.
- **Desktop:** shared session state, case workspace, longitudinal event timeline, dated point observations, scoped PT report preview and user-triggered text export.
- **Contrast cases:** simple novice, sudden traumatic fall unrelated to load, postoperative explicit clinical restriction.
- **Explicit limits:** no actual Garmin/TrainingPeaks/medical imports, validated load, pTSS, autonomous diagnosis, treatment prescription, automatic exercise clearance or persistent production database.

## Browser QA completed on stand-alone HTML
- Main scenario: initial Today -> new concern -> month-precision onset -> case details -> clinical update attributed to athlete-relayed assessment -> two dated task-specific observations -> onset revision -> desktop timeline -> PT report/export.
- New case and previous observations remain linked after correction and desktop switch.
- Contrast novice: simulated completed workout distinguishes planned from performed.
- Trauma and postoperative scenarios: prompts remain clinically bounded; no load-risk inference from a fall.
- Both privately seeded and fully sanitized synthetic distributions passed key interaction tests.
- Browser JS syntax validation and Chromium headless tests passed; no page JS exceptions in tested flows; 390px mobile width without horizontal page overflow.
- No `localStorage`, `sessionStorage` or application network API is used in the JavaScript prototype. State is reset on reload.

**Not yet verified:** actual users' unaided navigation and comprehension, Safari/iOS accessibility, keyboard-only experience, clinical review, phone-to-web sync, offline backup and restore, treatment efficacy, chart semantics with sparse/multi-context values. The real Side Quest beta persists data in SQLite; **this design prototype intentionally does not.**

## UX findings from preliminary engineering review
1. A planned workout should clearly say *needs review* when any relevant clinical authority is unverified. The app must not treat all exercise as forbidden by default.
2. Recording an injury requires an *actual onset date with precision*, which may differ from data-entry time; correcting onset must not erase observations.
3. Longitudinal health reports need a real date axis and explicit missingness, not a one-bar pseudo-trend.
4. Existing chronic/persistent conditions must not be lost while logging a new acute event.
5. Desktop and iPhone can present the **same model** very differently; cross-device data synchronization is a separate future systems task.
6. Numeric training exposure and pTSS outputs must not be invented merely to make the UI look complete.

## Next design gate
Conduct an unaided, first-click test of (a) ordinary day with existing concerns and (b) sudden injury on mobile, then review (c) dated timeline and (d) report on desktop. Record task failures and explanations of clinical uncertainty. Revise information architecture before rebuilding Expo screens.

### Privacy boundary
A private, narrative-history design fixture is distributed separately to the athlete as a local downloadable file and must not enter public GitHub. Public designs use non-identifying synthetic fixtures only. Do not attach actual patient charts or raw training exports to issues or PRs.
