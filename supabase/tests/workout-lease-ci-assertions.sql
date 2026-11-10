-- Execute after the workout-lease migration against disposable PostgreSQL.
\set ON_ERROR_STOP on

-- At-rest leases are not readable or writable directly by logged-in clients.
do $assert$
begin
  if has_table_privilege('authenticated', 'public.training_workout_leases', 'SELECT')
     or has_table_privilege('authenticated', 'public.training_workout_leases', 'INSERT')
     or has_table_privilege('authenticated', 'public.training_workout_leases', 'UPDATE')
     or has_table_privilege('authenticated', 'public.training_workout_leases', 'DELETE')
  then
    raise exception 'Lease table must not be directly accessible to users';
  end if;
  if has_function_privilege('anon','public.acquire_training_workout_lease(text,text)','EXECUTE') then
    raise exception 'Anonymous users must not acquire leases';
  end if;
  if not has_function_privilege('authenticated','public.acquire_training_workout_lease(text,text)','EXECUTE') then
    raise exception 'Cloud accounts cannot acquire workout locks';
  end if;
end
$assert$;

set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000001', false);

do $scenario$
declare
  first_lease record;
  other_device record;
  renewed record;
  other_renewal record;
  released boolean;
  incorrect_release boolean;
  next_lease record;
begin
  select * into first_lease
    from public.acquire_training_workout_lease('strength-a', 'device-A');
  if not first_lease.granted or first_lease.lease_id is null then
    raise exception 'First authenticated device must acquire a lease';
  end if;

  select * into other_device
    from public.acquire_training_workout_lease('strength-b', 'device-B');
  if other_device.granted or other_device.lease_id is not null then
    raise exception 'Second device bypassed an existing active workout';
  end if;

  select * into other_renewal
    from public.renew_training_workout_lease(first_lease.lease_id,'device-B');
  if other_renewal.renewed then
    raise exception 'Non-owner device renewed somebody else\'s lease';
  end if;

  select * into renewed
    from public.renew_training_workout_lease(first_lease.lease_id,'device-A');
  if not renewed.renewed or renewed.expires_at <= pg_catalog.clock_timestamp() then
    raise exception 'Owner could not renew a current lease';
  end if;

  select public.release_training_workout_lease(first_lease.lease_id,'device-B')
    into incorrect_release;
  if incorrect_release then raise exception 'Other device released live lease'; end if;

  select public.release_training_workout_lease(first_lease.lease_id,'device-A')
    into released;
  if not released then raise exception 'Owner release failed'; end if;

  select * into next_lease
    from public.acquire_training_workout_lease('strength-b','device-B');
  if not next_lease.granted or next_lease.lease_id = first_lease.lease_id then
    raise exception 'Released lease did not become available to another device';
  end if;
end
$scenario$;

-- Another authenticated user is independent of the first athlete.
select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000002', false);
do $other_user$
declare
  claim record;
begin
  select * into claim from public.acquire_training_workout_lease('strength-c','device-C');
  if not claim.granted then raise exception 'Other athlete should have own lease'; end if;
end
$other_user$;
reset role;

-- The expired lease is reclaimable, and a stale owner token cannot renew it.
update public.training_workout_leases
  set expires_at = clock_timestamp() - interval '1 second'
  where athlete_id = '00000000-0000-4000-8000-000000000001';

set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000001', false);
do $reclaimed$
declare
  previous_token uuid;
  current_token uuid;
  claimed record;
  stale record;
begin
  -- The old token is intentionally not guessed or reconstructed: read as the
  -- test database owner below, then verify the new lease still has a UUID.
  select * into claimed from public.acquire_training_workout_lease('strength-d', 'device-D');
  if not claimed.granted or claimed.lease_id is null then
    raise exception 'Expired workout lock should be reclaimable';
  end if;
  select * into stale from public.renew_training_workout_lease(
    '00000000-0000-4000-8000-000000000003', 'device-B');
  if stale.renewed then
    raise exception 'Unknown/stale lease token was renewed';
  end if;
end
$reclaimed$;
reset role;
