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
    return s.startsWith("/") ? s.slice(1) : s; // prevent jumping outside /byplan/
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

    // If your sheets.js provides a helper, use it
    if (typeof Sheets !== "undefined" && typeof Sheets.fetchTab === "function"){
      return await Sheets.fetchTab(sheetId, tabName);
    }

    // Otherwise fetch GViz directly
    const cb = Date.now().toString(36);
    const params = new URLSearchParams({ tqx: "out:json", sheet: tabName, headers: "1", cb });
    const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?${params.toString()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`GViz ${tabName} HTTP ${res.status}`);
    const txt = await res.text();
    const start = txt.indexOf("{");
    const end = txt.lastIndexOf("}");
    if (start < 0 || end < 0) throw new Error(`GViz ${tabName} parse failed`);
    const data = JSON.parse(txt.slice(start, end + 1));

    const cols = (data?.table?.cols || []).map(c => norm(c.label));
    const rows = (data?.table?.rows || []).map(r => (r.c || []).map(c => (c && c.v != null) ? String(c.v) : ""));
    return rows.map(r => Object.fromEntries(cols.map((k, i) => [k, r[i] ?? ""])));
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
