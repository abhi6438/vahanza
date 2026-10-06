-- Driver work history ("काम का अनुभव"): where a driver worked before, confirmed by that owner.
--   * owner on the app  → bell + push "Ramesh says he drove your truck … — right?"
--   * owner not on the app → a one-tap link (/h/<token>) sent by WhatsApp / SMS; no login needed
--   * no answer in 7 days, or "not true" → admin check queue
-- The owner can add stars + "would hire again". Confirmed jobs from the app ("काम मिल गया") are added
-- automatically. The owner's phone number is never shown to anyone except admins. Safe to run more than once.

create table if not exists public.work_history (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        text not null references public.tenants (id),
  driver_id        uuid not null references public.profiles (id) on delete cascade,
  owner_id         uuid references public.profiles (id) on delete set null,     -- owner on the app
  owner_name       text check (char_length(owner_name) <= 60),                  -- typed by the driver ("other")
  firm_name        text check (char_length(firm_name) <= 80),
  owner_district   text check (char_length(owner_district) <= 60),
  owner_state      text check (char_length(owner_state) <= 60),
  owner_phone      text check (owner_phone ~ '^91[6-9][0-9]{9}$'),              -- admins only, never shown
  vehicle          text not null check (vehicle in ('truck', 'trailer', 'bus', 'car', 'jcb', 'tractor', 'auto', 'pickup')),
  wheels           smallint check (wheels between 4 and 30),
  start_month      date not null,                                               -- first day of the month
  end_month        date,                                                        -- null = still working there
  work_type        text check (work_type in ('full', 'day', 'trip')),
  area             text check (area in ('local', 'dist', 'state', 'india')),
  note             text check (char_length(note) <= 200),
  source           text not null default 'driver' check (source in ('driver', 'hire')),
  hire_id          bigint references public.hires (id) on delete set null,
  status           text not null default 'pending'
                   check (status in ('pending', 'confirmed', 'needs_fix', 'disputed', 'admin_ok', 'admin_rejected')),
  owner_answer     text check (owner_answer in ('yes', 'no', 'dates')),
  owner_stars      smallint check (owner_stars between 1 and 5),
  owner_tags       text[] not null default '{}',
  rehire           boolean,
  answer_token     text unique,
  token_expires_at timestamptz,
  invite_count     smallint not null default 0,
  invited_at       timestamptz,
  answered_at      timestamptz,
  hidden           boolean not null default false,                               -- the driver hid it
  admin_note       text,
  checked_by       uuid references public.profiles (id) on delete set null,
  checked_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (owner_id is not null or (owner_name is not null or firm_name is not null)),
  check (end_month is null or end_month >= start_month),
  check (owner_id is null or owner_id <> driver_id)
);
create index if not exists work_history_driver_idx on public.work_history (driver_id, start_month desc);
create index if not exists work_history_owner_idx  on public.work_history (owner_id, status) where owner_id is not null;
create index if not exists work_history_queue_idx  on public.work_history (tenant_id, status, created_at);
create index if not exists work_history_phone_idx  on public.work_history (owner_phone, invited_at) where owner_phone is not null;
create unique index if not exists work_history_hire_idx on public.work_history (hire_id) where hire_id is not null;
alter table public.work_history enable row level security;
revoke all on public.work_history from anon, authenticated;
drop trigger if exists work_history_touch on public.work_history;
create trigger work_history_touch before update on public.work_history
  for each row execute function public.touch_updated_at();

-- Owner search by firm / name ("Shree…") when the driver picks the owner.
create index if not exists profiles_business_lower_idx on public.profiles (tenant_id, lower(business_name) text_pattern_ops) where role = 'owner';
create index if not exists profiles_name_lower_idx     on public.profiles (tenant_id, lower(name) text_pattern_ops) where role = 'owner';

-- Jobs already confirmed through the app become confirmed history entries.
insert into public.work_history (tenant_id, driver_id, owner_id, vehicle, start_month, source, hire_id, status, owner_answer, answered_at)
select h.tenant_id, h.driver_id, h.owner_id, coalesce(dd.vehicles[1], 'truck'),
       date_trunc('month', coalesce(h.answered_at, h.created_at))::date, 'hire', h.id, 'confirmed', 'yes', h.answered_at
from public.hires h
left join public.driver_details dd on dd.profile_id = h.driver_id
where h.status = 'confirmed'
on conflict do nothing;

-- New notification kinds.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('new_post', 'new_interest', 'interest_seen', 'post_live', 'post_rejected',
                  'profile_views', 'licence_expiry', 'referral_joined',
                  'hire_confirm', 'hire_done', 'verify_result', 'weekly_jobs', 'post_views', 'come_back', 'still_looking',
                  'history_request', 'history_answered'));

-- Admin checks of history entries go into the audit trail.
alter table public.admin_actions drop constraint if exists admin_actions_target_type_check;
alter table public.admin_actions add constraint admin_actions_target_type_check
  check (target_type in ('post', 'profile', 'report', 'import', 'prospect', 'poster', 'verification', 'theme', 'history'));
