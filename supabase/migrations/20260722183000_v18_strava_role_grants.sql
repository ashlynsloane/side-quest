-- V18 correction: grant Edge Functions access to Strava integration tables.

grant all privileges on table
  public.strava_connections,
  public.strava_tokens,
  public.strava_oauth_states,
  public.strava_activities,
  public.strava_webhook_events,
  public.strava_sync_runs
to service_role;

-- Signed-in mobile clients may read only their own rows, as restricted by RLS.
grant select on table
  public.strava_connections,
  public.strava_activities,
  public.strava_sync_runs
to authenticated;

-- Keep sensitive server-only tables inaccessible to mobile clients.
revoke all privileges on table
  public.strava_tokens,
  public.strava_oauth_states,
  public.strava_webhook_events
from anon, authenticated;
