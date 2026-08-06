# Supabase setup for V13

V13 builds on the V12 beta account setup.

## 1. Confirm V12 is configured

The app needs these Expo environment variables:

```bash
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Run `supabase/V12_BETA_SCHEMA.sql` first if it has not already been applied.

## 2. Apply the V13 migration

Open the Supabase SQL Editor and run:

```text
supabase/V13_THEMES_AND_WORKOUT_TOGETHER.sql
```

This migration:

- Adds `theme_id` and `appearance` to athlete profiles
- Creates private workout rooms and room-member tables
- Adds Row Level Security policies
- Enables Realtime for room and ready-state updates

## 3. Test with two accounts

Use two devices or simulators with two different email OTP accounts.

1. Open **Train → Workout Together** on device A.
2. Create a room and share the six-character code.
3. Join the code on device B.
4. Mark both athletes ready.
5. Start from the host phone.
6. Confirm both phones display the same countdown and station time.

Local beta profiles cannot join cross-phone rooms. They can still use every local planning, training, memory, and Theme Lab feature.

## Privacy model

The backend room contains the workout snapshot, display names, room state, and timing. It does not receive PT notes, pain reports, readiness responses, loads, rounds, or local workout reflections.
