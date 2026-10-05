-- Search + filter on the driver / job lists (one shared search bar).
-- Speeds up: name / firm search ("ram", "shree transport"), vehicle / language / facility filters,
-- and finding a district's pincodes (the "within 50 km of Rewa" point). Safe to run more than once.

create extension if not exists pg_trgm with schema extensions;

create index if not exists profiles_name_trgm_idx on public.profiles
  using gin (name extensions.gin_trgm_ops);
create index if not exists profiles_business_trgm_idx on public.profiles
  using gin (business_name extensions.gin_trgm_ops) where business_name is not null;

create index if not exists driver_details_vehicles_idx  on public.driver_details using gin (vehicles);
create index if not exists driver_details_languages_idx on public.driver_details using gin (languages);
create index if not exists posts_facilities_idx         on public.posts using gin (facilities);
create index if not exists posts_live_savings_idx       on public.posts (tenant_id, savings_monthly desc) where status = 'live';

create index if not exists pincodes_district_state_idx  on public.pincodes (lower(district), state);
