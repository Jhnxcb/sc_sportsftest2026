# Migration status — September 7, 2026

Project: `vurlrlwecwzqdlmqikpz` (Sportsfest 2026).

- Local administrator and TV pages use Supabase; project URL/key are configured.
- Database migration installed through SQL Editor successfully.
- Live public endpoint responds with the expected waiting-for-import message.
- Live unauthenticated administrator request is denied with HTTP 401.
- `manage-admins` deployed. Its own Auth validation rejects missing and invalid
  tokens with HTTP 401; legacy gateway JWT verification is off as configured.
- Public signup is disabled. The requested first owner account has been created
  and its owner membership installed successfully.
- Live owner sign-in and dashboard loading are verified. The owner dashboard
  correctly exposes account controls and shows the untouched database.
- Live score saves and their history entries are verified. The TV successfully
  retrieves the saved Supabase results and displays Connected.
- PostgreSQL security/transaction tests, Auth adapter tests, Edge Function handler
  tests, and administrator/TV/import page checks passed locally.

The user chose to **start fresh**, so no Google records will be imported. The
initial saved state contains all 14 teams at zero, no matches, and no announcements.
Recent score changes made during setup are retained in the new audit history.
The user will create additional Auth users in Supabase; `supabase/add-admin.sql`
grants each of those accounts regular administrator access after creation.

Google Sheets has not been disabled or modified. The local application uses only
Supabase. The separate old hosted committee project remains outside this task.

The schema was installed through SQL Editor, so do not blindly run `db push` with
the same initial migration. See `SUPABASE-SETUP.md` for setup and import details.

Migration complete for the local app. Administrator: `http://127.0.0.1:4173/admin.html`.
TV: `http://127.0.0.1:4173/index.html`.
