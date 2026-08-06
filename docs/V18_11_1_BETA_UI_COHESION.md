# Side Quest V18.11.1 — Beta UI Cohesion

This release makes the retro-minimal system a product shell rather than a
top-level decoration. It also turns the primary tabs into useful dashboards.

## Navigation and visual system

- A compact, horizontal Side Quest masthead is rendered by the root navigator,
  so tabs and nested feature routes share the same brand header.
- Legacy feature screens use the cream, navy, forest, and mint retro palette.
- The trailhead illustration is larger and remains on active goal-plan hero
  cards, not only the first-plan empty state.
- Beta Feedback remains in one canonical location under Profile.

## Today

- Today's imported calendar and today's planned strength session are visible
  directly on the Today tab.
- The schedule card links to the full Training Schedule.
- Daily Coach no longer duplicates the imported-calendar list; it focuses on
  recommendation logic, readiness, dose selection, and explanation.

## Profile and Strength Status

- Weight units and anatomy-map figure are separate Profile preferences.
- The anatomy-map figure is persisted for local and cloud profiles.
- Strength Status reads that preference and keeps only Front / Back controls on
  the map itself.

## Live tab summaries

- Plan shows active-block length, completion, phase, weekly strength frequency,
  and the next session.
- Train shows the next planned session and most recent completed workout.
- Progress shows a 28-day strength, endurance, and review summary.

No planner, workout-generation, matching, or cloud schema behavior changes in
this release.
