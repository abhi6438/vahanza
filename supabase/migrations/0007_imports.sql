-- Sprint 7: bulk import of drivers / transporters, invites, and "claim your profile" on signup.
-- Run after 0006_notifications.sql (Supabase > SQL Editor).

-- One uploaded file.
create table if not exists public.imports (
  id          bigint generated always as identity primary key,
  tenant_id   text not null references public.tenants (id),
  admin_id    uuid references public.profiles (id) on delete set null,
  role        public.user_role not null check (role in ('driver', 'owner')),
  filename    text,
  source      text,                       -- e.g. "Rewa transport union list"
  total       int not null default 0,     -- rows in the file
  added       int not null default 0,     -- new people added
  updated     int not null default 0,     -- already imported earlier, details refreshed
  on_app      int not null default 0,     -- already using the app
  bad         int not null default 0,     -- skipped (wrong number, repeated row)
  created_at  timestamptz not null default now()
);
create index if not exists imports_tenant_idx on public.imports (tenant_id, created_at desc);

-- People we know about but who have not joined yet. One row per phone per brand.
create table if not exists public.prospects (
  id              bigint generated always as identity primary key,
  tenant_id       text not null references public.tenants (id),
  import_id       bigint references public.imports (id) on delete set null,
  role            public.user_role not null check (role in ('driver', 'owner')),
  phone           text not null check (phone ~ '^91[6-9][0-9]{9}$'),
  name            text,
  business_name   text,
  district        text,
  state           text,
  vehicles        text[] not null default '{}',
  vehicle_count   int check (vehicle_count between 1 and 10000),
  note            text,
  invites         smallint not null default 0,
  last_invited_at timestamptz,
  last_channel    text check (last_channel in ('sms', 'whatsapp')),
  opted_out       boolean not null default false,  -- said "don't contact me": never invite again
  joined_at       timestamptz,
  profile_id      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, phone)
);
create index if not exists prospects_import_idx on public.prospects (import_id);
create index if not exists prospects_status_idx on public.prospects (tenant_id, role, joined_at, last_invited_at);
drop trigger if exists prospects_touch on public.prospects;
create trigger prospects_touch before update on public.prospects
  for each row execute function public.touch_updated_at();

alter table public.imports enable row level security;
alter table public.prospects enable row level security;
revoke all on public.imports, public.prospects from anon, authenticated;

-- Audit trail also records imports and invites (these have number ids, so target_id stays empty and the note says what).
alter table public.admin_actions alter column target_id drop not null;
alter table public.admin_actions drop constraint if exists admin_actions_target_type_check;
alter table public.admin_actions add constraint admin_actions_target_type_check
  check (target_type in ('post', 'profile', 'report', 'import', 'prospect'));
