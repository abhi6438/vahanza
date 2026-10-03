-- Sprint 5: reports, blocks and ratings.
-- Run after 0004_admin.sql (Supabase > SQL Editor).

-- One open report per person per target (stops repeat taps / spam).
create unique index if not exists reports_one_open_idx
  on public.reports (reporter_id, target_type, target_id) where status = 'open';

-- Blocks: neither side sees the other in lists, and numbers can't be revealed either way.
create table if not exists public.blocks (
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  tenant_id   text not null references public.tenants (id),
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);
alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;

-- Ratings: 1–5 stars + quick tags, only after the two people were actually in touch.
create table if not exists public.ratings (
  rater_id    uuid not null references public.profiles (id) on delete cascade,
  ratee_id    uuid not null references public.profiles (id) on delete cascade,
  tenant_id   text not null references public.tenants (id),
  stars       smallint not null check (stars between 1 and 5),
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (rater_id, ratee_id),
  check (rater_id <> ratee_id)
);
create index if not exists ratings_ratee_idx on public.ratings (ratee_id);
alter table public.ratings enable row level security;
revoke all on public.ratings from anon, authenticated;
drop trigger if exists ratings_touch on public.ratings;
create trigger ratings_touch before update on public.ratings
  for each row execute function public.touch_updated_at();

-- Summary kept on the profile so lists can show "★ 4.3 (12)" without extra queries.
alter table public.profiles
  add column if not exists rating_avg   numeric(2,1),
  add column if not exists rating_count integer not null default 0;

create or replace function public.ratings_refresh() returns trigger
language plpgsql as $$
declare target uuid := coalesce(new.ratee_id, old.ratee_id);
begin
  update public.profiles p
     set rating_avg = s.avg, rating_count = s.n
    from (select round(avg(stars)::numeric, 1) as avg, count(*)::int as n
            from public.ratings where ratee_id = target) s
   where p.id = target;
  return null;
end $$;

drop trigger if exists ratings_refresh on public.ratings;
create trigger ratings_refresh after insert or update or delete on public.ratings
  for each row execute function public.ratings_refresh();
