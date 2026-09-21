# byplan.ru — Yandex Webmaster audit (2026-09-21)

Source: Webmaster API v4 (token `~/.config/byplan/ya_webmaster.token`, user 2286558141, host `https:byplan.ru:443` verified by arsenij-ush via HTML file 14:32 MSK) + curl probes + GitHub Pages API.

## Where we stand (measured)
| metric | value |
|---|---|
| pages in Yandex search | **3** (/, /terms.html, /assets/downloads/sample-concept.pdf) |
| ИКС (SQI) | 0 |
| external links | 2 (junk: jobsapp.info, screenshots.wiki) |
| organic, 30 days | 50 shows / 10 clicks, 38 queries; weekly shows 0–9 |
| best query | «планировка квартиры цена» — 12 shows, pos 6.3, **0 clicks** |
| brand | «byplan» 3 shows / 4 clicks pos 1.7; «наталья зыкова дизайнер» pos 9.5 |
| Webmaster problems PRESENT | 1: `NO_METRIKA_COUNTER_BINDING` |
| sitemap | picked up from robots on 09-18 with 2 URLs; re-added as user sitemap today (same id); now 41 URLs live |
| recrawl | 39 blog URLs queued today (quota 150/day, 111 left) |
| http://byplan.ru/ | **200, no redirect** — GitHub Pages `https_enforced: false` → duplicate HTTP mirror |
| /terms.html | was REMOVED as LOW_QUALITY on 08-09, back on 09-06 |
| co-owner | `sy@learsun.su` verified the host 30 s after Sen (14:33) — who is this? |

Organic traffic is effectively zero today; the site is a one-page landing with 3 indexed URLs. The blog changes that only once the 38 pages get indexed (queued) and earn links.

## What can be done — ranked
### A. Now, by API / config (I do it on your go)
1. **Enforce HTTPS on GitHub Pages** (`PUT /repos/waimaozi/byplan/pages {https_enforced:true}`) → http→https 301, kills the duplicate mirror. Zero risk, site already https-canonical.
2. **Weekly Webmaster pull** into the same Monday report as the Direct query audit: new indexed blog URLs, excluded URLs + reason, top queries + positions, problems. Script, no hand work.
3. **Sitemap `lastmod` for `/`** is stale (2026-06-21); importer can stamp it with the last commit date. Minor.
4. **Blog internal links**: a «Читайте также» block (3 related articles) on every article + a «Из блога» strip of 3 latest articles on the home page. The strip touches the home page (a new block, not existing copy) — your call because of the content freeze.
5. **Blog `<img width/height>`** for CLS, and `og:image` for the blog index. Minor.

### B. UI-only in Webmaster (you, 5 minutes)
6. **Bind Metrika counter 108522505** (Webmaster → Настройки → Счётчики Метрики, or Metrika → Настройки → Вебмастер) → clears the one flagged problem and enables **«Обход по счётчику»** (turn it on right after): Yandex then discovers new blog pages from Metrika hits within hours instead of waiting for the crawler. No API for this.
7. **Регион сайта** → Москва + Санкт-Петербург (72% of traffic). Regional queries («планировка квартиры спб») rank better with it set.
8. **Check the co-owner** `sy@learsun.su`. If it's not you or Natasha/Inessa, remove it (Права доступа).

### C. Content / off-site (the real lever for ИКС 0 and 2 backlinks)
9. **Snippet for «планировка квартиры цена»**: home ranks 6 with 0 clicks. Meta description without a price loses to competitors showing «от 500 ₽/м²». Adding the price to `<meta description>` (not visible copy) is the one change I'd argue for despite the freeze.
10. **Links**: pin byplan.ru/blog/ in the Telegram channel and link each new article from its post; Yandex Бизнес card → site link; Natasha's/Inessa's other profiles (VK, Дзен, Pinterest) → link to specific articles. 2 links today is why ИКС is 0.
11. **Яндекс Дзен / VC.ru** cross-posting of the expert articles with a canonical link back — cheap syndication that Yandex weighs.
12. **Keep the importer fed**: every new Zykova article = one `fetch` + a title + `build` + push. Indexing compounds from here.
