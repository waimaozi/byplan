/*
  Reviews: "Read more" modal (robust)
  - Uses <dialog> to avoid double-states and stuck overlays
  - Works with async-rendered reviews (MutationObserver adds "Читать полностью")
  - Supports optional "Было/Стало" preview if URLs exist in DOM
*/

(function () {
  'use strict';

  // Elements that should open the modal
  const TRIGGER_SELECTOR = [
    '[data-review-more]',
    '.review__more',
    '.review-more',
    '.review-card__more',
    '.review-card__more-btn',
    '.review__case-img',
    '.review-card__case-img'
  ].join(',');

  const REVIEW_SELECTOR = '.review, .review-card';

  let dialogEl = null;
  let lastFocusEl = null;

  function $all(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function removeLegacyOverlays() {
    // Older iterations injected div-based modals. If they remain in DOM,
    // they can keep blur/backdrop stuck forever.
    ['reviewMoreModal', 'reviewTextModal'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && el.tagName !== 'DIALOG') el.remove();
    });

    // Safety net: if there is ANY leftover div-based review modal by class,
    // remove it. The new implementation uses <dialog.review-dialog>.
    document.querySelectorAll('.review-modal').forEach((el) => {
      if (el && el.tagName !== 'DIALOG') el.remove();
    });
  }

  function ensureDialog() {
    if (dialogEl && dialogEl.isConnected) return dialogEl;

    removeLegacyOverlays();

    dialogEl = document.getElementById('reviewDialog');
    if (!dialogEl) {
      dialogEl = document.createElement('dialog');
      dialogEl.id = 'reviewDialog';
      dialogEl.className = 'review-dialog';
      dialogEl.setAttribute('aria-labelledby', 'reviewDialogName');

      dialogEl.innerHTML = `
        <div class="review-dialog__panel" role="document">
          <button type="button" class="review-dialog__close" data-review-dialog-close aria-label="Закрыть">×</button>

          <div class="review-dialog__meta">
            <div id="reviewDialogName" class="review-dialog__name"></div>
            <div id="reviewDialogRole" class="review-dialog__role"></div>
          </div>

          <div class="review-dialog__body">
            <div id="reviewDialogCase" class="review-dialog__case" hidden>
              <div class="review-dialog__case-tabs" role="tablist" aria-label="Планы было/стало">
                <button type="button" class="review-dialog__case-tab is-active" role="tab" aria-selected="true" data-review-case-tab="before">Было</button>
                <button type="button" class="review-dialog__case-tab" role="tab" aria-selected="false" data-review-case-tab="after">Стало</button>
              </div>
              <div class="review-dialog__case-frame">
                <img id="reviewDialogCaseImg" class="review-dialog__case-img" alt="" loading="lazy" />
              </div>
              <div id="reviewDialogCaseNote" class="review-dialog__case-note"></div>
            </div>

            <div id="reviewDialogText" class="review-dialog__text"></div>
          </div>
        </div>
      `;

      document.body.appendChild(dialogEl);
    }

    // Close button
    const closeBtn = dialogEl.querySelector('[data-review-dialog-close]');
    if (closeBtn && !closeBtn.__bound) {
      closeBtn.__bound = true;
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeDialog();
      });
    }

    // Backdrop click: only close when click is on the <dialog> itself (outside panel)
    if (!dialogEl.__clickBound) {
      dialogEl.__clickBound = true;
      dialogEl.addEventListener('click', (e) => {
        if (e.target === dialogEl) closeDialog();
      });
    }

    // ESC
    if (!dialogEl.__cancelBound) {
      dialogEl.__cancelBound = true;
      dialogEl.addEventListener('cancel', (e) => {
        e.preventDefault();
        closeDialog();
      });
    }

    // Case tabs
    if (!dialogEl.__tabsBound) {
      dialogEl.__tabsBound = true;
      dialogEl.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-review-case-tab]');
        if (!tab) return;
        e.preventDefault();
        e.stopPropagation();
        setCaseTab(tab.getAttribute('data-review-case-tab'));
      });
    }

    // Cleanup on close
    if (!dialogEl.__closeBound) {
      dialogEl.__closeBound = true;
      dialogEl.addEventListener('close', () => {
        document.documentElement.classList.remove('modal-open');
        document.body.classList.remove('modal-open');

        if (lastFocusEl && typeof lastFocusEl.focus === 'function') {
          try {
            lastFocusEl.focus({ preventScroll: true });
          } catch (_) {
            try {
              lastFocusEl.focus();
            } catch (_) {}
          }
        }
        lastFocusEl = null;
      });
    }

    return dialogEl;
  }

  function setMeta(name, role) {
    const root = ensureDialog();
    const nameEl = root.querySelector('#reviewDialogName');
    const roleEl = root.querySelector('#reviewDialogRole');
    if (nameEl) nameEl.textContent = (name || '').trim();
    if (roleEl) roleEl.textContent = (role || '').trim();
  }

  function setText(text) {
    const root = ensureDialog();
    const box = root.querySelector('#reviewDialogText');
    if (!box) return;

    // Clear
    while (box.firstChild) box.removeChild(box.firstChild);

    const normalized = (text || '').trim();
    if (!normalized) return;

    // Paragraphs separated by empty lines
    const parts = normalized
      .split(/\n\s*\n/g)
      .map((p) => p.trim())
      .filter(Boolean);

    parts.forEach((p) => {
      const para = document.createElement('p');
      para.className = 'review-dialog__p';
      para.textContent = p;
      box.appendChild(para);
    });
  }

  function setCaseData(beforeUrl, afterUrl, note, initialTab) {
    const root = ensureDialog();
    const wrap = root.querySelector('#reviewDialogCase');
    const img = root.querySelector('#reviewDialogCaseImg');
    const noteEl = root.querySelector('#reviewDialogCaseNote');
    const beforeTab = root.querySelector('[data-review-case-tab="before"]');
    const afterTab = root.querySelector('[data-review-case-tab="after"]');

    if (!wrap || !img || !beforeTab || !afterTab) return;

    const before = (beforeUrl || '').trim();
    const after = (afterUrl || '').trim();
    const hasCase = Boolean(before && after);

    wrap.hidden = !hasCase;
    wrap.dataset.before = before;
    wrap.dataset.after = after;

    if (noteEl) {
      noteEl.textContent = (note || '').trim();
      noteEl.style.display = noteEl.textContent ? 'block' : 'none';
    }

    if (!hasCase) {
      img.removeAttribute('src');
      img.alt = '';
      beforeTab.classList.remove('is-active');
      afterTab.classList.remove('is-active');
      beforeTab.setAttribute('aria-selected', 'false');
      afterTab.setAttribute('aria-selected', 'false');
      const body = root.querySelector('.review-dialog__body');
      if (body) body.classList.remove('review-dialog__body--split');
      return;
    }

    const body = root.querySelector('.review-dialog__body');
    if (body) body.classList.add('review-dialog__body--split');
    setCaseTab(initialTab === 'after' ? 'after' : 'before');
  }

  function setCaseTab(tab) {
    const root = ensureDialog();
    const wrap = root.querySelector('#reviewDialogCase');
    if (!wrap || wrap.hidden) return;

    const img = root.querySelector('#reviewDialogCaseImg');
    const beforeTab = root.querySelector('[data-review-case-tab="before"]');
    const afterTab = root.querySelector('[data-review-case-tab="after"]');
    if (!img || !beforeTab || !afterTab) return;

    const before = wrap.dataset.before || '';
    const after = wrap.dataset.after || '';

    const isAfter = tab === 'after';
    img.src = isAfter ? after : before;
    img.alt = isAfter ? 'План после' : 'План до';

    beforeTab.classList.toggle('is-active', !isAfter);
    afterTab.classList.toggle('is-active', isAfter);
    beforeTab.setAttribute('aria-selected', String(!isAfter));
    afterTab.setAttribute('aria-selected', String(isAfter));
  }

  function openDialog(data) {
    const root = ensureDialog();

    // Store focus only if focus is outside dialog
    const active = document.activeElement;
    if (active && active !== document.body && !root.contains(active)) {
      lastFocusEl = active;
    }

    setMeta(data.name, data.role);
    setCaseData(data.caseBeforeUrl, data.caseAfterUrl, data.caseNote, data.initialCaseTab);
    setText(data.text);

    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');

    try {
      if (!root.open && typeof root.showModal === 'function') {
        root.showModal();
      } else if (!root.open) {
        root.setAttribute('open', '');
      }
    } catch (_) {
      if (!root.open) root.setAttribute('open', '');
    }

    const closeBtn = root.querySelector('[data-review-dialog-close]');
    if (closeBtn && typeof closeBtn.focus === 'function') {
      try {
        closeBtn.focus({ preventScroll: true });
      } catch (_) {
        try {
          closeBtn.focus();
        } catch (_) {}
      }
    }
  }

  function closeDialog() {
    const root = ensureDialog();
    if (root.open && typeof root.close === 'function') {
      root.close();
    } else {
      root.removeAttribute('open');
      document.documentElement.classList.remove('modal-open');
      document.body.classList.remove('modal-open');
    }
  }

  function pickInitialCaseTab(clickedEl, reviewEl) {
    const img = clickedEl && clickedEl.closest('.review__case-img, .review-card__case-img');
    if (!img) return null;
    const grid = img.parentElement;
    if (!grid) return null;
    const imgs = Array.from(grid.querySelectorAll('img'));
    const idx = imgs.indexOf(img);
    return idx === 1 ? 'after' : 'before';
  }

  function extractReviewData(reviewEl, clickedEl) {
    const name = (reviewEl.querySelector('.review__name, .review-card__name')?.textContent || '').trim();
    const role = (reviewEl.querySelector('.review__role, .review-card__role')?.textContent || '').trim();
    const text = (reviewEl.querySelector('.review__text, .review-card__text')?.textContent || '').trim();

    let caseBeforeUrl = (reviewEl.dataset.caseBefore || '').trim();
    let caseAfterUrl = (reviewEl.dataset.caseAfter || '').trim();
    let caseNote = (reviewEl.dataset.caseNote || '').trim();

    if (!caseBeforeUrl || !caseAfterUrl) {
      const imgs = reviewEl.querySelectorAll('.review__case-grid img, .review-card__case-grid img');
      if (imgs && imgs.length >= 2) {
        caseBeforeUrl = caseBeforeUrl || (imgs[0].getAttribute('src') || '').trim();
        caseAfterUrl = caseAfterUrl || (imgs[1].getAttribute('src') || '').trim();
      }
    }

    if (!caseNote) {
      const noteEl = reviewEl.querySelector('.review__case-note, .review-card__case-note');
      if (noteEl) caseNote = (noteEl.textContent || '').trim();
    }

    const initialCaseTab = pickInitialCaseTab(clickedEl, reviewEl);

    return { name, role, text, caseBeforeUrl, caseAfterUrl, caseNote, initialCaseTab };
  }

  function ensureMoreButtons(root) {
    const scope = root || document;
    const reviews = $all(REVIEW_SELECTOR, scope);

    reviews.forEach((review) => {
      // already has a trigger?
      if (review.querySelector('.review__more, [data-review-more], .review-card__more')) return;

      const textEl = review.querySelector('.review__text, .review-card__text');
      if (!textEl) return;

      const text = (textEl.textContent || '').trim();
      if (text.length < 220) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'review__more';
      btn.setAttribute('data-review-more', '1');
      btn.textContent = 'Читать полностью';

      textEl.insertAdjacentElement('afterend', btn);
    });
  }

  // Capture click early to prevent other scripts from toggling "expanded" states.
  document.addEventListener(
    'click',
    (e) => {
      const trigger = e.target.closest(TRIGGER_SELECTOR);
      if (!trigger) return;

      const reviewEl = trigger.closest(REVIEW_SELECTOR);
      if (!reviewEl) return;

      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

      const data = extractReviewData(reviewEl, trigger);
      openDialog(data);
    },
    true
  );

  // Also stop pointerdown so no other handlers run before click (mobile safe)
  document.addEventListener(
    'pointerdown',
    (e) => {
      const trigger = e.target.closest(TRIGGER_SELECTOR);
      if (!trigger) return;
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    },
    true
  );

  function initAutoButtons() {
    ensureMoreButtons();

    const grid = document.getElementById('reviewsGrid');
    if (!grid || typeof MutationObserver !== 'function') return;

    const obs = new MutationObserver(() => ensureMoreButtons(grid));
    obs.observe(grid, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoButtons);
  } else {
    initAutoButtons();
  }
})();
