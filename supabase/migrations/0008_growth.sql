-- Sprint 8: driver growth — public jobs, share links, referral, QR posters, profile views, licence reminders.
-- Run after 0007_imports.sql (Supabase > SQL Editor). Safe to run again.

-- Who brought whom, and the referral reward ("Top" in lists for a few days).
alter table public.profiles
  add column if not exists ref_code     text,                 -- personal invite code (made on first use)
  add column if not exists referred_by  uuid references public.profiles (id) on delete set null,
  add column if not exists joined_via   text check (joined_via in ('direct', 'share', 'ref', 'poster', 'invite')),
  add column if not exists joined_code  text,                 -- the share / referral / poster / invite code
  add column if not exists ref_rewarded boolean not null default false,  -- the person who invited them got the boost
  add column if not exists boost_until  timestamptz;          -- shown first in lists until then
create unique index if not exists profiles_ref_code_idx on public.profiles (ref_code) where ref_code is not null;
create index if not exists profiles_referred_by_idx on public.profiles (referred_by) where referred_by is not null;
create index if not exists profiles_joined_idx on public.profiles (tenant_id, joined_via, joined_code);

-- Licence renewal reminder.
alter table public.driver_details add column if not exists licence_expiry date;

-- Short code for a job's public / WhatsApp link (/j/<code>).
alter table public.posts add column if not exists share_code text;
update public.posts set share_code = substr(md5(id::text || random()::text), 1, 8) where share_code is null;
alter table public.posts alter column share_code set default substr(md5(gen_random_uuid()::text), 1, 8);
alter table public.posts alter column share_code set not null;
create unique index if not exists posts_share_code_idx on public.posts (share_code);

-- Personal invite link for imported people (/?inv=driver&p=<code>): "your profile is ready".
alter table public.prospects add column if not exists code text;
update public.prospects set code = substr(md5(id::text || random()::text), 1, 10) where code is null;
alter table public.prospects alter column code set default substr(md5(gen_random_uuid()::text), 1, 10);
create unique index if not exists prospects_code_idx on public.prospects (code);

-- QR posters (dhaba, transport nagar, petrol pump...). The QR opens /q/<code>.
create table if not exists public.posters (
  id          bigint generated always as identity primary key,
  tenant_id   text not null references public.tenants (id),
  code        text not null unique default substr(md5(gen_random_uuid()::text), 1, 6),
  place       text not null,              -- where it is stuck, e.g. "Rewa transport nagar"
  district    text,
  state       text,
  admin_id    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists posters_tenant_idx on public.posters (tenant_id, created_at desc);

-- An owner opened a driver's full profile (counted once per owner per day).
create table if not exists public.profile_views (
  tenant_id  text not null references public.tenants (id),
  driver_id  uuid not null references public.profiles (id) on delete cascade,
  viewer_id  uuid not null references public.profiles (id) on delete cascade,
  day        date not null default current_date,
  primary key (driver_id, viewer_id, day)
);
create index if not exists profile_views_driver_idx on public.profile_views (driver_id, day desc);

alter table public.posters enable row level security;
alter table public.profile_views enable row level security;
revoke all on public.posters, public.profile_views from anon, authenticated;

-- New notification kinds.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('new_post', 'new_interest', 'interest_seen', 'post_live', 'post_rejected',
                  'profile_views', 'licence_expiry', 'referral_joined'));

-- Audit trail also records posters.
alter table public.admin_actions drop constraint if exists admin_actions_target_type_check;
alter table public.admin_actions add constraint admin_actions_target_type_check
  check (target_type in ('post', 'profile', 'report', 'import', 'prospect', 'poster'));
