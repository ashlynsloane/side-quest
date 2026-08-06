-- Circuit Generator V13 migration
-- Run after V12_BETA_SCHEMA.sql in the Supabase SQL editor.

alter table public.profiles add column if not exists theme_id text not null default 'forest';
alter table public.profiles add column if not exists appearance text not null default 'system';

alter table public.profiles drop constraint if exists profiles_theme_id_check;
alter table public.profiles add constraint profiles_theme_id_check
  check (theme_id in ('forest','ocean','ember','indigo','alpine','slate'));
alter table public.profiles drop constraint if exists profiles_appearance_check;
alter table public.profiles add constraint profiles_appearance_check
  check (appearance in ('system','light','dark'));

create table if not exists public.workout_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  workout_name text not null,
  workout_json jsonb not null,
  status text not null default 'lobby' check (status in ('lobby','active','complete','cancelled')),
  starts_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours')
);

create index if not exists workout_rooms_code_idx on public.workout_rooms(code);
create index if not exists workout_rooms_host_idx on public.workout_rooms(host_user_id, created_at desc);

create table if not exists public.workout_room_members (
  room_id uuid not null references public.workout_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (room_id, user_id)
);

create index if not exists workout_room_members_room_idx on public.workout_room_members(room_id, joined_at);

alter table public.workout_rooms enable row level security;
alter table public.workout_room_members enable row level security;

-- Security-definer helpers avoid recursive member-table RLS checks.
create or replace function public.is_workout_room_participant(target_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workout_room_members member
    where member.room_id = target_room and member.user_id = auth.uid()
  ) or exists (
    select 1 from public.workout_rooms room
    where room.id = target_room and room.host_user_id = auth.uid()
  );
$$;
revoke all on function public.is_workout_room_participant(uuid) from public;
grant execute on function public.is_workout_room_participant(uuid) to authenticated;

drop policy if exists "authenticated users can inspect active workout rooms" on public.workout_rooms;
create policy "authenticated users can inspect active workout rooms"
on public.workout_rooms for select to authenticated
using (
  status = 'lobby'
  or host_user_id = auth.uid()
  or public.is_workout_room_participant(id)
);

drop policy if exists "users can create hosted workout rooms" on public.workout_rooms;
create policy "users can create hosted workout rooms"
on public.workout_rooms for insert to authenticated
with check (host_user_id = auth.uid());

drop policy if exists "hosts can update workout rooms" on public.workout_rooms;
create policy "hosts can update workout rooms"
on public.workout_rooms for update to authenticated
using (host_user_id = auth.uid())
with check (host_user_id = auth.uid());

drop policy if exists "room participants can view lobby members" on public.workout_room_members;
create policy "room participants can view lobby members"
on public.workout_room_members for select to authenticated
using (public.is_workout_room_participant(room_id));

drop policy if exists "users can join workout rooms" on public.workout_room_members;
create policy "users can join workout rooms"
on public.workout_room_members for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.workout_rooms room
    where room.id = room_id
      and room.status = 'lobby'
      and room.expires_at > now()
  )
);

drop policy if exists "users can update their room state" on public.workout_room_members;
create policy "users can update their room state"
on public.workout_room_members for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Realtime is required for synchronized lobby and start updates.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workout_rooms'
  ) then
    alter publication supabase_realtime add table public.workout_rooms;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workout_room_members'
  ) then
    alter publication supabase_realtime add table public.workout_room_members;
  end if;
end $$;
