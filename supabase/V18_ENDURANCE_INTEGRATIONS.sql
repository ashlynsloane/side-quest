-- Side Quest V18 endurance integrations
-- Run after V12_BETA_SCHEMA.sql, V13_THEMES_AND_WORKOUT_TOGETHER.sql, and V17_SOCIAL_BETA.sql.
-- Stores read-only Strava connection state and canonical activity records.
-- Access and refresh tokens remain inaccessible to authenticated clients because their tables have RLS with no client policies.

create extension if not exists pgcrypto;

create table if not exists public.strava_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  athlete_id bigint not null unique,
  athlete_firstname text,
  athlete_lastname text,
  scope text[] not null default array[]::text[],
  status text not null default 'connected' check (status in ('connected','reauthorization_required','deauthorized','error')),
  last_backfill_at timestamptz,
  last_webhook_at timestamptz,
  last_sync_at timestamptz,
  last_sync_status text check (last_sync_status is null or last_sync_status in ('idle','running','success','partial','error')),
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.strava_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  athlete_id bigint not null unique,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.strava_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  return_url text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists strava_oauth_states_expiry_idx on public.strava_oauth_states(expires_at);

create table if not exists public.strava_activities (
  id bigint primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  athlete_id bigint not null,
  name text not null,
  sport_type text not null,
  type text,
  start_date timestamptz not null,
  start_date_local text,
  timezone text,
  moving_time integer not null check (moving_time >= 0),
  elapsed_time integer not null check (elapsed_time >= 0),
  distance double precision,
  total_elevation_gain double precision,
  average_heartrate double precision,
  max_heartrate double precision,
  suffer_score double precision,
  trainer boolean not null default false,
  commute boolean not null default false,
  manual boolean not null default false,
  private boolean not null default false,
  deleted_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, id)
);
create index if not exists strava_activities_user_start_idx on public.strava_activities(user_id, start_date desc);
create index if not exists strava_activities_athlete_idx on public.strava_activities(athlete_id);
create index if not exists strava_activities_active_idx on public.strava_activities(user_id, start_date desc) where deleted_at is null;

create table if not exists public.strava_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  object_type text not null,
  object_id bigint not null,
  aspect_type text not null,
  owner_id bigint not null,
  subscription_id bigint,
  event_time bigint not null,
  updates jsonb not null default '{}'::jsonb,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received','processed','ignored','error')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists strava_webhook_events_received_idx on public.strava_webhook_events(received_at desc);

create table if not exists public.strava_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('oauth_backfill','manual','foreground_recovery','webhook')),
  status text not null default 'running' check (status in ('running','success','partial','error')),
  activities_seen integer not null default 0,
  activities_upserted integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text
);
create index if not exists strava_sync_runs_user_idx on public.strava_sync_runs(user_id, started_at desc);

alter table public.strava_connections enable row level security;
alter table public.strava_tokens enable row level security;
alter table public.strava_oauth_states enable row level security;
alter table public.strava_activities enable row level security;
alter table public.strava_webhook_events enable row level security;
alter table public.strava_sync_runs enable row level security;

-- Clients may read their own connection metadata and imported activities.
-- All writes are performed by authenticated Edge Functions with the service role.
drop policy if exists strava_connections_select_self on public.strava_connections;
create policy strava_connections_select_self on public.strava_connections for select using (user_id = auth.uid());

drop policy if exists strava_activities_select_self on public.strava_activities;
create policy strava_activities_select_self on public.strava_activities for select using (user_id = auth.uid());

drop policy if exists strava_sync_runs_select_self on public.strava_sync_runs;
create policy strava_sync_runs_select_self on public.strava_sync_runs for select using (user_id = auth.uid());

-- No authenticated-client policies are intentionally created for tokens, OAuth states, or webhook events.
-- service_role bypasses RLS.

-- Allow connected clients to receive inserts/updates/deletes without exposing other users' rows.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'strava_activities'
  ) then
    alter publication supabase_realtime add table public.strava_activities;
  end if;
exception when undefined_object then
  -- Local PostgreSQL/test installations may not have the Supabase publication.
  null;
end $$;

create or replace function public.cleanup_expired_strava_oauth_states()
returns integer language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  delete from public.strava_oauth_states where expires_at < now() or consumed_at < now() - interval '1 day';
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.cleanup_expired_strava_oauth_states() from public, anon, authenticated;
grant execute on function public.cleanup_expired_strava_oauth_states() to service_role;
