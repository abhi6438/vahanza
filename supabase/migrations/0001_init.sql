-- Vahanza: initial schema (Release 1 foundation)
-- All app data is read and written by the FastAPI backend through the database connection.
-- The browser/app never queries tables directly, so RLS is enabled with NO policies
-- (deny-all for the anon/authenticated roles) as a second line of defence.

create extension if not exists postgis with schema extensions;

-- ---------- tenants (white-label brands) ----------
create table public.tenants (
  id          text primary key,              -- e.g. 'vahanza'
  name        text not null,
  created_at  timestamptz not null default now()
);

insert into public.tenants (id, name) values ('vahanza', 'Vahanza');

-- ---------- enums ----------
create type public.user_role   as enum ('driver', 'owner', 'admin', 'super_admin');
create type public.post_status as enum ('live', 'under_check', 'paused', 'filled', 'closed');

-- ---------- helper: updated_at ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- profiles (one per login) ----------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  tenant_id     text not null references public.tenants (id),
  role          public.user_role,
  name          text,
  phone         text,
  photo_url     text,
  lang          text not null default 'hi' check (lang in ('hi', 'en')),
  city          text,
  pincode       text check (pincode ~ '^[1-9][0-9]{5}$'),
  location      extensions.geography(point, 4326),
  verified      boolean not null default false,
  blocked       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);
create index profiles_tenant_role_idx on public.profiles (tenant_id, role);
create index profiles_location_idx    on public.profiles using gist (location);
create index profiles_last_seen_idx   on public.profiles (tenant_id, last_seen_at desc);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- driver details ----------
create table public.driver_details (
  profile_id          uuid primary key references public.profiles (id) on delete cascade,
  tenant_id           text not null references public.tenants (id),
  vehicles            text[] not null default '{}',     -- truck, trailer, bus, car, jcb, tractor, auto, pickup
  max_wheels          smallint check (max_wheels between 4 and 30),
  licence_type        text check (licence_type in ('LMV', 'HMV', 'Transport')),
  licence_last4       text check (licence_last4 ~ '^[A-Z0-9]{4}$'),   -- full number is never stored in R1
  experience_years    smallint check (experience_years between 0 and 60),
  savings_wanted      integer check (savings_wanted between 0 and 500000),  -- rupees per month
  savings_negotiable  boolean not null default true,
  pay_prefs           text[] not null default '{}',     -- fix, trip, km, bhatta, comm
  work_type           text check (work_type in ('full', 'day', 'trip')),
  area                text check (area in ('local', 'dist', 'state', 'india')),
  languages           text[] not null default '{}',
  available_from      text check (available_from in ('now', 'w1', 'd15', 'm1')),
  is_available        boolean not null default true,
  updated_at          timestamptz not null default now()
);
create index driver_details_tenant_idx on public.driver_details (tenant_id, is_available);
create trigger driver_details_touch before update on public.driver_details
  for each row execute function public.touch_updated_at();

-- ---------- owner fleet groups ----------
create table public.fleet_groups (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null references public.tenants (id),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  vehicle_type  text not null,
  wheels        smallint check (wheels between 4 and 30),
  vehicle_count integer not null check (vehicle_count between 1 and 10000),
  base_cities   text[] not null default '{}',
  created_at    timestamptz not null default now()
);
create index fleet_groups_owner_idx on public.fleet_groups (owner_id);

-- ---------- requirement posts ----------
create table public.posts (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           text not null references public.tenants (id),
  owner_id            uuid not null references public.profiles (id) on delete cascade,
  status              public.post_status not null default 'under_check',
  savings_monthly     integer not null check (savings_monthly between 0 and 500000),
  savings_negotiable  boolean not null default true,
  pay_mix             jsonb not null default '{}'::jsonb,   -- {"trip":2500,"bhatta":250}
  base_cities         text[] not null default '{}',
  coverage            text check (coverage in ('local', 'state', 'near', 'india')),
  often_cities        text[] not null default '{}',
  licence_type        text check (licence_type in ('LMV', 'HMV', 'Transport')),
  min_experience      smallint check (min_experience between 0 and 60),
  work_type           text check (work_type in ('full', 'day', 'trip')),
  facilities          text[] not null default '{}',
  check_flags         jsonb not null default '[]'::jsonb,   -- reasons from automatic checks
  expires_at          timestamptz not null default now() + interval '30 days',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index posts_tenant_status_idx on public.posts (tenant_id, status, created_at desc);
create index posts_owner_idx         on public.posts (owner_id);
create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

create table public.post_groups (
  post_id         uuid not null references public.posts (id) on delete cascade,
  fleet_group_id  uuid not null references public.fleet_groups (id) on delete cascade,
  drivers_needed  smallint not null check (drivers_needed between 1 and 500),
  primary key (post_id, fleet_group_id)
);

-- ---------- interests ("रुचि है") ----------
create table public.interests (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null references public.tenants (id),
  post_id     uuid not null references public.posts (id) on delete cascade,
  driver_id   uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'sent' check (status in ('sent', 'seen', 'not_suitable')),
  created_at  timestamptz not null default now(),
  unique (post_id, driver_id)
);

-- ---------- reports ----------
create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    text not null references public.tenants (id),
  reporter_id  uuid references public.profiles (id) on delete set null,
  target_type  text not null check (target_type in ('profile', 'post')),
  target_id    uuid not null,
  reason       text not null check (reason in ('fake', 'wrong_number', 'asked_money', 'behaviour', 'other')),
  note         text,
  status       text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at   timestamptz not null default now()
);
create index reports_tenant_status_idx on public.reports (tenant_id, status);

-- ---------- analytics events ----------
create table public.events (
  id           bigint generated always as identity primary key,
  tenant_id    text not null references public.tenants (id),
  user_id      uuid,                 -- null for visitors who are not logged in
  anon_id      text not null,        -- random id kept on the device
  session_id   text not null,
  name         text not null,        -- screen_view, tap_call, otp_requested ...
  screen       text,
  props        jsonb not null default '{}'::jsonb,
  platform     text,                 -- android_app | web_mobile | web_desktop | ios_web
  os           text,
  browser      text,
  device       text,
  app_version  text,
  standalone   boolean,              -- PWA opened from the home screen
  city         text,                 -- approximate, from the network
  region       text,
  ts           timestamptz not null, -- time on the device
  received_at  timestamptz not null default now()
);
create index events_tenant_ts_idx   on public.events (tenant_id, ts desc);
create index events_tenant_name_idx on public.events (tenant_id, name, ts desc);

-- ---------- OTP send log (abuse limits in the send-SMS hook) ----------
create table public.sms_log (
  id       bigint generated always as identity primary key,
  phone    text not null,
  sent_at  timestamptz not null default now()
);
create index sms_log_phone_idx on public.sms_log (phone, sent_at desc);

-- ---------- PIN codes (India Post list, loaded separately) ----------
create table public.pincodes (
  pincode   text primary key check (pincode ~ '^[1-9][0-9]{5}$'),
  office    text,
  district  text not null,
  state     text not null,
  location  extensions.geography(point, 4326)
);
create index pincodes_location_idx on public.pincodes using gist (location);

-- ---------- lock down direct access ----------
alter table public.tenants        enable row level security;
alter table public.profiles       enable row level security;
alter table public.driver_details enable row level security;
alter table public.fleet_groups   enable row level security;
alter table public.posts          enable row level security;
alter table public.post_groups    enable row level security;
alter table public.interests      enable row level security;
alter table public.reports        enable row level security;
alter table public.events         enable row level security;
alter table public.sms_log        enable row level security;
alter table public.pincodes       enable row level security;

revoke all on all tables in schema public from anon, authenticated;
