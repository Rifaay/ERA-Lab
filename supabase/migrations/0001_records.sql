-- RACM data on Supabase: every coach sees and changes only their own rows.
-- One row per record the app keeps in localStorage today; `kind` names the old key, `data` holds the record as-is,
-- so storage.js can switch over in phase 2 without changing any screen.
-- shortcut: records are untyped jsonb, move a kind to its own table once the server must query inside it (reports, sharing).

create table public.records (
  coach_id   uuid        not null default auth.uid() references auth.users (id) on delete cascade, -- deleting the account erases the data
  kind       text        not null check (kind in (
               'athletes', 'sessions', 'assessments', 'plans', 'goals', 'progressLogs',
               'checkIns', 'exercises', 'goalTemplates', 'settings', 'range')),
  id         text        not null check (length(id) between 1 and 100), -- settings and range use id 'main'
  data       jsonb       not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 1000000),
  updated_at timestamptz not null default now(),
  primary key (coach_id, kind, id)
);

alter table public.records enable row level security;
alter table public.records force row level security; -- the table owner obeys the policy too

-- (select auth.uid()) runs once per query instead of once per row.
create policy "coach owns rows" on public.records
  for all to authenticated
  using      (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));

-- Logged-out visitors get nothing, even if a policy is added by mistake later.
revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;
