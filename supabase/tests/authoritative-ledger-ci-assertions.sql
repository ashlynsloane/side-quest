-- Executed against disposable Postgres 16 with mock auth.uid().
\set ON_ERROR_STOP on

do $verify_permissions$
begin
  if has_table_privilege('authenticated','public.training_remote_exposures','SELECT')
     or has_table_privilege('authenticated','public.training_remote_recovery','INSERT')
     or has_table_privilege('authenticated','public.training_remote_plans','UPDATE') then
    raise exception 'Direct remote ledger access is incorrectly granted';
  end if;
  if has_function_privilege('anon','public.acquire_training_workout_lease_v2(text,text,date,text,integer,text[])','EXECUTE')
     or has_function_privilege('authenticated','public.acquire_training_workout_lease(text,text)','EXECUTE') then
    raise exception 'Anonymous or legacy lease bypass remains possible';
  end if;
end
$verify_permissions$;

-- Earlier v1 lease test may have active test rows. Remove only as CI admin.
delete from public.training_workout_leases;

set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000001',false);

do $test_synchronized_training$
declare
  v_date date := current_date;
  v_plan jsonb := jsonb_build_array(
    jsonb_build_object('sessionId','planned-A','minutes',30,'regions',jsonb_build_array('general','achilles')),
    jsonb_build_object('sessionId','planned-B','minutes',20,'regions',jsonb_build_array('general','achilles'))
  );
  v_first record;
  v_other record;
  v_second record;
  v_renew record;
  v_denied record;
  v_json jsonb;
  v_completed_at timestamptz;
begin
  if not public.publish_training_remote_plan(v_date,v_plan) then
    raise exception 'First plan was not created';
  end if;
  if not public.publish_training_remote_plan(v_date,v_plan) then
    raise exception 'Exact plan retry failed';
  end if;
  select * into v_first from public.acquire_training_workout_lease_v2(
    'strength-A','device-1',v_date,'planned-A',30,array['general','achilles']::text[]);
  if not v_first.granted then raise exception 'Prescribed session should start: %',v_first.reason; end if;
  select * into v_other from public.acquire_training_workout_lease_v2(
    'strength-A','device-2',v_date,'planned-A',30,array['general','achilles']::text[]);
  if v_other.granted then raise exception 'Concurrent device started'; end if;

  if not public.release_training_workout_lease(v_first.lease_id,'device-1') then
    raise exception 'Could not release completed session lease';
  end if;
  -- A device crash or release without a completion upload must NOT restore
  -- the original session's authorized dose.
  select * into v_denied from public.acquire_training_workout_lease_v2(
    'strength-A','device-2',v_date,'planned-A',30,array['general','achilles']::text[]);
  if v_denied.granted then
    raise exception 'Unreported reserved workout was restarted after release';
  end if;
  v_completed_at := clock_timestamp()-interval '2 seconds';
  if not public.publish_training_remote_exposure(
      'completed-1','strength-A','planned-A','strength',30,
      array['general','achilles']::text[],v_completed_at,v_date) then
    raise exception 'Exposure was not recorded';
  end if;
  -- An identical retry is an upsert no-op, not duplicated dose.
  if not public.publish_training_remote_exposure(
      'completed-1','strength-A','planned-A','strength',30,
      array['general','achilles']::text[],
      v_completed_at,v_date) then
    raise exception 'Idempotent exposure retry failed';
  end if;

  select * into v_denied from public.acquire_training_workout_lease_v2(
    'strength-A','device-1',v_date,'planned-A',30,array['general','achilles']::text[]);
  if v_denied.granted then raise exception 'Completed planned session was started twice'; end if;
  select * into v_denied from public.acquire_training_workout_lease_v2(
    'strength-B','device-1',v_date,'planned-B',20,array['general','achilles']::text[]);
  if v_denied.granted then raise exception 'No post-exposure check-in yet'; end if;

  if not public.publish_training_remote_recovery(
    'recheck-1',v_date,'{"general":"stable","achilles":"stable"}'::jsonb) then
    raise exception 'Post-exposure recovery failed';
  end if;
  select * into v_second from public.acquire_training_workout_lease_v2(
    'strength-B','device-1',v_date,'planned-B',20,array['general','achilles']::text[]);
  if not v_second.granted then raise exception 'Second scheduled activity unexpectedly blocked: %',v_second.reason; end if;
  select * into v_renew from public.renew_training_workout_lease_v2(v_second.lease_id,'device-1');
  if not v_renew.renewed then raise exception 'Lease renewal unexpectedly failed: %',v_renew.reason; end if;

  if not public.publish_training_remote_recovery(
    'new-pain',v_date,'{"achilles":"worse"}'::jsonb) then
    raise exception 'Worsening symptom did not synchronize';
  end if;
  select * into v_renew from public.renew_training_workout_lease_v2(v_second.lease_id,'device-1');
  if v_renew.renewed then raise exception 'New pain must interrupt the remote lease'; end if;

  select public.read_training_remote_snapshot(v_date) into v_json;
  if jsonb_array_length(v_json->'exposures') <> 1
     or jsonb_array_length(v_json->'recovery') <> 2
     or jsonb_array_length(v_json->'reservations') <> 2
     or (v_json->'plan') is distinct from v_plan then
    raise exception 'Snapshot did not return canonical plan/exposure/recovery';
  end if;
end
$test_synchronized_training$;

-- A second account has no exposure or injury information from the first.
select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000002',false);
do $privacy$
declare
  snap jsonb;
  denied record;
begin
  select public.read_training_remote_snapshot(current_date) into snap;
  if jsonb_array_length(snap->'exposures') <> 0
    or jsonb_array_length(snap->'recovery') <> 0 or snap->'plan' <> 'null'::jsonb then
    raise exception 'Cross-account remote training information leak';
  end if;
  select * into denied from public.acquire_training_workout_lease_v2(
    'no-plan','phone',current_date,'S',20,array['general']::text[]);
  if denied.granted then raise exception 'Cloud workout without remote plan started'; end if;
end
$privacy$;
reset role;


-- Historical exposure batches are indivisible, authenticated and idempotent.
-- A conflicting second event must roll back a valid first event in the SAME
-- batch; a failed partial import cannot masquerade as complete reconciliation.
set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000002',false);
do $batch_tests$
declare
  v_date date := current_date;
  v_now timestamptz := pg_catalog.clock_timestamp()-interval '15 minutes';
  v_first jsonb;
  v_second jsonb;
  v_conflict jsonb;
  v_failed boolean := false;
  v_count integer;
begin
  v_first := pg_catalog.jsonb_build_object(
    'eventId','batch-1','workoutId','history-1','sessionId',null,
    'activity','bike','minutes',25,
    'regions',pg_catalog.jsonb_build_array('general','achilles'),
    'completedAt',v_now,'trainingDate',v_date);
  v_second := pg_catalog.jsonb_build_object(
    'eventId','batch-2','workoutId','history-2','sessionId',null,
    'activity','run','minutes',15,
    'regions',pg_catalog.jsonb_build_array('general','achilles'),
    'completedAt',v_now,'trainingDate',v_date);
  if public.publish_training_remote_exposure_batch(
    pg_catalog.jsonb_build_array(v_first,v_second)) <> 2 then
    raise exception 'Batch did not acknowledge both historical exposures';
  end if;
  if public.publish_training_remote_exposure_batch(
    pg_catalog.jsonb_build_array(v_first,v_second)) <> 2 then
    raise exception 'Exact batch retry should be idempotent';
  end if;
  select count(*) into v_count from public.training_remote_exposures
    where athlete_id=auth.uid() and event_id in ('batch-1','batch-2');
  if v_count <> 2 then raise exception 'Batch retry duplicated activity'; end if;

  v_conflict := pg_catalog.jsonb_set(v_first,'{minutes}','99'::jsonb);
  begin
    perform public.publish_training_remote_exposure_batch(
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_set(v_second,'{eventId}','"batch-should-rollback"'::jsonb),
        v_conflict
      ));
  exception when unique_violation then
    v_failed := true;
  end;
  if not v_failed then raise exception 'Conflicting historical revision was accepted'; end if;
  if exists(select 1 from public.training_remote_exposures
            where athlete_id=auth.uid() and event_id='batch-should-rollback') then
    raise exception 'Earlier batch item survived a later conflict';
  end if;
end
$batch_tests$;
reset role;
