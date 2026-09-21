# orch 2026-09-18 byplan blog — PLAN (verbatim Plan-agent output)

I have everything needed. Here is the plan.

# byplan.ru Blog — implementation plan

## 1. Verified facts (evidence)

| Fact | Evidence |
|---|---|
| Live host is **GitHub Pages, served from `main` root**; push to main = deploy. Object Storage and gh-pages are NOT used. | `curl -sI https://byplan.ru/` → `server: GitHub.com`; `DEPLOY.md` (repo root) states this explicitly; `CNAME`=`byplan.ru` on main; local `gh-pages` branch is stale at `5fb9243 2026-03-09` (DEPLOY.md: "not used"); `main == origin/main == 3698be7`; live bundles `?v=46` match HEAD. |
| `https://byplan.ru/blog/` is currently 404 | `curl -sI https://byplan.ru/blog/` → `HTTP/2 404` |
| Nav is **static HTML** in `index.html` lines 85-98 (`<div class="nav__menu" id="navMenu">`), not snapshot-driven. But the whole header is **hidden site-wide**: `assets/css/styles.css:83` → `.site-header{ display: none; }` (`bundle.css:230`), nothing later re-enables it (`bundle.css:886` only sets `transition`). | grep on bundle.css |
| Visible footer links: `index.html:495` `<a href="/terms.html">Условия оказания услуг</a>` and `:496` Telegram (`data-kv-link`). | sed 478-500 |
| Metrika snippet: `index.html` lines 54-71 between `<!-- Yandex.Metrika counter -->` and `<!-- /Yandex.Metrika counter -->`, counter 108522505, `trackHash:true`. | sed 1-140 |
| Anketa opens from hash: `assets/js/anketa-modal.js:9` `OPEN_HASH="#anketa"`, `:2064` opens modal on load when `location.hash === "#anketa"`. Snapshot `site.hero_cta_url = "#anketa"`, `brief_url = "#anketa"`, `telegram_dm_url = https://t.me/byplandesign`. So a blog CTA to `https://byplan.ru/#anketa` opens the modal on the main page. | grep anketa-modal.js; snapshot `tabs.site` |
| `polish.js:99` scroll-spy only touches `.nav__menu a[href^='#']` → a `/blog/` link in the nav is ignored by JS; no JS change needed. | grep |
| Secondary static pages (`terms.html`, `privacy.html`) link individual CSS files + inline `<style>`, load NO JS bundle, no Metrika. Their `<header class="site-header">` is also hidden by the same CSS rule. | sed terms.html 1-40 |
| Design tokens: `assets/css/theme.css` (`--bg #EDE8EC`, `--text #1C1B1B`, `--brand #6E4C3D`, `--radius 24px`, pill buttons `.btn .btn--primary .btn--ghost`, `.container`, `.section`, `.muted`, `.lead`). Manrope is referenced but never loaded (no `@font-face`/fonts link) → system fallback everywhere; blog pages will match. Logo: `assets/img/logo/byplan-logo.png/.webp/.svg`. | grep |
| `robots.txt`: `Disallow: /assets/data/`, `Sitemap: https://byplan.ru/sitemap.xml`. `sitemap.xml` has 2 URLs (`/`, `/terms.html`). | cat |
| **Pre-push hook** `.git/hooks/pre-push` blocks pushes whose file paths match `chemitech|openclaw|(^|[/_-])mira([/_.-]|$)|label[-_]?bot|...|этикет|\.env`. A transliterated slug containing `-mira-` (Russian «мира») would be blocked. Many untracked root files (`CLAUDE.md`, `mira-*`, `MIRA-*.md`, `simple-bot.ts`…) must never be `git add`ed. | cat hook; `git status --short` |
| Telegram `/s/` listing is sufficient: each `tgme_widget_message_wrap` block carries `data-post="byplandesign/<id>"`, `<time datetime="ISO">`, full text HTML (`tgme_widget_message_text`; 624 → 4796 chars identical to `?embed=1`), photo URLs in `tgme_widget_message_photo_wrap ... background-image:url('https://cdn4.telesco.pe/file/….jpg')` (635 → 10 URLs = JSON `photos:10`), video marker `tgme_widget_message_video`. Paging: `?before=<lowest id on page>`; `?before=2` → `['1']`; newest page ends at 657. Inline markup in text: `<b> <i> <br/> <a>`, `<i class="emoji" …><b>🤍</b></i>`, `<tg-emoji>`; HTML entities (`!`). | python urllib probes |
| Local tooling: Python 3.13.5; `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` present; no node needed. | ls/which |
| Scrape JSON: 204 posts, 66 with ≥250 words (OBSERVATION). Rubric markers found: explicit «Зыкова/экспертн» headers = 22 usable articles; «кейс/БЫЛО→СТАЛО/До→После» = 9; «Образовательная среда» (retelling Frida Ramstedt's book) = ~14; «Культура дома» (Inessa lifestyle) = 5; «вдохновляемся…» inspiration = ~27; no hashtags used systematically (3 total). | python classification pass |

## 2. Decisions

**D1. Which posts (allowlist, curated once; rule only proposes candidates).**
Published set = keys of `data/blog/titles.json` that have a non-empty `title`. Initial allowlist (OBSERVATION: 41 posts; re-verify each id's text at run time):

- **Group A — Экспертные статьи Натальи Зыковой** (byline «Наталья Зыкова, главный дизайнер byplan»), 22: `168, 201, 241, 251, 312(+313 appended: «Часть I/2» of one article), 347, 385, 435, 482, 509, 537, 548, 552, 566, 570, 590, 603, 632, 634, 649, 651, 656`. Excluded from her rubric: 396 (humor), 615 (news), 630 (video only).
- **Group B — Кейсы / БЫЛО→СТАЛО** (byline «Команда byplan»; 591 → «Инесса Диннер»), 9: `23, 79, 112, 246, 476, 565, 589, 591, 652`. Excluded: 222 (restaurant in Phuket, not a byplan case).
- **Group C — evergreen planning/renovation how-tos written by the channel author (Inessa)**, byline «Инесса Диннер, byplan», 10: `16, 67, 71, 331, 199, 494, 534, 568, 604, 624`. Reason: these are the highest search-intent texts in the channel («как узаконить перепланировку», «электрика в квартире», «зеркало в ванной», «диван и телевизор», «раковина в санузле», «штора в гардеробной»), text-led, 1 photo or none. This extends the brief's proposal; see Open Question 1.
- **Excluded**: «Образовательная среда» (derivative retellings of a copyrighted book, weak SEO), «Культура дома» (lifestyle, no search intent; can be Group D later), all «вдохновляемся…»/«насмотренность»/«очумелые ручки» posts (borrowed images, 4-10 photos each), short chatter (<140 words), personal «Дневник ремонта» posts (69, 198, 228, 629, 633), video-only.

**D2. Verbatim body + light SEO wrapper.** Body text is her HTML verbatim (bold/italic/links preserved). The only edits: (a) `lead_skip: N` in titles.json drops N leading rubric-preamble lines («Всем привет! Сегодня вторник, а значит рубрика…») — default 0; (b) a paragraph that is entirely `<b>…</b>` and ≤ 90 chars becomes `<h2>` (deterministic; produces real subheads, e.g. 635 «Главное — масштаб»); (c) title/H1, meta description, byline, date, CTA block added around the body. Title derivation: importer emits a stub per candidate with `draft_title` = first bold line, else first sentence ≤ 90 chars; Claude fills `title` and `description` in `data/blog/titles.json` once (one editorial pass, in Russian, search-oriented but not clickbait). Importer never overwrites human-filled fields.

**D3. Static pages in the site's look, no JS bundle.** `/blog/index.html` + `/blog/<slug>/index.html`, linking `/assets/css/bundle.css?v=<N read from index.html>` + `/blog/blog.css` (hand-written once, ~80 lines, uses theme tokens). Blog pages do NOT load `bundle.js`/`bundle-defer.js` (app.js would fetch the snapshot, run `sheetError`, scroll-spy, etc. — nothing on a blog page needs it; pages stay static and fast). Own minimal header `<header class="blog-header">` (NOT `site-header`, which is hidden by CSS): logo → `/`, links `Тарифы /#pricing`, `Кейсы /#cases`, `Блог /blog/`, button `Заполнить анкету /#anketa`. Head: `<title>`, `meta description`, `canonical https://byplan.ru/blog/<slug>/`, OG (`og:type article`, `og:image` = first photo absolute URL, fallback `https://byplan.ru/assets/img/hero/hero-bg.jpg`), JSON-LD `BlogPosting`, Metrika block **extracted verbatim from index.html at build time** (between the two marker comments; STOP if not found). CTA block after the body: «Хотите такую планировку? — Заполнить анкету» → `https://byplan.ru/#anketa` (btn--primary) + «Написать в Telegram» → `https://t.me/byplandesign` (btn--ghost) + link to the source post `https://t.me/byplandesign/<id>`. Images: only the post's own photos, downloaded to `assets/blog/<id>-<n>.jpg`, `<img loading="lazy" width/height omitted>`, alt = article title. Slugs: deterministic transliteration table (а a, б b, в v, г g, д d, е e, ё e, ж zh, з z, и i, й y, к k, л l, м m, н n, о o, п p, р r, с s, т t, у u, ф f, х h, ц ts, ч ch, ш sh, щ sch, ъ –, ы y, ь –, э e, ю yu, я ya), lowercase, non `[a-z0-9]` → `-`, collapse, trim, cut at ≤ 70 chars on a hyphen boundary; **stored back into titles.json on first generation and never recomputed** (URL stability even if the title is edited later). Nav/footer: two static link insertions in `index.html` (footer is the visible one; the hidden nav gets one too for crawlability). Rationale for static over snapshot: nav is static HTML already; snapshot edits require the Sheet + `update_snapshot.mjs` pipeline and would alter the content model.

**D4. Importer** `scripts/blog-import.py`, python3 stdlib only, ≤ 400 lines, subcommands `fetch | build | all`. Idempotent: running `build` twice yields `git status --porcelain` empty. Touches only `data/blog/`, `assets/blog/`, `blog/`, `sitemap.xml`. Never writes `index.html`/`robots.txt` (Codex edits those once by hand).

**D5. Sen's manual follow-ups after push**: Yandex Webmaster → resubmit `https://byplan.ru/sitemap.xml`, «Переобход страниц» for `/blog/` + 5 top articles; check `robots.txt` in Webmaster; Metrika → verify `/blog/` pageviews appear (Отчёты → Содержание → Страницы входа); optionally add a Metrika goal "blog → anketa" later (URL goal on `/#anketa` from referrer `/blog/`). Also link the blog from the Telegram channel pinned post.

## 3. File-by-file plan

**New files**
- `scripts/blog-import.py` — the importer (below).
- `blog/blog.css` — hand-written: `.blog-header` (flex row, logo 120px, links; mobile wrap), `.blog-list` (cards grid, `.card` token look), `.blog-article` (max-width 720px, `line-height 1.7`, `h2` spacing, `figure img {border-radius: var(--radius-sm)}`), `.blog-cta` (card with two buttons), `.blog-meta` (muted byline/date).
- `data/blog/titles.json` — editorial map (Claude fills after first `fetch`):
  `{"656": {"title": "…", "description": "…", "slug": "garderobnaya-bez-lishnego-…", "author": "zykova", "lead_skip": 1, "append": [], "images": true}}`; `author` ∈ `zykova | dinner | team` mapped to display strings inside the importer.
- `data/blog/channel.json` — generated cache of ALL channel posts (`id → {date, text_html, photos:[url], video, views}`), sorted keys, `ensure_ascii=False`, indent 2.
- `assets/blog/<id>-<n>.jpg` — downloaded photos of published posts only.
- `blog/index.html`, `blog/<slug>/index.html` — generated (each starts with `<!-- generated by scripts/blog-import.py; do not edit -->`).
- `reports/byplan-blog-2026-09-18.md` — Execute-phase report per CLAUDE.md convention.

**Touched files (exact insertion points; existing lines unchanged)**
- `index.html:96` — after `<a href="#faq">FAQ</a>` insert `<a href="/blog/">Блог</a>` (before the `.nav__cta` line 96 `<a href="#contact" class="nav__cta">`). Hidden today; harmless; crawlable.
- `index.html:495` — after `<a href="/terms.html">Условия оказания услуг</a>` insert `<a href="/blog/">Блог</a>` (before line 496 Telegram link). This is the visible link.
- `robots.txt` — add line `Disallow: /data/` after `Disallow: /assets/data/` (GitHub Pages serves `data/blog/*.json` publicly otherwise).
- `sitemap.xml` — importer-managed: existing two `<url>` blocks preserved byte-for-byte; blog `<url>` blocks (`/blog/` + each article, `lastmod` = post date, `changefreq weekly/monthly`, priority 0.6/0.5) inserted before `</urlset>`; on rebuild, any `<url>` whose `<loc>` contains `/blog/` is removed first.

Nothing else. No bundle rebuild, no `?v` bump (CSS/JS bundles untouched).

## 4. Importer design

```
constants: CHANNEL="byplandesign", SITE="https://byplan.ru", ROOT=repo root (Path(__file__).parent.parent)
           UA header, TRANSLIT table, AUTHORS = {"zykova": "Наталья Зыкова, главный дизайнер byplan", "dinner": "Инесса Диннер, byplan", "team": "Команда byplan"}

fetch_channel() -> dict            # GET /s/<ch>, then ?before=<min id> until a page adds no new ids (≤ 40 requests guard)
parse_listing(html) -> list[post]  # split on 'tgme_widget_message_wrap'; per block: id, datetime, text_html, photo urls, video flag, views
                                   #   STOP-worthy: a block without data-post → skip; text may be absent (photo-only) → text_html=""
load_json/save_json(path)          # sorted keys, ensure_ascii=False, indent=2, trailing newline
is_candidate(post) -> bool         # rule: 'зыков' in first 300 chars of plain text; or ('было' and 'стало') or 'до и после' or 'до → после' or 'кейс' in first 200 chars; or words>=250 and not ('вдохновля' or 'насмотренност' or 'образовательная среда' in text)
ensure_stubs(titles, channel)      # add {"title":"", "draft_title": first_bold_or_sentence, "words": n, "photos": k, "date": d} for candidates missing from titles.json; never modify existing entries
translit(s) -> str; make_slug(title) -> str
html_to_blocks(text_html, lead_skip) -> list[("p"|"h2", inner_html)]
                                   # unwrap <i class="emoji">…<b>X</b></i> → X; unwrap <tg-emoji>/<tg-spoiler>; <br/> → \n; split on blank lines;
                                   # drop first lead_skip non-empty lines; whole-<b> short paragraph → h2; single \n inside paragraph → <br>;
                                   # keep <b>,<i>,<a href rel="nofollow noopener" target="_blank">; strip anything else
plain_text(blocks) -> str          # for excerpt (160 chars) and word count
download_images(post, id) -> list[str]   # assets/blog/<id>-<n>.jpg; skip if exists and size>0; returns relative paths
read_site_bits() -> (metrika_block, css_version)   # from index.html: between '<!-- Yandex.Metrika counter -->' … '<!-- /Yandex.Metrika counter -->'; r'bundle\.css\?v=(\d+)'; STOP (SystemExit) if either missing
render_article(entry, post, imgs, bits) -> str      # single f-string template
render_index(entries, bits) -> str
write_if_changed(path, content)     # byte-compare before writing (keeps mtimes/idempotency)
prune_stale(published_slugs)        # remove blog/<dir>/ whose dir not in published set AND whose index.html has the generated marker
update_sitemap(entries)             # as in D3
main(): argparse fetch|build|all; fetch = fetch_channel→channel.json→ensure_stubs→titles.json→download images for published; build = offline from cache
```
Data flow: `t.me/s` → `data/blog/channel.json` → (+ `data/blog/titles.json`) → `blog/**/index.html`, `assets/blog/*.jpg`, `sitemap.xml`.
Idempotency: sorted JSON, deterministic ordering (published entries sorted by date desc, then id desc), `write_if_changed`, image skip-if-exists, sitemap regenerate-by-marker. `build` needs no network.
Escaping: `html.escape` for title/description/alt/JSON-LD (`json.dumps` for LD values); body HTML is the sanitized channel HTML (allowlisted tags only).

## 5. Codex prompt-ready step list (STOP on any invariant mismatch; do not adapt)

0. Pre-flight (Execute agent, read-only): `git status --porcelain | grep -v '^??'` must be empty; `git rev-parse main` = `3698be7…`; `grep -c 'Yandex.Metrika counter' index.html` = 2; `grep -n '<a href="#faq">FAQ</a>' index.html` = line 95; `grep -n 'terms.html">Условия' index.html` = line 495. Any mismatch → STOP and report.
1. Codex: create `scripts/blog-import.py` per section 4 (stdlib only; English identifiers/comments; ≤ 400 lines; `#!/usr/bin/env python3`).
2. Codex: create `blog/blog.css` (tokens from theme.css; no edits to any existing CSS; do not reuse class `site-header`).
3. Codex: edit `index.html` — two single-line insertions at lines 96 and 495 as in section 3; `git diff --stat index.html` must show exactly `+2 -0`.
4. Codex: edit `robots.txt` — add `Disallow: /data/`; diff `+1 -0`.
5. Run `python3 scripts/blog-import.py fetch`. Assert: `data/blog/channel.json` exists; `python3 -c` count of keys ≥ 200 (OBSERVATION today: 204) and max id ≥ 657; `titles.json` now has stubs; number of stubs with `words>=250 or zykova` ≈ 60-70 (OBSERVATION).
6. Claude (Execute agent, not Codex — content, Russian): fill `data/blog/titles.json` for the 41 ids in D1 (title, description ≤ 160 chars, author, lead_skip, `append:[313]` on 312, `images:false` where a photo is clearly borrowed). Leave other stubs with empty title. Do not rewrite body text.
7. Run `python3 scripts/blog-import.py all` → assert `blog/index.html` exists, `ls -d blog/*/ | wc -l` = number of non-empty titles (expected 41), `ls assets/blog | wc -l` = sum of photos of published posts (OBSERVATION; ≥ 41 since 16, 67, 71 have 0 photos → adjust), sitemap has 2 + 1 + N `<url>`.
8. Run `python3 scripts/blog-import.py build` again → `git status --porcelain` unchanged vs. after step 7 (idempotency).
9. Local verification (section 6). Any failing check → STOP, report; do not patch generated HTML by hand.
10. Commit on main with explicit paths only: `git add scripts/blog-import.py blog data/blog assets/blog sitemap.xml robots.txt index.html reports/byplan-blog-2026-09-18.md`. Never `git add -A`/`.`. Before commit: `git diff --cached --name-only | grep -iE '<SENSITIVE regex from .git/hooks/pre-push>'` must be empty. Message: `feat(blog): static blog from Telegram channel (N articles), importer scripts/blog-import.py, sitemap`. **Do not push.**

INVARIANTS (assertable after the change): index.html diff is exactly +2 lines; robots.txt diff exactly +1; no changes under `assets/css`, `assets/js`, `assets/data`, `terms.html`, `privacy.html`, `404.html`; every generated page contains the Metrika counter id `108522505` and the marker comment; every article has exactly one `<h1>`, one `<link rel="canonical">`, `og:title`, `og:image`, `application/ld+json`, a link to `https://byplan.ru/#anketa`; every `<img src="/assets/blog/…">` resolves to an existing file; no generated path matches the pre-push SENSITIVE regex; second `build` run produces no diff; `sitemap.xml` still contains the original `/` and `/terms.html` blocks verbatim.
OBSERVATIONS (re-measure at run time): 204 posts / max id 657; 41 selected; per-post photo counts; ≥250-word count 66; live `?v=46`.

## 6. Success criteria (commands, from repo root)

```bash
# 1 existing site untouched
git diff --stat HEAD~1 -- assets/css assets/js assets/data terms.html privacy.html 404.html | wc -l        # → 0
git diff HEAD~1 --numstat -- index.html robots.txt                                                          # → "2 0 index.html", "1 0 robots.txt"
# 2 generated set
N=$(python3 -c "import json;print(sum(1 for v in json.load(open('data/blog/titles.json')).values() if v.get('title')))"); echo $N
[ "$(ls -d blog/*/ | wc -l)" -eq "$N" ]
# 3 serve + probe
python3 -m http.server 8765 >/dev/null 2>&1 &  sleep 1
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8765/blog/                                        # 200
grep -o 'class="blog-card"' blog/index.html | wc -l                                                         # == N
for d in blog/*/; do u="http://127.0.0.1:8765/$d"; c=$(curl -s -o /dev/null -w '%{http_code}' "$u"); h=$(curl -s "$u"); \
  echo "$c $(grep -c '<h1' <<<"$h") $(grep -c 'rel="canonical"' <<<"$h") $(grep -c 'og:image' <<<"$h") $(grep -c 108522505 <<<"$h") $(grep -c 'byplan.ru/#anketa' <<<"$h") $d"; done | awk '$1!=200||$2!=1||$3!=1||$4<1||$5<1||$6<1' # → empty
grep -oh 'src="/assets/blog/[^"]*"' blog/*/index.html | sed 's/src="\/\(.*\)"/\1/' | sort -u | while read f; do [ -s "$f" ] || echo MISSING $f; done   # → empty
# 4 sitemap
grep -c '<loc>https://byplan.ru/blog/' sitemap.xml                                                          # == N+1
grep -c '<loc>https://byplan.ru/</loc>' sitemap.xml; grep -c 'terms.html' sitemap.xml                       # 1, 1
python3 -c "import xml.dom.minidom as m;m.parse('sitemap.xml');print('xml ok')"
# 5 idempotency + hygiene
python3 scripts/blog-import.py build && git status --porcelain | grep -vE '^\?\?' | wc -l                   # 0 after commit
git ls-files blog assets/blog data/blog | grep -iE 'chemitech|openclaw|(^|[/_-])mira([/_.-]|$)|label[-_]?bot' | wc -l   # 0
wc -l scripts/blog-import.py                                                                                # ≤ 400
# 6 headless render (index + one article), screenshot into scratchpad
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --window-size=1280,1800 --screenshot=<scratchpad>/blog-index.png http://127.0.0.1:8765/blog/
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --dump-dom http://127.0.0.1:8765/blog/ | grep -c 'blog-card'   # == N
kill %1
```

## 7. Open questions for Sen

1. **Group C (10 how-to posts written by Inessa, byline «Инесса Диннер, byplan»)** — include, or blog = only Natasha's expert articles + cases (31 pages)? Default in this plan: include (best search intent in the channel).
2. **Rubric preamble lines** («Всем привет! Сегодня вторник, а значит рубрика…») — drop them via `lead_skip` (light edit, body otherwise verbatim), or keep 100% verbatim? Default: drop.

### Critical Files for Implementation
- /Users/senjaru/WebstormProjects/onboarding-project/scripts/blog-import.py (new — importer)
- /Users/senjaru/WebstormProjects/onboarding-project/index.html (two link insertions at lines 96 and 495; Metrika block lines 54-71 is the template source)
- /Users/senjaru/WebstormProjects/onboarding-project/data/blog/titles.json (new — editorial allowlist/titles map)
- /Users/senjaru/WebstormProjects/onboarding-project/blog/blog.css (new — blog styles on theme tokens)
- /Users/senjaru/WebstormProjects/onboarding-project/sitemap.xml (importer-managed; existing entries preserved)
