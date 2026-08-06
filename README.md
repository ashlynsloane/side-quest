# Circuit Generator — V1 Foundation

A local-first Expo/React Native prototype for generating strength-cardio AMRAP workouts from structured exercise data.

**Working name:** Circuit Generator. This is a placeholder and can be renamed without changing the architecture.

## What is implemented

- Expo SDK 57 mobile application shell
- Large **Generate Workout** control
- Selectable work duration, training emphasis, equipment, and shoulder exclusion
- Deterministic rules-based workout generator
- Exact 4-, 8-, and 12-minute station planning
- Two or three exercises per station
- Equipment filtering
- Body-region and joint-load exclusions
- Movement-tag exclusions
- Focus scoring
- Initial 72-hour recent-load decay model
- Seeded generation for reproducibility
- 106 validated exercise records
- 68 substitution groups
- Exercise instructions, muscle loads, joint loads, equipment options, prescriptions, AMRAP timing estimates, and media slots
- Generator validation and four automated tests

## Present but not yet functional

The first mobile screen includes visible entry points for the intended workflow. These controls are placeholders for the next milestone:

- Save to Favorites
- Exercise demonstration viewer
- Start Active Workout
- SQLite persistence
- Completed-workout recovery memory
- Exercise replacement from the preview

The generator itself is functional. The placeholder controls are intentionally visible so the next implementation step can connect them without redesigning the screen.

## Repository structure

```text
circuit-generator/
├── apps/mobile/                    Expo mobile application
├── packages/domain/                Shared TypeScript types
├── packages/exercise-content/      Exercise JSON and validation
├── packages/generator/             Deterministic generator and tests
├── examples/                       Reproducible sample output
└── docs/                           Implementation notes
```

## Setup on macOS

### 1. Move the project into your Developer folder

```bash
cd ~/Developer
unzip ~/Downloads/circuit-generator-v1.zip
cd circuit-generator
```

If the downloaded archive extracts into another nested folder, enter the folder containing `pnpm-workspace.yaml`.

### 2. Install dependencies

```bash
pnpm install
```

### 3. Verify the exercise data and generator

```bash
pnpm check
```

Expected result:

- 106 exercises validated
- All TypeScript projects compile
- Four generator tests pass

### 4. Open the iOS version

For the first native build:

```bash
pnpm --dir apps/mobile exec expo run:ios
```

After the development build exists, start Metro with:

```bash
pnpm dev
```

Then press `i` to open the iOS simulator.

## Useful commands

```bash
pnpm dev                  # Start Expo/Metro
pnpm ios                  # Start and target iOS
pnpm android              # Start and target Android
pnpm web                  # Start web preview
pnpm check                # Validate data, typecheck, and run tests
pnpm validate:exercises   # Validate only the exercise seed
pnpm demo:generate        # Regenerate the sample workout JSON
```

## Exercise seed

The main content file is:

```text
packages/exercise-content/data/exercises.json
```

Each record includes:

- Standardized name and aliases
- Bodyweight or equipment classification
- Category
- Setup, execution, cues, and common mistakes
- Primary, secondary, and stabilizing muscle loads
- Joint loads
- Movement patterns
- Avoidance tags
- Required equipment alternatives
- Default AMRAP prescription and estimated duration
- Impact, balance, cardiovascular, and complexity ratings
- Substitution groups
- Media metadata array

All media arrays are currently empty. This is deliberate: demonstrations should only be added after the video or image is original, licensed, and reviewed.

## Current verification status

The following checks pass in the supplied repository:

```text
Exercise validation: PASS
TypeScript typecheck: PASS
Generator tests: PASS (4/4)
```

The Expo native export was not used as a release qualification step in the build environment. Run `expo run:ios` on the Mac as the first device-level verification.

## V3: Goal-based weekly plans

The app now includes a Plan mode that generates a coordinated one-week strength plan for:

- Ironman 70.3
- Road 10K
- Trail 50K
- Swimming speed
- General offseason strength

The planner automatically assigns a phase from the weeks remaining (base, build, peak, taper, or race week), adjusts session duration and impact, spaces two to five sessions across the week, and uses planned body-region exposure to reduce accidental repeated loading.

Open the app and tap **Plan** in the upper-right corner of the generator screen.
