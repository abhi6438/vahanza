# CLAUDE.md — Vahanza

Read this first. It tells an AI assistant (Claude, Codex, Cursor, Copilot…) or a new teammate what this
project is, how it is built, and the rules that must not be broken. `README.md` has the long, per-feature
detail and the go-live steps; this file is the short map.

## 1. What Vahanza is

- A **white-label app that connects vehicle owners / transporters with drivers** (mechanics later). Owners
  post "I need a driver"; drivers see jobs near them; they call each other directly. **Free for users, no
  commission.** It is our own product, offered to a client brand as a service.
- **Users are often low-literacy, Hindi-speaking, on cheap Android phones.** Hindi is the default language,
  English is the second. Big buttons, one question per screen, simple words, works at 320 px width.
- Ships as: **Android APK** (Capacitor), **web** and **mobile web / PWA** — one codebase. Plus an **admin panel**
  inside the same app (`/admin`, roles `admin` / `super_admin`).
- Product language used in code and UI: बचत (monthly savings a driver wants / a job offers), पोस्ट (a job post),
  रुचि (driver's "interested"), काम मिल गया (hire confirmed), काम का अनुभव (work history), अंक (reward points),
  टिक (trust tick), प्रीमियम (Premium).

## 2. Rules that must never be broken

1. **Phone numbers are private.** Never return or show a phone number in lists, cards, public pages, share
   links, posters, the Digital Card or search. A number is revealed only by `POST …/contact` when the user taps
   Call / WhatsApp (logged, max 60/day). Phone numbers are never searchable. Owner phones in work history are
   admin-only.
2. **No money in the rewards system.** Premium is earned with points or given free. Do not add payment flows,
   prices in ₹, or wording about paying anywhere in the app (decided by the product owner).
3. **Ticks are trust, never bought.** gray = profile complete, blue = ID checked, gold = proven work, black =
   chosen by admin. The rule lives in SQL `public.vz_tick()`; don't let points/Premium change a tick.
4. **Every user-facing string is i18n.** Add the key to BOTH `web/src/i18n/hi.json` and `en.json`
   (flat keys like `"rw.home.title"`). Write Hindi first, natural and short; never hard-code text in components.
5. **Multi-tenant.** Every table row has `tenant_id`; the API gets the brand from the `X-Brand` header via
   `Depends(tenant_id)`. Always filter by tenant.
6. **Secrets never in git, chat or the app bundle.** `.env` is ignored; only `.env.example` (empty values) is
   committed. `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `CRON_SECRET`, `FCM_SERVICE_ACCOUNT`, VAPID private key
   live only in Vercel env / local `.env`. `.env.apk` holds only public `VITE_*` values.
7. **The browser never reads tables.** RLS is on and table grants are revoked for anon/authenticated; all data
   goes through the FastAPI API, which checks the Supabase JWT. New tables must do the same (see §6).
8. **One phone number = one role** (driver or owner). Changing role goes through support.
9. Keep stored personal data minimal: licence = last 4 characters only; verification photos are deleted right
   after the admin decision; MPIN stored only as a scrypt hash.

## 3. Stack and folders

| Part | Tech | Where |
|---|---|---|
| App (web + PWA + APK) | React 19, Vite, TypeScript, Tailwind CSS 4, react-router, i18next, Capacitor 8 | `web/` |
| API | Python 3.11, FastAPI, psycopg 3 (raw SQL, dict rows), on Vercel serverless (Mumbai `bom1`) | `api/` |
| DB + login | Supabase: Postgres + PostGIS + pg_trgm, phone OTP | `supabase/migrations/` |
| Brand | one JSON per brand (name, appId, colours light/dark) | `brands/<id>.json` |
| Shared data | transport cities with Hindi names | `shared/places.json` |

```
api/index.py                 Vercel entry
api/vz/main.py               app + router list (add new routers here)
api/vz/routes/<area>.py      one router per area: me, drivers, posts, work, trust, verify, history, rewards,
                             notifications, growth, public, share, imports, admin, theme, pin, geo, photo, events, hooks
api/vz/notify.py             who gets which notification (+ push via push.py); TEXT/URL per kind
api/vz/rewards.py            points ledger, ticks, Premium, streak, challenges, leaderboard, admin config (DEFAULTS)
api/vz/search.py             shared search + filter SQL for driver / job lists
api/vz/growth.py             referrals, profile views, the daily cron job
api/tests/                   pytest with a FakeDB (no real database needed)
web/src/App.tsx              routes (public, user, admin)
web/src/lib/api.ts           every API call + its TypeScript types
web/src/lib/                 auth, brand/theme, search, history, track (analytics), platform, storage…
web/src/components/ui.tsx    Button, Card, Chip, Dialog, Switch, Icon.*, Frame, HideableStack… (use these)
web/src/components/shell.tsx AppShell (desktop sidebar / mobile hero + bottom tabs), HeroBar, WithRail, CardGrid
web/src/components/cards.tsx DriverCard / JobCard (compact list layout + `full` layout in the details dialog)
web/src/pages/               one file per screen; admin screens in pages/admin/
web/src/styles.css           design tokens (sizes, tick colours, motion) — colours come from the theme at runtime
web/src/i18n/{hi,en}.json    all texts
scripts/build-apk.sh         one-command APK build
```

## 4. Commands

```bash
# API (from repo root)
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt
cd api && uvicorn vz.main:app --reload --port 8000      # docs at /api/docs
cd api && pytest -q                                      # must stay green

# App
cd web && npm install && npm run dev                     # http://localhost:5173, /api proxied to :8000
cd web && npx tsc -b && npm run build                    # typecheck + production build

# Android APK (Mac/Linux, from repo root; downloads Java 21 / SDK tools if missing)
bash scripts/build-apk.sh                                # → apk/vahanza-<version>.apk
```

- APK version = `web/package.json` version + build number in `web/apk-version.json`; the script bumps it
  (versionCode must always go up). APK files are not committed.
- Local login without SMS: Supabase test phone numbers, or `DEV_MINT_SESSIONS=1` + `SUPABASE_JWT_SECRET`
  locally (never in production).
- Daily job: Vercel cron → `GET /api/v1/cron/daily` with `Authorization: Bearer $CRON_SECRET` (reminders,
  ticks, rewards, weekly alerts).

## 5. Backend conventions

- **Router per area**, prefix `/api/v1` (set in `main.py`). Typical handler:
  `def x(body: In, user: AuthUser = Depends(current_user), db=Depends(get_db), tenant: str = Depends(tenant_id))`.
  Load the caller's profile first (each router has a small `_me()` that checks tenant + blocked + role).
- **SQL is written by hand** with `%s` / `%(name)s` params; `db.execute(...).fetchone()` returns a dict.
  Never format user input into SQL strings.
- **Errors**: `raise HTTPException(422, {"code": "bad_month"})` — the app shows `t('<area>.err.<code>')`.
- **Side effects never break the main action**: wrap notifications, points, tick refresh in
  `notify.safe(db, fn, *args)` (runs in a savepoint, logs on failure).
- **Admin endpoints**: `ctx: dict = Depends(admin_ctx)` and record every change with
  `_audit(db, ctx, action, target_type, target_id, note)`.
- **Rewards hooks**: when you add a user action worth points, call
  `notify.safe(db, rewards.award, tenant, user_id, "<kind>", ref)`; add the kind to `KINDS` and `DEFAULTS["earn"]`
  in `rewards.py` and its label `rw.kind.<kind>` in both i18n files. Admin can change all numbers live
  (Admin → इनाम, stored in `tenants.rewards_config`).
- **Notifications**: a new kind needs (a) the DB check constraint updated in a migration, (b) `TEXT` + `URL` in
  `notify.py`, (c) `NotifKind` + icon/dot in `web/src/pages/Notifications.tsx`, (d) `notif.<kind>.*` texts.
- **Tests** (`api/tests`): use the `client` and `db` fixtures. `db.respond("<SQL substring>", row_or_rows)`
  queues ONE answer for the next query containing that substring (answers are used up in order — queue again
  for a second request). Assert on `db.calls` (list of `(sql, params)`). Add tests with every API change.

## 6. Database / migrations

- Files `supabase/migrations/NNNN_name.sql`, numbered, run in order in the Supabase SQL editor. The current
  last one is listed in README §1. **Never edit a migration that already ran on live — add a new one.**
- Every migration must be **safe to run more than once** (`if not exists`, `drop constraint if exists` + add).
- New table checklist: `tenant_id text not null references public.tenants (id)`, indexes for the queries,
  `alter table … enable row level security;` and `revoke all on … from anon, authenticated;`.
- Check constraints that grow over time: `notifications_kind_check`, `admin_actions_target_type_check`,
  `premium_passes_source_check` — re-create them with the full list.

## 7. Frontend conventions

- **Pages** use `AppShell` (title, `actions`, mobile `heroTop` / `hero`, `back`). Lists use `CardGrid`; Home uses
  `WithRail` (`mobileTop` on phones, right rail on desktop) and `HideableStack` for dismissible suggestion cards.
- **Use the shared pieces** (`Button size`, `Chip`, `Card`, `Dialog`, `Switch`, `Badge`, `Icon.<name>` from
  `components/ui.tsx`, `TextField` from `form.tsx`). Icons are Lucide only (WhatsApp is the one custom mark).
- **No hard-coded colours.** Use the Tailwind theme names (`bg-primary`, `text-text-2`, `border-border`,
  `bg-action`, `text-success`…); they map to runtime `--c-*` variables set by the Theme Builder. Tick and
  Premium colours: `tick-fill-*`, `tick-chip-*`, `premium-fill` classes in `styles.css`.
- **Sizes come from tokens** (`h-ctl-md`, `p-card`, `gap-grid`, `size-icon-sm`, `h-header`…), not raw pixels.
- **Mobile first.** Check every screen at **320, 390 and 1280 px**, light and dark. No horizontal scroll. Keep
  list cards short (one line of facts, details behind "पूरी जानकारी").
- **API calls only through `lib/api.ts`** (typed). Analytics: `track('event', props)` and `trackScreen('name')`.
- **CSS gotcha:** unlayered global CSS beats Tailwind utilities. Put global element rules inside
  `@layer base { … }` (e.g. `text-wrap: balance` on headings, otherwise `truncate` stops working).
- Lucide icons render at `1.25em`; inside a fixed-size box give the svg an explicit size
  (`[&>svg]:size-…` or `!h-full !w-full`).
- Service worker updates itself and reloads (`registerSW({ immediate: true })`); don't cache API responses.

## 8. Where each feature lives

| Feature | API | App |
|---|---|---|
| Login, OTP, MPIN, app lock | `routes/me.py`, `routes/pin.py`, `vz/pin.py` | `pages/Login, Otp, MpinLogin, PinSetup`, `components/app-lock.tsx` |
| Profile setup (driver / owner, fleet) | `routes/me.py` | `pages/Setup*.tsx`, `components/Wizard.tsx` |
| Driver list / job list, search + filters | `routes/drivers.py`, `routes/posts.py`, `vz/search.py` | `pages/Home.tsx`, `components/search.tsx`, `cards.tsx` |
| Posts, interests, hires ("काम मिल गया") | `routes/posts.py`, `routes/work.py` | `pages/PostNew, MyPosts, MyInterests`, `components/work.tsx` |
| No-login pages, share links `/j` `/r` `/q` | `routes/public.py`, `routes/share.py` | `pages/PublicJobs.tsx` |
| Ratings, reports, blocks | `routes/trust.py` | `components/trust.tsx` |
| Verification (photo + selfie) | `routes/verify.py` | `pages/Verify.tsx`, admin queue |
| Work history + owner confirm + `/h/<token>` link | `routes/history.py` | `pages/History*.tsx`, `components/history.tsx` |
| Rewards: points, ticks, Premium, streak, challenges | `vz/rewards.py`, `routes/rewards.py` | `pages/Rewards.tsx`, `components/rewards.tsx`, `pages/Viewers.tsx` |
| Notifications + push | `vz/notify.py`, `vz/push.py`, `routes/notifications.py` | `pages/Notifications.tsx`, `components/notify.tsx` |
| Referrals, Digital Card, profile views, cron | `vz/growth.py`, `routes/growth.py` | `pages/Invite.tsx`, `components/growth.tsx` |
| Admin: dashboard, queue, users, import, posters | `routes/admin.py`, `routes/imports.py` | `pages/admin/*` |
| Admin: rewards settings | `routes/rewards.py` (`/admin/rewards/*`) | `pages/admin/AdminRewards.tsx` |
| Theme Builder (live brand colours) | `routes/theme.py` | `pages/admin/AdminAppearance.tsx`, `lib/brand-theme.ts` |

## 9. Before you say "done"

1. `cd api && pytest -q` passes; new behaviour has a test.
2. `cd web && npx tsc -b && npm run build` passes.
3. New texts exist in `hi.json` and `en.json`.
4. Screens checked at 320 / 390 / 1280 px (and dark mode) — no overflow, nothing cut off.
5. Schema change = a new, re-runnable migration + a line in README §1 / the feature's "Go-live" note.
6. Rules in §2 still hold (no phone numbers leaked, no money wording, tenant filter, secrets out of git).
7. Update `README.md` for any new feature or setting (short, plain English).

## 10. Working style for this project

- The product owner writes in Hinglish and prefers **short answers, concrete results and screenshots** over long
  explanations, and simple solutions over complex ones. Ask only when a decision is really his.
- UI text for users: Hindi first, everyday words (not formal / Sanskritised), short.
- Keep the main screen focused on what the user came for; extras go in Profile or behind one tap.
