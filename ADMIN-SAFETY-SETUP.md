> Legacy Google Sheets instructions. For the current Supabase backend, use [SUPABASE-SETUP.md](./SUPABASE-SETUP.md).

# Activate the administrator improvements

1. In the connected Google Sheet, open **Extensions → Apps Script** and replace the project code with the updated `Code.gs` from this folder. Save it.
2. Run **setupSystemOwner** from Apps Script. Enter your existing administrator username in the Google Sheet prompt. Existing accounts keep administrator access; only explicitly designated owners can manage accounts.
3. In Apps Script choose **Deploy → Manage deployments → Edit → New version → Deploy**. Update the existing deployment so the configured URL stays the same.
4. Serve the updated local `admin.html` together with `admin-safety.js`, `basic-ed-admin.js`, and `basic-ed-data.js`. Sign out and back in. No Sites integration or website publishing is needed.
5. Refresh the TV's `index.html` to load the new connection indicator.

## Using the improvements

- **Points history:** Open Overview → Points history. It shows the latest 200 changes with administrator, timestamp, team, previous score, new score, and difference. The full history remains in the automatically created **PointsHistory** sheet. History starts with changes saved through the updated API; earlier edits and direct manual edits in Google Sheets are not reconstructed.
- **Protected saves:** Every save checks the version loaded at sign-in or the last successful save. If newer results exist, the save stops without overwriting them. Different team edits combine in the review; edits to the same value require an explicit choice. Cancel keeps the current form. After applying a conflict review, use Save changes again to publish.
- **Review before publishing:** Save changes opens a summary. Publish changes sends it; Cancel leaves it unpublished.
- **Administrators:** Owners see Overview → Administrators. Create an account with a username, display name and password, or deactivate/reactivate an administrator. Deactivation revokes existing sessions. Owner accounts cannot be deactivated in the web interface. Designate additional owners through the spreadsheet's setup function.
- **TV status:** Connected means the display recently received data. Delayed appears after 90 seconds without a successful update. Offline appears when the network or data request fails. The display retains the last results and shows when data was last received. The separate As of time is when the results were updated.

## Deployment order and verification

Update the existing Apps Script backend before using the new local controls. Older admin pages cannot save against the new backend; refreshed updated local clients will load a version and show the publish review. The updated frontend also refuses unprotected saves against an older backend. The Google Sheets connection remains the system's existing data store.

Open two administrator sessions, save a score in the first, then attempt a different score in the second. Confirm the second sees the review and that the first score is preserved. Check Points history and owner-only account management. Do not edit score sheets manually during committee entry: direct Sheet edits are outside the API version and history protection.

Local automated checks: `node verify-admin-safety.cjs` uses in-memory Sheets and sessions without contacting or modifying live data.
