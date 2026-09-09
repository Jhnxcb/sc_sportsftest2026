> Legacy Google Sheets instructions. For the current Supabase backend, use [SUPABASE-SETUP.md](./SUPABASE-SETUP.md).

# Basic Education leaderboard

Open `index.html` in a modern browser. Keep `basic-ed-data.js`, `config.js`, and the `DEPT LOGOS` folder beside it. No build is required. Published results need an internet connection.

In `admin.html`, sign in and choose a department or **Special Events & Major Awards** from the left navigation. Enter scores and select winners. Open the highlighted **SHOWING IN TV** page and use its ON/OFF switches to choose which sections appear, then click **Save changes**. The public `index.html` page reads published results every 30 seconds. It has no navigation or editing controls and uses the existing College visual style. Navigation between admin editors does not change the public screen. Only saved switches control playback.

Enabled sections rotate automatically in this order: Senior High, Junior High, Grade School, College, Results, Matches 1, Matches 2, Campus video, Sportsfest video. College starts OFF. Turn it ON later and switch the three Basic Education departments OFF when their schedule ends. All switches OFF shows a standby screen. The yellow progress line counts down each enabled screen; announcements scroll independently.

## Excel / Google Sheets changes

There is no Excel workbook in this project. The existing display uses Google Sheets through `Code.gs` and `config.js`; its `Leaderboard` tab only accepts college department codes. Do not add Basic Education teams to that existing tab, because the API filters them out.

The updated integration uses these two tabs. After redeployment, the first admin save creates them automatically. You may also create them with the headers below. Direct Google Sheets edits appear on the public page during its next refresh; an offline Excel workbook must first be copied into these Google Sheets tabs.

### BasicEdLeaderboard

Use these exact headers. Change only Points as results come in; keep TeamID stable. Enter whole numbers from 0 to 999999. Ranks are calculated by the page, so no Rank column is needed.

| Department | TeamID | Team | Points |
|---|---|---|---:|
| Grade School | harks | Mighty Sharks | 0 |
| Grade School | cubs | Fearless Cubs | 0 |
| Junior High School | greenfinches | Fervid Greenfinches | 0 |
| Junior High School | tigers | Roaring Tigers | 0 |
| Junior High School | vipers | Grebesha Vipers | 0 |
| Junior High School | wolves | Azura Wolves | 0 |
| Senior High School | centaurus | Ethereal Centaurus | 0 |
| Senior High School | stallion | Ferocious Stallion | 0 |
| Senior High School | griffin | Griffin Guardian | 0 |

### SpecialEvents

Leave WinnerTeamID empty until a winner is announced. Then enter a TeamID from the table above. Logos are mapped in JavaScript; you do not need to put local file paths or pictures in Excel.

| EventID | Event | WinnerTeamID |
|---|---|---|
| cheerdance | Cheerdance Competition | |
| bench | Bench Cheering Competition | |
| mr | Mr. Sportsfest | |
| ms | Ms. Sportsfest | |

For dropdowns in Excel, create a named range `TeamIDs` pointing to `BasicEdLeaderboard!$B$2:$B$10`, then apply List data validation with source `=TeamIDs` to `SpecialEvents!C2:C5`.

Reload the admin before editing if someone has changed the spreadsheet, so you start from its latest values. Save changes writes the dashboard contents to the sheet. Existing college sheets and admin features remain available.

### Matches2

Matches 1 uses the existing `Matches` tab. Matches 2 uses a separate `Matches2` tab with the same headers: `Date`, `Sport`, `TeamA`, `TeamB`, `Time`, `Venue`, `Status`, `Active`. Only today's active fixtures appear on each public matches screen. Both editors offer Basic Education and College teams. The public screen displays up to four fixtures per section.

### DisplaySettings

Admin saves create this tab automatically. Each switch maps to a row:

| Setting | Value |
|---|---|
| senior | TRUE |
| junior | TRUE |
| grade | TRUE |
| college | FALSE |
| awards | TRUE |
| matches | TRUE |
| matches2 | FALSE |
| promo | FALSE |
| sportsfest | FALSE |

Change these using the admin ON/OFF switches. College activation requires no code edits. Older Department/Rotate settings are replaced by these rows on the first save with the updated admin.

## Deploy the merged admin integration

1. Replace the contents of your bound Google Apps Script project with the updated local `Code.gs`.
2. Update the existing web app deployment to a new version. Keep the same deployment URL; if it changes, update `DATA_ENDPOINT` in `config.js`.
3. Serve `admin.html`, `basic-ed-admin.js`, `basic-ed-data.js`, `index.html`, `config.js`, and the logos together from your website.
4. Sign in, choose a department or **Special Events & Major Awards** from the left navigation, open **SHOWING IN TV** and set its switches, and click **Save changes** after entering results. The four new tabs are created automatically.
5. Open `index.html` to see published results. Allow up to 30 seconds for subsequent changes.

Until redeployment, the new admin controls are disabled and the public page shows a waiting-for-results message. Existing browser-local drafts are not automatically published. The separate Basic Education page has been removed; index.html is the public display. All score editing is done in admin.html.

## Login troubleshooting

Refresh admin.html to load the corrected password field and eye icon. If login reports an invalid response or timeout, confirm the Apps Script web app is deployed to the configured `/exec` URL and is accessible from the browser. The app expects JSON from both GET and POST. Redeploy the latest Code.gs as a new version of the existing deployment; saving code in the editor alone does not update that deployment. Do not change administrator passwords solely because of a service-response error.
