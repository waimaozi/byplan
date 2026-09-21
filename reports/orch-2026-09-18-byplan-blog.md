# orch 2026-09-18 → 2026-09-21 — byplan.ru Blog section (static, from Telegram channel)

Brief: Sen 2026-09-18 «make Blog section on the site and copy articles from there to the Blog (to increase organic traffic)». Existing site content untouched (only 2 link lines + 1 robots line). Verbatim plan: `reports/orch-2026-09-18-byplan-blog-PLAN.md`.

## Plan summary (approved by Sen 2026-09-18, incl. defaults: Inessa's how-tos IN, rubric preambles dropped)
- Deploy path verified = GitHub Pages from `main` root (push = deploy). Object Storage / gh-pages NOT used.
- Selection: Natasha's expert articles + БЫЛО→СТАЛО cases + Inessa's how-tos; excluded inspiration posts (borrowed images), «Образовательная среда», «Культура дома», chatter, video-only.
- Verbatim body + SEO wrapper (title/H1, description, byline, date, CTA to anketa + Telegram, source link). Static /blog/ + /blog/<slug>/, no JS bundle, own header (site header is display:none), Metrika block copied from index.html at build time, canonical/OG/JSON-LD, sitemap.
- Importer `scripts/blog-import.py` (stdlib, idempotent, `fetch|build|all`), editorial map `data/blog/titles.json`, cache `data/blog/channel.json`.

## Execute
- Codex (Mac, gpt-5.6) wrote importer + `blog/blog.css` + the 2 index.html links + robots line. First run hung on stdin over 3 days (fixed with `< /dev/null`).
- Titles: subagent drafted 41 titles/descriptions/lead_skip from a 42-post extract; I dropped 241 (vote post), 16 (manifesto), 112 (generic case) → **38 published**.
- Codex fix rounds: (1) `update_sitemap` regex crossed `</url>` boundaries and deleted the original `/` + `/terms.html` blocks → per-block match; (2) `strip_tags` turns `<br>` into a space (excerpts glued sentences); (3) post-review: skip posts with no date; hashtag/relative/non-http hrefs rendered as plain text.

## Verify
- Success criteria (plan §6) all green: index 200 + 38 cards; every article 200, exactly 1 h1, canonical, og:image, ld+json, Metrika 108522505, CTA → byplan.ru/#anketa; 49/49 images exist; sitemap parses, 39 blog `<loc>` + original 2 blocks byte-intact; index.html `+2 -0`, robots.txt `+1 -0`; nothing under assets/css|js|data, terms/privacy/404 changed; build idempotent (tree md5 identical after 2nd build); importer 332 lines; no SENSITIVE path matches.
- Headless Chrome: desktop index + article look on-brand; mobile 390 px verified via iframe (direct `--window-size=390` is a headless artifact: Chrome enforces a min window width and crops — plain HTML showed the same cut).
- Reviewer A (Haiku, with context): PASS; minor: hashtag `?q=` links, silent missing-append. Reviewer B (Haiku, blind): BLOCK on empty-date crash. Disagreement surfaced to Sen → «fix and commit» → both fixed, checks re-run green.

## Disposition
- COMMITTED locally on main (see `git log -1`), **NOT pushed** (push = live deploy; Sen's call).
- Sprint log skipped: Mac→VPS SSH still dead.

## After push (Sen, by hand)
1. Yandex Webmaster: resubmit https://byplan.ru/sitemap.xml, «Переобход» for /blog/ + 5 top articles.
2. Metrika: confirm /blog/ pageviews appear (Содержание → Страницы входа).
3. Pin/announce the blog link in the Telegram channel.
4. New posts later: `python3 scripts/blog-import.py fetch` → fill `title/description/author/lead_skip` for new stubs in `data/blog/titles.json` → `python3 scripts/blog-import.py build` → commit + push.

## Deployed 2026-09-21
Pushed 3698be7..b03f69e on Sen's «push it». Live verification: /blog/ 200 (38 cards), sample article 200, sitemap 200 (39 blog locs), robots 200, blog.css 200, sample image 200, homepage carries 2 /blog/ links.

## 2026-09-21 follow-up
- 5cd1494: «Читайте также» block (3 related/article), hero «Читать блог» button (+1 line index.html), blog index og tags; `scripts/byplan-weekly-report.py` + launchd `ru.byplan.weekly-report` (Mon 09:00). Reviews: A PASS; B BLOCK on Webmaster host_id format — FALSE POSITIVE (`https:byplan.ru:443` is the id Yandex returns; live run succeeded) → annotated, shipped. Webmaster audit: reports/byplan-webmaster-audit-2026-09-21.md. Old co-owner sy@learsun.su unplugged (7595342), https enforced on GitHub Pages.
