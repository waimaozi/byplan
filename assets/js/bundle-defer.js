
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
   BYPLAN — anketa-modal.js (v2)
   Module: Анкета (модальное окно + пошаговая форма)
   Интеграция:
   - Положите файл в assets/js/anketa-modal.js
   - Подключите в index.html (см. README в модуле)
   - В Google Sheets (site) установите brief_url = #anketa (и, при желании, hero_cta_url = #anketa)
   ============================================================ */

(function () {
  "use strict";

  const OPEN_HASH = "#anketa";
  const STORAGE_KEY = "byplan_anketa_draft_v2";
  const FORM_VERSION = "byplan-anketa-v2";
  const DEFAULT_SUBMIT_URL = "https://n8n2.waimaozi.com/webhook/byplan-anketa";

  // ---- Текст из документа (формулировки старался не менять) ----
  // fileciteturn0file0
  const DOC_GOAL_TITLE = "1. Цель работы:";
  const DOC_GOAL_TEXT =
    "Целью работы является определение и фиксация особых требований по перепланировке, отделке, техническому оснащению, стилевому решению объекта.";

  const OBJECT_TITLE = "2. Краткая характеристика объекта:";
  const ROOMS_TITLE = "3. Требования  к составу помещений.";
  const INTERIOR_TITLE = "4. Требования к интерьерным  решениям, пожелания по отделке помещений.";

  const KITCHEN_TITLE = "7. Кухонная зона:";
  const BATH_TITLE = "8. Функциональность с/узлов:";
  const HEAT_TITLE = "9. Зоны подогрева полов:";
  const AC_TITLE = "11. Кондиционирование:";

  const QUESTIONS_TITLE = "Вопросы анкеты:";
  const QUESTIONS_SUBTITLE = "1. Отметьте пункты, которые Вам подходят:";

  const FINAL_TITLE =
    "Напишите, какие требования предъявляете к своему будущему жилью, что обязательно там должно быть и чего Вы не хотели бы.";

  // ---- Справочники (для удобного формирования payload) ----
  const ZONES = [
    { id: "hallway", label: "Прихожая" },
    { id: "kitchen", label: "Кухня" },
    { id: "parents_bedroom", label: "Спальня родителей" },
    { id: "child_room", label: "Комната ребенка" },
    { id: "cabinet", label: "Кабинет" },
    { id: "main_bath", label: "Санузел основной" }
  ];

  const KITCHEN_OPTIONS = [
    { code: "oven", label: "Духовой шкаф" },
    { code: "cooktop", label: "Варочная панель" },
    { code: "dishwasher", label: "Посудомоечная машина" },
    { code: "microwave", label: "Микроволновая печь" },
    { code: "sink", label: "Мойка" },
    { code: "fridge", label: "Холодильник" },
    { code: "other", label: "Другое", hasText: true }
  ];

  const BATH_OPTIONS = [
    { code: "washer", label: "Стиральная машина" },
    { code: "dryer", label: "Сушильная машина" },
    { code: "shower", label: "Душевая кабина" },
    { code: "toilet", label: "Унитаз" },
    { code: "hygienic_shower", label: "Гигиенический душ" },
    { code: "sink", label: "Умывальник" },
    { code: "bath", label: "Ванная" }
  ];

  const HEAT_OPTIONS = [
    { code: "kitchen", label: "Кухня" },
    { code: "main_bath", label: "Санузел основной" },
    { code: "guest_bath", label: "Санузел гостевой" }
  ];

  const AC_OPTIONS = [
    { code: "forced_ventilation", label: "Принудительная система вентиляции" },
    { code: "ac_with_fresh_air_intake", label: "Кондиционер с внешним забором воздуха" }
  ];

  const QUESTION_POINTS = [
    "мне всегда холодно, я люблю укутаться в одеяло, дома часто надеваю теплые носки;",
    "мне нравится, когда за окном дождь, сидеть в кресле и читать книжку;",
    "я люблю порядок, раскладываю вещи всегда аккуратно, всегда знаю, где что лежит;",
    "чтобы понять нравится мне вещь или нет, мне надо ее обязательно потрогать, подержать в руках;",
    "я люблю, когда ко мне приходят гости, у нас шумно и весело;",
    "перед сном я всегда читаю книгу;",
    "я хочу иметь в своей комнате телевизор, даже если есть большой экран в гостиной;",
    "когда я прихожу домой, я включаю телевизор, даже если там ничего не идет, просто так, для фона;",
    "у меня аллергия, поэтому я не выношу пыль;",
    "терпеть не могу шумные компании, мне нужно уединение;",
    "я рано ложусь спать, потому что я – жаворонок;",
    "мне нравятся светлые оттенки, потому что темный цвет я нахожу тяжелым и мрачным;",
    "мне всегда жарко, я люблю ходить в распахнутой одежде;",
    "я редко нежусь в ванной, я люблю больше душ;",
    "мне интересно разглядывать детали. Витрина, где выставлена куча всяких вещей любопытнее, чем дизайнерский минимализм;",
    "я люблю валяться в постели, могу весь день пролежать за книжкой или перед телевизором;",
    "я завтракаю отдельно, так мой график не совпадает с расписанием остальных членов семьи;",
    "мне нравится, когда вся семья вечером собирается вместе, мы сидим за столом, рассказываем новости или вместе смотрим телевизор;",
    "белая комната напоминает мне больницу;",
    "я занимаю ванную комнату надолго и бывает, что родные недовольны;",
    "на завтрак мне достаточно чашечки кофе и бутерброда, я не ем плотно по утрам;",
    "я меломан, у меня отличный слух и я люблю слушать хорошую музыку;",
    "я считаю, что спортом надо заниматься в спортклубе, дома можно лишь сделать разминку с утра;",
    "мне нужно место для занятий спортом дома (тренажер, велосипед, гантели);",
    "я терпеть не могу лишних вещей, считаю, если вещью не пользуются долгое время – ее нужно выбросить или отдать кому-то. Не надо захламлять квартиру;",
    "я коллекционирую магнитики, тарелочки, модели машинок, ………………………….",
    "диван нужен, чтобы на нем удобно сидеть, а не закрывать чехлом и сдувать пыль;",
    "я никогда не могу найти свои вещи, разбрасываю по комнате, потом ищу;",
    "я люблю путешествовать и всегда привожу сувениры из каждой страны;",
    "мне кажется стена пустой, если на ней не висит картина или что-то еще;",
    "если я нахожусь в комнате, а мне надо позвать кого из членов семьи (например, к телефону), приходится кричать на всю квартиру;",
    "мне нужен компьютер и собственное рабочее место;",
    "я городской житель, в деревне не могу прожить больше двух дней, хочется в цивилизацию;",
    "я люблю всё натуральное – дерево, камень, мне не нравится пластик, я нахожу его холодным;",
    "я считаю, нам нужно несколько телефонных трубок, вечно приходится искать телефон;",
    "мне нравится, когда на лестничной площадке вкусно пахнет, если кто-то из соседей готовит пирожки или котлеты;",
    "мне надо все напоминать, лучше, если оставят записку на холодильнике;",
    "я люблю всё модное, современное, классика навевает скуку;",
    "хочу, чтобы в доме было как можно меньше лишних вещей, они только пыль собирают."
  ];

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

  function toNumber(v) {
    const s = String(v ?? "").trim().replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function nowIso() {
    try { return new Date().toISOString(); } catch { return ""; }
  }

  function safeParseJson(str) {
    try { return JSON.parse(str); } catch { return null; }
  }

  function isReady() {
    return document.readyState === "complete" || document.readyState === "interactive";
  }

  // ---- KV from Google Sheets (через уже существующий Sheets.fetchTab) ----
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

  // ---- Modal HTML builder ----
  function renderCheckboxGroup(name, options, otherTextName) {
    return `
      <div class="anketa-checkboxes">
        ${options.map(opt => {
          const id = `${name}_${opt.code}`;
          return `
            <div class="anketa-check">
              <input type="checkbox" id="${escAttr(id)}" name="${escAttr(name)}" value="${escAttr(opt.code)}">
              <label for="${escAttr(id)}">${opt.label}</label>
            </div>
          `;
        }).join("")}
      </div>
      ${otherTextName ? `
        <div class="anketa-field" data-anketa-other-wrap="${escAttr(otherTextName)}" hidden>
          <span class="anketa-label">${KITCHEN_OPTIONS.find(o=>o.code==="other")?.label || "Другое"}</span>
          <input class="anketa-input" type="text" name="${escAttr(otherTextName)}" placeholder="">
        </div>
      ` : ""}
    `;
  }

  function buildZones() {
    return `
      <div class="anketa-zones">
        ${ZONES.map(z => `
          <details class="anketa-zone">
            <summary>${z.label}</summary>
            <div class="anketa-grid">
              <label class="anketa-field">
                <span class="anketa-label">Цветовые предпочтения</span>
                <textarea class="anketa-textarea" name="interior_${escAttr(z.id)}_color"></textarea>
              </label>

              <label class="anketa-field">
                <span class="anketa-label">Мебель</span>
                <textarea class="anketa-textarea" name="interior_${escAttr(z.id)}_furniture"></textarea>
              </label>

              <label class="anketa-field">
                <span class="anketa-label">Оформление окон</span>
                <textarea class="anketa-textarea" name="interior_${escAttr(z.id)}_windows"></textarea>
              </label>

              <label class="anketa-field">
                <span class="anketa-label">Аудио-Видео-Техника</span>
                <textarea class="anketa-textarea" name="interior_${escAttr(z.id)}_av"></textarea>
              </label>

              <label class="anketa-field">
                <span class="anketa-label">Освещение</span>
                <textarea class="anketa-textarea" name="interior_${escAttr(z.id)}_light"></textarea>
              </label>
            </div>
          </details>
        `).join("")}
      </div>
    `;
  }

  function buildQuestionPoints() {
    const COLLAPSE_AFTER = 10;
    return `
      <div class="anketa-points is-collapsed" id="anketaPoints">
        <div class="anketa-hint">Можно отмечать выборочно. Это помогает лучше понять привычки и сценарии жизни.</div>

        <div class="anketa-checkboxes">
          ${QUESTION_POINTS.map((text, idx) => {
            const code = `p${String(idx + 1).padStart(2, "0")}`;
            const id = `anketa_point_${code}`;
            const hiddenClass = (idx >= COLLAPSE_AFTER) ? " is-hidden" : "";
            return `
              <div class="anketa-check anketa-point${hiddenClass}">
                <input type="checkbox" id="${escAttr(id)}" name="anketa_points" value="${escAttr(code)}">
                <label for="${escAttr(id)}">${text}</label>
              </div>
            `;
          }).join("")}
        </div>

        <div style="margin-top:12px;">
          <button class="anketa-link" type="button" data-anketa-action="toggle-points">Показать все пункты</button>
        </div>
      </div>
    `;
  }

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
                <div id="anketaProgressLabel">Шаг 1 из 3</div>
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

  function buildSteps() {
    return `
      <!-- STEP 1 -->
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

      <!-- STEP 2 -->
      <section class="anketa-step" data-step="1" aria-labelledby="anketaStep1">
        <h3 id="anketaStep1">Кухня и спальни</h3>
        <p class="anketa-hint">Можно кратко, тезисами.</p>

        <div class="anketa-block">
          <div class="anketa-block__title">Кухня</div>
          <textarea class="anketa-textarea" name="kitchen_requirements" placeholder="Что обязательно / чего нельзя, газ или электричество, готовите ли, хранение."></textarea>
        </div>

        <div class="anketa-block">
          <div class="anketa-block__title">Спальня</div>
          <textarea class="anketa-textarea" name="bedroom_requirements" placeholder="Размер спального места, тумбочки, макияжный столик, рабочее место."></textarea>
        </div>

        <div class="anketa-block">
          <div class="anketa-block__title">Детские</div>
          <textarea class="anketa-textarea" name="children_requirements" placeholder="Размеры кровати, увлечения, спорт/балет, хранение экипировки."></textarea>
        </div>
      </section>

      <!-- STEP 3 -->
      <section class="anketa-step" data-step="2" aria-labelledby="anketaStep2">
        <h3 id="anketaStep2">Гостиная, санузлы, прихожая</h3>
        <p class="anketa-hint">Укажите только то, что важно.</p>

        <div class="anketa-block">
          <div class="anketa-block__title">Гостиная</div>
          <textarea class="anketa-textarea" name="living_requirements" placeholder="TV или проектор, настольные игры, библиотека."></textarea>
        </div>

        <div class="anketa-block">
          <div class="anketa-block__title">Санузлы</div>
          <textarea class="anketa-textarea" name="bathroom_requirements" placeholder="Душ или ванна, 1 или 2 санузла, хранение, стиралка."></textarea>
        </div>

        <div class="anketa-block">
          <div class="anketa-block__title">Хранение и уборка</div>
          <textarea class="anketa-textarea" name="storage_requirements" placeholder="Шкаф для уборки, место для стиралки/сушки, кладовая."></textarea>
        </div>

        <div class="anketa-block">
          <div class="anketa-block__title">Прихожая</div>
          <textarea class="anketa-textarea" name="hallway_requirements" placeholder="Обувь, верхняя одежда, сумки и аксессуары."></textarea>
        </div>

        <label class="anketa-field">
          <span class="anketa-label">Дополнительные комментарии</span>
          <textarea class="anketa-textarea" name="additional_comments" placeholder="Любые важные привычки и пожелания."></textarea>
        </label>

        <div class="anketa-divider"></div>

        <label class="anketa-check" style="margin-top:10px;">
          <input type="checkbox" name="privacy_accept" required>
          <span>
            Я согласен(на) с <a href="#" id="anketaPrivacyLink" target="_blank" rel="noopener">Политикой конфиденциальности</a>
          </span>
        </label>
      </section>

      <!-- STEP SUCCESS (internal) -->
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

  // ---- Modal logic ----
  const state = {
    isOpen: false,
    activeStep: 0,
    totalSteps: 3,
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
    const body = $("#anketaBody", modal);

    // Delegated actions
    modal.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-anketa-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-anketa-action");
      if (!action) return;

      if (action === "close") {
        e.preventDefault();
        closeModal();
      }

      if (action === "back") {
        e.preventDefault();
        goBack();
      }

      if (action === "next") {
        e.preventDefault();
        goNext();
      }

      if (action === "clear") {
        e.preventDefault();
        clearDraft(true);
      }

      if (action === "toggle-points") {
        e.preventDefault();
        togglePoints(modal);
      }

      if (action === "copy-json") {
        e.preventDefault();
        copyLastPayload();
      }
    });

    // Close by clicking backdrop
    const backdrop = $(".anketa-modal__backdrop", modal);
    if (backdrop) {
      backdrop.addEventListener("click", () => closeModal());
    }

    // Esc to close + focus trap
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
        return;
      }
      if (e.key === "Tab") {
        trapFocus(e, modal);
      }
    });

    // Auto-save draft
    const scheduleSave = debounce(() => {
      saveDraft(getFormValues(form), state.activeStep);
    }, 250);

    form.addEventListener("input", scheduleSave);
    form.addEventListener("change", scheduleSave);

  }

  function togglePoints(modal) {
    const box = $("#anketaPoints", modal);
    if (!box) return;

    const btn = modal.querySelector('[data-anketa-action="toggle-points"]');
    const collapsed = box.classList.contains("is-collapsed");

    if (collapsed) {
      box.classList.remove("is-collapsed");
      if (btn) btn.textContent = "Скрыть пункты";
    } else {
      box.classList.add("is-collapsed");
      if (btn) btn.textContent = "Показать все пункты";
      box.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }


  function getCheckedValues(form, name) {
    const els = Array.from(form.elements || [])
      .filter(el => el && el.name === name && el.type === "checkbox" && !el.disabled);
    return els.filter(el => el.checked).map(el => el.value);
  }

  function updateKitchenOtherVisibility(modal) {
    const form = $("#anketaForm", modal);
    if (!form) return;
    const selected = getCheckedValues(form, "kitchen_zone");
    const show = selected.includes("other");
    const wrap = modal.querySelector('[data-anketa-other-wrap="kitchen_zone_other_text"]');
    if (!wrap) return;
    wrap.hidden = !show;
  }

  function trapFocus(e, modal) {
    if (!state.isOpen) return;

    const focusables = getFocusable(modal);
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    const isShift = e.shiftKey;

    if (!isShift && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
    if (isShift && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
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

    // load KV (async) — обновим submitUrl/ссылку на политику
    applyKVToModal(modal);

    // restore draft if exists
    restoreDraft(modal);

    setStep(state.activeStep, modal);

    // focus first field
    const focusables = getFocusable(modal);
    if (focusables.length) focusables[0].focus();
  }

  function closeModal() {
    const modal = document.getElementById("anketaModal");
    if (!modal) return;

    modal.hidden = true;
    document.body.classList.remove("anketa-lock");
    state.isOpen = false;

    // restore focus
    if (state.lastActiveEl && typeof state.lastActiveEl.focus === "function") {
      try { state.lastActiveEl.focus(); } catch (_) {}
    }
  }

  function setStep(stepIndex, modal) {
    const form = $("#anketaForm", modal);
    const steps = $$(".anketa-step", modal);

    // special success step
    if (stepIndex === "success") {
      steps.forEach(s => s.classList.remove("is-active"));
      const success = steps.find(s => s.getAttribute("data-step") === "success");
      if (success) success.classList.add("is-active");
      // hide nav on success
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

    // show nav
    const nav = $(".anketa-nav", modal);
    if (nav) nav.hidden = false;

    // update buttons
    const backBtn = modal.querySelector('[data-anketa-action="back"]');
    const nextBtn = modal.querySelector('[data-anketa-action="next"]');

    if (backBtn) backBtn.textContent = (idx === 0) ? "Закрыть" : "Назад";
    if (nextBtn) nextBtn.textContent = (idx === state.totalSteps - 1) ? "Отправить" : "Далее";

    updateProgressUI(modal, idx + 1, state.totalSteps);

    // save current step to draft
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

    if (state.activeStep === 0) {
      closeModal();
      return;
    }
    setStep(state.activeStep - 1, modal);
  }

  function goNext() {
    const modal = document.getElementById("anketaModal");
    if (!modal) return;

    const form = $("#anketaForm", modal);
    if (!form) return;

    // last step => submit
    if (state.activeStep === state.totalSteps - 1) {
      submit(form, modal);
      return;
    }

    // validate current step only
    const ok = validateCurrentStep(form, modal, state.activeStep);
    if (!ok) return;

    setStep(state.activeStep + 1, modal);
  }

  function validateCurrentStep(form, modal, stepIdx) {
    const step = modal.querySelector(`.anketa-step[data-step="${stepIdx}"]`);
    if (!step) return true;

    const fields = $$("input, textarea, select", step).filter(el => !el.disabled);
    for (const f of fields) {
      // Skip hidden optional fields
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

    // Group elements by name
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

      // default
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
    } catch (e) {
      // ignore
    }
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
    }
  }

  // ---- Submission ----
  function buildPayload(formValues) {
    return {
      form_version: FORM_VERSION,
      submitted_at: nowIso(),

      contact: {
        name: String(formValues.contact_name ?? "").trim(),
        contact: String(formValues.contact_value ?? "").trim()
      },

      family: {
        composition: String(formValues.family_composition ?? "").trim()
      },

      rooms: {
        kitchen: String(formValues.kitchen_requirements ?? "").trim(),
        bedroom: String(formValues.bedroom_requirements ?? "").trim(),
        children: String(formValues.children_requirements ?? "").trim(),
        living: String(formValues.living_requirements ?? "").trim(),
        hallway: String(formValues.hallway_requirements ?? "").trim()
      },

      bathrooms: {
        requirements: String(formValues.bathroom_requirements ?? "").trim()
      },

      storage: {
        requirements: String(formValues.storage_requirements ?? "").trim()
      },

      comments: {
        additional: String(formValues.additional_comments ?? "").trim()
      },

      consent: {
        privacy_accept: !!formValues.privacy_accept
      },

      meta: {
        page_url: (typeof location !== "undefined") ? location.href : "",
        user_agent: (typeof navigator !== "undefined") ? navigator.userAgent : ""
      }
    };
  }

  async function submit(form, modal) {
    const ok = validateCurrentStep(form, modal, state.activeStep);
    if (!ok) return;

    // Ensure required fields (name/email/consent) are present
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const values = getFormValues(form);
    const payload = buildPayload(values);
    state.lastPayload = payload;

    const submitUrl = String(state.submitUrl || "").trim();

    // UI: disable buttons while sending
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
    // if successfully sent, clear draft
    if (mode === "sent") {
      clearDraft(false);
    }
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
      if (showBox) {
        box.textContent = JSON.stringify(state.lastPayload || {}, null, 2);
      }
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

    // fallback
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
    // Lazy-load once per session
    if (!state.kv || !Object.keys(state.kv).length) {
      state.kv = await loadSiteKV();
    }

    // submit URL (for n8n)
    state.submitUrl = String(state.kv.anketa_submit_url || DEFAULT_SUBMIT_URL || "").trim();

    // privacy url
    const privacyUrl = String(state.kv.privacy_url || "").trim();
    const a = $("#anketaPrivacyLink", modal);
    if (a && privacyUrl) a.href = privacyUrl;
  }

  // ---- Open triggers ----
  function bindOpenTriggers() {
    // Click on any link to #anketa
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (!a) return;
      const href = (a.getAttribute("href") || "").trim();
      if (href !== OPEN_HASH) return;

      e.preventDefault();
      openModal(a);
    });

    // Optional: any element with data-anketa-open
    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-anketa-open]");
      if (!t) return;
      e.preventDefault();
      openModal(t);
    });

    // Deep-link: if URL already ends with #anketa
    if (typeof location !== "undefined" && location.hash === OPEN_HASH) {
      openModal(document.querySelector(`a[href="${OPEN_HASH}"]`) || null);
      // remove hash so it doesn't reopen on refresh/scroll
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

    // Preload KV quietly (cache hit if app.js already loaded it)
    state.kv = await loadSiteKV();
    state.submitUrl = String(state.kv.anketa_submit_url || DEFAULT_SUBMIT_URL || "").trim();
  }

  if (isReady()) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
;
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
