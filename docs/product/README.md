# Side Quest — Product Blueprint (read here first)

**Status:** Draft v1, October 2026. These are product specifications and low-fidelity interaction sketches, **not app code**. They do not alter a phone install, health records, production configuration, or the independent pTSS research repository.

## Read in this order

1. [Product Blueprint v1](SIDE_QUEST_PRODUCT_BLUEPRINT_V1.md) — North star, desktop vs mobile, product modules, proposed navigation, safety boundaries, technical architecture and now/next/later.
2. [Screen Blueprints](SIDE_QUEST_SCREEN_BLUEPRINTS.md) — Text-first mobile and desktop wireframes, copy/interaction rules, and synthetic-prototype criteria.
3. [User Journeys and Acceptance](SIDE_QUEST_USER_JOURNEYS_AND_ACCEPTANCE.md) — Eight complete workflows and explicit failure/edge cases, with testable acceptance criteria.
4. [Delivery Plan and Gates](SIDE_QUEST_DELIVERY_PLAN_AND_GATES.md) — Audited current capabilities, milestone dependencies, independent workstreams, unresolved choices and definition of done.

## The four decisions that should persist

- **The two experiences have different jobs:** iPhone for daily actions and concise feedback, desktop web for investigation, corrections, deeper analysis and clinician reports.
- **The two intelligence engines have different authorities:** training optimization is subordinate to verified clinical restrictions; PT guidance is bounded by clinician-approved programs and diagnostic uncertainty.
- **pTSS is separate research, not an integration task:** scientific analysis of one athlete's historical data continues independently until results and data quality are validated. No new pTSS metrics, thresholds or predictions are added to the app on this branch.
- **No more screen-first implementation:** complete scenario -> evidence and data contract -> low-fidelity prototype -> usability and safety testing -> implementation -> device/release qualification.

## What we know versus do not yet know

**Supported by repository audit:** the current mobile app already has five tabs, a strength generator, weekly plans, existing readiness and PT restriction surfaces, local SQLite workout records and source integrations. The unmerged rehab draft has demonstrated an on-device observation surviving an app restart, but its user experience and clinical integration remain incomplete.

**Not yet established:** a desktop web app, shared live desktop/mobile data synchronization, a validated virtual PT program registry, reliable multi-device restore, a scientifically calibrated pTSS score, or individualized minimum effective training doses and injury thresholds.

## Next actual output

Create a **synthetic-data-first clickable interaction prototype** that tests the full journey for (1) normal workout, (2) new injury, (3) recurring flare, (4) approved home rehabilitation program, and (5) PT report. Do not expand the iPhone production UI to test a layout hypothesis.

The blueprint should be reviewed and updated from usability evidence; it is not frozen visual design.

## Current working branches

- Stable app baseline: `sq2-experience-rebuild`
- Separate draft rehab implementation: `feat/generalized-injury-engine-v1` (PR #2)
- This documentation-only product design: `docs/side-quest-product-blueprint-v1`

**Privacy:** No real medical records, pTSS research data, personal analytic outputs or credentials belong in these source-controlled docs.
