-- While the coach has Live scores open, the archer's app shows a small "coach is watching" sign.
-- The coach's app stamps its linked archers every few seconds; the archer's app asks whether the stamp is recent.
-- Both sides use the server's clock, so a phone set to the wrong time can't hide or fake the sign.
alter table public.invites add column watched_at timestamptz;

create function public.watching() returns void
language sql security definer set search_path = '' as $$
  update public.invites set watched_at = now()
  where coach_id = (select auth.uid()) and claimed_by is not null
    and (select auth.jwt() ->> 'aal') = 'aal2' and (select public.my_role()) = 'coach';
$$;
revoke all on function public.watching() from public, anon;
grant execute on function public.watching() to authenticated;

create function public.coach_watching() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(bool_or(i.watched_at > now() - interval '45 seconds'), false)
  from public.invites i where i.claimed_by = (select auth.uid());
$$;
revoke all on function public.coach_watching() from public, anon;
grant execute on function public.coach_watching() to authenticated;
