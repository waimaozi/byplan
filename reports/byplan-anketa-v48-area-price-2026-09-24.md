# byplan anketa v48 — area + price estimate, nested-block report fix (2026-09-24)

Two complaints from Natasha (partner), relayed by Sen:
1. A client filled the whole 9-step anketa and only afterwards understood that 500 ₽/м² adds up — she wanted a calculated field.
2. Natasha's team receives "answers without questions" and has to guess what the client meant.

## Diagnosis

**Complaint 2 root cause (measured on Оксана's real submission, n8n execution 12440, 2026-09-21):** email/Telegram renderers DO print questions. The defect was in the client-side `collectReport()`: `.anketa-block` elements are nested (a container «Варочная зона» holds «Варочная поверхность», «Духовой шкаф и микроволновая печь» → «Духовой шкаф» …). The collector took every descendant checked input for every block, so the container line was a flattened pile of every nested answer, sub-blocks then repeated them, and generic sub-titles («Необходимо хранение:», «Дополнительно:») appeared with no context. Real output before:

```
Варочная зона — 3 конфорки, Под варочной поверхностью, Встроенная в верхний ряд шкафов
Варочная поверхность — 3 конфорки
Духовой шкаф и микроволновая печь — Под варочной поверхностью, Встроенная в верхний ряд шкафов
Обувь — Большого количества обуви
Необходимо хранение: — Большого количества обуви
```

**Complaint 1:** the anketa never asked for the apartment area, so nothing could compute a price.

## What shipped (commit on main → GitHub Pages → byplan.ru)

Files: `assets/js/anketa-modal.js`, `assets/css/anketa-modal.css`, rebuilt `assets/js/bundle-defer.js` + `assets/css/bundle.css`, `index.html` cache-bust `?v=48`. `FORM_VERSION` → `byplan-anketa-v4`.

### A. Report collector
- A block reports only inputs it directly owns; container blocks with no own inputs emit nothing.
- Question = breadcrumb of ancestor titles: `Варочная зона → Духовой шкаф и микроволновая печь → Духовой шкаф — Под варочной поверхностью`.
- Blocks inside hidden containers are skipped (children rooms toggle `style.display`), so a stale «Пол ребёнка» tick does not leak into a «Нет детской» anketa.
- Required-asterisk stripped from field labels («Ваше имя*» → «Ваше имя»).
- Same collector feeds the PDF, the email, and the Telegram alert, so all three are fixed at once. n8n untouched.

### B. Area + live price
- Step 0 gets a **required** number field «Площадь квартиры, м²» (10–2000, step 0.1, comma or dot accepted).
- Live line under it: `Ориентировочная стоимость: 32 500 ₽ (65 м² × 500 ₽/м²)`; above 120 м²: `Площадь больше 120 м² — стоимость рассчитаем индивидуально после анкеты.` Defaults 500 / 120, overridable via site KV keys `price_per_m2` / `price_max_m2`.
- Last-step echo: `Свяжемся с вами: Имя, +7 … · 65 м², ориентировочно 32 500 ₽`.
- Payloads: `contact.area_m2` (number) and `contact.price_estimate` (number or null) in both the partial lead and the full submit; report section «Контакты и семья» gains «Площадь квартиры, м²» and «Ориентировочная стоимость». Baserow table 620 has no column for these yet (Baserow unreachable from the Mac) — they live in `payload_json` and in email/TG.

**Decision taken without Sen (flip if wrong):** the area field is mandatory. One number, and it is exactly what makes the price visible before the client invests in 9 steps; it also reaches Natasha in the partial lead. To make it optional: remove `required` from the `area_m2` input in `anketa-modal.js`, rebuild.

## Process
- Codex (local, `codex exec`) wrote the change from a spec; first run STOPPED on a spec mismatch (children containers use `style.display`, not `hidden`) — spec corrected, second run clean.
- Reviewer A (Haiku, with context): PASS, no findings.
- Reviewer B (Haiku, blind): BLOCK on a suspected Latin «o» in «стоимость» — checked with xxd, all four occurrences are byte-identical Cyrillic (d0 be). False positive, dismissed.
- One post-review cosmetic edit (6 lines): report answer no longer repeats the «Ориентировочная стоимость:» prefix.
- Headless-Chrome E2E (scratchpad `e2e/v48.js`, webhook intercepted, bodies captured in-page): price line shows/hides/over-limit correctly, empty area blocks step 0, partial + full payloads carry `area_m2: 65, price_estimate: 32500`, report shows breadcrumbs and no flattened container line, hidden child block skipped, draft restore re-renders the price, 0 page errors.
- Sprint NOT logged: `ssh vps` times out from this Mac (known since 2026-09-14).
