# Side Quest V18.11.2 — Visual Hierarchy Correction

V18.11.2 corrects the layout and information-hierarchy problems visible after
the first full retro-shell rollout.

## Masthead and safe areas

- The global masthead now includes the real device top inset.
- The horizontal wordmark is smaller and positioned below the Dynamic Island.
- Feature screens no longer add a second top safe-area inset beneath the global
  masthead.

## Today schedule

- Calendar rows no longer repeat metadata already present in the title, such as
  `All day · swim`.
- Each scheduled item shows a neutral `Planned` or `Done` state.
- Done status comes from the existing conservative planned/completed match
  records; it is not inferred merely because an activity of the same sport
  occurred.
- Status is communicated by text and a check mark, not red-versus-green alone.

## Strength Status

- The Regional Status screen offers explicit 14-day and 28-day windows.
- Planned direct-strength exposure, completed strength, and sport context are
  computed over the selected period.
- Sport load is compared with the immediately preceding equal-length period.

## Selection and typography

- Goal categories use distinct tinted group surfaces.
- The selected goal uses a solid high-contrast state plus a `Selected` mark.
- Weight-unit and anatomy-figure labels use form-label sizing rather than tiny
  eyebrow text.
- Inputs and preference controls use clearer surface separation.

## Themes and navigation

- Side Quest Classic uses a pale sage canvas so cards separate from the page.
- Trail Club and Race Day color profiles are added to Theme Lab.
- Secondary tools on Plan, Train, and Profile are grouped behind descriptive,
  expandable sections, leaving the primary actions visible.

No workout-generation, account, or cloud schema behavior changes.
