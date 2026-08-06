# Side Quest V18.5 — Training Intelligence

V18.5 makes completed swim, bike, and run training useful for strength planning without treating sport participation as a substitute for direct strength work.

## Core model

Side Quest keeps three signals separate:

1. **Direct strength stimulus** — exercises, sets, loads, and region-specific work recorded in Side Quest.
2. **Sport-related regional demand** — estimated repeated demand from swimming, cycling, and running.
3. **Whole-session internal load** — duration, Strava Relative Effort, heart rate, power, and related session context when available.

Sport load can change timing or dose. It does not erase a strength gap or automatically remove every exercise for a heavily used region.

## Personal baseline

Each endurance activity is compared with the athlete's prior sessions of the same discipline over a configurable 14, 21, 28, or 30 day window. Side Quest uses Strava Relative Effort when available and enabled, plus duration, distance, elevation, activity title, and sport type. It does not recreate a proprietary Strava load score.

## Phase priority

- **Offseason:** strength build priority. Optional easy endurance should yield before important strength work.
- **Base/build:** balanced priority. Meaningful fatigue can reduce redundant volume, but direct strength is preserved.
- **Peak/taper/race week:** race-specific priority. Strength shifts toward maintenance rather than disappearing.
- **Return to strength:** controlled strength rebuilding is protected. Active pain or restrictions still take precedence.

## Adjustment policy

Most changes are proposals. The athlete can accept the recommendation or keep the original workout. A context-aware reduced variant deliberately retains at least one station for sport-loaded regions and complementary support regions.

Only an objective, high-confidence extreme-load guardrail may be applied automatically when the user enables that mode. Examples include an ultradistance effort immediately before a substantially overlapping strength session. The automatic action moves strength rather than deleting it, saves a complete pre-change snapshot, and remains undoable.

## Strava fields retained

V18.5 retains available Strava summary fields including Relative Effort (`suffer_score`), average/max heart rate, cadence, average and weighted power, kilojoules, workout type, device power status, and device name. Availability varies by sport, device, and athlete settings.
