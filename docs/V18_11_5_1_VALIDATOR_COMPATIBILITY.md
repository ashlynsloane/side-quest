# V18.11.5.1 — Validator Compatibility Correction

V18.11.5 correctly replaced the Strength Status screen's fixed navy colors with active semantic theme tokens. The older V18.11.1 validator still required literal navy hex values, so the complete check rejected the intentional improvement and triggered a safe rollback.

V18.11.5.1 updates that validator to accept either:

- the original cohesive retro palette; or
- the newer active theme implementation using `palette.canvas`, `palette.ink`, and `palette.border`.

The correction does not weaken the invariant: the screen must still have a coherent palette implementation. It simply stops treating hardcoded navy as the only valid implementation.

No app behavior, cloud schema, native dependency, or training logic changes are introduced beyond the V18.11.5 theme-role update.
