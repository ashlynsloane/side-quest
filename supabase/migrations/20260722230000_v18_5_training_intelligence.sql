-- Side Quest V18.5 — Training Intelligence
-- Keep Strava's own summary analytics as context instead of recreating proprietary load models.

alter table public.strava_activities add column if not exists workout_type integer;
alter table public.strava_activities add column if not exists average_cadence double precision;
alter table public.strava_activities add column if not exists average_watts double precision;
alter table public.strava_activities add column if not exists weighted_average_watts double precision;
alter table public.strava_activities add column if not exists kilojoules double precision;
alter table public.strava_activities add column if not exists device_watts boolean;
alter table public.strava_activities add column if not exists device_name text;
alter table public.strava_activities add column if not exists has_heartrate boolean;

-- Edge Functions retain full server access; signed-in clients retain read-only access to their own rows.
grant all privileges on table public.strava_activities to service_role;
grant select on table public.strava_activities to authenticated;
