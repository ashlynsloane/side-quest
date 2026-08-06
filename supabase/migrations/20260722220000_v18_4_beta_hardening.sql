-- Side Quest V18.4: athlete-approved coach proposals, confirmed shared-workout
-- substitutions, privacy-safe cloud deletion, and integration hardening.

alter table public.coach_access_grants
  add column if not exists expires_at timestamptz;
update public.coach_access_grants
set expires_at = coalesce(expires_at, accepted_at + interval '90 days');
alter table public.coach_access_grants
  alter column expires_at set default (now() + interval '90 days');

create or replace function public.accept_coach_invite(p_code text, p_display_name text)
returns setof public.coach_access_grants
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.coach_invites%rowtype;
  grant_row public.coach_access_grants%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into invite_row from public.coach_invites
  where coach_invites.code = upper(trim(p_code))
    and coach_invites.status = 'pending'
    and coach_invites.expires_at > now()
  for update;
  if not found then raise exception 'That coach code is invalid or expired.'; end if;
  if invite_row.athlete_id = auth.uid() then raise exception 'You cannot coach your own account.'; end if;

  insert into public.coach_access_grants(
    athlete_id, coach_id, athlete_display_name, coach_display_name, status,
    can_view_future_strength, can_edit_future_strength, accepted_at, revoked_at, expires_at
  ) values (
    invite_row.athlete_id, auth.uid(), invite_row.athlete_display_name,
    coalesce(nullif(trim(p_display_name),''),'Coach'), 'active', true, true, now(), null,
    now() + interval '90 days'
  )
  on conflict (athlete_id, coach_id) do update set
    athlete_display_name = excluded.athlete_display_name,
    coach_display_name = excluded.coach_display_name,
    status = 'active', can_view_future_strength = true, can_edit_future_strength = true,
    accepted_at = now(), revoked_at = null, expires_at = now() + interval '90 days'
  returning * into grant_row;

  update public.coach_invites set status='accepted', accepted_by=auth.uid(), accepted_at=now()
  where id=invite_row.id;
  return next grant_row;
end;
$$;

create table if not exists public.coach_session_proposals (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  coach_display_name text not null,
  local_session_id text not null,
  baseline_json jsonb not null,
  proposed_json jsonb not null,
  coach_note text,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','superseded')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  athlete_note text
);
create index if not exists coach_proposals_athlete_status_idx
  on public.coach_session_proposals(athlete_id, status, created_at desc);
create index if not exists coach_proposals_coach_idx
  on public.coach_session_proposals(coach_id, created_at desc);
alter table public.coach_session_proposals enable row level security;

drop policy if exists coach_proposals_participant_select on public.coach_session_proposals;
create policy coach_proposals_participant_select on public.coach_session_proposals
for select to authenticated using (
  athlete_id = auth.uid()
  or coach_id = auth.uid()
);

drop policy if exists coach_future_sessions_authorized_select on public.coach_future_sessions;
create policy coach_future_sessions_authorized_select on public.coach_future_sessions
for select to authenticated using (
  athlete_id = auth.uid()
  or exists (
    select 1 from public.coach_access_grants grant_row
    where grant_row.athlete_id = coach_future_sessions.athlete_id
      and grant_row.coach_id = auth.uid()
      and grant_row.status = 'active'
      and grant_row.expires_at > now()
      and grant_row.can_view_future_strength
  )
);

create or replace function public.renew_coach_access(p_grant_id uuid)
returns setof public.coach_access_grants
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  return query
  update public.coach_access_grants
  set status='active', expires_at=now()+interval '90 days', revoked_at=null
  where id=p_grant_id and athlete_id=auth.uid()
  returning *;
  if not found then raise exception 'Coach access grant not found.'; end if;
end;
$$;

create or replace function public.propose_coach_future_session(
  p_athlete_id uuid,
  p_session_id text,
  p_proposed_json jsonb,
  p_note text,
  p_coach_display_name text
)
returns setof public.coach_session_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  baseline public.coach_future_sessions%rowtype;
  proposal public.coach_session_proposals%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not exists (
    select 1 from public.coach_access_grants
    where athlete_id=p_athlete_id and coach_id=auth.uid()
      and status='active' and expires_at > now() and can_edit_future_strength
  ) then raise exception 'Active coach edit access is required.'; end if;

  select * into baseline from public.coach_future_sessions
  where athlete_id=p_athlete_id and local_session_id=p_session_id and session_date >= current_date;
  if not found then raise exception 'Future strength session not found.'; end if;
  if jsonb_typeof(p_proposed_json) <> 'object' then raise exception 'Invalid proposed session.'; end if;
  if (p_proposed_json->>'sessionDate')::date < current_date then raise exception 'A coach cannot change workout history.'; end if;
  if p_proposed_json->>'intendedLoad' not in ('light','moderate','high') then raise exception 'Invalid intended load.'; end if;
  if jsonb_typeof(p_proposed_json->'workout') <> 'object' then raise exception 'A proposed workout is required.'; end if;

  update public.coach_session_proposals
  set status='superseded', reviewed_at=now()
  where athlete_id=p_athlete_id and coach_id=auth.uid()
    and local_session_id=p_session_id and status='pending';

  insert into public.coach_session_proposals(
    athlete_id,coach_id,coach_display_name,local_session_id,baseline_json,
    proposed_json,coach_note,status
  ) values (
    p_athlete_id,auth.uid(),coalesce(nullif(trim(p_coach_display_name),''),'Coach'),p_session_id,
    jsonb_build_object(
      'sessionDate',baseline.session_date::text,
      'title',baseline.title,
      'intendedLoad',baseline.intended_load,
      'purpose',baseline.purpose,
      'workout',baseline.workout_json
    ),
    p_proposed_json,nullif(trim(p_note),''),'pending'
  ) returning * into proposal;

  insert into public.coach_plan_audit(
    athlete_id,coach_id,local_session_id,before_json,after_json,coach_note
  ) values (
    p_athlete_id,auth.uid(),p_session_id,proposal.baseline_json,proposal.proposed_json,proposal.coach_note
  );
  return next proposal;
end;
$$;

create or replace function public.review_coach_session_proposal(
  p_proposal_id uuid,
  p_decision text,
  p_athlete_note text default null
)
returns setof public.coach_session_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal public.coach_session_proposals%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if p_decision not in ('accepted','rejected') then raise exception 'Invalid proposal decision.'; end if;
  select * into proposal from public.coach_session_proposals
  where id=p_proposal_id and athlete_id=auth.uid() and status='pending'
  for update;
  if not found then raise exception 'Pending coach proposal not found.'; end if;

  if p_decision='accepted' then
    update public.coach_future_sessions set
      session_date=(proposal.proposed_json->>'sessionDate')::date,
      title=proposal.proposed_json->>'title',
      intended_load=proposal.proposed_json->>'intendedLoad',
      purpose=proposal.proposed_json->>'purpose',
      workout_json=proposal.proposed_json->'workout',
      coach_note=proposal.coach_note,
      coach_revision=coach_revision+1,
      last_edited_by=auth.uid(),
      last_editor_display_name='Athlete approved coach proposal',
      updated_at=now()
    where athlete_id=auth.uid() and local_session_id=proposal.local_session_id;
  end if;

  update public.coach_session_proposals set
    status=p_decision,
    reviewed_at=now(),
    athlete_note=nullif(trim(p_athlete_note),'')
  where id=p_proposal_id
  returning * into proposal;
  return next proposal;
end;
$$;

-- The old V18.3 RPC directly replaced future sessions. V18.4 removes client
-- execution so every coach change must pass through athlete review.
revoke all on function public.update_coach_future_session(uuid,text,date,text,text,jsonb,text,text) from public, anon, authenticated;

-- Workout Together: every athlete confirms the selected workout and their own
-- plan relationship after the host's latest selection.
alter table public.workout_rooms
  add column if not exists selection_revision integer not null default 1;
alter table public.workout_room_members
  add column if not exists plan_relation_confirmed_at timestamptz;
alter table public.workout_room_members
  add column if not exists confirmed_selection_revision integer not null default 0;

create or replace function public.select_workout_room_workout(
  p_room_id uuid,
  p_workout_name text,
  p_workout_json jsonb,
  p_selection_mode text,
  p_candidate_user_ids uuid[],
  p_source_session_ids text[]
)
returns setof public.workout_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.workout_rooms%rowtype;
begin
  if p_selection_mode not in ('single','combined') then raise exception 'Invalid room selection mode.'; end if;
  select * into room_row from public.workout_rooms
  where id=p_room_id and host_user_id=auth.uid() and status='lobby'
  for update;
  if not found then raise exception 'Only the host can choose a lobby workout.'; end if;
  if coalesce(array_length(p_candidate_user_ids,1),0) < 1 or coalesce(array_length(p_candidate_user_ids,1),0) > 2
    then raise exception 'Choose one or two workout candidates.'; end if;
  if exists (
    select 1 from unnest(p_candidate_user_ids) candidate_id
    where not exists (
      select 1 from public.workout_room_candidates candidate
      where candidate.room_id=p_room_id and candidate.user_id=candidate_id
    )
  ) then raise exception 'A selected workout candidate is unavailable.'; end if;

  update public.workout_rooms set
    workout_name=p_workout_name,
    workout_json=p_workout_json,
    selection_mode=p_selection_mode,
    selected_candidate_user_ids=p_candidate_user_ids,
    selected_source_session_ids=coalesce(p_source_session_ids,'{}'::text[]),
    selected_by_user_id=auth.uid(),
    selection_revision=selection_revision+1,
    updated_at=now()
  where id=p_room_id
  returning * into room_row;
  update public.workout_room_members set
    ready=false,
    plan_relation_confirmed_at=null,
    confirmed_selection_revision=0
  where room_id=p_room_id;
  return next room_row;
end;
$$;

create or replace function public.confirm_workout_room_plan_relation(
  p_room_id uuid,
  p_relation text,
  p_planned_session_id text default null,
  p_planned_session_title text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  revision integer;
begin
  if p_relation not in ('additional','substitute_next') then raise exception 'Invalid plan relationship.'; end if;
  if p_relation='substitute_next' and nullif(trim(p_planned_session_id),'') is null
    then raise exception 'Choose the planned session being substituted.'; end if;
  select selection_revision into revision from public.workout_rooms
  where id=p_room_id and status='lobby' and public.is_workout_room_participant(id);
  if not found then raise exception 'Active workout lobby not found.'; end if;
  update public.workout_room_members set
    plan_relation=p_relation,
    planned_session_id=case when p_relation='substitute_next' then p_planned_session_id else null end,
    planned_session_title=case when p_relation='substitute_next' then p_planned_session_title else null end,
    plan_relation_confirmed_at=now(),
    confirmed_selection_revision=revision,
    ready=false,
    last_seen_at=now()
  where room_id=p_room_id and user_id=auth.uid();
  if not found then raise exception 'Workout room membership not found.'; end if;
end;
$$;

create or replace function public.set_workout_room_ready_v18_4(
  p_room_id uuid,
  p_ready boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  revision integer;
begin
  select selection_revision into revision from public.workout_rooms
  where id=p_room_id and status='lobby' and public.is_workout_room_participant(id);
  if not found then raise exception 'Active workout lobby not found.'; end if;
  if p_ready and not exists (
    select 1 from public.workout_room_members
    where room_id=p_room_id and user_id=auth.uid()
      and plan_relation_confirmed_at is not null
      and confirmed_selection_revision=revision
  ) then raise exception 'Confirm the selected workout and plan relationship before marking ready.'; end if;
  update public.workout_room_members set ready=p_ready,last_seen_at=now()
  where room_id=p_room_id and user_id=auth.uid();
end;
$$;


create or replace function public.start_workout_room_v18_4(
  p_room_id uuid,
  p_countdown_seconds integer default 8
)
returns setof public.workout_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.workout_rooms%rowtype;
begin
  select * into room_row from public.workout_rooms
  where id=p_room_id and host_user_id=auth.uid() and status='lobby'
  for update;
  if not found then raise exception 'Only the host can start this workout room.'; end if;
  if exists (
    select 1 from public.workout_room_members member
    where member.room_id=p_room_id
      and (not member.ready
        or member.plan_relation_confirmed_at is null
        or member.confirmed_selection_revision <> room_row.selection_revision)
  ) then raise exception 'Every athlete must confirm the latest selection and be ready.'; end if;
  update public.workout_rooms set
    status='active', starts_at=now()+make_interval(secs=>greatest(3,least(coalesce(p_countdown_seconds,8),30))), updated_at=now()
  where id=p_room_id returning * into room_row;
  return next room_row;
end;
$$;

-- Privacy control: delete Side Quest cloud application data owned by the user.
-- The Supabase auth identity remains so the user can sign back in or contact the
-- project owner for full authentication-account deletion.
create or replace function public.delete_my_sidequest_cloud_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required.'; end if;
  delete from public.social_kudos where user_id=uid;
  delete from public.social_workout_invitations where sender_id=uid or receiver_id=uid;
  delete from public.social_friend_requests where sender_id=uid or receiver_id=uid;
  delete from public.social_friendships where user_id=uid or friend_id=uid;
  delete from public.social_blocks where blocker_id=uid or blocked_id=uid;
  delete from public.social_workout_activities where user_id=uid;
  delete from public.social_privacy where user_id=uid;
  delete from public.social_profiles where id=uid;

  delete from public.workout_room_members where user_id=uid;
  delete from public.workout_rooms where host_user_id=uid;

  delete from public.coach_session_proposals where athlete_id=uid or coach_id=uid;
  delete from public.coach_plan_audit where athlete_id=uid or coach_id=uid;
  delete from public.coach_future_sessions where athlete_id=uid;
  delete from public.coach_access_grants where athlete_id=uid or coach_id=uid;
  delete from public.coach_invites where athlete_id=uid or accepted_by=uid;

  delete from public.strava_sync_runs where user_id=uid;
  delete from public.strava_activities where user_id=uid;
  delete from public.strava_oauth_states where user_id=uid;
  delete from public.strava_tokens where user_id=uid;
  delete from public.strava_connections where user_id=uid;

  delete from public.beta_feedback where user_id=uid;
  delete from public.profiles where id=uid;
end;
$$;

revoke all on public.coach_session_proposals from anon;
grant select on public.coach_session_proposals to authenticated;
revoke all on function public.renew_coach_access(uuid) from public, anon;
revoke all on function public.propose_coach_future_session(uuid,text,jsonb,text,text) from public, anon;
revoke all on function public.review_coach_session_proposal(uuid,text,text) from public, anon;
revoke all on function public.confirm_workout_room_plan_relation(uuid,text,text,text) from public, anon;
revoke all on function public.set_workout_room_ready_v18_4(uuid,boolean) from public, anon;
revoke all on function public.start_workout_room_v18_4(uuid,integer) from public, anon;
revoke all on function public.delete_my_sidequest_cloud_data() from public, anon;
grant execute on function public.renew_coach_access(uuid) to authenticated;
grant execute on function public.propose_coach_future_session(uuid,text,jsonb,text,text) to authenticated;
grant execute on function public.review_coach_session_proposal(uuid,text,text) to authenticated;
grant execute on function public.confirm_workout_room_plan_relation(uuid,text,text,text) to authenticated;
grant execute on function public.set_workout_room_ready_v18_4(uuid,boolean) to authenticated;
grant execute on function public.start_workout_room_v18_4(uuid,integer) to authenticated;
grant execute on function public.delete_my_sidequest_cloud_data() to authenticated;
