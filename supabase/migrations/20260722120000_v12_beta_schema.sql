create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  units text not null default 'lb' check (units in ('lb','kg')),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "users read own profile" on public.profiles for select using (auth.uid() = id);
create policy "users insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "users update own profile" on public.profiles for update using (auth.uid() = id);

create table if not exists public.beta_feedback (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  category text not null,
  message text not null,
  route text,
  context jsonb,
  created_at timestamptz not null default now()
);
alter table public.beta_feedback enable row level security;
create policy "users insert own feedback" on public.beta_feedback for insert with check (auth.uid() = user_id);
create policy "users read own feedback" on public.beta_feedback for select using (auth.uid() = user_id);

-- V12 intentionally keeps the full training database local-first.
-- Future sync tables should include user_id, updated_at, deleted_at, and RLS before beta data is uploaded.
