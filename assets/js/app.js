(function () {
  const cfg = window.SITE_CONFIG;

  const el = (id) => document.getElementById(id);

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

  function applyKV(kv) {
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
      if (!href) {
        node.removeAttribute("href");
        node.hidden = true;
        return;
      }
      node.hidden = false;
      node.setAttribute("href", href);
    });

    // Designer photo
    // Hero media
    if (kv.hero_image_url) {
      const img = el("heroImage");
      if (img) {
        img.src = kv.hero_image_url;
        if (kv.hero_image_alt) img.alt = kv.hero_image_alt;
      }
    }
    const heroCap = document.querySelector('[data-kv="hero_image_caption"]');
    if (heroCap && (!kv.hero_image_caption || String(kv.hero_image_caption).trim()==="")) {
      heroCap.hidden = true;
    }

    if (kv.designer_photo_url) {
      const img = el("designerPhoto");
      if (img) img.src = kv.designer_photo_url;
    }

    // Meta tags (allow clearing)
    if (kv.site_title !== undefined) document.title = String(kv.site_title ?? "");
    if (kv.meta_description !== undefined) {
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute("content", String(kv.meta_description ?? ""));
    }
    if (kv.og_image) {
      const og = document.querySelector('meta[property="og:image"]');
      if (og) og.setAttribute("content", kv.og_image);
    }

    // Optional: embed form
    const embedUrl = kv.lead_form_embed_url;
    const embedWrap = el("formEmbed");
    if (embedUrl && embedWrap) {
      embedWrap.hidden = false;
      embedWrap.innerHTML = `<iframe src="${embedUrl}" loading="lazy" title="Форма"></iframe>`;
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

      card.innerHTML = `
        <div class="price-card__top">
          <div class="price-card__plan">${escapeHtml(r.plan || "")}</div>
          ${badge ? `<div class="price-card__badge">${escapeHtml(badge)}</div>` : ""}
        </div>
        <p class="price-card__price">${escapeHtml(r.price || "")}</p>
        ${r.price_note ? `<p class="price-card__note">${escapeHtml(r.price_note)}</p>` : ""}
        <ul class="price-card__features">${features.map(f => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
        ${(r.cta_url || r.cta_label) ? `<a class="btn btn--primary" href="${escapeAttr(r.cta_url || "#contact")}" ${isExternal(r.cta_url) ? 'target="_blank" rel="noopener"' : ""}>${escapeHtml(r.cta_label || "Запросить")}</a>` : ""}
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
      const metaParts = [];
      if (r.area_m2) metaParts.push(`${r.area_m2} м²`);
      if (r.type) metaParts.push(r.type);
      if (r.city) metaParts.push(r.city);

      card.innerHTML = `
        <div class="case-card__img">
          ${img ? `<img src="${escapeAttr(img)}" alt="" loading="lazy" />` : ""}
        </div>
        <div class="case-card__body">
          <p class="case-card__title">${escapeHtml(r.title || "")}</p>
          <div class="case-card__meta">${escapeHtml(metaParts.join(" · "))}</div>
          ${r.problem ? `<div><strong>Задача:</strong> <span class="muted">${escapeHtml(r.problem)}</span></div>` : ""}
          ${r.result ? `<div><strong>Результат:</strong> <span class="muted">${escapeHtml(r.result)}</span></div>` : ""}
          ${r.url ? `<a class="btn btn--ghost" href="${escapeAttr(r.url)}" target="_blank" rel="noopener">Открыть</a>` : ""}
        </div>
      `;
      root.appendChild(card);
    });
  }

  function renderReviews(containerId, rows) {
    const root = el(containerId);
    if (!root) return;
    root.innerHTML = "";

    const boolish = (v) => {
      if (v === true) return true;
      if (v === false) return false;
      const s = String(v ?? "").trim().toLowerCase();
      if (!s) return true; // empty -> treat as enabled
      return ["1", "true", "yes", "y", "да", "истина", "on"].includes(s);
    };

    const get = (obj, ...keys) => {
      for (const k of keys) {
        const val = obj && obj[k];
        if (val !== undefined && val !== null && String(val).trim() !== "") return String(val).trim();
      }
      return "";
    };

    const formatText = (t) =>
      escapeHtml(t)
        .replace(/\n\s*\n/g, "<br><br>")
        .replace(/\n/g, "<br>");

    (rows || [])
      .filter(r => (r.is_enabled === undefined ? true : boolish(r.is_enabled)))
      .forEach((r, idx) => {
        // Backward-compatible field names:
        const name = get(r, "name", "author", "who");
        const role = get(r, "role", "title", "position");
        const meta = get(r, "company_or_city", "company", "city");
        const text = get(r, "text", "review", "body");
        const source = get(r, "source", "src");

        const div = document.createElement("article");
        div.className = "review";
        div.dataset.reviewIndex = String(idx + 1);

        div.innerHTML = `
          <div class="review__who">
            ${name ? `<div class="review__name">${escapeHtml(name)}</div>` : ""}
            ${(role || meta) ? `<div class="review__role">${escapeHtml([role, meta].filter(Boolean).join(" · "))}</div>` : ""}
          </div>
          <p class="review__text">${formatText(text)}</p>
          ${source ? `<div class="review__src">${escapeHtml(source)}</div>` : ""}
        `;
        root.appendChild(div);
      });
  }

  function renderFAQ(containerId, rows) {
    const root = el(containerId);
    if (!root) return;
    root.innerHTML = "";

    rows.forEach((r, idx) => {
      const item = document.createElement("div");
      item.className = "faq-item";
      const qId = `faq-${idx}`;
      item.innerHTML = `
        <button class="faq-q" type="button" aria-expanded="false" aria-controls="${qId}">
          <span>${escapeHtml(r.q || "")}</span>
          <span class="faq-icon" aria-hidden="true">+</span>
        </button>
        <div class="faq-a" id="${qId}" hidden>${escapeHtml(r.a || "")}</div>
      `;
      root.appendChild(item);
    });

    // accordion behavior
    root.querySelectorAll(".faq-q").forEach(btn => {
      btn.addEventListener("click", () => {
        const expanded = btn.getAttribute("aria-expanded") === "true";
        const targetId = btn.getAttribute("aria-controls");
        const ans = document.getElementById(targetId);
        if (!ans) return;
        btn.setAttribute("aria-expanded", String(!expanded));
        ans.hidden = expanded;
        const icon = btn.querySelector(".faq-icon");
        if (icon) icon.textContent = expanded ? "+" : "–";
      });
    });
  }

  function renderContacts(containerId, rows, kv) {
    const root = el(containerId);
    if (!root) return;
    root.innerHTML = "";

    // If 'contacts' tab exists, render it.
    if (rows.length) {
      rows.forEach(r => {
        const card = document.createElement("div");
        card.className = "contact-card";
        const url = (r.url || "").trim();
        const title = (r.title || "").trim();
        const text = (r.text || "").trim();
        const label = (r.label || "").trim() || "Открыть";
        card.innerHTML = `
          <div class="contact-card__title">${escapeHtml(title)}</div>
          <div class="contact-card__text">${escapeHtml(text)}</div>
          ${url ? `<div style="margin-top:10px"><a class="btn btn--ghost" href="${escapeAttr(url)}" ${isExternal(url) ? 'target="_blank" rel="noopener"' : ""}>${escapeHtml(label)}</a></div>` : ""}
        `;
        root.appendChild(card);
      });
      return;
    }

    // Otherwise render basic contacts from KV
    const fallback = [];
    if (kv.telegram_url) fallback.push({ title: "Telegram", text: kv.telegram_handle ? `@${kv.telegram_handle}` : "Написать в Telegram", url: kv.telegram_url, label: "Написать" });
    if (kv.contact_email) fallback.push({ title: "Email", text: kv.contact_email, url: `mailto:${kv.contact_email}`, label: "Написать" });
    if (kv.contact_phone) fallback.push({ title: "Телефон", text: kv.contact_phone, url: `tel:${kv.contact_phone.replace(/\s+/g,"")}`, label: "Позвонить" });

    fallback.forEach(r => {
      const card = document.createElement("div");
      card.className = "contact-card";
      card.innerHTML = `
        <div class="contact-card__title">${escapeHtml(r.title)}</div>
        <div class="contact-card__text">${escapeHtml(r.text)}</div>
        <div style="margin-top:10px"><a class="btn btn--ghost" href="${escapeAttr(r.url)}">${escapeHtml(r.label)}</a></div>
      `;
      root.appendChild(card);
    });
  }

  function isExternal(url) {
    if (!url) return false;
    return /^https?:\/\//i.test(url);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replaceAll("`", "&#096;");
  }

  function setupNavToggle() {
    const toggle = document.querySelector(".nav__toggle");
    const menu = document.querySelector(".nav__menu");
    if (!toggle || !menu) return;
    toggle.addEventListener("click", () => {
      const isOpen = menu.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    // close on click
    menu.querySelectorAll("a").forEach(a => {
      a.addEventListener("click", () => {
        menu.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  async function main() {
    setText("#year", String(new Date().getFullYear()));
    setupNavToggle();

    if (!cfg || !cfg.SHEET_ID || cfg.SHEET_ID.includes("PASTE_")) {
      console.warn("SHEET_ID is not set. Please edit assets/js/config.js");
      return;
    }

    const sheetId = cfg.SHEET_ID;
    const tabs = cfg.TABS;
    const limits = cfg.LIMITS || {};

    // 1) Site KV
    const siteRows = await Sheets.fetchTab(sheetId, tabs.site).catch(() => []);
    const kv = {};
    siteRows.forEach(r => {
      const k = String(r.key || "").trim();
      if (!k) return;
      kv[k] = (r.value ?? "");
    });
    applyKV(kv);

    // 2) Small proof pills on hero
    const trustMini = (kv.trust_mini || "").split("|").map(s => s.trim()).filter(Boolean);
    if (trustMini.length) renderPills("trustMini", trustMini);

    // 3) Pains
    const pains = (await Sheets.fetchTab(sheetId, tabs.pains).catch(() => [])).slice(0, limits.pains || 999);
    if (pains.length) renderCards("painsGrid", pains);

    // 4) Deliverables
    const deliverables = (await Sheets.fetchTab(sheetId, tabs.deliverables).catch(() => [])).slice(0, limits.deliverables || 999);
    if (deliverables.length) {
      renderChecklist("deliverablesList", deliverables);
      renderChecklist("deliverablesMini", deliverables.slice(0, 4));
    }

    // 5) Steps
    const steps = (await Sheets.fetchTab(sheetId, tabs.steps).catch(() => [])).slice(0, limits.steps || 999);
    if (steps.length) renderSteps("stepsList", steps);

    // 6) Trust bullets + stats
    const trust = (await Sheets.fetchTab(sheetId, tabs.trust).catch(() => [])).slice(0, limits.trust || 999);
    if (trust.length) renderBullets("trustBullets", trust);

    const stats = (await Sheets.fetchTab(sheetId, tabs.stats).catch(() => [])).slice(0, limits.stats || 999);
    if (stats.length) renderStats("statsGrid", stats);

    // 7) Pricing
    const pricing = (await Sheets.fetchTab(sheetId, tabs.pricing).catch(() => [])).slice(0, limits.pricing || 999);
    if (pricing.length) renderPricing("pricingGrid", pricing);

    // 8) Principles
    const doList = (await Sheets.fetchTab(sheetId, tabs.principles_do).catch(() => [])).slice(0, limits.principles_do || 999);
    if (doList.length) renderBullets("doList", doList);

    const dontList = (await Sheets.fetchTab(sheetId, tabs.principles_dont).catch(() => [])).slice(0, limits.principles_dont || 999);
    if (dontList.length) renderBullets("dontList", dontList);

    // 9) Mistakes (optional)
    const mistakes = (await Sheets.fetchTab(sheetId, tabs.mistakes).catch(() => [])).slice(0, limits.mistakes || 999);
    if (mistakes.length) {
      renderCards("mistakesGrid", mistakes);
      const sec = el("mistakesSection");
      if (sec) sec.hidden = false;
    } else {
      const sec = el("mistakesSection");
      if (sec) sec.hidden = true;
    }

    // 10) Cases
    const cases = (await Sheets.fetchTab(sheetId, tabs.cases).catch(() => [])).slice(0, limits.cases || 999);
    if (cases.length) renderCases("casesGrid", cases);

    // 11) Reviews
    const reviews = (await Sheets.fetchTab(sheetId, tabs.reviews).catch(() => [])).slice(0, limits.reviews || 999);
    if (reviews.length) renderReviews("reviewsGrid", reviews);

    // 12) FAQ
    const faq = (await Sheets.fetchTab(sheetId, tabs.faq).catch(() => [])).slice(0, limits.faq || 999);
    if (faq.length) renderFAQ("faqList", faq);

    // 13) Contacts
    const contacts = (await Sheets.fetchTab(sheetId, tabs.contacts).catch(() => [])).slice(0, limits.contacts || 999);
    renderContacts("contactCards", contacts, kv);
  }

  document.addEventListener("DOMContentLoaded", () => {
    main().catch(err => console.error(err));
  });
})();
