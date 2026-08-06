-- Side Quest V17 social beta
-- Run after V12_BETA_SCHEMA.sql and V13_THEMES_AND_WORKOUT_TOGETHER.sql.
-- Private-by-default friend connections, activity feed, kudos, blocking, and Workout Together invitations.

create extension if not exists pgcrypto;

create table if not exists public.social_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_initials text not null check (char_length(avatar_initials) between 1 and 3),
  discoverable boolean not null default false,
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_privacy (
  user_id uuid primary key references auth.users(id) on delete cascade,
  share_workout_type boolean not null default true,
  share_duration boolean not null default true,
  share_weekly_count boolean not null default true,
  share_exact_exercises boolean not null default false,
  share_loads boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.social_friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> receiver_id)
);
create unique index if not exists social_pending_request_pair
  on public.social_friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status = 'pending';

-- Symmetric rows: accepting a request writes A->B and B->A.
create table if not exists public.social_friendships (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table if not exists public.social_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.social_workout_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_ledger_id text not null,
  workout_type text not null,
  title text not null,
  duration_minutes integer,
  weekly_count integer,
  exact_exercises jsonb,
  load_summary jsonb,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, workout_ledger_id)
);
create index if not exists social_activity_completed_idx on public.social_workout_activities(completed_at desc);

create table if not exists public.social_kudos (
  activity_id uuid not null references public.social_workout_activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'nice_work' check (kind = 'nice_work'),
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

create table if not exists public.social_workout_invitations (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  room_code text not null,
  workout_name text not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> receiver_id)
);

create or replace function public.are_social_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.social_friendships where user_id = a and friend_id = b)
  and not exists(select 1 from public.social_blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

create or replace function public.upsert_social_profile(
  p_username text,
  p_display_name text,
  p_initials text,
  p_discoverable boolean default false
) returns setof public.social_profiles
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.social_profiles(id, username, display_name, avatar_initials, discoverable, updated_at)
  values(auth.uid(), lower(trim(p_username)), trim(p_display_name), upper(trim(p_initials)), p_discoverable, now())
  on conflict(id) do update set
    username = excluded.username,
    display_name = excluded.display_name,
    avatar_initials = excluded.avatar_initials,
    discoverable = excluded.discoverable,
    updated_at = now();
  insert into public.social_privacy(user_id) values(auth.uid()) on conflict(user_id) do nothing;
  return query select * from public.social_profiles where id = auth.uid();
end;
$$;

create or replace function public.send_friend_request(p_identifier text)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_id uuid; request_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into target_id from public.social_profiles
   where upper(invite_code) = upper(trim(p_identifier))
      or (discoverable = true and lower(username) = lower(trim(p_identifier)))
   limit 1;
  if target_id is null then raise exception 'No athlete was found with that username or invite code.'; end if;
  if target_id = auth.uid() then raise exception 'You cannot add yourself.'; end if;
  if exists(select 1 from public.social_blocks where (blocker_id=auth.uid() and blocked_id=target_id) or (blocker_id=target_id and blocked_id=auth.uid())) then
    raise exception 'This connection is unavailable.';
  end if;
  if public.are_social_friends(auth.uid(), target_id) then raise exception 'You are already friends.'; end if;
  insert into public.social_friend_requests(sender_id, receiver_id)
  values(auth.uid(), target_id)
  returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.respond_friend_request(p_request_id uuid, p_response text)
returns void language plpgsql security definer set search_path = public as $$
declare request_row public.social_friend_requests%rowtype;
begin
  if p_response not in ('accepted','declined') then raise exception 'Invalid response'; end if;
  select * into request_row from public.social_friend_requests where id=p_request_id and receiver_id=auth.uid() and status='pending' for update;
  if request_row.id is null then raise exception 'Friend request not found.'; end if;
  update public.social_friend_requests set status=p_response, responded_at=now() where id=p_request_id;
  if p_response='accepted' then
    insert into public.social_friendships(user_id,friend_id) values(request_row.sender_id,request_row.receiver_id) on conflict do nothing;
    insert into public.social_friendships(user_id,friend_id) values(request_row.receiver_id,request_row.sender_id) on conflict do nothing;
  end if;
end;
$$;

create or replace function public.remove_social_friend(p_friend_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.social_friendships where (user_id=auth.uid() and friend_id=p_friend_id) or (user_id=p_friend_id and friend_id=auth.uid());
end;
$$;

create or replace function public.block_social_user(p_blocked_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_blocked_id=auth.uid() then raise exception 'You cannot block yourself.'; end if;
  insert into public.social_blocks(blocker_id,blocked_id) values(auth.uid(),p_blocked_id) on conflict do nothing;
  delete from public.social_friendships where (user_id=auth.uid() and friend_id=p_blocked_id) or (user_id=p_blocked_id and friend_id=auth.uid());
  update public.social_friend_requests set status='cancelled',responded_at=now()
    where status='pending' and ((sender_id=auth.uid() and receiver_id=p_blocked_id) or (sender_id=p_blocked_id and receiver_id=auth.uid()));
  update public.social_workout_invitations set status='declined',responded_at=now()
    where status='pending' and ((sender_id=auth.uid() and receiver_id=p_blocked_id) or (sender_id=p_blocked_id and receiver_id=auth.uid()));
end;
$$;

alter table public.social_profiles enable row level security;
alter table public.social_privacy enable row level security;
alter table public.social_friend_requests enable row level security;
alter table public.social_friendships enable row level security;
alter table public.social_blocks enable row level security;
alter table public.social_workout_activities enable row level security;
alter table public.social_kudos enable row level security;
alter table public.social_workout_invitations enable row level security;

-- Profiles are visible only to the owner, approved friends, pending connections, or accounts the user blocked.
-- Exact username/invite-code resolution happens inside the security-definer request function,
-- so discoverable profiles cannot be enumerated with a broad select query.
drop policy if exists social_profiles_select on public.social_profiles;
create policy social_profiles_select on public.social_profiles for select using (
  id=auth.uid() or public.are_social_friends(auth.uid(),id)
  or exists(select 1 from public.social_friend_requests r where (r.sender_id=auth.uid() and r.receiver_id=id) or (r.receiver_id=auth.uid() and r.sender_id=id))
  or exists(select 1 from public.social_blocks b where b.blocker_id=auth.uid() and b.blocked_id=id)
);
drop policy if exists social_profiles_update on public.social_profiles;
create policy social_profiles_update on public.social_profiles for update using (id=auth.uid()) with check (id=auth.uid());

drop policy if exists social_privacy_self on public.social_privacy;
create policy social_privacy_self on public.social_privacy for all using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists friend_requests_select on public.social_friend_requests;
create policy friend_requests_select on public.social_friend_requests for select using(sender_id=auth.uid() or receiver_id=auth.uid());
drop policy if exists friend_requests_insert on public.social_friend_requests;
create policy friend_requests_insert on public.social_friend_requests for insert with check(sender_id=auth.uid());
drop policy if exists friend_requests_update on public.social_friend_requests;
create policy friend_requests_update on public.social_friend_requests for update using(receiver_id=auth.uid() or sender_id=auth.uid());

drop policy if exists friendships_select on public.social_friendships;
create policy friendships_select on public.social_friendships for select using(user_id=auth.uid());

drop policy if exists blocks_self on public.social_blocks;
create policy blocks_self on public.social_blocks for all using(blocker_id=auth.uid()) with check(blocker_id=auth.uid());

drop policy if exists activities_select on public.social_workout_activities;
create policy activities_select on public.social_workout_activities for select using(user_id=auth.uid() or public.are_social_friends(auth.uid(),user_id));
drop policy if exists activities_insert on public.social_workout_activities;
create policy activities_insert on public.social_workout_activities for insert with check(user_id=auth.uid());
drop policy if exists activities_update on public.social_workout_activities;
create policy activities_update on public.social_workout_activities for update using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists activities_delete on public.social_workout_activities;
create policy activities_delete on public.social_workout_activities for delete using(user_id=auth.uid());

drop policy if exists kudos_select on public.social_kudos;
create policy kudos_select on public.social_kudos for select using(
  exists(select 1 from public.social_workout_activities a where a.id=activity_id and (a.user_id=auth.uid() or public.are_social_friends(auth.uid(),a.user_id)))
);
drop policy if exists kudos_insert on public.social_kudos;
create policy kudos_insert on public.social_kudos for insert with check(
  user_id=auth.uid() and exists(select 1 from public.social_workout_activities a where a.id=activity_id and public.are_social_friends(auth.uid(),a.user_id))
);
drop policy if exists kudos_delete on public.social_kudos;
create policy kudos_delete on public.social_kudos for delete using(user_id=auth.uid());

drop policy if exists invitations_select on public.social_workout_invitations;
create policy invitations_select on public.social_workout_invitations for select using(sender_id=auth.uid() or receiver_id=auth.uid());
drop policy if exists invitations_insert on public.social_workout_invitations;
create policy invitations_insert on public.social_workout_invitations for insert with check(sender_id=auth.uid() and public.are_social_friends(sender_id,receiver_id));
drop policy if exists invitations_update on public.social_workout_invitations;
create policy invitations_update on public.social_workout_invitations for update using(receiver_id=auth.uid() or sender_id=auth.uid());

grant execute on function public.upsert_social_profile(text,text,text,boolean) to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid,text) to authenticated;
grant execute on function public.remove_social_friend(uuid) to authenticated;
grant execute on function public.block_social_user(uuid) to authenticated;
