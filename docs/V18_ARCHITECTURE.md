# Side Quest V18 architecture

## Data flow

```text
TrainingPeaks private ICS
        ↓ conditional client refresh
training_calendar_sources + training_calendar_events (SQLite)
        ↓
planned-versus-completed matcher
        ↑
Strava OAuth → Supabase tokens → backfill/webhooks → strava_activities (Supabase)
                                                    ↓ foreground pull
                                             endurance_activities (SQLite)
                                                    ↓
                            endurance_region_contributions + match records
                                                    ↓
                              Training Memory combined-context presentation
                                                    ↓
                          snapshot-backed future strength replan evaluation
```

## Authority boundaries

- **TrainingPeaks/ICS is planned intent.** It does not prove completion.
- **Strava is completed endurance evidence.** It does not replace Side Quest strength history.
- **Completed Side Quest strength sessions remain the direct-load authority.**
- **The matcher produces a relationship record.** It does not merge or delete either source record.
- **Automatic replanning modifies only future plan placement.** It preserves a full snapshot and leaves completed history untouched.

## Failure behavior

- ICS network failure: retain old events and persist error/backoff state.
- Strava API failure: retain canonical cloud and local rows; persist sync error.
- Webhook with an unexpected subscription ID or stale event timestamp: rejected before processing.
- Webhook duplicate: ignored by unique event key.
- Webhook slow downstream work: response is returned before processing via `EdgeRuntime.waitUntil`.
- Token expiry: refresh token is exchanged server-side; mobile never receives access or refresh tokens.
- Replan failure: no plan update occurs before the snapshot and proposal application complete.
- Installation validation failure: installer restores overwritten files and removes files created by V18.
