-- Server-coordinated single active-workout lease for authenticated cloud users.
-- The lease is NOT a synchronized training budget: completion/recovery records
-- remain local until a separate secure data-sync implementation is deployed.
--
-- Apply with Supabase migrations before EXPO_PUBLIC_DISTRIBUTED_WORKOUT_LOCKS=true.
create table if not exists public.training_workout_leases (
  athlete_id uuid primary key references auth.users(id) on delete cascade,
  lease_id uuid not null,
  workout_id text not null,
  device_id text not null,
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.training_workout_leases enable row level security;
revoke all on table public.training_workout_leases from public, anon, authenticated;
-- No direct table policies: access is only through constrained authenticated RPCs.

create or replace function public.acquire_training_workout_lease(
  p_workout_id text, p_device_id text
)
returns table(granted boolean, lease_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_token uuid := pg_catalog.gen_random_uuid();
  v_expiry timestamptz := pg_catalog.clock_timestamp() + interval '90 seconds';
  v_written uuid;
begin
  if v_user is null then
    raise exception 'An authenticated user is required' using errcode = '42501';
  end if;
  if p_workout_id is null or length(pg_catalog.btrim(p_workout_id)) not between 1 and 128
    or p_device_id is null or length(pg_catalog.btrim(p_device_id)) not between 1 and 128 then
    raise exception 'Invalid workout or device identity' using errcode = '22023';
  end if;

  -- Unique athlete_id plus ON CONFLICT WHERE makes acquisition atomic across
  -- concurrent devices. Only an expired lease can be replaced.
  insert into public.training_workout_leases as current_lease (
    athlete_id, lease_id, workout_id, device_id, acquired_at, updated_at, expires_at
  ) values (
    v_user, v_token, p_workout_id, p_device_id,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(), v_expiry
  )
  on conflict (athlete_id) do update
    set lease_id = excluded.lease_id,
        workout_id = excluded.workout_id,
        device_id = excluded.device_id,
        acquired_at = excluded.acquired_at,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at
    where current_lease.expires_at <= pg_catalog.clock_timestamp()
  returning current_lease.lease_id into v_written;

  if v_written is null then
    return query select false, null::uuid, null::timestamptz;
  else
    return query select true, v_written, v_expiry;
  end if;
end;
$$;

create or replace function public.renew_training_workout_lease(
  p_lease_id uuid, p_device_id text
)
returns table(renewed boolean, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_expiry timestamptz := pg_catalog.clock_timestamp() + interval '90 seconds';
  v_written timestamptz;
begin
  if v_user is null then
    raise exception 'An authenticated user is required' using errcode = '42501';
  end if;
  update public.training_workout_leases as held
    set expires_at = v_expiry, updated_at = pg_catalog.clock_timestamp()
    where held.athlete_id = v_user and held.lease_id = p_lease_id
      and held.device_id = p_device_id
      and held.expires_at > pg_catalog.clock_timestamp()
    returning held.expires_at into v_written;
  if v_written is null then
    return query select false, null::timestamptz;
  else
    return query select true, v_written;
  end if;
end;
$$;

create or replace function public.release_training_workout_lease(
  p_lease_id uuid, p_device_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_deleted uuid;
begin
  if v_user is null then
    raise exception 'An authenticated user is required' using errcode = '42501';
  end if;
  delete from public.training_workout_leases
    where athlete_id = v_user and lease_id = p_lease_id and device_id = p_device_id
    returning lease_id into v_deleted;
  return v_deleted is not null;
end;
$$;

-- Security-definer routines must not be anonymously executable.
revoke all on function public.acquire_training_workout_lease(text,text) from public, anon;
revoke all on function public.renew_training_workout_lease(uuid,text) from public, anon;
revoke all on function public.release_training_workout_lease(uuid,text) from public, anon;
grant execute on function public.acquire_training_workout_lease(text,text) to authenticated;
grant execute on function public.renew_training_workout_lease(uuid,text) to authenticated;
grant execute on function public.release_training_workout_lease(uuid,text) to authenticated;
