# Southland College Sportsfest 2026

The local administrator and TV display now use **Supabase** for authentication,
saved results, account permissions, and points history.

The database and account-management function are already installed in your project.
Check [migration status](./SUPABASE-MIGRATION-STATUS.md) before running setup scripts
again. This project is starting fresh with all teams at zero, as requested.

## Connection and administrator accounts

The installed backend is documented in [SUPABASE-SETUP.md](./SUPABASE-SETUP.md).
For users created directly in Supabase Authentication, run
[add-admin.sql](./supabase/add-admin.sql) with their email to grant score-editing
access. Auth accounts without this permission cannot use the administrator app.
The Project URL and publishable key are configured in [config.js](./config.js).
Owner sign-in and the initial saved results have been verified against the live project.

## Run locally

Serve this directory with a static server:

```powershell
npx serve . -l 4173
```

- Administrator: http://localhost:4173/admin.html
- TV display: http://localhost:4173/index.html
- One-time migration: http://localhost:4173/migrate-to-supabase.html

Sign in using an authorized administrator's email and password. Review and publish
score changes with **Save changes**. The TV receives updates every 30 seconds and
retains its most recent successful response for offline recovery.

The app includes department standings, special-event winners, two match schedules,
announcements, video playlists, TV section controls, protected saving, points
history, owner account controls, and CSV/print/image exports. Media URLs must be
publicly accessible. Local videos and department logos remain in their existing folders.

Use F11 for a full-screen TV display and disable sleep on the signage computer.
The TV waits for actual published data and never substitutes sample results.

## Verification

```powershell
npm install
npm test
npm run test:ui
```

Database tests run the actual SQL migration in embedded PostgreSQL with test-only
Auth claims. UI checks use mocked Supabase endpoints and do not edit live scores.

## Legacy files

[Code.gs](./Code.gs) and [GOOGLE-SHEETS-LEGACY.md](./GOOGLE-SHEETS-LEGACY.md) are kept
for exporting the old records and rollback reference. They are not the current
backend. Retire the old deployment after checking the migrated results.

Use the local administrator and TV pages. The separate `committee-online` Sites
project remains outside this migration and must not be published for local event use.
