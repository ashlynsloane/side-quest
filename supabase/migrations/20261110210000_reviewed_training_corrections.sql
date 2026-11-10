-- Reviewed training-history amendments, migration 3. Apply AFTER both 20261110
-- migrations. Original ledger rows are never mutated or deleted by correction.
-- Pending requests and rejected changes have ZERO effect on authorization.
-- Only the server's service_role can authorize an amendment.
create table public.training_remote_correction_requests (
  athlete_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null check (length(request_id) between 1 and 128),
  target_type text not null check (target_type in ('exposure','reservation')),
  target_id text not null check (length(target_id) between 1 and 128),
  training_date date not null,
  action text not null check (action in ('retract','replace_minutes')),
  corrected_minutes numeric(9,2),
  reason_code text not null check (reason_code in (
    'duplicate','import_error','duration_error','never_started','other'
  )),
  requested_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (athlete_id,request_id),
  constraint correction_value_shape check (
    (action='retract' and corrected_minutes is null)
    or (action='replace_minutes' and target_type='exposure'
        and corrected_minutes > 0 and corrected_minutes <= 1440)
  )
);
create table public.training_remote_correction_decisions (
  athlete_id uuid not null,
  request_id text not null,
  outcome text not null check (outcome in ('approved','rejected')),
  review_reference text not null check (length(review_reference) between 8 and 128),
  decided_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (athlete_id,request_id),
  foreign key (athlete_id,request_id)
    references public.training_remote_correction_requests(athlete_id,request_id)
    on delete cascade
);
create table public.training_remote_approved_amendments (
  athlete_id uuid not null,
  target_type text not null,
  target_id text not null,
  training_date date not null,
  request_id text not null,
  action text not null,
  corrected_minutes numeric(9,2),
  approved_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (athlete_id,target_type,target_id,training_date),
  unique (athlete_id,request_id),
  foreign key (athlete_id,request_id)
    references public.training_remote_correction_decisions(athlete_id,request_id)
    on delete cascade
);
create index training_remote_correction_requests_by_athlete
  on public.training_remote_correction_requests(athlete_id,requested_at desc);
alter table public.training_remote_correction_requests enable row level security;
alter table public.training_remote_correction_decisions enable row level security;
alter table public.training_remote_approved_amendments enable row level security;
revoke all on table public.training_remote_correction_requests from public,anon,authenticated;
revoke all on table public.training_remote_correction_decisions from public,anon,authenticated;
revoke all on table public.training_remote_approved_amendments from public,anon,authenticated;

-- A correction is a separate auditable request, never a client overwrite.
create or replace function public.request_training_remote_correction(
  p_request_id text, p_target_type text, p_target_id text,
  p_training_date date, p_action text, p_corrected_minutes numeric,
  p_reason_code text
)
returns boolean language plpgsql security definer set search_path = ''
as $request$
declare
  v_user uuid := auth.uid();
  v_existing public.training_remote_correction_requests%rowtype;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if length(coalesce(p_request_id,'')) not between 1 and 128
    or length(coalesce(p_target_id,'')) not between 1 and 128
    or p_target_type not in ('exposure','reservation')
    or p_action not in ('retract','replace_minutes')
    or p_reason_code not in ('duplicate','import_error','duration_error','never_started','other')
    or p_training_date is null or p_training_date > current_date + 1
    or p_training_date < current_date - 365
    or (p_action='retract' and p_corrected_minutes is not null)
    or (p_action='replace_minutes' and (p_target_type <> 'exposure'
         or p_corrected_minutes is null or p_corrected_minutes <= 0
         or p_corrected_minutes > 1440 or p_corrected_minutes <> round(p_corrected_minutes,2))) then
    raise exception 'Invalid correction request' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,91829));
  if p_target_type='exposure' then
    if not exists (select 1 from public.training_remote_exposures
      where athlete_id=v_user and event_id=p_target_id
        and training_date=p_training_date) then
      raise exception 'Correction target is missing from this athlete ledger'
        using errcode='22023';
    end if;
  elsif not exists (select 1 from public.training_remote_reservations
      where athlete_id=v_user and session_id=p_target_id
        and training_date=p_training_date) then
    raise exception 'Correction reservation is missing from this athlete ledger'
      using errcode='22023';
  end if;
  insert into public.training_remote_correction_requests(
    athlete_id,request_id,target_type,target_id,training_date,
    action,corrected_minutes,reason_code
  ) values (v_user,p_request_id,p_target_type,p_target_id,p_training_date,
    p_action,p_corrected_minutes,p_reason_code) on conflict do nothing;
  select * into v_existing from public.training_remote_correction_requests
    where athlete_id=v_user and request_id=p_request_id;
  if v_existing.target_type is distinct from p_target_type
    or v_existing.target_id is distinct from p_target_id
    or v_existing.training_date is distinct from p_training_date
    or v_existing.action is distinct from p_action
    or v_existing.corrected_minutes is distinct from p_corrected_minutes
    or v_existing.reason_code is distinct from p_reason_code then
    raise exception 'Correction request ID reused with different data' using errcode='23505';
  end if;
  return true;
end;
$request$;

-- The admin/service backend alone can finalize a request. An ordinary JWT
-- cannot approve its own requests; authorization and decision share a lock.
create or replace function public.review_training_remote_correction(
  p_athlete_id uuid, p_request_id text, p_outcome text, p_review_reference text
)
returns boolean language plpgsql security definer set search_path = ''
as $review$
declare
  v_request public.training_remote_correction_requests%rowtype;
  v_decision public.training_remote_correction_decisions%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required to review a correction' using errcode='42501';
  end if;
  if p_athlete_id is null or length(coalesce(p_request_id,'')) not between 1 and 128
    or p_outcome not in ('approved','rejected')
    or length(coalesce(p_review_reference,'')) not between 8 and 128 then
    raise exception 'Invalid correction decision' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_athlete_id::text,91829));
  select * into v_request from public.training_remote_correction_requests
    where athlete_id=p_athlete_id and request_id=p_request_id;
  if not found then raise exception 'Correction request not found' using errcode='22023'; end if;
  select * into v_decision from public.training_remote_correction_decisions
    where athlete_id=p_athlete_id and request_id=p_request_id;
  if found then
    if v_decision.outcome is distinct from p_outcome
      or v_decision.review_reference is distinct from p_review_reference then
      raise exception 'Reviewed correction decision is immutable' using errcode='23505';
    end if;
    return true;
  end if;
  if p_outcome='approved' then
    if exists(select 1 from public.training_workout_leases
      where athlete_id=p_athlete_id and expires_at > pg_catalog.clock_timestamp()) then
      raise exception 'Active athlete lease prevents a correction review'
        using errcode='55000';
    end if;
    if exists(select 1 from public.training_remote_approved_amendments
      where athlete_id=p_athlete_id and target_type=v_request.target_type
        and target_id=v_request.target_id
        and training_date=v_request.training_date) then
      raise exception 'Ledger target already has an approved amendment' using errcode='23505';
    end if;
    -- Recheck the original target under the same athlete-scoped lock.
    if v_request.target_type='exposure' and not exists (
      select 1 from public.training_remote_exposures
      where athlete_id=p_athlete_id and event_id=v_request.target_id
        and training_date=v_request.training_date
    ) then raise exception 'Exposure correction target missing' using errcode='22023'; end if;
    if v_request.target_type='reservation' and not exists (
      select 1 from public.training_remote_reservations
      where athlete_id=p_athlete_id and session_id=v_request.target_id
        and training_date=v_request.training_date
    ) then raise exception 'Reservation correction target missing' using errcode='22023'; end if;
  end if;
  insert into public.training_remote_correction_decisions(
    athlete_id,request_id,outcome,review_reference
  ) values(p_athlete_id,p_request_id,p_outcome,p_review_reference);
  if p_outcome='approved' then
    insert into public.training_remote_approved_amendments(
      athlete_id,target_type,target_id,training_date,request_id,action,corrected_minutes
    ) values (p_athlete_id,v_request.target_type,v_request.target_id,
      v_request.training_date,p_request_id,v_request.action,v_request.corrected_minutes);
  end if;
  return true;
end;
$review$;

-- Effective rows are derived from immutable originals + an approved decision.
-- Keep the views private; SECURITY DEFINER RPCs remain the only user reads.
create view public.training_remote_effective_exposures as
select e.athlete_id,e.event_id,e.workout_id,e.session_id,e.activity,
  case when a.action='replace_minutes' then a.corrected_minutes else e.minutes end as minutes,
  e.regions,e.completed_at,e.training_date,e.recorded_at,
  coalesce(a.action='retract',false) as retracted
from public.training_remote_exposures e
left join public.training_remote_approved_amendments a
  on a.athlete_id=e.athlete_id and a.target_type='exposure'
    and a.target_id=e.event_id and a.training_date=e.training_date;
create view public.training_remote_effective_reservations as
select r.athlete_id,r.training_date,r.session_id,r.workout_id,
  r.authorized_minutes,r.regions,r.acquired_at,
  coalesce(a.action='retract',false) as retracted
from public.training_remote_reservations r
left join public.training_remote_approved_amendments a
  on a.athlete_id=r.athlete_id and a.target_type='reservation'
    and a.target_id=r.session_id and a.training_date=r.training_date;
revoke all on table public.training_remote_effective_exposures from public,anon,authenticated;
revoke all on table public.training_remote_effective_reservations from public,anon,authenticated;

create or replace function public.read_training_remote_corrections(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = ''
as $read_corrections$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 200 then
    raise exception 'Invalid correction list limit' using errcode='22023';
  end if;
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'requestId',q.request_id,'targetType',q.target_type,'targetId',q.target_id,
      'trainingDate',q.training_date,'action',q.action,
      'correctedMinutes',q.corrected_minutes,'reasonCode',q.reason_code,
      'requestedAt',q.requested_at,
      'outcome',d.outcome,'reviewReference',d.review_reference,
      'decidedAt',d.decided_at
    ) order by q.requested_at desc)
    from (select * from public.training_remote_correction_requests
      where athlete_id=v_user order by requested_at desc limit p_limit) q
    left join public.training_remote_correction_decisions d
      on d.athlete_id=q.athlete_id and d.request_id=q.request_id
  ),'[]'::jsonb);
end;
$read_corrections$;

-- Replace the gate/read RPC bodies to use only APPROVED effective doses.
-- Permanent session-identity checks intentionally still consult raw rows:
-- an approved retraction must NEVER turn one session into a new session.

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
     or (v_row.minutes is distinct from p_minutes
          and not exists (
            select 1 from public.training_remote_approved_amendments as a
            where a.athlete_id=v_user and a.target_type='exposure'
              and a.target_id=p_event_id and a.training_date=p_training_date
              and a.action='replace_minutes' and a.corrected_minutes=p_minutes
          ))
     or v_row.regions is distinct from p_regions
     or v_row.completed_at is distinct from p_completed_at
     or v_row.training_date is distinct from p_training_date then
    raise exception 'Exposure event ID reused with conflicting data' using errcode='23505';
  end if;
  return true;
end;
$$;

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
  v_reserved numeric;
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
  select coalesce(sum(authorized_minutes),0) into v_reserved
    from public.training_remote_effective_reservations
    where athlete_id=v_user and training_date=p_training_date and not retracted;
  select coalesce(sum(exposure.minutes),0) into v_consumed
    from public.training_remote_effective_exposures as exposure
    where exposure.athlete_id=v_user and not exposure.retracted and exposure.training_date=p_training_date
      and exposure.activity='strength'
      and not exists(select 1 from public.training_remote_effective_reservations as reservation
        where not reservation.retracted and reservation.athlete_id=exposure.athlete_id
          and reservation.training_date=exposure.training_date
          and reservation.session_id=exposure.session_id);
  if v_reserved + v_consumed + p_planned_minutes > v_budget
     or exists(select 1 from public.training_remote_reservations
       where athlete_id=v_user and training_date=p_training_date and session_id=p_session_id)
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
    select greatest(
      (select max(completed_at) from public.training_remote_effective_exposures
       where athlete_id=v_user and not retracted and completed_at >= pg_catalog.clock_timestamp()-interval '48 hours'
         and v_region=any(regions)),
      (select max(reservation.acquired_at + reservation.authorized_minutes * interval '1 minute')
       from public.training_remote_effective_reservations as reservation
       where not reservation.retracted and reservation.athlete_id=v_user
         and reservation.acquired_at >= pg_catalog.clock_timestamp()-interval '48 hours'
         and v_region=any(reservation.regions)
         and not exists (
           select 1 from public.training_remote_effective_exposures as completed
           where not completed.retracted and completed.athlete_id=reservation.athlete_id
             and completed.training_date=reservation.training_date
             and completed.session_id=reservation.session_id
         ))
    ) into v_last_exposure;
    if v_last_exposure is not null
      and (v_latest_status is distinct from 'stable' or v_latest_observed is null
           or v_latest_observed <= v_last_exposure) then
      return query select false,null::uuid,null::timestamptz,'Post-exposure regional recovery check required'::text;
      return;
    end if;
  end loop;
  insert into public.training_workout_leases as held(
    athlete_id,lease_id,workout_id,device_id,acquired_at,updated_at,expires_at,
    training_date,session_id,authorized_minutes,authorized_regions
  ) values (
    v_user,v_token,p_workout_id,p_device_id,pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp(),v_expiry,p_training_date,p_session_id,p_planned_minutes,p_regions
  ) on conflict(athlete_id) do update
    set lease_id=excluded.lease_id, workout_id=excluded.workout_id,
      device_id=excluded.device_id,acquired_at=excluded.acquired_at,
      updated_at=excluded.updated_at,expires_at=excluded.expires_at,
      training_date=excluded.training_date,session_id=excluded.session_id,
      authorized_minutes=excluded.authorized_minutes,
      authorized_regions=excluded.authorized_regions
    where held.expires_at <= pg_catalog.clock_timestamp()
    returning held.lease_id into v_written;
  if v_written is null then
    return query select false,null::uuid,null::timestamptz,'Another device owns the workout lease'::text;
  else
    insert into public.training_remote_reservations(
      athlete_id,training_date,session_id,workout_id,authorized_minutes,regions
    ) values (v_user,p_training_date,p_session_id,p_workout_id,p_planned_minutes,p_regions);
    return query select true,v_written,v_expiry,null::text;
  end if;
end;
$$;

create or replace function public.renew_training_workout_lease_v2(
  p_lease_id uuid, p_device_id text
)
returns table(renewed boolean, expires_at timestamptz, reason text)
language plpgsql security definer set search_path = ''
as $remote_renew$
declare
  v_user uuid := auth.uid();
  v_held public.training_workout_leases%rowtype;
  v_region text;
  v_status text;
  v_observed timestamptz;
  v_last_exposure timestamptz;
  v_new_expiry timestamptz := pg_catalog.clock_timestamp()+interval '90 seconds';
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_lease_id is null or length(coalesce(p_device_id,'')) not between 1 and 128 then
    raise exception 'Invalid renewal request' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,91829));
  select * into v_held from public.training_workout_leases as held
    where held.athlete_id=v_user and held.lease_id=p_lease_id
      and held.device_id=p_device_id
      and held.expires_at > pg_catalog.clock_timestamp() for update;
  if not found or v_held.training_date is null or v_held.authorized_regions is null then
    return query select false,null::timestamptz,'Lease expired, lost, or created by an outdated client'::text;
    return;
  end if;
  if exists(select 1 from public.training_remote_exposures
      where athlete_id=v_user and session_id=v_held.session_id
        and training_date=v_held.training_date)
    or exists(select 1 from public.training_remote_exposures
      where athlete_id=v_user and completed_at > v_held.acquired_at) then
    return query select false,null::timestamptz,'A new completed exposure requires fresh authorization'::text;
    return;
  end if;
  foreach v_region in array array['general','achilles','upper_back']::text[] loop
    if v_region <> 'general' and not (v_region=any(v_held.authorized_regions)) then continue; end if;
    select status,observed_at into v_status,v_observed
      from public.training_remote_recovery
      where athlete_id=v_user and region=v_region
      order by observed_at desc,event_id desc limit 1;
    if v_status in ('worse','red_flag') then
      return query select false,null::timestamptz,'New regional recovery restriction'::text;
      return;
    end if;
    select greatest(
      (select max(completed_at) from public.training_remote_effective_exposures
       where athlete_id=v_user and not retracted
         and completed_at >= pg_catalog.clock_timestamp()-interval '48 hours'
         and v_region=any(regions)),
      (select max(reservation.acquired_at + reservation.authorized_minutes * interval '1 minute')
       from public.training_remote_effective_reservations as reservation
       where not reservation.retracted and reservation.athlete_id=v_user
         and reservation.session_id <> v_held.session_id
         and reservation.acquired_at >= pg_catalog.clock_timestamp()-interval '48 hours'
         and v_region=any(reservation.regions)
         and not exists (
           select 1 from public.training_remote_effective_exposures as completed
           where not completed.retracted and completed.athlete_id=reservation.athlete_id
             and completed.training_date=reservation.training_date
             and completed.session_id=reservation.session_id
         ))
    ) into v_last_exposure;
    if v_last_exposure is not null
      and (v_status is distinct from 'stable'
           or v_observed is null or v_observed <= v_last_exposure) then
      return query select false,null::timestamptz,'Post-exposure regional assessment required'::text;
      return;
    end if;
  end loop;
  update public.training_workout_leases as held set
    expires_at=v_new_expiry,updated_at=pg_catalog.clock_timestamp()
    where held.athlete_id=v_user and held.lease_id=p_lease_id
      and held.device_id=p_device_id
    returning held.expires_at into v_new_expiry;
  return query select true,v_new_expiry,null::text;
end;
$remote_renew$;

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
      from public.training_remote_effective_exposures
      where athlete_id=v_user and not retracted and completed_at >= pg_catalog.clock_timestamp()-interval '48 hours'
    ),'[]'::jsonb),
    'reservations',coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'sessionId',session_id,'workoutId',workout_id,
        'minutes',authorized_minutes,'regions',regions,
        'acquiredAt',acquired_at,'trainingDate',training_date
      ) order by acquired_at)
      from public.training_remote_effective_reservations
      where athlete_id=v_user and training_date=p_training_date and not retracted
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

-- Revoke PostgreSQL's implicit PUBLIC execute privilege on new RPCs.
revoke all on function public.request_training_remote_correction(text,text,text,date,text,numeric,text) from public,anon;
revoke all on function public.review_training_remote_correction(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.read_training_remote_corrections(integer) from public,anon;
grant execute on function public.request_training_remote_correction(text,text,text,date,text,numeric,text) to authenticated;
grant execute on function public.read_training_remote_corrections(integer) to authenticated;
grant execute on function public.review_training_remote_correction(uuid,text,text,text) to service_role;
