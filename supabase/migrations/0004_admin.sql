-- Sprint 4: admin panel. Every admin action is recorded (who, what, when) for accountability.
-- Run after 0003_test_accounts.sql (Supabase > SQL Editor).

create table if not exists public.admin_actions (
  id           bigint generated always as identity primary key,
  tenant_id    text not null references public.tenants (id),
  admin_id     uuid not null references public.profiles (id),
  action       text not null,          -- approve_post, reject_post, clear_profile, verify, unverify, block, unblock
  target_type  text not null check (target_type in ('post', 'profile', 'report')),
  target_id    uuid not null,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists admin_actions_tenant_idx on public.admin_actions (tenant_id, created_at desc);
alter table public.admin_actions enable row level security;
revoke all on public.admin_actions from anon, authenticated;

-- Dashboard queries
create index if not exists events_tenant_anon_idx on public.events (tenant_id, ts desc, anon_id) where not is_test;
create index if not exists profiles_tenant_created_idx on public.profiles (tenant_id, created_at desc);

-- Make yourself super admin (after logging in once with your phone):
-- update public.profiles set role = 'super_admin' where phone = '91XXXXXXXXXX';
