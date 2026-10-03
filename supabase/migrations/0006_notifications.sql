-- Sprint 6: notifications (in-app bell + phone push).
-- Run after 0005_trust.sql (Supabase > SQL Editor).

-- The text is built in the app from `kind` + `data`, so it shows in the user's own language.
create table if not exists public.notifications (
  id          bigint generated always as identity primary key,
  tenant_id   text not null references public.tenants (id),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('new_post', 'new_interest', 'interest_seen', 'post_live', 'post_rejected')),
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;

-- Phones / browsers that receive push. kind: webpush (PWA / Chrome) or fcm (Android APK).
create table if not exists public.push_subscriptions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('webpush', 'fcm')),
  endpoint    text not null,              -- web push endpoint URL, or FCM device token
  keys        jsonb not null default '{}'::jsonb,   -- web push p256dh + auth
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  unique (endpoint)
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- What the user wants to hear about, e.g. {"new_post": false}. Missing key = on.
alter table public.profiles
  add column if not exists notify_prefs jsonb not null default '{}'::jsonb;

-- Old notifications are not needed forever.
-- (Optional, run monthly) delete from public.notifications where created_at < now() - interval '90 days';
