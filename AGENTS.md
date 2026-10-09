# AGENTS.md

Instructions for AI coding assistants (Codex, Cursor, Copilot, Gemini, Claude…) working in this repo.

**Read [`CLAUDE.md`](./CLAUDE.md) first — it is the single source of truth** for what Vahanza is, the rules
that must never be broken (private phone numbers, no money in rewards, Hindi + English texts, multi-tenant,
no secrets in git), the folder map, commands, conventions and the "before you say done" checklist.

Quick commands:

```bash
cd api && pytest -q                       # API tests (must pass)
cd web && npx tsc -b && npm run build     # app typecheck + build
bash scripts/build-apk.sh                 # Android APK
```

Long feature-by-feature details and go-live steps: [`README.md`](./README.md).
