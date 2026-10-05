-- Sprint 11: MPIN (6 digits) so people log in without an OTP every time, + the APK fingerprint lock.
-- Run after 0009_trust.sql (Supabase > SQL Editor). Safe to run again.

-- One MPIN per person. Only a slow hash (scrypt) is kept, never the number itself.
create table if not exists public.user_pins (
  profile_id    uuid primary key references public.profiles (id) on delete cascade,
  tenant_id     text not null references public.tenants (id),
  pin_hash      text not null,
  failed        int not null default 0,          -- wrong tries in a row
  locked_until  timestamptz,                      -- after 5 wrong tries: OTP only until then
  set_at        timestamptz not null default now(),
  last_used_at  timestamptz
);

-- Every MPIN login, wrong try, change and admin reset (also used to limit tries per network address).
create table if not exists public.pin_events (
  id          bigint generated always as identity primary key,
  tenant_id   text not null,
  profile_id  uuid references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('set', 'change', 'reset_admin', 'login_ok', 'login_fail', 'locked', 'check', 'unlock_fail')),
  ip          text,
  at          timestamptz not null default now()
);
create index if not exists pin_events_ip_idx on public.pin_events (ip, at desc);
create index if not exists pin_events_profile_idx on public.pin_events (profile_id, at desc);

-- Only the API (service connection) touches these tables.
alter table public.user_pins enable row level security;
alter table public.pin_events enable row level security;

-- Old events are not needed after 90 days.
create or replace function public.prune_pin_events() returns void language sql as $$
  delete from public.pin_events where at < now() - interval '90 days';
$$;
