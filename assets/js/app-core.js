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
    const root = getEl(targetIdOrEl);
    if (!root) return;

    const items = (rows || [])
      .filter(r => safeBool(r.is_enabled ?? r.enabled, true))
      .map(r => ({
        q: norm(r.question ?? r.q ?? r.title ?? r.name),
        a: norm(r.answer ?? r.a ?? r.text ?? r.body),
      }))
      .filter(x => x.q || x.a);

    root.innerHTML = "";

    items.forEach((it, idx) => {
      const wrap = document.createElement("div");
      wrap.className = "faq-item";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "faq-q";
      btn.setAttribute("aria-expanded", "false");

      const label = document.createElement("span");
      label.textContent = it.q || `Вопрос ${idx + 1}`;

      const icon = document.createElement("span");
      icon.className = "faq-icon";
      icon.textContent = "+";

      btn.append(label, icon);

      const panel = document.createElement("div");
      panel.className = "faq-a";
      panel.hidden = true;
      panel.textContent = it.a;

      btn.addEventListener("click", () => {
        const expanded = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", expanded ? "false" : "true");
        panel.hidden = expanded;
      });

      wrap.append(btn, panel);
      root.append(wrap);
    });
  }

  // ---- Render: Contacts cards ----
  function renderContacts(targetIdOrEl, rows, kv = {}) {
    const root = getEl(targetIdOrEl);
    if (!root) return;

    const items = (rows || [])
      .filter(r => safeBool(r.is_enabled ?? r.enabled, true))
      .map(r => ({
        title: norm(r.title ?? r.name ?? r.label),
        text: norm(r.text ?? r.value ?? r.subtitle ?? r.description),
        url: norm(r.url ?? r.href ?? r.link),
        cta: norm(r.cta ?? r.button ?? r.button_label ?? r.label_button),
      }))
      .filter(x => x.title || x.text || x.url);

    root.innerHTML = "";

    items.forEach(it => {
      const card = document.createElement("div");
      card.className = "contact-card";

      if (it.title) {
        const h = document.createElement("div");
        h.className = "contact-card__title";
        h.textContent = it.title;
        card.append(h);
      }

      if (it.text) {
        const p = document.createElement("div");
        p.className = "contact-card__text";
        p.textContent = it.text;
        card.append(p);
      }

      if (it.url) {
        const a = document.createElement("a");
        a.className = "btn btn--ghost contact-card__cta";
        a.href = it.url;
        if (isExternal(it.url)) {
          a.target = "_blank";
          a.rel = "noopener";
        }
        a.textContent = it.cta || "Открыть";
        card.append(a);
      }

      root.append(card);
    });
  }

  // ---- Export to global (so app.js can call without imports) ----
  if (!window.escapeHtml) window.escapeHtml = escapeHtml;
  if (!window.isExternal) window.isExternal = isExternal;
  if (!window.renderFAQ) window.renderFAQ = renderFAQ;
  if (!window.renderContacts) window.renderContacts = renderContacts;

  window.__BYPLAN_CORE__ = { version: "1.0.0" };
})();
