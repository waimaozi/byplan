/* BYPLAN story section
   - Adds a "featured story" block between #for and #deliverables
   - Loads scenes from Google Sheets tab "story" if it exists
   - Falls back to embedded demo scenes (based on the provided review)

   Expected sheet columns (row1 headers):
     step | label | title | text | quote

   If you don't want a new tab yet, просто оставьте — будет работать fallback.
*/

(function(){
  "use strict";

  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }

  const fallbackScenes = [
    {
      step: 1,
      label: "Запрос",
      title: "Типовая 2‑ка 60 м² → функциональная 3‑ка",
      text: "Нужно было сделать детскую, кабинет и систему хранения — без объединения кухни с гостиной.",
      quote: "Из этой малышки нужно было сделать стильную, функциональную 3‑ку." 
    },
    {
      step: 2,
      label: "Критерии",
      title: "Понятный выбор и доверие",
      text: "Важны были: чувство стиля, честность, ограниченное количество опций и минимум лишних созвонов.",
      quote: "С первого разговора я поняла: попала в руки достойного, честного человека." 
    },
    {
      step: 3,
      label: "Процесс",
      title: "Коммуникация с прорабом без моего участия",
      text: "Чтобы проект реализовался без хаоса, дизайнер и прораб должны говорить на одном языке и решать вопросы напрямую.",
      quote: "Чтобы прораб и дизайнер могли эффективно общаться между собой без моего участия." 
    },
    {
      step: 4,
      label: "Юридически",
      title: "С возможностью согласования в БТИ",
      text: "Планировка должна быть не только удобной, но и реальной: с учетом ограничений и будущего согласования.",
      quote: "Важно было, чтобы я могла потом согласовать и получить новый план БТИ." 
    },
    {
      step: 5,
      label: "Результат",
      title: "Каждый метр работает. И спустя годы",
      text: "В итоге все пожелания учли, нашли нюансы, о которых не думали — и ремонт радует уже третий год.",
      quote: "Мой муж уже третий год ходит и нахваливает наш ремонт." 
    }
  ];

  function normalizeRows(rows){
    // Convert Google Visualization rows (already mapped by Sheets.fetchTab) into our scenes.
    return rows
      .map((r, idx) => {
        const step = Number(r.step || r.order || (idx+1));
        return {
          step,
          label: (r.label || r.kicker || "").trim() || `Шаг ${step}`,
          title: (r.title || "").trim() || `Шаг ${step}`,
          text: (r.text || r.body || "").trim(),
          quote: (r.quote || "").trim()
        };
      })
      .filter(s => (s.title || s.text || s.quote))
      .sort((a,b) => a.step - b.step);
  }

  function renderScene(scene, root){
    const panel = $("#storyPanel", root);
    if(!panel) return;

    panel.classList.remove("is-ready");
    // Small reflow to restart transition
    void panel.offsetWidth; // eslint-disable-line no-unused-expressions

    panel.innerHTML = `
      <div class="story-panel__kicker">${escapeHtml(scene.label)}</div>
      <h3>${escapeHtml(scene.title)}</h3>
      ${scene.text ? `<p>${escapeHtml(scene.text)}</p>` : ""}
    `;

    panel.classList.add("is-ready");

    const q = $("#storyQuote", root);
    const qa = $("#storyQuoteAuthor", root);
    if(q){
      q.textContent = scene.quote || "";
    }
    if(qa){
      // If user filled author in KV, keep it; otherwise show generic.
      if(!qa.dataset.locked){
        qa.textContent = qa.textContent?.trim() ? qa.textContent : "Из отзыва клиента";
      }
    }
  }

  function renderStepper(scenes, root){
    const stepper = $("#storyStepper", root);
    if(!stepper) return;

    stepper.innerHTML = "";
    scenes.forEach((s, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "story-step";
      btn.dataset.storyStep = String(i);
      btn.innerHTML = `
        <span class="story-step__num">${escapeHtml(String(s.step))}</span>
        <span class="story-step__label">${escapeHtml(s.label)}</span>
      `;
      stepper.appendChild(btn);
    });
  }

  function setActiveStep(index, scenes, root){
    const stepButtons = $all(".story-step", root);
    stepButtons.forEach((b, i) => b.classList.toggle("is-active", i === index));
    renderScene(scenes[index], root);
  }

  function setupPlanToggle(root){
    const img = $("#storyPlanImg", root);
    if(!img) return;

    const before = img.dataset.beforeSrc;
    const after = img.dataset.afterSrc;
    if(!before || !after) return;

    const tabs = $all("[data-story-view]", root);
    function activate(view){
      tabs.forEach(t => t.classList.toggle("is-active", t.dataset.storyView === view));
      img.classList.remove("is-ready");
      void img.offsetWidth; // restart transition
      img.src = (view === "before") ? before : after;
      img.classList.add("is-ready");
    }

    tabs.forEach(t => {
      t.addEventListener("click", () => activate(t.dataset.storyView));
    });

    // default
    activate("after");
  }

  function setupReveal(root){
    const section = $("#story", root);
    if(!section) return;

    // Start visible if IntersectionObserver missing
    if(!('IntersectionObserver' in window)){
      section.classList.add('is-in');
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if(e.isIntersecting){
          section.classList.add('is-in');
          io.disconnect();
        }
      });
    }, { threshold: 0.18 });

    io.observe(section);
  }

  function escapeHtml(str){
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function init(){
    const root = document;
    const story = $("#story", root);
    if(!story) return;

    setupReveal(root);
    setupPlanToggle(root);

    let scenes = fallbackScenes;

    // Load from Sheets if possible
    try{
      if(typeof Sheets !== 'undefined' && typeof Sheets.fetchTab === 'function' && typeof SHEET_ID !== 'undefined'){
        const rows = await Sheets.fetchTab(SHEET_ID, 'story');
        const normalized = normalizeRows(rows || []);
        if(normalized.length){
          scenes = normalized;
        }
      }
    }catch(err){
      // silent fallback
      console.warn('[story] Sheets fetch failed, using fallback.', err);
    }

    renderStepper(scenes, root);
    let active = 0;
    setActiveStep(active, scenes, root);

    // Click
    $("#storyStepper", root)?.addEventListener("click", (e) => {
      const btn = e.target.closest('.story-step');
      if(!btn) return;
      const idx = Number(btn.dataset.storyStep);
      if(Number.isNaN(idx)) return;
      active = idx;
      setActiveStep(active, scenes, root);
    });

    // Keyboard (when focused inside story)
    story.addEventListener('keydown', (e) => {
      if(e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const dir = (e.key === 'ArrowRight') ? 1 : -1;
      active = Math.max(0, Math.min(scenes.length - 1, active + dir));
      setActiveStep(active, scenes, root);
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }
})();
