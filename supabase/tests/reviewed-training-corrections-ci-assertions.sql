-- Executed only after the three ledger migrations and original PostgreSQL CI tests.
-- These tests distinguish pending, rejected and approved corrections.
\set ON_ERROR_STOP on
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000004') on conflict do nothing;
do $permissions$
begin
  if has_function_privilege('authenticated',
    'public.review_training_remote_correction(uuid,text,text,text)','EXECUTE')
    or has_function_privilege('anon',
    'public.request_training_remote_correction(text,text,text,date,text,numeric,text)','EXECUTE')
    or has_table_privilege('authenticated','public.training_remote_approved_amendments','SELECT')
    or has_table_privilege('authenticated','public.training_remote_effective_exposures','SELECT')
    or has_table_privilege('authenticated','public.training_remote_effective_reservations','SELECT') then
    raise exception 'Correction approval or effective-dose tables are exposed';
  end if;
end
$permissions$;

set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000004',false);

do $requester$
declare
  v_day date := current_date;
  v_original timestamptz := clock_timestamp()-interval '20 minutes';
  v_snap jsonb;
  v_id text;
begin
  perform public.publish_training_remote_plan(v_day,jsonb_build_array(
    jsonb_build_object('sessionId','corr-A','minutes',30,'regions',jsonb_build_array('general')),
    jsonb_build_object('sessionId','corr-B','minutes',20,'regions',jsonb_build_array('general')),
    jsonb_build_object('sessionId','region-guard','minutes',10,
      'regions',jsonb_build_array('general','achilles'))
  ));
  perform public.publish_training_remote_exposure('correction-bike','bike-id',null,'bike',
    25,array['general']::text[],v_original,v_day);
  if not public.request_training_remote_correction('request-minutes','exposure',
    'correction-bike',v_day,'replace_minutes',10,'duration_error') then
    raise exception 'Correction request submission failed';
  end if;
  if not public.request_training_remote_correction('request-minutes','exposure',
    'correction-bike',v_day,'replace_minutes',10,'duration_error') then
    raise exception 'Idempotent request submission failed';
  end if;
  begin
    perform public.request_training_remote_correction('request-minutes','exposure',
      'correction-bike',v_day,'replace_minutes',5,'duration_error');
    raise exception 'Reusing request ID changed immutable request';
  exception when unique_violation then null;
  end;
  perform public.request_training_remote_correction('request-reject','exposure',
    'correction-bike',v_day,'retract',null,'duplicate');
  perform public.publish_training_remote_exposure('correction-double','bike-2',null,'bike',
    25,array['general']::text[],v_original,v_day);
  perform public.request_training_remote_correction('request-remove','exposure',
    'correction-double',v_day,'retract',null,'duplicate');
  select public.read_training_remote_snapshot(v_day) into v_snap;
  if not exists(select 1 from jsonb_array_elements(v_snap->'exposures') as x(value)
    where x.value->>'eventId'='correction-bike' and (x.value->>'minutes')::numeric=25)
    or jsonb_array_length(v_snap->'exposures') <> 2 then
    raise exception 'A pending request modified completed activity';
  end if;
  if jsonb_array_length(public.read_training_remote_corrections(100)) <> 3 then
    raise exception 'Correction request list unreadable';
  end if;
  -- An authenticated client cannot execute the administrative decision.
  begin
    perform public.review_training_remote_correction(
      '00000000-0000-4000-8000-000000000004','request-minutes','approved','CASE-REVIEW-001');
    raise exception 'Athlete approved own correction';
  exception when insufficient_privilege then null;
  end;
end
$requester$;
reset role;

-- The privileged review backend must use the service role, never the mobile JWT.
set role service_role;
select set_config('request.jwt.claim.role','service_role',false);
do $approvals$
declare
  v_athlete uuid := '00000000-0000-4000-8000-000000000004';
begin
  perform public.review_training_remote_correction(
    v_athlete,'request-reject','rejected','CASE-REVIEW-REJECT');
  perform public.review_training_remote_correction(
    v_athlete,'request-minutes','approved','CASE-REVIEW-001');
  perform public.review_training_remote_correction(
    v_athlete,'request-minutes','approved','CASE-REVIEW-001');
  begin
    perform public.review_training_remote_correction(
      v_athlete,'request-minutes','rejected','CASE-REVIEW-001');
    raise exception 'Approved amendment became a rejection';
  exception when unique_violation then null;
  end;
  perform public.review_training_remote_correction(
    v_athlete,'request-remove','approved','CASE-REVIEW-REMOVE');
end
$approvals$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000004',false);
do $effective$
declare
  v_day date := current_date;
  v_saved timestamptz;
  v_snap jsonb;
  v_start record;
begin
  -- Read-only snapshot must now reflect APPROVED amendments, never proposals.
  select public.read_training_remote_snapshot(v_day) into v_snap;
  if jsonb_array_length(v_snap->'exposures') <> 1
    or (v_snap->'exposures'->0->>'eventId') <> 'correction-bike'
    or (v_snap->'exposures'->0->>'minutes')::numeric <> 10 then
    raise exception 'Approved amendments were not applied to effective exposure read';
  end if;
  v_saved := (v_snap->'exposures'->0->>'completedAt')::timestamptz;
  if not exists(select 1 from jsonb_array_elements(
    public.read_training_remote_corrections(100)) as item(value)
    where item.value->>'requestId'='request-reject'
      and item.value->>'outcome'='rejected') then
    raise exception 'Rejected correction audit was lost';
  end if;
  perform public.publish_training_remote_exposure(
    'correction-bike','bike-id',null,'bike',10,array['general']::text[],
    v_saved,v_day);
  begin
    perform public.publish_training_remote_exposure(
      'correction-bike','bike-id',null,'bike',11,array['general']::text[],
      v_saved,v_day);
    raise exception 'Unapproved local re-edit passed ledger sync';
  exception when unique_violation then null;
  end;
  -- A stale device replaying the original minute value must not undo review.
  perform public.publish_training_remote_exposure(
    'correction-bike','bike-id',null,'bike',25,array['general']::text[],
    v_saved,v_day);
  perform public.publish_training_remote_recovery(
    'post-correction-review',v_day,'{"general":"stable"}'::jsonb);
  select * into v_start from public.acquire_training_workout_lease_v2(
    'corr-workout-A','phone-3',v_day,'corr-A',30,array['general']::text[]);
  if not v_start.granted then raise exception 'Prepared corrected athlete unable to start: %',v_start.reason; end if;
  perform public.request_training_remote_correction('reservation-retract','reservation',
    'corr-A',v_day,'retract',null,'never_started');
  perform set_config('sidequest.correction_lease_id',v_start.lease_id::text,false);
end
$effective$;
reset role;

set role service_role;
select set_config('request.jwt.claim.role','service_role',false);
do $active_lease_restriction$
begin
  begin
    perform public.review_training_remote_correction(
      '00000000-0000-4000-8000-000000000004',
      'reservation-retract','approved','CASE-REVIEW-RESERVE');
    raise exception 'Reviewer changed dose while an athlete held an active lease';
  exception when sqlstate '55000' then null;
  end;
end
$active_lease_restriction$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000004',false);
do $release$
begin
  if not public.release_training_workout_lease(
    current_setting('sidequest.correction_lease_id')::uuid,'phone-3') then
    raise exception 'Failed to release active lease for reviewed reservation';
  end if;
end
$release$;
reset role;

set role service_role;
select set_config('request.jwt.claim.role','service_role',false);
select public.review_training_remote_correction(
  '00000000-0000-4000-8000-000000000004',
  'reservation-retract','approved','CASE-REVIEW-RESERVE');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000004',false);
do $reservation_and_isolation$
declare
  v_snap jsonb;
  v_denied record;
  v_eligible record;
begin
  select public.read_training_remote_snapshot(current_date) into v_snap;
  if jsonb_array_length(v_snap->'reservations') <> 0 then
    raise exception 'Approved unused reservation remains counted in effective snapshot';
  end if;
  select * into v_denied from public.acquire_training_workout_lease_v2(
    'corr-workout-A','phone-4',current_date,'corr-A',30,array['general']::text[]);
  if v_denied.granted then
    raise exception 'Correction allowed reuse of an already claimed session ID';
  end if;
  -- A client must NOT underreport the Achilles region from an approved plan.
  select * into v_denied from public.acquire_training_workout_lease_v2(
    'region-cheat','phone-4',current_date,'region-guard',10,array['general']::text[]);
  if v_denied.granted or v_denied.reason is distinct from 'Workout exceeds synchronized prescription' then
    raise exception 'Reduced client region list bypassed Achilles recovery gating';
  end if;
  select * into v_eligible from public.acquire_training_workout_lease_v2(
    'corr-workout-B','phone-4',current_date,'corr-B',20,array['general']::text[]);
  if not v_eligible.granted then
    raise exception 'Approved unused reservation did not restore distinct-session budget: %',
      v_eligible.reason;
  end if;
end
$reservation_and_isolation$;

select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000002',false);
do $privacy$
begin
  if jsonb_array_length(public.read_training_remote_corrections(100)) <> 0 then
    raise exception 'Other athlete correction data leaked';
  end if;
  begin
    perform public.request_training_remote_correction('cross-account','exposure',
      'correction-bike',current_date,'retract',null,'duplicate');
    raise exception 'Other athlete requested correction to an unowned exposure';
  exception when invalid_parameter_value then null;
  end;
end
$privacy$;
reset role;

-- A reserved workout with a reported completion is NOT a never-started dose.
-- The requested correction must remain pending, not erase history on approval.
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000005')
  on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000005',false);
do $completed_reservation_setup$
declare
  v_claim record;
begin
  perform public.publish_training_remote_plan(current_date,jsonb_build_array(
    jsonb_build_object('sessionId','actually-done','minutes',20,
      'regions',jsonb_build_array('general')),
    jsonb_build_object('sessionId','next-planned','minutes',20,
      'regions',jsonb_build_array('general'))
  ));
  select * into v_claim from public.acquire_training_workout_lease_v2(
    'session-done','device-completed',current_date,'actually-done',20,
    array['general']::text[]);
  if not v_claim.granted then
    raise exception 'Test fixture could not acquire completed session lease: %',v_claim.reason;
  end if;
  perform public.release_training_workout_lease(v_claim.lease_id,'device-completed');
  perform public.publish_training_remote_exposure(
    'reported-done','session-done','actually-done','strength',20,
    array['general']::text[],clock_timestamp()-interval '1 second',current_date);
  perform public.request_training_remote_correction(
    'false-unused-request','reservation','actually-done',current_date,
    'retract',null,'never_started');
end
$completed_reservation_setup$;
reset role;

set role service_role;
select set_config('request.jwt.claim.role','service_role',false);
do $completed_reservation_denial$
begin
  begin
    perform public.review_training_remote_correction(
      '00000000-0000-4000-8000-000000000005',
      'false-unused-request','approved','CASE-NO-DONE-RETRACT');
    raise exception 'Completed workout reservation was incorrectly retracted';
  exception when sqlstate '55000' then
    null;
  end;
end
$completed_reservation_denial$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000005',false);
do $completed_reservation_still_active$
declare
  v_snap jsonb;
begin
  select public.read_training_remote_snapshot(current_date) into v_snap;
  if jsonb_array_length(v_snap->'reservations') <> 1
     or jsonb_array_length(v_snap->'exposures') <> 1
     or (public.read_training_remote_corrections(100)->0->>'outcome') is not null then
    raise exception 'Denied completion correction changed effective load or review state';
  end if;
end
$completed_reservation_still_active$;
reset role;

-- Recovery supersession is a correctness requirement: a timed-out old
-- "stable" packet must not clear a newer worsening report on another phone.
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000006')
  on conflict do nothing;
do $supersession_permissions$
begin
  if has_function_privilege('anon',
    'public.publish_training_remote_recovery_restrictive(text,date,jsonb,text)','EXECUTE')
    or has_table_privilege('authenticated',
    'public.training_remote_recovery_supersessions','SELECT') then
    raise exception 'Restrictive recovery supersession is publicly exposed';
  end if;
end
$supersession_permissions$;

set role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000006',false);
do $restrictive_recovery$
declare
  v_day date := current_date;
  v_snapshot jsonb;
  v_first timestamptz;
  v_latest text;
  v_rejected boolean;
begin
  -- New restrictive update arrives before the delayed old stable RPC.
  perform public.publish_training_remote_recovery_restrictive(
    'new-worse',v_day,'{"achilles":"worse"}'::jsonb,'lost-stable');
  begin
    perform public.publish_training_remote_recovery(
      'lost-stable',v_day,'{"achilles":"stable"}'::jsonb);
    raise exception 'Superseded late stable report was wrongly accepted';
  exception when unique_violation then null;
  end;
  if exists (select 1 from pg_catalog.jsonb_array_elements(
      (public.read_training_remote_snapshot(v_day))->'recovery') x(value)
    where x.value->>'region'='achilles' and x.value->>'status'='stable') then
    raise exception 'The late stable attempt cleared worse symptoms';
  end if;
  select (x.value->>'observedAt')::timestamptz into v_first
    from pg_catalog.jsonb_array_elements(
      (public.read_training_remote_snapshot(v_day))->'recovery') x(value)
    where x.value->>'region'='achilles';
  perform public.publish_training_remote_recovery_restrictive(
    'new-worse',v_day,'{"achilles":"worse"}'::jsonb,'lost-stable');
  if (select (x.value->>'observedAt')::timestamptz
    from pg_catalog.jsonb_array_elements(
      (public.read_training_remote_snapshot(v_day))->'recovery') x(value)
    where x.value->>'region'='achilles') <> v_first then
    raise exception 'Restrictive retry changed server observation timestamp';
  end if;
  begin
    perform public.publish_training_remote_recovery_restrictive(
      'new-worse',v_day,'{"achilles":"stable"}'::jsonb,'lost-stable');
    raise exception 'A non-restrictive supersession was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.publish_training_remote_recovery_restrictive(
      'other-event',v_day,'{"achilles":"worse"}'::jsonb,'lost-stable');
    raise exception 'An existing supersession was silently rewritten';
  exception when unique_violation then null;
  end;

  -- Also handle a previously committed stable packet: the newer
  -- restrictive event MUST be latest by server-assigned observed_at.
  perform public.publish_training_remote_recovery(
    'arrived-stable',v_day,'{"upper_back":"stable"}'::jsonb);
  perform public.publish_training_remote_recovery_restrictive(
    'new-red-flag',v_day,'{"upper_back":"red_flag"}'::jsonb,'arrived-stable');
  select x.value->>'status' into v_latest
    from pg_catalog.jsonb_array_elements(
      (public.read_training_remote_snapshot(v_day))->'recovery') x(value)
    where x.value->>'region'='upper_back';
  if v_latest <> 'red_flag' then
    raise exception 'Server observation order did not preserve latest red flag';
  end if;
  begin
    perform public.publish_training_remote_recovery(
      'arrived-stable',v_day,'{"upper_back":"stable"}'::jsonb);
    raise exception 'Completed stale recovery replay was not tombstoned';
  exception when unique_violation then null;
  end;
end
$restrictive_recovery$;
reset role;
