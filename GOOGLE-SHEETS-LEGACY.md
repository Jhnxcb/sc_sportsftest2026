# Southland College Sportsfest 2026 Display

A full-screen, four-view digital-signage sequence designed for 1920×1080 lobby displays: leaderboard, today's matches, school promotions, and the Sportsfest feature. It includes a 10-second bulletin ticker and 30-second Google Sheets synchronization.

## Add the official logo files

Place the SVG file beside `index.html`:

- `logo.svg` — Southland College Sportsfest branding

Department team logos are loaded from the `DEPT LOGOS` folder.

## Google Sheet structure

Create a spreadsheet with these tabs and exact headers in row 1.

### `Leaderboard`

| Dept | Points |
|---|---:|
| SECSA | 1450 |
| SBA | 1325 |
| STED | 1180 |
| SHTM | 1110 |
| SHARP | 1065 |

The Apps Script accepts `Department` instead of `Dept`, and `TotalPoints` instead of `Points`. The final ranking is always recalculated from highest to lowest points.

Department abbreviations are used only as data keys. The display writes the complete school names.

### `Matches`

| Date | Sport | TeamA | TeamB | Time | Venue | Status | Active |
|---|---|---|---|---|---|---|---|
| 2026-08-31 | Basketball · Men | SECSA | SBA | 10:00 AM | Main Gym | Upcoming | TRUE |
| 2026-08-31 | Volleyball · Women | STED | SHARP | 2:00 PM | Activity Center | Upcoming | TRUE |

Only matches dated today are returned. A blank date is treated as part of the current day's schedule.

### `Media`

| Type | Title | Message | URL | Poster | Duration | Active |
|---|---|---|---|---|---:|---|
| school-promo | Discover Southland College | Learning, culture, and excellence. | https://example.com/school.mp4 |  | 25 | TRUE |
| sportsfest-motion | Torch of Legacy | United by culture, empowered by excellence. | https://example.com/sportsfest.mp4 | https://example.com/thumbnail.jpg | 20 | TRUE |
| ticker | Food stalls are open beside the activity grounds. |  |  |  |  | TRUE |

Media URLs must be publicly accessible. The local school-promo video is loaded from `PROMO VIDEO/SC PROMOTIONAL FILM.mp4`. The Sportsfest scene can use a public URL from the Media sheet or a local `sportsfest-motion.mp4` beside `index.html`.

Videos always play to the end before the display advances. To create an online playlist, add multiple active rows with the same media `Type`; one video is played per display cycle. For local playlists, add each file path to `CONFIG.LOCAL_MEDIA.promoVideos` or `CONFIG.LOCAL_MEDIA.sportsfestVideos` in `index.html`.

### `Announcements`

| Message | Active |
|---|---|
| Upcoming Game: SECSA vs SBA Volleyball, 2:00 PM! | TRUE |
| Don't forget to visit the food stalls! | TRUE |
| Current leaderboard is live! | TRUE |

If an `Announcements` tab is not present, the script will read rows with type `ticker` or `announcement` from the older `Media` tab.

## Deploy Google Apps Script

1. Open the Sheet and choose **Extensions → Apps Script**.
2. Replace the editor contents with [`Code.gs`](./Code.gs).
3. Choose **Deploy → New deployment → Web app**.
4. Set **Execute as** to yourself and grant access to **Anyone**, if allowed by your organization.
5. Deploy, authorize, and copy the URL ending in `/exec`.
6. In [`config.js`](./config.js), replace `PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE` with the deployed `/exec` URL. This single setting is shared by the TV display and admin dashboard.

### Enable the admin dashboard

1. In the Apps Script editor, select and run `setupAdminLogin` once.
2. Enter an administrator username and a password containing at least 8 characters.
3. Deploy a new web-app version after replacing `Code.gs`.
4. Serve this project and open `admin.html`.
5. Sign in using the username and password created by `setupAdminLogin`.

The admin dashboard can update leaderboard points, matches, scrolling announcements, and online media rows. Saving updates all four Sheet tabs and records the update time and administrator name. The TV shows this time in its **As of** badge and receives the new content during its next 30-second synchronization.

The password is stored as a salted SHA-256 hash in Apps Script properties. A successful login creates a temporary six-hour server-side session. The dashboard stores only the session token for the current browser session and provides a **Log out** button.

The page fetches new data every 30 seconds and stores the last successful response in `localStorage` for offline recovery. The ticker message changes every 20 seconds. The yellow footer line tracks the full duration of the active scene: one minute for the leaderboard and matches, and the actual runtime for videos.

For unattended TV use, the page also refreshes itself after 15 minutes when the sequence safely returns to the leaderboard. A playing video is never interrupted by this refresh.

## Run the display

Serve the folder from any static web server and open it in a browser:

```powershell
npx serve .
```

Open the provided local URL, press `F11` for full-screen mode, and disable sleep/display timeout on the signage computer. The TV never shows sample scores: it starts with the most recent successfully cached live update, or a waiting-for-live-data message when no real update has been received yet.

## Local event setup

Use the local administrator page and TV display. Do not publish or use the `committee-online` Sites project.

With the local server running on port 4173:

- Administrator: `http://localhost:4173/admin.html`
- TV display on this computer: `http://localhost:4173/index.html`

Both local pages use the existing Google Sheets / Apps Script connection in `config.js`. After an administrator saves, the TV receives the update during its next 30-second synchronization. Removing local hosting references does not unpublish an already hosted site.
