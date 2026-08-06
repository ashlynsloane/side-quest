# Side Quest V18.2 — Canonical Workout and Training Memory Model

## Purpose

V18.2 prevents a strength workout recorded in both Side Quest and on a watch/Strava from being counted twice. It also separates direct strength exposure from sport-specific swim, bike, and run load.

## Canonical workout rule

When a Strava HIIT/strength record overlaps a completed Side Quest workout:

- the Side Quest workout supplies exercises, sets, repetitions, loads, and muscle-region credit;
- the watch record supplies duration, average heart rate, maximum heart rate, and relative effort when available;
- the session is counted once;
- the linked Strava record receives no generic full-body muscle credit.

Side Quest proposes an automatic link only when date, time overlap, start-time proximity, and duration provide a sufficiently strong and distinct match. Ambiguous cases remain reviewable. The athlete can link manually or keep the records separate.

## Two anatomy layers

### Direct strength

This is the authoritative Training Memory layer. It comes from the actual exercises completed in Side Quest and is used for:

- muscle-region exposure;
- direct-strength gaps;
- exercise progression;
- set, repetition, and load history.

### Sport load

This is a separate, conservative context layer for repetitive loading and fatigue overlap:

- Swim: lats, upper back, shoulders, triceps, chest, and trunk.
- Bike: quadriceps, glutes, hamstrings, calves, hip flexors, and trunk.
- Run: glutes, quadriceps, hamstrings, calves, feet/ankles, lateral hips, and trunk.

The mapping is a generic sport profile scaled conservatively by duration and inferred intensity. It does not claim that a region received a resistance-training stimulus, cannot erase a direct-strength gap, and does not drive exercise progression. Technique, terrain, stroke, bike fit, and workout structure can change the true distribution.

Heart rate is whole-session internal-load context. It cannot identify which body regions were trained. Strava relative effort may help characterize session intensity, but it does not assign muscle-region credit.

## Standalone external classes

A Strava HIIT/strength class with no Side Quest exercise log remains separate. The athlete can classify it as:

- Full-body strength class: capped, low-confidence generic regional context;
- Conditioning only: no muscle-region credit;
- Ignore.
