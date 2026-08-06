# Side Quest V18.7 — Reliability, Privacy, and Beta Operations

V18.7 hardens the existing product rather than changing the training model.

## Reliable delivery

Cloud-dependent operations can be retained locally and retried with bounded exponential backoff. The queue currently covers calendar reconciliation, Strava recovery sync, coach future-plan sync, and beta-feedback delivery. Successful operations are removed; failed operations retain only a short error category in privacy-safe diagnostics.

## Beta Operations

The new Beta Operations screen reports app/schema version, calendar and Strava health, coach availability, foreground recovery status, and queued retry counts. It does not expose names, email addresses, calendar URLs or titles, activity titles, heart-rate values, tokens, PT notes, pain text, or workout loads.

## Account lifecycle

Users can separately erase local data, delete Side Quest cloud application data while retaining the sign-in identity, or permanently delete the authentication account and all Side Quest data. Permanent account deletion runs only in a server-side Edge Function with the service-role credential.

## Security hardening

Coach invitations and friend requests receive database-enforced rate limits. Expired coach grants are excluded from active client access. Strava credentials remain server-side.

## Scope boundary

V18.7 does not claim full offline synchronization of every editable training object across multiple devices. Completed local workout history remains device-owned in this beta; the new queue protects the cloud operations listed above.
