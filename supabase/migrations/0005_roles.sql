-- An account is a coach's or an archer's, fixed by the server when it is created. Until now the role was a note on the
-- account that its owner could rewrite, and the rules never looked at it. Now every rule checks it:
-- only a coach keeps records, makes invites and reads archers' sessions; only an archer claims a code and uploads.

create table public.profiles (
  id         uuid        primary key references auth.users (id) on delete cascade,
  role       text        not null check (role in ('coach', 'archer')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
create policy "read own role" on public.profiles for select to authenticated using (id = (select auth.uid()));
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated; -- no insert, update or delete: the role can't be changed by its owner

-- The role chosen on the sign-up form is copied once, as the account is created. Later edits to that note change nothing.
create function public.set_role_on_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, role)
  values (new.id, case when new.raw_user_meta_data ->> 'role' = 'archer' then 'archer' else 'coach' end)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger set_role_on_signup after insert on auth.users
  for each row execute function public.set_role_on_signup();

-- Accounts made before this: an account that claimed an invite is an archer, every other one a coach.
insert into public.profiles (id, role)
select u.id, case when exists (select 1 from public.invites i where i.claimed_by = u.id) then 'archer' else 'coach' end
from auth.users u on conflict (id) do nothing;

-- Used inside the rules below. Reads the table as its owner, so it also works where the caller may not read profiles.
create function public.my_role() returns text
language sql stable security definer set search_path = '' as
$$ select role from public.profiles where id = (select auth.uid()) $$;
revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

drop policy "coach owns rows, after both sign-in steps" on public.records;
create policy "coach owns rows, after both sign-in steps" on public.records
  for all to authenticated
  using      (coach_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2' and (select public.my_role()) = 'coach')
  with check (coach_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2' and (select public.my_role()) = 'coach');

drop policy "coach manages own invites" on public.invites;
create policy "coach manages own invites" on public.invites
  for all to authenticated
  using      (coach_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2' and (select public.my_role()) = 'coach')
  with check (coach_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2' and (select public.my_role()) = 'coach' and claimed_by is null);

drop policy "coach reads linked archers" on public.archer_sessions;
create policy "coach reads linked archers" on public.archer_sessions
  for select to authenticated
  using (coach_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2' and (select public.my_role()) = 'coach');
drop policy "coach clears linked archers" on public.archer_sessions;
create policy "coach clears linked archers" on public.archer_sessions
  for delete to authenticated
  using (coach_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2' and (select public.my_role()) = 'coach');

drop policy "archer writes own sessions for their coach" on public.archer_sessions;
create policy "archer writes own sessions for their coach" on public.archer_sessions
  for all to authenticated
  using      (archer_id = (select auth.uid()))
  with check (archer_id = (select auth.uid()) and (select public.my_role()) = 'archer' and exists (
    select 1 from public.invites i
    where i.claimed_by = (select auth.uid()) and i.coach_id = archer_sessions.coach_id and i.athlete_id = archer_sessions.athlete_id));

-- Only an archer's account can join a coach.
create or replace function public.claim_invite(invite_code text) returns table (coach_id uuid, athlete_id text, name text)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  if (select public.my_role()) is distinct from 'archer' then raise exception 'archers only'; end if;
  if exists (select 1 from public.invites i where i.claimed_by = (select auth.uid())) then raise exception 'already linked'; end if;
  return query
    update public.invites i set claimed_by = (select auth.uid())
    where i.code = upper(invite_code) and i.claimed_by is null and i.expires_at > now() and i.coach_id <> (select auth.uid())
    returning i.coach_id, i.athlete_id, i.name;
end $$;
