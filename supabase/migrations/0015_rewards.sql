-- Rewards: अंक (points), 4 ticks and Premium.
--   * Points: earned for useful actions (profile done, verified, work history confirmed, job confirmed, ...).
--     Every change is one row in reward_ledger (the "hisaab"); later coupons / cashback / cash become new kinds.
--     Points stay inside the app: they are never turned into money.
--   * Tick (trust, never bought): gray = profile complete · blue = ID checked · gold = blue + proven work
--     · black = chosen by Vahanza (admin only). Computed by public.vz_tick().
--   * Premium: only with points (nobody pays money), or free: new-user trial, gold / black tick every month,
--     monthly top inviters per district, or given by Vahanza (admin).
--   * Streak (open the app N days in a row) and monthly challenges — all numbers set in Admin → इनाम सेटिंग.
--   * Inviting friends earns the most (per friend + bonuses at 3 / 10 / 25 friends).
-- Safe to run more than once.

alter table public.profiles
  add column if not exists tick          text check (tick in ('gray', 'blue', 'gold', 'black')),
  add column if not exists tick_black    boolean not null default false,       -- set by an admin
  add column if not exists premium_until timestamptz,
  add column if not exists points        integer not null default 0,           -- balance (sum of the ledger)
  add column if not exists streak_days   integer not null default 0,           -- app opened N days in a row
  add column if not exists streak_last   date;

-- Admin → इनाम सेटिंग: points per action, limits, plans, free Premium, streak, top inviters, challenges.
-- Empty = the defaults in api/vz/rewards.py (DEFAULTS).
alter table public.tenants add column if not exists rewards_config jsonb not null default '{}'::jsonb;

create table if not exists public.reward_ledger (
  id         bigint generated always as identity primary key,
  tenant_id  text not null references public.tenants (id),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (char_length(kind) <= 30),   -- profile_done, verified, history_confirmed, premium, admin, ...
  points     integer not null,                                -- + earned, − spent
  ref        text not null default '',                        -- what it was for (entry id, hire id, week) — one reward per thing
  note       text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create index if not exists reward_ledger_user_idx on public.reward_ledger (user_id, created_at desc);

create table if not exists public.premium_passes (
  id           bigint generated always as identity primary key,
  tenant_id    text not null references public.tenants (id),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  plan         text not null,
  source       text not null check (source in ('points', 'gold', 'admin', 'trial', 'prize')),
  days         integer not null check (days between 1 and 400),
  points       integer,
  ends_at      timestamptz not null,
  created_at   timestamptz not null default now()
);
alter table public.premium_passes drop constraint if exists premium_passes_source_check;
alter table public.premium_passes add constraint premium_passes_source_check check (source in ('points', 'gold', 'admin', 'trial', 'prize'));
create index if not exists premium_passes_user_idx on public.premium_passes (user_id, created_at desc);


alter table public.reward_ledger  enable row level security;
alter table public.premium_passes enable row level security;
revoke all on public.reward_ledger, public.premium_passes from anon, authenticated;

-- The tick, in one place. Recomputed after the actions that change it and by the daily job.
create or replace function public.vz_tick(pid uuid) returns text language sql stable as $$
  select case
    when p.tick_black then 'black'
    when p.role = 'driver' and p.verified and coalesce(p.rating_avg, 0) >= 4
         and (select count(*) from public.work_history wh
               where wh.driver_id = p.id and wh.status in ('confirmed', 'admin_ok')) >= 2 then 'gold'
    when p.role = 'owner' and p.verified and p.jobs_done >= 3 and (p.fast_reply or coalesce(p.rating_avg, 0) >= 4) then 'gold'
    when p.verified then 'blue'
    when p.setup_done and (
         (p.role = 'driver' and exists (select 1 from public.driver_details d
                                         where d.profile_id = p.id and cardinality(d.vehicles) > 0 and d.available_from is not null))
      or (p.role = 'owner' and exists (select 1 from public.fleet_groups f where f.owner_id = p.id))) then 'gray'
  end
  from public.profiles p where p.id = pid and p.role in ('driver', 'owner')
$$;

update public.profiles set tick = public.vz_tick(id) where role in ('driver', 'owner') and tick is distinct from public.vz_tick(id);

-- Fair start: people who already did the work get those points now (same amounts as api/vz/rewards.py EARN).
insert into public.reward_ledger (tenant_id, user_id, kind, points, ref)
select tenant_id, id, 'profile_done', 50, '' from public.profiles where tick is not null
on conflict (user_id, kind, ref) do nothing;
insert into public.reward_ledger (tenant_id, user_id, kind, points, ref)
select tenant_id, id, 'verified', 100, '' from public.profiles where verified and role in ('driver', 'owner')
on conflict (user_id, kind, ref) do nothing;
insert into public.reward_ledger (tenant_id, user_id, kind, points, ref)
select tenant_id, driver_id, 'history_confirmed', 100, id::text from public.work_history
 where status in ('confirmed', 'admin_ok') and source = 'driver'
on conflict (user_id, kind, ref) do nothing;
insert into public.reward_ledger (tenant_id, user_id, kind, points, ref)
select tenant_id, u, 'hire_confirmed', 100, id::text from public.hires, unnest(array[driver_id, owner_id]) as u
 where status = 'confirmed'
on conflict (user_id, kind, ref) do nothing;
-- friends who already joined by an invite link and completed the profile
insert into public.reward_ledger (tenant_id, user_id, kind, points, ref)
select f.tenant_id, f.referred_by, 'referral', 100, f.id::text from public.profiles f
 where f.referred_by is not null and f.tick is not null
on conflict (user_id, kind, ref) do nothing;
insert into public.reward_ledger (tenant_id, user_id, kind, points, ref)
select f.tenant_id, f.id, 'joined_invite', 50, '' from public.profiles f
 where f.referred_by is not null and f.tick is not null
on conflict (user_id, kind, ref) do nothing;
insert into public.reward_ledger (tenant_id, user_id, kind, points, ref)
select r.tenant_id, r.user_id, 'referral_bonus', m.pts, m.at::text
  from (select tenant_id, user_id, count(*) as n from public.reward_ledger where kind = 'referral' group by 1, 2) r
  join (values (3, 100), (10, 300), (25, 1000)) as m(at, pts) on r.n >= m.at
on conflict (user_id, kind, ref) do nothing;
update public.profiles p set points = coalesce((select sum(l.points) from public.reward_ledger l where l.user_id = p.id), 0)
 where p.role in ('driver', 'owner');

-- New notification kind: "reward" (new tick, premium on, points for a big action).
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('new_post', 'new_interest', 'interest_seen', 'post_live', 'post_rejected',
                  'profile_views', 'licence_expiry', 'referral_joined',
                  'hire_confirm', 'hire_done', 'verify_result', 'weekly_jobs', 'post_views', 'come_back', 'still_looking',
                  'history_request', 'history_answered', 'reward'));

alter table public.admin_actions drop constraint if exists admin_actions_target_type_check;
alter table public.admin_actions add constraint admin_actions_target_type_check
  check (target_type in ('post', 'profile', 'report', 'import', 'prospect', 'poster', 'verification', 'theme', 'history', 'reward'));
