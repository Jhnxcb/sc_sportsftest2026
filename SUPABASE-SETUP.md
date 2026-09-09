# Supabase setup

**Current project:** the initial schema, owner membership, and account-management
function have already been installed. Do not rerun the initial migration or owner
bootstrap. The user chose to start fresh; importing the old records is unnecessary.
See `SUPABASE-MIGRATION-STATUS.md` for the installed state.

The local administrator and TV pages now use project `vurlrlwecwzqdlmqikpz`.
The URL and publishable key are in `config.js`. The publishable key identifies the
project; it does not grant administrator access. Never place a secret/service-role
key, database password, or personal access token in this folder's frontend files.

## 1. Install the database

Open your project's SQL Editor. Run the entire contents of
`supabase/migrations/202609070001_sportsfest.sql` once, including `begin` and `commit`.
It creates private tables and two public RPC functions. It does not touch the old
Google Sheet. Do not expose the `sportsfest_private` schema in API settings.

Alternatively, from this directory with the official Supabase CLI:

```powershell
npx supabase login
npx supabase link --project-ref vurlrlwecwzqdlmqikpz
npx supabase db push
```

Use either the SQL Editor or CLI migration method, not both. SQL Editor execution
does not populate the CLI migration ledger automatically.

## 2. Create the first owner

1. Open Authentication → Users → Add user → Create new user.
2. Enter your email and a strong password, with the email marked confirmed.
3. Open `supabase/bootstrap-owner.sql`, replace `REPLACE_WITH_YOUR_EMAIL` with
   that email, and optionally change the display name. Run it in SQL Editor.
4. In Authentication settings, disable **Allow new users to sign up**. All app
   accounts are provisioned by owners. Even if signup stays enabled, an Auth
   account without private membership cannot read or edit administrator data.

Existing Apps Script passwords are not migrated. Supabase accounts use email and
password. Owner roles are stored in the private database, never in editable user metadata.

### Adding your own users in Supabase

Create each account in Authentication → Users with Auto confirm enabled. Then
open `supabase/add-admin.sql`, replace `REPLACE_WITH_NEW_USER_EMAIL` with the account's
email, optionally edit the display name, and run it in SQL Editor. This grants
regular administrator access. It never changes an existing profile or grants
owner privileges. Use the owner's Administrators screen to deactivate/reactivate
accounts afterward. An Auth account alone deliberately has no app permissions.

Alternatively, the owner's Administrators screen creates an account and grants
its permission together through the deployed Edge Function.

## 3. Enable account creation in the dashboard

Deploy `supabase/functions/manage-admins/index.ts` as an Edge Function named
`manage-admins`. With the CLI:

```powershell
npx supabase functions deploy manage-admins --project-ref vurlrlwecwzqdlmqikpz
```

`supabase/config.toml` disables the gateway's legacy JWT check for this function.
The function itself verifies every caller with Supabase Auth `getUser`, then checks
the owner's current database membership before creating any account. It uses the
Supabase-provided `SUPABASE_SERVICE_ROLE_KEY` only inside the Edge Function.
Never copy that key into `config.js`. For a dashboard deployment, use the same
function name and turn off the legacy gateway JWT verification toggle.

If the function is not deployed, sign-in, scoring, history, exports, and existing
account activation controls still work, but the Add administrator form cannot
create accounts.

## 4. Import the existing records

Serve this project locally, for example `npx serve . -l 4173`.

1. Pause editing in the old dashboard/Sheet and open
   `http://localhost:4173/migrate-to-supabase.html`.
2. Use the **old** administrator username/password to export saved Google records.
   The export uses the existing `exportRecords` action and includes inactive and
   future records, all TV switches and awards, and the complete points history.
3. Review the totals and download the complete JSON backup. Keep it outside the
   served project folder because it includes administrator names and history.
4. Sign in with the **new Supabase owner email/password** on the import page.
5. Import the reviewed records. The database rejects import after any previous
   import or save. A validation failure rolls back the entire import.
6. Open `admin.html` and verify scores/history, then refresh `index.html` on the TV.
   Accounts must be recreated through the owner dashboard.

If the old Apps Script returns `Unknown admin action`, update its deployment using
the retained `Code.gs` before exporting. Do not import only the old public feed:
that omits inactive announcements/media, future schedules, and history.

For a genuinely new event without records to import, skip the import and publish
the first reviewed scores from the owner dashboard. The TV waits for this first
save; the database's zero-valued setup rows are not published automatically.

The existing browser TV cache remains available during the transition. Offline
or unconfigured status identifies when cached results are being shown. Once
Supabase responds successfully, it replaces the cached snapshot.

## Security and verification

- All three private tables have Row Level Security enabled, no public policies,
  and no grants to `anon` or `authenticated`. Only the explicitly granted RPCs
  expose data. Security-definer functions use an empty search path.
- Public output includes only active content and today's fixtures in Asia/Manila.
  It excludes administrator identities, account lists, history, and inactive drafts.
- Each administrative operation checks active database membership. Owners manage
  accounts; ordinary administrators cannot create accounts or change roles.
- Disabling an account immediately blocks administrative API operations, including
  calls made with an existing JWT. Reactivating it requires a new login; pre-disable
  sessions remain invalid even after token refresh. Each admin call also checks
  that the Auth session still exists, so a completed server logout blocks reuse of
  its access JWT. A failed network logout still clears local credentials.
- Save uses a row lock and revision check. Scores, revision, and history commit
  together. Client-supplied administrator names and timestamps are ignored.
- History cannot be rewritten by administrators. One-time history import requires
  an owner and an untouched database.

Run `npm install`, then `npm test` for PostgreSQL permission and transaction tests
plus the browser adapter's auth/refresh tests. `npm run test:ui` runs the existing
Playwright screen checks with mocked Supabase endpoints and requires Playwright
and Microsoft Edge (available in the current Codex environment).

Local tests do not prove the hosted schema/function has been installed. Before
retiring the old backend, verify a real login, account creation, one reviewed score
save, a conflict between two administrator tabs, history, and a TV refresh.

## Retiring Google Sheets

The local app no longer calls Google Apps Script. `Code.gs` and the original Sheet
are retained for export and rollback. After verifying the migration, archive the
old Apps Script web-app deployment and restrict the Sheet to its owners so old
editor sessions cannot keep publishing into a separate backend. Removing the URL
from `config.js` does not disable that old deployment.

The separate `committee-online` project is not part of this local migration and
has not been deployed or changed. Its old hosted copy, if still online, continues
to use its previous backend until separately retired or migrated.
