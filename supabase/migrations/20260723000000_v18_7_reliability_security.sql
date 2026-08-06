-- Side Quest V18.7 — reliability, account lifecycle, and security hardening.

create table if not exists public.user_action_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_started_at timestamptz not null,
  action_count integer not null default 0,
  primary key(user_id,action)
);
alter table public.user_action_rate_limits enable row level security;
revoke all on public.user_action_rate_limits from public,anon,authenticated;
grant all on public.user_action_rate_limits to service_role;

create or replace function public.assert_user_action_rate_limit(p_action text,p_limit integer,p_window_seconds integer)
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); current_row public.user_action_rate_limits%rowtype;
begin
  if uid is null then raise exception 'Authentication required.'; end if;
  if p_limit<1 or p_window_seconds<1 then raise exception 'Invalid rate limit.'; end if;
  select * into current_row from public.user_action_rate_limits where user_id=uid and action=p_action for update;
  if not found then
    insert into public.user_action_rate_limits(user_id,action,window_started_at,action_count) values(uid,p_action,now(),1);
  elsif current_row.window_started_at + make_interval(secs=>p_window_seconds) <= now() then
    update public.user_action_rate_limits set window_started_at=now(),action_count=1 where user_id=uid and action=p_action;
  elsif current_row.action_count>=p_limit then
    raise exception 'Too many requests. Try again later.';
  else
    update public.user_action_rate_limits set action_count=action_count+1 where user_id=uid and action=p_action;
  end if;
end;$$;
revoke all on function public.assert_user_action_rate_limit(text,integer,integer) from public,anon,authenticated;

create or replace function public.create_coach_invite(p_display_name text)
returns table(code text, expires_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare generated_code text; expiry timestamptz:=now()+interval '7 days';
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  perform public.assert_user_action_rate_limit('create_coach_invite',5,3600);
  update public.coach_invites set status='expired' where athlete_id=auth.uid() and status='pending' and expires_at<=now();
  loop generated_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)); exit when not exists(select 1 from public.coach_invites where coach_invites.code=generated_code); end loop;
  insert into public.coach_invites(athlete_id,athlete_display_name,code,expires_at) values(auth.uid(),coalesce(nullif(trim(p_display_name),''),'Athlete'),generated_code,expiry);
  return query select generated_code,expiry;
end;$$;

create or replace function public.send_friend_request(p_identifier text)
returns uuid language plpgsql security definer set search_path=public as $$
declare target_id uuid; request_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.assert_user_action_rate_limit('send_friend_request',20,3600);
  select id into target_id from public.social_profiles where upper(invite_code)=upper(trim(p_identifier)) or (discoverable=true and lower(username)=lower(trim(p_identifier))) limit 1;
  if target_id is null then raise exception 'No athlete was found with that username or invite code.'; end if;
  if target_id=auth.uid() then raise exception 'You cannot add yourself.'; end if;
  if exists(select 1 from public.social_blocks where (blocker_id=auth.uid() and blocked_id=target_id) or (blocker_id=target_id and blocked_id=auth.uid())) then raise exception 'This connection is unavailable.'; end if;
  if public.are_social_friends(auth.uid(),target_id) then raise exception 'You are already friends.'; end if;
  if exists(select 1 from public.social_friend_requests where sender_id=auth.uid() and receiver_id=target_id and status='pending') then raise exception 'A friend request is already pending.'; end if;
  insert into public.social_friend_requests(sender_id,receiver_id) values(auth.uid(),target_id) returning id into request_id;
  return request_id;
end;$$;

revoke all on function public.create_coach_invite(text) from public,anon;
revoke all on function public.send_friend_request(text) from public,anon;
grant execute on function public.create_coach_invite(text) to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
