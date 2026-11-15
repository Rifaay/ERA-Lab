-- Archers get their own sign-in. A coach makes an invite code for one of their archers; the archer claims it, and from
-- then on the archer's phone uploads the range sessions it plots, which that coach (and nobody else) can read, live.
-- Archers sign in with a password only (aal1); coaches still need both steps (aal2) to read anything.

-- One row per invite; once claimed it is the link between the archer's account and the coach's archer profile.
create table public.invites (
  code        text        primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'), -- no 0/O/1/I: read aloud at the range
  coach_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  athlete_id  text        not null check (length(athlete_id) between 1 and 100), -- the coach's own id for this archer
  name        text        not null check (length(name) between 1 and 100),       -- shown to the archer after joining
  claimed_by  uuid        references auth.users (id) on delete cascade,
  expires_at  timestamptz not null default now() + interval '7 days',
  created_at  timestamptz not null default now(),
  unique (coach_id, athlete_id) -- one code or link per archer profile
);
alter table public.invites enable row level security;
alter table public.invites force row level security;
create policy "coach manages own invites" on public.invites
  for all to authenticated
  using      (coach_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2')
  with check (coach_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2' and claimed_by is null);
create policy "archer sees own link" on public.invites
  for select to authenticated using (claimed_by = (select auth.uid()));
create policy "archer leaves" on public.invites
  for delete to authenticated using (claimed_by = (select auth.uid()));
revoke all on public.invites from anon;
grant select, insert, delete on public.invites to authenticated;

-- Claiming needs the code, and an unclaimed row can't be read by the archer, so it goes through this function.
-- One account links to one coach: a second code is refused until the archer leaves the first.
create function public.claim_invite(invite_code text) returns table (coach_id uuid, athlete_id text, name text)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.invites i where i.claimed_by = (select auth.uid())) then raise exception 'already linked'; end if;
  return query
    update public.invites i set claimed_by = (select auth.uid())
    where i.code = upper(invite_code) and i.claimed_by is null and i.expires_at > now() and i.coach_id <> (select auth.uid())
    returning i.coach_id, i.athlete_id, i.name;
end $$;
revoke all on function public.claim_invite(text) from public, anon;
grant execute on function public.claim_invite(text) to authenticated;

-- The archer's range sessions, live while shooting and final once saved. The coach's app copies finished ones into
-- the coach's own records. The archer may only write rows that point at the coach and profile they are linked to.
create table public.archer_sessions (
  archer_id   uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  session_id  text        not null check (length(session_id) between 1 and 120),
  coach_id    uuid        not null references auth.users (id) on delete cascade,
  athlete_id  text        not null,
  data        jsonb       not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 300000),
  updated_at  timestamptz not null default now(),
  primary key (archer_id, session_id)
);
alter table public.archer_sessions enable row level security;
alter table public.archer_sessions force row level security;
create policy "archer writes own sessions for their coach" on public.archer_sessions
  for all to authenticated
  using      (archer_id = (select auth.uid()))
  with check (archer_id = (select auth.uid()) and exists (
    select 1 from public.invites i
    where i.claimed_by = (select auth.uid()) and i.coach_id = archer_sessions.coach_id and i.athlete_id = archer_sessions.athlete_id));
create policy "coach reads linked archers" on public.archer_sessions
  for select to authenticated
  using (coach_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2');
create policy "coach clears linked archers" on public.archer_sessions
  for delete to authenticated
  using (coach_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2');
revoke all on public.archer_sessions from anon;
grant select, insert, update, delete on public.archer_sessions to authenticated;

create function public.touch_archer_session() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger archer_sessions_touch before insert or update on public.archer_sessions
  for each row execute function public.touch_archer_session();
