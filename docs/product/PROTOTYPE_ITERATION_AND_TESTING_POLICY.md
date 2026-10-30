# Side Quest — Prototype Iteration and User Testing Policy

**Status:** Adopted development-process guideline from direct prototype feedback. No real health data stored in the public repository.

## Problem

Early prototypes v0.1–v0.3 required manually repeating full onboarding, injury entry and navigation to see changes. The athlete was acting as the product designer and the regression test suite simultaneously. This is inefficient and overweights superficial path testing, which automation should cover, at the expense of high-value usability evaluation.

## Policy

**The person reviewing a feature should test the feature, not repeat the entire app setup.**

1. Preserve the test profile and scenario state as an explicit, versioned local checkpoint.
2. Provide deterministic one-click **test shortcuts**: new athlete setup, setup complete/first plan, injury review, unexpected injury, desktop timeline and PT report. These are developer-only controls and are not production UX.
3. Run automated browser and logic regression tests for foundational flows before human review.
4. State precisely **what changed**, **what to click**, and **what decision we need feedback on** in each prototype release.
5. Preserve a separate, fresh onboarding scenario to test end-to-end acquisition at milestones and after significant navigation changes.
6. Use a **complex primary athlete design case** to expose interactions across conditions and training, but run simplified and unrelated contrasting synthetic cases. Personal records must not enter public source control.
7. Do not silently persist sensitive design-case state in browser storage or send it to a server. An optional **user-triggered local checkpoint export/import** is acceptable if the risks are stated.
8. Track tests and known limitations with every build. A browser regression pass is not a clinical approval, accessibility audit or medical data sync test.
9. Issue new product UX changes on an isolated branch. Production iPhone changes happen only after the corresponding interaction contract is validated.

## Preferred feedback loop

```
One specific product question
  -> preloaded scenario / saved checkpoint
  -> automated regression and UI smoke checks
  -> small, focused user review of changed behavior
  -> observations captured as acceptance criteria
  -> iterate only the affected journey
  -> occasional full first-run study
```

### v0.3.1 prototyping tools

A stand-alone local HTML artifact adds **Test shortcuts** with five task states and one explicit local JSON checkpoint format (schema v1). A user can save and later restore the *test state*, including onboarding answers, cases, observations, and current screen. The snapshot can contain sensitive narrative health information and must remain private. Nothing is uploaded or automatically saved.

Automated Chromium checks verified: synthetic week shortcut, 3 example sessions, export state, reset to blank onboarding, restore state, injury review shortcut, desktop timeline/report shortcuts, and absence of JS errors in the tested paths.

### What human input should look like

Instead of: "Please fill out the questionnaire, add an injury, navigate to Reports, then send screenshots."

Say: "Open the **Training week ready** checkpoint and assess (1) whether your next action is obvious and (2) whether the review-needed language communicates uncertainty. No survey or case entry needed."

## Future scaling

As the prototype grows, replace embedded fixture logic and a single large HTML script with a real testable app and separated JSON fixtures. Run route/logic tests, schema migration, accessibility and visual snapshots through CI. Do not introduce a hosted health dataset just for testing convenience.

## Boundary

These tools support **design evaluation**. Long-term storage of personal training and health data requires a separately scoped, reliable, privacy-reviewed persistence solution; a local JSON fixture is not an adequate medical records system.
