/* BYPLAN — Reviews "Read full" modal (override)
   Purpose:
   - Make "Читать полностью" open a proper modal instead of expanding inside the carousel.
   - Runs in capture phase and stops propagation to override any older/broken handlers.
*/

(function () {
  "use strict";

  const MODAL_ID = "reviewTextModal";

  function decodeHtml(str) {
    if (str == null) return "";
    // Decode HTML entities that may be stored in data-* attributes.
    const ta = document.createElement("textarea");
    ta.innerHTML = String(str);
    return ta.value;
  }

  function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
      modal = document.createElement("div");
      modal.id = MODAL_ID;
      modal.className = "review-modal";
      modal.setAttribute("aria-hidden", "true");
      modal.innerHTML = `
        <div class="review-modal__overlay" data-close="1"></div>
        <div class="review-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="reviewModalName">
          <button class="review-modal__close" type="button" aria-label="Закрыть" data-close="1">×</button>
          <div class="review-modal__meta">
            <div class="review-modal__name" id="reviewModalName"></div>
            <div class="review-modal__role" id="reviewModalRole"></div>
          </div>
          <div class="review-modal__text" id="reviewModalText"></div>
        </div>
      `;
      document.body.appendChild(modal);

      // Close on overlay/close button
      modal.addEventListener("click", (e) => {
        const t = e.target;
        if (t && t.getAttribute && t.getAttribute("data-close") === "1") {
          e.preventDefault();
          closeModal();
        }
      });

      // Close on ESC
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeModal();
      });
    }

    // Make sure line breaks in plain text are preserved even if CSS got changed.
    const textEl = modal.querySelector("#reviewModalText");
    if (textEl) textEl.style.whiteSpace = "pre-wrap";

    return modal;
  }

  // Store opener to return focus on close (a11y)
  let lastOpener = null;

  function openModal({ name, role, text }) {
    const modal = ensureModal();
    const nameEl = modal.querySelector("#reviewModalName");
    const roleEl = modal.querySelector("#reviewModalRole");
    const textEl = modal.querySelector("#reviewModalText");

    if (nameEl) nameEl.textContent = name || "";
    if (roleEl) {
      roleEl.textContent = role || "";
      roleEl.style.display = role ? "block" : "none";
    }
    if (textEl) textEl.textContent = text || "";

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    const closeBtn = modal.querySelector(".review-modal__close");
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function closeModal() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;

    // IMPORTANT: move focus OUT of the modal BEFORE hiding it with aria-hidden,
    // otherwise Chrome blocks aria-hidden and logs a warning.
    const opener = lastOpener;
    lastOpener = null;
    try {
      if (opener && document.contains(opener) && typeof opener.focus === 'function') {
        opener.focus({ preventScroll: true });
      } else if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
    } catch (e) {
      try { opener && opener.focus && opener.focus(); } catch (_) {}
    }

    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  // CAPTURE listener: overrides any previous "read more" logic that breaks layout.
  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target && e.target.closest
        ? e.target.closest(
            "[data-review-more], .review-card__more, .review__more, [data-review-more-btn]"
          )
        : null;
      if (!btn) return;

      // Stop other handlers (bubble + target) from running.
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();

      // Depending on the renderer, the data-* payload can live either on the
      // slide wrapper (e.g. .review-slide) or on the card itself (.review-card).
      const card =
        btn.closest(".review-slide") ||
        btn.closest(".review-card") ||
        btn.closest(".review") ||
        btn.closest("[data-review-id]") ||
        btn;

      const name = decodeHtml(
        btn.getAttribute("data-name") ||
          (card && card.getAttribute ? card.getAttribute("data-name") : "") ||
          (card && card.querySelector ? card.querySelector(".review-card__name")?.textContent : "") ||
          ""
      ).trim();

      const role = decodeHtml(
        btn.getAttribute("data-role") ||
          (card && card.getAttribute ? card.getAttribute("data-role") : "") ||
          (card && card.querySelector ? card.querySelector(".review-card__role")?.textContent : "") ||
          ""
      ).trim();

      // Full text may come from different attributes depending on the renderer.
      // We support both the newer "data-full" and the older "data-text" conventions.
      // (The reviews carousel renderer writes full text into data-text.)
      const fullRaw =
        // Preferred: explicit full text
        btn.getAttribute("data-full") ||
        (btn.dataset ? btn.dataset.full : "") ||
        // Backwards compatibility: some renderers store full text in data-text
        btn.getAttribute("data-text") ||
        (btn.dataset ? btn.dataset.text : "") ||
        // Also accept a couple of semantic variants
        btn.getAttribute("data-review-text") ||
        (btn.dataset ? btn.dataset.reviewText : "") ||
        (card && card.getAttribute ? card.getAttribute("data-full") : "") ||
        (card && card.getAttribute ? card.getAttribute("data-text") : "") ||
        (card && card.dataset ? card.dataset.full : "") ||
        (card && card.dataset ? card.dataset.text : "") ||
        "";

      const full = decodeHtml(fullRaw).trim();

      // Remember which element opened the modal (for focus return on close)
      lastOpener = btn;

      openModal({ name, role, text: full || "" });
    },
    true
  );
})();
