# byplan — anketa step-0 contact validation (v47), 2026-09-23

Trigger: of 5 all-time anketas one had a wrong phone number. Step 0's contact field was free text with only `required`.

## What shipped (commit c0e8ad3, pushed → GitHub Pages, LIVE)
- `normalizeContact(raw)` in assets/js/anketa-modal.js: `@handle` (5–32 chars [A-Za-z0-9_]), email (basic regex), otherwise phone: strip non-digits; 11 digits starting 7/8 → +7 + last 10; 10 digits starting 9 → +7 + digits; else invalid. Formatted `+7 XXX XXX-XX-XX`.
- `validateCurrentStep` step 0: after native validity → invalid = setCustomValidity + reportValidity bubble + inline `<span class="anketa-error">` + `.is-invalid` border, no advance; valid = normalized value written back into the input (partial lead, draft, submit all carry it).
- `input` event on contact_value clears the custom validity so the bubble does not stick after editing.
- Step 8 (last): `<p data-contact-echo>` → «Свяжемся с вами: <name>, <contact>», filled in setStep.
- CSS: `.anketa-error`, `.anketa-input.is-invalid`. Bundles rebuilt (`build-js-defer-bundle.sh`, `build-bundle.sh`), cache-bust `?v=47` on bundle.css / bundle.js / bundle-defer.js.

## Process
- Codex local (preflight VERDICT=CODEX_LOCAL, codex-cli 0.147.0) wrote the diff (63 lines).
- Reviewer A (with context, Haiku) BLOCK: unguarded `form` in setStep echo. Nit on redundant `style.display` — REJECTED: author `.anketa-error{display:block}` overrides UA `[hidden]`, so the inline toggle is what actually hides it.
- Reviewer B (blind, Haiku) BLOCK: same setStep guard + guard in validateCurrentStep (false positive in practice: goNext returns early on missing form; guard added anyway, 2 lines).
- Both guards applied by hand (2 lines, surgical exception).

## Verification
- Unit: 12 inputs through normalizeContact — all real lead formats accept (`+79771911380`, `+7 (995) 302-51-45`, `89005373474`, `8 900 537 34 74`); 10-digit non-9, `@abc`, `user@mail` reject.
- Local E2E (headless Chrome, puppeteer-core, webhook requests intercepted so NO test lead reached n8n): bad phone → stays step 0, error visible, bubble text set; edit clears bubble; good phone → step 1 with `+7 900 537-34-74`; walk to step 8 → echo present; `@byplan_test` → step 1. 0 page errors.
- Live E2E against https://byplan.ru/ (same script, webhook intercepted): PASS. index.html serves `?v=47`; bundle.css contains `.anketa-error`.
- Sprint logged: `byplan-anketa-phone-validation-20260923` (5 pass / 0 fail).

## Not covered
- A deliberately fake but well-formed number still passes; only a callback / messenger confirmation would catch that.
- Foreign numbers are rejected (Russia-only by design; Tel Aviv-style clients must use Telegram/email).
