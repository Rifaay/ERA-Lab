-- Sign-in needs two steps: password, then a code from an authenticator app. Supabase marks a token that passed both
-- with aal = 'aal2'; a password-only (or emailed-link) token is 'aal1' and now reaches no rows, so a leaked password
-- alone can't read athletes' data.
drop policy if exists "coach owns rows" on public.records;
drop policy if exists "coach owns rows, after both sign-in steps" on public.records; -- safe to run again
create policy "coach owns rows, after both sign-in steps" on public.records
  for all to authenticated
  using      (coach_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2')
  with check (coach_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2');
