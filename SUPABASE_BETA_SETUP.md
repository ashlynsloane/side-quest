# Supabase beta account setup

V12 works immediately in **local beta profile** mode. To turn on real email OTP accounts:

1. Create a Supabase project.
2. Run `supabase/V12_BETA_SCHEMA.sql` in the SQL Editor.
3. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and enter the project URL and publishable key.
4. In Supabase Authentication → Email Templates, configure the sign-in email to display `{{ .Token }}` so testers receive the six-digit OTP expected by the app.
5. Optionally set `EXPO_PUBLIC_BETA_INVITE_CODE` in the beta build environment.
6. Restart Metro after changing environment variables.

The account and feedback tables use Row Level Security. Training plans, PT profiles, symptoms, readiness, loads, and calendar data remain in the per-user SQLite database on the device in V12. This prevents sensitive records from being uploaded before a full sync schema, deletion model, and conflict-resolution policy are implemented.
