/* ============================================================
   byplan — cases.js (module)
   Plan #1:
   - Case cards stay as rendered by app.js (we DO NOT edit app.js)
   - We fetch extra tab "cases_media" and enhance cards:
        * premium "Было/Стало" preview on cover
        * open a modal with big compare + scene selector
   Scope: ONLY #cases section
   ============================================================ */

(() => {
  'use strict';

  const doc = document;

  const qs = (sel, root = doc) => root.querySelector(sel);
  const qsa = (sel, root = doc) => Array.from(root.querySelectorAll(sel));

  const cfg = window.SITE_CONFIG || {};
  const SHEET_ID = cfg.SHEET_ID;
  const TAB_CASES = (cfg.TABS && cfg.TABS.cases) ? cfg.TABS.cases : 'cases';
  const TAB_MEDIA = 'cases_media'; // NEW tab (created in Google Sheets)

  const prefersReducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

  function normText(s) {
    return String(s ?? '').replace(/\s+/g, ' ').trim();
  }

  function normalizeAssetUrl(url) {
    const u = String(url ?? '').trim();
    if (!u) return '';
    if (/^(https?:)?\/\//i.test(u)) return u;
    // relative paths: strip leading slashes so GitHub Pages resolves correctly
    return u.replace(/^\/+/, '');
  }

  function slugify(str) {
    // Allow Cyrillic too (dataset + maps are fine)
    const s = String(str ?? '')
      .trim()
      .toLowerCase()
      .replace(/ё/g, 'е');

    const out = s
      .replace(/[^a-z0-9\u0400-\u04ff]+/g, '-') // latin + cyrillic + digits
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);

    return out || 'case';
  }

  function toNumber(x) {
    const n = parseFloat(String(x ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function safePairsFromMediaRows(rows) {
    // Group by case_id, sort by `sort` (number) then row order
    const byCase = new Map();

    rows.forEach((r, idx) => {
      const caseId = normText(r.case_id);
      if (!caseId) return;

      const before_url = normalizeAssetUrl(r.before_url);
      const after_url = normalizeAssetUrl(r.after_url);

      // allow single image (after only), but skip empty rows
      if (!before_url && !after_url) return;

      const pair = {
        case_id: caseId,
        label: normText(r.label) || '',
        before_url,
        after_url,
        before_thumb: normalizeAssetUrl(r.before_thumb || r.before_thumb_url || ''),
        after_thumb: normalizeAssetUrl(r.after_thumb || r.after_thumb_url || ''),
        before_caption: normText(r.before_caption) || '',
        after_caption: normText(r.after_caption) || '',
        sort: toNumber(r.sort),
        _idx: idx
      };

      const arr = byCase.get(caseId) || [];
      arr.push(pair);
      byCase.set(caseId, arr);
    });

    for (const [cid, arr] of byCase.entries()) {
      arr.sort((a, b) => {
        const as = (a.sort ?? 1e9);
        const bs = (b.sort ?? 1e9);
        if (as !== bs) return as - bs;
        return a._idx - b._idx;
      });
      byCase.set(cid, arr);
    }

    return byCase;
  }

  async function fetchTab(tabName) {
    if (!SHEET_ID || !window.Sheets || typeof window.Sheets.fetchTab !== 'function') {
      throw new Error('Sheets loader is not available (window.Sheets.fetchTab missing).');
    }
    return await window.Sheets.fetchTab(SHEET_ID, tabName);
  }

  // -----------------------------
  // UI builders
  // -----------------------------
  function buildCardPreview(imgBox, pair) {
    // Clear existing image
    imgBox.innerHTML = '';

    const preview = doc.createElement('div');
    preview.className = 'case-preview';
    preview.style.setProperty('--pos', '56%');

    const beforeSrc = pair.before_thumb || pair.before_url;
    const afterSrc = pair.after_thumb || pair.after_url;

    // BEFORE (base)
    if (beforeSrc) {
      const before = doc.createElement('img');
      before.className = 'case-preview__img case-preview__img--before';
      before.alt = 'Было';
      before.loading = 'lazy';
      before.src = beforeSrc;
      preview.appendChild(before);
    }

    // AFTER (overlay)
    if (afterSrc) {
      const afterWrap = doc.createElement('div');
      afterWrap.className = 'case-preview__after';

      const after = doc.createElement('img');
      after.className = 'case-preview__img case-preview__img--after';
      after.alt = 'Стало';
      after.loading = 'lazy';
      after.src = afterSrc;

      afterWrap.appendChild(after);
      preview.appendChild(afterWrap);

      // Handle
      const handle = doc.createElement('div');
      handle.className = 'case-preview__handle';
      handle.setAttribute('aria-hidden', 'true');
      preview.appendChild(handle);
    }

    const badge = doc.createElement('div');
    badge.className = 'case-preview__badge';
    badge.textContent = 'Было → Стало';
    preview.appendChild(badge);

    const lb = doc.createElement('div');
    lb.className = 'case-preview__label case-preview__label--before';
    lb.textContent = 'Было';
    preview.appendChild(lb);

    const la = doc.createElement('div');
    la.className = 'case-preview__label case-preview__label--after';
    la.textContent = 'Стало';
    preview.appendChild(la);

    const cta = doc.createElement('div');
    cta.className = 'case-preview__cta';
    cta.innerHTML = '<span>Смотреть кейс</span>';
    preview.appendChild(cta);

    imgBox.appendChild(preview);
  }

  // -----------------------------
  // Modal (dialog)
  // -----------------------------
  let dialogEl = null;
  let lastFocusEl = null;

  function ensureDialog() {
    if (dialogEl && dialogEl.isConnected) return dialogEl;

    dialogEl = doc.getElementById('caseDialog');
    if (!dialogEl) {
      dialogEl = doc.createElement('dialog');
      dialogEl.id = 'caseDialog';
      dialogEl.className = 'case-dialog';
      dialogEl.setAttribute('aria-labelledby', 'caseDialogTitle');

      dialogEl.innerHTML = `
        <div class="case-dialog__panel" role="document">
          <button type="button" class="case-dialog__close" aria-label="Закрыть">×</button>

          <header class="case-dialog__head">
            <div class="case-dialog__title" id="caseDialogTitle"></div>
            <div class="case-dialog__meta" id="caseDialogMeta"></div>
          </header>

          <div class="case-dialog__grid">
            <div class="case-dialog__viewer">
              <div class="case-compare" id="caseCompare">
                <img class="case-compare__img case-compare__img--before" id="caseBeforeImg" alt="Было">
                <div class="case-compare__after" id="caseAfterWrap">
                  <img class="case-compare__img case-compare__img--after" id="caseAfterImg" alt="Стало">
                </div>
                <div class="case-compare__handle" aria-hidden="true"></div>
                <input class="case-compare__range" id="caseCompareRange" type="range" min="0" max="100" value="56" aria-label="Сравнение (Было/Стало)">
                <div class="case-compare__labels" aria-hidden="true">
                  <span>Было</span>
                  <span>Стало</span>
                </div>
              </div>

              <div class="case-scenes" id="caseScenes"></div>
            </div>

            <aside class="case-dialog__info">
              <div class="case-dialog__section" id="caseProblemWrap" hidden>
                <h4>Задача</h4>
                <p id="caseProblem"></p>
              </div>

              <div class="case-dialog__section" id="caseResultWrap" hidden>
                <h4>Результат</h4>
                <p id="caseResult"></p>
              </div>

              <div class="case-dialog__actions" id="caseActions"></div>
            </aside>
          </div>
        </div>
      `.trim();

      doc.body.appendChild(dialogEl);
    }

    const closeBtn = qs('.case-dialog__close', dialogEl);
    if (closeBtn && !closeBtn.__bound) {
      closeBtn.__bound = true;
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        dialogEl.close();
      });
    }

    if (!dialogEl.__boundClick) {
      dialogEl.__boundClick = true;
      dialogEl.addEventListener('click', (e) => {
        // close on clicking the backdrop (outside panel)
        if (e.target === dialogEl) dialogEl.close();
      });
    }

    if (!dialogEl.__boundCancel) {
      dialogEl.__boundCancel = true;
      dialogEl.addEventListener('cancel', (e) => {
        e.preventDefault();
        dialogEl.close();
      });
    }

    if (!dialogEl.__boundClose) {
      dialogEl.__boundClose = true;
      dialogEl.addEventListener('close', () => {
        // Clear heavy images so they don't keep memory
        const b = qs('#caseBeforeImg', dialogEl);
        const a = qs('#caseAfterImg', dialogEl);
        if (b) b.src = '';
        if (a) a.src = '';

        // Return focus
        if (lastFocusEl && typeof lastFocusEl.focus === 'function') {
          try { lastFocusEl.focus(); } catch (_) {}
        }
        lastFocusEl = null;
      });
    }

    return dialogEl;
  }

  function bindCompare(compareEl) {
    if (!compareEl || compareEl.__bound) return;
    compareEl.__bound = true;

    const range = qs('#caseCompareRange', compareEl) || qs('input[type="range"]', compareEl);
    const setPos = (pct) => {
      const p = Math.max(0, Math.min(100, pct));
      compareEl.style.setProperty('--pos', p + '%');
      if (range) range.value = String(Math.round(p));
    };

    // initial
    setPos(56);

    range?.addEventListener('input', () => {
      setPos(parseFloat(range.value || '56'));
    });

    // Pointer drag (premium feel)
    let dragging = false;
    let activePointerId = null;

    const updateFromPointer = (e) => {
      const rect = compareEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = (x / rect.width) * 100;
      setPos(pct);
    };

    compareEl.addEventListener('pointerdown', (e) => {
      // allow right click etc to pass
      if (e.button != null && e.button !== 0) return;

      dragging = true;
      activePointerId = e.pointerId;
      try { compareEl.setPointerCapture(activePointerId); } catch (_) {}
      updateFromPointer(e);
    });

    compareEl.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      if (activePointerId != null && e.pointerId !== activePointerId) return;
      updateFromPointer(e);
    });

    const stop = () => {
      dragging = false;
      activePointerId = null;
    };

    compareEl.addEventListener('pointerup', stop);
    compareEl.addEventListener('pointercancel', stop);

    // Double click to reset
    compareEl.addEventListener('dblclick', () => setPos(56));
  }

  function renderScenes(container, pairs, onPick) {
    container.innerHTML = '';

    pairs.forEach((p, idx) => {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'case-scene';
      btn.setAttribute('aria-pressed', idx === 0 ? 'true' : 'false');
      btn.dataset.index = String(idx);

      const thumb = doc.createElement('span');
      thumb.className = 'case-scene__thumb';

      const bSrc = p.before_thumb || p.before_url;
      const aSrc = p.after_thumb || p.after_url;

      if (bSrc) {
        const b = doc.createElement('img');
        b.alt = '';
        b.loading = 'lazy';
        b.src = bSrc;
        thumb.appendChild(b);
      }

      if (aSrc) {
        const a = doc.createElement('img');
        a.alt = '';
        a.loading = 'lazy';
        a.src = aSrc;
        thumb.appendChild(a);
      }

      const label = doc.createElement('span');
      label.className = 'case-scene__label';
      label.textContent = p.label || `Сцена ${idx + 1}`;

      btn.appendChild(thumb);
      btn.appendChild(label);

      btn.addEventListener('click', () => onPick(idx));

      container.appendChild(btn);
    });
  }

  function setActiveScene(dialog, pairs, idx) {
    const p = pairs[idx];
    if (!p) return;

    const beforeImg = qs('#caseBeforeImg', dialog);
    const afterImg = qs('#caseAfterImg', dialog);
    const afterWrap = qs('#caseAfterWrap', dialog);
    const compare = qs('#caseCompare', dialog);
    const range = qs('#caseCompareRange', dialog);

    const beforeSrc = p.before_url || p.before_thumb || '';
    const afterSrc = p.after_url || p.after_thumb || '';

    if (beforeImg) beforeImg.src = beforeSrc;
    if (afterImg) afterImg.src = afterSrc;

    // if one of images is missing: show single (no compare)
    if (!beforeSrc || !afterSrc) {
      if (compare) compare.style.setProperty('--pos', '100%');
      if (range) range.value = '100';
      if (afterWrap) afterWrap.style.width = '100%';
    } else {
      if (afterWrap) afterWrap.style.width = '';
      if (compare) compare.style.setProperty('--pos', '56%');
      if (range) range.value = '56';
    }

    // update buttons state
    const btns = qsa('.case-scene', qs('#caseScenes', dialog) || dialog);
    btns.forEach((b) => {
      const i = parseInt(b.dataset.index || '-1', 10);
      b.setAttribute('aria-pressed', i === idx ? 'true' : 'false');
    });

    // small “expensive” nudge: animate handle only if motion ok
    if (!prefersReducedMotion && compare) {
      compare.animate?.(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-1px)' }, { transform: 'translateY(0)' }],
        { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' }
      );
    }
  }

  function openCaseDialog(caseRow, pairs, focusReturnEl) {
    if (!pairs || !pairs.length) return;

    const dialog = ensureDialog();
    lastFocusEl = focusReturnEl || doc.activeElement;

    // Fill header
    const titleEl = qs('#caseDialogTitle', dialog);
    const metaEl = qs('#caseDialogMeta', dialog);
    if (titleEl) titleEl.textContent = normText(caseRow.title) || 'Кейс';

    const metaParts = [];
    if (caseRow.area_m2) metaParts.push(`${normText(caseRow.area_m2)} м²`);
    if (caseRow.type) metaParts.push(normText(caseRow.type));
    if (caseRow.city) metaParts.push(normText(caseRow.city));
    if (metaEl) metaEl.textContent = metaParts.join(' · ');

    // Problem / result
    const probWrap = qs('#caseProblemWrap', dialog);
    const resWrap = qs('#caseResultWrap', dialog);
    const prob = qs('#caseProblem', dialog);
    const res = qs('#caseResult', dialog);

    const probText = normText(caseRow.problem);
    const resText = normText(caseRow.result);

    if (probWrap) probWrap.hidden = !probText;
    if (resWrap) resWrap.hidden = !resText;
    if (prob) prob.textContent = probText;
    if (res) res.textContent = resText;

    // Actions (optional link to PDF / external)
    const actions = qs('#caseActions', dialog);
    if (actions) actions.innerHTML = '';

    const url = normText(caseRow.url);
    if (url && actions) {
      const a = doc.createElement('a');
      a.className = 'btn btn--primary';
      a.href = normalizeAssetUrl(url);
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Открыть материалы';
      actions.appendChild(a);
    }

    // Scenes
    const scenes = qs('#caseScenes', dialog);
    if (scenes) {
      renderScenes(scenes, pairs, (idx) => setActiveScene(dialog, pairs, idx));
      // Hide selector if there is only one pair
      scenes.style.display = (pairs.length <= 1) ? 'none' : '';
    }

    // Compare binder
    const compare = qs('#caseCompare', dialog);
    if (compare) bindCompare(compare);

    // Initial scene
    setActiveScene(dialog, pairs, 0);

    // Show modal
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      // fallback (very old browsers): emulate
      dialog.setAttribute('open', '');
    }

    // Focus close
    const closeBtn = qs('.case-dialog__close', dialog);
    closeBtn?.focus?.();
  }

  // -----------------------------
  // Enhancement: cards + delegated interactions
  // -----------------------------
  function enhanceCards(grid, casesRows, mediaByCase) {
    // Build fast lookup by title & by case_id
    const byTitle = new Map();
    const byId = new Map();

    casesRows.forEach((r) => {
      const t = normText(r.title);
      if (t) byTitle.set(t, r);

      const cid = normText(r.case_id) || slugify(t);
      byId.set(cid, r);
    });

    qsa('.case-card', grid).forEach((card) => {
      if (card.dataset.casesEnhanced === '1') return;
      card.dataset.casesEnhanced = '1';

      const titleEl = qs('.case-card__title', card);
      const title = normText(titleEl?.textContent);
      if (!title) return;

      const row = byTitle.get(title);
      const caseId = normText(row?.case_id) || slugify(title);

      const pairs = mediaByCase.get(caseId);
      if (!pairs || !pairs.length) return;

      card.dataset.caseId = caseId;
      card.tabIndex = 0;

      const imgBox = qs('.case-card__img', card);
      if (imgBox) buildCardPreview(imgBox, pairs[0]);

      // Make it clear it's interactive
      card.style.cursor = 'pointer';

      // Store for quick open
      card.__caseRow = row || { title };
      card.__casePairs = pairs;
      card.__caseById = byId;
    });

    // Delegated click/keyboard
    if (!grid.__casesBound) {
      grid.__casesBound = true;

      grid.addEventListener('click', (e) => {
        const card = e.target.closest?.('.case-card[data-case-id]');
        if (!card || !grid.contains(card)) return;

        // Allow normal link clicks inside
        if (e.target.closest('a')) return;

        e.preventDefault();

        const row = card.__caseRow || {};
        const pairs = card.__casePairs || [];
        openCaseDialog(row, pairs, card);
      });

      grid.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;

        const card = e.target.closest?.('.case-card[data-case-id]');
        if (!card || !grid.contains(card)) return;

        e.preventDefault();

        const row = card.__caseRow || {};
        const pairs = card.__casePairs || [];
        openCaseDialog(row, pairs, card);
      });
    }
  }

  async function init() {
    const grid = doc.getElementById('casesGrid');
    if (!grid) return;

    // Wait for app.js to render cases
    const ready = () => !!qs('.case-card', grid);

    const run = async () => {
      // Load data (cases + cases_media)
      let casesRows = [];
      let mediaRows = [];

      try {
        // cases tab is already loaded by app.js; fetchTab() will likely return cached quickly
        [casesRows, mediaRows] = await Promise.all([
          fetchTab(TAB_CASES),
          fetchTab(TAB_MEDIA)
        ]);
      } catch (err) {
        console.warn('[cases] Cannot load extra tab "cases_media". Add it to Google Sheets or make it public.', err);
        return;
      }

      const mediaByCase = safePairsFromMediaRows(mediaRows);
      if (!mediaByCase.size) {
        console.warn('[cases] "cases_media" loaded but no pairs found (check columns: case_id/before_url/after_url).');
        return;
      }

      enhanceCards(grid, casesRows, mediaByCase);
    };

    if (ready()) {
      run();
      return;
    }

    const mo = new MutationObserver(() => {
      if (!ready()) return;
      mo.disconnect();
      run();
    });

    mo.observe(grid, { childList: true, subtree: true });

    // Fallback
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      if (ready()) {
        clearInterval(t);
        run();
      }
      if (tries > 25) clearInterval(t);
    }, 240);
  }

  doc.addEventListener('DOMContentLoaded', init);
})();
