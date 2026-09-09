# Separate Mr. and Ms. Sportsfest winners

1. Back up the project folder on the other computer.
2. Close its admin page. Copy basic-ed-data.js, admin-safety.js, admin.html and index.html from this update into that project's folder, replacing those four files.
3. In your existing Supabase project's SQL Editor, run the entire supabase/migrations/202609080001_split_pageant.sql file. Run only this new update, not the original database setup. This is required before saving with the updated admin.
4. Open the admin and TV pages again and press Ctrl+F5.
5. In Special Events & Major Awards, select the Mr. Sportsfest winning team and the Ms. Sportsfest winning team separately, then Save changes.

The TV displays four award cards: Cheerdance, Bench Cheering, Mr. Sportsfest and Ms. Sportsfest. The admin has separate winner dropdowns. Mighty Sharks is also corrected.

The SQL update preserves scores, accounts and other results. The old combined pageant result is backed up privately in sportsfest_private.pageant_backup. Both new titles start unannounced, because the old combined result does not identify which title it belongs to. Choose both winners explicitly.

This package does not apply changes to the live database automatically. If both computers share the same Supabase project, run the SQL update only once and update the frontend files on both computers. Reload any open admin before saving.

Code.gs is included only for the legacy Google Sheets backend. Current Supabase users do not need it. Legacy users should back up the old SpecialEvents sheet, replace and redeploy Code.gs, then choose both winners in the updated admin.

Also includes the scrolling-text fix: announcement refreshes preserve the leaderboard and do not restart its score animation.
