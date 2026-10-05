-- Sprint 10: trust and coming back — "got the job", ratings after work, verification by photo,
-- fast-reply owners, weekly news, keeping the driver list fresh.
-- Run after 0008_growth.sql (Supabase > SQL Editor). Safe to run again.

-- "काम मिल गया": the owner says whom they hired, the driver confirms.
create table if not exists public.hires (
  id           bigint generated always as identity primary key,
  tenant_id    text not null references public.tenants (id),
  post_id      uuid references public.posts (id) on delete set null,
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  driver_id    uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'confirmed', 'declined')),
  created_at   timestamptz not null default now(),
  answered_at  timestamptz,
  check (owner_id <> driver_id)
);
create unique index if not exists hires_once_idx on public.hires (owner_id, driver_id, coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists hires_driver_idx on public.hires (driver_id, status);
create index if not exists hires_tenant_idx on public.hires (tenant_id, status, answered_at desc);

-- Counters shown on cards.
alter table public.profiles
  add column if not exists jobs_done  int not null default 0,       -- confirmed hires (as driver or as owner)
  add column if not exists fast_reply boolean not null default false; -- owner opens interested drivers within a day

-- A rating given after a confirmed job carries "✓ worked together".
alter table public.ratings add column if not exists worked boolean not null default false;

-- When the owner opened the interested drivers (for the fast-reply badge).
alter table public.interests add column if not exists seen_at timestamptz;

-- "Still looking for work?" every 14 days keeps the driver list fresh.
alter table public.driver_details add column if not exists looking_checked_at timestamptz;

-- A driver opened a job's full details (once per driver per day) — owners see "N drivers saw your post".
create table if not exists public.post_views (
  tenant_id  text not null references public.tenants (id),
  post_id    uuid not null references public.posts (id) on delete cascade,
  viewer_id  uuid not null references public.profiles (id) on delete cascade,
  day        date not null default current_date,
  primary key (post_id, viewer_id, day)
);
create index if not exists post_views_day_idx on public.post_views (day);

-- Verified badge by photo: licence + selfie (driver) or shop / GST / RC + selfie (owner), checked by an admin.
-- The photos are deleted right after the check; only the result is kept.
create table if not exists public.verifications (
  id            bigint generated always as identity primary key,
  tenant_id     text not null references public.tenants (id),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  kind          text not null check (kind in ('driver_licence', 'owner_business')),
  doc_url       text,
  selfie_url    text,
  status        text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected')),
  reason        text check (reason in ('blurry', 'mismatch', 'wrong_doc', 'expired', 'other')),
  created_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  reviewed_at   timestamptz,
  reviewed_by   uuid references public.profiles (id) on delete set null
);
create index if not exists verifications_status_idx on public.verifications (tenant_id, status, submitted_at);
create index if not exists verifications_profile_idx on public.verifications (profile_id, created_at desc);

alter table public.hires enable row level security;
alter table public.post_views enable row level security;
alter table public.verifications enable row level security;
revoke all on public.hires, public.post_views, public.verifications from anon, authenticated;

-- New notification kinds.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('new_post', 'new_interest', 'interest_seen', 'post_live', 'post_rejected',
                  'profile_views', 'licence_expiry', 'referral_joined',
                  'hire_confirm', 'hire_done', 'verify_result', 'weekly_jobs', 'post_views', 'come_back', 'still_looking'));

-- Audit trail also records verification checks.
alter table public.admin_actions drop constraint if exists admin_actions_target_type_check;
alter table public.admin_actions add constraint admin_actions_target_type_check
  check (target_type in ('post', 'profile', 'report', 'import', 'prospect', 'poster', 'verification'));
