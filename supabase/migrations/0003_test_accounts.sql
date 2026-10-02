-- Test accounts: mark any phone number as "test" so its data can be hidden from real users,
-- left out of analytics, and deleted in one go after testing.
-- Run after 0002_profile_setup.sql (Supabase > SQL Editor).

create table if not exists public.test_phones (
  phone       text primary key check (phone ~ '^91[6-9][0-9]{9}$'),   -- 91 + 10-digit mobile
  note        text,                                                   -- e.g. 'Abhishek - own phone'
  created_at  timestamptz not null default now()
);
alter table public.test_phones enable row level security;
revoke all on public.test_phones from anon, authenticated;

alter table public.profiles
  add column if not exists is_test boolean not null default false;
create index if not exists profiles_test_idx on public.profiles (tenant_id) where is_test;

-- New or changed profiles pick up the flag from the list automatically.
create or replace function public.profiles_mark_test() returns trigger
language plpgsql as $$
begin
  new.is_test := exists (select 1 from public.test_phones t where t.phone = new.phone);
  return new;
end $$;

drop trigger if exists profiles_mark_test on public.profiles;
create trigger profiles_mark_test before insert or update of phone on public.profiles
  for each row execute function public.profiles_mark_test();

-- Adding / removing a number from the list updates existing profiles straight away.
create or replace function public.test_phones_sync() returns trigger
language plpgsql as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update public.profiles set is_test = true where phone = new.phone;
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    update public.profiles set is_test = false
    where phone = old.phone and (tg_op = 'DELETE' or old.phone <> new.phone);
  end if;
  return null;
end $$;

drop trigger if exists test_phones_sync on public.test_phones;
create trigger test_phones_sync after insert or update or delete on public.test_phones
  for each row execute function public.test_phones_sync();

-- Analytics: events from test accounts are marked when they arrive.
alter table public.events
  add column if not exists is_test boolean not null default false;

-- The fixed-OTP numbers set up in Supabase Auth are always test numbers.
insert into public.test_phones (phone, note) values
  ('919999999999', 'Supabase test OTP'),
  ('919999999991', 'Supabase test OTP'),
  ('919999999992', 'Supabase test OTP'),
  ('919999999993', 'Supabase test OTP')
on conflict (phone) do nothing;
