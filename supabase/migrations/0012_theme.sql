-- Runtime brand theme (Admin → Settings → Appearance).
-- The admin sets primary / secondary / accent colours, light-dark default, corner style and density;
-- every other shade is derived in the app. Draft = being edited, published = what every user sees.
-- No new build is needed to change the brand colours. Safe to run more than once.

alter table public.tenants
  add column if not exists theme_draft         jsonb,
  add column if not exists theme_draft_at      timestamptz,
  add column if not exists theme_published     jsonb,
  add column if not exists theme_published_at  timestamptz,
  add column if not exists theme_version       integer not null default 0;

-- theme changes go into the admin audit trail
alter table public.admin_actions drop constraint if exists admin_actions_target_type_check;
alter table public.admin_actions add constraint admin_actions_target_type_check
  check (target_type in ('post', 'profile', 'report', 'import', 'prospect', 'poster', 'verification', 'theme'));
