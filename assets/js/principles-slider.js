/* ============================================================
   BYPLAN — principles-slider.js
   Scope: #principles only
   Purpose: switch "Делаем / Не делаем" as 2 animated screens
   ============================================================ */

(() => {
  const onReady = (fn) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  };

  onReady(() => {
    const root = document.querySelector("[data-principles-slider]");
    if (!root) return;

    const tabs = Array.from(root.querySelectorAll(".principles-tab"));
    const slides = Array.from(root.querySelectorAll(".principles-slide"));
    const viewport = root.querySelector(".principles-carousel__viewport");
    const dots = Array.from(root.querySelectorAll(".principles-dot"));

    if (!viewport || tabs.length < 2 || slides.length < 2) return;

    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

    // ---------- Helpers
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

    const setActiveIndex = (nextIndex, opts = {}) => {
      const { moveFocus = false, force = false } = opts;
      const idx = clamp(Number(nextIndex) || 0, 0, slides.length - 1);
      const current = Number(root.dataset.index || 0);
      if (!force && idx === current) return;

      root.dataset.index = String(idx);

      slides.forEach((s, i) => {
        s.classList.toggle("is-active", i === idx);
        // Keep panels available (carousel), but improve SR output a bit
        s.setAttribute("aria-hidden", i === idx ? "false" : "true");
      });

      tabs.forEach((b, i) => {
        const isActive = i === idx;
        b.classList.toggle("is-active", isActive);
        b.setAttribute("aria-selected", isActive ? "true" : "false");
        b.tabIndex = isActive ? 0 : -1;
        if (moveFocus && isActive) b.focus({ preventScroll: true });
      });

      dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));

      // Restart list item animation when switching (reflow trick)
      if (!prefersReducedMotion) {
        const active = slides[idx];
        if (active) {
          active.classList.remove("is-active");
          // Force reflow
          void active.offsetWidth;
          active.classList.add("is-active");
        }
      }
    };

    const applyStaggerIndexes = (listEl) => {
      if (!listEl) return;
      Array.from(listEl.children).forEach((li, i) => {
        if (!(li instanceof HTMLElement)) return;
        li.style.setProperty("--i", String(i));
      });
    };

    const refreshStagger = () => {
      applyStaggerIndexes(document.getElementById("doList"));
      applyStaggerIndexes(document.getElementById("dontList"));
    };

    // ---------- Events
    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.index || 0);
        setActiveIndex(idx);
      });
    });

    // Keyboard navigation (when focus is inside the slider)
    root.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

      const current = Number(root.dataset.index || 0);
      const next = e.key === "ArrowRight" ? current + 1 : current - 1;
      const clamped = clamp(next, 0, slides.length - 1);
      if (clamped === current) return;

      e.preventDefault();
      setActiveIndex(clamped, { moveFocus: true });
    });

    // Simple swipe (touch / pen). Keeps vertical scroll usable.
    let startX = 0;
    let startY = 0;
    let activePointer = null;

    viewport.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return; // swipe only for touch/pen
      activePointer = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
    });

    viewport.addEventListener("pointerup", (e) => {
      if (activePointer !== e.pointerId) return;
      activePointer = null;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      // Horizontal intent + threshold
      if (Math.abs(dx) < 60) return;
      if (Math.abs(dx) < Math.abs(dy)) return;

      const current = Number(root.dataset.index || 0);
      const next = dx < 0 ? current + 1 : current - 1;
      setActiveIndex(next);
    });

    viewport.addEventListener("pointercancel", (e) => {
      if (activePointer === e.pointerId) activePointer = null;
    });

    // ---------- Watch for async content from Google Sheets
    const doList = document.getElementById("doList");
    const dontList = document.getElementById("dontList");

    const mo = new MutationObserver(() => {
      refreshStagger();
    });

    if (doList) mo.observe(doList, { childList: true });
    if (dontList) mo.observe(dontList, { childList: true });

    // Initial
    refreshStagger();
    setActiveIndex(Number(root.dataset.index || 0), { force: true });
  });
})();
