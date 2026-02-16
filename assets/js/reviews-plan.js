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
