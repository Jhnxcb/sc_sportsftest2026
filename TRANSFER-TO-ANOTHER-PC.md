# Run on another PC

Copy the entire project folder, including `DEPT LOGOS`, `PROMO VIDEO`,
`fonts`, `export-assets.js`, `logo.svg`, `config.js`, and all HTML, JS and CSS files.
You can omit `node_modules`, `.tmp-image-tools`, `.git`, and `design-backups`.
Do not copy just the HTML files.

With Node.js installed, open a terminal in the copied folder and run:

```powershell
npx serve . -l 4173
```

The first run may download the server package. Alternatively, if Python is
installed, run `python -m http.server 4173` from the copied folder.

- Administrator: http://localhost:4173/admin.html
- TV: http://localhost:4173/index.html

The Facebook export includes bundled Quicksand, the same Sportsfest logo as
the TV page, and all 14 team logos. No font installation or asset build is needed.
The app uses relative asset paths, so the folder can have a different location.

Keep `video-canvas.js` beside `index.html`: the TV now draws video onto a canvas
to avoid displaying the browser's native player controls. If a TV cannot render
this mode, `index.html?nativeVideo=1` restores direct video playback. Firmware
that forces an external/full-screen player may still override either mode.

Sign in again on the new PC. Saved scores and accounts remain in Supabase;
internet access is still needed for sign-in and score synchronization.
The TV page also currently loads Tailwind styling and Inter from online CDNs.
Local hosting does not make the complete app offline.

For a TV on the same network, use the server PC's LAN address instead of
`localhost`, for example `http://192.168.1.20:4173/index.html` (replace the
example address). Allow the local server through Windows Firewall on the
trusted private network if needed.
