-- Shared, authenticated daily prescription, completed exposure and regional recovery ledger.
-- Designed for a deliberately strict opt-in rollout. Existing local profiles are unaffected.
-- No personal notes, diagnoses or detailed clinical records are stored here.

create table if not exists public.training_remote_plans (
  athlete_id uuid not null references auth.users(id) on delete cascade,
  training_date date not null,
  sessions jsonb not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (athlete_id, training_date),
  constraint training_remote_plan_array check (jsonb_typeof(sessions) = 'array')
);
create table if not exists public.training_remote_exposures (
  athlete_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  workout_id text not null,
  session_id text,
  activity text not null check (activity in ('strength','run','bike','swim','hiit')),
  minutes numeric(9,2) not null check (minutes > 0 and minutes <= 1440),
  regions text[] not null,
  completed_at timestamptz not null,
  training_date date not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (athlete_id, event_id),
  constraint training_remote_valid_regions check (
    cardinality(regions) between 1 and 3
    and regions <@ array['general','achilles','upper_back']::text[]
  )
);
create index if not exists training_remote_exposure_recent
  on public.training_remote_exposures(athlete_id, completed_at desc);
create index if not exists training_remote_exposure_day
  on public.training_remote_exposures(athlete_id, training_date);
create table if not exists public.training_remote_recovery (
  athlete_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  region text not null check (region in ('general','achilles','upper_back')),
  status text not null check (status in ('stable','uncertain','worse','red_flag')),
  training_date date not null,
  observed_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (athlete_id, event_id, region)
);
create index if not exists training_remote_recovery_recent
  on public.training_remote_recovery(athlete_id,region,observed_at desc);

alter table public.training_remote_plans enable row level security;
alter table public.training_remote_exposures enable row level security;
alter table public.training_remote_recovery enable row level security;
revoke all on table public.training_remote_plans from public, anon, authenticated;
revoke all on table public.training_remote_exposures from public, anon, authenticated;
revoke all on table public.training_remote_recovery from public, anon, authenticated;

-- The first synchronized plan is immutable. A later local edit cannot expand
-- the remote daily allowance or fabricate another approved session.
create or replace function public.publish_training_remote_plan(
  p_training_date date, p_sessions jsonb
)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session jsonb;
  v_count int;
  v_existing jsonb;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_training_date is null or p_training_date < current_date - 3
     or p_training_date > current_date + 3
     or p_sessions is null or jsonb_typeof(p_sessions) <> 'array'
     or jsonb_array_length(p_sessions) > 16 then
    raise exception 'Invalid prescription date or session list' using errcode='22023';
  end if;
  v_count := pg_catalog.jsonb_array_length(p_sessions);
  if v_count < 1 then raise exception 'Empty remote plan is not an authorization' using errcode='22023'; end if;
  for v_session in select value from pg_catalog.jsonb_array_elements(p_sessions) loop
    if jsonb_typeof(v_session) <> 'object'
       or length(coalesce(v_session->>'sessionId','')) not between 1 and 128
       or (v_session->>'minutes') !~ '^[0-9]{1,3}$'
       or (v_session->>'minutes')::int not between 1 and 720
       or jsonb_typeof(v_session->'regions') <> 'array'
       or jsonb_array_length(v_session->'regions') not between 1 and 3
       or exists (select 1 from pg_catalog.jsonb_array_elements_text(v_session->'regions') r
                  where r not in ('general','achilles','upper_back')) then
      raise exception 'Invalid prescribed session' using errcode='22023';
    end if;
  end loop;
  if (select count(distinct v.value->>'sessionId') from pg_catalog.jsonb_array_elements(p_sessions) as v(value)) <> v_count then
    raise exception 'Duplicate session IDs' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 91829));
  insert into public.training_remote_plans(athlete_id,training_date,sessions)
  values (v_user,p_training_date,p_sessions)
  on conflict do nothing;
  select sessions into v_existing from public.training_remote_plans
    where athlete_id=v_user and training_date=p_training_date;
  if v_existing is distinct from p_sessions then
    raise exception 'Remote prescription already exists; changed plans require a reviewed revision'
      using errcode='23505';
  end if;
  return true;
end;
$$;

-- Self-reported/imported exposure is immutable; retries must be exact. The
-- athlete owns the data, but its truthfulness is not externally verified.
create or replace function public.publish_training_remote_exposure(
  p_event_id text, p_workout_id text, p_session_id text, p_activity text,
  p_minutes numeric, p_regions text[], p_completed_at timestamptz,
  p_training_date date
)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.training_remote_exposures%rowtype;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if length(coalesce(p_event_id,'')) not between 1 and 128
     or length(coalesce(p_workout_id,'')) not between 1 and 128
     or length(coalesce(p_session_id,'')) > 128
     or p_activity not in ('strength','run','bike','swim','hiit')
     or p_minutes is null or p_minutes <= 0 or p_minutes > 1440
     or p_minutes <> round(p_minutes,2)
     or p_regions is null or cardinality(p_regions) not between 1 and 3
     or not (p_regions <@ array['general','achilles','upper_back']::text[])
     or p_completed_at is null
     or p_completed_at > pg_catalog.clock_timestamp() + interval '5 minutes'
     or p_completed_at < pg_catalog.clock_timestamp() - interval '90 days'
     or p_training_date is null
     or abs(p_training_date - (p_completed_at at time zone 'UTC')::date) > 1 then
    raise exception 'Invalid completed exposure' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 91829));
  insert into public.training_remote_exposures(
    athlete_id,event_id,workout_id,session_id,activity,minutes,regions,completed_at,training_date
  ) values (
    v_user,p_event_id,p_workout_id,p_session_id,p_activity,p_minutes,p_regions,p_completed_at,p_training_date
  ) on conflict do nothing;
  select * into v_row from public.training_remote_exposures
    where athlete_id=v_user and event_id=p_event_id;
  if v_row.workout_id is distinct from p_workout_id
     or v_row.session_id is distinct from p_session_id
     or v_row.activity is distinct from p_activity
     or v_row.minutes is distinct from p_minutes
     or v_row.regions is distinct from p_regions
     or v_row.completed_at is distinct from p_completed_at
     or v_row.training_date is distinct from p_training_date then
    raise exception 'Exposure event ID reused with conflicting data' using errcode='23505';
  end if;
  return true;
end;
$$;

-- The server owns the observation timestamp. A second device sees the same
-- ordering; a device clock cannot backdate "stable" after a recent exposure.
create or replace function public.publish_training_remote_recovery(
  p_event_id text, p_training_date date, p_observations jsonb
)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_region text;
  v_status text;
  v_observed timestamptz := pg_catalog.clock_timestamp();
  v_existing text;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if length(coalesce(p_event_id,'')) not between 1 and 128
     or p_training_date is null or abs(p_training_date - current_date) > 1
     or p_observations is null or jsonb_typeof(p_observations) <> 'object'
     or (select count(*) from pg_catalog.jsonb_object_keys(p_observations)) not between 1 and 3 then
    raise exception 'Invalid regional recovery observation' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 91829));
  for v_region,v_status in select key,value from pg_catalog.jsonb_each_text(p_observations) loop
    if v_region not in ('general','achilles','upper_back')
       or v_status not in ('stable','uncertain','worse','red_flag') then
      raise exception 'Invalid recovery region or status' using errcode='22023';
    end if;
    insert into public.training_remote_recovery(athlete_id,event_id,region,status,training_date,observed_at)
    values(v_user,p_event_id,v_region,v_status,p_training_date,v_observed)
    on conflict do nothing;
    select status into v_existing from public.training_remote_recovery
      where athlete_id=v_user and event_id=p_event_id and region=v_region;
    if v_existing is distinct from v_status then
      raise exception 'Recovery observation ID reused with conflicting status' using errcode='23505';
    end if;
  end loop;
  return true;
end;
$$;

-- One read returns the same server history and the latest per-region status.
create or replace function public.read_training_remote_snapshot(
  p_training_date date
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_training_date is null or abs(p_training_date - current_date) > 3 then
    raise exception 'Invalid snapshot date' using errcode='22023';
  end if;
  select pg_catalog.jsonb_build_object(
    'trainingDate',p_training_date,
    'readAt',pg_catalog.clock_timestamp(),
    'plan',(select sessions from public.training_remote_plans
            where athlete_id=v_user and training_date=p_training_date),
    'exposures',coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'eventId',event_id,'workoutId',workout_id,'sessionId',session_id,
        'activity',activity,'minutes',minutes,'regions',regions,
        'completedAt',completed_at,'trainingDate',training_date
      ) order by completed_at)
      from public.training_remote_exposures
      where athlete_id=v_user and completed_at >= pg_catalog.clock_timestamp()-interval '48 hours'
    ),'[]'::jsonb),
    'recovery',coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'region',region,'status',status,'observedAt',observed_at
      ))
      from (select distinct on (region) region,status,observed_at
        from public.training_remote_recovery
        where athlete_id=v_user order by region,observed_at desc,event_id desc) current_regions
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- A single transaction decides daily capacity and holds the active lease.
-- On success a second device cannot authorize until the lease is released.
-- No unplanned workout bypass exists in the synchronized mode.
create or replace function public.acquire_training_workout_lease_v2(
  p_workout_id text, p_device_id text, p_training_date date,
  p_session_id text, p_planned_minutes integer, p_regions text[]
)
returns table(granted boolean, lease_id uuid, expires_at timestamptz, reason text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_plan jsonb;
  v_session jsonb;
  v_budget numeric;
  v_consumed numeric;
  v_last_exposure timestamptz;
  v_latest_status text;
  v_latest_observed timestamptz;
  v_region text;
  v_token uuid := pg_catalog.gen_random_uuid();
  v_expiry timestamptz := pg_catalog.clock_timestamp() + interval '90 seconds';
  v_written uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if length(coalesce(p_workout_id,'')) not between 1 and 128
     or length(coalesce(p_device_id,'')) not between 1 and 128
     or length(coalesce(p_session_id,'')) not between 1 and 128
     or p_training_date is null or abs(p_training_date - current_date) > 1
     or p_planned_minutes is null or p_planned_minutes not between 1 and 720
     or p_regions is null or cardinality(p_regions) not between 1 and 3
     or not (p_regions <@ array['general','achilles','upper_back']::text[]) then
    raise exception 'Invalid coordinated workout request' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 91829));
  select sessions into v_plan from public.training_remote_plans
    where athlete_id=v_user and training_date=p_training_date;
  if v_plan is null then
    return query select false,null::uuid,null::timestamptz,'No synchronized daily prescription'::text;
    return;
  end if;
  select item.value into v_session from pg_catalog.jsonb_array_elements(v_plan) as item(value)
    where item.value->>'sessionId'=p_session_id;
  if v_session is null or (v_session->>'minutes')::int < p_planned_minutes
     or not (p_regions <@ array(select r.region from pg_catalog.jsonb_array_elements_text(v_session->'regions') as r(region))) then
    return query select false,null::uuid,null::timestamptz,'Workout exceeds synchronized prescription'::text;
    return;
  end if;
  select coalesce(sum((item.value->>'minutes')::numeric),0) into v_budget
    from pg_catalog.jsonb_array_elements(v_plan) as item(value);
  select coalesce(sum(minutes),0) into v_consumed
    from public.training_remote_exposures
    where athlete_id=v_user and training_date=p_training_date and activity='strength';
  if v_consumed + p_planned_minutes > v_budget
     or exists(select 1 from public.training_remote_exposures
       where athlete_id=v_user and training_date=p_training_date and session_id=p_session_id) then
    return query select false,null::uuid,null::timestamptz,'Training dose already used on another device'::text;
    return;
  end if;
  foreach v_region in array array['general','achilles','upper_back']::text[] loop
    if v_region <> 'general' and not (v_region=any(p_regions)) then continue; end if;
    select status,observed_at into v_latest_status,v_latest_observed
      from public.training_remote_recovery
      where athlete_id=v_user and region=v_region
      order by observed_at desc,event_id desc limit 1;
    if v_latest_status in ('worse','red_flag') then
      return query select false,null::uuid,null::timestamptz,'A synchronized regional recovery restriction blocks this workout'::text;
      return;
    end if;
    select max(completed_at) into v_last_exposure
      from public.training_remote_exposures
      where athlete_id=v_user and completed_at >= pg_catalog.clock_timestamp()-interval '48 hours'
        and v_region=any(regions);
    if v_last_exposure is not null
      and (v_latest_status is distinct from 'stable' or v_latest_observed is null
           or v_latest_observed <= v_last_exposure) then
      return query select false,null::uuid,null::timestamptz,'Post-exposure regional recovery check required'::text;
      return;
    end if;
  end loop;
  insert into public.training_workout_leases as held(
    athlete_id,lease_id,workout_id,device_id,acquired_at,updated_at,expires_at
  ) values (
    v_user,v_token,p_workout_id,p_device_id,pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp(),v_expiry
  ) on conflict(athlete_id) do update
    set lease_id=excluded.lease_id, workout_id=excluded.workout_id,
      device_id=excluded.device_id,acquired_at=excluded.acquired_at,
      updated_at=excluded.updated_at,expires_at=excluded.expires_at
    where held.expires_at <= pg_catalog.clock_timestamp()
    returning held.lease_id into v_written;
  if v_written is null then
    return query select false,null::uuid,null::timestamptz,'Another device owns the workout lease'::text;
  else
    return query select true,v_written,v_expiry,null::text;
  end if;
end;
$$;

-- Older acquire RPC bypasses the synchronized ledger. Revoke it during this
-- rollout: old clients must fail closed rather than authorize unsynced load.
revoke all on function public.acquire_training_workout_lease(text,text) from authenticated;
revoke all on function public.publish_training_remote_plan(date,jsonb) from public,anon;
revoke all on function public.publish_training_remote_exposure(text,text,text,text,numeric,text[],timestamptz,date) from public,anon;
revoke all on function public.publish_training_remote_recovery(text,date,jsonb) from public,anon;
revoke all on function public.read_training_remote_snapshot(date) from public,anon;
revoke all on function public.acquire_training_workout_lease_v2(text,text,date,text,integer,text[]) from public,anon;
grant execute on function public.publish_training_remote_plan(date,jsonb) to authenticated;
grant execute on function public.publish_training_remote_exposure(text,text,text,text,numeric,text[],timestamptz,date) to authenticated;
grant execute on function public.publish_training_remote_recovery(text,date,jsonb) to authenticated;
grant execute on function public.read_training_remote_snapshot(date) to authenticated;
grant execute on function public.acquire_training_workout_lease_v2(text,text,date,text,integer,text[]) to authenticated;
