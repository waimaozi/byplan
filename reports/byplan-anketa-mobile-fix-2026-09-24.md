# byplan — anketa modal unusable on phones → fixed (v49), 2026-09-24

## Defect (measured, headless Chrome, screenshots in session scratchpad)
On iOS Safari the anketa opened with NO input field visible. Fixed chrome inside the dialog: header ≈150 px, `.anketa-nav` 151 px (Далее + Закрыть stacked full-width), `.quick-contact--modal` 182 px (v46 «Не уверены, что заполнять?» + TG/WA/Позвонить) inserted `beforeend` into `.anketa-modal__dialog`, OUTSIDE the scrollable `#anketaBody`. Dialog max-height 92vh.

| Viewport | form area before | after | inputs visible before → after |
|---|---:|---:|---|
| iPhone SE Safari 375×548 | 39 px | 364 px | no → yes |
| iPhone 14 Safari 390×664 | 146 px | 480 px | no → yes |
| iPhone 14 fullscreen 390×844 | 312 px | 660 px | yes → yes |
| Android Chrome 412×780 | 308 px | 619 px | yes → yes |
| Desktop 1280×900 | 580 px | 580 px | yes → yes |

Nav 151 → 72 px on phones. Metrika 09-15..09-24: 119 smartphone anketa opens → 1 step-0 completion; PC 36 → 11 (8 = our own tests from Amsterdam/NL VPN). This defect is the most likely cause.

## Fix (commit 41cc4af, pushed → LIVE, cache-bust v=49)
- `applyKVToModal`: quick-contact rendered into `#anketaBody` (scrolls with the form, below the active step).
- `.quick-contact--modal`: in-flow separator (top border, no background, margin-top 22px), compact buttons ≤760 px.
- `.anketa-nav` ≤760 px: one row, back left / next right, `flex:1 1 0`, safe-area bottom padding.
- Header ≤760 px: kicker hidden, title 1.15rem, meta/actions compact, close 36 px; `.anketa-body` padding 14px.
- `.anketa-modal__dialog` max-height `calc(100dvh - 20px)` with 92vh fallback.
- Bundles rebuilt (`build-js-defer-bundle.sh`, `build-bundle.sh`).

## Process
Codex local (VERDICT=CODEX_LOCAL) wrote the diff (40 lines) in a clean worktree from origin/main (local main carries unpushed Chemitech commits that the pre-push hook blocks). Reviewer A (with context, Haiku): PASS. Reviewer B (blind, Haiku): PASS. Step-0 validation E2E re-run on the build: bad phone blocked, good phone → step 1 normalized, Telegram handle passes, 0 page errors, webhook + Metrika intercepted (fixture updated for v48's required area field and price line in the echo). Live measure after deploy identical to local.

## Follow-ups
- Watch Metrika anketa_contact / partial / submit on smartphones from 09-25; expect step-0 completion on phones to move from ~1 % toward the PC rate.
- «Очистить ответы» wraps to two lines in the mobile header (cosmetic).
- Rule for all future browser tests: intercept `mc.yandex` — otherwise tests pollute the funnel (Amsterdam = us).
