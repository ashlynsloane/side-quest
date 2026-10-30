# Prototype v0.3 — Close the onboarding loop

**Status:** Browser interaction prototype built and QA-tested, October 2026. Prototype files and primary athlete health context are shared privately with the athlete, **not committed to public GitHub**.

## The problem exposed by user testing

v0.2 successfully collected a training baseline, but after onboarding it **did not guide an athlete with injuries to record/review those conditions** and only offered a placeholder saying "Consider a strength session". This was not a complete first-time user journey and did not meet the training-first product contract.

A questionnaire that saves data is not an onboarding flow unless it leads to a useful next action.

## New journey

```
Training goal, priority, sport, recent training and run status
   -> Availability, strength days, equipment and strength experience
   -> Is there active injury / clinical uncertainty?
   -> If YES / UNSURE / training reduced due to injury / existing case:
        review existing cases -> add an injury with actual onset precision
        -> return to review -> continue
      Else:
        continue directly
   -> Concrete first-week draft: day, session type, approximate duration,
      purpose and representative exercise lists (clearly illustrative)
   -> Today / Plan / Train / Rehab / Desktop remain connected
```

## New behavior tested

- Injury reporting routes directly into the athlete history review after saving the baseline.
- Existing concerns are visible and a newly entered case can be added without losing prior cases.
- Onset date and recording date remain distinct; one can inspect existing case details then return to setup.
- A novice with no reported concern sees the example training week immediately instead of being required to complete a health-case workflow.
- A user who reported pain-related training reduction but no "current restriction" still receives a history review.
- The concrete draft uses selected strength-capable weekdays, experience and goal to show candidate exercise types, example durations and sets/reps. Endurance ideas remain unscheduled unless the necessary availability data were collected.
- Where symptoms or restrictions are unresolved, every draft session is marked **Review needed**. The athlete can inspect it, but the prototype never treats it as medical clearance.
- Mobile (390px) and desktop (1200px) browser paths passed automated interaction checks, with no page JavaScript errors in the scenarios tested.

## Scope boundary

This is a **UX and information-flow prototype**, not an independently optimized training plan, clinical exercise eligibility engine, or real-time pTSS model. Default example doses are deterministic and deliberately not asserted as individualized training efficacy or validated medical guidance.

The production Expo app, TestFlight archive, private personal-data analyses and pTSS research are not modified.

## Next product gate

Have an athlete complete this sequence *unassisted*:

1. Begin a new athlete profile.
2. Select an endurance or strength goal, time availability, prior training and equipment.
3. Report an active or recent injury, or skip injury intake if none applies.
4. Interpret the resulting training draft, including relevant restrictions.
5. Examine a specific workout and explain whether it is actually authorized.
6. Update the athlete profile and see how the planned week changes.

Only after this journey's UX is validated should we connect production generation and clinical rules. The production generator will need actual training history, safe constraints and evidence-based periodization not present in this demonstration.
