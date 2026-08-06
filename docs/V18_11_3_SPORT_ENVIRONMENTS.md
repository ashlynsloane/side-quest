# V18.11.3 — Sport Environments

V18.11.3 replaces generic color-profile names with palettes rooted in actual
endurance settings:

- Side Quest Classic — everyday multisport
- Trail Club — forest trail running
- Summit Run — mountain trail running
- Race Day — start lines and finish chutes
- Open Water — ocean swimming
- Alpine Lake — lake swimming
- Road Club — road cycling
- Aero Lab — TT and triathlon cycling
- Singletrack — mountain biking

Trail Club now uses a visibly warm paper card surface against a muted green
canvas. Theme cards preview their own background, surface, accent, and secondary
colors instead of inheriting the currently active theme.

Theme changes remain local-first. A failed or interrupted cloud request is
queued as `profile_sync`; it no longer becomes an unhandled React Native
network exception. The queued profile update retries through Beta Operations
and normal foreground recovery.

The accompanying migration expands the `profiles.theme_id` constraint to cover
the sport-environment IDs.
