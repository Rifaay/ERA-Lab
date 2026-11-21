-- The coach can end an archer's session from Live scores when something is wrong (wrong distance, a test, a phone left
-- plotting). The row is marked, not deleted: the archer's phone would just send it again with the next arrow. Marked,
-- it leaves the coach's board, isn't copied into the coach's records, and the archer's phone closes it on its next check.
-- Removing a session for good was already possible: the coach and the archer may each delete these rows (0004).
alter table public.archer_sessions add column ended_by_coach timestamptz;

create function public.end_archer_session(archer uuid, session text) returns void
language sql security definer set search_path = '' as $$
  update public.archer_sessions set ended_by_coach = now()
  where coach_id = (select auth.uid()) and archer_id = archer and session_id = session and ended_by_coach is null
    and (select auth.jwt() ->> 'aal') = 'aal2' and (select public.my_role()) = 'coach';
$$;
revoke all on function public.end_archer_session(uuid, text) from public, anon;
grant execute on function public.end_archer_session(uuid, text) to authenticated;
