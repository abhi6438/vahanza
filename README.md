# Vahanza: Sprint 1 (Foundation + Login)

A white-label app for vehicle owners and drivers. One codebase serves the web/PWA, the Android APK and the API.

| Part | Tech | Folder |
|---|---|---|
| App (web + PWA + APK) | React 19, Vite, TypeScript, Tailwind 4, Capacitor | `web/` |
| API | Python FastAPI (Vercel serverless, Mumbai `bom1`) | `api/` |
| DB + login | Supabase (Postgres + phone OTP) | `supabase/` |
| Branding | One JSON file per client brand | `brands/` |

## What works in Sprint 1

- Language choice (Hindi first, English); speaker button reads each screen aloud
- Role choice: owner or driver (mechanic shown as "coming soon")
- Login with a mobile number and OTP. Auto-fill works on Android; resend after 30 s
- Stays logged in until logout. Two options: "logout" and "logout from all devices"
- Settings: language, light/dark/system theme, support and grievance details
- Analytics from day 1: platform (APK/web/iOS web), browser, OS, PWA install (standalone), screen views, time spent, sessions, city (from Vercel IP), heartbeat for "online now". Data goes to the `events` table
- Multi-tenant: every row has `tenant_id`; the brand comes from the `X-Brand` header
- Security: RLS on and table access revoked for anon/authenticated, so the browser can never read tables directly. All data goes through the API, which checks the Supabase JWT
- OTP SMS through MSG91, using the Supabase Send-SMS hook (signature checked, max 5 per number per hour, Indian numbers only)

## 1. Supabase setup (one time)

1. Create a project in region **Mumbai (ap-south-1)**.
2. SQL Editor: run `supabase/migrations/0001_init.sql`.
3. Auth → Providers → **Phone**: enable it. You can pick any SMS provider here because the hook below replaces it.
4. Auth → Hooks → **Send SMS hook** → HTTPS:
   `https://<your-domain>/api/v1/hooks/send-sms`. Generate the secret and copy it into `SEND_SMS_HOOK_SECRET` (format `v1,whsec_...`).
5. For dev without SMS, go to Auth → Phone → **Test phone numbers** and add e.g. `919999999999` = `123456`.
6. Project Settings → API: copy the URL, the anon key and the JWT secret (only needed for legacy HS256 projects. New projects use JWKS automatically).
7. Database → Connect → **Transaction pooler** (port 6543): copy the URI into `DATABASE_URL`.

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
  vz/routes/    me.py, events.py, hooks.py
brands/         brand JSON (colours light/dark, names, appId)
supabase/       SQL migrations
web/src/
  lib/          auth, api, supabase, track (analytics), brand, theme, storage, platform
  pages/        Splash, Language, Role, Login, Otp, Home, Settings, Legal
  i18n/         hi.json, en.json
vercel.json     one deploy: web + api, Mumbai
```

## Next (Sprint 2)

Driver profile setup and owner fleet setup (multiple vehicle groups, drivers per group), plus photo upload to Vercel Blob with reminders.

## Placeholders to replace before launch

- `supportPhone` and `grievanceOfficer` in `brands/vahanza.json`
- Legal text (`legal.body` in i18n) must be the lawyer-reviewed terms and privacy policy
- Logo and icons are temporary
