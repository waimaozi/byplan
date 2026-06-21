# Deploy — byplan.ru

**byplan.ru is hosted on GitHub Pages, served from the `main` branch (root).**
There is no build server and no manual upload: **pushing to `main` deploys the site.**
GitHub Pages rebuilds automatically within ~1 minute of the push.

## How to deploy a change
1. Edit the site files (HTML / CSS / JS / assets).
2. If you changed JS or CSS, rebuild the bundles (see below) **and bump the cache-bust
   version** `?v=N` on the `<script>`/`<link>` tags in `index.html` (and `404.html`/`terms.html`
   if relevant) so browsers fetch the new bundle.
3. `git commit` + `git push origin main`. That's the deploy.
4. Verify live, e.g.:
   ```bash
   curl -s "https://byplan.ru/?nocache=$RANDOM" | grep -oE "bundle[a-z-]*\.js\?v=[0-9]+"
   ```

## Custom domain
- `CNAME` file on `main` contains `byplan.ru` — this is what binds the custom domain in
  GitHub Pages. **Do not delete it** (a removed CNAME unbinds the domain / "hides" the site —
  see history: "Remove CNAME - hide site").
- DNS points `byplan.ru` at GitHub Pages.

## Bundles (build before pushing if you touched JS/CSS)
The page loads concatenated bundles, not the individual source files:
- `assets/js/bundle.js` — built by `scripts/build-js-bundle.sh` (does **not** include the anketa).
- `assets/js/bundle-defer.js` — the deferred bundle that **contains the anketa code**
  (source: `assets/js/anketa-modal.js`). The page does **not** load `anketa-modal.js` directly,
  so an anketa change must land in `bundle-defer.js` (rebuild it, or edit both files).
- `assets/css/bundle.css` — built by `scripts/build-bundle.sh`.

After editing source, regenerate the affected bundle(s), bump `?v=N`, commit, push.

## Form submissions
The anketa form POSTs to an n8n webhook (`.../webhook/byplan-zayavka-mira`), which emails
`info@byplan.ru`. That pipeline is **not** part of this repo — it lives in n8n on the VPS.

## Notes / history
- The `gh-pages` branch is **not** used (it was a stale legacy branch and was deleted 2026-06-21).
- Hosting on **Yandex Object Storage was considered earlier but is not in use** — the live host
  is GitHub Pages. (Previous `DEPLOY_YANDEX.md` described the unused bucket setup; superseded by
  this file.)
