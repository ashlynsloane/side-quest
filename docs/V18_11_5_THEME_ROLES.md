# V18.11.5 — Theme Roles and Core Consistency

## Why this update exists

The Theme Lab previously showed four attractive colors without guaranteeing that every one had a visible interface role. Some older screens also retained the original navy palette even after another environment was applied.

## Four interface roles

Every Theme Lab environment now previews the colors actually used for:

1. **Action** — primary buttons, selected controls, links, and navigation emphasis.
2. **Canvas** — the app background that separates groups of content.
3. **Card** — neutral reading surfaces for text-heavy controls and information.
4. **Accent** — hero underlines and compact highlights.

The accent is intentionally not used as a large text-box fill. Status colors for success, caution, pain, and restrictions remain semantic and do not change meaning with the decorative environment.

## Screen corrections

- Road Club uses neutral charcoal typography rather than a blue-black headline.
- Training Memory / Strength Status now reads from the active theme instead of its fixed legacy navy palette.
- Every shared hero card renders the environment's accent underline, including pale and neutral hero variants.
- Theme Lab labels each role and derives its color directly from the applied light palette, preventing preview drift.

## Scope

No planning, training, matching, recovery, database, or cloud behavior changes. No native rebuild or cloud deployment is required.
