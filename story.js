(() => {
  "use strict";

  // --- helpers ---
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const toStr = (v) => (v === null || v === undefined ? "" : String(v)).trim();

  const isAbsUrl = (s) => /^(https?:\/\/|data:|blob:|mailto:|tel:|#)/i.test(s);

  /**
   * Resolve an asset path to a URL that works on GitHub Pages subpaths.
   * - keeps absolute URLs as-is
   * - removes leading slashes for relative paths
   * - resolves against document.baseURI (so /byplan/ stays in the path)
   */
  function resolveAsset(v) {
    const s = toStr(v);
    if (!s) return "";
    if (isAbsUrl(s)) return s;

    const cleaned = s.replace(/^\/+/, "");
    try {
      return new URL(cleaned, document.baseURI).toString();
    } catch {
      return cleaned;
    }
  }

  async function fetchTabSafe(tabName) {
    // Prefer the project's fetchTab() helper if it exists.
    if (typeof fetchTab === "function") {
      return await fetchTab(tabName);
    }

    const sheetId =
      (typeof SHEET_ID !== "undefined" && SHEET_ID) ||
      window.SHEET_ID ||
      window.__SHEET_ID ||
      null;

    if (!sheetId) return [];

    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(
      tabName
    )}&t=${Date.now()}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
    const txt = await res.text();

    const m = txt.match(/setResponse\((.*)\);?\s*$/s);
    if (!m) return [];

    const json = JSON.parse(m[1]);
    const table = json.table;
    const cols = (table.cols || []).map((c, i) => (c.label || `col${i}`).trim());

    const rows = (table.rows || []).map((r) => {
      const obj = {};
      (r.c || []).forEach((cell, i) => {
        const key = cols[i] || `col${i}`;
        obj[key] = cell ? cell.v : "";
      });
      return obj;
    });

    // drop empty rows
    return rows.filter((r) => Object.values(r).some((v) => toStr(v) !== ""));
  }

  function readKv(rows) {
    const map = {};
    (rows || []).forEach((r) => {
      const key = toStr(r.key ?? r.Key ?? r.KEY);
      if (!key) return;
      map[key] = toStr(r.value ?? r.Value ?? r.VALUE);
    });
    return map;
  }

  function normalizeStoryRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    // KV-style sheet: columns key/value
    const first = rows[0] || {};
    const isKv = ("key" in first && "value" in first) || ("Key" in first && "Value" in first);

    if (isKv) {
      const kv = readKv(rows);
      return [
        {
          story_id: kv.story_id || kv.id || "case1",
          badge: kv.badge || kv.story_badge || "История клиента",
          title: kv.title || kv.story_title || "",
          subtitle: kv.subtitle || kv.story_subtitle || "",
          quote: kv.quote || kv.story_quote || "",
          quote_author: kv.quote_author || kv.story_quote_author || "",
          plan_before_src: kv.plan_before_src || kv.before_img || kv.plan_before || "",
          plan_after_src: kv.plan_after_src || kv.after_img || kv.plan_after || "",
          plan_caption_before: kv.plan_caption_before || kv.plan_caption || "",
          plan_caption_after: kv.plan_caption_after || kv.plan_caption || "",
          default_view: (kv.default_view || kv.plan_default_view || "after").toLowerCase(),
          cta_primary_label: kv.cta_primary_label || kv.cta_primary_text || "",
          cta_primary_url: kv.cta_primary_url || kv.cta_primary_href || "",
          cta_secondary_label: kv.cta_secondary_label || kv.cta_secondary_text || "",
          cta_secondary_url: kv.cta_secondary_url || kv.cta_secondary_href || "",
        },
      ];
    }

    // Row-style sheet: one or multiple stories
    return rows
      .map((r) => ({
        story_id: toStr(r.story_id || r.id || r.slug || r.case_id || "case1"),
        badge: toStr(r.badge || r.story_badge || "История клиента"),
        title: toStr(r.title || r.story_title || ""),
        subtitle: toStr(r.subtitle || r.story_subtitle || ""),
        quote: toStr(r.quote || ""),
        quote_author: toStr(r.quote_author || ""),
        plan_before_src: toStr(r.plan_before_src || r.before_img || ""),
        plan_after_src: toStr(r.plan_after_src || r.after_img || ""),
        plan_caption_before: toStr(r.plan_caption_before || r.plan_caption || ""),
        plan_caption_after: toStr(r.plan_caption_after || r.plan_caption || ""),
        default_view: toStr(r.default_view || "after").toLowerCase(),
        cta_primary_label: toStr(r.cta_primary_label || ""),
        cta_primary_url: toStr(r.cta_primary_url || ""),
        cta_secondary_label: toStr(r.cta_secondary_label || ""),
        cta_secondary_url: toStr(r.cta_secondary_url || ""),
      }))
      .filter((r) => r.title || r.subtitle || r.plan_before_src || r.plan_after_src);
  }

  function normalizeScenes(rows, storyId) {
    if (!Array.isArray(rows)) return [];

    const scenes = rows
      .filter((r) => {
        const sid = toStr(r.story_id || r.story || r.case_id || "case1") || "case1";
        return !storyId || sid === storyId;
      })
      .map((r, i) => {
        const idx = Number(r.idx ?? r.step_index ?? r.step ?? i + 1);
        return {
          idx: Number.isFinite(idx) ? idx : i + 1,
          title: toStr(r.step_title || r.title || `Шаг ${i + 1}`),
          text: toStr(r.step_text || r.text || r.description || ""),
          kicker: toStr(r.kicker || r.step_kicker || ""),
        };
      })
      .sort((a, b) => a.idx - b.idx);

    return scenes;
  }

  function initReveal(section) {
    if (!section) return;

    const reveal = () => section.classList.add("is-in");

    // If IntersectionObserver exists, reveal on scroll-in
    if ("IntersectionObserver" in window) {
      const obs = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              reveal();
              obs.disconnect();
              break;
            }
          }
        },
        { threshold: 0.15 }
      );
      obs.observe(section);

      // Fallback for cases where the user is already at #story on load.
      setTimeout(() => {
        if (section.classList.contains("is-in")) return;
        const rect = section.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) reveal();
      }, 600);
    } else {
      // Old browsers: reveal immediately
      reveal();
    }
  }

  function setText(el, v) {
    if (!el) return;
    el.textContent = toStr(v);
  }

  function setLink(a, label, url) {
    if (!a) return;

    const t = toStr(label);
    const u = toStr(url);

    if (t) a.textContent = t;
    if (u) a.setAttribute("href", u);

    // If after update there is no href, hide button
    const href = toStr(a.getAttribute("href"));
    if (!href) a.style.display = "none";
  }

  function buildStepper(stepperEl, scenes, onSelect) {
    if (!stepperEl) return;
    stepperEl.innerHTML = "";

    scenes.forEach((scene, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "story-step";
      btn.dataset.idx = String(scene.idx);

      const num = document.createElement("span");
      num.className = "story-step__num";
      num.textContent = String(i + 1);

      const label = document.createElement("span");
      label.className = "story-step__label";
      label.textContent = scene.title;

      btn.append(num, label);
      btn.addEventListener("click", () => onSelect(i));

      stepperEl.appendChild(btn);
    });
  }

  function setActiveStep(stepperEl, activeIndex) {
    if (!stepperEl) return;
    const btns = qsa(".story-step", stepperEl);
    btns.forEach((b, i) => b.classList.toggle("is-active", i === activeIndex));
  }

  function setupPlanToggle({ planImg, captionEl, btnAfter, btnBefore, story }) {
    if (!planImg) return;

    const beforeSrc = resolveAsset(story.plan_before_src || planImg.dataset.before || "");
    const afterSrc = resolveAsset(story.plan_after_src || planImg.dataset.after || planImg.getAttribute("src") || "");

    planImg.dataset.before = beforeSrc;
    planImg.dataset.after = afterSrc;

    const captionBefore = toStr(story.plan_caption_before || planImg.dataset.captionBefore || "");
    const captionAfter = toStr(story.plan_caption_after || planImg.dataset.captionAfter || "");

    planImg.dataset.captionBefore = captionBefore;
    planImg.dataset.captionAfter = captionAfter;

    const setMode = (mode) => {
      const isAfter = mode === "after";

      const src = isAfter ? afterSrc : beforeSrc;
      if (src) planImg.setAttribute("src", src);

      if (captionEl) {
        captionEl.textContent = isAfter ? captionAfter || captionBefore : captionBefore || captionAfter;
      }

      btnAfter?.classList.toggle("is-active", isAfter);
      btnBefore?.classList.toggle("is-active", !isAfter);
    };

    btnAfter?.addEventListener("click", () => setMode("after"));
    btnBefore?.addEventListener("click", () => setMode("before"));

    const def = (story.default_view || "after").toLowerCase();
    setMode(def === "before" ? "before" : "after");
  }

  async function hydrateAboutPhoto() {
    // Optional fix: if designer photo is driven from sheet (site → designer_photo_url)
    const img = document.getElementById("designerPhoto");
    if (!img) return;

    try {
      const rows = await fetchTabSafe("site");
      // site tab is KV-style (key/value)
      const kv = readKv(rows);
      const url = kv.designer_photo_url || kv.designerPhotoUrl || kv.designer_photo || "";
      if (url) {
        img.src = resolveAsset(url);
      }
    } catch (e) {
      console.warn("[about] designer photo hydrate failed", e);
    }
  }

  async function hydrateStory() {
    const section = document.getElementById("story");
    if (!section) return;

    // Ensure it becomes visible (story.css hides inner parts until .is-in)
    initReveal(section);

    try {
      const storyRowsRaw = await fetchTabSafe("story");
      const stories = normalizeStoryRows(storyRowsRaw);
      const story = stories[0] || {};

      // Header (badge/title/subtitle)
      setText(qs('[data-story-field="badge"]', section), story.badge || "История клиента");
      setText(qs('[data-story-field="title"]', section), story.title || "");
      setText(qs('[data-story-field="subtitle"]', section), story.subtitle || "");

      // Quote block
      setText(document.getElementById("storyQuote"), story.quote || "");
      setText(document.getElementById("storyQuoteAuthor"), story.quote_author || "");

      // Plan toggle
      setupPlanToggle({
        planImg: document.getElementById("storyPlanImg"),
        captionEl: document.getElementById("storyPlanCaption"),
        btnAfter: document.getElementById("storyViewAfter"),
        btnBefore: document.getElementById("storyViewBefore"),
        story,
      });

      // CTAs
      setLink(document.getElementById("storyCtaPrimary"), story.cta_primary_label, story.cta_primary_url);
      setLink(document.getElementById("storyCtaSecondary"), story.cta_secondary_label, story.cta_secondary_url);

      // Scenes / stepper
      const storyId = story.story_id || "case1";
      const scenesRaw = await fetchTabSafe("story_scenes");
      const scenes = normalizeScenes(scenesRaw, storyId);

      const stepperEl = document.getElementById("storyStepper");
      const kickerEl = document.getElementById("storyKicker");
      const titleEl = document.getElementById("storyPanelTitle");
      const textEl = document.getElementById("storyPanelText");

      // Panel title stays the story title (matches your mock)
      if (titleEl && story.title) titleEl.textContent = story.title;

      let active = 0;
      const select = (i) => {
        active = i;
        setActiveStep(stepperEl, active);
        const s = scenes[active];
        if (!s) return;

        // Kicker = step name (or explicit kicker)
        if (kickerEl) kickerEl.textContent = (s.kicker || s.title || "").toUpperCase();

        // Text = per-step text, fallback to story subtitle
        if (textEl) textEl.textContent = s.text || story.subtitle || "";
      };

      if (scenes.length) {
        buildStepper(stepperEl, scenes, select);
        select(0);
      } else {
        // If no scenes, at least show subtitle
        if (kickerEl) kickerEl.textContent = "";
        if (textEl) textEl.textContent = story.subtitle || "";
      }

      // If something prevented IO from firing (rare), force visibility.
      section.classList.add("is-in");
    } catch (e) {
      console.warn("[story] hydrate failed", e);
      // Make sure it is visible even if data load failed.
      section?.classList.add("is-in");
    }
  }

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  onReady(() => {
    hydrateStory();
    hydrateAboutPhoto();
  });
})();
