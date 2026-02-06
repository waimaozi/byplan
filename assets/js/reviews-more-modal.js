/* reviews-more-modal.js (v5) — single owner modal + optional case preview (Было/Стало)
   Fixes:
   - prevents double-open / double-close by intercepting clicks in CAPTURE phase on window and stopping propagation
   - reliably hydrates cards with role/org + payload from Google Sheets
   Features:
   - optional case preview (before/after) in card + in modal, if columns exist in the sheet
*/
(() => {
  "use strict";

  // ---------- helpers ----------
  const TEXT_MODAL_ID = "reviewTextModalV2";

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[m]);
  }
  // Normalize relative assets for GitHub Pages subpaths and local
  function normUrl(url) {
    const u = String(url ?? "").trim();
    if (!u) return "";
    if (/^https?:\/\//i.test(u) || u.startsWith("data:")) return u;
    // Keep explicit absolute paths as-is
    if (u.startsWith("/")) return u;
    // Otherwise keep it relative to the current page (important for /byplan/ on GitHub Pages)
    return u.replace(/^\.\//, "");
  }

  function textToHtml(text) {
    const safe = escapeHtml(text).trim();
    if (!safe) return "";
    // paragraphs on empty lines, <br> on single new line
    const html = safe
      .replace(/\r\n/g, "\n")
      .replace(/\n{2,}/g, "</p><p>")
      .replace(/\n/g, "<br>");
    return `<p>${html}</p>`;
  }

  function setText(el, value) {
    if (!el) return;
    el.textContent = value ?? "";
  }

  function setDisplay(el, show) {
    if (!el) return;
    el.style.display = show ? "" : "none";
  }

  function coalesceDefined(...vals) {
    for (const v of vals) {
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  }

  function coalesceNonEmpty(...vals) {
    for (const v of vals) {
      const s = String(v ?? "").trim();
      if (s) return s;
    }
    return "";
  }

  // ---------- modal (text) ----------
  let lastFocus = null;

  function ensureTextModal() {
    let modal = document.getElementById(TEXT_MODAL_ID);
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = TEXT_MODAL_ID;
    modal.className = "review-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.hidden = true;

    modal.innerHTML = `
      <div class="review-modal__backdrop" data-close="1"></div>
      <div class="review-modal__content" role="dialog" aria-modal="true" aria-labelledby="${TEXT_MODAL_ID}__title">
        <button class="review-modal__close" type="button" data-close="1" aria-label="Закрыть">×</button>
        <div class="review-modal__header">
          <div class="review-modal__name" id="${TEXT_MODAL_ID}__title"></div>
          <div class="review-modal__role"></div>
        </div>

        <div class="review-modal__case" hidden>
          <div class="review-case__top">
            <div class="review-case__tabs" role="tablist" aria-label="Было / Стало">
              <button type="button" class="review-case__tab is-active" data-case-view="after" role="tab" aria-selected="true">Стало</button>
              <button type="button" class="review-case__tab" data-case-view="before" role="tab" aria-selected="false">Было</button>
            </div>
          </div>

          <div class="review-case__frame">
            <img class="review-case__img" alt="" loading="lazy" decoding="async">
          </div>
          <div class="review-case__caption"></div>
          <div class="review-case__comment"></div>
        </div>

        <div class="review-modal__text"></div>
      </div>
    `;
    document.body.appendChild(modal);

    // close actions
    modal.addEventListener("click", (e) => {
      const closeBtn = e.target.closest("[data-close='1']");
      if (!closeBtn) return;

      // IMPORTANT: stop other handlers (legacy) from seeing this click
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();

      closeTextModal();
    });

    // Esc close
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isTextModalOpen()) {
        e.preventDefault();
        closeTextModal();
      }
    });

    // Toggle было/стало inside modal
    modal.addEventListener("click", (e) => {
      const tab = e.target.closest(".review-case__tab");
      if (!tab) return;

      e.preventDefault();
      e.stopPropagation();

      const caseBox = tab.closest(".review-modal__case");
      if (!caseBox) return;

      const view = tab.getAttribute("data-case-view");
      setCaseView(caseBox, view);
    });

    return modal;
  }

  function isTextModalOpen() {
    const modal = document.getElementById(TEXT_MODAL_ID);
    return !!(modal && modal.classList.contains("is-open"));
  }

  function lockBody() {
    document.body.classList.add("modal-open");
  }
  function unlockBodyIfNoModals() {
    // If you ever add other modals, include them here.
    const anyOpen = document.querySelector(".review-modal.is-open");
    if (!anyOpen) document.body.classList.remove("modal-open");
  }

  function openTextModal(payload) {
    const modal = ensureTextModal();

    // focus restore
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const name = coalesceNonEmpty(payload.name);
    const role = coalesceNonEmpty(payload.role);
    const org = coalesceNonEmpty(payload.org);

    setText(modal.querySelector(".review-modal__name"), name);

    const roleLine = [role, org].filter(Boolean).join(" · ");
    const roleEl = modal.querySelector(".review-modal__role");
    setText(roleEl, roleLine);
    setDisplay(roleEl, !!roleLine);

    // Case block (optional)
    const caseBox = modal.querySelector(".review-modal__case");
    const beforeUrl = normUrl(payload.case_before_url || payload.case_before || payload.before_url);
    const afterUrl  = normUrl(payload.case_after_url  || payload.case_after  || payload.after_url);

    const beforeCaption = coalesceNonEmpty(payload.case_before_caption, payload.before_caption);
    const afterCaption  = coalesceNonEmpty(payload.case_after_caption,  payload.after_caption);
    const comment       = coalesceNonEmpty(payload.case_comment, payload.case_note, payload.comment);

    if (beforeUrl && afterUrl) {
      caseBox.hidden = false;
      caseBox.dataset.caseBefore = beforeUrl;
      caseBox.dataset.caseAfter = afterUrl;
      caseBox.dataset.caseBeforeCaption = beforeCaption;
      caseBox.dataset.caseAfterCaption = afterCaption;
      caseBox.dataset.caseComment = comment;

      // default view = after
      setCaseView(caseBox, "after");
    } else {
      caseBox.hidden = true;
      caseBox.dataset.caseBefore = "";
      caseBox.dataset.caseAfter = "";
      caseBox.dataset.caseBeforeCaption = "";
      caseBox.dataset.caseAfterCaption = "";
      caseBox.dataset.caseComment = "";
    }

    // Text
    const textHtml = textToHtml(payload.text);
    const textEl = modal.querySelector(".review-modal__text");
    textEl.innerHTML = textHtml || "";

    // show
    modal.hidden = false;
    requestAnimationFrame(() => {
      modal.setAttribute("aria-hidden", "false");
      modal.classList.add("is-open");
      lockBody();
      const closeBtn = modal.querySelector(".review-modal__close");
      if (closeBtn) closeBtn.focus({ preventScroll: true });
    });
  }

  function closeTextModal() {
    const modal = document.getElementById(TEXT_MODAL_ID);
    if (!modal) return;

    modal.setAttribute("aria-hidden", "true");
    modal.classList.remove("is-open");

    // allow transition then hide
    window.setTimeout(() => {
      modal.hidden = true;
      unlockBodyIfNoModals();

      // restore focus
      if (lastFocus && document.contains(lastFocus)) {
        try { lastFocus.focus({ preventScroll: true }); } catch (_) {}
      }
      lastFocus = null;
    }, 220);
  }

  // ---------- Case view helper (works for modal case box + card case previews) ----------
  function setCaseView(container, view) {
    if (!container) return;
    const beforeUrl = container.dataset.caseBefore || "";
    const afterUrl = container.dataset.caseAfter || "";
    if (!beforeUrl || !afterUrl) return;

    const img = container.querySelector(".review-case__img, .review-card-case__img");
    const captionEl = container.querySelector(".review-case__caption, .review-card-case__caption");
    const commentEl = container.querySelector(".review-case__comment");

    const isAfter = view === "after";
    const url = isAfter ? afterUrl : beforeUrl;

    if (img) {
      img.src = url;
      img.alt = isAfter ? "План: стало" : "План: было";
    }

    if (captionEl) {
      const cap = isAfter ? (container.dataset.caseAfterCaption || "") : (container.dataset.caseBeforeCaption || "");
      captionEl.textContent = cap;
      captionEl.style.display = cap ? "" : "none";
    }

    if (commentEl) {
      const c = container.dataset.caseComment || "";
      commentEl.textContent = c;
      commentEl.style.display = c ? "" : "none";
    }

    // tab states
    const tabs = container.querySelectorAll("[data-case-view]");
    tabs.forEach((t) => {
      const active = t.getAttribute("data-case-view") === (isAfter ? "after" : "before");
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  // ---------- data (Google Sheets) ----------
  async function ensureLookupStarted() {
    if (window.__BYPLAN_REVIEWS_LOOKUP_STARTED__) return;
    window.__BYPLAN_REVIEWS_LOOKUP_STARTED__ = true;

    try {
      if (!window.cfg || !cfg.SHEET_ID || String(cfg.SHEET_ID).includes("PASTE_")) {
        console.warn("[reviews] SHEET_ID is not set, skip reviews lookup.");
        return;
      }
      if (typeof loadSheet !== "function") {
        console.warn("[reviews] loadSheet() is not available. Check assets/js/sheets.js");
        return;
      }

      const cache = (window.__BYPLAN_SHEETS_CACHE__ = window.__BYPLAN_SHEETS_CACHE__ || {});
      if (Array.isArray(cache.reviews) && cache.reviews.length) return;

      // IMPORTANT: exact sheet tab name is "reviews"
      const rows = await loadSheet(cfg.SHEET_ID, "reviews");
      cache.reviews = Array.isArray(rows) ? rows : [];
    } catch (err) {
      console.warn("[reviews] lookup failed:", err);
    }
  }

  function getReviewsRecords() {
    const cache = window.__BYPLAN_SHEETS_CACHE__;
    return (cache && Array.isArray(cache.reviews)) ? cache.reviews : [];
  }

  function normalizeNameKey(s) {
    return String(s ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function findRecordByName(nameText) {
    const key = normalizeNameKey(nameText);
    if (!key) return null;

    const records = getReviewsRecords();
    if (!records.length) return null;

    // match exact
    let rec = records.find((r) => normalizeNameKey(r.name) === key);
    if (rec) return rec;

    // fallback: contains
    rec = records.find((r) => normalizeNameKey(r.name).includes(key) || key.includes(normalizeNameKey(r.name)));
    return rec || null;
  }

  function extractNameFromCard(card) {
    if (!card) return "";
    const nameEl =
      card.querySelector(".review__name, .review-card__name, .review-name") ||
      card.querySelector("h3, h4, strong");
    return nameEl ? nameEl.textContent.trim() : "";
  }

  function applyRecordToCard(card, rec) {
    if (!card || !rec) return;

    // Columns (based on template): name, role, company_or_city, text
    // Keep it flexible: accept org/company/city synonyms if user renamed columns.
    const name = coalesceNonEmpty(rec.name, extractNameFromCard(card));
    const role = coalesceDefined(rec.role, rec.position, rec.title, rec["роль"], rec["должность"]);
    const org  = coalesceDefined(rec.company_or_city, rec.org, rec.company, rec.city, rec["организация"], rec["город"]);

    const text = coalesceDefined(rec.text, rec.review, rec.body, rec["отзыв"]);

    // IMPORTANT: If rec.role/org exist but are empty strings, respect emptiness (do NOT fallback to DOM).
    const roleText = role === undefined ? "" : String(role).trim();
    const orgText  = org  === undefined ? "" : String(org).trim();

    // Update visible fields in card
    const nameEl = card.querySelector(".review__name, .review-card__name, .review-name");
    if (nameEl) nameEl.textContent = name;

    const roleEl = card.querySelector(".review__role, .review-card__role, .review-role");
    if (roleEl) roleEl.textContent = roleText;

    const orgEl = card.querySelector(".review__org, .review-card__org, .review-org");
    if (orgEl) orgEl.textContent = orgText;

    // Ensure payload on "Читать полностью" button
    const btn =
      card.querySelector("[data-review-more], .review-card__more, .review__more, [data-review-more-btn]") ||
      card.querySelector("button, a");
    if (btn) {
      const payload = {
        name,
        role: roleText,
        org: orgText,
        text: text === undefined || text === null ? "" : String(text),

        // optional case fields (safe if columns absent)
        case_before_url: coalesceNonEmpty(rec.case_before_url, rec.case_before, rec.before_url),
        case_after_url:  coalesceNonEmpty(rec.case_after_url,  rec.case_after,  rec.after_url),
        case_before_caption: coalesceNonEmpty(rec.case_before_caption, rec.before_caption),
        case_after_caption:  coalesceNonEmpty(rec.case_after_caption,  rec.after_caption),
        case_comment: coalesceNonEmpty(rec.case_comment, rec.case_note, rec.comment),
      };

      btn.setAttribute("data-review-more", encodeURIComponent(JSON.stringify(payload)));
      btn.setAttribute("data-review-name", name);
    }

    // Optional case preview in the card itself
    const beforeUrl = normUrl(coalesceNonEmpty(rec.case_before_url, rec.case_before, rec.before_url));
    const afterUrl  = normUrl(coalesceNonEmpty(rec.case_after_url,  rec.case_after,  rec.after_url));
    if (beforeUrl && afterUrl) {
      upsertCardCasePreview(card, {
        beforeUrl,
        afterUrl,
        beforeCaption: coalesceNonEmpty(rec.case_before_caption, rec.before_caption),
        afterCaption:  coalesceNonEmpty(rec.case_after_caption,  rec.after_caption),
      });
    } else {
      removeCardCasePreview(card);
    }
  }

  function upsertCardCasePreview(card, data) {
    if (!card) return;

    const existing = card.querySelector(".review-card-case");
    const beforeCaption = data.beforeCaption || "";
    const afterCaption = data.afterCaption || "";

    // Keep data on container for toggle logic
    const html = `
      <div class="review-card-case" data-case-before="${escapeHtml(data.beforeUrl)}" data-case-after="${escapeHtml(data.afterUrl)}"
           data-case-before-caption="${escapeHtml(beforeCaption)}" data-case-after-caption="${escapeHtml(afterCaption)}">
        <div class="review-card-case__tabs" role="tablist" aria-label="Было / Стало">
          <button type="button" class="review-card-case__tab is-active" data-case-view="after" role="tab" aria-selected="true">Стало</button>
          <button type="button" class="review-card-case__tab" data-case-view="before" role="tab" aria-selected="false">Было</button>
        </div>
        <div class="review-card-case__frame">
          <img class="review-card-case__img" src="${escapeHtml(data.afterUrl)}" alt="План: стало" loading="lazy" decoding="async">
        </div>
        <div class="review-card-case__caption" style="${afterCaption ? "" : "display:none;"}">${escapeHtml(afterCaption)}</div>
      </div>
    `;

    if (existing) {
      existing.outerHTML = html;
    } else {
      // Insert after header if possible
      const head = card.querySelector(".review-card__head, .review__head, header");
      if (head && head.parentNode) {
        head.insertAdjacentHTML("afterend", html);
      } else {
        card.insertAdjacentHTML("afterbegin", html);
      }
    }

    // dataset mirror for setCaseView helper (optional)
    const box = card.querySelector(".review-card-case");
    if (box) {
      box.dataset.caseBefore = data.beforeUrl;
      box.dataset.caseAfter = data.afterUrl;
      box.dataset.caseBeforeCaption = beforeCaption;
      box.dataset.caseAfterCaption = afterCaption;
    }
  }

  function removeCardCasePreview(card) {
    const box = card ? card.querySelector(".review-card-case") : null;
    if (box) box.remove();
  }

  // ---------- hydration (fill role/org/payload/case previews for all cards) ----------
  let hydrateScheduled = false;
  let hydrateRunning = false;

  function scheduleHydrate() {
    if (hydrateScheduled) return;
    hydrateScheduled = true;
    window.setTimeout(async () => {
      hydrateScheduled = false;
      await hydrateAllCards();
    }, 50);
  }

  async function hydrateAllCards() {
    if (hydrateRunning) return;
    hydrateRunning = true;

    try {
      await ensureLookupStarted();
      const records = getReviewsRecords();
      if (!records.length) return;

      const cards = Array.from(document.querySelectorAll(".review-card, .review"));
      if (!cards.length) return;

      for (const card of cards) {
        const name = extractNameFromCard(card);
        if (!name) continue;
        const rec = findRecordByName(name);
        if (!rec) continue;
        applyRecordToCard(card, rec);
      }
    } finally {
      hydrateRunning = false;
    }
  }

  function observeReviews() {
    const root = document.getElementById("reviewsGrid") || document.querySelector("#reviews .reviews, #reviews .grid.reviews");
    if (!root || !("MutationObserver" in window)) {
      // still attempt once
      scheduleHydrate();
      return;
    }
    const obs = new MutationObserver(() => scheduleHydrate());
    obs.observe(root, { childList: true, subtree: true });
    scheduleHydrate();
  }

  // ---------- interactions ----------
  // 1) Open modal (capture phase on window — prevents legacy handlers)
  window.addEventListener(
    "click",
    async (e) => {
      const btn = e.target.closest("[data-review-more], .review-card__more, .review__more, [data-review-more-btn]");
      if (!btn) return;

      // IMPORTANT: kill other handlers (legacy modal / carousel)
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();

      // Ensure card has payload (hydrate only this card if needed)
      let payload = null;
      const raw = btn.getAttribute("data-review-more");
      if (raw) {
        try {
          payload = JSON.parse(decodeURIComponent(raw));
        } catch (_) {
          payload = null;
        }
      }

      if (!payload) {
        await ensureLookupStarted();
        const card = btn.closest(".review-card, .review, article");
        const name = extractNameFromCard(card);
        const rec = findRecordByName(name);
        if (card && rec) applyRecordToCard(card, rec);

        const raw2 = btn.getAttribute("data-review-more");
        if (raw2) {
          try { payload = JSON.parse(decodeURIComponent(raw2)); } catch (_) { payload = null; }
        }
      }

      if (!payload) {
        // last fallback: use DOM
        const card = btn.closest(".review-card, .review, article");
        payload = {
          name: extractNameFromCard(card),
          role: "",
          org: "",
          text: "",
        };
      }

      openTextModal(payload);
    },
    true
  );

  // 2) Toggle case preview in card (event delegation)
  document.addEventListener("click", (e) => {
    const tab = e.target.closest(".review-card-case__tab");
    if (!tab) return;

    e.preventDefault();
    e.stopPropagation();

    const box = tab.closest(".review-card-case");
    if (!box) return;

    const view = tab.getAttribute("data-case-view");
    setCaseView(box, view);
  });

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observeReviews);
  } else {
    observeReviews();
  }
})();
