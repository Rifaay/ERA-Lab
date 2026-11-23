-- An archer who leaves their coach takes their sessions with them: the coach reads and clears an archer's uploaded
-- sessions only while that archer is still linked to the profile the rows belong to. Before this, the rows stayed
-- readable after the archer left (0005 checked only coach_id). The archer's phone also deletes them when leaving.
drop policy "coach reads linked archers" on public.archer_sessions;
create policy "coach reads linked archers" on public.archer_sessions
  for select to authenticated
  using (coach_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2' and (select public.my_role()) = 'coach'
    and exists (select 1 from public.invites i
      where i.coach_id = archer_sessions.coach_id and i.athlete_id = archer_sessions.athlete_id and i.claimed_by = archer_sessions.archer_id));

-- Clearing stays allowed without the link, so the coach can still remove what an archer left behind.
-- Rows an archer left behind are deleted below, once, for archers who already left.
delete from public.archer_sessions s
where not exists (select 1 from public.invites i
  where i.coach_id = s.coach_id and i.athlete_id = s.athlete_id and i.claimed_by = s.archer_id);
