/* ============================================================
   BYPLAN — app-core.js  (v1)
   Purpose: keep critical helpers/renderers stable so app.js doesn't crash
   Fixes current crash: renderFAQ is not defined
   Also provides: escapeHtml, isExternal, renderContacts
   ============================================================ */

(function () {
  "use strict";

  // ---- Helpers ----
  function norm(v) { return (v ?? "").toString().trim(); }

  function escapeHtml(str) {
    const s = (str ?? "").toString();
    return s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isExternal(url) {
    const u = norm(url);
    if (!u) return false;
    if (u.startsWith("#")) return false;
    // treat absolute http(s) as external
    return /^https?:\/\//i.test(u);
  }

  function sanitizeUrl(url, options = {}) {
    const raw = String(url ?? "").trim();
    if (!raw) return "";

    const allowRelative = options.allowRelative !== false;
    const allowedProtocols = options.allowedProtocols || ["http:", "https:", "mailto:", "tel:"];

    if (raw.startsWith("#")) return raw;

    try {
      const parsed = new URL(raw, document.baseURI);
      const isRelativeInput = !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw);
      if (isRelativeInput && !allowRelative) return "";
      if (!allowedProtocols.includes(parsed.protocol)) return "";
      if (isRelativeInput) return raw.replace(/^\/+/, "");
      return parsed.href;
    } catch {
      return "";
    }
  }

  function safeBool(v, fallback = true) {
    if (typeof v === "boolean") return v;
    const s = norm(v).toLowerCase();
    if (!s) return fallback;
    return !(s === "0" || s === "false" || s === "нет" || s === "no");
  }

  function getEl(target) {
    if (!target) return null;
    if (typeof target === "string") return document.getElementById(target) || document.querySelector(target);
    return target;
  }

  // ---- Render: FAQ ----
  function renderFAQ(targetIdOrEl, rows) {
    if (Array.isArray(targetIdOrEl) && rows === undefined) {
      rows = targetIdOrEl;
      targetIdOrEl = "faqList";
    }
    const root = getEl(targetIdOrEl);
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

      item.append(btn, ans);
      root.appendChild(item);
    });
    if (typeof observeReveals === "function") observeReveals();
  }

  // ---- Render: Contacts cards ----
  function renderContacts(targetIdOrEl, rows, kv = {}) {
    const root = getEl(targetIdOrEl);
    if (!root) return;
    root.innerHTML = "";

    const items = (rows || [])
      .filter(r => safeBool(r.is_enabled ?? r.enabled, true))
      .map(r => ({
        title: norm(r.title ?? r.name ?? r.label),
        text: norm(r.text ?? r.value ?? r.subtitle ?? r.description),
        url: norm(r.url ?? r.href ?? r.link),
        cta: norm(r.cta ?? r.button ?? r.button_label ?? r.label_button),
      }))
      .filter(x => x.title || x.text || x.url);

    const fallback = [];
    if (!items.length) {
      if (kv.telegram_url) fallback.push({ title: "Telegram", text: kv.telegram_handle ? `@${kv.telegram_handle}` : "Написать в Telegram", url: kv.telegram_url, cta: "Написать" });
      if (kv.contact_email) fallback.push({ title: "Email", text: kv.contact_email, url: `mailto:${kv.contact_email}`, cta: "Написать" });
      if (kv.contact_phone) {
        const phone = String(kv.contact_phone).replace(/[^\d+]/g, "");
        fallback.push({ title: "Телефон", text: kv.contact_phone, url: `tel:${phone}`, cta: "Позвонить" });
      }
    }

    const rowsToRender = items.length ? items : fallback;
    if (!rowsToRender.length) {
      root.hidden = true;
      return;
    }
    root.hidden = false;

    const briefUrl = kv?.brief_url ? sanitizeUrl(kv.brief_url, { allowRelative: true }) : "";
    const normalizeUrl = (url) => {
      const safe = sanitizeUrl(url, { allowRelative: true });
      if (!safe) return "";
      try {
        return new URL(safe, document.baseURI).href;
      } catch {
        return safe;
      }
    };
    const briefAbs = briefUrl ? normalizeUrl(briefUrl) : "";

    const iconTypeFor = (it) => {
      const title = (it.title || "").toLowerCase();
      const url = (it.url || "").toLowerCase();

      if (url.startsWith("mailto:") || title.includes("email") || title.includes("почта")) return "email";
      if (url.startsWith("tel:") || title.includes("телефон") || title.includes("phone")) return "phone";
      if (url.includes("t.me") || url.includes("telegram") || title.includes("telegram") || title.includes("телеграм")) return "telegram";
      if (url.includes("wa.me") || url.includes("whatsapp") || title.includes("whatsapp") || title.includes("ватсап")) return "whatsapp";
      if (title.includes("анкета") || title.includes("бриф") || url.includes("docs.google.com/forms")) return "form";
      return "chat";
    };

    const iconSvg = (type) => {
      switch (type) {
        case "email":
          return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" ry="2"></rect><polyline points="3 7 12 13 21 7"></polyline></svg>';
        case "phone":
          return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.8 12.8 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8 9a16 16 0 0 0 6 6l.36-.36a2 2 0 0 1 2.11-.45 12.8 12.8 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>';
        case "telegram":
          return '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
        case "whatsapp":
          return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.5a8.5 8.5 0 1 1-4.4-7.4"></path><path d="M7.5 18.5l1.5-.5a8.5 8.5 0 0 0 8.5-8.5"></path></svg>';
        case "form":
          return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><line x1="8" y1="11" x2="16" y2="11"></line><line x1="8" y1="15" x2="16" y2="15"></line></svg>';
        case "chat":
        default:
          return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-9 8.5 8.38 8.38 0 0 1-4-1L3 21l1.5-4A8.38 8.38 0 0 1 3.5 12 8.38 8.38 0 0 1 12 3.5a8.38 8.38 0 0 1 9 8z"></path></svg>';
      }
    };

    const filtered = rowsToRender.filter((it) => {
      if (!briefAbs) return true;
      const title = (it.title || "").toLowerCase();
      const urlAbs = it.url ? normalizeUrl(it.url) : "";
      if (urlAbs && urlAbs === briefAbs) return false;
      if (title.includes("анкета")) return false;
      return true;
    });

    if (!filtered.length) {
      root.hidden = true;
      return;
    }

    filtered.forEach(it => {
      const card = document.createElement("div");
      card.className = "contact-card";

      const icon = document.createElement("div");
      icon.className = "contact-card__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = iconSvg(iconTypeFor(it));

      const body = document.createElement("div");
      body.className = "contact-card__body";

      if (it.title) {
        const h = document.createElement("div");
        h.className = "contact-card__title";
        h.textContent = it.title;
        body.appendChild(h);
      }

      if (it.text) {
        const p = document.createElement("div");
        p.className = "contact-card__text";
        p.textContent = it.text;
        body.appendChild(p);
      }

      card.appendChild(icon);
      card.appendChild(body);

      if (it.url) {
        const safeUrl = sanitizeUrl(it.url, { allowRelative: true });
        if (safeUrl) {
          const actions = document.createElement("div");
          actions.className = "contact-card__actions";
          const a = document.createElement("a");
          a.className = "btn btn--ghost contact-card__cta";
          a.href = safeUrl;
          if (isExternal(safeUrl)) {
            a.target = "_blank";
            a.rel = "noopener";
          }
          a.textContent = it.cta || "Открыть";
          actions.appendChild(a);
          card.appendChild(actions);
        }
      }

      root.appendChild(card);
    });
  }

  // ---- Export to global (so app.js can call without imports) ----
  if (!window.escapeHtml) window.escapeHtml = escapeHtml;
  if (!window.isExternal) window.isExternal = isExternal;
  if (!window.renderFAQ) window.renderFAQ = renderFAQ;
  if (!window.renderContacts) window.renderContacts = renderContacts;

  window.__BYPLAN_CORE__ = { version: "1.1.0" };
})();
