/* ============================================================
   BYPLAN — bio.js (About slider)
   Scope: ONLY #about block

   Converts the existing 2-column "about/trust" layout into 2 screens:
   1) О Наталье
   2) Почему можно доверять

   No changes to index.html required: we transform the DOM at runtime.
   ============================================================ */
(function () {
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function q(root, sel) {
    return root.querySelector(sel);
  }

  function qa(root, sel) {
    return Array.from(root.querySelectorAll(sel));
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function indexStagger(section) {
    const bullets = section.querySelector("#trustBullets");
    if (bullets) {
      Array.from(bullets.children).forEach((el, i) => el.style.setProperty("--i", String(i)));
    }
    const stats = section.querySelector("#statsGrid");
    if (stats) {
      Array.from(stats.children).forEach((el, i) => el.style.setProperty("--i", String(i)));
    }
  }

  function syncHeight(slider) {
    const viewport = q(slider, ".about-carousel__viewport");
    const slides = qa(slider, ".about-slide");
    const idx = parseInt(slider.dataset.index || "0", 10) || 0;
    const active = slides[idx];
    if (!viewport || !active) return;
    const h = active.offsetHeight;
    if (h > 0) viewport.style.height = h + "px";
  }

  function setupInteractions(slider) {
    const tabs = qa(slider, ".about-tab");
    const dots = qa(slider, ".about-dot");
    const track = q(slider, ".about-carousel__track");
    const viewport = q(slider, ".about-carousel__viewport");
    const slides = qa(slider, ".about-slide");

    let index = parseInt(slider.dataset.index || "0", 10) || 0;
    index = clamp(index, 0, 1);

    function applyIndex(next, opts) {
      const force = opts && opts.force;
      next = clamp(next, 0, 1);
      if (next === index && !force) return;

      index = next;
      slider.dataset.index = String(index);

      // Move track
      if (track) track.style.transform = `translate3d(${-index * 100}%,0,0)`;

      // Tabs / dots / slides state
      tabs.forEach((btn, i) => {
        const active = i === index;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-selected", active ? "true" : "false");
        btn.tabIndex = active ? 0 : -1;
      });

      dots.forEach((d, i) => d.classList.toggle("is-active", i === index));
      slides.forEach((s, i) => s.classList.toggle("is-active", i === index));

      // Height for nicer layout
      if (!prefersReduced) {
        window.requestAnimationFrame(() => syncHeight(slider));
      } else {
        syncHeight(slider);
      }
    }

    // Click tabs
    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = parseInt(btn.dataset.index || "0", 10) || 0;
        applyIndex(next);
      });
    });

    // Keyboard navigation
    if (viewport) {
      viewport.addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          applyIndex(index - 1);
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          applyIndex(index + 1);
        }
      });
    }

    // Swipe / drag
    let down = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    const threshold = 46;

    function onDown(e) {
      if (!viewport) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;

      down = true;
      dragging = false;
      startX = e.clientX;
      startY = e.clientY;

      try {
        viewport.setPointerCapture(e.pointerId);
      } catch (_) {}
    }

    function onMove(e) {
      if (!down || !viewport || !track) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      // Determine intent
      if (!dragging) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          dragging = true;
        } else if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
          // vertical scroll — do not hijack
          down = false;
          return;
        }
      }
      if (!dragging) return;

      // Rubberband
      const pct = (dx / Math.max(1, viewport.clientWidth)) * 100;
      track.style.transition = "none";
      track.style.transform = `translate3d(calc(${-index * 100}% + ${pct}%),0,0)`;

      e.preventDefault();
    }

    function onUp(e) {
      if (!down) return;
      down = false;

      if (track) track.style.transition = "";

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (dragging && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
        applyIndex(index + (dx < 0 ? 1 : -1));
      } else {
        applyIndex(index, { force: true });
      }
      dragging = false;
    }

    if (viewport && window.PointerEvent) {
      viewport.addEventListener("pointerdown", onDown);
      viewport.addEventListener("pointermove", onMove, { passive: false });
      viewport.addEventListener("pointerup", onUp);
      viewport.addEventListener("pointercancel", onUp);
    }

    // Initial
    applyIndex(index, { force: true });

    // Keep height synced
    window.addEventListener("resize", () => syncHeight(slider), { passive: true });
    window.addEventListener("load", () => syncHeight(slider), { passive: true });
  }

  function bindTabTitleFromTrustHeading(slider, trustRoot) {
    const label = q(slider, "#aboutTabTrust .about-tab__label");
    if (!label || !trustRoot) return;

    const trustH2 = trustRoot.querySelector('h2[data-kv="trust_title"]') || trustRoot.querySelector("h2");
    if (!trustH2) return;

    const sync = () => {
      const txt = (trustH2.textContent || "").trim();
      if (txt) label.textContent = txt;
    };

    sync();

    // Update later when KV is applied from Sheets
    const mo = new MutationObserver(sync);
    mo.observe(trustH2, { childList: true, characterData: true, subtree: true });
  }

  function buildSlider(section) {
    if (!section || section.dataset.aboutSliderReady === "1") return;

    const container = section.querySelector(".container");
    if (!container) return;

    // Expect 2 columns in the current markup
    const cols = Array.from(container.children).filter((n) => n && n.nodeType === 1);
    if (cols.length < 2) return;

    const left = cols[0];
    const right = cols[1];

    // Remove two-col layout for slider mode
    container.classList.remove("two-col");

    // Create slider skeleton
    const slider = document.createElement("div");
    slider.className = "about-slider";
    slider.dataset.aboutSlider = "";
    slider.dataset.index = "0";

    slider.innerHTML = `
      <div class="about-slider__top">
        <div class="about-tabs" role="tablist" aria-label="О Наталье и доверие">
          <button
            class="about-tab is-active"
            type="button"
            role="tab"
            aria-selected="true"
            aria-controls="aboutSlideBio"
            id="aboutTabBio"
            data-index="0"
          >
            <span class="about-tab__icon" aria-hidden="true">👤</span>
            <span class="about-tab__label">О Наталье</span>
          </button>

          <button
            class="about-tab"
            type="button"
            role="tab"
            aria-selected="false"
            aria-controls="aboutSlideTrust"
            id="aboutTabTrust"
            data-index="1"
          >
            <span class="about-tab__icon" aria-hidden="true">★</span>
            <span class="about-tab__label">Почему можно доверять</span>
          </button>
        </div>

        <div class="about-hint muted" aria-hidden="true">2 экрана · свайп / клик</div>
      </div>

      <div class="about-carousel" id="aboutCarousel">
        <div class="about-carousel__viewport" tabindex="0">
          <div class="about-carousel__track">
            <article class="about-slide is-active" role="tabpanel" id="aboutSlideBio" aria-labelledby="aboutTabBio"></article>
            <article class="about-slide" role="tabpanel" id="aboutSlideTrust" aria-labelledby="aboutTabTrust"></article>
          </div>
        </div>

        <div class="about-dots" aria-hidden="true">
          <span class="about-dot is-active"></span>
          <span class="about-dot"></span>
        </div>
      </div>
    `;

    // Rebuild container content
    container.innerHTML = "";
    container.appendChild(slider);

    // Move existing columns into slides (IDs are preserved!)
    q(slider, "#aboutSlideBio").appendChild(left);
    q(slider, "#aboutSlideTrust").appendChild(right);

    // Mirror trust title into the second tab label (KV-safe)
    bindTabTitleFromTrustHeading(slider, right);

    // Mark ready
    section.dataset.aboutSliderReady = "1";

    // Stagger indices & re-stagger when sheet data arrives
    indexStagger(section);

    const mo = new MutationObserver(() => {
      indexStagger(section);
      syncHeight(slider);
    });

    const bullets = section.querySelector("#trustBullets");
    const stats = section.querySelector("#statsGrid");
    if (bullets) mo.observe(bullets, { childList: true });
    if (stats) mo.observe(stats, { childList: true });

    // Interactions + initial height sync
    setupInteractions(slider);
    window.requestAnimationFrame(() => syncHeight(slider));
  }

  function init() {
    const section = document.getElementById("about");
    if (!section) return;
    buildSlider(section);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
