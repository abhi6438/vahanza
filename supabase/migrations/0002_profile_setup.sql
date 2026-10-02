-- Sprint 2: profile setup for drivers and owners, fleet groups, place lookup.
-- Run after 0001_init.sql (Supabase > SQL Editor).

-- Profile: where the person lives (district/state for search), business name for owners,
-- and whether the first-time setup is finished.
alter table public.profiles
  add column if not exists business_name  text check (char_length(business_name) <= 80),
  add column if not exists district       text,
  add column if not exists state          text,
  add column if not exists setup_done     boolean not null default false,
  add column if not exists photo_added_at timestamptz;

-- Known vehicle types only; wheels only for wheeled heavy vehicles.
alter table public.fleet_groups
  add column if not exists updated_at timestamptz not null default now(),
  add constraint fleet_groups_vehicle_type_chk
    check (vehicle_type in ('truck', 'trailer', 'bus', 'car', 'jcb', 'tractor', 'auto', 'pickup')),
  add constraint fleet_groups_base_cities_chk
    check (cardinality(base_cities) <= 20);
create trigger fleet_groups_touch before update on public.fleet_groups
  for each row execute function public.touch_updated_at();

alter table public.driver_details
  add constraint driver_details_vehicles_chk
    check (vehicles <@ array['truck', 'trailer', 'bus', 'car', 'jcb', 'tractor', 'auto', 'pickup']::text[]),
  add constraint driver_details_pay_prefs_chk
    check (pay_prefs <@ array['fix', 'trip', 'km', 'bhatta', 'comm']::text[]);

-- Place search ("Rewa", "Rai...") over the pincode directory.
create index if not exists pincodes_district_idx on public.pincodes (lower(district) text_pattern_ops);
create index if not exists pincodes_office_idx   on public.pincodes (lower(office) text_pattern_ops);

-- Search helpers used by later sprints (driver list by area, posts by base city).
create index if not exists profiles_tenant_district_idx on public.profiles (tenant_id, lower(district));
create index if not exists fleet_groups_base_cities_idx on public.fleet_groups using gin (base_cities);

-- Reasons from automatic checks (e.g. a phone number typed into the name). Admin sees only flagged profiles.
alter table public.profiles
  add column if not exists check_flags jsonb not null default '[]'::jsonb;
create index if not exists profiles_flagged_idx on public.profiles (tenant_id)
  where check_flags <> '[]'::jsonb;
