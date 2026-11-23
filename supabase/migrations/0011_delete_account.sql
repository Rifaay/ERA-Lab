-- "Delete my account": the signed-in person erases their own login. Every table that keeps their data points at
-- auth.users with "on delete cascade" (records, invites, archer_sessions, shared_plans, push_subs, coach_notes,
-- profiles), so removing the login removes all of it. A coach must have done both sign-in steps; an archer signs in
-- with a password only, so one step is enough there. Returns whether an account was deleted.
create function public.delete_my_account() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return false; end if;
  if coalesce((select public.my_role()), 'coach') <> 'archer' and (select auth.jwt() ->> 'aal') is distinct from 'aal2' then return false; end if;
  delete from auth.users where id = (select auth.uid());
  return found;
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
