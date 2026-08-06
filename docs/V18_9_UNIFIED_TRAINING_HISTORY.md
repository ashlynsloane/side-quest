# Side Quest V18.9 — Unified Training History

V18.9 replaces the strength-only Progress entry point with a chronological
training timeline that includes Side Quest workouts and imported endurance
activities.

## Counting model

- A linked watch activity and Side Quest workout appear as one strength record.
- Exercise details and regional strength credit come from Side Quest.
- Watch duration, heart rate, and Relative Effort remain sensor context.
- Imported swim, bike, and run remain sport-load context rather than direct
  strength credit.

## Review workflow

The timeline can be filtered to All, Strength, Endurance, or Needs review.
Uncertain planned-session matches, possible watch/app duplicates, and unresolved
watch-recorded strength activities route to the existing Activity Review screen.
Side Quest workout records route to the editable Workout Detail screen.

Deleted-at-source and ignored activities remain visible with an explicit status
so history changes can be understood and reversed.

No database or cloud migration is required.
