(function () {
  const cfg = window.SITE_CONFIG;

  const el = (id) => document.getElementById(id);
  const escapeHtml = window.escapeHtml || ((str) =>
    String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;")
  );
  const isExternal = window.isExternal || ((url) => {
    const u = String(url ?? "").trim();
    if (!u || u.startsWith("#") || u.startsWith("mailto:") || u.startsWith("tel:")) return false;
    try {
      return new URL(u, document.baseURI).origin !== window.location.origin;
    } catch {
      return false;
    }
  });
  const renderFAQ = (typeof window.renderFAQ === "function") ? window.renderFAQ : () => {};
  const renderContacts = (typeof window.renderContacts === "function") ? window.renderContacts : () => {};

  const toggleSection = (selectorOrEl, show) => {
    const node = (typeof selectorOrEl === "string") ? document.querySelector(selectorOrEl) : selectorOrEl;
    if (!node) return;
    node.hidden = !show;
  };

  function setText(selectorOrEl, text) {
    const node = (typeof selectorOrEl === "string") ? document.querySelector(selectorOrEl) : selectorOrEl;
    if (!node) return;
    node.textContent = text ?? "";
  }

  function safeBool(v) {
    if (typeof v === "boolean") return v;
    const s = String(v ?? "").trim().toLowerCase();
    return ["true", "yes", "1", "да", "y"].includes(s);
  }

  function splitList(v) {
    return String(v ?? "")
      .split("|")
      .map(s => s.trim())
      .filter(Boolean);
  }

  function sanitizeUrl(url, options = {}) {
    const raw = String(url ?? "").trim();
    if (!raw) return "";

    const allowRelative = options.allowRelative !== false;
    const allowedProtocols = options.allowedProtocols || ["http:", "https:", "mailto:", "tel:"];

    if (raw.startsWith("#")) {
      return raw;
    }

    try {
      const parsed = new URL(raw, document.baseURI);
      const isRelativeInput = !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw);
      if (isRelativeInput && !allowRelative) return "";
      if (!allowedProtocols.includes(parsed.protocol)) return "";
      if (isRelativeInput) {
        return raw.replace(/^\/+/, "");
      }
      return parsed.href;
    } catch {
      return "";
    }
  }

  function toAbsUrl(url) {
    const safe = sanitizeUrl(url, { allowRelative: true });
    if (!safe) return "";
    try {
      return new URL(safe, document.baseURI).href;
    } catch {
      return safe;
    }
  }

  function showSheetError(message) {
    const banner = el("sheetError");
    if (!banner) return;
    if (!message) {
      banner.hidden = true;
      return;
    }
    banner.textContent = message;
    banner.hidden = false;
  }

  function applyKV(kv) {
    const setMeta = (selector, value) => {
      const node = document.querySelector(selector);
      if (!node || value === undefined || value === null) return;
      const v = String(value);
      node.setAttribute("content", v);
    };

    // Text content from KV.
    // IMPORTANT: if the key exists but the value is empty, we intentionally hide the element.
    // This lets you "delete" default fallback text by clearing the cell in Google Sheets.
    document.querySelectorAll("[data-kv]").forEach(node => {
      const key = node.getAttribute("data-kv");
      if (!key || kv[key] === undefined) return;
      const v = String(kv[key] ?? "");
      node.textContent = v;
      node.hidden = (v.trim() === "");
    });

    // Links from KV.
    // If the key exists but the value is empty, we hide the link.
    document.querySelectorAll("[data-kv-link]").forEach(node => {
      const key = node.getAttribute("data-kv-link");
      if (!key || kv[key] === undefined) return;
      const href = String(kv[key] ?? "").trim();
      const safeHref = sanitizeUrl(href, { allowRelative: true });
      if (!href) {
        node.removeAttribute("href");
        node.hidden = true;
        return;
      }
      if (!safeHref) {
        node.removeAttribute("href");
        node.hidden = true;
        return;
      }
      node.hidden = false;
      node.setAttribute("href", safeHref);
    });

    // Designer photo
    // Hero media
    if (kv.hero_image_url) {
      const img = el("heroImage");
      if (img) {
        const heroUrl = sanitizeUrl(kv.hero_image_url, { allowRelative: true });
        if (heroUrl) img.src = heroUrl;
        if (kv.hero_image_alt) img.alt = kv.hero_image_alt;
      }
    }
    if (kv.hero_image_url_avif) {
      const src = toAbsUrl(kv.hero_image_url_avif);
      const source = document.getElementById("heroImageAvif");
      if (source && src) source.setAttribute("srcset", src);
    }
    if (kv.hero_image_url_webp) {
      const src = toAbsUrl(kv.hero_image_url_webp);
      const source = document.getElementById("heroImageWebp");
      if (source && src) source.setAttribute("srcset", src);
    }
    const heroCap = document.querySelector('[data-kv="hero_image_caption"]');
    if (heroCap && (!kv.hero_image_caption || String(kv.hero_image_caption).trim()==="")) {
      heroCap.hidden = true;
    }

    if (kv.designer_photo_url) {
      const img = el("designerPhoto");
      if (img) {
        const photoUrl = sanitizeUrl(kv.designer_photo_url, { allowRelative: true });
        if (photoUrl) img.src = photoUrl;
      }
    }
    if (kv.designer_photo_url_avif) {
      const src = toAbsUrl(kv.designer_photo_url_avif);
      const source = document.getElementById("designerPhotoAvif");
      if (source && src) source.setAttribute("srcset", src);
    }
    if (kv.designer_photo_url_webp) {
      const src = toAbsUrl(kv.designer_photo_url_webp);
      const source = document.getElementById("designerPhotoWebp");
      if (source && src) source.setAttribute("srcset", src);
    }

    // Meta tags (allow clearing)
    if (kv.site_title !== undefined) document.title = String(kv.site_title ?? "");
    if (kv.meta_description !== undefined) {
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute("content", String(kv.meta_description ?? ""));
    }
    const ogMeta = document.querySelector('meta[property="og:image"]');
    if (kv.og_image && ogMeta) {
      ogMeta.setAttribute("content", toAbsUrl(kv.og_image));
    } else if (ogMeta) {
      const current = ogMeta.getAttribute("content");
      if (current) ogMeta.setAttribute("content", toAbsUrl(current));
    }

    const ogTitle = kv.og_title ?? kv.site_title;
    const ogDesc = kv.og_description ?? kv.meta_description;
    if (ogTitle !== undefined) setMeta('meta[property="og:title"]', ogTitle);
    if (ogDesc !== undefined) setMeta('meta[property="og:description"]', ogDesc);

    const twTitle = kv.twitter_title ?? ogTitle;
    const twDesc = kv.twitter_description ?? ogDesc;
    if (twTitle !== undefined) setMeta('meta[name="twitter:title"]', twTitle);
    if (twDesc !== undefined) setMeta('meta[name="twitter:description"]', twDesc);
    const twImage = document.querySelector('meta[name="twitter:image"]');
    if (kv.og_image && twImage) {
      twImage.setAttribute("content", toAbsUrl(kv.og_image));
    } else if (twImage) {
      const current = twImage.getAttribute("content");
      if (current) twImage.setAttribute("content", toAbsUrl(current));
    }

    const canonical = document.querySelector('link[rel="canonical"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const rawUrl = kv.site_url || (location.protocol.startsWith("http") ? `${location.origin}${location.pathname}` : "");
    const absUrl = rawUrl ? toAbsUrl(rawUrl) : "";
    if (canonical && absUrl) canonical.setAttribute("href", absUrl);
    if (ogUrl && absUrl) ogUrl.setAttribute("content", absUrl);

    const ld = document.getElementById("ldJson");
    if (ld) {
      const sameAs = [];
      if (kv.instagram_url) {
        const insta = toAbsUrl(kv.instagram_url);
        if (insta) sameAs.push(insta);
      }
      if (kv.telegram_url) {
        const tg = toAbsUrl(kv.telegram_url);
        if (tg) sameAs.push(tg);
      }

      const contactPoint = [];
      if (kv.contact_phone) {
        contactPoint.push({
          "@type": "ContactPoint",
          telephone: String(kv.contact_phone),
          contactType: "customer service"
        });
      }
      if (kv.contact_email) {
        contactPoint.push({
          "@type": "ContactPoint",
          email: String(kv.contact_email),
          contactType: "customer service"
        });
      }

      const payload = {
        "@context": "https://schema.org",
        "@type": "ProfessionalService",
        "name": kv.brand_name || kv.site_title || "Byplan",
        "url": absUrl || undefined,
        "description": ogDesc || undefined,
        "image": kv.og_image ? toAbsUrl(kv.og_image) : undefined,
        "sameAs": sameAs.length ? sameAs : undefined,
        "contactPoint": contactPoint.length ? contactPoint : undefined
      };
      ld.textContent = JSON.stringify(payload);
    }

    // Optional: embed form
    const embedUrl = kv.lead_form_embed_url;
    const embedWrap = el("formEmbed");
    const safeEmbedUrl = sanitizeUrl(embedUrl, { allowRelative: false, allowedProtocols: ["https:"] });
    if (safeEmbedUrl && embedWrap) {
      embedWrap.hidden = false;
      embedWrap.innerHTML = "";
      const frame = document.createElement("iframe");
      frame.src = safeEmbedUrl;
      frame.loading = "lazy";
      frame.title = "Форма";
      embedWrap.appendChild(frame);
    }

    const smallprint = document.querySelector(".smallprint");
    if (smallprint) {
      const links = Array.from(smallprint.querySelectorAll("a")).filter(a => !a.hidden && a.getAttribute("href"));
      const dot = smallprint.querySelector(".dot");
      if (dot) dot.hidden = links.length < 2;
    }

    const next = document.querySelector(".contact-next");
    if (next) {
      const items = Array.from(next.querySelectorAll("li")).filter(li => !li.hidden && li.textContent.trim());
      next.hidden = items.length === 0;
    }
  }

  function renderPills(container, items) {
    const root = el(container);
    if (!root) return;
    root.innerHTML = "";
    items.forEach(it => {
      const div = document.createElement("div");
      div.className = "pill";
      div.textContent = it;
      root.appendChild(div);
    });
  }

  function renderCards(containerId, rows, titleKey = "title", textKey = "text") {
    const root = el(containerId);
    if (!root) return;
    root.innerHTML = "";
    rows.forEach(r => {
      const card = document.createElement("div");
      card.className = "card";
      const h = document.createElement("div");
      h.className = "card__title";
      h.textContent = r[titleKey] || "";
      const p = document.createElement("p");
      p.className = "card__text";
      p.textContent = r[textKey] || "";
      card.appendChild(h);
      card.appendChild(p);
      root.appendChild(card);
    });
  }

  function renderChecklist(containerId, rows, textKey = "text") {
    const root = el(containerId);
    if (!root) return;
    root.innerHTML = "";
    rows.forEach(r => {
      const li = document.createElement("li");
      li.textContent = r[textKey] || "";
      root.appendChild(li);
    });
  }

  function renderSteps(containerId, rows) {
    const root = el(containerId);
    if (!root) return;
    root.innerHTML = "";
    rows.forEach(r => {
      const li = document.createElement("li");
      const title = (r.title || "").trim();
      const text = (r.text || "").trim();
      li.innerHTML = title
        ? `<strong>${escapeHtml(title)}</strong>${text ? `<br><span class="muted">${escapeHtml(text)}</span>` : ""}`
        : escapeHtml(text || "");
      root.appendChild(li);
    });
  }

  function renderBullets(containerId, rows, textKey = "text") {
    const root = el(containerId);
    if (!root) return;
    root.innerHTML = "";
    rows.forEach(r => {
      const li = document.createElement("li");
      li.textContent = r[textKey] || "";
      root.appendChild(li);
    });
  }

  function renderStats(containerId, rows) {
    const root = el(containerId);
    if (!root) return;
    root.innerHTML = "";
    rows.forEach(r => {
      const div = document.createElement("div");
      div.className = "stat";
      div.innerHTML = `
        <p class="stat__num">${escapeHtml(r.num ?? "")}</p>
        <p class="stat__label">${escapeHtml(r.label ?? "")}</p>
      `;
      root.appendChild(div);
    });
  }

  function renderPricing(containerId, rows) {
    const root = el(containerId);
    if (!root) return;
    root.innerHTML = "";

    rows.forEach(r => {
      const featured = safeBool(r.featured);
      const card = document.createElement("div");
      card.className = "price-card" + (featured ? " price-card--featured" : "");

      const badge = (r.badge || "").trim();
      const features = splitList(r.features);
      const ctaHref = sanitizeUrl(r.cta_url || "#contact", { allowRelative: true }) || "#contact";
      const ctaIsExternal = isExternal(ctaHref);

      card.innerHTML = `
        <div class="price-card__top">
          <div class="price-card__plan">${escapeHtml(r.plan || "")}</div>
          ${badge ? `<div class="price-card__badge">${escapeHtml(badge)}</div>` : ""}
        </div>
        <p class="price-card__price">${escapeHtml(r.price || "")}</p>
        ${r.price_note ? `<p class="price-card__note">${escapeHtml(r.price_note)}</p>` : ""}
        <ul class="price-card__features">${features.map(f => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
        ${(r.cta_url || r.cta_label) ? `<a class="btn btn--primary" href="${escapeAttr(ctaHref)}" ${ctaIsExternal ? 'target="_blank" rel="noopener"' : ""}>${escapeHtml(r.cta_label || "Запросить")}</a>` : ""}
      `;
      root.appendChild(card);
    });
  }

  function renderCases(containerId, rows) {
    const root = el(containerId);
    if (!root) return;
    root.innerHTML = "";

    rows.forEach(r => {
      const card = document.createElement("div");
      card.className = "case-card";

      const img = (r.img_url || "").trim();
      const caseUrl = sanitizeUrl(r.url || "", { allowRelative: true });
      const caseIsExternal = isExternal(caseUrl);
      const metaParts = [];
      if (r.area_m2) metaParts.push(`${r.area_m2} м²`);
      if (r.type) metaParts.push(r.type);
      if (r.city) metaParts.push(r.city);

      card.innerHTML = `
        <div class="case-card__img">
          ${img ? `<img src="${escapeAttr(img)}" alt="" loading="lazy" decoding="async" />` : ""}
        </div>
        <div class="case-card__body">
          <p class="case-card__title">${escapeHtml(r.title || "")}</p>
          <div class="case-card__meta">${escapeHtml(metaParts.join(" · "))}</div>
          ${r.problem ? `<div><strong>Задача:</strong> <span class="muted">${escapeHtml(r.problem)}</span></div>` : ""}
          ${r.result ? `<div><strong>Результат:</strong> <span class="muted">${escapeHtml(r.result)}</span></div>` : ""}
          ${caseUrl ? `<a class="btn btn--ghost" href="${escapeAttr(caseUrl)}" ${caseIsExternal ? 'target="_blank" rel="noopener"' : ""}>Открыть</a>` : ""}
        </div>
      `;
      root.appendChild(card);
    });
  }

  function renderReviews(containerId, rows) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const html = (rows || []).map((r, idx) => {
    const name = escapeHtml(r.name || "");
    const roleParts = [r.role, r.company_or_city].map(v => String(v || "").trim()).filter(Boolean);
    const role = escapeHtml(roleParts.join(" · "));
    const textRaw = String(r.text || "");
    const textHtml = escapeHtml(textRaw).replace(/\n/g, "<br>");

    // Optional case assets (before/after) attached to a review.
    // Supported column names in Google Sheets (any of):
    // - case_before_url / case_after_url (recommended)
    // - case_before / case_after
    // - before_url / after_url
    const caseBefore = normalizeAssetUrl(r.case_before_url || r.case_before || r.before_url || "");
    const caseAfter  = normalizeAssetUrl(r.case_after_url  || r.case_after  || r.after_url  || "");
    const caseTitleRaw = String(r.case_title || r.case_name || "");
    const caseTitleEnc = encodeURIComponent(caseTitleRaw);

    const capBeforeRaw = String(r.case_before_caption || r.before_caption || "");
    const capAfterRaw  = String(r.case_after_caption  || r.after_caption  || "");
    const capBeforeEnc = encodeURIComponent(capBeforeRaw);
    const capAfterEnc  = encodeURIComponent(capAfterRaw);

    const commentRaw = String(r.case_comment || r.case_note || r.case_explain || "");
    const commentEnc = encodeURIComponent(commentRaw);

    const hasCase = Boolean(caseBefore || caseAfter || capBeforeRaw || capAfterRaw || commentRaw || caseTitleRaw);

    const dataAttrs = hasCase
      ? ` data-has-case="1"
          data-case-before="${escapeAttr(caseBefore)}"
          data-case-after="${escapeAttr(caseAfter)}"
          data-case-title="${escapeAttr(caseTitleEnc)}"
          data-case-before-caption="${escapeAttr(capBeforeEnc)}"
          data-case-after-caption="${escapeAttr(capAfterEnc)}"
          data-case-comment="${escapeAttr(commentEnc)}"`
      : "";

    const previewHtml = (hasCase && caseBefore && caseAfter)
      ? `
        <div class="review__casePreview" aria-hidden="true">
          <div class="review__caseThumb">
            <span class="review__caseLabel">Было</span>
            <img src="${escapeAttr(caseBefore)}" alt="" loading="lazy" decoding="async" />
          </div>
          <div class="review__caseThumb">
            <span class="review__caseLabel">Стало</span>
            <img src="${escapeAttr(caseAfter)}" alt="" loading="lazy" decoding="async" />
          </div>
        </div>`
      : "";

    const caseBtnHtml = hasCase
      ? `<button class="btn review__caseBtn" type="button" data-action="review-case">Смотреть план (было/стало)</button>`
      : "";

    return `
      <article class="review reveal"${dataAttrs}>
        <div class="review__who">
          <div class="review__name">${name}</div>
          ${role ? `<div class="review__role">${role}</div>` : ``}
        </div>
        <div class="review__text">${textHtml}</div>
        ${hasCase ? `
          <div class="review__case">
            ${previewHtml}
            <div class="review__caseActions">
              ${caseBtnHtml}
            </div>
          </div>` : ``}
      </article>
    `;
  }).join("");

  el.innerHTML = html;
}

function normalizeAssetUrl(url) {
  const u = String(url ?? "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  // relative paths: strip leading slashes so GitHub Pages resolves correctly
  return u.replace(/^\/+/, "");
}
function escapeAttr(str) {
    return escapeHtml(str).replaceAll("`", "&#096;");
  }


  async function main() {
    setText("#year", String(new Date().getFullYear()));

    if (!cfg || !cfg.SHEET_ID || cfg.SHEET_ID.includes("PASTE_")) {
      console.warn("SHEET_ID is not set. Please edit assets/js/config.js");
      showSheetError("Не удалось загрузить данные из Google Sheets. Проверьте ID таблицы в config.js.");
      return;
    }

    const sheetId = cfg.SHEET_ID;
    const tabs = cfg.TABS;
    const limits = cfg.LIMITS || {};
    const sheetErrors = [];
    const fetchTabSafe = async (tabName) => {
      try {
        return await Sheets.fetchTab(sheetId, tabName);
      } catch (err) {
        sheetErrors.push(tabName);
        return [];
      }
    };

    // 1) Site KV
    const siteRows = await fetchTabSafe(tabs.site);
    const kv = {};
    siteRows.forEach(r => {
      const k = String(r.key || "").trim();
      if (!k) return;
      kv[k] = (r.value ?? "");
    });
    applyKV(kv);

    // 2) Small proof pills on hero
    const trustMini = (kv.trust_mini || "").split("|").map(s => s.trim()).filter(Boolean);
    if (trustMini.length) {
      renderPills("trustMini", trustMini);
      toggleSection("#trustMini", true);
    } else {
      toggleSection("#trustMini", false);
    }

    // 3) Pains
    const pains = (await fetchTabSafe(tabs.pains)).slice(0, limits.pains || 999);
    if (pains.length) renderCards("painsGrid", pains);
    toggleSection("#for", pains.length > 0);

    // 4) Deliverables
    const deliverables = (await fetchTabSafe(tabs.deliverables)).slice(0, limits.deliverables || 999);
    if (deliverables.length) {
      renderChecklist("deliverablesList", deliverables);
      renderChecklist("deliverablesMini", deliverables.slice(0, 4));
    }
    toggleSection("#deliverables", deliverables.length > 0);

    // 5) Steps
    const steps = (await fetchTabSafe(tabs.steps)).slice(0, limits.steps || 999);
    if (steps.length) renderSteps("stepsList", steps);
    toggleSection("#process", steps.length > 0);

    // 6) Trust bullets + stats
    const trust = (await fetchTabSafe(tabs.trust)).slice(0, limits.trust || 999);
    if (trust.length) renderBullets("trustBullets", trust);
    toggleSection("#trustBullets", trust.length > 0);

    const stats = (await fetchTabSafe(tabs.stats)).slice(0, limits.stats || 999);
    if (stats.length) renderStats("statsGrid", stats);
    toggleSection("#statsGrid", stats.length > 0);

    // 7) Pricing
    const pricing = (await fetchTabSafe(tabs.pricing)).slice(0, limits.pricing || 999);
    if (pricing.length) renderPricing("pricingGrid", pricing);
    toggleSection("#pricing", pricing.length > 0);

    // 8) Principles
    const doList = (await fetchTabSafe(tabs.principles_do)).slice(0, limits.principles_do || 999);
    if (doList.length) renderBullets("doList", doList);

    const dontList = (await fetchTabSafe(tabs.principles_dont)).slice(0, limits.principles_dont || 999);
    if (dontList.length) renderBullets("dontList", dontList);

    // 9) Mistakes (optional)
    const mistakes = (await fetchTabSafe(tabs.mistakes)).slice(0, limits.mistakes || 999);
    if (mistakes.length) {
      renderCards("mistakesGrid", mistakes);
      const sec = el("mistakesSection");
      if (sec) sec.hidden = false;
    } else {
      const sec = el("mistakesSection");
      if (sec) sec.hidden = true;
    }
    toggleSection("#principles", doList.length > 0 || dontList.length > 0 || mistakes.length > 0);

    // 10) Cases
    const cases = (await fetchTabSafe(tabs.cases)).slice(0, limits.cases || 999);
    if (cases.length) renderCases("casesGrid", cases);
    toggleSection("#cases", cases.length > 0);

    // 11) Reviews
    const reviews = (await fetchTabSafe(tabs.reviews)).slice(0, limits.reviews || 999);
    if (reviews.length) renderReviews("reviewsGrid", reviews);
    initReviewCases();
    toggleSection("#reviews", reviews.length > 0);

    // 12) FAQ
    const faq = (await fetchTabSafe(tabs.faq)).slice(0, limits.faq || 999);
    if (faq.length) renderFAQ("faqList", faq);
    toggleSection("#faq", faq.length > 0);

    // 13) Contacts
    const contacts = (await fetchTabSafe(tabs.contacts)).slice(0, limits.contacts || 999);
    renderContacts("contactCards", contacts, kv);

    if (sheetErrors.length) {
      console.warn("Sheets tabs failed:", sheetErrors);
      showSheetError("Не удалось загрузить данные из Google Sheets. Проверьте доступ к таблице и названия вкладок.");
    } else {
      showSheetError("");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    main().catch(err => console.error(err));
  });


// ---------------------------
// Review case modal (Before/After)
// ---------------------------
let lastFocusedEl = null;

const getFocusable = (root) => {
  if (!root) return [];
  const nodes = Array.from(root.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ));
  return nodes.filter((el) => !el.hasAttribute("hidden") && !el.getAttribute("aria-hidden"));
};

const trapFocus = (e, root) => {
  if (e.key !== "Tab") return;
  const focusables = getFocusable(root);
  if (!focusables.length) {
    e.preventDefault();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
};

function ensureReviewCaseModal() {
  let modal = document.getElementById("reviewCaseModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "reviewCaseModal";
  modal.className = "case-modal";
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");

  modal.innerHTML = `
    <div class="case-modal__backdrop" data-action="case-close"></div>
    <div class="case-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="caseModalTitle">
      <button class="case-modal__close" type="button" data-action="case-close" aria-label="Закрыть">✕</button>
      <div class="case-modal__head">
        <div class="case-modal__badge">Кейс</div>
        <h3 class="case-modal__title" id="caseModalTitle">Было / стало</h3>
      </div>

      <div class="case-modal__compare">
        <figure class="case-figure case-figure--before">
          <figcaption class="case-figure__cap">Было</figcaption>
          <a class="case-figure__link" target="_blank" rel="noopener">
            <img class="case-figure__img" alt="План до" loading="lazy" decoding="async" />
          </a>
          <div class="case-figure__note" data-part="beforeNote"></div>
        </figure>

        <figure class="case-figure case-figure--after">
          <figcaption class="case-figure__cap">Стало</figcaption>
          <a class="case-figure__link" target="_blank" rel="noopener">
            <img class="case-figure__img" alt="План после" loading="lazy" decoding="async" />
          </a>
          <div class="case-figure__note" data-part="afterNote"></div>
        </figure>
      </div>

      <div class="case-modal__comment" data-part="comment" hidden>
        <div class="case-modal__commentLabel">Комментарий Натальи</div>
        <div class="case-modal__commentText"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close handlers
  modal.addEventListener("click", (e) => {
    const close = e.target && e.target.closest('[data-action="case-close"]');
    if (close) closeReviewCaseModal();
  });

  modal.addEventListener("keydown", (e) => {
    trapFocus(e, modal);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeReviewCaseModal();
  });

  return modal;
}

function openReviewCaseModalFromCard(card) {
  const modal = ensureReviewCaseModal();
  lastFocusedEl = (document.activeElement instanceof HTMLElement) ? document.activeElement : null;

  const beforeUrl = normalizeAssetUrl(card.getAttribute("data-case-before") || "");
  const afterUrl  = normalizeAssetUrl(card.getAttribute("data-case-after") || "");

  const titleEnc = card.getAttribute("data-case-title") || "";
  const title = decodeURIComponent(titleEnc || "");

  const beforeCap = decodeURIComponent(card.getAttribute("data-case-before-caption") || "");
  const afterCap  = decodeURIComponent(card.getAttribute("data-case-after-caption") || "");
  const comment   = decodeURIComponent(card.getAttribute("data-case-comment") || "");

  const titleEl = modal.querySelector(".case-modal__title");
  titleEl.textContent = title || "Было / стало";

  const figBefore = modal.querySelector(".case-figure--before");
  const figAfter  = modal.querySelector(".case-figure--after");

  // Before
  if (beforeUrl) {
    figBefore.hidden = false;
    const link = figBefore.querySelector(".case-figure__link");
    const img = figBefore.querySelector(".case-figure__img");
    link.href = beforeUrl;
    img.src = beforeUrl;
    figBefore.querySelector('[data-part="beforeNote"]').innerHTML = beforeCap ? escapeHtml(beforeCap).replace(/\n/g, "<br>") : "";
  } else {
    figBefore.hidden = true;
  }

  // After
  if (afterUrl) {
    figAfter.hidden = false;
    const link = figAfter.querySelector(".case-figure__link");
    const img = figAfter.querySelector(".case-figure__img");
    link.href = afterUrl;
    img.src = afterUrl;
    figAfter.querySelector('[data-part="afterNote"]').innerHTML = afterCap ? escapeHtml(afterCap).replace(/\n/g, "<br>") : "";
  } else {
    figAfter.hidden = true;
  }

  // Comment
  const commentWrap = modal.querySelector('[data-part="comment"]');
  if (comment && comment.trim()) {
    commentWrap.hidden = false;
    commentWrap.querySelector(".case-modal__commentText").innerHTML = escapeHtml(comment).replace(/\n/g, "<br>");
  } else {
    commentWrap.hidden = true;
  }

  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("case-modal-open");

  // Focus close for accessibility
  const closeBtn = modal.querySelector(".case-modal__close");
  closeBtn && closeBtn.focus();
}

function closeReviewCaseModal() {
  const modal = document.getElementById("reviewCaseModal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("case-modal-open");
  if (lastFocusedEl && document.contains(lastFocusedEl)) {
    lastFocusedEl.focus();
  }
  lastFocusedEl = null;
}

function initReviewCases() {
  // Event delegation so it works even if the slider re-wraps/clones nodes.
  if (window.__byplanReviewCasesInit) return;
  window.__byplanReviewCasesInit = true;

  document.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest('[data-action="review-case"]');
    if (!btn) return;

    const card = btn.closest(".review");
    if (!card) return;

    openReviewCaseModalFromCard(card);
  });
}

})();
