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
  const el = document.getElementById(containerId);
  if (!el) return;

  const html = (rows || []).map((r, idx) => {
    const name = escapeHtml(r.name || "");
    const role = escapeHtml(r.role || "");
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
            <img src="${escapeAttr(caseBefore)}" alt="" loading="lazy" />
          </div>
          <div class="review__caseThumb">
            <span class="review__caseLabel">Стало</span>
            <img src="${escapeAttr(caseAfter)}" alt="" loading="lazy" />
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


  function renderFAQ(rows) {
  const root = el("faqList");
  if (!root) return;
  root.innerHTML = "";
  root.dataset.skeleton = "0";

  // Defensive getter: supports different column names in Google Sheets
  const pick = (r, keys) => {
    for (const k of keys) {
      if (!r) continue;
      if (Object.prototype.hasOwnProperty.call(r, k)) {
        const v = r[k];
        if (v !== null && v !== undefined) {
          const s = String(v).trim();
          if (s) return s;
        }
      }
    }
    return "";
  };

  const enabledRows = (rows || []).filter((r) => {
    const raw = (r && r.is_enabled !== undefined && r.is_enabled !== null) ? String(r.is_enabled) : "1";
    return raw.trim() !== "0";
  });

  enabledRows.forEach((r, i) => {
    // Support both object rows and array rows (in case the sheet parser changes)
    let qText = "";
    let aText = "";
    if (Array.isArray(r)) {
      qText = String(r[0] ?? "").trim();
      aText = String(r[1] ?? "").trim();
    } else {
      const qKeys = ["q", "question", "Q", "вопрос", "Вопрос", "title", "h", "header", "name"];
      const aKeys = ["a", "answer", "A", "ответ", "Ответ", "answer_text", "answer_md", "answer_html", "text", "body", "details", "desc", "description", "content"];
      qText = pick(r, qKeys) || "";
      aText = pick(r, aKeys) || "";
      if (!aText) {
        const qLower = new Set(qKeys.map((k) => String(k).toLowerCase()));
        const metaLower = new Set(["id", "is_enabled", "enabled", "show", "display", "order", "sort", "priority"]);
        for (const [k, v] of Object.entries(r)) {
          const key = String(k).toLowerCase();
          if (qLower.has(key)) continue;
          if (metaLower.has(key)) continue;
          const val = String(v ?? "").trim();
          if (!val) continue;
          if (val === String(qText).trim()) continue;
          aText = val;
          break;
        }
      }
    }

    // Skip completely empty rows (common in Sheets)
    if (!qText && !aText) return;

    const item = document.createElement("div");
    item.className = "faq-item reveal";
    item.setAttribute("data-reveal", "");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "faq-q";
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", `faq-${i}`);

    const label = document.createElement("span");
    label.className = "faq-q__label";
    label.textContent = qText || "";

    const icon = document.createElement("span");
    icon.className = "faq-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "+";

    btn.append(label, icon);

    const ans = document.createElement("div");
    ans.className = "faq-a";
    ans.id = `faq-${i}`;
    ans.textContent = aText || "";
    ans.style.whiteSpace = "pre-line"; // preserve line breaks from Sheets
    ans.hidden = true;

    // If some CSS accidentally forces display:none for .faq-a,
    // inline style makes the open state deterministic.
    ans.style.display = "none";

    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") !== "true";
      btn.setAttribute("aria-expanded", String(open));
      item.classList.toggle("is-open", open);
      icon.textContent = open ? "−" : "+";

      ans.hidden = !open;
      ans.style.display = open ? "block" : "none";
    });

    item.append(btn, ans);
    root.appendChild(item);
  });
  if (typeof observeReveals === "function") observeReveals();
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
    initReviewCases();

    // 12) FAQ
    const faq = (await Sheets.fetchTab(sheetId, tabs.faq).catch(() => [])).slice(0, limits.faq || 999);
    if (faq.length) renderFAQ(faq);

    // 13) Contacts
    const contacts = (await Sheets.fetchTab(sheetId, tabs.contacts).catch(() => [])).slice(0, limits.contacts || 999);
    renderContacts("contactCards", contacts, kv);
  }

  document.addEventListener("DOMContentLoaded", () => {
    main().catch(err => console.error(err));
  });


// ---------------------------
// Review case modal (Before/After)
// ---------------------------
function ensureReviewCaseModal() {
  let modal = document.getElementById("reviewCaseModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "reviewCaseModal";
  modal.className = "case-modal";
  modal.hidden = true;

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
            <img class="case-figure__img" alt="План до" loading="lazy" />
          </a>
          <div class="case-figure__note" data-part="beforeNote"></div>
        </figure>

        <figure class="case-figure case-figure--after">
          <figcaption class="case-figure__cap">Стало</figcaption>
          <a class="case-figure__link" target="_blank" rel="noopener">
            <img class="case-figure__img" alt="План после" loading="lazy" />
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

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeReviewCaseModal();
  });

  return modal;
}

function openReviewCaseModalFromCard(card) {
  const modal = ensureReviewCaseModal();

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
  document.body.classList.add("case-modal-open");

  // Focus close for accessibility
  const closeBtn = modal.querySelector(".case-modal__close");
  closeBtn && closeBtn.focus();
}

function closeReviewCaseModal() {
  const modal = document.getElementById("reviewCaseModal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.body.classList.remove("case-modal-open");
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
