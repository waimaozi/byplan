/* === config.js === */
// ===============================
// CONFIG
// ===============================
// 1) Создайте Google Sheets по шаблону (см. README.md)
// 2) Откройте доступ "Anyone with the link" или "Publish to web"
// 3) Вставьте ID таблицы ниже.
//
// Пример URL таблицы:
// https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit#gid=0
//
// Важно: таблица должна быть доступна без авторизации, иначе GitHub Pages не сможет читать контент.

window.SITE_CONFIG = {
  VERSION: "16",
  SHEET_ID: "1Sb3_veKvtCsc-gkx4dgeLr3H-UFV9wkv1I_Z-05Ngro",
  // Local snapshot fallback if Sheets are blocked/unavailable
  SNAPSHOT_URL: "assets/data/snapshot.json",

  // Названия вкладок (tabs) в Google Sheets
  TABS: {
    site: "site",
    pains: "pains",
    deliverables: "deliverables",
    steps: "steps",
    trust: "trust",
    stats: "stats",
    pricing: "pricing",
    principles_do: "principles_do",
    principles_dont: "principles_dont",
    mistakes: "mistakes",
    why_stats: "why_stats",
    why_trust: "why_trust",
    cases: "cases",
    reviews: "reviews",
    faq: "faq",
    contacts: "contacts"
  },

  // Сколько строк показывать (на случай, если таблица «разрастётся»)
  LIMITS: {
    pains: 9,
    deliverables: 10,
    steps: 8,
    trust: 10,
    stats: 6,
    pricing: 6,
    principles_do: 12,
    principles_dont: 12,
    mistakes: 12,
    why_stats: 8,
    why_trust: 3,
    cases: 40,
    reviews: 20,
    faq: 20,
    contacts: 10
  }
};

;
/* === sheets.js === */
// ===============================
// Google Sheets (GViz) loader
// ===============================
// Uses JSONP to avoid CORS issues in the browser.
// Falls back to localStorage cache, then to a local snapshot JSON.

(function () {
  const cache = new Map();
  const inflight = new Map();
  const runId = Date.now().toString(36);
  const storagePrefix = "byplan_sheet_cache:";
  const maxAgeMs = 1000 * 60 * 60 * 24 * 7; // 7 days

  const state = {
    usedSnapshot: false,
    usedStorage: false,
    errors: [],
    forceFallback: false
  };

  const snapshotUrl = (window.SITE_CONFIG && window.SITE_CONFIG.SNAPSHOT_URL)
    ? String(window.SITE_CONFIG.SNAPSHOT_URL)
    : "assets/data/snapshot.json";
  let snapshotPromise = null;

  function tableToObjects(table) {
    const cols = (table.cols || []).map(c => (c.label || "").trim());
    const rows = (table.rows || []).map(r => (r.c || []).map(cell => (cell && typeof cell.v !== "undefined") ? cell.v : ""));
    let lastCol = cols.length - 1;
    while (lastCol >= 0 && !cols[lastCol]) lastCol--;
    const cleanCols = cols.slice(0, lastCol + 1);

    return rows.map(row => {
      const obj = {};
      cleanCols.forEach((col, i) => {
        obj[col] = (row[i] ?? "");
      });
      return obj;
    });
  }

  function readStorage(storageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.data)) return null;
      if (parsed.ts && (Date.now() - parsed.ts > maxAgeMs)) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  function writeStorage(storageKey, data) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // ignore storage errors (quota, private mode)
    }
  }

  function jsonp(url, cbName, timeoutMs) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      let done = false;

      const cleanup = (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        delete window[cbName];
        script.remove();
        if (err) reject(err);
      };

      const timer = setTimeout(() => cleanup(new Error("GViz JSONP timeout")), timeoutMs);

      window[cbName] = (payload) => {
        cleanup();
        resolve(payload);
      };

      script.async = true;
      script.src = url;
      script.onerror = () => cleanup(new Error("GViz JSONP load error"));
      document.head.appendChild(script);
    });
  }

  async function loadSnapshot() {
    if (!snapshotUrl) return null;
    if (!snapshotPromise) {
      const url = (() => {
        try {
          return new URL(snapshotUrl, document.baseURI).href;
        } catch {
          return snapshotUrl;
        }
      })();
      snapshotPromise = fetch(url, { cache: "no-store" })
        .then(res => (res.ok ? res.json() : null))
        .catch(() => null);
    }
    return snapshotPromise;
  }

  async function resolveFallback(tabName, stored, errForThrow) {
    if (stored) {
      state.usedStorage = true;
      return stored;
    }

    const snapshot = await loadSnapshot();
    const snapTab = snapshot && snapshot.tabs && Array.isArray(snapshot.tabs[tabName])
      ? snapshot.tabs[tabName]
      : null;

    if (snapTab) {
      state.usedSnapshot = true;
      return snapTab;
    }

    const err = errForThrow || new Error("Sheets fallback missing");
    state.errors.push({ tab: tabName, message: err.message });
    throw err;
  }

  async function fetchTab(sheetId, tabName) {
    const key = `${sheetId}:${tabName}`;
    if (cache.has(key)) return cache.get(key);
    if (inflight.has(key)) return inflight.get(key);

    const storageKey = `${storagePrefix}${key}`;
    const stored = readStorage(storageKey);

    const promise = (async () => {
      if (!sheetId) {
        const data = await resolveFallback(tabName, stored, new Error("SHEET_ID missing"));
        cache.set(key, data);
        return data;
      }

      if (state.forceFallback) {
        const data = await resolveFallback(tabName, stored, new Error("Sheets unavailable"));
        cache.set(key, data);
        return data;
      }

      const cbName = `__byplanGviz_${runId}_${Math.random().toString(36).slice(2)}`;
      const tqx = `out:json;responseHandler:${cbName};reqId:${runId}`;
      const params = new URLSearchParams({
        sheet: tabName,
        headers: "1",
        tqx
      });
      const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?${params.toString()}`;

      try {
        const payload = await jsonp(url, cbName, 5000);
        if (!payload || payload.status === "error") {
          throw new Error(`GViz error for "${tabName}"`);
        }
        if (!payload.table || !Array.isArray(payload.table.rows) || payload.table.rows.length === 0) {
          const data = await resolveFallback(tabName, stored, new Error(`GViz empty response for ${tabName}`));
          cache.set(key, data);
          writeStorage(storageKey, data);
          return data;
        }
        const objects = tableToObjects(payload.table);
        cache.set(key, objects);
        writeStorage(storageKey, objects);
        return objects;
      } catch (err) {
        state.forceFallback = true;
        const data = await resolveFallback(tabName, stored, err instanceof Error ? err : new Error(String(err)));
        cache.set(key, data);
        return data;
      }
    })();

    inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      inflight.delete(key);
    }
  }

  window.Sheets = { fetchTab, state };
})();

;
/* === app-core.js === */
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

;
/* === app.js === */
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

  function renderDeliverablesTriad(containerId, rows, kv = {}) {
    const root = el(containerId);
    if (!root) return;
    root.innerHTML = "";

    const fallbackTitles = {
      1: "Планировка",
      2: "Чертежи",
      3: "Для ремонта"
    };
    const fallbackSubtitles = {
      1: "концепция",
      2: "технические планы",
      3: "рабочий комплект"
    };
    const fallbackGroupByIndex = (index) => {
      if (index < 3) return 1;
      if (index < 6) return 2;
      return 3;
    };
    const iconMarkupByGroup = {
      1: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="14" rx="2"></rect><path d="M8 9h8M8 13h5"></path></svg>',
      2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4.5h10l2 2v13H5v-13l2-2z"></path><path d="M8 4.5v4h8v-4"></path><path d="M7 13h10"></path><path d="M9 16.5h6"></path></svg>',
      3: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5L12 4l8.5 4.5v7L12 20l-8.5-4.5z"></path><path d="M3.5 8.5L12 13l8.5-4.5"></path><path d="M12 13v7"></path></svg>'
    };
    const hasAnyGroup = rows.some((row) => String(row.group ?? "").trim() !== "");
    const groups = new Map([[1, []], [2, []], [3, []]]);

    rows.forEach((row, index) => {
      const rawGroup = String(row.group ?? "").trim();
      let groupNumber = Number.parseInt(rawGroup, 10);
      if (!Number.isInteger(groupNumber) || groupNumber < 1 || groupNumber > 3) {
        groupNumber = hasAnyGroup ? 3 : fallbackGroupByIndex(index);
      }
      groups.get(groupNumber).push(row);
    });

    [1, 2, 3].forEach((groupNumber, index) => {
      const article = document.createElement("article");
      article.className = groupNumber === 2 ? "deliv-card deliv-card--featured" : "deliv-card";
      article.setAttribute("role", "listitem");
      article.dataset.group = String(groupNumber);

      const icon = document.createElement("div");
      icon.className = "deliv-card__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = iconMarkupByGroup[groupNumber];
      article.appendChild(icon);

      const title = document.createElement("h3");
      title.className = "deliv-card__title";
      title.textContent = String(kv[`deliverables_card${groupNumber}_title`] ?? "").trim() || fallbackTitles[groupNumber];
      article.appendChild(title);

      const subtitle = document.createElement("div");
      subtitle.className = "deliv-card__subtitle muted";
      subtitle.textContent = String(kv[`deliverables_card${groupNumber}_subtitle`] ?? "").trim() || fallbackSubtitles[groupNumber];
      article.appendChild(subtitle);

      const divider = document.createElement("hr");
      divider.className = "deliv-card__divider";
      divider.setAttribute("aria-hidden", "true");
      article.appendChild(divider);

      const list = document.createElement("ul");
      list.className = "deliv-card__list";
      const items = groups.get(groupNumber) || [];
      if (items.length) {
        items.forEach((row) => {
          const li = document.createElement("li");
          li.textContent = row.text || "";
          list.appendChild(li);
        });
      } else {
        const li = document.createElement("li");
        li.textContent = "—";
        list.appendChild(li);
      }
      article.appendChild(list);

      const badgeText = String(kv[`deliverables_card${groupNumber}_badge`] ?? "").trim();
      if (badgeText) {
        const badge = document.createElement("div");
        badge.className = "deliv-card__badge";
        badge.textContent = badgeText;
        article.appendChild(badge);
      }

      root.appendChild(article);

      if (index < 2) {
        const chevron = document.createElement("div");
        chevron.className = "deliv-chevron";
        chevron.setAttribute("aria-hidden", "true");
        chevron.textContent = "›";
        root.appendChild(chevron);
      }
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

  function formatStatText(value) {
    const raw = (value ?? "").toString().trim();
    if (!raw) return "";

    if (raw.includes("|") || /\r?\n/.test(raw)) {
      return escapeHtml(raw)
        .replace(/\s*\|\s*/g, "<br>")
        .replace(/\r?\n/g, "<br>");
    }

    if (/^без\s+посредников$/i.test(raw)) {
      const parts = raw.split(/\s+/);
      return `${escapeHtml(parts[0])}<br>${escapeHtml(parts.slice(1).join(" "))}`;
    }

    return escapeHtml(raw);
  }

  function renderStats(containerId, rows) {
    const root = el(containerId);
    if (!root) return;
    root.innerHTML = "";
    rows.forEach(r => {
      const div = document.createElement("div");
      div.className = "stat";
      div.innerHTML = `
        <p class="stat__num">${formatStatText(r.num ?? "")}</p>
        <p class="stat__label">${formatStatText(r.label ?? "")}</p>
      `;
      root.appendChild(div);
    });
  }

  function renderPricing(containerId, rows) {
    const root = el(containerId);
    if (!root) return;
    root.innerHTML = "";
    const addonsRoot = document.getElementById("pricingAddons");
    if (addonsRoot) addonsRoot.innerHTML = "";

    if (!rows || !rows.length) return;

    // First row is the main tariff card. Everything else is an add-on.
    const [main, ...addons] = rows;

    // --- main tariff card ---
    {
      const r = main;
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
    }

    // --- add-on rows (everything after the first) ---
    if (addonsRoot && addons.length) {
      addons.forEach(r => {
        const row = document.createElement("div");
        row.className = "pricing-addon";

        const plan = (r.plan || "").trim();
        const price = (r.price || "").trim();
        const note = (r.price_note || "").trim();
        const features = splitList(r.features);
        const ctaHref = sanitizeUrl(r.cta_url || "", { allowRelative: true }) || "";
        const ctaIsExternal = ctaHref ? isExternal(ctaHref) : false;

        const badgeWord = (r.badge || "Доп. опция").trim();

        row.innerHTML = `
          <div class="pricing-addon__head">
            ${badgeWord ? `<span class="pricing-addon__badge">${escapeHtml(badgeWord)}</span>` : ""}
            <span class="pricing-addon__plan">${escapeHtml(plan)}</span>
            ${price ? `<span class="pricing-addon__sep" aria-hidden="true">·</span><span class="pricing-addon__price">${escapeHtml(price)}</span>` : ""}
          </div>
          ${note ? `<p class="pricing-addon__note">${escapeHtml(note)}</p>` : ""}
          ${features.length ? `<ul class="pricing-addon__features">${features.map(f => `<li>${escapeHtml(f)}</li>`).join("")}</ul>` : ""}
        `;

        if (ctaHref && (r.cta_label || r.cta_url)) {
          const a = document.createElement("a");
          a.className = "pricing-addon__cta";
          a.href = ctaHref;
          if (ctaIsExternal) { a.target = "_blank"; a.rel = "noopener"; }
          a.textContent = r.cta_label || "Заказать";
          row.appendChild(a);
        }

        addonsRoot.appendChild(row);
      });
    }
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
  // relative paths: strip leading slashes so static hosting resolves correctly
  return u.replace(/^\/+/, "");
}
function escapeAttr(str) {
    return escapeHtml(str).replaceAll("`", "&#096;");
  }


  async function main() {
    setText("#year", String(new Date().getFullYear()));
    if (cfg && cfg.VERSION) {
      setText("#siteVersion", String(cfg.VERSION));
      toggleSection("#footerVersion", true);
    } else {
      toggleSection("#footerVersion", false);
    }

    if (!cfg || !cfg.TABS) {
      console.warn("SITE_CONFIG is missing or invalid.");
      showSheetError("Не удалось загрузить данные из Google Sheets. Проверьте config.js.");
      return;
    }
    if (typeof Sheets === "undefined" || typeof Sheets.fetchTab !== "function") {
      console.warn("Sheets helper is missing.");
      showSheetError("Не удалось загрузить данные. Проверьте подключение sheets.js.");
      return;
    }

    const sheetId = (cfg.SHEET_ID && !cfg.SHEET_ID.includes("PASTE_")) ? cfg.SHEET_ID : "";
    if (!sheetId) {
      console.warn("SHEET_ID is not set. Using snapshot/cache only.");
    }
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
    const fetchTabOptional = async (tabName) => {
      if (!tabName) return [];
      return fetchTabSafe(tabName);
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
      renderDeliverablesTriad("deliverablesList", deliverables, kv);
      renderChecklist("deliverablesMini", deliverables.slice(0, 4));
    }
    toggleSection("#deliverables", deliverables.length > 0);

    // 5) Steps
    const steps = (await fetchTabSafe(tabs.steps)).slice(0, limits.steps || 999);
    if (steps.length) renderSteps("stepsList", steps);
    toggleSection("#process", steps.length > 0);

    // 6) Why us (optional)
    const whyStats = (await fetchTabOptional(tabs.why_stats)).slice(0, limits.why_stats || 999);
    if (whyStats.length) renderStats("whyStatsGrid", whyStats);
    toggleSection("#whyStatsGrid", whyStats.length > 0);

    const whyTrust = (await fetchTabOptional(tabs.why_trust)).slice(0, limits.why_trust || 999);
    if (whyTrust.length) renderBullets("whyTrustList", whyTrust);
    toggleSection("#whyTrustList", whyTrust.length > 0);
    toggleSection("#why", whyStats.length > 0 || whyTrust.length > 0);

    // 7) Trust bullets + stats
    const trust = (await fetchTabSafe(tabs.trust)).slice(0, limits.trust || 999);
    if (trust.length) renderBullets("trustBullets", trust);
    toggleSection("#trustBullets", trust.length > 0);

    const stats = (await fetchTabSafe(tabs.stats)).slice(0, limits.stats || 999);
    if (stats.length) renderStats("statsGrid", stats);
    toggleSection("#statsGrid", stats.length > 0);

    // 8) Pricing — with data validation (detect broken sheet data)
    let pricing = (await fetchTabSafe(tabs.pricing)).slice(0, limits.pricing || 999);
    // If all data got crammed into the 'plan' column (pipe-separated), use snapshot instead
    if (pricing.length && pricing.every(r => !r.price && (r.plan || "").includes("|"))) {
      console.warn("Pricing data malformed (all in plan column). Falling back to snapshot.");
      try {
        const snap = await fetch(cfg.SNAPSHOT_URL || "assets/data/snapshot.json", { cache: "no-store" }).then(r => r.ok ? r.json() : null);
        if (snap && snap.tabs && Array.isArray(snap.tabs.pricing)) {
          pricing = snap.tabs.pricing.slice(0, limits.pricing || 999);
        }
      } catch (e) { console.warn("Snapshot fallback also failed:", e); }
    }
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

    const sheetState = (typeof Sheets !== "undefined" && Sheets.state) ? Sheets.state : null;
    const usingFallback = sheetState ? (sheetState.usedSnapshot || sheetState.usedStorage) : false;

    if (sheetErrors.length && !usingFallback) {
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

;
/* === principles-slider.js === */
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

;
/* === polish.js === */
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

    // Event delegation (single source of truth for FAQ accordion)
    root.addEventListener("click", (e) => {
      const btn = e.target.closest(".faq-q");
      if (!btn || !root.contains(btn)) return;

      const item = btn.closest(".faq-item") || btn.parentElement;
      const panel = item?.querySelector?.(".faq-a");
      if (!panel) return;

      const icon = btn.querySelector(".faq-icon");

      const isOpen = btn.getAttribute("aria-expanded") === "true";
      const next = !isOpen;

      // Close others (premium feel, prevents giant long-open list)
      qsa(".faq-q[aria-expanded='true']", root).forEach(b => {
        if (b === btn) return;

        b.setAttribute("aria-expanded", "false");
        const it = b.closest(".faq-item");
        if (it) it.classList.remove("is-open");

        const ic = b.querySelector(".faq-icon");
        if (ic) ic.textContent = "+";

        const p = it?.querySelector?.(".faq-a");
        if (p) {
          // Ensure panel is measurable/visible for animation control
          p.style.display = "block";
          p.style.overflow = "hidden";
          p.style.transition = "max-height 220ms cubic-bezier(.2,.8,.2,1), opacity 220ms cubic-bezier(.2,.8,.2,1)";
          p.style.opacity = "0";
          p.style.maxHeight = "0px";
          setTimeout(() => { p.hidden = true; }, 220);
        }
      });

      // Toggle current
      btn.setAttribute("aria-expanded", next ? "true" : "false");
      if (item) item.classList.toggle("is-open", next);
      if (icon) icon.textContent = next ? "−" : "+";

      // Make sure the panel is actually displayable before measuring
      panel.hidden = false;
      panel.style.display = "block";

      // Animate height
      panel.style.overflow = "hidden";
      panel.style.transition = "max-height 220ms cubic-bezier(.2,.8,.2,1), opacity 220ms cubic-bezier(.2,.8,.2,1)";
      panel.style.opacity = next ? "1" : "0";

      if (next) {
        // Start from 0 for a reliable animation
        panel.style.maxHeight = "0px";
        // measure after unhide + display
        const h = panel.scrollHeight;
        requestAnimationFrame(() => {
          panel.style.maxHeight = h + "px";
        });
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

;
/* === story.js === */
/* ============================================================
   BYPLAN — story.js (Sheets-driven, v3)
   Fixes the current breakage:
   - Your current story.js expects columns: step|label|title|text|quote (single tab)
     but your Google Sheets now has:
       - tab "story" (config incl. plan_before_src/plan_after_src)
       - tab "story_scenes" (scenes)
   - Also your HTML uses data-story-before-src/data-story-after-src,
     while the old script reads dataset.beforeSrc/dataset.afterSrc.

   This version:
   - Reads both tabs (story + story_scenes)
   - Populates texts + scenes + CTAs
   - Sets plan image sources correctly and supports the existing tabs "Было/Стало"
   - Hides "Было" button if before_src is empty, hides "Стало" if after_src empty
   ============================================================ */

(function(){
  "use strict";

  const doc = document;
  const $ = (sel, root) => (root || doc).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || doc).querySelectorAll(sel));

  // --- Helpers ---
  const norm = (v) => (v ?? "").toString().trim();
  const normPath = (v) => {
    const s = norm(v);
    if (!s) return "";
    return s.startsWith("/") ? s.slice(1) : s; // avoid absolute-root paths on static hosting
  };

  const setText = (el, value) => {
    if (!el) return;
    const v = norm(value);
    el.textContent = v;
    el.hidden = (v === "");
  };

  const setLink = (a, label, href) => {
    if (!a) return;
    const t = norm(label);
    const h = norm(href);
    if (t) a.textContent = t;

    const bad = !h || h === "#" || h.endsWith("#") || h.startsWith("javascript:");
    if (bad){
      a.hidden = true;
      a.removeAttribute("href");
    }else{
      a.hidden = false;
      a.setAttribute("href", h);
    }
  };

  const escapeHtml = (str) => String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  // --- Data loading ---
  const getSheetId = () => {
    // support both window.SITE_CONFIG and legacy global SHEET_ID
    return window.SITE_CONFIG?.SHEET_ID || (typeof SHEET_ID !== "undefined" ? SHEET_ID : "");
  };

  async function fetchTab(tabName){
    const sheetId = getSheetId();
    if (!sheetId) throw new Error("SHEET_ID missing");

    if (typeof Sheets !== "undefined" && typeof Sheets.fetchTab === "function"){
      return await Sheets.fetchTab(sheetId, tabName);
    }
    throw new Error("Sheets helper is not available");
  }

  // --- UI render ---
  function renderScenes(scenes, root){
    const stepper = $("#storyStepper", root);
    if (!stepper) return;

    stepper.innerHTML = "";
    scenes.forEach((s, i) => {
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "story-step";
      btn.dataset.storyStep = String(i);
      btn.innerHTML = `
        <span class="story-step__num">${escapeHtml(String(s.idx || (i+1)))}</span>
        <span class="story-step__label">${escapeHtml(s.step_title || `Сцена ${i+1}`)}</span>
      `;
      stepper.appendChild(btn);
    });
  }

  function renderPanel(scene, root, fallbackQuote){
    const panel = $("#storyPanel", root);
    if (!panel) return;

    panel.classList.remove("is-ready");
    void panel.offsetWidth;

    panel.innerHTML = `
      <div class="story-panel__kicker">${escapeHtml(scene.step_title ? "СЦЕНА" : "")}</div>
      <h3>${escapeHtml(scene.step_title || "")}</h3>
      ${scene.step_text ? `<p>${escapeHtml(scene.step_text)}</p>` : ""}
    `;
    panel.classList.add("is-ready");

    const q = $("#storyQuote", root);
    const qa = $("#storyQuoteAuthor", root);
    if (q){
      q.textContent = norm(scene.quote_override) || fallbackQuote || "";
    }
    if (qa){
      // keep whatever already set if not empty
      qa.textContent = qa.textContent?.trim() ? qa.textContent : "Из отзыва клиента";
    }
  }

  function setActive(index, scenes, root, fallbackQuote){
    const buttons = $$(".story-step", root);
    buttons.forEach((b, i) => b.classList.toggle("is-active", i === index));
    renderPanel(scenes[index], root, fallbackQuote);
  }

  function setupPlan(root, storyRow){
    const img = $("#storyPlanImg", root);
    if (!img) return;

    // read from Sheets row OR from HTML data attributes
    const before = normPath(storyRow?.plan_before_src) || normPath(img.getAttribute("data-story-before-src") || img.dataset.storyBeforeSrc);
    const after  = normPath(storyRow?.plan_after_src)  || normPath(img.getAttribute("data-story-after-src")  || img.dataset.storyAfterSrc);

    // Set to dataset fields expected by toggler
    if (before) img.dataset.beforeSrc = before;
    if (after)  img.dataset.afterSrc  = after;

    // Tabs
    const btnAfter  = $('[data-story-view="after"]', root);
    const btnBefore = $('[data-story-view="before"]', root);

    if (btnAfter)  btnAfter.hidden  = !after;
    if (btnBefore) btnBefore.hidden = !before;

    // If only one is present, force it
    let view = norm(storyRow?.default_view).toLowerCase() === "before" ? "before" : "after";
    if (!after && before) view = "before";
    if (!before && after) view = "after";

    const src = (view === "before" ? before : after) || after || before || "";
    if (!src){
      img.hidden = true;
      return;
    }
    img.hidden = false;
    img.src = src;
    img.classList.add("is-ready");

    // Button active state
    $$(".pill-btn,[data-story-view]", root).forEach(b => {
      const v = b.getAttribute("data-story-view") || b.dataset.storyView;
      if (!v) return;
      b.classList.toggle("is-active", v === view);
    });

    // Wire click
    const tabs = $$("[data-story-view]", root);
    tabs.forEach(t => {
      t.addEventListener("click", () => {
        const v = t.getAttribute("data-story-view") || t.dataset.storyView;
        const next = (v === "before") ? before : after;
        if (next){
          img.classList.remove("is-ready");
          void img.offsetWidth;
          img.src = next;
          img.classList.add("is-ready");
        }
        tabs.forEach(x => x.classList.toggle("is-active", x === t));
      });
    });
  }

  async function init(){
    const root = doc;
    const section = $("#story", root);
    if (!section) return;

    // Ensure story media/card are visible (CSS reveals them when .is-in is present)
    section.classList.add("is-in");

    // Identify story ID (optional)
    const storyId = norm(section.getAttribute("data-story-id"));

    // Load tabs
    let storyRows = [];
    let sceneRows = [];
    try{
      [storyRows, sceneRows] = await Promise.all([fetchTab("story"), fetchTab("story_scenes")]);
    }catch(err){
      console.warn("[story] Sheets load failed:", err);
      return;
    }

    const stories = (storyRows || []).map(r => {
      const out = {};
      for (const [k,v] of Object.entries(r)) out[norm(k)] = v;
      return out;
    }).filter(r => norm(r.id));

    const storyRow =
      (storyId ? stories.find(r => norm(r.id) === storyId) : null) ||
      stories.find(r => norm(r.is_enabled) !== "0") ||
      stories[0];

    if (!storyRow) return;

    // Fill header texts
    setText($("#storyBadge", root), storyRow.badge);
    setText($("#storyTitle", root), storyRow.title);
    setText($("#storySubtitle", root), storyRow.subtitle);
    setText($("#storyNote", root), storyRow.note);

    // Quote + author
    setText($("#storyQuote", root), storyRow.quote);
    setText($("#storyQuoteAuthor", root), storyRow.quote_author);

    // CTAs
    setLink($("#storyCtaPrimary", root), storyRow.cta_primary_label, storyRow.cta_primary_url);
    setLink($("#storyCtaSecondary", root), storyRow.cta_secondary_label, storyRow.cta_secondary_url);

    // Plan images
    setupPlan(root, storyRow);

    // Scenes
    const scenes = (sceneRows || []).map(r => {
      const out = {};
      for (const [k,v] of Object.entries(r)) out[norm(k)] = v;
      return out;
    })
    .filter(r => norm(r.story_id) === norm(storyRow.id))
    .map(r => ({
      idx: parseInt(norm(r.idx) || "0", 10) || 0,
      step_title: norm(r.step_title),
      step_text: norm(r.step_text),
      quote_override: norm(r.quote_override),
    }))
    .sort((a,b) => a.idx - b.idx);

    if (scenes.length){
      renderScenes(scenes, root);
      let active = 0;
      setActive(active, scenes, root, norm(storyRow.quote));

      $("#storyStepper", root)?.addEventListener("click", (e) => {
        const btn = e.target.closest(".story-step");
        if (!btn) return;
        const idx = Number(btn.dataset.storyStep);
        if (Number.isNaN(idx)) return;
        active = idx;
        setActive(active, scenes, root, norm(storyRow.quote));
      });

      // Keyboard navigation
      section.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        const dir = (e.key === "ArrowRight") ? 1 : -1;
        active = Math.max(0, Math.min(scenes.length - 1, active + dir));
        setActive(active, scenes, root, norm(storyRow.quote));
      });
    }
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})();

;
/* === process-snake.js === */
/* ============================================================
   BYPLAN — process-snake.js (optional)
   Adds active state cycling (visual cue).
   ============================================================ */
(() => {
  const doc = document;
  const list = doc.getElementById("stepsList");
  if (!list) return;

  const items = Array.from(list.querySelectorAll("li"));
  if (!items.length) return;

  const setActive = (idx) => {
    items.forEach((li, i) => {
      li.classList.toggle("is-active", i === idx);
      li.classList.toggle("is-done", i < idx);
    });
  };

  setActive(0);

  let userInteracted = false;
  items.forEach((li, i) => li.addEventListener("click", () => { userInteracted = true; setActive(i); }));

  const section = doc.getElementById("process");
  if (!section) return;

  const io = new IntersectionObserver((entries) => {
    if (!entries.some(e => e.isIntersecting)) return;

    let i = 0;
    const timer = setInterval(() => {
      if (userInteracted){ clearInterval(timer); return; }
      i = (i + 1) % items.length;
      setActive(i);
    }, 2400);

    io.disconnect();
  }, { threshold: 0.25 });

  io.observe(section);
})();

;
/* === bio.js === */
/* ============================================================
   BYPLAN — bio.js (Root version)
   Scope: ONLY #about block

   Fixes:
   - "Works only when DevTools open" bug:
     1) Do NOT hijack pointer events when user clicks buttons/links inside the slide
        (prevents swipe handler from eating "Читать полностью" click).
     2) Recalc clamp after fonts load + on window load.

   Features:
   - Mini slider inside .about-card: "Биография" / "Подход"
   - Click-to-zoom for designer photo
   - Bio clamp + "Читать полностью"
   - Stats reveal + number count-up
   ============================================================ */

(function () {
  'use strict';

  if (window.__byplanBioRootV1) return;
  window.__byplanBioRootV1 = true;

  var root = document.getElementById('about');
  if (!root) return;

  var prefersReducedMotion = false;
  try {
    prefersReducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    prefersReducedMotion = false;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function waitFor(checkFn, cb, opts) {
    var interval = (opts && opts.interval) || 120;
    var timeout = (opts && opts.timeout) || 9000;
    var start = Date.now();

    (function tick() {
      try {
        if (checkFn()) {
          cb();
          return;
        }
      } catch (e) {
        // ignore
      }

      if (Date.now() - start >= timeout) return;
      setTimeout(tick, interval);
    })();
  }

  function indexStagger() {
    var bullets = root.querySelector('#trustBullets');
    if (bullets) {
      Array.prototype.slice.call(bullets.children).forEach(function (el, i) {
        el.style.setProperty('--i', String(i));
      });
    }
  }

  /* ------------------------------
     Mini slider inside .about-card
     ------------------------------ */
  function buildMiniSlider() {
    if (root.dataset.aboutMiniReady === '1') return;

    var card = root.querySelector('.about-card');
    if (!card) return;

    // Body is the text column (usually second child)
    var body = null;
    if (card.children && card.children.length > 1) body = card.children[1];
    if (!body) return;

    var bio = body.querySelector('.about-bio');
    var bullets = body.querySelector('#trustBullets');

    if (!bio || !bullets) return;

    root.dataset.aboutMiniReady = '1';

    // Build slider skeleton
    var mini = document.createElement('div');
    mini.className = 'about-mini';
    mini.dataset.index = '0';

    mini.innerHTML =
      '<div class="about-mini__top">' +
      '  <div class="about-tabs" role="tablist" aria-label="Биография и подход">' +
      '    <button class="about-tab is-active" type="button" role="tab" aria-selected="true" aria-controls="aboutMiniSlideBio" id="aboutMiniTabBio" data-index="0">' +
      '      <span class="about-tab__icon" aria-hidden="true">📖</span>' +
      '      <span class="about-tab__label">Биография</span>' +
      '    </button>' +
      '    <button class="about-tab" type="button" role="tab" aria-selected="false" aria-controls="aboutMiniSlideBullets" id="aboutMiniTabBullets" data-index="1">' +
      '      <span class="about-tab__icon" aria-hidden="true">✓</span>' +
      '      <span class="about-tab__label">Подход</span>' +
      '    </button>' +
      '  </div>' +
      '</div>' +
      '<div class="about-carousel" aria-label="Слайдер: биография / подход">' +
      '  <div class="about-carousel__viewport" tabindex="0">' +
      '    <div class="about-carousel__track">' +
      '      <article class="about-slide about-slide--bio is-active" role="tabpanel" id="aboutMiniSlideBio" aria-labelledby="aboutMiniTabBio"></article>' +
      '      <article class="about-slide about-slide--bullets" role="tabpanel" id="aboutMiniSlideBullets" aria-labelledby="aboutMiniTabBullets"></article>' +
      '    </div>' +
      '  </div>' +
      '  <div class="about-dots" aria-hidden="true">' +
      '    <span class="about-dot is-active"></span>' +
      '    <span class="about-dot"></span>' +
      '  </div>' +
      '</div>';

    body.insertBefore(mini, bio);

    // Move nodes into slides (IDs preserved)
    var slideBio = mini.querySelector('#aboutMiniSlideBio');
    var slideBullets = mini.querySelector('#aboutMiniSlideBullets');
    if (slideBio) slideBio.appendChild(bio);
    if (slideBullets) slideBullets.appendChild(bullets);

    setupMiniInteractions(mini);

    indexStagger();

    // Re-stagger + resync height when bullets update from Sheets
    try {
      var mo = new MutationObserver(function () {
        indexStagger();
        syncMiniHeight(mini);
      });
      mo.observe(bullets, { childList: true, subtree: false });
    } catch (e) {
      // ignore
    }

    // Initial height after layout settles
    try {
      window.requestAnimationFrame(function () {
        syncMiniHeight(mini);
      });
    } catch (e) {
      syncMiniHeight(mini);
    }
  }

  function syncMiniHeight(mini) {
    if (!mini) return;
    var viewport = mini.querySelector('.about-carousel__viewport');
    var slides = mini.querySelectorAll('.about-slide');
    var idx = parseInt(mini.dataset.index || '0', 10) || 0;
    idx = clamp(idx, 0, 1);

    var active = slides && slides.length ? slides[idx] : null;
    if (!viewport || !active) return;

    var h = active.offsetHeight;
    if (h > 0) viewport.style.height = h + 'px';
  }

  function setupMiniInteractions(mini) {
    var tabs = Array.prototype.slice.call(mini.querySelectorAll('.about-tab'));
    var dots = Array.prototype.slice.call(mini.querySelectorAll('.about-dot'));
    var track = mini.querySelector('.about-carousel__track');
    var viewport = mini.querySelector('.about-carousel__viewport');
    var slides = Array.prototype.slice.call(mini.querySelectorAll('.about-slide'));

    var index = parseInt(mini.dataset.index || '0', 10) || 0;
    index = clamp(index, 0, 1);

    function applyIndex(next, opts) {
      var force = opts && opts.force;
      next = clamp(next, 0, 1);
      if (next === index && !force) return;

      index = next;
      mini.dataset.index = String(index);

      if (track) track.style.transform = 'translate3d(' + (-index * 100) + '%,0,0)';

      tabs.forEach(function (btn, i) {
        var active = i === index;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
        btn.tabIndex = active ? 0 : -1;
      });

      dots.forEach(function (d, i) {
        d.classList.toggle('is-active', i === index);
      });

      slides.forEach(function (s, i) {
        s.classList.toggle('is-active', i === index);
      });

      if (prefersReducedMotion) {
        syncMiniHeight(mini);
      } else {
        window.requestAnimationFrame(function () {
          syncMiniHeight(mini);
        });
      }
    }

    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = parseInt(btn.dataset.index || '0', 10) || 0;
        applyIndex(next);
      });
    });

    // Keyboard navigation
    if (viewport) {
      viewport.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          applyIndex(index - 1);
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          applyIndex(index + 1);
        }
      });
    }

    // Swipe / drag (FIXED: don't eat clicks on buttons/links)
    var down = false;
    var dragging = false;
    var startX = 0;
    var startY = 0;
    var threshold = 46;

    function isInteractiveTarget(node) {
      if (!node || !node.closest) return false;
      return !!node.closest(
        'button, a, input, textarea, select, label, [role="button"], [data-no-swipe]'
      );
    }

    function onDown(e) {
      if (!viewport) return;
      if (isInteractiveTarget(e.target)) return; // <-- IMPORTANT FIX
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      down = true;
      dragging = false;
      startX = e.clientX;
      startY = e.clientY;
      // Do NOT setPointerCapture here (only after we are sure it is a drag)
    }

    function onMove(e) {
      if (!down || !viewport || !track) return;

      var dx = e.clientX - startX;
      var dy = e.clientY - startY;

      if (!dragging) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          dragging = true;
          // Capture only now (real drag) — so clicks on "Читать полностью" are not broken
          try {
            viewport.setPointerCapture(e.pointerId);
          } catch (err) {}
        } else if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
          // vertical scroll — do not hijack
          down = false;
          return;
        }
      }
      if (!dragging) return;

      var pct = (dx / Math.max(1, viewport.clientWidth)) * 100;
      track.style.transition = 'none';
      track.style.transform =
        'translate3d(calc(' + (-index * 100) + '% + ' + pct + '%),0,0)';

      e.preventDefault();
    }

    function onUp(e) {
      if (!down) return;
      down = false;

      if (track) track.style.transition = '';

      var dx = e.clientX - startX;
      var dy = e.clientY - startY;

      if (dragging && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
        applyIndex(index + (dx < 0 ? 1 : -1));
      } else {
        applyIndex(index, { force: true });
      }

      dragging = false;
    }

    if (viewport && window.PointerEvent) {
      viewport.addEventListener('pointerdown', onDown);
      viewport.addEventListener('pointermove', onMove, { passive: false });
      viewport.addEventListener('pointerup', onUp);
      viewport.addEventListener('pointercancel', onUp);
    }

    applyIndex(index, { force: true });

    window.addEventListener(
      'resize',
      function () {
        syncMiniHeight(mini);
      },
      { passive: true }
    );

    window.addEventListener(
      'load',
      function () {
        syncMiniHeight(mini);
      },
      { passive: true }
    );

    // Also resync after fonts load (height can change)
    try {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          setTimeout(function () {
            syncMiniHeight(mini);
          }, 0);
        });
      }
    } catch (e) {}
  }

  /* ------------------------------
     Designer photo: click-to-zoom (lightbox)
     ------------------------------ */
  function ensureDesignerPhotoModal() {
    var modal = document.querySelector('.about-photo-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'about-photo-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Фото дизайнера');
    modal.setAttribute('aria-hidden', 'true');
    modal.hidden = true;

    modal.innerHTML =
      '<div class="about-photo-modal__dialog" role="document">' +
      '  <button class="about-photo-modal__close" type="button" aria-label="Закрыть">✕</button>' +
      '  <img class="about-photo-modal__img" alt="">' +
      '</div>';

    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) {
      var closeBtn =
        e.target && e.target.closest ? e.target.closest('.about-photo-modal__close') : null;
      if (closeBtn) {
        closeDesignerPhotoModal();
        return;
      }

      var dialog =
        e.target && e.target.closest ? e.target.closest('.about-photo-modal__dialog') : null;
      if (!dialog && e.target === modal) closeDesignerPhotoModal();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var opened = document.querySelector('.about-photo-modal.is-open');
      if (!opened) return;
      closeDesignerPhotoModal();
    });

    return modal;
  }

  function openDesignerPhotoModal(src, alt) {
    if (!src) return;
    var modal = ensureDesignerPhotoModal();
    var img = modal.querySelector('.about-photo-modal__img');
    if (!img) return;

    img.src = src;
    img.alt = alt || 'Фото дизайнера';

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');

    try {
      modal.offsetHeight;
    } catch (e) {}
    modal.classList.add('is-open');

    document.documentElement.classList.add('about-photo-open');
    document.body.classList.add('about-photo-open');
  }

  function closeDesignerPhotoModal() {
    var modal = document.querySelector('.about-photo-modal');
    if (!modal || modal.hidden) return;

    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');

    document.documentElement.classList.remove('about-photo-open');
    document.body.classList.remove('about-photo-open');

    var img = modal.querySelector('.about-photo-modal__img');
    window.setTimeout(function () {
      modal.hidden = true;
      if (img) img.src = '';
    }, 220);
  }

  function initDesignerPhotoZoom() {
    var img = root.querySelector('#designerPhoto');
    if (!img) return;

    if (img.dataset.zoomBound === '1') return;
    img.dataset.zoomBound = '1';

    img.classList.add('is-zoomable');

    img.addEventListener('click', function () {
      var src = img.currentSrc || img.getAttribute('src');
      openDesignerPhotoModal(src, img.alt);
    });

    if (!img.hasAttribute('tabindex')) img.setAttribute('tabindex', '0');
    if (!img.hasAttribute('role')) img.setAttribute('role', 'button');

    img.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        var src = img.currentSrc || img.getAttribute('src');
        openDesignerPhotoModal(src, img.alt);
      }
    });
  }

  /* ------------------------------
     Bio clamp + toggle
     ------------------------------ */
  function initBioToggle() {
    var bio = root.querySelector('.about-bio');
    if (!bio) return;

    if (bio.dataset.bioInit === '1') return;
    bio.dataset.bioInit = '1';

    bio.classList.add('about-bio--clamp');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bio-toggle';
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML =
      '<span class="bio-toggle__text">Читать полностью</span>' +
      '<span class="bio-toggle__chev" aria-hidden="true">▾</span>';

    bio.insertAdjacentElement('afterend', btn);

    function syncMiniIfAny() {
      var mini = root.querySelector('.about-mini');
      if (mini) {
        if (prefersReducedMotion) syncMiniHeight(mini);
        else window.requestAnimationFrame(function () { syncMiniHeight(mini); });
      }
    }

    function recalc() {
      if (bio.classList.contains('is-expanded')) {
        btn.hidden = false;
        syncMiniIfAny();
        return;
      }

      // Determine overflow
      var need = bio.scrollHeight > bio.clientHeight + 6;
      btn.hidden = !need;

      if (!need) bio.classList.remove('about-bio--clamp');
      else bio.classList.add('about-bio--clamp');

      syncMiniIfAny();
    }

    // Recalc after layout / fonts / load
    try {
      window.requestAnimationFrame(recalc);
    } catch (e) {
      setTimeout(recalc, 0);
    }
    setTimeout(recalc, 200);
    setTimeout(recalc, 600);

    window.addEventListener('resize', recalc, { passive: true });
    window.addEventListener('load', recalc, { passive: true });

    try {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          setTimeout(recalc, 0);
        });
      }
    } catch (e) {}

    btn.addEventListener('click', function () {
      var expanded = bio.classList.toggle('is-expanded');
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');

      var text = btn.querySelector('.bio-toggle__text');
      var chev = btn.querySelector('.bio-toggle__chev');
      if (text) text.textContent = expanded ? 'Свернуть' : 'Читать полностью';
      if (chev) chev.textContent = expanded ? '▴' : '▾';

      syncMiniIfAny();

      if (!expanded) recalc();
    });

    // If bio text changes later (Sheets KV), reset toggle
    try {
      var mo = new MutationObserver(function () {
        bio.classList.remove('is-expanded');
        btn.setAttribute('aria-expanded', 'false');

        var text = btn.querySelector('.bio-toggle__text');
        var chev = btn.querySelector('.bio-toggle__chev');
        if (text) text.textContent = 'Читать полностью';
        if (chev) chev.textContent = '▾';

        bio.classList.add('about-bio--clamp');
        setTimeout(recalc, 0);
      });
      mo.observe(bio, { characterData: true, childList: true, subtree: true });
    } catch (e) {
      // ignore
    }
  }

  /* ------------------------------
     Stats reveal + number count
     ------------------------------ */
  function parseNumberParts(raw) {
    var s = String(raw || '').trim();
    var m = s.match(/^([^0-9]*)([0-9]+(?:[\\.,][0-9]+)?)(.*)$/);
    if (!m) return null;

    var prefix = m[1] || '';
    var numStr = m[2] || '';
    var suffix = m[3] || '';

    var num = Number(numStr.replace(',', '.'));
    if (!Number.isFinite(num)) return null;

    var decimals = 0;
    if (numStr.indexOf('.') !== -1 || numStr.indexOf(',') !== -1) {
      var parts = numStr.split(/[\\.,]/);
      decimals = (parts[1] || '').length;
    }

    return { prefix: prefix, num: num, suffix: suffix, decimals: decimals };
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animateNumber(el) {
    if (!el) return;
    if (el.dataset.animated === '1') return;

    var parts = parseNumberParts(el.textContent);
    if (!parts) return;

    el.dataset.animated = '1';
    if (prefersReducedMotion) return;

    var start = performance.now();
    var duration = 820;
    var from = 0;
    var to = parts.num;

    function format(v) {
      if (parts.decimals > 0) return v.toFixed(parts.decimals);
      return String(Math.round(v));
    }

    function frame(now) {
      var p = Math.min(1, (now - start) / duration);
      var v = from + (to - from) * easeOutCubic(p);
      el.textContent = parts.prefix + format(v) + parts.suffix;

      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = parts.prefix + format(to) + parts.suffix;
    }

    requestAnimationFrame(frame);
  }

  function initStatsReveal() {
    var grid = root.querySelector('#statsGrid');
    if (!grid) return;

    var items = Array.prototype.slice.call(grid.querySelectorAll('.stat'));
    if (!items.length) return;

    if (!('IntersectionObserver' in window)) {
      items.forEach(function (stat) {
        stat.classList.add('is-in');
        var num = stat.querySelector('.stat__num');
        if (num) animateNumber(num);
      });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;

          var stat = entry.target;
          stat.classList.add('is-in');

          var num = stat.querySelector('.stat__num');
          if (num) animateNumber(num);

          io.unobserve(stat);
        });
      },
      { threshold: 0.35 }
    );

    items.forEach(function (stat) {
      io.observe(stat);
    });
  }

  /* ------------------------------
     Bootstrapping
     ------------------------------ */
  function init() {
    initDesignerPhotoZoom();

    // Build slider (can be built even before Sheets fill bullets)
    buildMiniSlider();
    indexStagger();

    // Wait for bio content (Sheets KV) then init toggle
    waitFor(
      function () {
        var bio = root.querySelector('.about-bio');
        return bio && bio.textContent && bio.textContent.trim().length > 0;
      },
      initBioToggle,
      { timeout: 12000 }
    );

    // Wait for stats render
    waitFor(
      function () {
        return root.querySelectorAll('#statsGrid .stat').length > 0;
      },
      initStatsReveal,
      { timeout: 15000 }
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

;
/* === cases.js === */
/* ============================================================
   BYPLAN — cases.js (v1.3.3-inline-global-arrows)
   Purpose:
   - Показываем "красивый развёрнутый" кейс-вьювер прямо в секции #cases.
   - УБИРАЕМ ряд кнопок "План Марина / План Иван / ..." (case tabs).
   - Вместо этого делаем простой слайдер по кейсам:
       • свайп по плану (влево/вправо)
       • стрелки ◀ / ▶ + счётчик 1/ N

   Так мы избегаем "ссылок на все планы внутри первого".
   При этом сцены внутри одного кейса (cases_media.label) остаются (если их > 1).

   Data:
   - Google Sheets: tabs "cases" и "cases_media"
   - cases: паспорт кейса (title, meta, problem, result, img_url)
   - cases_media: сцены/вкладки внутри кейса (label, comment, before/after urls)

   ============================================================ */

(function () {
  'use strict';

  if (window.__byplanCasesInlineV132) return;
  window.__byplanCasesInlineV132 = true;

  const cfg = window.SITE_CONFIG;
  const Sheets = window.Sheets;

  if (!cfg || !Sheets || !cfg.SHEET_ID) {
    console.warn('[cases-inline] SITE_CONFIG / Sheets missing');
    return;
  }

  const SHEET_ID = cfg.SHEET_ID;
  const TAB_CASES = (cfg.TABS && cfg.TABS.cases) ? cfg.TABS.cases : 'cases';
  const TAB_MEDIA = 'cases_media';
  const CASES_LIMIT = (cfg.LIMITS && cfg.LIMITS.cases) ? cfg.LIMITS.cases : 999;

  const qs = (sel, root) => (root || document).querySelector(sel);
  const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const prefersReducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (ch) => {
      switch (ch) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return ch;
      }
    });
  }

  function textToHtml(s) {
    return escapeHtml(s).replace(/\n/g, '<br>');
  }

  // Legacy Cyrillic filenames -> transliterated Latin names (SEO rename 2026-04)
  const _imgRenameMap = {
    'assets/img/cases/кедрова до и после.jpg': 'assets/img/cases/kedrova-do-i-posle.jpg',
    'assets/img/cases/Иван Копыл до и после.jpg': 'assets/img/cases/ivan-kopyl-do-i-posle.jpg',
    'assets/img/cases/Ира Гриценко.jpg': 'assets/img/cases/ira-gritsenko.jpg',
    'assets/img/cases/Лапиковы до и после.jpg': 'assets/img/cases/lapikovy-do-i-posle.jpg',
    'assets/img/cases/Репко до и после.jpg': 'assets/img/cases/repko-do-i-posle.jpg',
    'assets/img/cases/Эпп до и после.jpg': 'assets/img/cases/epp-do-i-posle.jpg',
    'assets/img/cases/расстановка мебели .jpg': 'assets/img/cases/rasstanovka-mebeli.jpg',
    'assets/img/cases/тронь до и после.jpg': 'assets/img/cases/tron-do-i-posle.jpg',
    'assets/img/cases/Анна Жандарова до и после.jpg': 'assets/img/cases/anna-zhandarova-do-i-posle.jpg',
    'assets/img/cases/Александрова до и после.jpg': 'assets/img/cases/aleksandrova-do-i-posle.jpg',
    'assets/img/cases/Дмитрий Белянинов до и после.jpg': 'assets/img/cases/dmitriy-belyaninov-do-i-posle.jpg',
    'assets/img/cases/Андрей Владивосток.jpg': 'assets/img/cases/andrey-vladivostok.jpg',
    'assets/img/cases/Вика Николаева.jpg': 'assets/img/cases/vika-nikolaeva.jpg',
    'assets/img/cases/Кравченко до и после.jpg': 'assets/img/cases/kravchenko-do-i-posle.jpg',
    'assets/img/cases/ЖК Сенатор до и после.jpg': 'assets/img/cases/zhk-senator-do-i-posle.jpg',
    'assets/img/cases/OxanaS.jpg': 'assets/img/cases/oxanas.jpg',
    'assets/img/cases/Krasnogorsk.jpg': 'assets/img/cases/krasnogorsk.jpg',
    'assets/img/cases/1 (2).jpg': 'assets/img/cases/1-(2).jpg',
    'assets/img/cases/2 (2).jpg': 'assets/img/cases/2-(2).jpg',
    'assets/img/cases/3 (1).jpg': 'assets/img/cases/3-(1).jpg',
    'assets/img/cases/4 (2).jpg': 'assets/img/cases/4-(2).jpg',
    'assets/img/cases/5 (2).jpg': 'assets/img/cases/5-(2).jpg',
    'assets/img/cases/6. (1).jpg': 'assets/img/cases/6-(1).jpg',
    'assets/img/cases/7 (1).jpg': 'assets/img/cases/7-(1).jpg',
    'assets/img/cases/8 (1).jpg': 'assets/img/cases/8-(1).jpg'
  };

  function normalizeUrl(u) {
    const s = String(u ?? '').trim();
    if (!s) return '';
    if (/^(https?:)?\/\//i.test(s) || /^data:/i.test(s)) return s;
    const clean = s.replace(/^\/+/, '');
    return _imgRenameMap[clean] || clean;
  }

  function num(v) {
    const s = String(v ?? '').trim();
    if (!s) return 999999;
    const m = s.match(/^\s*(\d+)/);
    if (m) return Number(m[1]);
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : 999999;
  }

  function buildMeta(caseRow) {
    const parts = [];
    if (caseRow.area_m2) parts.push(`${caseRow.area_m2} м²`);
    if (caseRow.type) parts.push(String(caseRow.type).trim());
    if (caseRow.city) parts.push(String(caseRow.city).trim());
    return parts.filter(Boolean).join(' · ');
  }

  function pickRowValue(row, keys) {
    for (const k of keys) {
      if (row && row[k] !== undefined) {
        const v = String(row[k] ?? '');
        if (v.trim() !== '') return v;
      }
    }
    return '';
  }

  // comment → points (если пользователь вставляет 1.,2.,3.)
  function parsePoints(rawText) {
    const raw = String(rawText ?? '').replace(/\r/g, '').trim();
    if (!raw) return { title: '', points: [], summary: '' };

    const lines = raw.split('\n');

    const headerRe = /^\s*(\d+)[\.\)]\s+(.+?)\s*$/;
    const summaryRe = /^\s*(итог|summary|резюме)\s*[:\-]?\s*(.*)\s*$/i;

    let firstHeaderIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (headerRe.test(lines[i])) { firstHeaderIdx = i; break; }
    }

    let title = '';
    if (firstHeaderIdx > 0) {
      const pre = lines.slice(0, firstHeaderIdx).map(l => l.trim()).filter(Boolean);
      if (pre.length) title = pre.join(' ').trim();
    }

    let summaryIdx = -1;
    let summaryInline = '';
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(summaryRe);
      if (m) {
        summaryIdx = i;
        summaryInline = (m[2] || '').trim();
        break;
      }
    }

    const pointsEnd = (summaryIdx >= 0) ? summaryIdx : lines.length;
    const pointsLines = (firstHeaderIdx >= 0)
      ? lines.slice(firstHeaderIdx, pointsEnd)
      : lines.slice(0, pointsEnd);

    const headers = [];
    for (let i = 0; i < pointsLines.length; i++) {
      const m = pointsLines[i].match(headerRe);
      if (!m) continue;
      headers.push({ idx: i, label: (m[2] || '').trim() });
    }

    const points = [];
    if (headers.length) {
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        const next = headers[i + 1];
        const start = h.idx + 1;
        const end = next ? next.idx : pointsLines.length;
        const body = pointsLines.slice(start, end).join('\n').trim();
        points.push({
          num: i + 1,
          label: h.label || `Пункт ${i + 1}`,
          text: body
        });
      }
    } else {
      const text = pointsLines.join('\n').trim();
      if (text) points.push({ num: 1, label: 'Комментарий', text });
    }

    let summary = '';
    if (summaryIdx >= 0) {
      const rest = lines.slice(summaryIdx + 1).join('\n').trim();
      summary = [summaryInline, rest].filter(Boolean).join('\n').trim();
    }

    return { title, points, summary };
  }

  // Lightbox (независимый)
  function ensureLightbox() {
    let backdrop = qs('.lb-backdrop');
    if (backdrop) return backdrop;

    backdrop = document.createElement('div');
    backdrop.className = 'lb-backdrop';
    backdrop.innerHTML = `
      <div class="lb-dialog" role="dialog" aria-modal="true" aria-label="Просмотр изображения">
        <div class="lb-toolbar">
          <div class="lb-title"></div>
          <button class="lb-close" type="button" aria-label="Закрыть">✕</button>
        </div>
        <img class="lb-img" alt="">
      </div>
    `.trim();

    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', (e) => {
      const dialog = e.target.closest('.lb-dialog');
      const closeBtn = e.target.closest('.lb-close');
      if (!dialog || closeBtn || e.target === backdrop) closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLightbox();
    });

    return backdrop;
  }

  function openLightbox(src, title) {
    const backdrop = ensureLightbox();
    const img = qs('.lb-img', backdrop);
    const ttl = qs('.lb-title', backdrop);
    if (!img || !ttl) return;

    img.src = src;
    img.alt = title || 'Изображение';
    ttl.textContent = title || '';
    backdrop.classList.add('is-open');
  }

  function closeLightbox() {
    const backdrop = qs('.lb-backdrop');
    if (!backdrop) return;
    backdrop.classList.remove('is-open');
    const img = qs('.lb-img', backdrop);
    if (img) img.src = '';
  }

  // Data caches
  let casesRows = [];
  let caseIds = [];
  let casesById = new Map();
  let mediaByCase = new Map();
  let pendingCaseId = (window.__byplanPendingCaseId || '').trim();

  function openCasePublic(caseId) {
    const id = String(caseId || '').trim();
    if (!id) return;
    pendingCaseId = id;
    if (casesById && casesById.has(id)) {
      setCase(id);
    }
  }

  window.ByplanCasesOpen = openCasePublic;

  async function loadAllData() {
    const [cases, media] = await Promise.all([
      Sheets.fetchTab(SHEET_ID, TAB_CASES).catch(() => []),
      Sheets.fetchTab(SHEET_ID, TAB_MEDIA).catch(() => [])
    ]);

    casesRows = (cases || []).slice(0, CASES_LIMIT);

    casesById = new Map();
    caseIds = [];
    casesRows.forEach((r, idx) => {
      const id = String(r.case_id ?? '').trim();
      if (!id) return;
      caseIds.push(id);
      casesById.set(id, Object.assign({ __index: idx }, r));
    });

    mediaByCase = new Map();
    (media || []).forEach((r) => {
      const id = String(r.case_id ?? '').trim();
      if (!id) return;

      const label = String(r.label || '').trim();
      const rawComment = pickRowValue(r, ['comment','comment_text','comment_points','text','notes','case_comment']);
      const beforeUrl = normalizeUrl(r.before_url || r.before || r.before_thumb || '');
      const afterUrl  = normalizeUrl(r.after_url  || r.after  || r.after_thumb  || r.img_url || '');

      if (!label && !rawComment && !beforeUrl && !afterUrl) return;

      if (!mediaByCase.has(id)) mediaByCase.set(id, []);
      mediaByCase.get(id).push(r);
    });

    mediaByCase.forEach((arr) => {
      arr.sort((a, b) => num(a.sort) - num(b.sort));
    });
  }

  // --------- UI / State ----------
  let host = null;
  let elDialog = null;

  let elPlanWrap = null; // .story-plan (big box)

  let elTitle = null;
  let elMeta = null;
  let elProblem = null;
  let elResult = null;

  let elCaseSwitch = null;
  let elPrevCase = null;
  let elNextCase = null;
  let elCaseCounter = null;

  let elScenes = null;

  let elPlanTabs = null;
  let elPlanFrame = null;
  let elPlanImg = null;
  let elPlanCaption = null;

  let elSide = null;
  let elCommentTitle = null;
  let elStepper = null;
  let elSummary = null;

  let selectedCaseId = '';
  let selectedCaseIndex = 0;

  let currentScenes = [];
  let currentSceneIndex = 0;

  let currentImgMode = 'after';
  let currentPoints = [];
  let currentPointIndex = 0;

  // keep plan across scenes if no images in a scene
  let planBeforeUrl = '';
  let planAfterUrl = '';
  let planCapBefore = '';
  let planCapAfter = '';

  function mount() {
    const section = qs('#cases');
    if (!section) return false;

    const container = qs('.container', section);
    if (!container) return false;

    // Hide the "text variant" cards grid (still stays in DOM for fallback)
    const grid = qs('#casesGrid');
    if (grid) grid.style.display = 'none';

    document.body.classList.add('cases-inline-enabled');

    host = qs('#casesInline');
    if (!host) {
      host = document.createElement('div');
      host.id = 'casesInline';
      host.className = 'cases-inline';
      if (grid && grid.parentNode === container) container.insertBefore(host, grid);
      else container.appendChild(host);
    }

    host.innerHTML = `
      <div class="cases-modal__dialog cases-inline__dialog" aria-label="Примеры работ">
        <div class="cases-modal__top">
          <div class="badge cases-modal__badge">Примеры работ</div>
        </div>

        <header class="cases-modal__head">
          <h2 class="cases-modal__title" id="casesInlineTitle"></h2>
          <div class="cases-modal__meta">
            <div class="cases-modal__meta-item muted" id="casesInlineMeta"></div>
          </div>
          <div class="cases-modal__meta">
            <div class="cases-modal__meta-item" id="casesInlineProblem" hidden><strong>Задача:</strong> <span class="muted"></span></div>
            <div class="cases-modal__meta-item" id="casesInlineResult" hidden><strong>Результат:</strong> <span class="muted"></span></div>
          </div>
        </header>

        <nav class="cases-scenes" aria-label="Сцены кейса" id="casesScenes"></nav>

        <div class="story-grid">
          <div class="story-media">
            <div class="story-plan">
              <div class="story-plan__tabs" id="casesPlanTabs"></div>
              <div class="story-plan__frame" id="casesPlanFrame">
                <img class="story-plan__img" id="casesPlanImg" alt="" loading="lazy" decoding="async" />
                <button class="plan-fullscreen" id="casesFullscreenBtn" type="button" aria-label="На весь экран">На весь экран</button>
              </div>

              <div class="story-plan__caption muted" id="casesPlanCaption" hidden></div>
            </div>
          </div>

          <aside class="story-card cases-side" id="casesSide">
            <div class="cases-comment-title" id="casesCommentTitle" hidden></div>
            <div class="story-stepper" id="casesStepper"></div>

            <div class="story-panel" id="casesPanel">
              <div class="story-panel__kicker">ПУНКТ</div>
              <h3 id="casesPointTitle"></h3>
              <p id="casesPointText"></p>
            </div>

            <div class="cases-summary" id="casesSummary" hidden>
              <div class="cases-summary__kicker">ИТОГ</div>
              <p class="cases-summary__text" id="casesSummaryText"></p>
            </div>
          </aside>
        </div>

        <div class="cases-switch cases-switch--global" id="casesCaseSwitch" hidden>
          <button class="cases-switch__btn" type="button" id="casesPrevCase" aria-label="Предыдущий план">‹</button>
          <div class="cases-switch__counter muted" id="casesCaseCounter">1 / 1</div>
          <button class="cases-switch__btn" type="button" id="casesNextCase" aria-label="Следующий план">›</button>
        </div>
      </div>
    `.trim();

    elDialog = qs('.cases-inline__dialog', host);

    // inline overrides (avoid modal max-height scroll)
    if (elDialog) {
      elDialog.style.maxHeight = 'none';
      elDialog.style.overflow = 'visible';
      elDialog.style.transform = 'none';
    }

    elTitle = qs('#casesInlineTitle', host);
    elMeta = qs('#casesInlineMeta', host);
    elProblem = qs('#casesInlineProblem', host);
    elResult = qs('#casesInlineResult', host);

    elCaseSwitch = qs('#casesCaseSwitch', host);
    elPrevCase = qs('#casesPrevCase', host);
    elNextCase = qs('#casesNextCase', host);
    elCaseCounter = qs('#casesCaseCounter', host);

    elScenes = qs('#casesScenes', host);

    elPlanTabs = qs('#casesPlanTabs', host);
    elPlanFrame = qs('#casesPlanFrame', host);
    elPlanImg = qs('#casesPlanImg', host);
    elPlanCaption = qs('#casesPlanCaption', host);
    const fullscreenBtn = qs('#casesFullscreenBtn', host);

    elPlanWrap = elPlanFrame ? elPlanFrame.closest('.story-plan') : null;

    elSide = qs('#casesSide', host);
    elCommentTitle = qs('#casesCommentTitle', host);
    elStepper = qs('#casesStepper', host);
    elSummary = qs('#casesSummary', host);

    // image click -> lightbox
    elPlanImg.addEventListener('click', () => {
      const src = elPlanImg.currentSrc || elPlanImg.getAttribute('src');
      if (!src) return;
      openLightbox(src, elTitle ? elTitle.textContent : '');
    });

    // fullscreen button -> lightbox
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        const src = elPlanImg.currentSrc || elPlanImg.getAttribute('src');
        if (!src) return;
        openLightbox(src, elTitle ? elTitle.textContent : '');
      });
    }

    // prev/next case buttons
    elPrevCase.addEventListener('click', () => goPrevCase());
    elNextCase.addEventListener('click', () => goNextCase());

    // swipe gesture (по плану)
    attachSwipe(elPlanFrame);

    // Keep arrows aligned with the BIG plan box (story-plan)
    // but vertically centered to the frame area.
    positionCaseSwitch();
    window.addEventListener('resize', () => positionCaseSwitch(), { passive: true });

    return true;
  }

  function setActiveButtons(container, activeIndex, selector) {
    const btns = qsa(selector || 'button', container);
    btns.forEach((b, i) => b.classList.toggle('is-active', i === activeIndex));
  }

  function updateCaseSwitchUI() {
    if (!elCaseSwitch) return;
    if (!caseIds || caseIds.length <= 1) {
      elCaseSwitch.hidden = true;
      return;
    }
    elCaseSwitch.hidden = false;
    const n = caseIds.length;
    const i = Math.max(0, Math.min(selectedCaseIndex, n - 1));
    elCaseCounter.textContent = `${i + 1} / ${n}`;

    positionCaseSwitch();
  }

  // Position the overlay switch relative to the big plan box (.story-plan)
  // while keeping its vertical span equal to the frame.
  function positionCaseSwitch() {
  if (!elCaseSwitch || !elPlanFrame || !elDialog) return;

  // The switch is positioned relative to the WHOLE dialog (big rounded box),
  // while keeping its vertical span equal to the plan frame.
  const dialogPos = window.getComputedStyle(elDialog).position;
  if (dialogPos === 'static') elDialog.style.position = 'relative';

  const dialogRect = elDialog.getBoundingClientRect();
  const frameRect = elPlanFrame.getBoundingClientRect();

  const top = frameRect.top - dialogRect.top;
  const height = frameRect.height;

  // Counter should stay centered относительно плановой рамки (а не всего диалога)
  const counterLeft = (frameRect.left - dialogRect.left) + (frameRect.width / 2);

  elCaseSwitch.style.top = `${top}px`;
  elCaseSwitch.style.height = `${height}px`;
  elCaseSwitch.style.setProperty('--counter-left', `${counterLeft}px`);
}

  function renderScenesTabs() {
    elScenes.innerHTML = '';

    // Если сцен 0 или 1 — вкладки не нужны (меньше визуального мусора)
    if (!currentScenes || currentScenes.length <= 1) {
      elScenes.hidden = true;
      return;
    }

    elScenes.hidden = false;

    currentScenes.forEach((scene, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'story-pill' + (idx === currentSceneIndex ? ' is-active' : '');
      btn.textContent = String(scene.label || `Сцена ${idx + 1}`);
      btn.addEventListener('click', () => setScene(idx));
      elScenes.appendChild(btn);
    });
  }

  function applyPlanImage(src, caption) {
    const safeSrc = normalizeUrl(src);
    elPlanImg.src = safeSrc || '';
    elPlanImg.alt = '';

    const cap = String(caption || '').trim();
    if (cap) {
      elPlanCaption.hidden = false;
      elPlanCaption.textContent = cap;
    } else {
      elPlanCaption.hidden = true;
      elPlanCaption.textContent = '';
    }
  }

  function renderPlanTabs() {
    elPlanTabs.innerHTML = '';

    const hasBefore = !!planBeforeUrl;
    const hasAfter = !!planAfterUrl;

    if (!hasBefore && !hasAfter) {
      elPlanImg.src = '';
      elPlanCaption.hidden = true;
      elPlanCaption.textContent = '';
      return;
    }

    if (currentImgMode === 'after' && !hasAfter && hasBefore) currentImgMode = 'before';
    if (currentImgMode === 'before' && !hasBefore && hasAfter) currentImgMode = 'after';

    if (hasAfter && hasBefore) {
      const btnAfter = document.createElement('button');
      btnAfter.type = 'button';
      btnAfter.className = 'story-pill' + (currentImgMode === 'after' ? ' is-active' : '');
      btnAfter.textContent = 'Стало';

      const btnBefore = document.createElement('button');
      btnBefore.type = 'button';
      btnBefore.className = 'story-pill' + (currentImgMode === 'before' ? ' is-active' : '');
      btnBefore.textContent = 'Было';

      btnAfter.addEventListener('click', () => {
        currentImgMode = 'after';
        btnAfter.classList.add('is-active');
        btnBefore.classList.remove('is-active');
        applyPlanImage(planAfterUrl, planCapAfter);
      });

      btnBefore.addEventListener('click', () => {
        currentImgMode = 'before';
        btnBefore.classList.add('is-active');
        btnAfter.classList.remove('is-active');
        applyPlanImage(planBeforeUrl, planCapBefore);
      });

      elPlanTabs.appendChild(btnAfter);
      elPlanTabs.appendChild(btnBefore);

      applyPlanImage(
        currentImgMode === 'after' ? planAfterUrl : planBeforeUrl,
        currentImgMode === 'after' ? planCapAfter : planCapBefore
      );
    } else {
      const src = planAfterUrl || planBeforeUrl || '';
      const cap = planAfterUrl ? planCapAfter : planCapBefore;
      applyPlanImage(src, cap);
    }
  }

  function updatePlanFromScene(scene, forceOverride) {
    const beforeUrl = normalizeUrl(scene.before_url || scene.before || scene.before_thumb || '');
    const afterUrl  = normalizeUrl(scene.after_url  || scene.after  || scene.after_thumb  || scene.img_url || '');

    const capBefore = String(scene.before_caption || '').trim();
    const capAfter  = String(scene.after_caption  || '').trim();

    // override plan only if scene has images (or forced on initial load)
    if (forceOverride || beforeUrl || afterUrl) {
      planBeforeUrl = beforeUrl;
      planAfterUrl = afterUrl;
      planCapBefore = capBefore;
      planCapAfter = capAfter;

      currentImgMode = planAfterUrl ? 'after' : 'before';
    }

    renderPlanTabs();
  }

  function updateCommentFromScene(scene) {
    const raw = pickRowValue(scene, ['comment','comment_text','comment_points','text','notes','case_comment']);

    const explicitTitle = pickRowValue(scene, ['comment_title', 'title']);
    const explicitSummary = pickRowValue(scene, ['comment_summary', 'summary']);

    const parsed = parsePoints(raw);

    const title = (explicitTitle || parsed.title || '').trim();
    const summary = (explicitSummary || parsed.summary || '').trim();

    let points = parsed.points || [];

    // If only one fallback point -> rename it as scene label (so it shows "1 Спальня", not "1 Комментарий")
    if (points.length === 1 && points[0].label === 'Комментарий') {
      const sceneLabel = String(scene.label || '').trim();
      if (sceneLabel) points[0].label = sceneLabel;
    }

    currentPoints = points;
    currentPointIndex = 0;

    const hasAnyText = Boolean(title || points.length || summary);
    if (!hasAnyText) {
      elDialog.classList.add('is-no-comment');
      return;
    }
    elDialog.classList.remove('is-no-comment');

    if (title) {
      elCommentTitle.hidden = false;
      elCommentTitle.textContent = title;
    } else {
      elCommentTitle.hidden = true;
      elCommentTitle.textContent = '';
    }

    // Stepper
    elStepper.innerHTML = '';
    if (!points.length) {
      elStepper.hidden = true;
      qs('#casesPointTitle', host).textContent = '';
      qs('#casesPointText', host).innerHTML = '';
    } else {
      elStepper.hidden = false;

      points.forEach((p, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'story-step' + (idx === 0 ? ' is-active' : '');

        btn.innerHTML = `
          <span class="story-step__num">${idx + 1}</span>
          <span class="story-step__label">${escapeHtml(p.label || `Пункт ${idx + 1}`)}</span>
        `.trim();

        btn.addEventListener('click', () => setActivePoint(idx));
        elStepper.appendChild(btn);
      });

      setActivePoint(0);
    }

    // Summary
    const sumTextEl = qs('#casesSummaryText', host);
    if (summary) {
      elSummary.hidden = false;
      sumTextEl.innerHTML = textToHtml(summary);
    } else {
      elSummary.hidden = true;
      sumTextEl.innerHTML = '';
    }
  }

  function setActivePoint(idx) {
    if (!currentPoints || !currentPoints.length) return;

    currentPointIndex = Math.max(0, Math.min(idx, currentPoints.length - 1));
    setActiveButtons(elStepper, currentPointIndex, '.story-step');

    const p = currentPoints[currentPointIndex];

    const titleEl = qs('#casesPointTitle', host);
    const textEl = qs('#casesPointText', host);

    titleEl.textContent = p.label || `Пункт ${currentPointIndex + 1}`;

    const body = String(p.text || '').trim();
    textEl.innerHTML = body ? textToHtml(body) : '';
  }

  function setScene(idx) {
    currentSceneIndex = Math.max(0, Math.min(idx, (currentScenes.length || 1) - 1));
    setActiveButtons(elScenes, currentSceneIndex, '.story-pill');

    const scene = currentScenes[currentSceneIndex];
    if (!scene) return;

    updatePlanFromScene(scene, false);
    updateCommentFromScene(scene);
  }

  function setCase(caseId) {
    const id = String(caseId || '').trim();
    if (!id) return;

    selectedCaseId = id;
    selectedCaseIndex = Math.max(0, caseIds.indexOf(id));

    const caseRow = casesById.get(id) || {};
    currentScenes = mediaByCase.get(id) || [];
    currentSceneIndex = 0;

    elTitle.textContent = String(caseRow.title || 'Кейс');
    elMeta.textContent = buildMeta(caseRow);

    const problem = String(caseRow.problem || '').trim();
    const result = String(caseRow.result || '').trim();

    if (problem) {
      elProblem.hidden = false;
      qs('span', elProblem).textContent = problem;
    } else {
      elProblem.hidden = true;
      qs('span', elProblem).textContent = '';
    }

    if (result) {
      elResult.hidden = false;
      qs('span', elResult).textContent = result;
    } else {
      elResult.hidden = true;
      qs('span', elResult).textContent = '';
    }

    updateCaseSwitchUI();

    // init plan from first scene with images (or case cover)
    planBeforeUrl = '';
    planAfterUrl = '';
    planCapBefore = '';
    planCapAfter = '';
    currentImgMode = 'after';

    let found = false;
    for (const s of currentScenes) {
      const b = normalizeUrl(s.before_url || s.before || s.before_thumb || '');
      const a = normalizeUrl(s.after_url  || s.after  || s.after_thumb  || s.img_url || '');
      if (b || a) {
        planBeforeUrl = b;
        planAfterUrl = a;
        planCapBefore = String(s.before_caption || '').trim();
        planCapAfter  = String(s.after_caption  || '').trim();
        currentImgMode = planAfterUrl ? 'after' : 'before';
        found = true;
        break;
      }
    }

    if (!found) {
      planAfterUrl = normalizeUrl(caseRow.img_url || '');
      currentImgMode = 'after';
    }

    renderScenesTabs();

    if (!currentScenes.length) {
      // no media: show image only, hide side
      renderPlanTabs();
      elDialog.classList.add('is-no-comment');
      elSide.style.display = 'none';
    } else {
      elSide.style.display = '';
      // force plan apply from first scene if it has images
      updatePlanFromScene(currentScenes[0], true);
      setScene(0);
    }
  }

  async function animateCaseSwitch(direction, apply) {
    if (prefersReducedMotion || !elDialog || typeof elDialog.animate !== 'function') {
      apply();
      return;
    }

    const dx = direction === 'next' ? -24 : 24;

    try {
      await elDialog.animate(
        [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${dx}px)` }],
        { duration: 160, easing: 'ease' }
      ).finished;
    } catch (_) {}

    apply();

    try {
      await elDialog.animate(
        [{ opacity: 0, transform: `translateX(${-dx}px)` }, { opacity: 1, transform: 'translateX(0)' }],
        { duration: 220, easing: 'ease' }
      ).finished;
    } catch (_) {}
  }

  function goToCaseIndex(nextIndex, direction) {
    const n = caseIds.length;
    if (!n) return;

    let idx = nextIndex;
    if (idx < 0) idx = n - 1;
    if (idx >= n) idx = 0;

    const nextId = caseIds[idx];
    if (!nextId || nextId === selectedCaseId) return;

    animateCaseSwitch(direction || 'next', () => setCase(nextId));
  }

  function goPrevCase() {
    goToCaseIndex(selectedCaseIndex - 1, 'prev');
  }

  function goNextCase() {
    goToCaseIndex(selectedCaseIndex + 1, 'next');
  }

  function attachSwipe(el) {
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let isDown = false;

    const THRESH = 52; // px
    const MAX_T = 550; // ms

    el.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
      isDown = true;
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
      if (!isDown) return;
      isDown = false;

      const dt = Date.now() - startT;
      if (dt > MAX_T) return;

      const t = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
      if (!t) return;

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (Math.abs(dx) < THRESH) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) return; // vertical scroll wins

      if (dx < 0) goNextCase();
      else goPrevCase();
    }, { passive: true });
  }

  // ---------- init ----------
  function init() {
    loadAllData()
      .then(() => {
        if (!mount()) return;

        // default case: first
        const firstId = (caseIds || [])[0];
        if (firstId) setCase(firstId);

        if (pendingCaseId && casesById && casesById.has(pendingCaseId)) {
          setCase(pendingCaseId);
        }
      })
      .catch((err) => console.warn('[cases-inline] Failed to load:', err));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

;
