# Side Quest V18.4 — Integration Hardening and Beta Readiness

V18.4 converts several automatic or implicit collaboration behaviors into explicit, reversible user decisions.

## Completed-activity review

Every imported Strava activity opens a dedicated review screen. The athlete may:

- manually link the activity to an eligible planned session;
- confirm that no planned-session match exists;
- restore automatic matching;
- link a watch-recorded strength/HIIT activity to a detailed Side Quest workout;
- keep the watch activity separate;
- classify a standalone class as full-body strength, conditioning, or ignored;
- inspect source and device-local timestamps.

A linked Side Quest + watch recording is one canonical workout. Exercise structure and muscle credit come from Side Quest; duration, heart rate, and relative effort come from the watch record. The completion is not counted twice.

## Calendar time zones

ICS events with a `TZID` are converted from that named wall-clock zone to UTC before storage. The original zone is retained on the local calendar event for review. Invalid vendor zones fall back without discarding the entire calendar.

## Coach proposals

Coach access expires after 90 days unless the athlete renews it. Coaches can view sanitized future strength sessions and submit proposals, but they cannot directly activate a change.

The athlete sees the current and proposed session side by side. Approval occurs on the athlete's device after the proposal is checked against private restrictions and equipment. Rejections do not modify the plan. Accepted changes create a local undo snapshot.

The cloud proposal contains only sanitized future workout structure. It excludes completed history, loads used, readiness, pain, PT restrictions, heart rate, Strava, calendar details, and private notes.

## Workout Together confirmation

After the host selects or combines a workout, the room selection revision increments and every participant's ready state resets. Each participant must explicitly confirm either:

- **Additional workout**, or
- **Substitute my next Side Quest session**.

A participant cannot mark ready until confirming the latest revision. The host cannot start until every participant has confirmed and is ready. Shared-workout completion uses a room-and-user idempotency key to prevent duplicate local history records.

## Privacy and diagnostics

The Beta Readiness screen exports a privacy-safe diagnostic report containing only app version, integration states, timestamps, and aggregate counts. It excludes identity, URLs, event/workout titles, notes, sensor values, credentials, and private health context.

Cloud users may invoke **Delete Side Quest cloud data**. The app first attempts to disconnect Strava, then removes Side Quest application data from Supabase. The authentication identity remains; complete authentication-account deletion requires an administrator and never exposes the service-role key to the mobile app.

## Deployment

V18.4 requires one new Supabase migration:

`20260722220000_v18_4_beta_hardening.sql`

No new secrets or Edge Function deployment are required.
