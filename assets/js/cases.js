/* ============================================================
   BYPLAN — cases.js (v1.2-inline)
   Purpose: REMOVE the "text card -> click -> modal" flow.
   Instead, render the "красивый развёрнутый" кейс-вьювер
   прямо в секции #cases (первый уровень просмотра).

   - Не трогаем app.js.
   - Берём данные из Google Sheets: tabs "cases" и "cases_media".
   - #casesGrid (карточки) скрываем, чтобы не было "дурацкого текстового варианта".
   - UI внутри секции использует уже существующие стили story.css + cases.css
     (тот же визуал, что в модалке).

   cases_media:
     - одна строка = одна вкладка/сцена (label)
     - comment = текст справа (можно простой, можно с 1.,2. для подпунктов)
     - before_url/after_url можно задать только в первой сцене (общая картинка),
       остальные сцены могут быть без картинок (картинка сохраняется).

   ============================================================ */

(function () {
  'use strict';

  if (window.__byplanCasesInlineV12) return;
  window.__byplanCasesInlineV12 = true;

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

  function normalizeUrl(u) {
    const s = String(u ?? '').trim();
    if (!s) return '';
    if (/^(https?:)?\/\//i.test(s) || /^data:/i.test(s)) return s;
    return s.replace(/^\/+/, '');
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
      headers.push({ idx: i, num: Number(m[1] || 0), label: (m[2] || '').trim() });
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

  // Lightbox (same classes as polish.js, but independent)
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
  let casesById = new Map();
  let mediaByCase = new Map();

  async function loadAllData() {
    const [cases, media] = await Promise.all([
      Sheets.fetchTab(SHEET_ID, TAB_CASES).catch(() => []),
      Sheets.fetchTab(SHEET_ID, TAB_MEDIA).catch(() => [])
    ]);

    casesRows = (cases || []).slice(0, CASES_LIMIT);

    casesById = new Map();
    casesRows.forEach((r, idx) => {
      const id = String(r.case_id ?? '').trim();
      if (!id) return;
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

  let elBadge = null;
  let elTitle = null;
  let elMeta = null;
  let elProblem = null;
  let elResult = null;

  let elCaseTabs = null;
  let elScenes = null;

  let elPlanTabs = null;
  let elPlanImg = null;
  let elPlanCaption = null;

  let elSide = null;
  let elCommentTitle = null;
  let elStepper = null;
  let elSummary = null;

  let selectedCaseId = '';
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
      <div class="cases-modal__dialog cases-inline__dialog">
        <div class="cases-modal__top">
          <div class="badge cases-modal__badge" id="casesInlineBadge">Пример работ</div>
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

        <nav class="cases-scenes cases-case-tabs" aria-label="Кейсы" id="casesCaseTabs" hidden></nav>

        <nav class="cases-scenes" aria-label="Сцены кейса" id="casesScenes"></nav>

        <div class="story-grid">
          <div class="story-media">
            <div class="story-plan">
              <div class="story-plan__tabs" id="casesPlanTabs"></div>
              <div class="story-plan__frame">
                <img class="story-plan__img" id="casesPlanImg" alt="" loading="lazy" decoding="async" />
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
      </div>
    `.trim();

    elDialog = qs('.cases-inline__dialog', host);

    // inline overrides (avoid modal max-height scroll)
    if (elDialog) {
      elDialog.style.maxHeight = 'none';
      elDialog.style.overflow = 'visible';
      elDialog.style.transform = 'none';
    }

    elBadge = qs('#casesInlineBadge', host);
    elTitle = qs('#casesInlineTitle', host);
    elMeta = qs('#casesInlineMeta', host);
    elProblem = qs('#casesInlineProblem', host);
    elResult = qs('#casesInlineResult', host);

    elCaseTabs = qs('#casesCaseTabs', host);
    elScenes = qs('#casesScenes', host);

    elPlanTabs = qs('#casesPlanTabs', host);
    elPlanImg = qs('#casesPlanImg', host);
    elPlanCaption = qs('#casesPlanCaption', host);

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

    return true;
  }

  function setActiveButtons(container, activeIndex, selector) {
    const btns = qsa(selector || 'button', container);
    btns.forEach((b, i) => b.classList.toggle('is-active', i === activeIndex));
  }

  function renderCaseTabs() {
    if (!elCaseTabs) return;

    if (casesRows.length <= 1) {
      elCaseTabs.hidden = true;
      elCaseTabs.innerHTML = '';
      return;
    }

    elCaseTabs.hidden = false;
    elCaseTabs.innerHTML = '';

    casesRows.forEach((r) => {
      const id = String(r.case_id || '').trim();
      if (!id) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'story-pill' + (id === selectedCaseId ? ' is-active' : '');
      btn.textContent = String(r.title || id);
      btn.addEventListener('click', () => setCase(id));
      elCaseTabs.appendChild(btn);
    });
  }

  function renderScenesTabs() {
    elScenes.innerHTML = '';

    if (!currentScenes || currentScenes.length === 0) {
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

      applyPlanImage(currentImgMode === 'after' ? planAfterUrl : planBeforeUrl, currentImgMode === 'after' ? planCapAfter : planCapBefore);
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

    // only override plan if this scene has images (or if forced on initial load)
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

    const caseRow = casesById.get(id) || {};
    currentScenes = mediaByCase.get(id) || [];
    currentSceneIndex = 0;

    elBadge.textContent = 'Пример работ';
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

    // Render tabs
    renderCaseTabs();
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

  // ---------- init ----------
  function init() {
    loadAllData()
      .then(() => {
        if (!mount()) return;

        // Pick default case (first row)
        const first = casesRows.find(r => String(r.case_id || '').trim());
        if (first) setCase(String(first.case_id).trim());
      })
      .catch((err) => console.warn('[cases-inline] Failed to load:', err));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();