# Prototype v0.2 — training-first design correction

**Status:** design response to user review, October 2026. Prototype is kept separate from production app. Private scenario remains outside public GitHub.

## Issue identified

The original clickable prototype emphasized injury intake and rehab case workspaces but did not include the original Side Quest **first-run athlete training questionnaire**. A new athlete could be shown an illustrative workout without goals, background, equipment, or available time; the product therefore read like a rehabilitation tracker instead of a training-first system with rehabilitation intelligence.

## Design decision

Restore **baseline setup as a first-class user journey** before presenting a tailored plan. Maintain rehabilitation as a contextual, discoverable module rather than the principal content for athletes without active conditions.

**Do not replace the existing mobile onboarding with a generic injury screen.** Its training role remains essential.

## Five-step provisional athlete setup

1. Goal and race/training priority; allow general strength and unspecified goal.
2. Sport background and current running status; background is not proof of current fitness.
3. Weekly time available and days strength can fit; *availability* is not actual recent training load; ask about recent reductions and their reason.
4. Equipment context and strength experience; can be updated later.
5. Relevant active concerns or restrictions, and a complete review. Clinical "none" is self-reported and is not clearance.

**Two different baselines:** Questionnaire is athlete **self-report for provisional planning**; physiological/training baseline requires verified workout and performance evidence. Never confuse the two.

After setup the prototype may show **provisional training structure** and self-entered availability, but must not pretend to have calculated workout dose, pTSS, a personal maximum training threshold, or clinician-authorized exercise loading. Actual plan generation and clinical validation belong to later engineering.

## Information architecture change

- **Mobile Today:** training goal/capacity and primary workout activity, with clinical restrictions only when relevant. No elaborate rehab feed for a new athlete with no reported condition.
- **Mobile Plan/Train:** work from the configured goal, schedule and experience; distinguish planned intent from actual completed sessions.
- **Rehab:** remain independently discoverable for a new concern, flare, authorized program, or longitudinal history.
- **Mobile You and desktop Overview/Training:** show/edit training baseline.
- **Desktop Timeline/Reports:** complex analysis still available, but not the primary user journey on first use.

## Browser prototype work

An isolated self-contained HTML v0.2 has been created in the user's private working deliverables, **not committed into public source code**. It includes the five-step questionnaire with editable in-memory state, training-first Today and Plan pages, novice scenario auto-onboarding, existing injury history, and desktop reporting.

Automated Chromium tests checked: initial absence of a fake pre-baseline training recommendation; five-step survey with athlete-selected answers; provisional planning afterward; a new injury with actual onset precision; symptom capture; onset correction; desktop timeline/report; novice setup; no unexpected browser JavaScript errors; no mobile horizontal overflow. These are functional checks, **not usability validation by an unaided athlete or a clinical review**.

## Follow-up design tests

- First-time athlete: find the questionnaire and see the training plan without completing injury history.
- Existing athlete: review current goals/schedule without having to re-enter established data.
- Multisport athlete with active/recurrent conditions: training-first daily plan acknowledges unresolved restrictions and preserves unrelated training where appropriate.
- User changes goals or capacity: downstream plan clearly marked as needing regeneration/review rather than silently reusing old assumptions.
- Unavailable data: show unknown rather than filling from broad sport background or fabricated metrics.
- Contrast novice / trauma / postoperative cases test that the setup does not overwhelm or bypass clinical authority.

## Not integrated

No production app/Expo changes; no personal pTSS research integration; no raw Garmin/TrainingPeaks/medical imports or server sync; no new clinical treatment recommendations or validated fitness calculations.

**Next decision gate:** Test first-run setup and training-first navigation with the user, then refine the workflow and UI before migrating it into the iOS app.
