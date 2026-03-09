# CODEX_CHANGES

## What was broken / risky
- Google Sheets data loaded via client-side `fetch()` could fail due to CORS or blocked Google access.
- No local content fallback if Sheets are unreachable.
- External Google Fonts introduced a critical dependency on Google domains.
- No `404.html` for static hosting.
- No deployment guide for Yandex Object Storage.

## What was fixed
- Switched Sheets loading to JSONP (GViz `responseHandler`) to avoid CORS.
- Added local snapshot fallback (`assets/data/snapshot.json`) and cache usage when Sheets fail.
- Added snapshot update script: `scripts/update_snapshot.mjs`.
- Allowed rendering from snapshot/cache even if `SHEET_ID` is missing.
- Removed Google Fonts from `index.html` to reduce external dependencies.
- Added `404.html` and `robots.txt` for static hosting.
- Added Yandex deployment guide: `DEPLOY_YANDEX.md`.

## Files changed / added
- Updated: `assets/js/sheets.js`
- Updated: `assets/js/app.js`
- Updated: `assets/js/story.js`
- Updated: `assets/js/config.js`
- Updated: `index.html`
- Added: `assets/data/snapshot.json`
- Added: `scripts/update_snapshot.mjs`
- Added: `404.html`
- Added: `robots.txt`
- Added: `DEPLOY_YANDEX.md`

## Remaining risks / notes
- `assets/data/snapshot.json` is a minimal fallback. Update it from the live Sheets using `scripts/update_snapshot.mjs` when network access is available.
- If Google Sheets are blocked and the snapshot is outdated, content may be stale.
- DNS and HTTPS steps in `DEPLOY_YANDEX.md` still require validation in your DNS provider and Yandex Console.
