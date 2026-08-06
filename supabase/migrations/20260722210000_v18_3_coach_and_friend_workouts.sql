-- Side Quest V18.3: coach-scoped future planning and friend workout substitution.
-- Coach access is intentionally limited to sanitized future strength sessions.
-- Completed history and private athlete context are never stored in these tables.

create table if not exists public.coach_invites (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references auth.users(id) on delete cascade,
  athlete_display_name text not null,
  code text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create table if not exists public.coach_access_grants (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_display_name text not null,
  coach_display_name text not null,
  status text not null default 'active' check (status in ('active','revoked')),
  can_view_future_strength boolean not null default true,
  can_edit_future_strength boolean not null default true,
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (athlete_id, coach_id)
);

create table if not exists public.coach_future_sessions (
  athlete_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  local_session_id text not null,
  session_date date not null,
  title text not null,
  intended_load text not null check (intended_load in ('light','moderate','high')),
  purpose text not null,
  workout_json jsonb not null,
  coach_note text,
  coach_revision integer not null default 0,
  last_edited_by uuid not null references auth.users(id) on delete cascade,
  last_editor_display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (athlete_id, local_session_id)
);

create table if not exists public.coach_plan_audit (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  local_session_id text not null,
  before_json jsonb not null,
  after_json jsonb not null,
  coach_note text,
  created_at timestamptz not null default now()
);

create index if not exists coach_invites_athlete_idx on public.coach_invites(athlete_id, created_at desc);
create index if not exists coach_grants_athlete_idx on public.coach_access_grants(athlete_id, status);
create index if not exists coach_grants_coach_idx on public.coach_access_grants(coach_id, status);
create index if not exists coach_future_sessions_date_idx on public.coach_future_sessions(athlete_id, session_date);
create index if not exists coach_plan_audit_session_idx on public.coach_plan_audit(athlete_id, local_session_id, created_at desc);

alter table public.coach_invites enable row level security;
alter table public.coach_access_grants enable row level security;
alter table public.coach_future_sessions enable row level security;
alter table public.coach_plan_audit enable row level security;

drop policy if exists coach_invites_owner_select on public.coach_invites;
create policy coach_invites_owner_select on public.coach_invites
for select to authenticated using (athlete_id = auth.uid());

drop policy if exists coach_grants_participant_select on public.coach_access_grants;
create policy coach_grants_participant_select on public.coach_access_grants
for select to authenticated using (athlete_id = auth.uid() or coach_id = auth.uid());

drop policy if exists coach_future_sessions_authorized_select on public.coach_future_sessions;
create policy coach_future_sessions_authorized_select on public.coach_future_sessions
for select to authenticated using (
  athlete_id = auth.uid()
  or exists (
    select 1 from public.coach_access_grants grant_row
    where grant_row.athlete_id = coach_future_sessions.athlete_id
      and grant_row.coach_id = auth.uid()
      and grant_row.status = 'active'
      and grant_row.can_view_future_strength
  )
);

drop policy if exists coach_plan_audit_authorized_select on public.coach_plan_audit;
create policy coach_plan_audit_authorized_select on public.coach_plan_audit
for select to authenticated using (
  athlete_id = auth.uid()
  or exists (
    select 1 from public.coach_access_grants grant_row
    where grant_row.athlete_id = coach_plan_audit.athlete_id
      and grant_row.coach_id = auth.uid()
      and grant_row.status = 'active'
  )
);

create or replace function public.create_coach_invite(p_display_name text)
returns table(code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_code text;
  expiry timestamptz := now() + interval '7 days';
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  update public.coach_invites set status = 'expired'
  where athlete_id = auth.uid() and status = 'pending' and expires_at <= now();

  loop
    generated_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.coach_invites where coach_invites.code = generated_code);
  end loop;

  insert into public.coach_invites(athlete_id, athlete_display_name, code, expires_at)
  values (auth.uid(), coalesce(nullif(trim(p_display_name),''),'Athlete'), generated_code, expiry);
  return query select generated_code, expiry;
end;
$$;

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
    can_view_future_strength, can_edit_future_strength, accepted_at, revoked_at
  ) values (
    invite_row.athlete_id, auth.uid(), invite_row.athlete_display_name,
    coalesce(nullif(trim(p_display_name),''),'Coach'), 'active', true, true, now(), null
  )
  on conflict (athlete_id, coach_id) do update set
    athlete_display_name = excluded.athlete_display_name,
    coach_display_name = excluded.coach_display_name,
    status = 'active',
    can_view_future_strength = true,
    can_edit_future_strength = true,
    accepted_at = now(),
    revoked_at = null
  returning * into grant_row;

  update public.coach_invites set status='accepted', accepted_by=auth.uid(), accepted_at=now()
  where id=invite_row.id;
  return next grant_row;
end;
$$;

create or replace function public.revoke_coach_access(p_grant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.coach_access_grants
  set status='revoked', revoked_at=now()
  where id=p_grant_id and athlete_id=auth.uid();
  if not found then raise exception 'Coach access grant not found.'; end if;
end;
$$;

create or replace function public.sync_athlete_future_sessions(p_plan_id text, p_sessions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  applied_revision integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if jsonb_typeof(p_sessions) <> 'array' then raise exception 'Sessions must be a JSON array.'; end if;

  delete from public.coach_future_sessions target
  where target.athlete_id = auth.uid()
    and target.session_date >= current_date
    and not exists (
      select 1 from jsonb_array_elements(p_sessions) as element(value)
      where element.value->>'local_session_id' = target.local_session_id
    );

  for item in select * from jsonb_array_elements(p_sessions)
  loop
    if (item->>'session_date')::date < current_date then continue; end if;
    applied_revision := coalesce((item->>'applied_coach_revision')::integer,0);
    insert into public.coach_future_sessions(
      athlete_id,plan_id,local_session_id,session_date,title,intended_load,purpose,
      workout_json,coach_revision,last_edited_by,last_editor_display_name,updated_at
    ) values (
      auth.uid(),p_plan_id,item->>'local_session_id',(item->>'session_date')::date,
      item->>'title',item->>'intended_load',item->>'purpose',item->'workout_json',
      applied_revision,auth.uid(),'Athlete',now()
    )
    on conflict (athlete_id,local_session_id) do update set
      plan_id=excluded.plan_id,
      session_date=excluded.session_date,
      title=excluded.title,
      intended_load=excluded.intended_load,
      purpose=excluded.purpose,
      workout_json=excluded.workout_json,
      last_edited_by=auth.uid(),
      last_editor_display_name='Athlete',
      updated_at=now()
    where public.coach_future_sessions.last_edited_by = auth.uid()
       or public.coach_future_sessions.coach_revision <= applied_revision;
  end loop;
end;
$$;

create or replace function public.update_coach_future_session(
  p_athlete_id uuid,
  p_session_id text,
  p_session_date date,
  p_title text,
  p_intended_load text,
  p_workout_json jsonb,
  p_note text,
  p_coach_display_name text
)
returns setof public.coach_future_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  before_row public.coach_future_sessions%rowtype;
  after_row public.coach_future_sessions%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if p_session_date < current_date then raise exception 'A coach cannot change workout history.'; end if;
  if p_intended_load not in ('light','moderate','high') then raise exception 'Invalid intended load.'; end if;
  if not exists (
    select 1 from public.coach_access_grants
    where athlete_id=p_athlete_id and coach_id=auth.uid() and status='active' and can_edit_future_strength
  ) then raise exception 'Active coach edit access is required.'; end if;

  select * into before_row from public.coach_future_sessions
  where athlete_id=p_athlete_id and local_session_id=p_session_id and session_date >= current_date
  for update;
  if not found then raise exception 'Future strength session not found.'; end if;

  update public.coach_future_sessions set
    session_date=p_session_date,
    title=coalesce(nullif(trim(p_title),''),title),
    intended_load=p_intended_load,
    workout_json=p_workout_json,
    coach_note=nullif(trim(p_note),''),
    coach_revision=coach_revision+1,
    last_edited_by=auth.uid(),
    last_editor_display_name=coalesce(nullif(trim(p_coach_display_name),''),'Coach'),
    updated_at=now()
  where athlete_id=p_athlete_id and local_session_id=p_session_id
  returning * into after_row;

  insert into public.coach_plan_audit(athlete_id,coach_id,local_session_id,before_json,after_json,coach_note)
  values (p_athlete_id,auth.uid(),p_session_id,to_jsonb(before_row),to_jsonb(after_row),nullif(trim(p_note),''));
  return next after_row;
end;
$$;

-- Workout Together candidates and per-athlete substitution intent.
alter table public.workout_rooms add column if not exists selection_mode text not null default 'single'
  check (selection_mode in ('single','combined'));
alter table public.workout_rooms add column if not exists selected_candidate_user_ids uuid[] not null default '{}';
alter table public.workout_rooms add column if not exists selected_source_session_ids text[] not null default '{}';
alter table public.workout_rooms add column if not exists selected_by_user_id uuid references auth.users(id) on delete set null;
alter table public.workout_rooms add column if not exists updated_at timestamptz not null default now();

alter table public.workout_room_members add column if not exists plan_relation text not null default 'additional'
  check (plan_relation in ('additional','substitute_next'));
alter table public.workout_room_members add column if not exists planned_session_id text;
alter table public.workout_room_members add column if not exists planned_session_title text;

create table if not exists public.workout_room_candidates (
  room_id uuid not null references public.workout_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  source_session_id text,
  workout_name text not null,
  workout_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key (room_id,user_id)
);
alter table public.workout_room_candidates enable row level security;

drop policy if exists room_candidates_participant_select on public.workout_room_candidates;
create policy room_candidates_participant_select on public.workout_room_candidates
for select to authenticated using (public.is_workout_room_participant(room_id));

drop policy if exists room_candidates_own_insert on public.workout_room_candidates;
create policy room_candidates_own_insert on public.workout_room_candidates
for insert to authenticated with check (
  user_id=auth.uid() and public.is_workout_room_participant(room_id)
);

drop policy if exists room_candidates_own_update on public.workout_room_candidates;
create policy room_candidates_own_update on public.workout_room_candidates
for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists room_candidates_own_delete on public.workout_room_candidates;
create policy room_candidates_own_delete on public.workout_room_candidates
for delete to authenticated using (user_id=auth.uid());

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
    updated_at=now()
  where id=p_room_id
  returning * into room_row;
  update public.workout_room_members set ready=false where room_id=p_room_id;
  return next room_row;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='workout_room_candidates'
  ) then alter publication supabase_realtime add table public.workout_room_candidates; end if;
end $$;

revoke all on public.coach_invites, public.coach_access_grants, public.coach_future_sessions, public.coach_plan_audit, public.workout_room_candidates from anon;
revoke insert, update, delete on public.coach_access_grants, public.coach_future_sessions, public.coach_plan_audit from authenticated;
grant select on public.coach_invites, public.coach_access_grants, public.coach_future_sessions, public.coach_plan_audit to authenticated;
grant select, insert, update, delete on public.workout_room_candidates to authenticated;
revoke all on function public.create_coach_invite(text) from public, anon;
revoke all on function public.accept_coach_invite(text,text) from public, anon;
revoke all on function public.revoke_coach_access(uuid) from public, anon;
revoke all on function public.sync_athlete_future_sessions(text,jsonb) from public, anon;
revoke all on function public.update_coach_future_session(uuid,text,date,text,text,jsonb,text,text) from public, anon;
revoke all on function public.select_workout_room_workout(uuid,text,jsonb,text,uuid[],text[]) from public, anon;

grant execute on function public.create_coach_invite(text) to authenticated;
grant execute on function public.accept_coach_invite(text,text) to authenticated;
grant execute on function public.revoke_coach_access(uuid) to authenticated;
grant execute on function public.sync_athlete_future_sessions(text,jsonb) to authenticated;
grant execute on function public.update_coach_future_session(uuid,text,date,text,text,jsonb,text,text) to authenticated;
grant execute on function public.select_workout_room_workout(uuid,text,jsonb,text,uuid[],text[]) to authenticated;
