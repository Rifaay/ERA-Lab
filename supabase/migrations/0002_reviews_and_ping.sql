-- Video review records sync too, and a ping the keep-alive workflow calls so the free project never pauses.
alter table public.records drop constraint records_kind_check;
alter table public.records add constraint records_kind_check check (kind in (
  'athletes', 'sessions', 'assessments', 'plans', 'goals', 'progressLogs',
  'checkIns', 'exercises', 'goalTemplates', 'settings', 'range', 'reviews'));

-- Returns 1 and reads nothing: safe to let logged-out callers run it.
create function public.ping() returns int language sql stable as 'select 1';
revoke all on function public.ping() from public;
grant execute on function public.ping() to anon;
