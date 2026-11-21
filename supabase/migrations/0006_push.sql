-- Phone notifications. Each phone that turns them on leaves a push subscription here; database events call the
-- `notify` Edge Function (supabase/functions/notify), which encrypts and sends them.
-- Coach: an archer joined, started shooting, finished a session. Archer: a new season plan, a reminder on training days.
-- Also: the coach can send an archer their season plan (shared_plans), which the archer's app shows.
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- One row per phone (and account) with notifications on. prefs: which kinds it wants, e.g. {"joined": true}.
create table public.push_subs (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text        not null check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh     text        not null check (length(p256dh) between 80 and 100),
  auth       text        not null check (length(auth) between 16 and 32),
  prefs      jsonb       not null default '{}' check (jsonb_typeof(prefs) = 'object' and octet_length(prefs::text) <= 500),
  lang       text        not null default 'en' check (lang in ('en', 'ar')),
  tz         text        not null default 'UTC' check (length(tz) <= 64),
  updated_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);
alter table public.push_subs enable row level security;
alter table public.push_subs force row level security;
create policy "own phones" on public.push_subs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.push_subs from anon;
grant select, insert, update, delete on public.push_subs to authenticated;
grant select, delete on public.push_subs to service_role;

-- The server's signing key for push (VAPID). Made by the function on first use; no visitor can read it.
create table public.push_keys (
  id          int   primary key check (id = 1),
  private_jwk jsonb not null,
  public_key  text  not null
);
alter table public.push_keys enable row level security;
alter table public.push_keys force row level security;
revoke all on public.push_keys from anon, authenticated;
grant select, insert on public.push_keys to service_role;

-- A season plan the coach sent to a linked archer: the weeks' phases, the days and the competitions.
create table public.shared_plans (
  coach_id   uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  athlete_id text        not null check (length(athlete_id) between 1 and 100),
  archer_id  uuid        not null references auth.users (id) on delete cascade,
  year       int         not null check (year between 1990 and 2100),
  data       jsonb       not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 300000),
  updated_at timestamptz not null default now(),
  primary key (coach_id, athlete_id, year)
);
alter table public.shared_plans enable row level security;
alter table public.shared_plans force row level security;
create policy "coach sends to a linked archer" on public.shared_plans for all to authenticated
  using      (coach_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2' and (select public.my_role()) = 'coach')
  with check (coach_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2' and (select public.my_role()) = 'coach' and exists (
    select 1 from public.invites i where i.coach_id = shared_plans.coach_id and i.athlete_id = shared_plans.athlete_id and i.claimed_by = shared_plans.archer_id));
create policy "archer reads plans while linked" on public.shared_plans for select to authenticated
  using (archer_id = (select auth.uid()) and exists (
    select 1 from public.invites i where i.claimed_by = (select auth.uid()) and i.coach_id = shared_plans.coach_id and i.athlete_id = shared_plans.athlete_id));
revoke all on public.shared_plans from anon;
grant select, insert, update, delete on public.shared_plans to authenticated;
grant select on public.shared_plans to service_role;

create trigger shared_plans_touch before insert or update on public.shared_plans
  for each row execute function public.touch_archer_session();

-- The function proves the database called it with this secret, made here and kept in the Vault.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'notify_secret', 'ERA Lab: database → notify function');
create function public.notify_secret_ok(s text) returns boolean
language sql stable security definer set search_path = '' as
$$ select exists (select 1 from vault.decrypted_secrets where name = 'notify_secret' and decrypted_secret = s and length(s) = 64) $$;
revoke all on function public.notify_secret_ok(text) from public, anon, authenticated;
grant execute on function public.notify_secret_ok(text) to service_role;

-- Asks the function to send. Skips accounts with no phone signed up, and never lets a notification break the write
-- that caused it.
create function public.push_notify(kind text, to_user uuid, args jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if kind <> 'reminders' and not exists (select 1 from public.push_subs where user_id = to_user) then return; end if;
  perform net.http_post(
    url     := 'https://snljkhitklnfezxbhirv.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret')),
    body    := jsonb_build_object('kind', kind, 'to', to_user, 'args', args));
exception when others then raise warning 'push_notify % failed: %', kind, sqlerrm;
end $$;
revoke all on function public.push_notify(text, uuid, jsonb) from public, anon, authenticated;

-- Coach: an archer used the invite.
create function public.push_on_invite() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.claimed_by is null and new.claimed_by is not null then
    perform public.push_notify('joined', new.coach_id, jsonb_build_object('name', new.name));
  end if;
  return null;
end $$;
create trigger push_on_invite after update on public.invites for each row execute function public.push_on_invite();

-- Coach: an archer's phone sent a new session (started), or a session's end time arrived (finished).
create function public.push_on_session() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who text; n int; total int; dist jsonb := new.data -> 'context' -> 'distance_m';
begin
  select i.name into who from public.invites i where i.claimed_by = new.archer_id and i.coach_id = new.coach_id;
  if tg_op = 'INSERT' and new.data ->> 'end_ms' is null then
    perform public.push_notify('started', new.coach_id, jsonb_build_object('name', who, 'dist', dist));
  elsif new.data ->> 'end_ms' is not null and (tg_op = 'INSERT' or old.data ->> 'end_ms' is null) then
    select count(*), coalesce(sum(case when a ->> 'score' = 'X' then 10 when a ->> 'score' ~ '^(10|[1-9])$' then (a ->> 'score')::int else 0 end), 0)
      into n, total
      from jsonb_array_elements(case when jsonb_typeof(new.data -> 'ends') = 'array' then new.data -> 'ends' else '[]' end) e,
           jsonb_array_elements(case when jsonb_typeof(e -> 'arrows') = 'array' then e -> 'arrows' else '[]' end) a
     where a ->> 'score' is not null;
    perform public.push_notify('finished', new.coach_id, jsonb_build_object('name', who, 'dist', dist, 'arrows', n, 'total', total));
  end if;
  return null;
exception when others then raise warning 'push_on_session failed: %', sqlerrm; return null;
end $$;
create trigger push_on_session after insert or update on public.archer_sessions for each row execute function public.push_on_session();

-- Archer: the coach sent a season plan.
create function public.push_on_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.push_notify('plan', new.archer_id, jsonb_build_object('year', new.year));
  return null;
end $$;
create trigger push_on_plan after insert or update on public.shared_plans for each row execute function public.push_on_plan();

-- Archer: every hour the function checks whose phone it is 07:00 for and who has training planned today.
select cron.schedule('era-training-reminders', '0 * * * *', $$ select public.push_notify('reminders', null, '{}'::jsonb) $$);
