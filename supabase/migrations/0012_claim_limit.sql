-- Guessing invite codes is capped: an account that types 10 wrong codes in an hour is refused for the rest of that
-- hour. A code is 8 characters from 32 (about 1.1 trillion), so this only stops someone scripting guesses; a typo or
-- two never gets near it. The table is the function's own: no visitor can read or write it.
create table public.claim_attempts (
  user_id uuid        not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now()
);
create index claim_attempts_user on public.claim_attempts (user_id, at);
alter table public.claim_attempts enable row level security;
alter table public.claim_attempts force row level security;
revoke all on public.claim_attempts from anon, authenticated;

create or replace function public.claim_invite(invite_code text) returns table (coach_id uuid, athlete_id text, name text)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  if (select public.my_role()) is distinct from 'archer' then raise exception 'archers only'; end if;
  if exists (select 1 from public.invites i where i.claimed_by = (select auth.uid())) then raise exception 'already linked'; end if;
  if (select count(*) from public.claim_attempts a where a.user_id = (select auth.uid()) and a.at > now() - interval '1 hour') >= 10 then
    raise exception 'too many tries';
  end if;
  return query
    update public.invites i set claimed_by = (select auth.uid())
    where i.code = upper(invite_code) and i.claimed_by is null and i.expires_at > now() and i.coach_id <> (select auth.uid())
    returning i.coach_id, i.athlete_id, i.name;
  if not found then -- a wrong code is remembered (the call returns normally, so this is kept); old rows are cleared as new ones come
    delete from public.claim_attempts a where a.user_id = (select auth.uid()) and a.at < now() - interval '1 hour';
    insert into public.claim_attempts (user_id) values ((select auth.uid()));
  end if;
end $$;
