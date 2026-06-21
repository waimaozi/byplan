# ByPlan anketa: empty-email + empty-PDF fix — 2026-06-21

## Summary
Two production bugs on byplan.ru's questionnaire ("anketa"), both **presentation bugs on top of correct data** (the form's data was arriving in n8n intact all along):

1. **Empty email** — the n8n notification email showed every field as `—`.
2. **Empty PDF** — the "Скачать PDF с ответами" button produced a blank PDF.

Both fixed, deployed, and verified.

## Investigation (verified facts)
- The live form POSTs to `https://n8n2.waimaozi.com/webhook/byplan-zayavka-mira` → n8n workflow `5W9rvWQsYl7IgLP4` (`byplan-anketa-v2`), flow `Webhook → Email → Respond`.
- n8n **does** save executions (confirmed: exec 314994/315058 saved, all nodes ok). Default 14-day prune.
- The real submission (exec 315058) arrived with full data: `body = {consent, contact, sections, form_version, meta, submitted_at}`. Contact in `body.contact`, answers in `body.sections` (machine-keyed).
- **Email bug root cause:** template read `body.name`/`body.phone`/`body.email`/`body.message` — none exist (real paths: `body.contact.name`, single `body.contact.contact`, answers under `body.sections`). → all `—`.
- **PDF bug root cause:** capture wrapper was `position:fixed; left:-10000px` (no width) and the report HTML was a full `<!doctype html>…<body>` string injected via `div.innerHTML` (head/style stripped by the fragment parser). html2canvas captures a `-10000px` element as blank.
- Earlier "no email arrived" was **SMTP latency**, not SPF — the Gmail-relay path (cred `SMTP sales@byplan.ru (via Gmail Mira)`, From `info@byplan.ru`) does deliver. Left as-is (works; could later move to Yandex SMTP for cleaner SPF).

## Fix design (one source of truth)
The client already builds a human-readable report (`collectReport` → `{sections:[{title,items:[{question,answers[]}]}]}`) for the PDF. We now feed that **same report into the payload** (`payload.report`) so the email renders real answers without re-deriving labels from machine keys. The PDF and email now share one readable source.

## Changes
**Client — `assets/js/anketa-modal.js` + `assets/js/bundle-defer.js` (live bundle), identical edits:**
- `submit()`: `payload.report = collectReport(modal)` (before any draft reset).
- `buildReportHTML()`: return a self-contained fragment (`<style>…</style><div class="anketa-report">…`), CSS scoped under `.anketa-report` (no page bleed).
- `downloadReportPDF()`: wrapper now `position:absolute; left:0; top:0; width:794px; z-index:-1` (not `left:-10000px`); html2canvas gets `windowWidth:794, scrollX:0, scrollY:0`; wrapper cleanup moved to `finally`.
- `index.html`: cache-bust `?v=40 → ?v=41`.

**n8n — workflow `5W9rvWQsYl7IgLP4`:**
- New **Code node "Render Email"** (`Webhook → Render Email → Email → Respond`) builds readable HTML from `body.contact` + `body.report.sections`, HTML-escapes all user input, falls back gracefully if `body.report` is absent (old cached bundle).
- Email node now reads `{{ $json.subject }}` / `{{ $json.html }}`; `to`/`from`/`cc`/SMTP credential unchanged.

## Review (per discipline)
Two parallel Haiku reviews (one with context, one blind). Findings:
- Blind "stray `<li>`" → false positive (artifact of my paraphrase; real code clean — confirmed).
- Blind "z-index capture/overlay risk" → not applicable (`html2pdf().from(el)` renders the element subtree in isolation).
- Blind "tall-content truncation with `position:fixed`" → **accepted**, switched to `position:absolute`.
- Everything else confirmed correct (escaping, missing-report fallback, n8n return shape, payload timing).

## Verification
- **Email (live):** re-fired a realistic submission with `report`; exec 315144 success, SMTP `250 OK`. Rendered HTML shows name/contact/family + all sections; multi-answer as clean `<ul><li>`; injection escaped (`&lt;с барной&gt; … &amp;`).
- **PDF (headless Chrome):** ran the exact new capture logic — canvas `1588×646`, `nonWhitePct=2.47%` (text present; blank bug = 0%), `bgLeakPct=0.00%` (no page-bg bleed). Render confirmed working.
- Both JS files pass `node --check`.

## CORRECTION (2026-06-22, v42) — first PDF fix was wrong
The v41 PDF fix (capture node `position:absolute; z-index:-1`) **still produced a blank PDF**
in the real browser. My v41 "verification" used raw `html2canvas` on the element, which does NOT
exercise html2pdf's internal clone — and html2pdf **collapses a positioned element to height:0**,
so the real pipeline still rendered nothing. (Symptom Sen saw: "same size as before".)

Re-reproduced the **actual html2pdf pipeline** headlessly across 6 wrapper strategies via
`.toCanvas()` pixel inspection. Result: only a **static (in-flow) wrapper** renders content
(`1406x626, ~2.8% ink`); every positioned/off-screen-on-the-wrapper variant → height:0 → blank.

**Correct fix (v42):** keep the report wrapper **static** (real measured height) and hide it by
parking its **PARENT** off-screen (`position:absolute; left:-9999px`). Verified non-blank through
the real `.toCanvas()` path. Also bumped `VERSION` constant `40→42` (config.js + bundle.js) — it
was unbumped before, so the footer wrongly showed "v40" on fresh deploys. Cache `?v=42`.
Commit `6c9da94`. Email fix unchanged and confirmed good by Sen ("looks fine").

Lesson: verify the **real** rendering pipeline, not a proxy of it.

## Still on Sen
- Real-browser confirmation: submit the live form (v41) and download the PDF once cache clears.
- Optional follow-up: move n8n Email SMTP from Gmail-relay to `info@byplan.ru` Yandex SMTP (needs app-password) for clean SPF.
- `sitemap.xml` (earlier) still needs uploading to the Yandex bucket if the site is bucket-served (note: repo also has a `gh-pages` branch — deploy mechanism unconfirmed).
