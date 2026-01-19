/* ============================================================
   byplan — polish.js (v2)
   Purpose:
   - nav toggle (mobile), header scroll state
   - scroll-spy active menu item
   - reveal animations (sections + dynamic content)
   - skeleton placeholders while Google Sheets loads
   - FAQ smooth accordion
   - Cases lightbox modal
   - floating CTA
   - cleanup: hide empty kv blocks + remove useless separators/links
   ============================================================ */

(() => {
  const doc = document;
  const html = doc.documentElement;
  html.classList.add("js");

  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  const qs = (sel, root = doc) => root.querySelector(sel);
  const qsa = (sel, root = doc) => Array.from(root.querySelectorAll(sel));

  const rafThrottle = (fn) => {
    let ticking = false;
    return (...args) => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        fn(...args);
      });
    };
  };

  const safeIdFromHash = (hash) => {
    try{
      return decodeURIComponent(hash).replace(/^#/, "");
    }catch(e){
      return (hash || "").replace(/^#/, "");
    }
  };

  const closeMobileMenu = () => {
    const menu = qs("#navMenu");
    const toggle = qs(".nav__toggle");
    if (!menu || !toggle) return;
    menu.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  const setupNavToggle = () => {
    const menu = qs("#navMenu");
    const toggle = qs(".nav__toggle");
    if (!menu || !toggle) return;

    // Idempotency
    if (toggle.dataset.bound === "1") return;
    toggle.dataset.bound = "1";

    toggle.addEventListener("click", () => {
      const isOpen = menu.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    // Close on link click (mobile)
    menu.addEventListener("click", (e) => {
      const a = e.target.closest("a[href^='#']");
      if (!a) return;
      closeMobileMenu();
    });

    // Close when clicking outside
    doc.addEventListener("click", (e) => {
      if (!menu.classList.contains("is-open")) return;
      const inside = e.target.closest(".nav");
      if (!inside) closeMobileMenu();
    });

    // Close on ESC
    doc.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMobileMenu();
    });
  };

  const setupHeaderScrollState = () => {
    const header = qs(".site-header");
    if (!header) return;

    const onScroll = rafThrottle(() => {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    });

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  };

  const setupScrollSpy = () => {
    const links = qsa(".nav__menu a[href^='#']").filter(a => a.getAttribute("href") !== "#");
    if (links.length === 0) return;

    const pairs = [];
    for (const a of links){
      const id = safeIdFromHash(a.getAttribute("href"));
      const section = id ? doc.getElementById(id) : null;
      if (section) pairs.push([section, a]);
    }
    if (pairs.length === 0) return;

    let active = null;
    const setActive = (a) => {
      if (active === a) return;
      for (const [, link] of pairs) link.classList.toggle("is-active", link === a);
      active = a;
    };

    const io = new IntersectionObserver((entries) => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => (b.intersectionRatio - a.intersectionRatio));
      if (visible.length === 0) return;
      const top = visible[0].target;
      const match = pairs.find(([sec]) => sec === top);
      if (match) setActive(match[1]);
    }, {
      root: null,
      rootMargin: "-18% 0px -70% 0px",
      threshold: [0.01, 0.12, 0.25, 0.45]
    });

    pairs.forEach(([sec]) => io.observe(sec));

    // Initial
    setTimeout(() => {
      const hash = location.hash;
      if (hash){
        const id = safeIdFromHash(hash);
        const link = links.find(a => safeIdFromHash(a.getAttribute("href")) === id);
        if (link) setActive(link);
      } else {
        setActive(pairs[0][1]);
      }
    }, 50);
  };

  const setupReveal = () => {
    if (prefersReducedMotion) return;

    const makeReveal = (el) => {
      if (!el || el.classList.contains("reveal")) return;
      el.classList.add("reveal");
    };

    // Sections (except hero)
    qsa("section.section").forEach(sec => {
      if (sec.classList.contains("hero")) return;
      makeReveal(sec);
    });

    // Dynamic cards will get reveal class later via mutation observer
    const io = new IntersectionObserver((entries) => {
      for (const e of entries){
        if (e.isIntersecting) e.target.classList.add("is-visible");
      }
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });

    qsa(".reveal").forEach(el => io.observe(el));

    // Watch for new cards inserted from Sheets
    const watchRoots = ["painsGrid","pricingGrid","casesGrid","reviewsGrid","faqList","trustList","statsGrid"]
      .map(id => doc.getElementById(id))
      .filter(Boolean);

    const mo = new MutationObserver((mutations) => {
      const added = [];
      for (const m of mutations){
        for (const n of m.addedNodes){
          if (!(n instanceof HTMLElement)) continue;
          // try common card types
          if (n.matches?.(".card,.price-card,.case-card,.review,.faq-item,.stat")) added.push(n);
          qsa(".card,.price-card,.case-card,.review,.faq-item,.stat", n).forEach(x => added.push(x));
        }
      }
      for (const el of added){
        makeReveal(el);
        io.observe(el);
      }
    });

    watchRoots.forEach(root => mo.observe(root, { childList: true, subtree: true }));
  };

  const addSkeletons = (grid, count, variant) => {
    if (!grid) return;
    if (grid.dataset.skeleton === "1") return;
    if (grid.childElementCount > 0) return;

    grid.dataset.skeleton = "1";
    grid.classList.add("is-loading");

    for (let i=0; i<count; i++){
      const d = doc.createElement("div");
      d.className = `skeleton skeleton-${variant}`;
      d.setAttribute("aria-hidden", "true");
      grid.appendChild(d);
    }
  };

  const removeSkeletonsIfReady = (grid) => {
    if (!grid) return;
    const kids = Array.from(grid.children);
    const hasReal = kids.some(el => !el.classList.contains("skeleton"));
    if (!hasReal) return;

    kids.filter(el => el.classList.contains("skeleton")).forEach(el => el.remove());
    grid.classList.remove("is-loading");
  };

  const setupSkeletons = () => {
    addSkeletons(qs("#painsGrid"), 6, "card");
    addSkeletons(qs("#pricingGrid"), 4, "price");
    addSkeletons(qs("#casesGrid"), 6, "case");
    addSkeletons(qs("#reviewsGrid"), 3, "review");
    addSkeletons(qs("#faqList"), 6, "faq");

    const grids = ["painsGrid","pricingGrid","casesGrid","reviewsGrid","faqList"]
      .map(id => doc.getElementById(id))
      .filter(Boolean);

    const mo = new MutationObserver(() => {
      grids.forEach(removeSkeletonsIfReady);
    });

    grids.forEach(g => mo.observe(g, { childList: true }));
    // initial attempt (in case content is already there)
    grids.forEach(removeSkeletonsIfReady);
  };

  const setupFAQ = () => {
    const root = qs("#faqList");
    if (!root) return;

    // Event delegation
    root.addEventListener("click", (e) => {
      const btn = e.target.closest(".faq-q");
      if (!btn) return;

      const item = btn.closest(".faq-item") || btn.parentElement;
      const panel = item?.querySelector?.(".faq-a");
      if (!panel) return;

      const isOpen = btn.getAttribute("aria-expanded") === "true";
      const next = !isOpen;

      // Close others (optional; feels premium)
      qsa(".faq-q[aria-expanded='true']", root).forEach(b => {
        if (b === btn) return;
        b.setAttribute("aria-expanded", "false");
        const it = b.closest(".faq-item");
        const p = it?.querySelector?.(".faq-a");
        if (p){
          p.style.maxHeight = "0px";
          p.style.opacity = "0";
          setTimeout(() => { p.hidden = true; }, 220);
        }
      });

      btn.setAttribute("aria-expanded", next ? "true" : "false");
      panel.hidden = false;

      // Animate height
      panel.style.overflow = "hidden";
      panel.style.transition = "max-height 220ms cubic-bezier(.2,.8,.2,1), opacity 220ms cubic-bezier(.2,.8,.2,1)";
      panel.style.opacity = next ? "1" : "0";

      if (next){
        // measure after unhide
        const h = panel.scrollHeight;
        panel.style.maxHeight = h + "px";
      } else {
        panel.style.maxHeight = "0px";
        setTimeout(() => { panel.hidden = true; }, 220);
      }
    });
  };

  const ensureLightbox = () => {
    let backdrop = qs(".lb-backdrop");
    if (backdrop) return backdrop;

    backdrop = doc.createElement("div");
    backdrop.className = "lb-backdrop";
    backdrop.innerHTML = `
      <div class="lb-dialog" role="dialog" aria-modal="true" aria-label="Просмотр изображения">
        <div class="lb-toolbar">
          <div class="lb-title"></div>
          <button class="lb-close" type="button" aria-label="Закрыть">✕</button>
        </div>
        <img class="lb-img" alt="">
      </div>
    `.trim();

    doc.body.appendChild(backdrop);

    // close interactions
    backdrop.addEventListener("click", (e) => {
      const dialog = e.target.closest(".lb-dialog");
      const closeBtn = e.target.closest(".lb-close");
      if (!dialog || closeBtn) closeLightbox();
      if (!dialog && e.target === backdrop) closeLightbox();
    });

    doc.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeLightbox();
    });

    return backdrop;
  };

  const openLightbox = (src, title) => {
    const backdrop = ensureLightbox();
    const img = qs(".lb-img", backdrop);
    const ttl = qs(".lb-title", backdrop);
    if (!img || !ttl) return;

    img.src = src;
    img.alt = title || "Изображение";
    ttl.textContent = title || "";

    backdrop.classList.add("is-open");
  };

  const closeLightbox = () => {
    const backdrop = qs(".lb-backdrop");
    if (!backdrop) return;
    backdrop.classList.remove("is-open");
    const img = qs(".lb-img", backdrop);
    if (img) img.src = "";
  };

  const setupCasesLightbox = () => {
    const grid = qs("#casesGrid");
    if (!grid) return;

    grid.addEventListener("click", (e) => {
      const img = e.target.closest("img");
      if (!img) return;
      const src = img.currentSrc || img.getAttribute("src");
      if (!src) return;
      openLightbox(src, img.alt || img.getAttribute("data-title") || "");
    });
  };

  const setupFloatingCTA = () => {
    // Build from existing CTA (nav or hero)
    const navCta = qs(".nav__cta");
    const heroCta = qs(".hero-actions .btn--primary");

    const href = (heroCta?.getAttribute("href") || navCta?.getAttribute("href") || "#contact");
    const label = (heroCta?.textContent?.trim() || navCta?.textContent?.trim() || "Заполнить анкету");

    const a = doc.createElement("a");
    a.className = "floating-cta btn btn--primary";
    a.href = href;
    a.textContent = label;

    // Put at end of body
    doc.body.appendChild(a);

    const show = () => a.classList.add("is-visible");
    const hide = () => a.classList.remove("is-visible");

    const onScroll = rafThrottle(() => {
      if (window.scrollY > 520) show();
      else hide();
    });

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // Hide near contact section (so it doesn't overlap)
    const contact = qs("#contact");
    if (contact){
      const io = new IntersectionObserver((entries) => {
        const isIn = entries.some(e => e.isIntersecting);
        if (isIn) hide();
      }, { threshold: 0.12 });

      io.observe(contact);
    }
  };

  // --- No auto-hide (we'll remove/adjust sections manually closer to launch) ---
// Some blocks are filled asynchronously from Google Sheets. If any container
// becomes hidden due to older cached scripts, we force it visible.
const forceUnhide = () => {
  const ids = [
    "deliverablesList","stepsList",
    "painsGrid","pricingGrid","casesGrid","reviewsGrid","faqList",
    "trustMini","trustList","statsGrid","mistakesList"
  ];

  ids.forEach(id => {
    const el = doc.getElementById(id);
    if (!el) return;
    el.hidden = false;
    el.removeAttribute("hidden");
    el.style.display = ""; // don't override layout, just remove inline locks
  });
};

const setupUnhideObservers = () => {
  forceUnhide();
  setTimeout(forceUnhide, 350);
  setTimeout(forceUnhide, 1200);

  const roots = [
    "deliverablesList","stepsList",
    "painsGrid","pricingGrid","casesGrid","reviewsGrid","faqList",
    "trustMini","trustList","statsGrid","mistakesList"
  ].map(id => doc.getElementById(id)).filter(Boolean);

  const mo = new MutationObserver(() => forceUnhide());
  roots.forEach(r => mo.observe(r, { childList: true, subtree: true }));
};

const init = () => {
    setupNavToggle();
    setupHeaderScrollState();
    setupScrollSpy();
    setupReveal();
    setupSkeletons();
    setupUnhideObservers();
    setupFAQ();
    setupCasesLightbox();
    setupFloatingCTA();
  };

  if (doc.readyState !== "loading") init();
  else doc.addEventListener("DOMContentLoaded", init);
})();
