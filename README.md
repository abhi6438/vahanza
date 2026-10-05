# Vahanza

A white-label app for vehicle owners and drivers. One codebase serves the web/PWA, the Android APK and the API.

| Part | Tech | Folder |
|---|---|---|
| App (web + PWA + APK) | React 19, Vite, TypeScript, Tailwind 4, Capacitor | `web/` |
| API | Python FastAPI (Vercel serverless, Mumbai `bom1`) | `api/` |
| DB + login | Supabase (Postgres + phone OTP) | `supabase/` |
| Branding | One JSON file per client brand | `brands/` |

## What works so far

### Sprint 1: foundation + login

- Language choice (Hindi first, English); speaker button reads each screen aloud
- Role choice: owner or driver (mechanic shown as "coming soon")
- Login with a mobile number and OTP. Auto-fill works on Android; resend after 30 s
- Stays logged in until logout. Two options: "logout" and "logout from all devices"
- Settings: language, light/dark/system theme, support and grievance details
- Analytics from day 1: platform (APK/web/iOS web), browser, OS, PWA install (standalone), screen views, time spent, sessions, city (from Vercel IP), heartbeat for "online now". Data goes to the `events` table
- Multi-tenant: every row has `tenant_id`; the brand comes from the `X-Brand` header
- Security: RLS on and table access revoked for anon/authenticated, so the browser can never read tables directly. All data goes through the API, which checks the Supabase JWT
- OTP SMS through MSG91, using the Supabase Send-SMS hook (signature checked, max 5 per number per hour, Indian numbers only)

### Sprint 2: profile setup

- **Driver setup** (7 short steps): photo (optional), name, where they live (GPS, pincode or city), vehicles + biggest wheel size, licence type (only the last 4 characters of the number are kept), experience, monthly savings needed (बचत) + "negotiable", pay preferences (optional), type of work, how far they can go, languages, start date, then a preview of how owners will see them
- **Owner setup** (2 steps): photo/logo (optional), name, business name (optional), location, then fleet groups added one kind at a time: vehicle → wheels (truck/trailer/bus) → how many → one or more base cities (or "no fixed city")
- Unfinished setup is saved on the phone, so closing the app does not lose answers
- "Edit" on home reopens the same screens with saved answers
- Home shows the driver's card / the owner's vehicles, a verified / not-verified badge, and a photo reminder (snoozed for 3 days after "Later")
- City picker: ~130 transport cities with Hindi names work out of the box (`shared/places.json`); more districts come from the pincode directory once imported
- Automatic checks: a phone number in the name is refused; unusual savings, experience or fleet size are flagged for the admin (nothing is blocked)
- New API: `PUT /me/profile`, `POST/DELETE /me/photo`, `GET /geo/places`, `GET /geo/pincode/{pin}`, `GET /geo/reverse`

## 1. Supabase setup (one time)

1. Create a project in region **Mumbai (ap-south-1)**.
2. SQL Editor: run the files in `supabase/migrations/` in order (`0001_init.sql` → `0002_profile_setup.sql` → `0003_test_accounts.sql` → `0004_admin.sql` → `0005_trust.sql` → `0006_notifications.sql` → `0007_imports.sql` → `0008_growth.sql` → `0009_trust.sql`).
3. Auth → Providers → **Phone**: enable it. You can pick any SMS provider here because the hook below replaces it.
4. Auth → Hooks → **Send SMS hook** → HTTPS:
   `https://<your-domain>/api/v1/hooks/send-sms`. Generate the secret and copy it into `SEND_SMS_HOOK_SECRET` (format `v1,whsec_...`).
5. For dev without SMS, go to Auth → Phone → **Test phone numbers** and add e.g. `919999999999` = `123456`.
6. Project Settings → API: copy the URL, the anon key and the JWT secret (only needed for legacy HS256 projects. New projects use JWKS automatically).
7. Database → Connect → **Transaction pooler** (port 6543): copy the URI into `DATABASE_URL`.

## 1b. Pincode directory (optional for dev, needed before launch)

Pincode and GPS lookup read the `pincodes` table. Download "All India Pincode Directory" (CSV) from data.gov.in, then:

```bash
DATABASE_URL=postgresql://... python scripts/import_pincodes.py all_india_pincode.csv
```

Until then, pincode/GPS lookup says "not found" and the user picks the city from the list instead.

## 1c. Photos (Vercel Blob)

Vercel → Storage → Create **Blob** store → connect it to the project. This adds `BLOB_READ_WRITE_TOKEN`. Locally you can leave it empty: photos are saved in a temp folder and served by the API.

## Test accounts

- Supabase Auth → Phone → **Test Phone Numbers**: `919999999999=123456,919999999991=123456,919999999992=123456,919999999993=123456` (fixed OTP, no SMS). One number = one role.
- Any other number (e.g. your own phone) can be marked as test with `supabase/dev/mark_test_number.sql`. Test accounts show a "टेस्ट" badge, their events are marked `is_test` (left out of analytics) and, from Sprint 3, they are shown only to other test accounts.
- After testing: `supabase/dev/delete_test_users.sql` deletes every test account and its data. `reset_all_data.sql` wipes everything (test project only).
- Before launch, use a separate Supabase project for live.

## Reports, blocks, ratings

- **⋮ on every driver / job card** → *Report* (asked for money, wrong / off number, fake, bad behaviour, other + optional note) or *Block*.
- When **2 different people** report the same profile or post, it goes to the admin **check queue** automatically (a live post is paused as "under check"). Admin can dismiss, close the post, or block the person; all open reports on that target close together.
- **Block** works both ways: neither sees the other in lists, and numbers can't be revealed. Undo from Profile → Blocked people.
- **Ratings** (1–5 stars + quick tags) are only possible between people who were really in touch (a number was revealed by Call / WhatsApp, or the owner opened a driver's interest). Home asks "How was …?" a few hours after the contact. Cards show ★ average (count).

## Notifications

- **🔔 Bell** on home with the unread count. The list opens the right screen (a driver's interest opens that post with the list already open).
- Who gets what:
  - **Driver**: new job near them (same vehicle type, in a base city of the post or within 150 km; max 5 a day), and "owner saw your profile".
  - **Owner**: a driver is interested; post approved / not approved after the admin check.
- Blocked people, test vs real accounts and each person's switches (Settings → Notifications) are respected.
- **Phone push** is asked at useful moments (bell page, My posts, My interests, Settings) and never on the first screen. Without the keys below the bell still works, there is just no phone alert.

### 1d. Push keys

**Web / PWA (Chrome on Android, iPhone when added to home screen)**

```bash
python scripts/make_vapid_keys.py     # prints VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
```

Put both into `.env` and Vercel, plus `VAPID_SUBJECT=mailto:<your support email>`. Make them once: new keys mean every phone has to allow alerts again. Keep the private key secret.

**Android APK (Firebase)**

1. console.firebase.google.com → Add project → Add app → Android, package name = `appId` from the brand JSON.
2. Download `google-services.json` into `web/android/app/` (not committed; it is per brand).
3. Project settings → Service accounts → **Generate new private key**. Put the whole JSON on one line into `FCM_SERVICE_ACCOUNT` (Vercel env only, never in git).
4. `npm run cap:sync`, then build the APK. On Android 13+ the app asks for permission when the user taps "Turn on".

## Bulk import (admin → डेटा जोड़ें)

1. Pick **drivers** or **owners / transporters**, optionally say where the list came from, and choose an Excel (.xlsx) or CSV file. Only a mobile number column is needed; column names can be Hindi or English in any order (नाम, मोबाइल, शहर, राज्य, गाड़ी, फर्म, गाड़ियों की संख्या …). "Download a sample file" gives the right columns. Up to 5,000 rows / 2 MB per file.
2. The preview shows what will happen to each row: **new**, **already in the list** (empty details are filled in), **already on the app** (left alone) or **skipped** (wrong number, repeated row), plus notes such as "place not found". Nothing is saved until you tap **Add N people**.
3. **Invite**: the WhatsApp button opens your own WhatsApp with a ready Hindi message and the app link (free, one person at a time). **SMS to everyone ready** sends in bulk through MSG91 and needs its own DLT template (below). A person is invited at most 3 times, at least 7 days apart; "Said no" stops invites for good.
4. When an imported number logs in, the app suggests the right role ("आपके लिए") and the first setup screen comes pre-filled with their name, place (and vehicles for drivers). They only confirm. Past files show how many were invited and how many joined.

Settings: `PUBLIC_APP_URL` (the address in invites, e.g. `https://vahanza.in`) and `MSG91_INVITE_TEMPLATE_ID` (DLT template with variables `##name##` and `##link##`, e.g. "नमस्ते ##name## जी, Vahanza पर पास का काम / ड्राइवर देखें, मुफ़्त। जुड़ें: ##link##").

## Driver growth (Sprint 8)

- **First page: "आप क्या ढूंढ रहे हैं?"** (`/start`): three big choices — I need work (driver → `/jobs`), I need a driver (owner → `/drivers`), mechanic (coming soon → `/mechanics`). Tabs on top switch between them; the choice is remembered for the next visit and pre-selects the role after OTP. The public driver list shows first name + initial, place, vehicles, licence, experience and badges — no photo, number or id.
- **Jobs without login** (`/jobs`): after choosing a language, a new visitor sees live jobs in their city ("आज रीवा में 12 ड्राइवर चाहिए"). Number + OTP are asked only on "Call the owner", and the app then opens that job. Owner names and numbers are never shown there.
- **WhatsApp share**: every live post has "WhatsApp पर भेजें" (owners in My posts, drivers on each job). The link `/j/<code>` shows a preview in WhatsApp (title + savings) and opens the job.
- **Driver's Digital Card**: Profile / Home → "मेरा कार्ड". A 1080×1920 picture (WhatsApp Status size) with photo, vehicles, licence, experience and a QR to the driver's invite link. No phone number on it.
- **Invite friends** (`/invite`): personal link `/r/<code>`. When a friend who joined through it finishes their profile, the inviter is shown first in lists (nearby only) for 7 days. No money.
- **QR posters** (admin → QR पोस्टर): one A4 poster per place (dhaba, transport nagar, RTO…), printed or saved as PDF from the browser. The table shows how many phones opened each QR and how many people joined.
- **Profile views**: owners opening a driver's full details are counted (once per owner per day); drivers see "इस हफ़्ते 8 मालिकों ने आपकी प्रोफ़ाइल देखी" and get a weekly alert.
- **Licence renewal reminder**: optional expiry date in the licence step; alerts 30 and 7 days before.
- **Personal import invites**: the invite link now carries a code (`/?inv=driver&p=<code>`): the login screen says "आपकी प्रोफ़ाइल तैयार है" with the number already filled in.
- **Speak instead of typing**: mic button on name, firm and city search (Chrome on Android / desktop). In the APK the keyboard's own mic is used.
- **Admin dashboard**: "where new people came from" (share / friend's link / poster / invite / direct), shares, and the no-login jobs funnel.

Settings: `CRON_SECRET` (any long random text). Vercel calls `/api/v1/cron/daily` every day at 09:00 IST (see `vercel.json`) for licence reminders and the Monday "profile views" alert; without the secret the job is refused. New packages: run `npm install` in `web/` (qrcode, @capacitor/share, @capacitor/filesystem) and `npx cap sync android` before an APK build.

## Trust and coming back (Sprint 10)

- **"काम मिल गया"**: when an owner marks a post filled, they pick whom they hired (drivers who showed interest or whose number they opened). Each driver confirms on their home screen. A confirmed job counts on both cards ("N काम किए"), turns the driver's availability off, and the rating afterwards carries "✓ worked together". The jobs page shows "इस महीने 23 ड्राइवरों को काम मिला".
- **Verified badge by photo**: Profile → "वेरिफाइड बैज पाएँ" (`/verify`). Driver: licence photo + selfie; owner: shop board / GST / RC + selfie. Admin approves or rejects (with a reason) in the check queue. Both photos are deleted right after the decision.
- **"जल्दी जवाब" badge**: owners who open interested drivers within a day (80%+, at least 3 in 30 days); refreshed daily.
- **Weekly news (Mondays)**: drivers "N new jobs near you", owners "N drivers saw your post". Post views are counted when a driver opens a job's full details.
- **Fresh driver list**: every 14 days a listed driver is asked "क्या अभी भी काम ढूंढ रहे हैं?"; drivers who haven't confirmed for 3 weeks move lower for owners. "No" turns availability off.
- **Come back**: people who haven't opened the app for 7–30 days hear how many new jobs / drivers came up near them (once a week).
- **Admin dashboard**: jobs confirmed, average rating, verified people and check time, and how many came back after 7 / 30 days.

All reminders run in the same daily job (`/api/v1/cron/daily`). Migration `0009_trust.sql`.

## 2. MSG91

- Complete DLT registration (entity + OTP template). Create an OTP Flow template with the variable `##otp##`.
- Set `MSG91_AUTH_KEY` and `MSG91_OTP_TEMPLATE_ID`. Keep `SMS_DRY_RUN=1` until DLT is approved. In dry-run mode the OTP is only printed in the logs.

## 3. Run locally

```bash
cp .env.example .env          # fill in values

# API
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cd api && uvicorn vz.main:app --reload --port 8000
# docs: http://localhost:8000/api/docs

# App (new terminal)
cd web && npm install && npm run dev
# http://localhost:5173 (calls to /api are proxied to :8000)
```

Tests: `cd api && pytest -q`

> The Send-SMS hook cannot reach localhost. For local login, use Supabase test phone numbers, or expose the API with a tunnel (e.g. cloudflared) and point the hook at it.

## 4. Deploy (Vercel)

- Import the repo. `vercel.json` already sets the region to `bom1`, builds `web/` and serves `api/index.py` under `/api/*`.
- Add all variables from `.env.example` in Vercel → Settings → Environment Variables (both `VITE_*` and server ones). Use `SMS_DRY_RUN=0` in production.
- After the first deploy, update the Supabase hook URL to the production domain.

## 5. Android APK

```bash
cd web
npm run build
npx cap add android        # first time only
npm run cap:sync
npm run cap:open           # opens Android Studio → Build → Generate Signed APK/AAB
```

- `appId`/`appName` come from the brand JSON.
- Set `VITE_API_URL=https://<your-domain>` for the APK build, because the APK has no proxy.
- For "use my location", add to `android/app/src/main/AndroidManifest.xml`:
  `<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />`
- **Keep the keystore and its passwords safe** (outside the repo, with a backup). Without them, Play Store updates are impossible.

## Sizes and spacing (design tokens)

All sizes come from CSS variables in `web/src/styles.css`, so fixing a size once fixes it on every page.

- Tokens: `--fs-*` (text), `--control-height-sm/md/lg`, `--chip-height`, `--icon-size-sm/md/lg`, `--avatar-size`, `--card-padding`, `--grid-gap`, `--section-gap`, `--page-gutter`, `--header-height`, `--bottom-nav-height`, `--sidebar-width`, `--radius-s/m/l`.
- Tailwind names for them: `h-ctl-md`, `min-h-ctl-lg`, `h-chip`, `p-card`, `gap-grid`, `mb-section`, `h-header`, `h-nav`, `size-avatar`, `size-icon-md`; `text-sm`…`text-3xl` follow `--fs-*`.
- Density: phone (touch-friendly) → tablet (≥768, more room) → computer (≥1024, smaller text and controls, web only; the APK keeps phone sizes via `data-native`) → large screens (≥1440 / ≥1600) get wider content and more columns, never bigger buttons.
- Use the shared pieces (`Button size="sm|md|lg"`, `Chip`, `Card`, `TextField`, `AppShell`, `CardGrid`) instead of writing heights by hand.

## 6. New brand (white label)

1. Copy `brands/vahanza.json` → `brands/<client>.json` and change name, colours, appId, support and grievance details.
2. Insert the tenant: `insert into tenants(id, name) values ('<client>', '<Name>');`
3. Build with `VITE_BRAND=<client>` and set `DEFAULT_TENANT=<client>` (or use one API for all brands; the app sends `X-Brand`).
4. Replace the icons in `web/public/icons/`.

## 7. Admin panel

Log in once with your own number in the app, then in Supabase SQL Editor:

```sql
update profiles set role = 'super_admin' where phone = '91XXXXXXXXXX';   -- you (all brands)
update profiles set role = 'admin'       where phone = '91YYYYYYYYYY';   -- client's staff (their brand only)
```

Refresh the app: admins land on `/admin` with three tabs:
- **Dashboard**: drivers / owners, active today, online now, new users per day, live posts and drivers wanted, interests, calls + WhatsApp, average time per visit, how far people get (open → OTP → login → profile → action), APK / mobile browser / computer / home-screen installs, users by city. Test accounts are never counted.
- **Check queue**: posts held by the automatic checks (approve → live, reject → closed), flagged profiles (looks fine / block), reports.
- **Users**: search by name or phone, filter (driver / owner / verified / blocked / test), give or remove the verified badge, block / unblock.

Every admin action is saved in `admin_actions` (who, what, when).

## Folder map

```
api/            FastAPI app (vz/), tests/
  index.py      Vercel entry
  vz/routes/    me, events, hooks, geo, photo, drivers, posts, admin, trust, notifications
  vz/notify.py  who gets which notification; vz/push.py sends web push / FCM
brands/         brand JSON (colours light/dark, names, appId)
shared/         places.json: transport cities with Hindi names (used by app and API)
scripts/        import_pincodes.py, make_vapid_keys.py
                (bulk import lives in api/vz/importer.py + routes/imports.py)
supabase/       SQL migrations
web/src/
  lib/          auth, api, supabase, track (analytics), brand, theme, storage, platform
  pages/        Splash, Language, Role, Login, Otp, Setup (Driver/Owner), Home, Settings, Legal
  components/   ui, form, places (location + city picker), photo, cards, Wizard
  i18n/         hi.json, en.json
vercel.json     one deploy: web + api, Mumbai
```

## Next

See `claude/vahanza-decisions.md` in the Claude project for the sprint list and decisions so far.

## Placeholders to replace before launch

- `supportPhone` and `grievanceOfficer` in `brands/vahanza.json`
- Legal text (`legal.body` in i18n) must be the lawyer-reviewed terms and privacy policy
- Logo and icons are temporary
