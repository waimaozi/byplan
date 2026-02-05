(() => {
  "use strict";

  const MODAL_ID = "reviewTextModal";
  let bound = false;

  // Small, local escaping helper (do NOT rely on globals from other bundles)
  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeOneLine(str) {
    return String(str ?? "").replace(/\s+/g, " ").trim();
  }

  function buildMeta(role, org) {
    const r = normalizeOneLine(role);
    const o = normalizeOneLine(org);
    if (r && o) return `${r} · ${o}`;
    return r || o || "";
  }

  function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    const template = `
      <div class="review-modal__overlay" data-close="1" aria-hidden="true"></div>
      <div class="review-modal__panel" role="dialog" aria-modal="true" aria-labelledby="reviewModalTitle">
        <div class="review-modal__header">
          <div class="review-modal__title" id="reviewModalTitle"></div>
          <button class="review-modal__close" type="button" aria-label="Закрыть">×</button>
        </div>
        <div class="review-modal__role" id="reviewModalRole" style="display:none"></div>
        <div class="review-modal__text" id="reviewModalText"></div>
      </div>
    `;

    if (!modal) {
      modal = document.createElement("div");
      modal.id = MODAL_ID;
      modal.className = "review-modal";
      modal.setAttribute("aria-hidden", "true");
      modal.innerHTML = template;
      document.body.appendChild(modal);
      return modal;
    }

    // If modal exists but missing crucial parts, re-hydrate it.
    const hasPanel = modal.querySelector(".review-modal__panel");
    const hasTitle = modal.querySelector("#reviewModalTitle, .review-modal__title");
    const hasText = modal.querySelector("#reviewModalText, .review-modal__text");
    if (!hasPanel || !hasTitle || !hasText) {
      modal.innerHTML = template;
    }
    if (!modal.classList.contains("review-modal")) modal.classList.add("review-modal");
    if (!modal.hasAttribute("aria-hidden")) modal.setAttribute("aria-hidden", "true");
    return modal;
  }

  function openModal({ title, meta, text }) {
    const modal = ensureModal();

    const titleEl = modal.querySelector("#reviewModalTitle") || modal.querySelector(".review-modal__title");
    const roleEl  = modal.querySelector("#reviewModalRole") || modal.querySelector(".review-modal__role");
    const textEl  = modal.querySelector("#reviewModalText") || modal.querySelector(".review-modal__text");

    if (titleEl) titleEl.textContent = title || "Отзыв";

    const metaText = normalizeOneLine(meta);
    if (roleEl) {
      roleEl.textContent = metaText;
      roleEl.style.display = metaText ? "" : "none";
    }

    if (textEl) {
      const safe = escapeHtml(String(text ?? "")).replace(/\n/g, "<br>");
      textEl.innerHTML = safe;
    }

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    const closeBtn = modal.querySelector(".review-modal__close");
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function closeModal() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;

    // Move focus away BEFORE we hide the modal (prevents aria-hidden warning)
    try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch(e){}

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function getTextFromCard(card) {
    if (!card) return "";
    const el =
      card.querySelector(".review-card__text") ||
      card.querySelector(".review__text") ||
      card.querySelector(".review-slide__text") ||
      card.querySelector(".review-text-full") ||
      card.querySelector(".review-text");
    return el ? el.textContent.trim() : "";
  }

  function getTitleFromCard(card) {
    if (!card) return "";
    const el =
      card.querySelector(".review-card__name") ||
      card.querySelector(".review__name") ||
      card.querySelector(".review-slide__name") ||
      card.querySelector(".review-name") ||
      card.querySelector("h3");
    return el ? el.textContent.trim() : "";
  }

  function getMetaFromCard(card) {
    if (!card) return "";
    const el =
      card.querySelector(".review-card__role") ||
      card.querySelector(".review__role") ||
      card.querySelector(".review-slide__role") ||
      card.querySelector(".review-role");
    return el ? el.textContent.trim() : "";
  }

  async function fetchReviewsFromSheet() {
    const id = (window.cfg && window.cfg.SHEET_ID) || (typeof cfg !== "undefined" && cfg && cfg.SHEET_ID);
    if (!id) return null;

    const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq?tqx=out:json&sheet=reviews`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load reviews sheet: ${res.status}`);
    const raw = await res.text();

    // gviz wraps JSON as: google.visualization.Query.setResponse({...});
    const jsonStr = raw.substring(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const data = JSON.parse(jsonStr);

    const table = data.table;
    const cols = (table.cols || []).map((c) => (c.label || "").trim());

    const rows = (table.rows || []).map((r) => {
      const obj = {};
      cols.forEach((label, i) => {
        const cell = r.c && r.c[i];
        const val = cell && (cell.v !== null && cell.v !== undefined) ? cell.v : "";
        obj[label] = val;
      });
      return obj;
    });

    // keep only enabled if that column exists
    return rows.filter((r) => {
      if (!("is_enabled" in r)) return true;
      const v = String(r.is_enabled).trim().toLowerCase();
      return v === "1" || v === "true" || v === "yes" || v === "y" || v === "да";
    });
  }

  function buildIndex(reviews) {
    const byId = new Map();
    const byName = new Map();
    (reviews || []).forEach((r) => {
      const id = normalizeOneLine(r.id);
      const name = normalizeOneLine(r.name);
      if (id) byId.set(id, r);
      if (name && !byName.has(name)) byName.set(name, r);
    });
    return { byId, byName };
  }

  function hydrateCardsWithReviews(index) {
    const cards = document.querySelectorAll(".review-card, .review, .review-slide");
    cards.forEach((card) => {
      const id = normalizeOneLine(card.getAttribute("data-review-id") || card.dataset.reviewId);
      const name = normalizeOneLine(getTitleFromCard(card));
      const row = (id && index.byId.get(id)) || (name && index.byName.get(name));
      if (!row) return;

      // Update meta line with role + company/city (if present)
      const meta = buildMeta(row.role, row.company_or_city || row.company || row.organization || row.org || row.city);
      let metaEl =
        card.querySelector(".review-card__role") ||
        card.querySelector(".review__role") ||
        card.querySelector(".review-slide__role");

      // If the layout doesn't have a meta element yet (some templates), create it right after the name.
      if (!metaEl && meta) {
        const nameEl = card.querySelector(".review-card__name, .review__name, .review-slide__name");
        if (nameEl) {
          metaEl = document.createElement("div");
          if (card.classList.contains("review-card")) metaEl.className = "review-card__role";
          else if (card.classList.contains("review")) metaEl.className = "review__role";
          else metaEl.className = "review-slide__role";
          nameEl.insertAdjacentElement("afterend", metaEl);
        }
      }

      if (metaEl) {
        metaEl.textContent = meta;
        metaEl.style.display = meta ? "" : "none";
      }

      // Put the full payload on the "more" button for reliable modal opening
      const moreBtn = card.querySelector(".review-more") || card.querySelector(".review-card__more");
      if (moreBtn) {
        if (!moreBtn.dataset.title) moreBtn.dataset.title = normalizeOneLine(row.name) || name;
        if (!moreBtn.dataset.role) moreBtn.dataset.role = normalizeOneLine(row.role || "");
        if (!moreBtn.dataset.org) moreBtn.dataset.org = normalizeOneLine(row.company_or_city || "");
        if (!moreBtn.dataset.full) moreBtn.dataset.full = String(row.text || "").trim();
      }
    });
  }

  function bind(reviewIndex) {
    if (bound) return;
    bound = true;

    // Ensure modal exists early (so CSS can apply consistently)
    ensureModal();

    // Open modal on "read more"
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".review-more, .review-card__more");
      if (!btn) return;

      e.preventDefault();

      const card = btn.closest(".review-card, .review-slide, .review");
      const title = normalizeOneLine(btn.dataset.title) || getTitleFromCard(card) || "Отзыв";
      const role  = normalizeOneLine(btn.dataset.role)  || "";
      const org   = normalizeOneLine(btn.dataset.org)   || "";
      const meta  = buildMeta(role, org) || getMetaFromCard(card);

      const text =
        (btn.dataset.full && String(btn.dataset.full).trim()) ||
        (btn.dataset.text && String(btn.dataset.text).trim()) ||
        getTextFromCard(card);

      openModal({ title, meta, text });
    });

    // Close modal (overlay click or close button)
    document.addEventListener("click", (e) => {
      const modal = document.getElementById(MODAL_ID);
      if (!modal || !modal.classList.contains("is-open")) return;

      if (e.target.closest(`#${MODAL_ID} .review-modal__close`) || e.target.closest(`#${MODAL_ID} [data-close="1"]`)) {
        e.preventDefault();
        closeModal();
      }
    });

    // Escape key closes modal
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });

    // If we already have fetched reviews — hydrate cards immediately
    if (reviewIndex) {
      hydrateCardsWithReviews(reviewIndex);
    }
  }

  async function init() {
    try {
      // Bind immediately so UI doesn't "freeze" if network is slow
      bind(null);

      const reviews = await fetchReviewsFromSheet();
      if (!reviews) return;

      const idx = buildIndex(reviews);
      hydrateCardsWithReviews(idx);
    } catch (err) {
      console.warn("[reviews-more-modal] init failed:", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();