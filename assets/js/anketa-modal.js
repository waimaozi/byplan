/* ============================================================
   BYPLAN — anketa-modal.js (v2)
   Module: Анкета (модальное окно + пошаговая форма)
   Интеграция:
   - Положите файл в assets/js/anketa-modal.js
   - Подключите в index.html (см. README в модуле)
   - В Google Sheets (site) установите brief_url = #anketa (и, при желании, hero_cta_url = #anketa)
   ============================================================ */

(function () {
  "use strict";

  const OPEN_HASH = "#anketa";
  const STORAGE_KEY = "byplan_anketa_draft_v2";
  const FORM_VERSION = "byplan-anketa-v2";

  // ---- Текст из документа (формулировки старался не менять) ----
  // fileciteturn0file0
  const DOC_GOAL_TITLE = "1. Цель работы:";
  const DOC_GOAL_TEXT =
    "Целью работы является определение и фиксация особых требований по перепланировке, отделке, техническому оснащению, стилевому решению объекта.";

  const OBJECT_TITLE = "2. Краткая характеристика объекта:";
  const ROOMS_TITLE = "3. Требования  к составу помещений.";
  const INTERIOR_TITLE = "4. Требования к интерьерным  решениям, пожелания по отделке помещений.";

  const KITCHEN_TITLE = "7. Кухонная зона:";
  const BATH_TITLE = "8. Функциональность с/узлов:";
  const HEAT_TITLE = "9. Зоны подогрева полов:";
  const AC_TITLE = "11. Кондиционирование:";

  const QUESTIONS_TITLE = "Вопросы анкеты:";
  const QUESTIONS_SUBTITLE = "1. Отметьте пункты, которые Вам подходят:";

  const FINAL_TITLE =
    "Напишите, какие требования предъявляете к своему будущему жилью, что обязательно там должно быть и чего Вы не хотели бы.";

  // ---- Справочники (для удобного формирования payload) ----
  const ZONES = [
    { id: "hallway", label: "Прихожая" },
    { id: "kitchen", label: "Кухня" },
    { id: "parents_bedroom", label: "Спальня родителей" },
    { id: "child_room", label: "Комната ребенка" },
    { id: "cabinet", label: "Кабинет" },
    { id: "main_bath", label: "Санузел основной" }
  ];

  const KITCHEN_OPTIONS = [
    { code: "oven", label: "Духовой шкаф" },
    { code: "cooktop", label: "Варочная панель" },
    { code: "dishwasher", label: "Посудомоечная машина" },
    { code: "microwave", label: "Микроволновая печь" },
    { code: "sink", label: "Мойка" },
    { code: "fridge", label: "Холодильник" },
    { code: "other", label: "Другое", hasText: true }
  ];

  const BATH_OPTIONS = [
    { code: "washer", label: "Стиральная машина" },
    { code: "dryer", label: "Сушильная машина" },
    { code: "shower", label: "Душевая кабина" },
    { code: "toilet", label: "Унитаз" },
    { code: "hygienic_shower", label: "Гигиенический душ" },
    { code: "sink", label: "Умывальник" },
    { code: "bath", label: "Ванная" }
  ];

  const HEAT_OPTIONS = [
    { code: "kitchen", label: "Кухня" },
    { code: "main_bath", label: "Санузел основной" },
    { code: "guest_bath", label: "Санузел гостевой" }
  ];

  const AC_OPTIONS = [
    { code: "forced_ventilation", label: "Принудительная система вентиляции" },
    { code: "ac_with_fresh_air_intake", label: "Кондиционер с внешним забором воздуха" }
  ];

  const QUESTION_POINTS = [
    "мне всегда холодно, я люблю укутаться в одеяло, дома часто надеваю теплые носки;",
    "мне нравится, когда за окном дождь, сидеть в кресле и читать книжку;",
    "я люблю порядок, раскладываю вещи всегда аккуратно, всегда знаю, где что лежит;",
    "чтобы понять нравится мне вещь или нет, мне надо ее обязательно потрогать, подержать в руках;",
    "я люблю, когда ко мне приходят гости, у нас шумно и весело;",
    "перед сном я всегда читаю книгу;",
    "я хочу иметь в своей комнате телевизор, даже если есть большой экран в гостиной;",
    "когда я прихожу домой, я включаю телевизор, даже если там ничего не идет, просто так, для фона;",
    "у меня аллергия, поэтому я не выношу пыль;",
    "терпеть не могу шумные компании, мне нужно уединение;",
    "я рано ложусь спать, потому что я – жаворонок;",
    "мне нравятся светлые оттенки, потому что темный цвет я нахожу тяжелым и мрачным;",
    "мне всегда жарко, я люблю ходить в распахнутой одежде;",
    "я редко нежусь в ванной, я люблю больше душ;",
    "мне интересно разглядывать детали. Витрина, где выставлена куча всяких вещей любопытнее, чем дизайнерский минимализм;",
    "я люблю валяться в постели, могу весь день пролежать за книжкой или перед телевизором;",
    "я завтракаю отдельно, так мой график не совпадает с расписанием остальных членов семьи;",
    "мне нравится, когда вся семья вечером собирается вместе, мы сидим за столом, рассказываем новости или вместе смотрим телевизор;",
    "белая комната напоминает мне больницу;",
    "я занимаю ванную комнату надолго и бывает, что родные недовольны;",
    "на завтрак мне достаточно чашечки кофе и бутерброда, я не ем плотно по утрам;",
    "я меломан, у меня отличный слух и я люблю слушать хорошую музыку;",
    "я считаю, что спортом надо заниматься в спортклубе, дома можно лишь сделать разминку с утра;",
    "мне нужно место для занятий спортом дома (тренажер, велосипед, гантели);",
    "я терпеть не могу лишних вещей, считаю, если вещью не пользуются долгое время – ее нужно выбросить или отдать кому-то. Не надо захламлять квартиру;",
    "я коллекционирую магнитики, тарелочки, модели машинок, ………………………….",
    "диван нужен, чтобы на нем удобно сидеть, а не закрывать чехлом и сдувать пыль;",
    "я никогда не могу найти свои вещи, разбрасываю по комнате, потом ищу;",
    "я люблю путешествовать и всегда привожу сувениры из каждой страны;",
    "мне кажется стена пустой, если на ней не висит картина или что-то еще;",
    "если я нахожусь в комнате, а мне надо позвать кого из членов семьи (например, к телефону), приходится кричать на всю квартиру;",
    "мне нужен компьютер и собственное рабочее место;",
    "я городской житель, в деревне не могу прожить больше двух дней, хочется в цивилизацию;",
    "я люблю всё натуральное – дерево, камень, мне не нравится пластик, я нахожу его холодным;",
    "я считаю, нам нужно несколько телефонных трубок, вечно приходится искать телефон;",
    "мне нравится, когда на лестничной площадке вкусно пахнет, если кто-то из соседей готовит пирожки или котлеты;",
    "мне надо все напоминать, лучше, если оставят записку на холодильнике;",
    "я люблю всё модное, современное, классика навевает скуку;",
    "хочу, чтобы в доме было как можно меньше лишних вещей, они только пыль собирают."
  ];

  // ---- Utils ----
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escAttr(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function toNumber(v) {
    const s = String(v ?? "").trim().replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function nowIso() {
    try { return new Date().toISOString(); } catch { return ""; }
  }

  function safeParseJson(str) {
    try { return JSON.parse(str); } catch { return null; }
  }

  function isReady() {
    return document.readyState === "complete" || document.readyState === "interactive";
  }

  // ---- KV from Google Sheets (через уже существующий Sheets.fetchTab) ----
  async function loadSiteKV() {
    const cfg = window.SITE_CONFIG;
    const sheetId = cfg && cfg.SHEET_ID;
    const tab = (cfg && cfg.TABS && cfg.TABS.site) ? cfg.TABS.site : "site";
    if (!sheetId || !window.Sheets || typeof window.Sheets.fetchTab !== "function") return {};

    try {
      const rows = await window.Sheets.fetchTab(sheetId, tab);
      const kv = {};
      (rows || []).forEach(r => {
        const k = String(r.key || "").trim();
        if (!k) return;
        kv[k] = (r.value ?? "");
      });
      return kv;
    } catch (e) {
      console.warn("[anketa] cannot load site KV:", e);
      return {};
    }
  }

  // ---- Modal HTML builder ----
  function renderCheckboxGroup(name, options, otherTextName) {
    return `
      <div class="anketa-checkboxes">
        ${options.map(opt => {
          const id = `${name}_${opt.code}`;
          return `
            <div class="anketa-check">
              <input type="checkbox" id="${escAttr(id)}" name="${escAttr(name)}" value="${escAttr(opt.code)}">
              <label for="${escAttr(id)}">${opt.label}</label>
            </div>
          `;
        }).join("")}
      </div>
      ${otherTextName ? `
        <div class="anketa-field" data-anketa-other-wrap="${escAttr(otherTextName)}" hidden>
          <span class="anketa-label">${KITCHEN_OPTIONS.find(o=>o.code==="other")?.label || "Другое"}</span>
          <input class="anketa-input" type="text" name="${escAttr(otherTextName)}" placeholder="">
        </div>
      ` : ""}
    `;
  }

  function buildZones() {
    return `
      <div class="anketa-zones">
        ${ZONES.map(z => `
          <details class="anketa-zone">
            <summary>${z.label}</summary>
            <div class="anketa-grid">
              <label class="anketa-field">
                <span class="anketa-label">Цветовые предпочтения</span>
                <textarea class="anketa-textarea" name="interior_${escAttr(z.id)}_color"></textarea>
              </label>

              <label class="anketa-field">
                <span class="anketa-label">Мебель</span>
                <textarea class="anketa-textarea" name="interior_${escAttr(z.id)}_furniture"></textarea>
              </label>

              <label class="anketa-field">
                <span class="anketa-label">Оформление окон</span>
                <textarea class="anketa-textarea" name="interior_${escAttr(z.id)}_windows"></textarea>
              </label>

              <label class="anketa-field">
                <span class="anketa-label">Аудио-Видео-Техника</span>
                <textarea class="anketa-textarea" name="interior_${escAttr(z.id)}_av"></textarea>
              </label>

              <label class="anketa-field">
                <span class="anketa-label">Освещение</span>
                <textarea class="anketa-textarea" name="interior_${escAttr(z.id)}_light"></textarea>
              </label>
            </div>
          </details>
        `).join("")}
      </div>
    `;
  }

  function buildQuestionPoints() {
    const COLLAPSE_AFTER = 10;
    return `
      <div class="anketa-points is-collapsed" id="anketaPoints">
        <div class="anketa-hint">Можно отмечать выборочно. Это помогает лучше понять привычки и сценарии жизни.</div>

        <div class="anketa-checkboxes">
          ${QUESTION_POINTS.map((text, idx) => {
            const code = `p${String(idx + 1).padStart(2, "0")}`;
            const id = `anketa_point_${code}`;
            const hiddenClass = (idx >= COLLAPSE_AFTER) ? " is-hidden" : "";
            return `
              <div class="anketa-check anketa-point${hiddenClass}">
                <input type="checkbox" id="${escAttr(id)}" name="anketa_points" value="${escAttr(code)}">
                <label for="${escAttr(id)}">${text}</label>
              </div>
            `;
          }).join("")}
        </div>

        <div style="margin-top:12px;">
          <button class="anketa-link" type="button" data-anketa-action="toggle-points">Показать все пункты</button>
        </div>
      </div>
    `;
  }

  function buildModalShell() {
    const wrap = document.createElement("div");
    wrap.className = "anketa-modal";
    wrap.id = "anketaModal";
    wrap.hidden = true;

    wrap.innerHTML = `
      <div class="anketa-modal__backdrop" data-anketa-action="close" aria-hidden="true"></div>

      <div class="anketa-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="anketaTitle">
        <div class="anketa-modal__header">
          <div>
            <div class="anketa-modal__kicker">А Н К Е Т А</div>
            <h2 class="anketa-modal__title" id="anketaTitle">Анкета</h2>
            <div class="anketa-modal__meta">
              <div class="anketa-progress" aria-live="polite">
                <div class="anketa-progress__bar" aria-hidden="true"><span id="anketaProgressBar"></span></div>
                <div id="anketaProgressLabel">Шаг 1 из 3</div>
              </div>
            </div>
          </div>

          <div class="anketa-modal__header-actions">
            <button class="anketa-link" type="button" data-anketa-action="clear">Очистить ответы</button>
            <button class="anketa-modal__close" type="button" data-anketa-action="close" aria-label="Закрыть">✕</button>
          </div>
        </div>

        <form class="anketa-form" id="anketaForm" novalidate>
          <div class="anketa-body" id="anketaBody">
            ${buildSteps()}
          </div>

          <div class="anketa-nav">
            <button class="btn btn--ghost" type="button" data-anketa-action="back">Назад</button>
            <button class="btn btn--primary" type="button" data-anketa-action="next">Далее</button>
          </div>
        </form>
      </div>
    `;

    return wrap;
  }

  function buildSteps() {
    return `
      <!-- STEP 1 -->
      <section class="anketa-step is-active" data-step="0" aria-labelledby="anketaStep0">
        <h3 id="anketaStep0">Контакты и семья</h3>
        <p class="anketa-hint">Коротко, в свободной форме.</p>

        <div class="anketa-grid">
          <label class="anketa-field">
            <span class="anketa-label">Ваше имя<span class="anketa-req">*</span></span>
            <input class="anketa-input" type="text" name="contact_name" autocomplete="name" required>
          </label>

          <label class="anketa-field">
            <span class="anketa-label">Контакт (телефон или Telegram)<span class="anketa-req">*</span></span>
            <input class="anketa-input" type="text" name="contact_value" placeholder="+7… или @username" required>
          </label>
        </div>

        <label class="anketa-field">
          <span class="anketa-label">Состав семьи (кто живёт постоянно / временно)</span>
          <textarea class="anketa-textarea" name="family_composition" placeholder="Например: 2 взрослых, 1 ребёнок, иногда бабушка."></textarea>
        </label>
      </section>

      <!-- STEP 2 -->
      <section class="anketa-step" data-step="1" aria-labelledby="anketaStep1">
        <h3 id="anketaStep1">Кухня и спальни</h3>
        <p class="anketa-hint">Можно кратко, тезисами.</p>

        <div class="anketa-block">
          <div class="anketa-block__title">Кухня</div>
          <textarea class="anketa-textarea" name="kitchen_requirements" placeholder="Что обязательно / чего нельзя, газ или электричество, готовите ли, хранение."></textarea>
        </div>

        <div class="anketa-block">
          <div class="anketa-block__title">Спальня</div>
          <textarea class="anketa-textarea" name="bedroom_requirements" placeholder="Размер спального места, тумбочки, макияжный столик, рабочее место."></textarea>
        </div>

        <div class="anketa-block">
          <div class="anketa-block__title">Детские</div>
          <textarea class="anketa-textarea" name="children_requirements" placeholder="Размеры кровати, увлечения, спорт/балет, хранение экипировки."></textarea>
        </div>
      </section>

      <!-- STEP 3 -->
      <section class="anketa-step" data-step="2" aria-labelledby="anketaStep2">
        <h3 id="anketaStep2">Гостиная, санузлы, прихожая</h3>
        <p class="anketa-hint">Укажите только то, что важно.</p>

        <div class="anketa-block">
          <div class="anketa-block__title">Гостиная</div>
          <textarea class="anketa-textarea" name="living_requirements" placeholder="TV или проектор, настольные игры, библиотека."></textarea>
        </div>

        <div class="anketa-block">
          <div class="anketa-block__title">Санузлы</div>
          <textarea class="anketa-textarea" name="bathroom_requirements" placeholder="Душ или ванна, 1 или 2 санузла, хранение, стиралка."></textarea>
        </div>

        <div class="anketa-block">
          <div class="anketa-block__title">Хранение и уборка</div>
          <textarea class="anketa-textarea" name="storage_requirements" placeholder="Шкаф для уборки, место для стиралки/сушки, кладовая."></textarea>
        </div>

        <div class="anketa-block">
          <div class="anketa-block__title">Прихожая</div>
          <textarea class="anketa-textarea" name="hallway_requirements" placeholder="Обувь, верхняя одежда, сумки и аксессуары."></textarea>
        </div>

        <label class="anketa-field">
          <span class="anketa-label">Дополнительные комментарии</span>
          <textarea class="anketa-textarea" name="additional_comments" placeholder="Любые важные привычки и пожелания."></textarea>
        </label>

        <div class="anketa-divider"></div>

        <label class="anketa-check" style="margin-top:10px;">
          <input type="checkbox" name="privacy_accept" required>
          <span>
            Я согласен(на) с <a href="#" id="anketaPrivacyLink" target="_blank" rel="noopener">Политикой конфиденциальности</a>
          </span>
        </label>
      </section>

      <!-- STEP SUCCESS (internal) -->
      <section class="anketa-step" data-step="success" aria-labelledby="anketaStepSuccess">
        <div class="anketa-success">
          <div class="anketa-success__title" id="anketaStepSuccess">Анкета отправлена</div>
          <p class="anketa-success__text" id="anketaSuccessText"></p>

          <div class="anketa-success__box" id="anketaSuccessBox" hidden></div>

          <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:12px;">
            <button type="button" class="btn btn--ghost" data-anketa-action="copy-json" id="anketaCopyBtn" hidden>Скопировать данные</button>
            <button type="button" class="btn btn--primary" data-anketa-action="close">Закрыть</button>
          </div>
        </div>
      </section>
    `;
  }

  // ---- Modal logic ----
  const state = {
    isOpen: false,
    activeStep: 0,
    totalSteps: 3,
    kv: {},
    submitUrl: "",
    lastPayload: null,
    lastActiveEl: null
  };

  function ensureModal() {
    let modal = document.getElementById("anketaModal");
    if (modal) return modal;

    modal = buildModalShell();
    document.body.appendChild(modal);

    bindModal(modal);

    return modal;
  }

  function bindModal(modal) {
    const form = $("#anketaForm", modal);
    const body = $("#anketaBody", modal);

    // Delegated actions
    modal.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-anketa-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-anketa-action");
      if (!action) return;

      if (action === "close") {
        e.preventDefault();
        closeModal();
      }

      if (action === "back") {
        e.preventDefault();
        goBack();
      }

      if (action === "next") {
        e.preventDefault();
        goNext();
      }

      if (action === "clear") {
        e.preventDefault();
        clearDraft(true);
      }

      if (action === "toggle-points") {
        e.preventDefault();
        togglePoints(modal);
      }

      if (action === "copy-json") {
        e.preventDefault();
        copyLastPayload();
      }
    });

    // Close by clicking backdrop
    const backdrop = $(".anketa-modal__backdrop", modal);
    if (backdrop) {
      backdrop.addEventListener("click", () => closeModal());
    }

    // Esc to close + focus trap
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
        return;
      }
      if (e.key === "Tab") {
        trapFocus(e, modal);
      }
    });

    // Auto-save draft
    const scheduleSave = debounce(() => {
      saveDraft(getFormValues(form), state.activeStep);
    }, 250);

    form.addEventListener("input", scheduleSave);
    form.addEventListener("change", scheduleSave);

  }

  function togglePoints(modal) {
    const box = $("#anketaPoints", modal);
    if (!box) return;

    const btn = modal.querySelector('[data-anketa-action="toggle-points"]');
    const collapsed = box.classList.contains("is-collapsed");

    if (collapsed) {
      box.classList.remove("is-collapsed");
      if (btn) btn.textContent = "Скрыть пункты";
    } else {
      box.classList.add("is-collapsed");
      if (btn) btn.textContent = "Показать все пункты";
      box.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }


  function getCheckedValues(form, name) {
    const els = Array.from(form.elements || [])
      .filter(el => el && el.name === name && el.type === "checkbox" && !el.disabled);
    return els.filter(el => el.checked).map(el => el.value);
  }

  function updateKitchenOtherVisibility(modal) {
    const form = $("#anketaForm", modal);
    if (!form) return;
    const selected = getCheckedValues(form, "kitchen_zone");
    const show = selected.includes("other");
    const wrap = modal.querySelector('[data-anketa-other-wrap="kitchen_zone_other_text"]');
    if (!wrap) return;
    wrap.hidden = !show;
  }

  function trapFocus(e, modal) {
    if (!state.isOpen) return;

    const focusables = getFocusable(modal);
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    const isShift = e.shiftKey;

    if (!isShift && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
    if (isShift && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  }

  function getFocusable(root) {
    return $$(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      root
    ).filter(el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }

  function openModal(triggerEl) {
    const modal = ensureModal();
    state.lastActiveEl = triggerEl || document.activeElement;

    modal.hidden = false;
    document.body.classList.add("anketa-lock");
    state.isOpen = true;

    // load KV (async) — обновим submitUrl/ссылку на политику
    applyKVToModal(modal);

    // restore draft if exists
    restoreDraft(modal);

    setStep(state.activeStep, modal);

    // focus first field
    const focusables = getFocusable(modal);
    if (focusables.length) focusables[0].focus();
  }

  function closeModal() {
    const modal = document.getElementById("anketaModal");
    if (!modal) return;

    modal.hidden = true;
    document.body.classList.remove("anketa-lock");
    state.isOpen = false;

    // restore focus
    if (state.lastActiveEl && typeof state.lastActiveEl.focus === "function") {
      try { state.lastActiveEl.focus(); } catch (_) {}
    }
  }

  function setStep(stepIndex, modal) {
    const form = $("#anketaForm", modal);
    const steps = $$(".anketa-step", modal);

    // special success step
    if (stepIndex === "success") {
      steps.forEach(s => s.classList.remove("is-active"));
      const success = steps.find(s => s.getAttribute("data-step") === "success");
      if (success) success.classList.add("is-active");
      // hide nav on success
      const nav = $(".anketa-nav", modal);
      if (nav) nav.hidden = true;
      updateProgressUI(modal, state.totalSteps, state.totalSteps);
      return;
    }

    const idx = clamp(Number(stepIndex) || 0, 0, state.totalSteps - 1);
    state.activeStep = idx;

    steps.forEach(s => s.classList.remove("is-active"));
    const current = steps.find(s => String(s.getAttribute("data-step")) === String(idx));
    if (current) current.classList.add("is-active");

    // show nav
    const nav = $(".anketa-nav", modal);
    if (nav) nav.hidden = false;

    // update buttons
    const backBtn = modal.querySelector('[data-anketa-action="back"]');
    const nextBtn = modal.querySelector('[data-anketa-action="next"]');

    if (backBtn) backBtn.textContent = (idx === 0) ? "Закрыть" : "Назад";
    if (nextBtn) nextBtn.textContent = (idx === state.totalSteps - 1) ? "Отправить" : "Далее";

    updateProgressUI(modal, idx + 1, state.totalSteps);

    // save current step to draft
    const formVals = form ? getFormValues(form) : {};
    saveDraft(formVals, idx);
  }

  function updateProgressUI(modal, current, total) {
    const label = $("#anketaProgressLabel", modal);
    const bar = $("#anketaProgressBar", modal);
    if (label) label.textContent = `Шаг ${current} из ${total}`;
    if (bar) bar.style.width = `${clamp(Math.round((current / total) * 100), 0, 100)}%`;
  }

  function goBack() {
    const modal = document.getElementById("anketaModal");
    if (!modal) return;

    if (state.activeStep === 0) {
      closeModal();
      return;
    }
    setStep(state.activeStep - 1, modal);
  }

  function goNext() {
    const modal = document.getElementById("anketaModal");
    if (!modal) return;

    const form = $("#anketaForm", modal);
    if (!form) return;

    // last step => submit
    if (state.activeStep === state.totalSteps - 1) {
      submit(form, modal);
      return;
    }

    // validate current step only
    const ok = validateCurrentStep(form, modal, state.activeStep);
    if (!ok) return;

    setStep(state.activeStep + 1, modal);
  }

  function validateCurrentStep(form, modal, stepIdx) {
    const step = modal.querySelector(`.anketa-step[data-step="${stepIdx}"]`);
    if (!step) return true;

    const fields = $$("input, textarea, select", step).filter(el => !el.disabled);
    for (const f of fields) {
      // Skip hidden optional fields
      if (f.closest("[hidden]")) continue;

      if (typeof f.checkValidity === "function" && !f.checkValidity()) {
        if (typeof f.reportValidity === "function") f.reportValidity();
        return false;
      }
    }
    return true;
  }

  // ---- Draft storage ----
  function getFormValues(form) {
    const map = {};
    const byName = new Map();

    // Group elements by name
    Array.from(form.elements || []).forEach(el => {
      if (!el.name || el.disabled) return;
      if (!byName.has(el.name)) byName.set(el.name, []);
      byName.get(el.name).push(el);
    });

    byName.forEach((els, name) => {
      const first = els[0];
      if (!first) return;

      if (first.type === "checkbox") {
        if (els.length === 1) {
          map[name] = !!first.checked;
        } else {
          map[name] = els.filter(x => x.checked).map(x => x.value);
        }
        return;
      }

      if (first.type === "radio") {
        const checked = els.find(x => x.checked);
        map[name] = checked ? checked.value : "";
        return;
      }

      // default
      map[name] = String(first.value ?? "");
    });

    return map;
  }

  function applyFormValues(form, values) {
    if (!values || typeof values !== "object") return;

    Object.keys(values).forEach((name) => {
      const els = Array.from(form.elements).filter(el => el.name === name);
      if (!els.length) return;

      const v = values[name];

      const first = els[0];

      if (first.type === "checkbox") {
        if (els.length === 1) {
          first.checked = !!v;
        } else {
          const arr = Array.isArray(v) ? v : [];
          els.forEach(el => { el.checked = arr.includes(el.value); });
        }
        return;
      }

      if (first.type === "radio") {
        const val = String(v ?? "");
        els.forEach(el => { el.checked = (el.value === val); });
        return;
      }

      first.value = String(v ?? "");
    });
  }

  function saveDraft(values, stepIdx) {
    const payload = {
      __v: 1,
      __step: stepIdx,
      __saved_at: nowIso(),
      values: values || {}
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      // ignore
    }
  }

  function loadDraftRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return safeParseJson(raw);
    } catch {
      return null;
    }
  }

  function restoreDraft(modal) {
    const form = $("#anketaForm", modal);
    if (!form) return;

    const raw = loadDraftRaw();
    if (!raw || !raw.values) {
      state.activeStep = 0;
      return;
    }

    applyFormValues(form, raw.values);

    const step = (raw.__step !== undefined) ? Number(raw.__step) : 0;
    state.activeStep = clamp(Number.isFinite(step) ? step : 0, 0, state.totalSteps - 1);
  }

  function clearDraft(resetForm) {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}

    const modal = document.getElementById("anketaModal");
    if (!modal) return;

    const form = $("#anketaForm", modal);
    if (!form) return;

    if (resetForm) {
      form.reset();
      state.activeStep = 0;
      setStep(0, modal);
    }
  }

  // ---- Submission ----
  function buildPayload(formValues) {
    return {
      form_version: FORM_VERSION,
      submitted_at: nowIso(),

      contact: {
        name: String(formValues.contact_name ?? "").trim(),
        contact: String(formValues.contact_value ?? "").trim()
      },

      family: {
        composition: String(formValues.family_composition ?? "").trim()
      },

      rooms: {
        kitchen: String(formValues.kitchen_requirements ?? "").trim(),
        bedroom: String(formValues.bedroom_requirements ?? "").trim(),
        children: String(formValues.children_requirements ?? "").trim(),
        living: String(formValues.living_requirements ?? "").trim(),
        hallway: String(formValues.hallway_requirements ?? "").trim()
      },

      bathrooms: {
        requirements: String(formValues.bathroom_requirements ?? "").trim()
      },

      storage: {
        requirements: String(formValues.storage_requirements ?? "").trim()
      },

      comments: {
        additional: String(formValues.additional_comments ?? "").trim()
      },

      consent: {
        privacy_accept: !!formValues.privacy_accept
      },

      meta: {
        page_url: (typeof location !== "undefined") ? location.href : "",
        user_agent: (typeof navigator !== "undefined") ? navigator.userAgent : ""
      }
    };
  }

  async function submit(form, modal) {
    const ok = validateCurrentStep(form, modal, state.activeStep);
    if (!ok) return;

    // Ensure required fields (name/email/consent) are present
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const values = getFormValues(form);
    const payload = buildPayload(values);
    state.lastPayload = payload;

    const submitUrl = String(state.submitUrl || "").trim();

    // UI: disable buttons while sending
    const nextBtn = modal.querySelector('[data-anketa-action="next"]');
    const backBtn = modal.querySelector('[data-anketa-action="back"]');
    if (nextBtn) nextBtn.disabled = true;
    if (backBtn) backBtn.disabled = true;

    let mode = "no-endpoint";
    let errorText = "";

    try {
      if (submitUrl) {
        mode = "sent";
        const res = await fetch(submitUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          mode = "error";
          errorText = `Ошибка отправки: HTTP ${res.status}`;
        }
      }
    } catch (e) {
      mode = "error";
      errorText = "Ошибка отправки. Проверьте адрес webhook и CORS.";
    } finally {
      if (nextBtn) nextBtn.disabled = false;
      if (backBtn) backBtn.disabled = false;
    }

    showSuccess(modal, mode, errorText);
    // if successfully sent, clear draft
    if (mode === "sent") {
      clearDraft(false);
    }
  }

  function showSuccess(modal, mode, errorText) {
    const text = $("#anketaSuccessText", modal);
    const box = $("#anketaSuccessBox", modal);
    const copyBtn = $("#anketaCopyBtn", modal);

    if (text) {
      if (mode === "sent") {
        text.textContent = "Спасибо! Ваша анкета отправлена.";
      } else if (mode === "error") {
        text.textContent = errorText || "Ошибка отправки.";
      } else {
        text.textContent = "Пока не настроен адрес отправки (n8n). Ниже — данные анкеты, их можно скопировать.";
      }
    }

    const showBox = (mode !== "sent");
    if (box) {
      box.hidden = !showBox;
      if (showBox) {
        box.textContent = JSON.stringify(state.lastPayload || {}, null, 2);
      }
    }

    if (copyBtn) copyBtn.hidden = !showBox;

    setStep("success", modal);
  }

  async function copyLastPayload() {
    const payload = state.lastPayload || {};
    const str = JSON.stringify(payload, null, 2);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(str);
        alert("Скопировано");
        return;
      }
    } catch (_) {}

    // fallback
    try {
      const ta = document.createElement("textarea");
      ta.value = str;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      alert("Скопировано");
    } catch (_) {
      alert("Не удалось скопировать. Можно выделить текст вручную.");
    }
  }

  // ---- KV => modal settings ----
  async function applyKVToModal(modal) {
    // Lazy-load once per session
    if (!state.kv || !Object.keys(state.kv).length) {
      state.kv = await loadSiteKV();
    }

    // submit URL (for n8n)
    state.submitUrl = String(state.kv.anketa_submit_url || "").trim();

    // privacy url
    const privacyUrl = String(state.kv.privacy_url || "").trim();
    const a = $("#anketaPrivacyLink", modal);
    if (a && privacyUrl) a.href = privacyUrl;
  }

  // ---- Open triggers ----
  function bindOpenTriggers() {
    // Click on any link to #anketa
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (!a) return;
      const href = (a.getAttribute("href") || "").trim();
      if (href !== OPEN_HASH) return;

      e.preventDefault();
      openModal(a);
    });

    // Optional: any element with data-anketa-open
    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-anketa-open]");
      if (!t) return;
      e.preventDefault();
      openModal(t);
    });

    // Deep-link: if URL already ends with #anketa
    if (typeof location !== "undefined" && location.hash === OPEN_HASH) {
      openModal(document.querySelector(`a[href="${OPEN_HASH}"]`) || null);
      // remove hash so it doesn't reopen on refresh/scroll
      try { history.replaceState(null, "", location.pathname + location.search); } catch (_) {}
    }
  }

  // ---- debounce ----
  function debounce(fn, delay) {
    let t = null;
    return function (...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ---- Init ----
  async function init() {
    ensureModal();
    bindOpenTriggers();

    // Preload KV quietly (cache hit if app.js already loaded it)
    state.kv = await loadSiteKV();
    state.submitUrl = String(state.kv.anketa_submit_url || "").trim();
  }

  if (isReady()) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
