-- Quick notes from the coach to an archer while they shoot ("relax the bow hand"). The coach sends one from the archer's
-- live page; the archer's app shows the newest as a small label in the top corner.
-- Only the coach the archer is linked to can send, after both sign-in steps; only that archer reads them.
create table public.coach_notes (
  id         bigint      generated always as identity primary key,
  coach_id   uuid        not null references auth.users (id) on delete cascade,
  archer_id  uuid        not null references auth.users (id) on delete cascade,
  body       text        not null check (length(body) between 1 and 200),
  created_at timestamptz not null default now()
);
create index coach_notes_archer on public.coach_notes (archer_id, id);
alter table public.coach_notes enable row level security;
alter table public.coach_notes force row level security;
-- From the coach they are linked to now: after leaving a coach, that coach's notes are gone from view.
create policy "archer reads own coach's notes" on public.coach_notes
  for select to authenticated using (
    archer_id = (select auth.uid())
    and exists (select 1 from public.invites i where i.claimed_by = (select auth.uid()) and i.coach_id = coach_notes.coach_id));
revoke all on public.coach_notes from anon, authenticated;
grant select on public.coach_notes to authenticated;

-- The coach names the archer by their own profile id, as invites do. Notes older than two days are cleared as new ones go.
create function public.send_note(athlete text, note text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare a uuid; n bigint;
begin
  if (select auth.jwt() ->> 'aal') is distinct from 'aal2' or (select public.my_role()) is distinct from 'coach' then
    raise exception 'not allowed';
  end if;
  select i.claimed_by into a from public.invites i
  where i.coach_id = (select auth.uid()) and i.athlete_id = athlete and i.claimed_by is not null;
  if a is null then raise exception 'not linked'; end if;
  delete from public.coach_notes where created_at < now() - interval '2 days';
  insert into public.coach_notes (coach_id, archer_id, body) values ((select auth.uid()), a, btrim(note)) returning id into n;
  return n;
end $$;
revoke all on function public.send_note(text, text) from public, anon;
grant execute on function public.send_note(text, text) to authenticated;
