
/* === reviews-more-modal.js === */
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
              <div id="reviewDialogCaseActions" class="review-dialog__case-actions" hidden>
                <button type="button" class="review-dialog__case-link" data-open-case="1">Открыть кейс в планах</button>
              </div>
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

    // Open case (scroll to plans)
    if (!dialogEl.__openCaseBound) {
      dialogEl.__openCaseBound = true;
      dialogEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-open-case]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        openCaseFromDialog();
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

  function setCaseData(beforeUrl, afterUrl, note, initialTab, caseId) {
    const root = ensureDialog();
    const wrap = root.querySelector('#reviewDialogCase');
    const img = root.querySelector('#reviewDialogCaseImg');
    const noteEl = root.querySelector('#reviewDialogCaseNote');
    const beforeTab = root.querySelector('[data-review-case-tab="before"]');
    const afterTab = root.querySelector('[data-review-case-tab="after"]');
    const actionsEl = root.querySelector('#reviewDialogCaseActions');

    if (!wrap || !img || !beforeTab || !afterTab) return;

    const before = (beforeUrl || '').trim();
    const after = (afterUrl || '').trim();
    const hasCase = Boolean(before && after);

    wrap.hidden = !hasCase;
    wrap.dataset.before = before;
    wrap.dataset.after = after;
    wrap.dataset.caseId = (caseId || '').trim();

    if (noteEl) {
      noteEl.textContent = (note || '').trim();
      noteEl.style.display = noteEl.textContent ? 'block' : 'none';
    }

    if (actionsEl) {
      actionsEl.hidden = !(hasCase && caseId);
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
    setCaseData(data.caseBeforeUrl, data.caseAfterUrl, data.caseNote, data.initialCaseTab, data.caseId);
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

  function openCaseFromDialog() {
    const root = ensureDialog();
    const wrap = root.querySelector('#reviewDialogCase');
    const caseId = (wrap && wrap.dataset && wrap.dataset.caseId) ? String(wrap.dataset.caseId).trim() : '';
    if (!caseId) return;

    closeDialog();

    const section = document.getElementById('cases');
    if (section && typeof section.scrollIntoView === 'function') {
      try {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (_) {
        section.scrollIntoView();
      }
    }

    if (typeof window.ByplanCasesOpen === 'function') {
      window.ByplanCasesOpen(caseId);
    } else {
      window.__byplanPendingCaseId = caseId;
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
    const caseId = (reviewEl.dataset.caseId || '').trim();

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

    return { name, role, text, caseBeforeUrl, caseAfterUrl, caseNote, initialCaseTab, caseId };
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
;
/* === reviews-carousel.js === */
/**
 * Reviews Carousel (BYPLAN)
 * - превращает список отзывов (#reviewsGrid) в горизонтальную карусель со снапом
 * - добавляет навигацию (prev/next), точки, счетчик
 * - "Читать полностью" открывает модальное окно
 *
 * Работает даже если отзывы подгружаются асинхронно (MutationObserver).
 */
(function () {
  "use strict";

  const ROOT_ID = "reviewsGrid";

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function normalizeText(s) {
    return (s || "").replace(/\r/g, "").trim();
  }

  function extractReviews(container) {
    // 1) уже в формате review-card__*
    const cards = qsa(".review-card", container);
    if (cards.length) {
      return cards.map((card) => ({
        name: normalizeText(qs(".review-card__name", card)?.textContent),
        role: normalizeText(qs(".review-card__role", card)?.textContent),
        text: normalizeText(qs(".review-card__text", card)?.textContent),
      })).filter(r => r.name || r.text);
    }

    // 2) старый формат article.review (из app.js v1)
    const old = qsa("article.review", container);
    if (old.length) {
      return old.map((el) => ({
        name: normalizeText(qs(".review__name", el)?.textContent),
        role: normalizeText(qs(".review__role", el)?.textContent),
        text: normalizeText(qs(".review__text", el)?.textContent),
      })).filter(r => r.name || r.text);
    }

    // 3) fallback: любые прямые дети (плохой, но лучше чем ничего)
    const direct = Array.from(container.children).filter((el) => el.textContent && el.textContent.trim());
    if (direct.length) {
      return direct.map((el) => {
        const lines = normalizeText(el.textContent).split("\n").map(s => s.trim()).filter(Boolean);
        const name = lines[0] || "";
        const role = lines[1] || "";
        const text = lines.slice(2).join("\n");
        return { name, role, text };
      }).filter(r => r.name || r.text);
    }

    return [];
  }

  function ensureModal() {
    let modal = qs("#reviewModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "review-modal";
    modal.id = "reviewModal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Отзыв полностью");

    modal.innerHTML = `
      <div class="review-modal__panel" role="document">
        <button class="review-modal__close" type="button" aria-label="Закрыть">×</button>
        <div class="review-modal__name" id="reviewModalName"></div>
        <div class="review-modal__role" id="reviewModalRole"></div>
        <div class="review-modal__text" id="reviewModalText"></div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = qs(".review-modal__close", modal);
    function close() {
      modal.classList.remove("is-open");
      document.documentElement.classList.remove("modal-open");
      document.body.classList.remove("modal-open");
    }

    closeBtn.addEventListener("click", close);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("is-open")) close();
    });

    // expose close for internal use
    modal.__close = close;
    return modal;
  }

  function openModal(review) {
    const modal = ensureModal();
    qs("#reviewModalName", modal).textContent = review.name || "";
    qs("#reviewModalRole", modal).textContent = review.role || "";
    qs("#reviewModalText", modal).textContent = review.text || "";
    modal.classList.add("is-open");
    document.documentElement.classList.add("modal-open");
    document.body.classList.add("modal-open");
  }

  function buildReviewCard(review) {
    const card = document.createElement("article");
    card.className = "review-card";
    card.setAttribute("tabindex", "-1");

    const meta = document.createElement("div");
    meta.className = "review-card__meta";

    const name = document.createElement("div");
    name.className = "review-card__name";
    name.textContent = review.name || "";

    const role = document.createElement("div");
    role.className = "review-card__role";
    role.textContent = review.role || "";

    meta.appendChild(name);
    if (review.role) meta.appendChild(role);

    const text = document.createElement("div");
    text.className = "review-card__text";
    text.textContent = review.text || "";

    const more = document.createElement("button");
    more.className = "review-card__more";
    more.type = "button";
    more.textContent = "Читать полностью";

    // Показываем кнопку только если текст реально длинный
    const long = (review.text || "").length > 260 || (review.text || "").split("\n").length > 5;
    if (long) {
      text.classList.add("review-card__text--clamp");
      more.addEventListener("click", () => openModal(review));
    } else {
      more.style.display = "none";
    }

    card.appendChild(meta);
    card.appendChild(text);
    card.appendChild(more);

    return card;
  }

  function initCarousel(container) {
    if (!container || container.dataset.carouselReady === "1") return;

    const reviews = extractReviews(container);
    if (!reviews.length) return;

    // Перерисовываем в правильную структуру под CSS (reviews-slider.css)
    container.innerHTML = "";
    container.classList.remove("grid", "reviews");
    container.classList.add("reviews-carousel");
    container.dataset.carouselReady = "1";

    const viewport = document.createElement("div");
    viewport.className = "reviews-carousel__viewport";
    viewport.setAttribute("tabindex", "0");

    const track = document.createElement("div");
    track.className = "reviews-carousel__track";

    const cards = reviews.map(buildReviewCard);
    cards.forEach((c) => track.appendChild(c));
    viewport.appendChild(track);

    const prev = document.createElement("button");
    prev.className = "reviews-carousel__nav reviews-carousel__nav--prev";
    prev.type = "button";
    prev.setAttribute("aria-label", "Предыдущий отзыв");
    prev.textContent = "‹";

    const next = document.createElement("button");
    next.className = "reviews-carousel__nav reviews-carousel__nav--next";
    next.type = "button";
    next.setAttribute("aria-label", "Следующий отзыв");
    next.textContent = "›";

    const dotsWrap = document.createElement("div");
    dotsWrap.className = "reviews-carousel__dots";

    const dots = reviews.map((_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "reviews-carousel__dot";
      b.setAttribute("aria-label", `Показать отзыв ${i + 1}`);
      dotsWrap.appendChild(b);
      return b;
    });

    const count = document.createElement("div");
    count.className = "reviews-carousel__count";

    container.appendChild(prev);
    container.appendChild(next);
    container.appendChild(viewport);
    container.appendChild(dotsWrap);
    container.appendChild(count);

    // --- FIX: allow the LAST review to snap into view (important for odd counts)
    // Without a trailing spacer, the last card cannot align to the left edge,
    // so navigation "stops" at the previous one (e.g. 6/7).
    const tail = document.createElement("div");
    tail.className = "reviews-carousel__tail";
    tail.setAttribute("aria-hidden", "true");
    tail.style.pointerEvents = "none";
    tail.style.flex = "0 0 0px";
    track.appendChild(tail);

    function updateTail() {
      const firstCard = qs(".review-card", track);
      if (!firstCard) return;

      const cs = getComputedStyle(viewport);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const trackW = viewport.clientWidth - padL - padR;
      const cardW = firstCard.getBoundingClientRect().width;

      const extra = Math.max(0, trackW - cardW);
      tail.style.flex = `0 0 ${Math.ceil(extra)}px`;
    }


    // --- поведение ---
    let raf = 0;

    function getIndexByScroll() {
      const x = viewport.scrollLeft;
      const cardEls = qsa(".review-card", track);
      if (!cardEls.length) return 0;

      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < cardEls.length; i++) {
        const dist = Math.abs(cardEls[i].offsetLeft - x);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      return best;
    }

    function scrollToIndex(i) {
      const cardEls = qsa(".review-card", track);
      if (!cardEls.length) return;
      const idx = Math.max(0, Math.min(i, cardEls.length - 1));
      viewport.scrollTo({ left: cardEls[idx].offsetLeft, behavior: "smooth" });
    }

    function updateUI() {
      const idx = getIndexByScroll();
      const total = reviews.length;

      count.textContent = `${idx + 1} / ${total}`;

      dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));

      const atStart = idx <= 0;
      const atEnd = idx >= total - 1;

      prev.classList.toggle("is-disabled", atStart);
      prev.disabled = atStart;

      next.classList.toggle("is-disabled", atEnd);
      next.disabled = atEnd;
    }

    prev.addEventListener("click", () => scrollToIndex(getIndexByScroll() - 1));
    next.addEventListener("click", () => scrollToIndex(getIndexByScroll() + 1));

    dots.forEach((d, i) => d.addEventListener("click", () => scrollToIndex(i)));

    viewport.addEventListener("scroll", () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateUI);
    });

    window.addEventListener("resize", () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { updateTail(); updateUI(); });
    });

    // initial
    updateTail();
    updateUI();
  }

  function bootstrap() {
    const container = document.getElementById(ROOT_ID);
    if (!container) return;

    // пробуем сразу
    initCarousel(container);

    // если отзывы подгрузятся позже — отловим
    const obs = new MutationObserver(() => {
      if (container.dataset.carouselReady === "1") return;
      initCarousel(container);
    });
    obs.observe(container, { childList: true, subtree: true });

    // страховка: через 2 секунды попробовать еще раз (на случай если DOM дергается)
    setTimeout(() => {
      if (container.dataset.carouselReady !== "1") initCarousel(container);
    }, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();;
/* === anketa-modal.js === */

/* ============================================================
   BYPLAN — anketa-modal.js (v3)
   Module: Анкета (модальное окно + пошаговая форма)
   ============================================================ */

(function () {
  "use strict";

  const OPEN_HASH = "#anketa";
  const STORAGE_KEY = "byplan_anketa_draft_v3";
  const FORM_VERSION = "byplan-anketa-v3";
  const DEFAULT_SUBMIT_URL = "https://n8n2.waimaozi.com/webhook/byplan-anketa";

  // ---- Utils ----
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escAttr(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function nowIso() {
    try { return new Date().toISOString(); } catch { return ""; }
  }

  function safeParseJson(str) {
    try { return JSON.parse(str); } catch { return null; }
  }

  function isReady() {
    return document.readyState === "complete" || document.readyState === "interactive";
  }

  // ---- KV from Google Sheets ----
  async function loadSiteKV() {
    const cfg = window.SITE_CONFIG;
    const sheetId = cfg && cfg.SHEET_ID;
    const tab = (cfg && cfg.TABS && cfg.TABS.site) ? cfg.TABS.site : "site";
    if (!sheetId || !window.Sheets || typeof window.Sheets.fetchTab !== "function") return {};

    try {
      const rows = await window.Sheets.fetchTab(sheetId, tab);
      const kv = {};
      (rows || []).forEach(r => {
        const k = String(r.key || "").trim();
        if (!k) return;
        kv[k] = (r.value ?? "");
      });
      return kv;
    } catch (e) {
      console.warn("[anketa] cannot load site KV:", e);
      return {};
    }
  }

  // ---- Checkbox group builder ----
  function checkboxGroup(section, groupId, items, isRadio) {
    const type = isRadio ? "radio" : "checkbox";
    const name = `${section}_${groupId}`;
    return items.map(item => {
      const id = `${name}_${item.value}`;
      const isOther = item.value === "other";
      const otherInputName = isOther ? `${name}_other_text` : null;
      return `
        <div class="anketa-check">
          <input type="${type}" id="${escAttr(id)}" name="${escAttr(name)}" value="${escAttr(item.value)}"${isRadio && item.default ? " checked" : ""}>
          <label for="${escAttr(id)}">${escAttr(item.label)}</label>
        </div>
        ${isOther ? `<input type="text" class="anketa-other-input" name="${escAttr(otherInputName)}" placeholder="">` : ""}
      `;
    }).join("");
  }

  function group(title, html) {
    return `<div class="anketa-block"><div class="anketa-block__title">${title}</div><div class="anketa-checkboxes">${html}</div></div>`;
  }

  function textInput(name, label, placeholder) {
    return `<label class="anketa-field"><span class="anketa-label">${label}</span><input class="anketa-input" type="text" name="${escAttr(name)}" placeholder="${escAttr(placeholder || "")}"></label>`;
  }

  function textareaInput(name, label) {
    return `<label class="anketa-field"><span class="anketa-label">${label}</span><textarea class="anketa-textarea" name="${escAttr(name)}" rows="3"></textarea></label>`;
  }

  // ---- buildSteps ----
  function buildSteps() {
    return `
      <!-- STEP 0: Контакты и семья -->
      <section class="anketa-step is-active" data-step="0" aria-labelledby="anketaStep0">
        <h3 id="anketaStep0">Контакты и семья</h3>
        <p class="anketa-hint">Коротко, в свободной форме.</p>
        <div class="anketa-grid">
          <label class="anketa-field">
            <span class="anketa-label">Ваше имя<span class="anketa-req">*</span></span>
            <input class="anketa-input" type="text" name="contact_name" autocomplete="name" required>
          </label>
          <label class="anketa-field">
            <span class="anketa-label">Контакт (телефон или Telegram)<span class="anketa-req">*</span></span>
            <input class="anketa-input" type="text" name="contact_value" placeholder="+7… или @username" required>
          </label>
        </div>
        <label class="anketa-field">
          <span class="anketa-label">Состав семьи (кто живёт постоянно / временно)</span>
          <textarea class="anketa-textarea" name="family_composition" placeholder="Например: 2 взрослых, 1 ребёнок, иногда бабушка."></textarea>
        </label>
      </section>

      <!-- STEP 1: Спальня -->
      <section class="anketa-step" data-step="1" aria-labelledby="anketaStep1">
        <h3 id="anketaStep1">Спальня</h3>

        ${group("Спальное место",
          checkboxGroup("bedroom", "bed_size", [
            {value:"140x200", label:"Кровать 140×200 см"},
            {value:"160x200", label:"Кровать 160×200 см"},
            {value:"180x200", label:"Кровать 180×200 см"},
            {value:"200x200", label:"Кровать 200×200 см"},
            {value:"other", label:"Другой размер: __________"}
          ], true)
        )}

        ${group("Прикроватная зона",
          checkboxGroup("bedroom", "nightstand", [
            {value:"two", label:"2 прикроватные тумбочки"},
            {value:"one", label:"1 прикроватная тумбочка"},
            {value:"none", label:"Без прикроватных тумбочек"},
            {value:"shelves", label:"Подвесные полки вместо тумбочек"}
          ], true)
        )}

        ${group("Хранение одежды",
          checkboxGroup("bedroom", "wardrobe", [
            {value:"up_to_180", label:"Шкаф до 180 см"},
            {value:"180_240", label:"Шкаф 180–240 см"},
            {value:"over_240", label:"Шкаф более 240 см"},
            {value:"corner", label:"Угловой шкаф"},
            {value:"dressing_room", label:"Гардеробная комната"},
            {value:"dresser", label:"Комод"},
            {value:"tall_cabinet", label:"Высокий пенал"},
            {value:"under_bed", label:"Дополнительное хранение под кроватью"}
          ], false)
        )}

        ${group("Рабочая зона",
          checkboxGroup("bedroom", "work_zone", [
            {value:"desk", label:"Рабочий стол"},
            {value:"computer", label:"Компьютер"},
            {value:"printer", label:"Принтер"},
            {value:"bookcase", label:"Книжный шкаф/стеллаж"}
          ], false)
        )}

        ${group("Зона ухода за собой",
          checkboxGroup("bedroom", "vanity_zone", [
            {value:"vanity_table", label:"Туалетный столик"},
            {value:"full_mirror", label:"Большое зеркало в полный рост"},
            {value:"mirror_light", label:"Зеркало с подсветкой"},
            {value:"cosmetics_storage", label:"Место для хранения косметики"}
          ], false)
        )}

        ${group("Зона отдыха",
          checkboxGroup("bedroom", "relax_zone", [
            {value:"tv", label:"Телевизор"},
            {value:"projector", label:"Проектор"},
            {value:"armchair", label:"Кресло"},
            {value:"pouf", label:"Пуф"},
            {value:"bench", label:"Банкетка у кровати"},
            {value:"small_sofa", label:"Небольшой диван"}
          ], false)
        )}

        ${group("Дополнительные пожелания",
          checkboxGroup("bedroom", "extras", [
            {value:"baby_crib", label:"Детская кроватка в спальне родителей"},
            {value:"pet_bed", label:"Лежанка для питомца"},
            {value:"safe", label:"Домашний сейф"},
            {value:"fireplace", label:"Камин (электрический)"},
            {value:"music", label:"Музыкальная система"},
            {value:"sports", label:"Спортивный уголок"},
            {value:"other", label:"Другое: __________"}
          ], false)
        )}

        ${textareaInput("bedroom_must_fit", "Что обязательно должно поместиться?")}
        ${textareaInput("bedroom_must_not", "Что категорически не нужно?")}

        ${group("Какие действия вы чаще всего выполняете в спальне?",
          checkboxGroup("bedroom", "activities", [
            {value:"sleep_only", label:"Только сон"},
            {value:"computer_work", label:"Работа за компьютером"},
            {value:"tv", label:"Просмотр ТВ"},
            {value:"reading", label:"Чтение"},
            {value:"grooming", label:"Уход за собой/макияж"},
            {value:"wardrobe_main", label:"Хранение основной части гардероба"},
            {value:"other", label:"Другое: __________"}
          ], false)
        )}
      </section>

      <!-- STEP 2: Кухня -->
      <section class="anketa-step" data-step="2" aria-labelledby="anketaStep2">
        <h3 id="anketaStep2">Кухня</h3>

        ${group("Формат кухни",
          checkboxGroup("kitchen", "layout", [
            {value:"linear", label:"Линейная"},
            {value:"corner", label:"Угловая (Г-образная)"},
            {value:"u_shape", label:"П-образная"},
            {value:"island", label:"С островом"},
            {value:"peninsula", label:"С полуостровом"},
            {value:"kitchen_living", label:"Кухня-гостиная"},
            {value:"separate", label:"Отдельная кухня"}
          ], false)
        )}

        <div class="anketa-block"><div class="anketa-block__title">Варочная зона</div>
          ${group("Варочная поверхность",
            checkboxGroup("kitchen", "hob", [
              {value:"2", label:"2 конфорки"},
              {value:"3", label:"3 конфорки"},
              {value:"4", label:"4 конфорки"},
              {value:"5plus", label:"5 конфорок и более"}
            ], false)
          )}
          <div class="anketa-block"><div class="anketa-block__title">Духовой шкаф и микроволновая печь</div>
            ${group("Духовой шкаф",
              checkboxGroup("kitchen", "oven", [
                {value:"none", label:"Не нужен"},
                {value:"under_hob", label:"Под варочной поверхностью"},
                {value:"column", label:"В колонне"}
              ], true)
            )}
            ${group("Микроволновая печь",
              checkboxGroup("kitchen", "microwave", [
                {value:"none", label:"Не нужна"},
                {value:"countertop", label:"На столешнице"},
                {value:"upper_cabinet", label:"Встроенная в верхний ряд шкафов"},
                {value:"column", label:"Встроенная в колонне"}
              ], false)
            )}
          </div>
        </div>

        <div class="anketa-block"><div class="anketa-block__title">Холодильное оборудование</div>
          ${group("Холодильник",
            checkboxGroup("kitchen", "fridge", [
              {value:"freestanding_60", label:"Отдельностоящий 60 см"},
              {value:"builtin_60", label:"Встроенный 60 см"},
              {value:"wide_70_90", label:"Широкий холодильник 70–90 см"},
              {value:"side_by_side", label:"Side-by-Side"},
              {value:"separate_freezer", label:"Отдельный холодильник и морозильник"}
            ], false)
          )}
          ${group("Морозильная камера",
            checkboxGroup("kitchen", "freezer", [
              {value:"none", label:"Не нужна"},
              {value:"in_fridge", label:"В составе холодильника"},
              {value:"separate", label:"Отдельная морозильная камера"}
            ], false)
          )}
        </div>

        <div class="anketa-block"><div class="anketa-block__title">Моечная зона</div>
          ${group("Мойка",
            checkboxGroup("kitchen", "sink", [
              {value:"single", label:"Одна чаша"},
              {value:"half_double", label:"Полуторная чаша"},
              {value:"double", label:"Две чаши"}
            ], false)
          )}
          ${group("Посудомоечная машина",
            checkboxGroup("kitchen", "dishwasher", [
              {value:"none", label:"Не нужна"},
              {value:"45", label:"45 см"},
              {value:"60", label:"60 см"}
            ], false)
          )}
          ${group("Дополнительно",
            checkboxGroup("kitchen", "sink_extras", [
              {value:"waste_disposal", label:"Измельчитель отходов"},
              {value:"water_filter", label:"Фильтр для питьевой воды"}
            ], false)
          )}
        </div>

        <div class="anketa-block"><div class="anketa-block__title">Хранение</div>
          ${group("Продукты",
            checkboxGroup("kitchen", "food_storage", [
              {value:"pantry", label:"Нужна кладовая"},
              {value:"tall_cabinet", label:"Высокий хозяйственный шкаф"},
              {value:"bulk_staples", label:"Большой запас бакалеи"},
              {value:"cleaning_storage", label:"Хранение бытовой химии"}
            ], false)
          )}
          ${group("Посуда",
            checkboxGroup("kitchen", "dishes_storage", [
              {value:"everyday", label:"Повседневный комплект"},
              {value:"festive", label:"Праздничный сервиз"},
              {value:"glasses", label:"Коллекция бокалов"},
              {value:"pots_pans", label:"Большое количество кастрюль и сковород"}
            ], false)
          )}
          ${group("Мелкая техника, которую необходимо хранить",
            checkboxGroup("kitchen", "small_appliances_storage", [
              {value:"coffee_machine", label:"Кофемашина"},
              {value:"coffee_grinder", label:"Кофемолка"},
              {value:"kettle", label:"Чайник"},
              {value:"toaster", label:"Тостер"},
              {value:"blender", label:"Блендер"},
              {value:"mixer", label:"Планетарный миксер"},
              {value:"multicooker", label:"Мультиварка"},
              {value:"juicer", label:"Соковыжималка"},
              {value:"air_fryer", label:"Аэрогриль"},
              {value:"other", label:"Другое: ___________________"}
            ], false)
          )}
          ${group("Какая техника будет постоянно стоять на столешнице?",
            checkboxGroup("kitchen", "countertop_appliances", [
              {value:"coffee_machine", label:"Кофемашина"},
              {value:"kettle", label:"Чайник"},
              {value:"toaster", label:"Тостер"},
              {value:"mixer", label:"Планетарный миксер"},
              {value:"blender", label:"Блендер"},
              {value:"other", label:"Другое: ___________________"}
            ], false)
          )}
        </div>

        <div class="anketa-block"><div class="anketa-block__title">Обеденная зона</div>
          ${group("Количество человек, проживающих в квартире",
            checkboxGroup("kitchen", "residents_count", [
              {value:"1_2", label:"1–2 человека"},
              {value:"3_4", label:"3–4 человека"},
              {value:"5_6", label:"5–6 человек"},
              {value:"6plus", label:"Более 6 человек"}
            ], false)
          )}
          ${group("Стол",
            checkboxGroup("kitchen", "dining_table", [
              {value:"round", label:"Круглый"},
              {value:"oval", label:"Овальный"},
              {value:"rectangular", label:"Прямоугольный"},
              {value:"extendable", label:"Раздвижной"},
              {value:"bar_counter", label:"Барная стойка вместо стола"}
            ], false)
          )}
          ${group("Количество посадочных мест ежедневно",
            checkboxGroup("kitchen", "daily_seats", [
              {value:"2", label:"2"},
              {value:"4", label:"4"},
              {value:"6", label:"6"},
              {value:"8plus", label:"8 и более"}
            ], false)
          )}
          ${group("Максимальное количество гостей",
            checkboxGroup("kitchen", "max_guests", [
              {value:"up_to_4", label:"До 4 человек"},
              {value:"up_to_8", label:"До 8 человек"},
              {value:"up_to_12", label:"До 12 человек"},
              {value:"12plus", label:"Более 12 человек"}
            ], false)
          )}
          ${group("Дополнительные пожелания",
            checkboxGroup("kitchen", "dining_extras", [
              {value:"tv", label:"Телевизор"},
              {value:"wine_cabinet", label:"Винный шкаф"},
              {value:"sofa", label:"Диван"},
              {value:"workplace", label:"Рабочее место"},
              {value:"pet_feeding", label:"Место для кормления питомца"},
              {value:"high_chair", label:"Детский стульчик"}
            ], false)
          )}
        </div>

        <div class="anketa-block"><div class="anketa-block__title">Привычки использования кухни</div>
          ${group("Как часто вы готовите?",
            checkboxGroup("kitchen", "cooking_freq", [
              {value:"rarely", label:"Практически не готовлю"},
              {value:"1_2_week", label:"1–2 раза в неделю"},
              {value:"daily", label:"Каждый день"},
              {value:"multiple_daily", label:"Несколько раз в день"}
            ], false)
          )}
          ${group("Что для вас важнее?",
            checkboxGroup("kitchen", "priority", [
              {value:"max_storage", label:"Максимум хранения"},
              {value:"work_surface", label:"Большая рабочая поверхность"},
              {value:"dining_zone", label:"Просторная обеденная зона"},
              {value:"compact", label:"Максимально компактная кухня"},
              {value:"pro_appliances", label:"Профессиональная техника"}
            ], false)
          )}
        </div>

        ${textareaInput("kitchen_must_fit", "Обязательно должно поместиться")}
        ${textareaInput("kitchen_must_not", "Чего категорически не должно быть")}
        ${textareaInput("kitchen_comments", "Дополнительные комментарии и пожелания")}
      </section>

      <!-- STEP 3: Детская -->
      <section class="anketa-step" data-step="3" aria-labelledby="anketaStep3">
        <h3 id="anketaStep3">Детская комната</h3>

        <div class="anketa-block">
          <div class="anketa-block__title">Сколько детских комнат планируется?</div>
          <div class="anketa-checkboxes">
            <div class="anketa-check">
              <input type="radio" id="children_room_none" name="children_room_count" value="none" checked>
              <label for="children_room_none">Нет детской</label>
            </div>
            <div class="anketa-check">
              <input type="radio" id="children_room_1" name="children_room_count" value="1">
              <label for="children_room_1">1 ребенок</label>
            </div>
            <div class="anketa-check">
              <input type="radio" id="children_room_2" name="children_room_count" value="2">
              <label for="children_room_2">2 ребенка</label>
            </div>
          </div>
        </div>

        <div id="childrenNone">
          <p class="anketa-hint">Детская не планируется.</p>
        </div>

        <div id="childrenGroup1" style="display:none;">
          <h4>ДЕТСКАЯ КОМНАТА (1 РЕБЕНОК)</h4>

          ${textInput("child1_age", "Возраст ребенка", "")}

          ${group("Спальное место",
            checkboxGroup("child1", "bed", [
              {value:"80x160", label:"Кровать 80×160 см"},
              {value:"90x200", label:"Кровать 90×200 см"},
              {value:"120x200", label:"Кровать 120×200 см"},
              {value:"loft", label:"Кровать-чердак"},
              {value:"sofa_bed", label:"Диван-кровать"},
              {value:"other", label:"Другой вариант: ___________________"}
            ], false)
          )}

          ${group("Рабочая зона",
            checkboxGroup("child1", "work_zone", [
              {value:"none", label:"Не требуется"},
              {value:"one", label:"Требуется 1 рабочее место"}
            ], false)
          )}

          ${group("Хранение одежды",
            checkboxGroup("child1", "wardrobe", [
              {value:"up_to_120", label:"Шкаф до 120 см"},
              {value:"120_180", label:"Шкаф 120–180 см"},
              {value:"over_180", label:"Шкаф более 180 см"},
              {value:"dressing_room", label:"Гардеробная"}
            ], false)
          )}

          ${group("Дополнительное хранение",
            checkboxGroup("child1", "extra_storage", [
              {value:"dresser", label:"Комод"},
              {value:"shelving", label:"Стеллаж"},
              {value:"toys", label:"Хранение игрушек"},
              {value:"sports", label:"Хранение спортивного инвентаря"},
              {value:"collections", label:"Хранение коллекций/хобби"}
            ], false)
          )}

          ${group("Дополнительные функции комнаты",
            checkboxGroup("child1", "room_functions", [
              {value:"sports_corner", label:"Спортивный уголок"},
              {value:"music", label:"Музыкальный инструмент"},
              {value:"creative", label:"Творческая зона (рисование, лепка и т.д.)"},
              {value:"guest_bed", label:"Дополнительное спальное место для гостей"}
            ], false)
          )}

          ${textareaInput("child1_must_fit", "Что обязательно должно поместиться?")}

          <h5>Вопросы планировщика</h5>

          ${group("Пол ребенка",
            checkboxGroup("child1", "gender", [
              {value:"boy", label:"Мальчик"},
              {value:"girl", label:"Девочка"}
            ], true)
          )}

          ${group("Нужна ли возможность трансформации комнаты через 3–5 лет?",
            checkboxGroup("child1", "transform", [
              {value:"yes", label:"Да"},
              {value:"no", label:"Нет"}
            ], true)
          )}

          ${group("Что важнее?",
            checkboxGroup("child1", "priority", [
              {value:"play", label:"Больше места для игр"},
              {value:"storage", label:"Больше хранения"},
              {value:"open", label:"Больше свободного пространства"},
              {value:"work", label:"Больше рабочих мест"}
            ], false)
          )}
        </div>

        <div id="childrenGroup2" style="display:none;">
          <h4>ДЕТСКАЯ КОМНАТА (2 РЕБЕНКА)</h4>

          ${textInput("child1_age_2", "Возраст ребенка №1", "")}
          ${textInput("child2_age", "Возраст ребенка №2", "")}

          ${group("Спальные места",
            checkboxGroup("child2", "beds", [
              {value:"two_80x160", label:"Две кровати 80×160 см"},
              {value:"two_90x200", label:"Две кровати 90×200 см"},
              {value:"two_120x200", label:"Две кровати 120×200 см"},
              {value:"bunk", label:"Двухъярусная кровать"},
              {value:"loft_plus", label:"Кровать-чердак + кровать"},
              {value:"other", label:"Другой вариант: ___________________"}
            ], false)
          )}

          ${group("Рабочая зона",
            checkboxGroup("child2", "work_zone", [
              {value:"none", label:"Не требуется"},
              {value:"one", label:"1 рабочее место"},
              {value:"two", label:"2 рабочих места"},
              {value:"shared", label:"Один общий стол на двоих"}
            ], false)
          )}

          ${group("Хранение одежды",
            checkboxGroup("child2", "wardrobe", [
              {value:"shared", label:"Один общий шкаф"},
              {value:"separate", label:"Два отдельных шкафа"},
              {value:"dressing_room", label:"Гардеробная"}
            ], false)
          )}

          ${group("Дополнительное хранение",
            checkboxGroup("child2", "extra_storage", [
              {value:"shared_dresser", label:"Общий комод"},
              {value:"separate_storage", label:"Отдельное хранение для каждого ребенка"},
              {value:"toys", label:"Хранение игрушек"},
              {value:"sports", label:"Хранение спортивного инвентаря"},
              {value:"collections", label:"Хранение коллекций/хобби"}
            ], false)
          )}

          ${group("Дополнительные функции комнаты",
            checkboxGroup("child2", "room_functions", [
              {value:"sports_corner", label:"Спортивный уголок"},
              {value:"music", label:"Музыкальный инструмент"},
              {value:"creative", label:"Творческая зона"},
              {value:"guest_bed", label:"Дополнительное спальное место для гостей"}
            ], false)
          )}

          ${group("Планируется ли разделение детей по разным комнатам в будущем?",
            checkboxGroup("child2", "separate_future", [
              {value:"yes", label:"Да"},
              {value:"no", label:"Нет"},
              {value:"undecided", label:"Пока не решили"}
            ], false)
          )}

          ${textareaInput("child2_must_fit", "Что обязательно должно поместиться?")}

          <h5>Вопросы планировщика</h5>

          ${group("Пол ребенка №1",
            checkboxGroup("child1", "gender", [
              {value:"boy", label:"Мальчик"},
              {value:"girl", label:"Девочка"}
            ], true)
          )}

          ${group("Пол ребенка №2",
            checkboxGroup("child2", "gender", [
              {value:"boy", label:"Мальчик"},
              {value:"girl", label:"Девочка"}
            ], true)
          )}

          ${group("Нужна ли возможность трансформации комнаты через 3–5 лет?",
            checkboxGroup("child2", "transform", [
              {value:"yes", label:"Да"},
              {value:"no", label:"Нет"}
            ], true)
          )}

          ${group("Что важнее?",
            checkboxGroup("child2", "priority", [
              {value:"play", label:"Больше места для игр"},
              {value:"storage", label:"Больше хранения"},
              {value:"open", label:"Больше свободного пространства"},
              {value:"work", label:"Больше рабочих мест"}
            ], false)
          )}
        </div>
      </section>

      <!-- STEP 4: Ванная -->
      <section class="anketa-step" data-step="4" aria-labelledby="anketaStep4">
        <h3 id="anketaStep4">Ванная комната</h3>

        ${group("Пользователи ванной комнаты",
          checkboxGroup("bathroom", "users", [
            {value:"adults", label:"Взрослые"},
            {value:"adults_children", label:"Взрослые и дети"},
            {value:"children_only", label:"Только дети"},
            {value:"guest", label:"Гостевой санузел"}
          ], false)
        )}

        ${group("Душ или ванна",
          checkboxGroup("bathroom", "shower_bath", [
            {value:"shower_only", label:"Только душевая"},
            {value:"bath_only", label:"Только ванна"},
            {value:"both", label:"И ванна, и душевая"}
          ], true)
        )}

        ${group("Размер ванны",
          checkboxGroup("bathroom", "bath_size", [
            {value:"up_to_170", label:"До 170 см"},
            {value:"170_180", label:"170–180 см"},
            {value:"over_180", label:"Более 180 см"}
          ], false)
        )}

        ${group("Душевая",
          checkboxGroup("bathroom", "shower_type", [
            {value:"builtin", label:"В строительном исполнении"},
            {value:"tray", label:"Душевой поддон"},
            {value:"large_100", label:"Размер более 100×100 см"}
          ], false)
        )}

        ${group("Умывальник",
          checkboxGroup("bathroom", "sink_count", [
            {value:"one", label:"Один умывальник"},
            {value:"two", label:"Два умывальника"}
          ], true)
        )}

        ${group("Унитаз",
          checkboxGroup("bathroom", "toilet", [
            {value:"wall_hung", label:"Подвесной"},
            {value:"floor", label:"Напольный"}
          ], false)
        )}

        ${group("Биде",
          checkboxGroup("bathroom", "bidet", [
            {value:"none", label:"Не требуется"},
            {value:"bidet", label:"Биде"},
            {value:"hygienic_shower", label:"Гигиенический душ"}
          ], false)
        )}

        ${group("Хранение",
          checkboxGroup("bathroom", "storage", [
            {value:"vanity", label:"Тумба под раковиной"},
            {value:"tall_cabinet", label:"Пенал"},
            {value:"household_cabinet", label:"Хозяйственный шкаф"},
            {value:"cleaning_products", label:"Хранение бытовой химии"},
            {value:"towels", label:"Хранение полотенец"}
          ], false)
        )}

        ${group("Стиральная зона",
          checkboxGroup("bathroom", "laundry", [
            {value:"washer", label:"Стиральная машина"},
            {value:"dryer", label:"Сушильная машина"},
            {value:"stacked", label:"Стиральная и сушильная машины в колонне"},
            {value:"side_by_side", label:"Стиральная и сушильная машины рядом"}
          ], false)
        )}

        ${group("Дополнительные функции",
          checkboxGroup("bathroom", "extras", [
            {value:"laundry_basket", label:"Место для хранения корзины для белья"},
            {value:"ladder", label:"Место для хранения стремянки"},
            {value:"vacuum", label:"Место для хранения пылесоса"},
            {value:"robot_vacuum", label:"Место для хранения робота-пылесоса"}
          ], false)
        )}

        ${textareaInput("bathroom_must_fit", "Что обязательно должно поместиться?")}
        ${textareaInput("bathroom_must_not", "Чего категорически не должно быть?")}

        ${group("Если это мастер-ванная при спальне",
          checkboxGroup("bathroom", "master_bath", [
            {value:"from_bedroom", label:"Вход из спальни"},
            {value:"from_dressing", label:"Вход через гардеробную"},
            {value:"connected", label:"Ванная и гардеробная должны быть связаны"}
          ], false)
        )}
      </section>

      <!-- STEP 5: Прихожая -->
      <section class="anketa-step" data-step="5" aria-labelledby="anketaStep5">
        <h3 id="anketaStep5">Прихожая</h3>

        <div class="anketa-block"><div class="anketa-block__title">Верхняя одежда</div>
          ${group("Постоянно проживает:",
            checkboxGroup("hallway", "residents", [
              {value:"1_2", label:"1–2 человека"},
              {value:"3_4", label:"3–4 человека"},
              {value:"5plus", label:"5 и более человек"}
            ], false)
          )}
          ${group("Необходимо хранение:",
            checkboxGroup("hallway", "outerwear_storage", [
              {value:"everyday", label:"Повседневной верхней одежды"},
              {value:"seasonal", label:"Сезонной верхней одежды"},
              {value:"guest", label:"Гостевой верхней одежды"}
            ], false)
          )}
        </div>

        <div class="anketa-block"><div class="anketa-block__title">Обувь</div>
          ${group("Необходимо хранение:",
            checkboxGroup("hallway", "shoes_storage", [
              {value:"everyday", label:"Повседневной обуви"},
              {value:"seasonal", label:"Сезонной обуви"},
              {value:"many", label:"Большого количества обуви"}
            ], false)
          )}
        </div>

        ${group("Шкаф в прихожей",
          checkboxGroup("hallway", "wardrobe_size", [
            {value:"none", label:"Не требуется"},
            {value:"up_to_120", label:"До 120 см"},
            {value:"120_240", label:"120–240 см"},
            {value:"over_240", label:"Более 240 см"},
            {value:"dressing_room", label:"Отдельная гардеробная при входе"}
          ], true)
        )}

        ${group("Хранение крупногабаритных вещей",
          checkboxGroup("hallway", "bulky_storage", [
            {value:"suitcases", label:"Чемоданы"},
            {value:"stroller", label:"Детская коляска"},
            {value:"scooter", label:"Самокат"},
            {value:"bicycle", label:"Велосипед"},
            {value:"e_scooter", label:"Электросамокат"},
            {value:"sled", label:"Санки"},
            {value:"ski", label:"Лыжи/сноуборд"}
          ], false)
        )}

        ${group("Спорт и хобби",
          checkboxGroup("hallway", "sports_hobby", [
            {value:"football", label:"Футбольная форма и инвентарь"},
            {value:"hockey", label:"Хоккейная экипировка"},
            {value:"tennis", label:"Теннисное оборудование"},
            {value:"golf", label:"Гольф"},
            {value:"dance", label:"Танцевальная форма"},
            {value:"music", label:"Музыкальные инструменты"},
            {value:"other", label:"Другое: ___________________"}
          ], false)
        )}

        ${group("Домашние животные",
          checkboxGroup("hallway", "pets", [
            {value:"none", label:"Не требуется хранение"},
            {value:"food", label:"Корм"},
            {value:"accessories", label:"Аксессуары"},
            {value:"paw_wash", label:"Место для мытья лап"},
            {value:"pet_bed", label:"Лежанка"},
            {value:"carrier", label:"Переноска"}
          ], false)
        )}

        ${group("Хозяйственное хранение",
          checkboxGroup("hallway", "household", [
            {value:"vacuum", label:"Пылесос"},
            {value:"robot_vacuum", label:"Робот-пылесос и станция"},
            {value:"ladder", label:"Стремянка"},
            {value:"ironing_board", label:"Гладильная доска"},
            {value:"cleaning_products", label:"Бытовая химия"},
            {value:"tools", label:"Инструменты"}
          ], false)
        )}

        ${group("Дополнительные пожелания",
          checkboxGroup("hallway", "extras", [
            {value:"bench", label:"Банкетка"},
            {value:"full_mirror", label:"Зеркало в полный рост"},
            {value:"dirty_zone", label:"Отдельная грязная зона"},
            {value:"closed_wardrobe", label:"Закрытая гардеробная"},
            {value:"open_hallway", label:"Открытая прихожая"}
          ], false)
        )}

        ${textareaInput("hallway_must_fit", "Что обязательно должно поместиться?")}
        ${textareaInput("hallway_extra_storage", "Что чаще всего хранится в прихожей помимо одежды и обуви?")}
      </section>

      <!-- STEP 6: Гостиная -->
      <section class="anketa-step" data-step="6" aria-labelledby="anketaStep6">
        <h3 id="anketaStep6">Гостиная</h3>

        ${group("Основное назначение гостиной",
          checkboxGroup("living", "purpose", [
            {value:"family", label:"Семейный отдых"},
            {value:"guests", label:"Прием гостей"},
            {value:"movies", label:"Просмотр фильмов"},
            {value:"games", label:"Игровая зона"},
            {value:"reading", label:"Чтение"},
            {value:"work", label:"Работа из дома"},
            {value:"universal", label:"Универсальное пространство"}
          ], false)
        )}

        <div class="anketa-block"><div class="anketa-block__title">Диванная зона</div>
          ${group("Количество посадочных мест:",
            checkboxGroup("living", "seating_count", [
              {value:"2_3", label:"2–3 человека"},
              {value:"4_5", label:"4–5 человек"},
              {value:"6plus", label:"6 и более человек"}
            ], false)
          )}
          ${group("Дополнительно:",
            checkboxGroup("living", "seating_extras", [
              {value:"corner_sofa", label:"Угловой диван"},
              {value:"u_shape_sofa", label:"П-образный диван"},
              {value:"two_sofas", label:"Два дивана"},
              {value:"armchair", label:"Кресло"},
              {value:"two_armchairs", label:"Два кресла"}
            ], false)
          )}
        </div>

        ${group("Телевизионная зона",
          checkboxGroup("living", "tv_zone", [
            {value:"tv", label:"Телевизор"},
            {value:"projector", label:"Проектор"},
            {value:"none", label:"Не требуется"}
          ], false)
        )}

        ${group("Обеденная зона в гостиной",
          checkboxGroup("living", "dining", [
            {value:"none", label:"Не требуется"},
            {value:"4_seats", label:"Стол на 4 человека"},
            {value:"6_seats", label:"Стол на 6 человек"},
            {value:"8_seats", label:"Стол на 8 человек"},
            {value:"10plus_seats", label:"Стол на 10 и более человек"}
          ], false)
        )}

        ${group("Дополнительные функции",
          checkboxGroup("living", "extras", [
            {value:"workplace", label:"Рабочее место"},
            {value:"library", label:"Библиотека"},
            {value:"kids_zone", label:"Игровая зона для детей"},
            {value:"music", label:"Музыкальный инструмент"},
            {value:"collections", label:"Коллекции (книги, искусство, модели и т.д.)"},
            {value:"home_cinema", label:"Домашний кинотеатр"}
          ], false)
        )}

        <div class="anketa-block"><div class="anketa-block__title">Хранение</div>
          ${group("Необходимо хранение:",
            checkboxGroup("living", "storage", [
              {value:"books", label:"Книг"},
              {value:"documents", label:"Документов"},
              {value:"board_games", label:"Настольных игр"},
              {value:"collections", label:"Коллекций"},
              {value:"kids_toys", label:"Детских игрушек"},
              {value:"textiles", label:"Текстиля (пледы, подушки и т.д.)"}
            ], false)
          )}
        </div>

        ${group("Дополнительные спальные места",
          checkboxGroup("living", "extra_beds", [
            {value:"none", label:"Не требуются"},
            {value:"sofa_bed", label:"Диван-кровать"},
            {value:"guest_bed", label:"Отдельное гостевое спальное место"}
          ], false)
        )}

        ${textareaInput("living_must_fit", "Что обязательно должно поместиться?")}
        ${textareaInput("living_must_not", "Что категорически не нужно?")}
      </section>

      <!-- STEP 7: Хранение -->
      <section class="anketa-step" data-step="7" aria-labelledby="anketaStep7">
        <h3 id="anketaStep7">Система хранения</h3>

        ${group("Количество постоянно проживающих",
          checkboxGroup("storage", "residents", [
            {value:"1", label:"1 человек"},
            {value:"2", label:"2 человека"},
            {value:"3", label:"3 человека"},
            {value:"4", label:"4 человека"},
            {value:"5plus", label:"5 и более человек"}
          ], false)
        )}

        ${group("Общая потребность в хранении",
          checkboxGroup("storage", "need_level", [
            {value:"minimal", label:"Минимальная"},
            {value:"standard", label:"Стандартная"},
            {value:"high", label:"Повышенная"},
            {value:"maximum", label:"Максимально возможный объем хранения"}
          ], false)
        )}

        <div class="anketa-block"><div class="anketa-block__title">Необходимо хранение</div>
          ${group("Одежда и обувь",
            checkboxGroup("storage", "clothing", [
              {value:"everyday", label:"Повседневная одежда"},
              {value:"seasonal", label:"Сезонная одежда"},
              {value:"outerwear", label:"Верхняя одежда"},
              {value:"shoes", label:"Обувь"},
              {value:"many_shoes", label:"Большое количество обуви"}
            ], false)
          )}
          ${group("Чемоданы и дорожные принадлежности",
            checkboxGroup("storage", "luggage", [
              {value:"1_2", label:"1–2 чемодана"},
              {value:"3_4", label:"3–4 чемодана"},
              {value:"4plus", label:"Более 4 чемоданов"}
            ], false)
          )}
          ${group("Спорт и активный отдых",
            checkboxGroup("storage", "sports", [
              {value:"bikes", label:"Велосипеды"},
              {value:"scooters", label:"Самокаты"},
              {value:"e_scooters", label:"Электросамокаты"},
              {value:"skis", label:"Лыжи"},
              {value:"snowboards", label:"Сноуборды"},
              {value:"hockey", label:"Хоккейная экипировка"},
              {value:"football", label:"Футбольная форма и инвентарь"},
              {value:"tennis", label:"Теннисное оборудование"},
              {value:"gym", label:"Тренажеры"},
              {value:"other", label:"Другое: ___________________"}
            ], false)
          )}
          ${group("Детские вещи",
            checkboxGroup("storage", "kids_stuff", [
              {value:"toys", label:"Игрушки"},
              {value:"stroller", label:"Коляска"},
              {value:"kids_transport", label:"Детский транспорт"},
              {value:"grow_clothes", label:"Одежда «на вырост»"},
              {value:"school", label:"Школьные принадлежности"}
            ], false)
          )}
          ${group("Домашние животные",
            checkboxGroup("storage", "pets", [
              {value:"food", label:"Корм"},
              {value:"carriers", label:"Переноски"},
              {value:"accessories", label:"Аксессуары"},
              {value:"beds", label:"Лежанки"}
            ], false)
          )}
          ${group("Хозяйственные вещи",
            checkboxGroup("storage", "household", [
              {value:"vacuum", label:"Пылесос"},
              {value:"robot_vacuum", label:"Робот-пылесос"},
              {value:"ladder", label:"Стремянка"},
              {value:"ironing_board", label:"Гладильная доска"},
              {value:"drying_rack", label:"Сушилка для белья"},
              {value:"cleaning_products", label:"Бытовая химия"},
              {value:"tools", label:"Инструменты"},
              {value:"supplies", label:"Запасы бытовых товаров"}
            ], false)
          )}
          ${group("Хобби и увлечения",
            checkboxGroup("storage", "hobbies", [
              {value:"books", label:"Книги"},
              {value:"crafts", label:"Материалы для творчества"},
              {value:"music", label:"Музыкальные инструменты"},
              {value:"photo", label:"Фотооборудование"},
              {value:"collections", label:"Коллекции"},
              {value:"other", label:"Другое: ___________________"}
            ], false)
          )}
        </div>

        ${group("Предпочтительный формат хранения",
          checkboxGroup("storage", "format", [
            {value:"entrance_dressing", label:"Гардеробная при входе"},
            {value:"bedroom_dressing", label:"Гардеробная при спальне"},
            {value:"separate_room", label:"Отдельная гардеробная комната"},
            {value:"builtin_wardrobes", label:"Встроенные шкафы"},
            {value:"combo", label:"Комбинация гардеробных и шкафов"},
            {value:"consult", label:"Не знаю, нужна консультация"}
          ], false)
        )}

        ${group("Дополнительные пожелания",
          checkboxGroup("storage", "extras", [
            {value:"to_ceiling", label:"Хранение до потолка"},
            {value:"hidden", label:"Максимально скрытые системы хранения"},
            {value:"utility_cabinet", label:"Отдельный хозяйственный шкаф"},
            {value:"pantry", label:"Отдельная кладовая"}
          ], false)
        )}

        ${textareaInput("storage_must_store", "Что обязательно должно храниться в квартире?")}
      </section>

      <!-- STEP 8: Балкон + конфиденциальность -->
      <section class="anketa-step" data-step="8" aria-labelledby="anketaStep8">
        <h3 id="anketaStep8">Балкон / Лоджия</h3>

        ${group("Планируется ли использование балкона?",
          checkboxGroup("balcony", "use", [
            {value:"no", label:"Нет, достаточно места для технического обслуживания окон"},
            {value:"yes", label:"Да"}
          ], true)
        )}

        ${group("Основное назначение",
          checkboxGroup("balcony", "purpose", [
            {value:"relax", label:"Зона отдыха"},
            {value:"office", label:"Кабинет"},
            {value:"storage", label:"Дополнительное хранение"},
            {value:"sports", label:"Спортивная зона"},
            {value:"creative", label:"Творческая мастерская"},
            {value:"plants", label:"Зона для растений"},
            {value:"combo", label:"Комбинированное использование"}
          ], false)
        )}

        <div class="anketa-block"><div class="anketa-block__title">Хранение на балконе</div>
          ${group("Необходимо хранение:",
            checkboxGroup("balcony", "storage", [
              {value:"suitcases", label:"Чемоданов"},
              {value:"seasonal", label:"Сезонных вещей"},
              {value:"bikes", label:"Велосипедов"},
              {value:"scooters", label:"Самокатов"},
              {value:"kids_transport", label:"Детского транспорта"},
              {value:"sports", label:"Спортивного инвентаря"},
              {value:"tools", label:"Инструментов"},
              {value:"household", label:"Хозяйственных принадлежностей"},
              {value:"other", label:"Другое: ___________________"}
            ], false)
          )}
        </div>

        ${group("Рабочая зона",
          checkboxGroup("balcony", "work_zone", [
            {value:"none", label:"Не требуется"},
            {value:"one", label:"Одно рабочее место"}
          ], false)
        )}

        ${group("Зона отдыха",
          checkboxGroup("balcony", "relax_zone", [
            {value:"armchair", label:"Кресло"},
            {value:"small_sofa", label:"Небольшой диван"},
            {value:"dining_group", label:"Обеденная группа"},
            {value:"coffee_table", label:"Кофейный столик"}
          ], false)
        )}

        ${group("Растения",
          checkboxGroup("balcony", "plants", [
            {value:"none", label:"Не требуются"},
            {value:"few", label:"Небольшое количество растений"},
            {value:"many", label:"Много растений"},
            {value:"mini_garden", label:"Домашний мини-сад"}
          ], false)
        )}

        ${group("Спорт и хобби",
          checkboxGroup("balcony", "sports_hobby", [
            {value:"gym", label:"Тренажер"},
            {value:"yoga", label:"Йога / растяжка"},
            {value:"creative", label:"Творческая мастерская"},
            {value:"music", label:"Музыкальные занятия"},
            {value:"other", label:"Другое: ___________________"}
          ], false)
        )}

        ${group("Утепление",
          checkboxGroup("balcony", "insulation", [
            {value:"none", label:"Не требуется"},
            {value:"yes", label:"Требуется утепление"},
            {value:"unknown", label:"Не знаю"}
          ], false)
        )}

        ${textareaInput("balcony_must_fit", "Что обязательно должно разместиться на балконе?")}
        ${textareaInput("balcony_must_not", "Что категорически не планируется размещать на балконе?")}

        <div class="anketa-divider"></div>

        <label class="anketa-check" style="margin-top:10px;">
          <input type="checkbox" name="privacy_accept" required>
          <span>
            Я согласен(на) с <a href="#" id="anketaPrivacyLink" target="_blank" rel="noopener">Политикой конфиденциальности</a>
          </span>
        </label>
      </section>

      <!-- STEP SUCCESS -->
      <section class="anketa-step" data-step="success" aria-labelledby="anketaStepSuccess">
        <div class="anketa-success">
          <div class="anketa-success__title" id="anketaStepSuccess">Анкета отправлена</div>
          <p class="anketa-success__text" id="anketaSuccessText"></p>
          <div class="anketa-success__box" id="anketaSuccessBox" hidden></div>
          <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:12px;">
            <button type="button" class="btn btn--ghost" data-anketa-action="copy-json" id="anketaCopyBtn" hidden>Скопировать данные</button>
            <button type="button" class="btn btn--primary" data-anketa-action="close">Закрыть</button>
          </div>
        </div>
      </section>
    `;
  }

  // ---- buildPayload ----
  function buildPayload(form) {
    const vals = getFormValues(form);

    function checked(name) {
      const els = Array.from(form.elements).filter(el => el.name === name && el.type === "checkbox");
      return els.filter(el => el.checked).map(el => el.value);
    }

    function radio(name) {
      const els = Array.from(form.elements).filter(el => el.name === name && el.type === "radio");
      const found = els.find(el => el.checked);
      return found ? found.value : "";
    }

    function txt(name) {
      return String(vals[name] || "").trim();
    }

    function otherText(name) {
      return String(vals[name + "_other_text"] || "").trim();
    }

    function sectionCheckboxes(section, groups) {
      const result = {};
      groups.forEach(g => {
        const key = `${section}_${g}`;
        result[g] = checked(key);
        const ot = txt(key + "_other_text");
        if (ot) result[g + "_other"] = ot;
      });
      return result;
    }

    function sectionOpenText(fields) {
      const result = {};
      fields.forEach(f => {
        const v = txt(f.name);
        if (v) result[f.key] = v;
      });
      return result;
    }

    const roomCount = radio("children_room_count") || "none";
    let childrenSection = { room_count: roomCount };

    if (roomCount === "1") {
      childrenSection.child1 = {
        age: txt("child1_age"),
        checkboxes: {
          bed: checked("child1_bed"),
          work_zone: checked("child1_work_zone"),
          wardrobe: checked("child1_wardrobe"),
          extra_storage: checked("child1_extra_storage"),
          room_functions: checked("child1_room_functions"),
          gender: checked("child1_gender"),
          transform: checked("child1_transform"),
          priority: checked("child1_priority")
        },
        open_text: { must_fit: txt("child1_must_fit") }
      };
    } else if (roomCount === "2") {
      childrenSection.child1 = {
        age: txt("child1_age_2"),
        checkboxes: {
          gender: checked("child1_gender"),
        }
      };
      childrenSection.child2 = {
        age: txt("child2_age"),
        checkboxes: {
          beds: checked("child2_beds"),
          work_zone: checked("child2_work_zone"),
          wardrobe: checked("child2_wardrobe"),
          extra_storage: checked("child2_extra_storage"),
          room_functions: checked("child2_room_functions"),
          separate_future: checked("child2_separate_future"),
          gender: checked("child2_gender"),
          transform: checked("child2_transform"),
          priority: checked("child2_priority")
        },
        open_text: { must_fit: txt("child2_must_fit") }
      };
    }

    return {
      form_version: FORM_VERSION,
      submitted_at: nowIso(),

      contact: {
        name: txt("contact_name"),
        contact: txt("contact_value"),
        family_composition: txt("family_composition")
      },

      sections: {
        bedroom: {
          checkboxes: sectionCheckboxes("bedroom", ["bed_size","nightstand","wardrobe","work_zone","vanity_zone","relax_zone","extras","activities"]),
          open_text: {
            must_fit: txt("bedroom_must_fit"),
            must_not: txt("bedroom_must_not")
          }
        },
        kitchen: {
          checkboxes: sectionCheckboxes("kitchen", ["layout","hob","oven","microwave","fridge","freezer","sink","dishwasher","sink_extras","food_storage","dishes_storage","small_appliances_storage","countertop_appliances","residents_count","dining_table","daily_seats","max_guests","dining_extras","cooking_freq","priority"]),
          open_text: {
            must_fit: txt("kitchen_must_fit"),
            must_not: txt("kitchen_must_not"),
            comments: txt("kitchen_comments")
          }
        },
        children: childrenSection,
        bathroom: {
          checkboxes: sectionCheckboxes("bathroom", ["users","shower_bath","bath_size","shower_type","sink_count","toilet","bidet","storage","laundry","extras","master_bath"]),
          open_text: {
            must_fit: txt("bathroom_must_fit"),
            must_not: txt("bathroom_must_not")
          }
        },
        hallway: {
          checkboxes: sectionCheckboxes("hallway", ["residents","outerwear_storage","shoes_storage","wardrobe_size","bulky_storage","sports_hobby","pets","household","extras"]),
          open_text: {
            must_fit: txt("hallway_must_fit"),
            extra_storage: txt("hallway_extra_storage")
          }
        },
        living: {
          checkboxes: sectionCheckboxes("living", ["purpose","seating_count","seating_extras","tv_zone","dining","extras","storage","extra_beds"]),
          open_text: {
            must_fit: txt("living_must_fit"),
            must_not: txt("living_must_not")
          }
        },
        storage: {
          checkboxes: sectionCheckboxes("storage", ["residents","need_level","clothing","luggage","sports","kids_stuff","pets","household","hobbies","format","extras"]),
          open_text: {
            must_store: txt("storage_must_store")
          }
        },
        balcony: {
          checkboxes: sectionCheckboxes("balcony", ["use","purpose","storage","work_zone","relax_zone","plants","sports_hobby","insulation"]),
          open_text: {
            must_fit: txt("balcony_must_fit"),
            must_not: txt("balcony_must_not")
          }
        }
      },

      consent: {
        privacy_accept: !!vals.privacy_accept
      },

      meta: {
        page_url: (typeof location !== "undefined") ? location.href : "",
        user_agent: (typeof navigator !== "undefined") ? navigator.userAgent : ""
      }
    };
  }

  // ---- Modal HTML builder ----
  function buildModalShell() {
    const wrap = document.createElement("div");
    wrap.className = "anketa-modal";
    wrap.id = "anketaModal";
    wrap.hidden = true;

    wrap.innerHTML = `
      <div class="anketa-modal__backdrop" data-anketa-action="close" aria-hidden="true"></div>

      <div class="anketa-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="anketaTitle">
        <div class="anketa-modal__header">
          <div>
            <div class="anketa-modal__kicker">А Н К Е Т А</div>
            <h2 class="anketa-modal__title" id="anketaTitle">Анкета</h2>
            <div class="anketa-modal__meta">
              <div class="anketa-progress" aria-live="polite">
                <div class="anketa-progress__bar" aria-hidden="true"><span id="anketaProgressBar"></span></div>
                <div id="anketaProgressLabel">Шаг 1 из 9</div>
              </div>
            </div>
          </div>

          <div class="anketa-modal__header-actions">
            <button class="anketa-link" type="button" data-anketa-action="clear">Очистить ответы</button>
            <button class="anketa-modal__close" type="button" data-anketa-action="close" aria-label="Закрыть">✕</button>
          </div>
        </div>

        <form class="anketa-form" id="anketaForm" novalidate>
          <div class="anketa-body" id="anketaBody">
            ${buildSteps()}
          </div>

          <div class="anketa-nav">
            <button class="btn btn--ghost" type="button" data-anketa-action="back">Назад</button>
            <button class="btn btn--primary" type="button" data-anketa-action="next">Далее</button>
          </div>
        </form>
      </div>
    `;

    return wrap;
  }

  // ---- Modal logic ----
  const state = {
    isOpen: false,
    activeStep: 0,
    totalSteps: 9,
    kv: {},
    submitUrl: "",
    lastPayload: null,
    lastActiveEl: null
  };

  function ensureModal() {
    let modal = document.getElementById("anketaModal");
    if (modal) return modal;

    modal = buildModalShell();
    document.body.appendChild(modal);

    bindModal(modal);

    return modal;
  }

  function bindModal(modal) {
    const form = $("#anketaForm", modal);

    // Delegated actions
    modal.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-anketa-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-anketa-action");
      if (!action) return;

      if (action === "close") { e.preventDefault(); closeModal(); }
      if (action === "back") { e.preventDefault(); goBack(); }
      if (action === "next") { e.preventDefault(); goNext(); }
      if (action === "clear") { e.preventDefault(); clearDraft(true); }
      if (action === "copy-json") { e.preventDefault(); copyLastPayload(); }
    });

    // Close by clicking backdrop
    const backdrop = $(".anketa-modal__backdrop", modal);
    if (backdrop) {
      backdrop.addEventListener("click", () => closeModal());
    }

    // Esc to close + focus trap
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); closeModal(); return; }
      if (e.key === "Tab") { trapFocus(e, modal); }
    });

    // Children radio toggle
    modal.addEventListener("change", (e) => {
      if (e.target.name === "children_room_count") {
        updateChildrenVisibility(modal, e.target.value);
      }
      // Other checkbox reveals text input
      if (e.target.type === "checkbox" && e.target.value === "other") {
        const next = e.target.closest(".anketa-check") && e.target.closest(".anketa-check").nextElementSibling;
        if (next && next.classList.contains("anketa-other-input")) {
          next.classList.toggle("is-visible", e.target.checked);
        }
      }
    });

    // Auto-save draft
    const scheduleSave = debounce(() => {
      saveDraft(getFormValues(form), state.activeStep);
    }, 250);

    form.addEventListener("input", scheduleSave);
    form.addEventListener("change", scheduleSave);
  }

  function updateChildrenVisibility(modal, value) {
    const none = $("#childrenNone", modal);
    const g1 = $("#childrenGroup1", modal);
    const g2 = $("#childrenGroup2", modal);

    if (none) none.style.display = (value === "none") ? "" : "none";
    if (g1) g1.style.display = (value === "1") ? "" : "none";
    if (g2) g2.style.display = (value === "2") ? "" : "none";
  }

  function trapFocus(e, modal) {
    if (!state.isOpen) return;

    const focusables = getFocusable(modal);
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const isShift = e.shiftKey;

    if (!isShift && document.activeElement === last) { e.preventDefault(); first.focus(); }
    if (isShift && document.activeElement === first) { e.preventDefault(); last.focus(); }
  }

  function getFocusable(root) {
    return $$(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      root
    ).filter(el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }

  function openModal(triggerEl) {
    const modal = ensureModal();
    state.lastActiveEl = triggerEl || document.activeElement;

    modal.hidden = false;
    document.body.classList.add("anketa-lock");
    state.isOpen = true;

    applyKVToModal(modal);
    restoreDraft(modal);
    setStep(state.activeStep, modal);

    const focusables = getFocusable(modal);
    if (focusables.length) focusables[0].focus();
  }

  function closeModal() {
    const modal = document.getElementById("anketaModal");
    if (!modal) return;

    modal.hidden = true;
    document.body.classList.remove("anketa-lock");
    state.isOpen = false;

    if (state.lastActiveEl && typeof state.lastActiveEl.focus === "function") {
      try { state.lastActiveEl.focus(); } catch (_) {}
    }
  }

  function setStep(stepIndex, modal) {
    const form = $("#anketaForm", modal);
    const steps = $$(".anketa-step", modal);

    if (stepIndex === "success") {
      steps.forEach(s => s.classList.remove("is-active"));
      const success = steps.find(s => s.getAttribute("data-step") === "success");
      if (success) success.classList.add("is-active");
      const nav = $(".anketa-nav", modal);
      if (nav) nav.hidden = true;
      updateProgressUI(modal, state.totalSteps, state.totalSteps);
      return;
    }

    const idx = clamp(Number(stepIndex) || 0, 0, state.totalSteps - 1);
    state.activeStep = idx;

    steps.forEach(s => s.classList.remove("is-active"));
    const current = steps.find(s => String(s.getAttribute("data-step")) === String(idx));
    if (current) current.classList.add("is-active");

    const nav = $(".anketa-nav", modal);
    if (nav) nav.hidden = false;

    const backBtn = modal.querySelector('[data-anketa-action="back"]');
    const nextBtn = modal.querySelector('[data-anketa-action="next"]');

    if (backBtn) backBtn.textContent = (idx === 0) ? "Закрыть" : "Назад";
    if (nextBtn) nextBtn.textContent = (idx === state.totalSteps - 1) ? "Отправить" : "Далее";

    updateProgressUI(modal, idx + 1, state.totalSteps);

    const formVals = form ? getFormValues(form) : {};
    saveDraft(formVals, idx);
  }

  function updateProgressUI(modal, current, total) {
    const label = $("#anketaProgressLabel", modal);
    const bar = $("#anketaProgressBar", modal);
    if (label) label.textContent = `Шаг ${current} из ${total}`;
    if (bar) bar.style.width = `${clamp(Math.round((current / total) * 100), 0, 100)}%`;
  }

  function goBack() {
    const modal = document.getElementById("anketaModal");
    if (!modal) return;

    if (state.activeStep === 0) { closeModal(); return; }
    setStep(state.activeStep - 1, modal);
  }

  function goNext() {
    const modal = document.getElementById("anketaModal");
    if (!modal) return;

    const form = $("#anketaForm", modal);
    if (!form) return;

    if (state.activeStep === state.totalSteps - 1) {
      submit(form, modal);
      return;
    }

    const ok = validateCurrentStep(form, modal, state.activeStep);
    if (!ok) return;

    setStep(state.activeStep + 1, modal);
  }

  function validateCurrentStep(form, modal, stepIdx) {
    const step = modal.querySelector(`.anketa-step[data-step="${stepIdx}"]`);
    if (!step) return true;

    const fields = $$("input, textarea, select", step).filter(el => !el.disabled);
    for (const f of fields) {
      if (f.closest("[hidden]")) continue;
      if (typeof f.checkValidity === "function" && !f.checkValidity()) {
        if (typeof f.reportValidity === "function") f.reportValidity();
        return false;
      }
    }
    return true;
  }

  // ---- Draft storage ----
  function getFormValues(form) {
    const map = {};
    const byName = new Map();

    Array.from(form.elements || []).forEach(el => {
      if (!el.name || el.disabled) return;
      if (!byName.has(el.name)) byName.set(el.name, []);
      byName.get(el.name).push(el);
    });

    byName.forEach((els, name) => {
      const first = els[0];
      if (!first) return;

      if (first.type === "checkbox") {
        if (els.length === 1) {
          map[name] = !!first.checked;
        } else {
          map[name] = els.filter(x => x.checked).map(x => x.value);
        }
        return;
      }

      if (first.type === "radio") {
        const checked = els.find(x => x.checked);
        map[name] = checked ? checked.value : "";
        return;
      }

      map[name] = String(first.value ?? "");
    });

    return map;
  }

  function applyFormValues(form, values) {
    if (!values || typeof values !== "object") return;

    Object.keys(values).forEach((name) => {
      const els = Array.from(form.elements).filter(el => el.name === name);
      if (!els.length) return;

      const v = values[name];
      const first = els[0];

      if (first.type === "checkbox") {
        if (els.length === 1) {
          first.checked = !!v;
        } else {
          const arr = Array.isArray(v) ? v : [];
          els.forEach(el => { el.checked = arr.includes(el.value); });
        }
        return;
      }

      if (first.type === "radio") {
        const val = String(v ?? "");
        els.forEach(el => { el.checked = (el.value === val); });
        return;
      }

      first.value = String(v ?? "");
    });
  }

  function saveDraft(values, stepIdx) {
    const payload = {
      __v: 1,
      __step: stepIdx,
      __saved_at: nowIso(),
      values: values || {}
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {}
  }

  function loadDraftRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return safeParseJson(raw);
    } catch {
      return null;
    }
  }

  function restoreDraft(modal) {
    const form = $("#anketaForm", modal);
    if (!form) return;

    const raw = loadDraftRaw();
    if (!raw || !raw.values) {
      state.activeStep = 0;
      return;
    }

    applyFormValues(form, raw.values);

    // Restore children visibility based on draft value
    const childrenCount = raw.values.children_room_count || "none";
    updateChildrenVisibility(modal, childrenCount);

    // Restore "other" input visibility
    Array.from(form.elements).forEach(el => {
      if (el.type === "checkbox" && el.value === "other" && el.checked) {
        const next = el.closest(".anketa-check") && el.closest(".anketa-check").nextElementSibling;
        if (next && next.classList.contains("anketa-other-input")) {
          next.classList.add("is-visible");
        }
      }
    });

    const step = (raw.__step !== undefined) ? Number(raw.__step) : 0;
    state.activeStep = clamp(Number.isFinite(step) ? step : 0, 0, state.totalSteps - 1);
  }

  function clearDraft(resetForm) {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}

    const modal = document.getElementById("anketaModal");
    if (!modal) return;

    const form = $("#anketaForm", modal);
    if (!form) return;

    if (resetForm) {
      form.reset();
      state.activeStep = 0;
      setStep(0, modal);
      updateChildrenVisibility(modal, "none");
    }
  }

  // ---- Submission ----
  async function submit(form, modal) {
    const ok = validateCurrentStep(form, modal, state.activeStep);
    if (!ok) return;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const payload = buildPayload(form);
    state.lastPayload = payload;

    const submitUrl = String(state.submitUrl || "").trim();

    const nextBtn = modal.querySelector('[data-anketa-action="next"]');
    const backBtn = modal.querySelector('[data-anketa-action="back"]');
    if (nextBtn) nextBtn.disabled = true;
    if (backBtn) backBtn.disabled = true;

    let mode = "no-endpoint";
    let errorText = "";

    try {
      if (submitUrl) {
        mode = "sent";
        const res = await fetch(submitUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          mode = "error";
          errorText = `Ошибка отправки: HTTP ${res.status}`;
        }
      }
    } catch (e) {
      mode = "error";
      errorText = "Ошибка отправки. Проверьте адрес webhook и CORS.";
    } finally {
      if (nextBtn) nextBtn.disabled = false;
      if (backBtn) backBtn.disabled = false;
    }

    showSuccess(modal, mode, errorText);
    if (mode === "sent") { clearDraft(false); }
  }

  function showSuccess(modal, mode, errorText) {
    const text = $("#anketaSuccessText", modal);
    const box = $("#anketaSuccessBox", modal);
    const copyBtn = $("#anketaCopyBtn", modal);

    if (text) {
      if (mode === "sent") {
        text.textContent = "Спасибо! Ваша анкета отправлена.";
      } else if (mode === "error") {
        text.textContent = errorText || "Ошибка отправки.";
      } else {
        text.textContent = "Пока не настроен адрес отправки (n8n). Ниже — данные анкеты, их можно скопировать.";
      }
    }

    const showBox = (mode !== "sent");
    if (box) {
      box.hidden = !showBox;
      if (showBox) { box.textContent = JSON.stringify(state.lastPayload || {}, null, 2); }
    }

    if (copyBtn) copyBtn.hidden = !showBox;

    setStep("success", modal);
  }

  async function copyLastPayload() {
    const payload = state.lastPayload || {};
    const str = JSON.stringify(payload, null, 2);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(str);
        alert("Скопировано");
        return;
      }
    } catch (_) {}

    try {
      const ta = document.createElement("textarea");
      ta.value = str;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      alert("Скопировано");
    } catch (_) {
      alert("Не удалось скопировать. Можно выделить текст вручную.");
    }
  }

  // ---- KV => modal settings ----
  async function applyKVToModal(modal) {
    if (!state.kv || !Object.keys(state.kv).length) {
      state.kv = await loadSiteKV();
    }

    state.submitUrl = String(state.kv.anketa_submit_url || DEFAULT_SUBMIT_URL || "").trim();

    const privacyUrl = String(state.kv.privacy_url || "").trim();
    const a = $("#anketaPrivacyLink", modal);
    if (a && privacyUrl) a.href = privacyUrl;
  }

  // ---- Open triggers ----
  function bindOpenTriggers() {
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (!a) return;
      const href = (a.getAttribute("href") || "").trim();
      if (href !== OPEN_HASH) return;
      e.preventDefault();
      openModal(a);
    });

    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-anketa-open]");
      if (!t) return;
      e.preventDefault();
      openModal(t);
    });

    if (typeof location !== "undefined" && location.hash === OPEN_HASH) {
      openModal(document.querySelector(`a[href="${OPEN_HASH}"]`) || null);
      try { history.replaceState(null, "", location.pathname + location.search); } catch (_) {}
    }
  }

  // ---- debounce ----
  function debounce(fn, delay) {
    let t = null;
    return function (...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ---- Init ----
  async function init() {
    ensureModal();
    bindOpenTriggers();

    state.kv = await loadSiteKV();
    state.submitUrl = String(state.kv.anketa_submit_url || DEFAULT_SUBMIT_URL || "").trim();
  }

  if (isReady()) init();
  else document.addEventListener("DOMContentLoaded", init);
})();

/* === reviews-plan.js === */
/* reviews-plan.js
 * Premium "review -> plan (before/after)" binding.
 *
 * What it does:
 * - Loads reviews + cases + cases_media from Google Sheets (same sheet id as the site)
 * - For every review card in the carousel, if the review row has:
 *    - case_before_url & case_after_url -> uses them
 *    - OR case_id -> pulls the first suitable before/after pair from cases_media for that case_id
 * - Adds a second action button on each review card: "План был/стал" (opens the review dialog directly on the plan tab)
 * - Enhances the existing <dialog id="reviewDialog"> (created by reviews-more-modal.js):
 *    - split layout (plan left, text right)
 *    - hides tabs when before==after (single image case)
 *    - adds zoom lightbox on plan image click
 *
 * Installation:
 * 1) Put this file next to index.html (repo root) OR into assets/js and update the <script> path
 * 2) Add to index.html:
 *    <script src="reviews-plan.js?v=1" defer></script>
 * 3) Add CSS (see reviews-plan.css)
 */
(function () {
  "use strict";

  // --- guard
  if (window.__byplanReviewsPlanV1) return;
  window.__byplanReviewsPlanV1 = true;

  // --- dependencies
  const Sheets = window.Sheets;
  const SITE_CONFIG = window.SITE_CONFIG || {};
  if (!Sheets || !Sheets.fetchTab) return;

  const TAB_REVIEWS = (SITE_CONFIG.TABS && SITE_CONFIG.TABS.reviews) ? SITE_CONFIG.TABS.reviews : "reviews";
  const TAB_CASES = (SITE_CONFIG.TABS && SITE_CONFIG.TABS.cases) ? SITE_CONFIG.TABS.cases : "cases";
  const TAB_MEDIA = "cases_media";

  // ---------- utils
  function pick(obj, keys) {
    if (!obj) return "";
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
      // also try relaxed key match (case-insensitive)
      const lk = String(k).toLowerCase();
      for (const kk in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, kk) && String(kk).toLowerCase() === lk) {
          const v = obj[kk];
          if (v != null && String(v).trim() !== "") return v;
        }
      }
    }
    return "";
  }

  function normStr(s) {
    return String(s || "").trim();
  }

  function normKey(s) {
    return normStr(s).toLowerCase().replace(/\s+/g, " ");
  }

  function toNumber(v) {
    const n = parseFloat(String(v || "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function normalizeUrl(u) {
    const s = normStr(u);
    if (!s) return "";
    // leave absolute as-is
    if (/^https?:\/\//i.test(s)) return s;
    // allow //cdn paths
    if (/^\/\//.test(s)) return s;
    // relative path ok
    return s;
  }

  function isFalse(v) {
    return normKey(v) === "false" || normKey(v) === "0" || normKey(v) === "no";
  }

  // ---------- lightbox
  let lbEl = null;

  function ensureLightbox() {
    if (lbEl) return lbEl;

    const el = document.createElement("div");
    el.className = "review-plan-lb";
    el.innerHTML = [
      '<div class="review-plan-lb__backdrop" data-lb-close="1"></div>',
      '<div class="review-plan-lb__panel" role="dialog" aria-modal="true">',
      '  <button class="review-plan-lb__close" type="button" aria-label="Закрыть" data-lb-close="1">×</button>',
      '  <img class="review-plan-lb__img" alt="План" />',
      "</div>",
    ].join("");

    el.addEventListener("click", function (e) {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-lb-close") === "1") {
        closeLightbox();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeLightbox();
    });

    document.body.appendChild(el);
    lbEl = el;
    return lbEl;
  }

  function openLightbox(src) {
    const s = normStr(src);
    if (!s) return;
    const el = ensureLightbox();
    const img = el.querySelector(".review-plan-lb__img");
    img.src = s;

    el.classList.add("is-open");
    document.documentElement.classList.add("review-plan-lb-open");
  }

  function closeLightbox() {
    if (!lbEl) return;
    lbEl.classList.remove("is-open");
    document.documentElement.classList.remove("review-plan-lb-open");

    const img = lbEl.querySelector(".review-plan-lb__img");
    if (img) img.src = "";
  }

  // ---------- select media row for a case
  function mediaSortValue(row) {
    const raw = pick(row, ["sort", "order", "idx", "position", "media_sort"]);
    const n = toNumber(raw);
    return n != null ? n : 1e9;
  }

  function mediaLabelValue(row) {
    return normStr(pick(row, ["label", "title", "scene", "name", "media_label"]));
  }

  function hasBeforeAfter(row) {
    const b = normalizeUrl(pick(row, ["before_url", "before", "beforeUrl", "plan_before"]));
    const a = normalizeUrl(pick(row, ["after_url", "after", "afterUrl", "plan_after", "img_url", "image_url"]));
    return !!b && !!a;
  }

  function getBeforeAfter(row) {
    let before = normalizeUrl(pick(row, ["before_url", "before", "beforeUrl", "plan_before"]));
    let after = normalizeUrl(pick(row, ["after_url", "after", "afterUrl", "plan_after"]));

    // some rows might have only img_url (single image)
    const img = normalizeUrl(pick(row, ["img_url", "image_url", "url"]));
    if (!after && img) after = img;
    if (!before && img) before = img;

    if (!before && after) before = after;
    if (!after && before) after = before;

    return { before, after };
  }

  function selectMediaRow(mediaRows, preferredLabel, preferredSort) {
    const rows = Array.isArray(mediaRows) ? mediaRows.slice() : [];
    rows.sort((a, b) => mediaSortValue(a) - mediaSortValue(b));

    // 1) preferred sort
    const ps = toNumber(preferredSort);
    if (ps != null) {
      const bySort = rows.find(r => toNumber(pick(r, ["sort", "order", "idx", "position", "media_sort"])) === ps);
      if (bySort) return bySort;
    }

    // 2) preferred label
    const pl = normKey(preferredLabel);
    if (pl) {
      const byLabel = rows.find(r => normKey(mediaLabelValue(r)) === pl);
      if (byLabel) return byLabel;
      const byLabelIncludes = rows.find(r => normKey(mediaLabelValue(r)).includes(pl));
      if (byLabelIncludes) return byLabelIncludes;
    }

    // 3) first with both
    const both = rows.find(hasBeforeAfter);
    if (both) return both;

    // 4) first with any image
    const any = rows.find(r => {
      const ba = getBeforeAfter(r);
      return !!ba.before || !!ba.after;
    });
    return any || null;
  }

  // ---------- mapping rows to cards
  function buildReviewsIndex(reviewRows) {
    const map = new Map();
    for (const r of reviewRows) {
      const name = normKey(pick(r, ["name", "client", "author"]));
      const role = normKey(pick(r, ["role", "meta", "city"]));
      const key = name + "|" + role;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return map;
  }

  function getCardKey(card) {
    const name = normKey(card.querySelector(".review-card__name") ? card.querySelector(".review-card__name").textContent : "");
    const role = normKey(card.querySelector(".review-card__role") ? card.querySelector(".review-card__role").textContent : "");
    return name + "|" + role;
  }

  function buildCaseDataForReviewRow(reviewRow, casesById, mediaByCase) {
    // Direct override from reviews sheet (if you want to bypass cases_media)
    let before = normalizeUrl(pick(reviewRow, ["case_before_url", "case_before", "before_url", "before"]));
    let after = normalizeUrl(pick(reviewRow, ["case_after_url", "case_after", "after_url", "after"]));

    const caseTitleFromReview = normStr(pick(reviewRow, ["case_title", "plan_title"]));
    const caseCommentFromReview = normStr(pick(reviewRow, ["case_comment", "case_note", "case_text", "plan_comment"]));
    const beforeCaptionFromReview = normStr(pick(reviewRow, ["case_before_caption", "before_caption"]));
    const afterCaptionFromReview = normStr(pick(reviewRow, ["case_after_caption", "after_caption"]));

    if (before || after) {
      if (!before && after) before = after;
      if (!after && before) after = before;

      if (!before || !after) return null;

      return {
        caseId: normStr(pick(reviewRow, ["case_id", "caseId"])) || "",
        caseTitle: caseTitleFromReview || "План (было/стало)",
        before,
        after,
        beforeCaption: beforeCaptionFromReview,
        afterCaption: afterCaptionFromReview,
        caseComment: caseCommentFromReview,
      };
    }

    // Otherwise bind by case_id -> cases_media
    const caseId = normStr(pick(reviewRow, ["case_id", "caseId", "case"]));
    if (!caseId) return null;

    const mediaRows = mediaByCase.get(caseId);
    if (!mediaRows || !mediaRows.length) return null;

    const preferredLabel = normStr(pick(reviewRow, ["case_media_label", "media_label", "case_label"]));
    const preferredSort = pick(reviewRow, ["case_media_sort", "media_sort", "case_sort"]);

    const chosen = selectMediaRow(mediaRows, preferredLabel, preferredSort);
    if (!chosen) return null;

    const ba = getBeforeAfter(chosen);
    before = ba.before;
    after = ba.after;
    if (!before || !after) return null;

    const caseRow = casesById.get(caseId) || null;

    let caseTitle = caseTitleFromReview;
    if (!caseTitle) {
      caseTitle = normStr(pick(caseRow || {}, ["title", "case_title", "name"])) || normStr(mediaLabelValue(chosen)) || "План (было/стало)";
    }

    const caseComment = caseCommentFromReview || normStr(pick(chosen, ["comment", "note", "description", "text"]));

    return {
      caseId,
      caseTitle,
      before,
      after,
      beforeCaption: beforeCaptionFromReview,
      afterCaption: afterCaptionFromReview,
      caseComment,
    };
  }

  function addPlanButtonToCard(card) {
    const moreRow = card.querySelector(".review-card__more-row");
    if (!moreRow) return;

    if (moreRow.querySelector(".review-card__plan")) return;

    moreRow.classList.add("review-card__more-row--with-plan");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "review-card__plan";
    btn.textContent = "План был/стал";
    btn.setAttribute("data-review", "1");
    btn.setAttribute("data-open-case", "1");

    // Put it before "Читать полностью" for a nicer hierarchy
    const moreLink = moreRow.querySelector(".review-card__more");
    if (moreLink && moreLink.parentNode === moreRow) {
      moreRow.insertBefore(btn, moreLink);
    } else {
      moreRow.appendChild(btn);
    }
  }

  function attachCaseDataToCards(payload) {
    const cards = Array.from(document.querySelectorAll(".review-card"));
    if (!cards.length) return false;

    const rowsRaw = Array.isArray(payload.reviews) ? payload.reviews : [];

    // mimic app.js filtering
    const rows = rowsRaw
      .filter(r => !isFalse(pick(r, ["active"])))
      .filter(r => normStr(pick(r, ["name", "client", "author"])) && normStr(pick(r, ["text", "review", "body"])));

    const byKey = buildReviewsIndex(rows);

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (card.dataset && card.dataset.planBound === "1") continue;

      const key = getCardKey(card);
      let row = null;

      if (byKey.has(key) && byKey.get(key).length) {
        row = byKey.get(key).shift();
      } else if (rows[i]) {
        row = rows[i];
      }

      if (!row) {
        card.dataset.planBound = "1";
        continue;
      }

      const caseData = buildCaseDataForReviewRow(row, payload.casesById, payload.mediaByCase);
      if (caseData) {
        card.dataset.caseBefore = caseData.before;
        card.dataset.caseAfter = caseData.after;
        card.dataset.caseTitle = caseData.caseTitle;
        if (caseData.beforeCaption) card.dataset.caseBeforeCaption = caseData.beforeCaption;
        if (caseData.afterCaption) card.dataset.caseAfterCaption = caseData.afterCaption;
        if (caseData.caseComment) card.dataset.caseComment = caseData.caseComment;
        if (caseData.caseId) card.dataset.caseId = caseData.caseId;

        if (caseData.before && caseData.after && caseData.before === caseData.after) {
          card.dataset.caseSingle = "1";
        }

        addPlanButtonToCard(card);
      }

      card.dataset.planBound = "1";
    }

    return true;
  }

    async function loadSheetsData() {
    const sheetId = (SITE_CONFIG && SITE_CONFIG.SHEET_ID) ? String(SITE_CONFIG.SHEET_ID).trim() : "";
    if (!sheetId) {
      throw new Error("[reviews-plan] SITE_CONFIG.SHEET_ID is missing");
    }

    // In this project, Sheets.fetchTab(sheetId, tabName) returns an ARRAY of row objects.
    const [reviews, cases, media] = await Promise.all([
      Sheets.fetchTab(sheetId, TAB_REVIEWS).catch(() => []),
      Sheets.fetchTab(sheetId, TAB_CASES).catch(() => []),
      Sheets.fetchTab(sheetId, TAB_MEDIA).catch(() => []),
    ]);

    const casesById = new Map();
    for (const r of (cases || [])) {
      const id = normStr(pick(r, ["case_id", "id", "caseId"]));
      if (id) casesById.set(id, r);
    }

    const mediaByCase = new Map();
    for (const r of (media || [])) {
      const cid = normStr(pick(r, ["case_id", "caseId", "case"]));
      if (!cid) continue;
      if (!mediaByCase.has(cid)) mediaByCase.set(cid, []);
      mediaByCase.get(cid).push(r);
    }

    // sort each case media list (stable)
    for (const [cid, list] of mediaByCase.entries()) {
      list.sort((a, b) => mediaSortValue(a) - mediaSortValue(b));
      mediaByCase.set(cid, list);
    }

    return { reviews: (reviews || []), casesById, mediaByCase };
  }

  // ---------- dialog enhancements (layout + single-image + lightbox)
  function setupDialogEnhancements(dialog) {
    if (!dialog || dialog.dataset && dialog.dataset.planEnhanced === "1") return;

    const body = dialog.querySelector(".review-dialog__body");
    const caseEl = dialog.querySelector("#reviewDialogCase");
    const tabBefore = dialog.querySelector("#reviewDialogTabBefore") || dialog.querySelector('[data-review-case-tab="before"]');
    const tabAfter = dialog.querySelector("#reviewDialogTabAfter") || dialog.querySelector('[data-review-case-tab="after"]');
    const img = dialog.querySelector("#reviewDialogCaseImage") || dialog.querySelector("#reviewDialogCaseImg");

    function sync() {
      const hasCase = !!(caseEl && !caseEl.hasAttribute("hidden"));
      if (body) body.classList.toggle("review-dialog__body--split", hasCase);

      const isSingle = !!(hasCase && tabBefore && tabAfter && tabBefore.dataset && tabAfter.dataset &&
        tabBefore.dataset.src && tabAfter.dataset.src && tabBefore.dataset.src === tabAfter.dataset.src);
      dialog.classList.toggle("review-dialog--single", isSingle);
    }

    // close on click outside panel
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) dialog.close();
    });

    // zoom on image click
    if (img) {
      img.addEventListener("click", function () {
        if (!img.src) return;
        openLightbox(img.src);
      });
      img.style.cursor = "zoom-in";
    }

    const mo = new MutationObserver(sync);
    mo.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    if (caseEl) mo.observe(caseEl, { attributes: true, attributeFilter: ["hidden"] });

    sync();

    dialog.dataset.planEnhanced = "1";
  }

  function watchForDialog() {
    const existing = document.getElementById("reviewDialog");
    if (existing) {
      setupDialogEnhancements(existing);
      return;
    }

    const mo = new MutationObserver(() => {
      const dlg = document.getElementById("reviewDialog");
      if (dlg) {
        mo.disconnect();
        setupDialogEnhancements(dlg);
      }
    });

    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ---------- boot
  async function boot() {
    watchForDialog();

    // Start loading sheets ASAP (do not wait for DOM)
    const dataPromise = loadSheetsData().catch(function () { return null; });

    // Wait for carousel cards to appear
    const start = Date.now();
    const timeoutMs = 12000;

    function ready() {
      return document.querySelectorAll(".review-card").length > 0;
    }

    while (!ready() && (Date.now() - start) < timeoutMs) {
      await new Promise(function (r) { setTimeout(r, 120); });
    }

    if (!ready()) return;

    const payload = await dataPromise;
    if (!payload) return;

    attachCaseDataToCards(payload);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
;
