/* reviews-more-modal.js
   Opens a "Read full review" modal for review cards.
   - Works with both old/new card markups
   - Tries to fill name/role/company/text from:
     1) data-* attributes on the card
     2) elements inside the card
     3) (optional) Google Sheets "reviews" tab via cfg.SHEET_ID lookup
*/
(() => {
  "use strict";

  const MODAL_ID = "reviewTextModal";
  const SHEET_TAB = "reviews";

  let lastActiveEl = null;
  let reviewsLookupPromise = null;
  let reviewsByName = new Map();
  let reviewsById = new Map();

  function norm(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeTextToHtml(text) {
    const t = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (!t) return "";
    // Split into paragraphs; keep single newlines as breaks inside paragraph for better readability
    const paragraphs = t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (!paragraphs.length) return "";
    return paragraphs
      .map((p) => {
        const withBreaks = p.split("\n").map((l) => escapeHtml(l)).join("<br>");
        return `<p>${withBreaks}</p>`;
      })
      .join("");
  }

  function truthy(v) {
    if (v === true) return true;
    if (typeof v === "number") return v !== 0;
    const s = String(v || "").trim().toLowerCase();
    if (!s) return false;
    return ["1", "true", "yes", "y", "да", "ok"].includes(s);
  }

  function pick(obj, keys) {
    for (const k of keys) {
      if (!k) continue;
      if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== null && obj[k] !== undefined && String(obj[k]).trim() !== "") {
        return obj[k];
      }
    }
    return "";
  }

  async function loadReviewsLookup() {
    try {
      const cfg = window.cfg || window.CFG || {};
      const sheetId = cfg.SHEET_ID || cfg.sheetId || "";
      if (!sheetId) return;

      const url =
        "https://docs.google.com/spreadsheets/d/" +
        encodeURIComponent(sheetId) +
        "/gviz/tq?tqx=out:json&sheet=" +
        encodeURIComponent(SHEET_TAB);

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;

      const txt = await res.text();
      const jsonStr = txt.substring(txt.indexOf("{"), txt.lastIndexOf("}") + 1);
      const data = JSON.parse(jsonStr);
      const table = data && data.table;
      if (!table || !table.cols || !table.rows) return;

      const headers = table.cols.map((c) => (c && c.label ? String(c.label).trim() : ""));
      const rows = table.rows.map((r) => {
        const obj = {};
        headers.forEach((h, i) => {
          const cell = r && r.c ? r.c[i] : null;
          obj[h] = cell && cell.v !== undefined && cell.v !== null ? cell.v : "";
        });
        return obj;
      });

      // Build lookups
      const byName = new Map();
      const byId = new Map();

      rows.forEach((r) => {
        // If there's an enable flag — respect it. If not — treat as enabled.
        const enabledRaw = pick(r, ["is_enabled", "enabled", "isEnabled", "publish", "published"]);
        const isEnabled = enabledRaw === "" ? true : truthy(enabledRaw);
        if (!isEnabled) return;

        const id = String(pick(r, ["id", "ID"])).trim();
        const name = String(pick(r, ["name", "Name", "fio", "ФИО", "клиент"])).trim();

        if (id) byId.set(id, r);
        if (name) byName.set(norm(name), r);
      });

      reviewsByName = byName;
      reviewsById = byId;
    } catch (e) {
      // Silent fail — modal still works from DOM/data-attrs.
      console.warn("[reviews-more-modal] lookup load failed:", e);
    }
  }

  function ensureLookupStarted() {
    if (!reviewsLookupPromise) {
      reviewsLookupPromise = loadReviewsLookup();
    }
    return reviewsLookupPromise;
  }

  function ensureModalMarkup() {
    let modalEl = document.getElementById(MODAL_ID);
    if (modalEl) return modalEl;

    modalEl = document.createElement("div");
    modalEl.id = MODAL_ID;
    modalEl.className = "review-modal";
    modalEl.setAttribute("aria-hidden", "true");

    modalEl.innerHTML = `
      <div class="review-modal__overlay" data-review-modal-overlay></div>

      <div class="review-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="reviewModalName">
        <button class="review-modal__close" type="button" data-review-modal-close aria-label="Закрыть">×</button>

        <div class="review-modal__meta">
          <div class="review-modal__name" id="reviewModalName"></div>
          <div class="review-modal__role" id="reviewModalRole"></div>
        </div>

        <div class="review-modal__text" id="reviewModalText"></div>
      </div>
    `;

    document.body.appendChild(modalEl);

    const overlay = modalEl.querySelector("[data-review-modal-overlay]");
    const closeBtn = modalEl.querySelector("[data-review-modal-close]");

    if (overlay) overlay.addEventListener("click", closeModal);
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modalEl.classList.contains("is-open")) closeModal();
    });

    return modalEl;
  }

  function openModal(payload) {
    const modalEl = ensureModalMarkup();
    lastActiveEl = document.activeElement;

    const nameEl = modalEl.querySelector("#reviewModalName");
    const roleEl = modalEl.querySelector("#reviewModalRole");
    const textEl = modalEl.querySelector("#reviewModalText");

    const name = String(payload.name || "").trim();
    const role = String(payload.role || "").trim();
    const text = String(payload.text || "").trim();

    if (nameEl) nameEl.textContent = name || "Отзыв";
    if (roleEl) roleEl.textContent = role;
    if (textEl) textEl.innerHTML = safeTextToHtml(text);

    modalEl.classList.add("is-open");
    modalEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    const closeBtn = modalEl.querySelector("[data-review-modal-close]");
    if (closeBtn && typeof closeBtn.focus === "function") {
      closeBtn.focus({ preventScroll: true });
    }
  }

  function closeModal() {
    const modalEl = document.getElementById(MODAL_ID);
    if (!modalEl) return;

    // Move focus away before hiding — avoids aria-hidden warning in Chrome
    if (lastActiveEl && typeof lastActiveEl.focus === "function") {
      try {
        lastActiveEl.focus({ preventScroll: true });
      } catch (_) {}
    }

    modalEl.classList.remove("is-open");
    modalEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function getTextFromElement(el) {
    if (!el) return "";
    // Prefer innerText to keep <br> as newlines where possible
    const t = (el.innerText || el.textContent || "").trim();
    return t;
  }

  function getReviewDataFromCard(card) {
    if (!card) return { name: "", role: "", text: "" };

    // 1) data-* attributes (preferred)
    const ds = card.dataset || {};
    const dataName = ds.reviewName || card.getAttribute("data-review-name") || "";
    const dataRole = ds.reviewRole || card.getAttribute("data-review-role") || "";
    const dataOrg = ds.reviewOrg || ds.reviewCompany || ds.reviewCompanyOrCity || card.getAttribute("data-review-org") || "";
    const dataText =
      ds.reviewFull ||
      ds.reviewText ||
      card.getAttribute("data-review-full") ||
      card.getAttribute("data-review-text") ||
      "";

    // 2) DOM fallbacks
    const nameEl =
      card.querySelector(".review-card__name, .review__name, .review__title, h3, h4") || null;
    const roleEl =
      card.querySelector(".review-card__role, .review__role, .review__meta, .review-card__meta, .review__subtitle") || null;
    const textEl =
      card.querySelector(".review__full, .review-card__full, .review__text, .review-card__text, .review__body, p") || null;

    const name = (String(dataName).trim() || (nameEl ? String(nameEl.textContent || "").trim() : "")).trim();
    const roleFromDom = roleEl ? String(roleEl.textContent || "").trim() : "";
    const roleParts = [String(dataRole).trim(), String(dataOrg).trim()].filter(Boolean);
    const role = (roleParts.join(" · ") || roleFromDom).trim();

    let text = String(dataText).trim();
    if (!text) text = getTextFromElement(textEl);
    return { name, role, text };
  }

  function findRecordForCard(card) {
    if (!card) return null;

    const id = (card.dataset && (card.dataset.reviewId || card.dataset.id)) || card.getAttribute("data-review-id") || "";
    if (id && reviewsById && reviewsById.has(id)) return reviewsById.get(id);

    const name = getReviewDataFromCard(card).name;
    const key = norm(name);
    if (key && reviewsByName && reviewsByName.has(key)) return reviewsByName.get(key);

    return null;
  }

  function applyRecordToCard(card, rec) {
    if (!card || !rec) return;

    const name = String(pick(rec, ["name", "Name"])).trim();
    const role = String(pick(rec, ["role", "Role"])).trim();
    const org = String(pick(rec, ["company_or_city", "company", "org", "organization", "city"])).trim();
    const text = String(pick(rec, ["text", "Text", "review", "отзыв"])).trim();
    const id = String(pick(rec, ["id", "ID"])).trim();

    // Store for modal
    card.dataset.reviewName = name || card.dataset.reviewName || "";
    card.dataset.reviewRole = role || card.dataset.reviewRole || "";
    card.dataset.reviewOrg = org || card.dataset.reviewOrg || "";
    card.dataset.reviewFull = text || card.dataset.reviewFull || "";
    if (id) card.dataset.reviewId = id;

    // Ensure role line is present on card (short view)
    const roleLine = [role, org].filter(Boolean).join(" · ").trim();
    if (roleLine) {
      const existing =
        card.querySelector(".review-card__role, .review__role, .review__meta") || null;

      if (existing) {
        // Only fill if empty / missing org
        if (!String(existing.textContent || "").trim()) {
          existing.textContent = roleLine;
        }
      } else {
        // Insert after the name
        const nameEl = card.querySelector(".review-card__name, .review__name, .review__title, h3, h4");
        const div = document.createElement("div");
        div.className = "review-card__role";
        div.textContent = roleLine;
        if (nameEl && nameEl.parentNode) {
          nameEl.insertAdjacentElement("afterend", div);
        } else {
          card.insertAdjacentElement("afterbegin", div);
        }
      }
    }

    // Mark as enhanced to avoid repeats
    card.dataset.reviewEnhanced = "1";
  }

  function getReviewsRoot() {
    return document.getElementById("reviewsGrid") || document.getElementById("reviews") || document.body;
  }

  let enhanceScheduled = false;

  async function enhanceCardsNow() {
    await ensureLookupStarted();
    const root = getReviewsRoot();
    const cards = root.querySelectorAll(".review, .review-card, article.review");
    cards.forEach((card) => {
      if (!card || (card.dataset && card.dataset.reviewEnhanced === "1")) return;
      const rec = findRecordForCard(card);
      if (rec) applyRecordToCard(card, rec);
    });
  }

  function scheduleEnhanceCards() {
    if (enhanceScheduled) return;
    enhanceScheduled = true;
    // Run in next microtask to batch multiple DOM updates
    Promise.resolve().then(async () => {
      enhanceScheduled = false;
      await enhanceCardsNow();
    });
  }

  function startEnhancer() {
    // Initial pass (may run before reviews are rendered — that's OK)
    scheduleEnhanceCards();

    // Observe reviews container for async rendering
    const root = getReviewsRoot();
    if (!root || root === document.body) return;

    const obs = new MutationObserver(() => scheduleEnhanceCards());
    obs.observe(root, { childList: true, subtree: true });
  }

  // Click handler: open modal
  document.addEventListener("click", async (e) => {
    const trigger = e.target.closest(
      "[data-review-more], [data-review-more-btn], .review__more, .review-card__more, .review-more"
    );
    if (!trigger) return;

    const card = trigger.closest("[data-review], .review, .review-card, article");
    if (!card) return;

    e.preventDefault();

    // Ensure we have lookup (so we can fill missing role/org/text)
    await ensureLookupStarted();

    // Try to apply record into card dataset
    const rec = findRecordForCard(card);
    if (rec) applyRecordToCard(card, rec);

    const payload = getReviewDataFromCard(card);
    openModal(payload);
  });

  // Preload lookup and enhance cards (role/org + dataset) on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      startEnhancer();
    });
  } else {
    startEnhancer();
  }
})();
