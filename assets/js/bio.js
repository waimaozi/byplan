/* ============================================================
   byplan — bio.js (module)
   Purpose:
   - premium layout for biography (#about)
   - split long bio into readable paragraphs
   - collapse/expand "Читать полностью"
   - make photo clickable (reuse .lb-backdrop lightbox styles)
   Scope: ONLY #about section
   ============================================================ */

(() => {
  const doc = document;

  const qs = (sel, root = doc) => root.querySelector(sel);
  const qsa = (sel, root = doc) => Array.from(root.querySelectorAll(sel));

  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  const escapeText = (s) => String(s ?? "");

  const buildLightbox = () => {
    // Reuse existing styles from polish.css (.lb-backdrop, .lb-dialog, etc.)
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

    const close = () => {
      backdrop.classList.remove("is-open");
      const img = qs(".lb-img", backdrop);
      if (img) img.src = "";
    };

    // Close interactions
    backdrop.addEventListener("click", (e) => {
      const dialog = e.target.closest(".lb-dialog");
      const closeBtn = e.target.closest(".lb-close");
      if (closeBtn) return close();
      if (!dialog && e.target === backdrop) return close();
    });

    doc.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && backdrop.classList.contains("is-open")) close();
    });

    // Expose helper for this module only
    backdrop.__byplanClose = close;
    return backdrop;
  };

  const openLightbox = (src, title = "") => {
    if (!src) return;
    const backdrop = buildLightbox();
    const img = qs(".lb-img", backdrop);
    const ttl = qs(".lb-title", backdrop);
    if (!img || !ttl) return;

    ttl.textContent = title;
    img.alt = title || "Фото";
    img.src = src;
    backdrop.classList.add("is-open");
  };

  const getSentences = (text) => {
    // Keeps punctuation; works for RU/EN reasonably.
    const t = String(text ?? "").trim();
    if (!t) return [];
    return t.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [t];
  };

  const splitIntoParagraphs = (rawText) => {
    const raw = String(rawText ?? "").replace(/\r\n?/g, "\n").trim();
    if (!raw) return [];

    // If author inserted paragraphs via line breaks — respect them.
    if (raw.includes("\n")) {
      return raw
        .split(/\n{2,}/)
        .map(p => p.replace(/\n+/g, " ").trim())
        .filter(Boolean);
    }

    // Otherwise — chunk into readable paragraphs by sentences.
    const sentences = getSentences(raw).map(s => s.trim()).filter(Boolean);
    if (sentences.length <= 1) return [raw];

    const target = 320;
    const hardMax = 520;
    const paras = [];
    let buf = "";

    for (const s of sentences) {
      const next = (buf ? buf + " " : "") + s;
      // Start a new paragraph if we've reached a decent size.
      if (buf && next.length > target && buf.length > 140) {
        paras.push(buf.trim());
        buf = s;
        continue;
      }

      // Hard stop (very long sentences).
      if (buf && next.length > hardMax) {
        paras.push(buf.trim());
        buf = s;
        continue;
      }

      buf = next;
    }

    if (buf.trim()) paras.push(buf.trim());
    return paras;
  };

  const enhanceBioText = (card) => {
    // Find current bio node (initially it's <p.about-bio data-kv="designer_bio">)
    const bioNode = qs(".about-bio", card) || qs("[data-kv='designer_bio']", card);
    if (!bioNode) return;

    const rawText = (bioNode.textContent || "").trim();
    if (!rawText) return;

    // Idempotency
    if (card.dataset.bioText === "1") return;
    card.dataset.bioText = "1";

    const paras = splitIntoParagraphs(rawText);

    // Replace <p> with a richer <div> (so we can have multiple <p>)
    const rich = doc.createElement("div");
    rich.className = "bio-rich";

    // Keep data-kv attribute (harmless, but preserves semantics)
    const kv = bioNode.getAttribute?.("data-kv");
    if (kv) rich.setAttribute("data-kv", kv);

    // Build paragraphs safely
    paras.forEach((p, i) => {
      const el = doc.createElement("p");
      el.textContent = escapeText(p);
      if (i === 0 && paras.length > 1) el.classList.add("bio-lead");
      rich.appendChild(el);
    });

    bioNode.replaceWith(rich);

    // Collapse very long bios by default (JS-only enhancement)
    const isLong = rawText.length > 620 || paras.length > 2;
    if (!isLong) return;

    rich.classList.add("is-collapsed");

    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "bio-toggle";
    btn.setAttribute("aria-expanded", "false");

    // Give the text container an id for aria-controls
    const id = "bioRich";
    if (!rich.id) rich.id = id;
    btn.setAttribute("aria-controls", rich.id);

    btn.textContent = "Читать полностью";

    btn.addEventListener("click", () => {
      const expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", expanded ? "false" : "true");
      rich.classList.toggle("is-collapsed", expanded);
      btn.textContent = expanded ? "Читать полностью" : "Свернуть";

      // When collapsing back, keep the top of bio in view.
      if (expanded) {
        const top = rich.getBoundingClientRect().top + window.scrollY - 96;
        window.scrollTo({ top, behavior: prefersReducedMotion ? "auto" : "smooth" });
      }
    });

    // Insert button right after rich text
    rich.insertAdjacentElement("afterend", btn);
  };

  const enhancePhoto = (card) => {
    const wrap = qs(".about-photo", card);
    const img = qs("#designerPhoto", card) || qs(".about-photo img", card);
    if (!wrap || !img) return;

    // Idempotency
    if (wrap.dataset.bioPhoto === "1") return;
    wrap.dataset.bioPhoto = "1";

    // Accessibility: make wrapper behave like a button
    wrap.setAttribute("role", "button");
    wrap.tabIndex = 0;
    wrap.setAttribute("aria-label", "Открыть фото");

    const open = () => {
      const src = img.currentSrc || img.getAttribute("src");
      const title = (qs(".about-name", card)?.textContent || "Фото").trim();
      openLightbox(src, title);
    };

    wrap.addEventListener("click", open);
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  };

  const setupInViewAnimation = (card) => {
    if (prefersReducedMotion) {
      card.classList.add("bio-in");
      return;
    }

    // Enable the initial hidden state only when JS is active (CSS uses .bio-anim)
    card.classList.add("bio-anim");

    // Idempotency
    if (card.dataset.bioIo === "1") return;
    card.dataset.bioIo = "1";

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        card.classList.add("bio-in");
        io.disconnect();
        break;
      }
    }, { threshold: 0.18, rootMargin: "0px 0px -12% 0px" });

    io.observe(card);
  };

  const init = () => {
    const section = doc.getElementById("about");
    if (!section) return;

    const card = qs(".about-card", section);
    if (!card) return;

    // Avoid re-init
    if (card.dataset.bioInit === "1") return;
    card.dataset.bioInit = "1";

    // Wait until app.js applied KV (async). We watch for changes in key nodes.
    const nameNode = qs(".about-name", card) || qs("[data-kv='designer_name']", card);
    const roleNode = qs(".about-role", card) || qs("[data-kv='designer_role']", card);
    const bioNode = qs(".about-bio", card) || qs("[data-kv='designer_bio']", card);

    const initial = {
      name: (nameNode?.textContent || "").trim(),
      role: (roleNode?.textContent || "").trim(),
      bio: (bioNode?.textContent || "").trim(),
    };

    const run = () => {
      enhancePhoto(card);
      enhanceBioText(card);
      setupInViewAnimation(card);
    };

    const isReady = () => {
      // Signal that app.js likely ran:
      // - trust mini pills exist (hero)
      // - trust bullets are rendered (inside bio card)
      // - or any of the KV nodes changed
      if (qs("#trustMini .pill")) return true;
      if (qs("#trustBullets li", card)) return true;

      const nameNow = (nameNode?.textContent || "").trim();
      const roleNow = (roleNode?.textContent || "").trim();
      const bioNow = (bioNode?.textContent || "").trim();

      return (
        (nameNow && nameNow !== initial.name) ||
        (roleNow && roleNow !== initial.role) ||
        (bioNow && bioNow !== initial.bio)
      );
    };

    if (isReady()) {
      run();
      return;
    }

    // Observe for content changes
    const mo = new MutationObserver(() => {
      if (!isReady()) return;
      mo.disconnect();
      run();
    });

    mo.observe(card, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });

    // Fallback: if for some reason no signals fired, try a few times.
    // (We avoid running too early to not get overwritten by applyKV.)
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      if (card.dataset.bioText === "1") return clearInterval(t);
      if (isReady()) {
        clearInterval(t);
        run();
      }
      if (tries >= 25) {
        clearInterval(t);
        // Last resort: run anyway (better than leaving the block unstyled)
        run();
      }
    }, 320);
  };

  doc.addEventListener("DOMContentLoaded", init);
})();
