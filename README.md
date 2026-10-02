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
2. SQL Editor: run the files in `supabase/migrations/` in order (`0001_init.sql`, `0002_profile_setup.sql`, then `0003_test_accounts.sql`).
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

## 6. New brand (white label)

1. Copy `brands/vahanza.json` → `brands/<client>.json` and change name, colours, appId, support and grievance details.
2. Insert the tenant: `insert into tenants(id, name) values ('<client>', '<Name>');`
3. Build with `VITE_BRAND=<client>` and set `DEFAULT_TENANT=<client>` (or use one API for all brands; the app sends `X-Brand`).
4. Replace the icons in `web/public/icons/`.

## 7. Making a super admin

There is no admin UI yet (planned for a later sprint in R1). After logging in once:

```sql
update profiles set role = 'super_admin' where phone = '91XXXXXXXXXX';
```

## Folder map

```
api/            FastAPI app (vz/), tests/
  index.py      Vercel entry
  vz/routes/    me.py, events.py, hooks.py, geo.py, photo.py
brands/         brand JSON (colours light/dark, names, appId)
shared/         places.json: transport cities with Hindi names (used by app and API)
scripts/        import_pincodes.py
supabase/       SQL migrations
web/src/
  lib/          auth, api, supabase, track (analytics), brand, theme, storage, platform
  pages/        Splash, Language, Role, Login, Otp, Setup (Driver/Owner), Home, Settings, Legal
  components/   ui, form, places (location + city picker), photo, cards, Wizard
  i18n/         hi.json, en.json
vercel.json     one deploy: web + api, Mumbai
```

## Next (Sprint 3)

Owner posts (pick fleet groups, drivers needed per group, monthly savings, optional pay mix, base cities + coverage, optional facilities) with automatic checks, and the driver's job list with call / WhatsApp.

## Placeholders to replace before launch

- `supportPhone` and `grievanceOfficer` in `brands/vahanza.json`
- Legal text (`legal.body` in i18n) must be the lawyer-reviewed terms and privacy policy
- Logo and icons are temporary
