/* ============================================================
   BYPLAN — cases.js (v1.1)
   Fixes for "добить v1" (как вы показываете на скрине):
   1) cases_media rows больше НЕ обязаны иметь before/after в каждой строке.
      Если у сцены нет картинок — мы сохраняем предыдущую (обычно из 1-й сцены).
   2) Если comment НЕ размечен нумерацией (1., 2., ...),
      то вместо "Комментарий" используем label сцены (например "Спальня").
   3) Клик по ссылке <a href="#">Открыть</a> теперь тоже открывает модалку
      (а реальные ссылки не перехватываем).
   ============================================================ */

(function () {
  'use strict';

  if (window.__byplanCasesV1) return;
  window.__byplanCasesV1 = true;

  const cfg = window.SITE_CONFIG;
  const Sheets = window.Sheets;

  if (!cfg || !Sheets || !cfg.SHEET_ID) return;

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

      // include rows even without images (v1.1 fix)
      const beforeUrl = normalizeUrl(r.before_url || r.before || r.before_thumb || '');
      const afterUrl  = normalizeUrl(r.after_url  || r.after  || r.after_thumb  || r.img_url || '');

      const label = String(r.label || '').trim();
      const rawComment = pickRowValue(r, ['comment','comment_text','comment_points','text','notes','case_comment']);

      if (!label && !rawComment && !beforeUrl && !afterUrl) return;

      if (!mediaByCase.has(id)) mediaByCase.set(id, []);
      mediaByCase.get(id).push(r);
    });

    mediaByCase.forEach((arr) => {
      arr.sort((a, b) => num(a.sort) - num(b.sort));
    });
  }

  // Modal state
  let modalEl = null;
  let elDialog = null;
  let elClose = null;
  let elBadge = null;
  let elTitle = null;
  let elMeta = null;
  let elProblem = null;
  let elResult = null;
  let elScenes = null;

  let elPlanTabs = null;
  let elPlanImg = null;
  let elPlanCaption = null;

  let elCommentTitle = null;
  let elStepper = null;
  let elSummary = null;

  let currentScenes = [];
  let currentSceneIndex = 0;
  let currentImgMode = 'after';
  let currentPoints = [];
  let currentPointIndex = 0;

  // NEW (v1.1): keep plan across scenes if a scene has no images
  let planBeforeUrl = '';
  let planAfterUrl = '';
  let planCapBefore = '';
  let planCapAfter = '';

  function ensureModal() {
    if (modalEl) return modalEl;

    modalEl = document.createElement('div');
    modalEl.className = 'cases-modal';
    modalEl.hidden = true;

    modalEl.innerHTML = `
      <div class="cases-modal__backdrop" data-cases-close="1"></div>
      <div class="cases-modal__dialog" role="dialog" aria-modal="true" aria-label="Примеры работ">
        <div class="cases-modal__top">
          <div class="badge cases-modal__badge" id="casesModalBadge">Пример работ</div>
          <button class="cases-modal__close" type="button" aria-label="Закрыть">✕</button>
        </div>

        <header class="cases-modal__head">
          <h2 class="cases-modal__title" id="casesModalTitle"></h2>
          <div class="cases-modal__meta">
            <div class="cases-modal__meta-item muted" id="casesModalMeta"></div>
          </div>
          <div class="cases-modal__meta">
            <div class="cases-modal__meta-item" id="casesModalProblem" hidden><strong>Задача:</strong> <span class="muted"></span></div>
            <div class="cases-modal__meta-item" id="casesModalResult" hidden><strong>Результат:</strong> <span class="muted"></span></div>
          </div>
        </header>

        <nav class="cases-scenes" aria-label="Сцены кейса" id="casesScenes"></nav>

        <div class="story-grid">
          <div class="story-media">
            <div class="story-plan">
              <div class="story-plan__tabs" id="casesPlanTabs"></div>
              <div class="story-plan__frame">
                <img class="story-plan__img" id="casesPlanImg" alt="" loading="eager" decoding="async" />
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

    document.body.appendChild(modalEl);

    elDialog = qs('.cases-modal__dialog', modalEl);
    elClose = qs('.cases-modal__close', modalEl);
    elBadge = qs('#casesModalBadge', modalEl);
    elTitle = qs('#casesModalTitle', modalEl);
    elMeta = qs('#casesModalMeta', modalEl);
    elProblem = qs('#casesModalProblem', modalEl);
    elResult = qs('#casesModalResult', modalEl);
    elScenes = qs('#casesScenes', modalEl);

    elPlanTabs = qs('#casesPlanTabs', modalEl);
    elPlanImg = qs('#casesPlanImg', modalEl);
    elPlanCaption = qs('#casesPlanCaption', modalEl);

    elCommentTitle = qs('#casesCommentTitle', modalEl);
    elStepper = qs('#casesStepper', modalEl);
    elSummary = qs('#casesSummary', modalEl);

    modalEl.addEventListener('click', (e) => {
      const close = e.target.closest('[data-cases-close]') || e.target.closest('.cases-modal__close');
      if (close) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!modalEl || modalEl.hidden) return;
      closeModal();
    });

    return modalEl;
  }

  function setActivePills(container, activeIndex) {
    const btns = qsa('button', container);
    btns.forEach((b, i) => b.classList.toggle('is-active', i === activeIndex));
  }

  function renderScenesTabs() {
    elScenes.innerHTML = '';

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

  function getSceneAt(idx) {
    return (currentScenes && currentScenes[idx]) ? currentScenes[idx] : null;
  }

  function renderPlan() {
    elPlanTabs.innerHTML = '';

    const hasBefore = !!planBeforeUrl;
    const hasAfter = !!planAfterUrl;

    // Decide mode if current missing
    if (currentImgMode === 'after' && !hasAfter && hasBefore) currentImgMode = 'before';
    if (currentImgMode === 'before' && !hasBefore && hasAfter) currentImgMode = 'after';

    if (hasBefore && hasAfter) {
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

  function updatePlanForScene(scene) {
    const beforeUrl = normalizeUrl(scene.before_url || scene.before || scene.before_thumb || '');
    const afterUrl  = normalizeUrl(scene.after_url  || scene.after  || scene.after_thumb  || scene.img_url || '');

    const capBefore = String(scene.before_caption || '').trim();
    const capAfter  = String(scene.after_caption  || '').trim();

    // NEW: only override plan if this scene has images
    if (beforeUrl || afterUrl) {
      planBeforeUrl = beforeUrl;
      planAfterUrl = afterUrl;
      planCapBefore = capBefore;
      planCapAfter = capAfter;

      // choose default mode
      if (planAfterUrl) currentImgMode = 'after';
      else if (planBeforeUrl) currentImgMode = 'before';
    }

    renderPlan();
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

  function updateCommentForScene(scene) {
    const raw = pickRowValue(scene, ['comment','comment_text','comment_points','text','notes','case_comment']);

    const explicitTitle = pickRowValue(scene, ['comment_title', 'title']);
    const explicitSummary = pickRowValue(scene, ['comment_summary', 'summary']);

    const parsed = parsePoints(raw);

    const title = (explicitTitle || parsed.title || '').trim();
    const summary = (explicitSummary || parsed.summary || '').trim();

    let points = parsed.points || [];

    // NEW: if only one fallback point, rename it as the scene label
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
      qs('#casesPointTitle', modalEl).textContent = '';
      qs('#casesPointText', modalEl).innerHTML = '';
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
    const sumTextEl = qs('#casesSummaryText', modalEl);
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
    setActivePills(elStepper, currentPointIndex);

    const p = currentPoints[currentPointIndex];

    const titleEl = qs('#casesPointTitle', modalEl);
    const textEl = qs('#casesPointText', modalEl);

    titleEl.textContent = p.label || `Пункт ${currentPointIndex + 1}`;

    const body = String(p.text || '').trim();
    textEl.innerHTML = body ? textToHtml(body) : '';
  }

  function setScene(idx) {
    currentSceneIndex = Math.max(0, Math.min(idx, (currentScenes.length || 1) - 1));

    if (!elScenes.hidden) {
      const btns = qsa('button', elScenes);
      btns.forEach((b, i) => b.classList.toggle('is-active', i === currentSceneIndex));
    }

    const scene = getSceneAt(currentSceneIndex);
    if (!scene) return;

    updatePlanForScene(scene);
    updateCommentForScene(scene);
  }

  function openCase(caseId) {
    const id = String(caseId || '').trim();
    if (!id) return;

    ensureModal();

    const caseRow = casesById.get(id) || {};

    // Scenes for this case
    currentScenes = mediaByCase.get(id) || [];
    currentSceneIndex = 0;

    // Header
    elBadge.textContent = 'Пример работ';
    elTitle.textContent = String(caseRow.title || 'Кейс');

    const meta = buildMeta(caseRow);
    elMeta.textContent = meta || '';

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

    // NEW: init plan from first scene that has images (or case cover)
    planBeforeUrl = '';
    planAfterUrl = '';
    planCapBefore = '';
    planCapAfter = '';
    currentImgMode = 'after';

    for (const s of currentScenes) {
      const b = normalizeUrl(s.before_url || s.before || s.before_thumb || '');
      const a = normalizeUrl(s.after_url  || s.after  || s.after_thumb  || s.img_url || '');
      if (b || a) {
        planBeforeUrl = b;
        planAfterUrl = a;
        planCapBefore = String(s.before_caption || '').trim();
        planCapAfter  = String(s.after_caption  || '').trim();
        currentImgMode = planAfterUrl ? 'after' : 'before';
        break;
      }
    }

    if (!planBeforeUrl && !planAfterUrl) {
      planAfterUrl = normalizeUrl(caseRow.img_url || '');
      currentImgMode = 'after';
    }

    // Scenes tabs
    renderScenesTabs();

    // Fallback if no scenes
    if (!currentScenes.length) {
      renderPlan();
      elDialog.classList.add('is-no-comment');
    } else {
      setScene(0);
    }

    // Show modal
    modalEl.hidden = false;
    modalEl.offsetHeight;
    modalEl.classList.add('is-open');
    document.body.classList.add('cases-lock');

    try { elClose.focus(); } catch (e) {}
  }

  function closeModal() {
    if (!modalEl || modalEl.hidden) return;

    modalEl.classList.remove('is-open');
    document.body.classList.remove('cases-lock');

    window.setTimeout(() => {
      if (!modalEl) return;
      modalEl.hidden = true;
    }, prefersReducedMotion ? 0 : 180);
  }

  // Attach to case cards (rendered by app.js)
  let bound = false;

  function attachCaseCardHandlers() {
    const grid = qs('#casesGrid');
    if (!grid) return false;

    const cards = qsa('.case-card', grid);
    if (!cards.length) return false;

    cards.forEach((card, idx) => {
      if (card.dataset.casesBound === '1') return;
      card.dataset.casesBound = '1';

      const row = casesRows[idx] || {};
      const id = String(row.case_id || '').trim();
      if (id) card.dataset.caseId = id;

      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      if (row.title) card.setAttribute('aria-label', `Открыть кейс: ${row.title}`);

      const onActivate = (e) => {
        const a = e.target.closest && e.target.closest('a');
        if (a) {
          const href = String(a.getAttribute('href') || '').trim();
          // if it's a dummy link (#) — open modal instead
          if (!href || href === '#' || href.startsWith('#')) {
            e.preventDefault();
          } else {
            return; // keep real links working
          }
        }

        e.preventDefault();
        e.stopPropagation();

        const cid = card.dataset.caseId || '';
        if (!cid) return;
        openCase(cid);
      };

      card.addEventListener('click', onActivate);

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const cid = card.dataset.caseId || '';
          if (!cid) return;
          openCase(cid);
        }
      });
    });

    return true;
  }

  function init() {
    if (bound) return;
    bound = true;

    loadAllData()
      .then(() => {
        attachCaseCardHandlers();

        const grid = qs('#casesGrid');
        if (!grid) return;

        const mo = new MutationObserver(() => attachCaseCardHandlers());
        mo.observe(grid, { childList: true, subtree: true });
      })
      .catch((err) => console.warn('[cases.js] Failed to load data:', err));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();