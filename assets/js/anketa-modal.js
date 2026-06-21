/* ============================================================
   BYPLAN — anketa-modal.js (v3)
   Module: Анкета (модальное окно + пошаговая форма)
   ============================================================ */

(function () {
  "use strict";

  const OPEN_HASH = "#anketa";
  const STORAGE_KEY = "byplan_anketa_draft_v3";
  const FORM_VERSION = "byplan-anketa-v3";
  const DEFAULT_SUBMIT_URL = "https://n8n2.waimaozi.com/webhook/byplan-zayavka-mira";

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

  function nowIso() {
    try { return new Date().toISOString(); } catch { return ""; }
  }

  function safeParseJson(str) {
    try { return JSON.parse(str); } catch { return null; }
  }

  function isReady() {
    return document.readyState === "complete" || document.readyState === "interactive";
  }

  // ---- KV from Google Sheets ----
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

  // ---- Checkbox group builder ----
  function checkboxGroup(section, groupId, items, isRadio) {
    const type = isRadio ? "radio" : "checkbox";
    const name = `${section}_${groupId}`;
    return items.map(item => {
      const id = `${name}_${item.value}`;
      const isOther = item.value === "other";
      const otherInputName = isOther ? `${name}_other_text` : null;
      return `
        <div class="anketa-check">
          <input type="${type}" id="${escAttr(id)}" name="${escAttr(name)}" value="${escAttr(item.value)}"${isRadio && item.default ? " checked" : ""}>
          <label for="${escAttr(id)}">${escAttr(item.label)}</label>
        </div>
        ${isOther ? `<input type="text" class="anketa-other-input" name="${escAttr(otherInputName)}" placeholder="">` : ""}
      `;
    }).join("");
  }

  function group(title, html) {
    return `<div class="anketa-block"><div class="anketa-block__title">${title}</div><div class="anketa-checkboxes">${html}</div></div>`;
  }

  function textInput(name, label, placeholder) {
    return `<label class="anketa-field"><span class="anketa-label">${label}</span><input class="anketa-input" type="text" name="${escAttr(name)}" placeholder="${escAttr(placeholder || "")}"></label>`;
  }

  function textareaInput(name, label) {
    return `<label class="anketa-field"><span class="anketa-label">${label}</span><textarea class="anketa-textarea" name="${escAttr(name)}" rows="3"></textarea></label>`;
  }

  // ---- buildSteps ----
  function buildSteps() {
    return `
      <!-- STEP 0: Контакты и семья -->
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

      <!-- STEP 1: Спальня -->
      <section class="anketa-step" data-step="1" aria-labelledby="anketaStep1">
        <h3 id="anketaStep1">Спальня</h3>

        ${group("Спальное место",
          checkboxGroup("bedroom", "bed_size", [
            {value:"140x200", label:"Кровать 140×200 см"},
            {value:"160x200", label:"Кровать 160×200 см"},
            {value:"180x200", label:"Кровать 180×200 см"},
            {value:"200x200", label:"Кровать 200×200 см"},
            {value:"other", label:"Другой размер: __________"}
          ], true)
        )}

        ${group("Прикроватная зона",
          checkboxGroup("bedroom", "nightstand", [
            {value:"two", label:"2 прикроватные тумбочки"},
            {value:"one", label:"1 прикроватная тумбочка"},
            {value:"none", label:"Без прикроватных тумбочек"},
            {value:"shelves", label:"Подвесные полки вместо тумбочек"}
          ], true)
        )}

        ${group("Хранение одежды",
          checkboxGroup("bedroom", "wardrobe", [
            {value:"up_to_180", label:"Шкаф до 180 см"},
            {value:"180_240", label:"Шкаф 180–240 см"},
            {value:"over_240", label:"Шкаф более 240 см"},
            {value:"corner", label:"Угловой шкаф"},
            {value:"dressing_room", label:"Гардеробная комната"},
            {value:"dresser", label:"Комод"},
            {value:"tall_cabinet", label:"Высокий пенал"},
            {value:"under_bed", label:"Дополнительное хранение под кроватью"}
          ], false)
        )}

        ${group("Рабочая зона",
          checkboxGroup("bedroom", "work_zone", [
            {value:"desk", label:"Рабочий стол"},
            {value:"computer", label:"Компьютер"},
            {value:"printer", label:"Принтер"},
            {value:"bookcase", label:"Книжный шкаф/стеллаж"}
          ], false)
        )}

        ${group("Зона ухода за собой",
          checkboxGroup("bedroom", "vanity_zone", [
            {value:"vanity_table", label:"Туалетный столик"},
            {value:"full_mirror", label:"Большое зеркало в полный рост"},
            {value:"mirror_light", label:"Зеркало с подсветкой"},
            {value:"cosmetics_storage", label:"Место для хранения косметики"}
          ], false)
        )}

        ${group("Зона отдыха",
          checkboxGroup("bedroom", "relax_zone", [
            {value:"tv", label:"Телевизор"},
            {value:"projector", label:"Проектор"},
            {value:"armchair", label:"Кресло"},
            {value:"pouf", label:"Пуф"},
            {value:"bench", label:"Банкетка у кровати"},
            {value:"small_sofa", label:"Небольшой диван"}
          ], false)
        )}

        ${group("Дополнительные пожелания",
          checkboxGroup("bedroom", "extras", [
            {value:"baby_crib", label:"Детская кроватка в спальне родителей"},
            {value:"pet_bed", label:"Лежанка для питомца"},
            {value:"safe", label:"Домашний сейф"},
            {value:"fireplace", label:"Камин (электрический)"},
            {value:"music", label:"Музыкальная система"},
            {value:"sports", label:"Спортивный уголок"},
            {value:"other", label:"Другое: __________"}
          ], false)
        )}

        ${textareaInput("bedroom_must_fit", "Что обязательно должно поместиться?")}
        ${textareaInput("bedroom_must_not", "Что категорически не нужно?")}

        ${group("Какие действия вы чаще всего выполняете в спальне?",
          checkboxGroup("bedroom", "activities", [
            {value:"sleep_only", label:"Только сон"},
            {value:"computer_work", label:"Работа за компьютером"},
            {value:"tv", label:"Просмотр ТВ"},
            {value:"reading", label:"Чтение"},
            {value:"grooming", label:"Уход за собой/макияж"},
            {value:"wardrobe_main", label:"Хранение основной части гардероба"},
            {value:"other", label:"Другое: __________"}
          ], false)
        )}
      </section>

      <!-- STEP 2: Кухня -->
      <section class="anketa-step" data-step="2" aria-labelledby="anketaStep2">
        <h3 id="anketaStep2">Кухня</h3>

        ${group("Формат кухни",
          checkboxGroup("kitchen", "layout", [
            {value:"linear", label:"Линейная"},
            {value:"corner", label:"Угловая (Г-образная)"},
            {value:"u_shape", label:"П-образная"},
            {value:"island", label:"С островом"},
            {value:"peninsula", label:"С полуостровом"},
            {value:"kitchen_living", label:"Кухня-гостиная"},
            {value:"separate", label:"Отдельная кухня"}
          ], false)
        )}

        <div class="anketa-block"><div class="anketa-block__title">Варочная зона</div>
          ${group("Варочная поверхность",
            checkboxGroup("kitchen", "hob", [
              {value:"2", label:"2 конфорки"},
              {value:"3", label:"3 конфорки"},
              {value:"4", label:"4 конфорки"},
              {value:"5plus", label:"5 конфорок и более"}
            ], false)
          )}
          <div class="anketa-block"><div class="anketa-block__title">Духовой шкаф и микроволновая печь</div>
            ${group("Духовой шкаф",
              checkboxGroup("kitchen", "oven", [
                {value:"none", label:"Не нужен"},
                {value:"under_hob", label:"Под варочной поверхностью"},
                {value:"column", label:"В колонне"}
              ], true)
            )}
            ${group("Микроволновая печь",
              checkboxGroup("kitchen", "microwave", [
                {value:"none", label:"Не нужна"},
                {value:"countertop", label:"На столешнице"},
                {value:"upper_cabinet", label:"Встроенная в верхний ряд шкафов"},
                {value:"column", label:"Встроенная в колонне"}
              ], false)
            )}
          </div>
        </div>

        <div class="anketa-block"><div class="anketa-block__title">Холодильное оборудование</div>
          ${group("Холодильник",
            checkboxGroup("kitchen", "fridge", [
              {value:"freestanding_60", label:"Отдельностоящий 60 см"},
              {value:"builtin_60", label:"Встроенный 60 см"},
              {value:"wide_70_90", label:"Широкий холодильник 70–90 см"},
              {value:"side_by_side", label:"Side-by-Side"},
              {value:"separate_freezer", label:"Отдельный холодильник и морозильник"}
            ], false)
          )}
          ${group("Морозильная камера",
            checkboxGroup("kitchen", "freezer", [
              {value:"none", label:"Не нужна"},
              {value:"in_fridge", label:"В составе холодильника"},
              {value:"separate", label:"Отдельная морозильная камера"}
            ], false)
          )}
        </div>

        <div class="anketa-block"><div class="anketa-block__title">Моечная зона</div>
          ${group("Мойка",
            checkboxGroup("kitchen", "sink", [
              {value:"single", label:"Одна чаша"},
              {value:"half_double", label:"Полуторная чаша"},
              {value:"double", label:"Две чаши"}
            ], false)
          )}
          ${group("Посудомоечная машина",
            checkboxGroup("kitchen", "dishwasher", [
              {value:"none", label:"Не нужна"},
              {value:"45", label:"45 см"},
              {value:"60", label:"60 см"}
            ], false)
          )}
          ${group("Дополнительно",
            checkboxGroup("kitchen", "sink_extras", [
              {value:"waste_disposal", label:"Измельчитель отходов"},
              {value:"water_filter", label:"Фильтр для питьевой воды"}
            ], false)
          )}
        </div>

        <div class="anketa-block"><div class="anketa-block__title">Хранение</div>
          ${group("Продукты",
            checkboxGroup("kitchen", "food_storage", [
              {value:"pantry", label:"Нужна кладовая"},
              {value:"tall_cabinet", label:"Высокий хозяйственный шкаф"},
              {value:"bulk_staples", label:"Большой запас бакалеи"},
              {value:"cleaning_storage", label:"Хранение бытовой химии"}
            ], false)
          )}
          ${group("Посуда",
            checkboxGroup("kitchen", "dishes_storage", [
              {value:"everyday", label:"Повседневный комплект"},
              {value:"festive", label:"Праздничный сервиз"},
              {value:"glasses", label:"Коллекция бокалов"},
              {value:"pots_pans", label:"Большое количество кастрюль и сковород"}
            ], false)
          )}
          ${group("Мелкая техника, которую необходимо хранить",
            checkboxGroup("kitchen", "small_appliances_storage", [
              {value:"coffee_machine", label:"Кофемашина"},
              {value:"coffee_grinder", label:"Кофемолка"},
              {value:"kettle", label:"Чайник"},
              {value:"toaster", label:"Тостер"},
              {value:"blender", label:"Блендер"},
              {value:"mixer", label:"Планетарный миксер"},
              {value:"multicooker", label:"Мультиварка"},
              {value:"juicer", label:"Соковыжималка"},
              {value:"air_fryer", label:"Аэрогриль"},
              {value:"other", label:"Другое: ___________________"}
            ], false)
          )}
          ${group("Какая техника будет постоянно стоять на столешнице?",
            checkboxGroup("kitchen", "countertop_appliances", [
              {value:"coffee_machine", label:"Кофемашина"},
              {value:"kettle", label:"Чайник"},
              {value:"toaster", label:"Тостер"},
              {value:"mixer", label:"Планетарный миксер"},
              {value:"blender", label:"Блендер"},
              {value:"other", label:"Другое: ___________________"}
            ], false)
          )}
        </div>

        <div class="anketa-block"><div class="anketa-block__title">Обеденная зона</div>
          ${group("Количество человек, проживающих в квартире",
            checkboxGroup("kitchen", "residents_count", [
              {value:"1_2", label:"1–2 человека"},
              {value:"3_4", label:"3–4 человека"},
              {value:"5_6", label:"5–6 человек"},
              {value:"6plus", label:"Более 6 человек"}
            ], false)
          )}
          ${group("Стол",
            checkboxGroup("kitchen", "dining_table", [
              {value:"round", label:"Круглый"},
              {value:"oval", label:"Овальный"},
              {value:"rectangular", label:"Прямоугольный"},
              {value:"extendable", label:"Раздвижной"},
              {value:"bar_counter", label:"Барная стойка вместо стола"}
            ], false)
          )}
          ${group("Количество посадочных мест ежедневно",
            checkboxGroup("kitchen", "daily_seats", [
              {value:"2", label:"2"},
              {value:"4", label:"4"},
              {value:"6", label:"6"},
              {value:"8plus", label:"8 и более"}
            ], false)
          )}
          ${group("Максимальное количество гостей",
            checkboxGroup("kitchen", "max_guests", [
              {value:"up_to_4", label:"До 4 человек"},
              {value:"up_to_8", label:"До 8 человек"},
              {value:"up_to_12", label:"До 12 человек"},
              {value:"12plus", label:"Более 12 человек"}
            ], false)
          )}
          ${group("Дополнительные пожелания",
            checkboxGroup("kitchen", "dining_extras", [
              {value:"tv", label:"Телевизор"},
              {value:"wine_cabinet", label:"Винный шкаф"},
              {value:"sofa", label:"Диван"},
              {value:"workplace", label:"Рабочее место"},
              {value:"pet_feeding", label:"Место для кормления питомца"},
              {value:"high_chair", label:"Детский стульчик"}
            ], false)
          )}
        </div>

        <div class="anketa-block"><div class="anketa-block__title">Привычки использования кухни</div>
          ${group("Как часто вы готовите?",
            checkboxGroup("kitchen", "cooking_freq", [
              {value:"rarely", label:"Практически не готовлю"},
              {value:"1_2_week", label:"1–2 раза в неделю"},
              {value:"daily", label:"Каждый день"},
              {value:"multiple_daily", label:"Несколько раз в день"}
            ], false)
          )}
          ${group("Что для вас важнее?",
            checkboxGroup("kitchen", "priority", [
              {value:"max_storage", label:"Максимум хранения"},
              {value:"work_surface", label:"Большая рабочая поверхность"},
              {value:"dining_zone", label:"Просторная обеденная зона"},
              {value:"compact", label:"Максимально компактная кухня"},
              {value:"pro_appliances", label:"Профессиональная техника"}
            ], false)
          )}
        </div>

        ${textareaInput("kitchen_must_fit", "Обязательно должно поместиться")}
        ${textareaInput("kitchen_must_not", "Чего категорически не должно быть")}
        ${textareaInput("kitchen_comments", "Дополнительные комментарии и пожелания")}
      </section>

      <!-- STEP 3: Детская -->
      <section class="anketa-step" data-step="3" aria-labelledby="anketaStep3">
        <h3 id="anketaStep3">Детская комната</h3>

        <div class="anketa-block">
          <div class="anketa-block__title">Сколько детских комнат планируется?</div>
          <div class="anketa-checkboxes">
            <div class="anketa-check">
              <input type="radio" id="children_room_none" name="children_room_count" value="none" checked>
              <label for="children_room_none">Нет детской</label>
            </div>
            <div class="anketa-check">
              <input type="radio" id="children_room_1" name="children_room_count" value="1">
              <label for="children_room_1">1 ребенок</label>
            </div>
            <div class="anketa-check">
              <input type="radio" id="children_room_2" name="children_room_count" value="2">
              <label for="children_room_2">2 ребенка</label>
            </div>
          </div>
        </div>

        <div id="childrenNone">
          <p class="anketa-hint">Детская не планируется.</p>
        </div>

        <div id="childrenGroup1" style="display:none;">
          <h4>ДЕТСКАЯ КОМНАТА (1 РЕБЕНОК)</h4>

          ${textInput("child1_age", "Возраст ребенка", "")}

          ${group("Спальное место",
            checkboxGroup("child1", "bed", [
              {value:"80x160", label:"Кровать 80×160 см"},
              {value:"90x200", label:"Кровать 90×200 см"},
              {value:"120x200", label:"Кровать 120×200 см"},
              {value:"loft", label:"Кровать-чердак"},
              {value:"sofa_bed", label:"Диван-кровать"},
              {value:"other", label:"Другой вариант: ___________________"}
            ], false)
          )}

          ${group("Рабочая зона",
            checkboxGroup("child1", "work_zone", [
              {value:"none", label:"Не требуется"},
              {value:"one", label:"Требуется 1 рабочее место"}
            ], false)
          )}

          ${group("Хранение одежды",
            checkboxGroup("child1", "wardrobe", [
              {value:"up_to_120", label:"Шкаф до 120 см"},
              {value:"120_180", label:"Шкаф 120–180 см"},
              {value:"over_180", label:"Шкаф более 180 см"},
              {value:"dressing_room", label:"Гардеробная"}
            ], false)
          )}

          ${group("Дополнительное хранение",
            checkboxGroup("child1", "extra_storage", [
              {value:"dresser", label:"Комод"},
              {value:"shelving", label:"Стеллаж"},
              {value:"toys", label:"Хранение игрушек"},
              {value:"sports", label:"Хранение спортивного инвентаря"},
              {value:"collections", label:"Хранение коллекций/хобби"}
            ], false)
          )}

          ${group("Дополнительные функции комнаты",
            checkboxGroup("child1", "room_functions", [
              {value:"sports_corner", label:"Спортивный уголок"},
              {value:"music", label:"Музыкальный инструмент"},
              {value:"creative", label:"Творческая зона (рисование, лепка и т.д.)"},
              {value:"guest_bed", label:"Дополнительное спальное место для гостей"}
            ], false)
          )}

          ${textareaInput("child1_must_fit", "Что обязательно должно поместиться?")}

          <h5>Вопросы планировщика</h5>

          ${group("Пол ребенка",
            checkboxGroup("child1", "gender", [
              {value:"boy", label:"Мальчик"},
              {value:"girl", label:"Девочка"}
            ], true)
          )}

          ${group("Нужна ли возможность трансформации комнаты через 3–5 лет?",
            checkboxGroup("child1", "transform", [
              {value:"yes", label:"Да"},
              {value:"no", label:"Нет"}
            ], true)
          )}

          ${group("Что важнее?",
            checkboxGroup("child1", "priority", [
              {value:"play", label:"Больше места для игр"},
              {value:"storage", label:"Больше хранения"},
              {value:"open", label:"Больше свободного пространства"},
              {value:"work", label:"Больше рабочих мест"}
            ], false)
          )}
        </div>

        <div id="childrenGroup2" style="display:none;">
          <h4>ДЕТСКАЯ КОМНАТА (2 РЕБЕНКА)</h4>

          ${textInput("child1_age_2", "Возраст ребенка №1", "")}
          ${textInput("child2_age", "Возраст ребенка №2", "")}

          ${group("Спальные места",
            checkboxGroup("child2", "beds", [
              {value:"two_80x160", label:"Две кровати 80×160 см"},
              {value:"two_90x200", label:"Две кровати 90×200 см"},
              {value:"two_120x200", label:"Две кровати 120×200 см"},
              {value:"bunk", label:"Двухъярусная кровать"},
              {value:"loft_plus", label:"Кровать-чердак + кровать"},
              {value:"other", label:"Другой вариант: ___________________"}
            ], false)
          )}

          ${group("Рабочая зона",
            checkboxGroup("child2", "work_zone", [
              {value:"none", label:"Не требуется"},
              {value:"one", label:"1 рабочее место"},
              {value:"two", label:"2 рабочих места"},
              {value:"shared", label:"Один общий стол на двоих"}
            ], false)
          )}

          ${group("Хранение одежды",
            checkboxGroup("child2", "wardrobe", [
              {value:"shared", label:"Один общий шкаф"},
              {value:"separate", label:"Два отдельных шкафа"},
              {value:"dressing_room", label:"Гардеробная"}
            ], false)
          )}

          ${group("Дополнительное хранение",
            checkboxGroup("child2", "extra_storage", [
              {value:"shared_dresser", label:"Общий комод"},
              {value:"separate_storage", label:"Отдельное хранение для каждого ребенка"},
              {value:"toys", label:"Хранение игрушек"},
              {value:"sports", label:"Хранение спортивного инвентаря"},
              {value:"collections", label:"Хранение коллекций/хобби"}
            ], false)
          )}

          ${group("Дополнительные функции комнаты",
            checkboxGroup("child2", "room_functions", [
              {value:"sports_corner", label:"Спортивный уголок"},
              {value:"music", label:"Музыкальный инструмент"},
              {value:"creative", label:"Творческая зона"},
              {value:"guest_bed", label:"Дополнительное спальное место для гостей"}
            ], false)
          )}

          ${group("Планируется ли разделение детей по разным комнатам в будущем?",
            checkboxGroup("child2", "separate_future", [
              {value:"yes", label:"Да"},
              {value:"no", label:"Нет"},
              {value:"undecided", label:"Пока не решили"}
            ], false)
          )}

          ${textareaInput("child2_must_fit", "Что обязательно должно поместиться?")}

          <h5>Вопросы планировщика</h5>

          ${group("Пол ребенка №1",
            checkboxGroup("child1", "gender", [
              {value:"boy", label:"Мальчик"},
              {value:"girl", label:"Девочка"}
            ], true)
          )}

          ${group("Пол ребенка №2",
            checkboxGroup("child2", "gender", [
              {value:"boy", label:"Мальчик"},
              {value:"girl", label:"Девочка"}
            ], true)
          )}

          ${group("Нужна ли возможность трансформации комнаты через 3–5 лет?",
            checkboxGroup("child2", "transform", [
              {value:"yes", label:"Да"},
              {value:"no", label:"Нет"}
            ], true)
          )}

          ${group("Что важнее?",
            checkboxGroup("child2", "priority", [
              {value:"play", label:"Больше места для игр"},
              {value:"storage", label:"Больше хранения"},
              {value:"open", label:"Больше свободного пространства"},
              {value:"work", label:"Больше рабочих мест"}
            ], false)
          )}
        </div>
      </section>

      <!-- STEP 4: Ванная -->
      <section class="anketa-step" data-step="4" aria-labelledby="anketaStep4">
        <h3 id="anketaStep4">Ванная комната</h3>

        ${group("Пользователи ванной комнаты",
          checkboxGroup("bathroom", "users", [
            {value:"adults", label:"Взрослые"},
            {value:"adults_children", label:"Взрослые и дети"},
            {value:"children_only", label:"Только дети"},
            {value:"guest", label:"Гостевой санузел"}
          ], false)
        )}

        ${group("Душ или ванна",
          checkboxGroup("bathroom", "shower_bath", [
            {value:"shower_only", label:"Только душевая"},
            {value:"bath_only", label:"Только ванна"},
            {value:"both", label:"И ванна, и душевая"}
          ], true)
        )}

        ${group("Размер ванны",
          checkboxGroup("bathroom", "bath_size", [
            {value:"up_to_170", label:"До 170 см"},
            {value:"170_180", label:"170–180 см"},
            {value:"over_180", label:"Более 180 см"}
          ], false)
        )}

        ${group("Душевая",
          checkboxGroup("bathroom", "shower_type", [
            {value:"builtin", label:"В строительном исполнении"},
            {value:"tray", label:"Душевой поддон"},
            {value:"large_100", label:"Размер более 100×100 см"}
          ], false)
        )}

        ${group("Умывальник",
          checkboxGroup("bathroom", "sink_count", [
            {value:"one", label:"Один умывальник"},
            {value:"two", label:"Два умывальника"}
          ], true)
        )}

        ${group("Унитаз",
          checkboxGroup("bathroom", "toilet", [
            {value:"wall_hung", label:"Подвесной"},
            {value:"floor", label:"Напольный"}
          ], false)
        )}

        ${group("Биде",
          checkboxGroup("bathroom", "bidet", [
            {value:"none", label:"Не требуется"},
            {value:"bidet", label:"Биде"},
            {value:"hygienic_shower", label:"Гигиенический душ"}
          ], false)
        )}

        ${group("Хранение",
          checkboxGroup("bathroom", "storage", [
            {value:"vanity", label:"Тумба под раковиной"},
            {value:"tall_cabinet", label:"Пенал"},
            {value:"household_cabinet", label:"Хозяйственный шкаф"},
            {value:"cleaning_products", label:"Хранение бытовой химии"},
            {value:"towels", label:"Хранение полотенец"}
          ], false)
        )}

        ${group("Стиральная зона",
          checkboxGroup("bathroom", "laundry", [
            {value:"washer", label:"Стиральная машина"},
            {value:"dryer", label:"Сушильная машина"},
            {value:"stacked", label:"Стиральная и сушильная машины в колонне"},
            {value:"side_by_side", label:"Стиральная и сушильная машины рядом"}
          ], false)
        )}

        ${group("Дополнительные функции",
          checkboxGroup("bathroom", "extras", [
            {value:"laundry_basket", label:"Место для хранения корзины для белья"},
            {value:"ladder", label:"Место для хранения стремянки"},
            {value:"vacuum", label:"Место для хранения пылесоса"},
            {value:"robot_vacuum", label:"Место для хранения робота-пылесоса"}
          ], false)
        )}

        ${textareaInput("bathroom_must_fit", "Что обязательно должно поместиться?")}
        ${textareaInput("bathroom_must_not", "Чего категорически не должно быть?")}

        ${group("Если это мастер-ванная при спальне",
          checkboxGroup("bathroom", "master_bath", [
            {value:"from_bedroom", label:"Вход из спальни"},
            {value:"from_dressing", label:"Вход через гардеробную"},
            {value:"connected", label:"Ванная и гардеробная должны быть связаны"}
          ], false)
        )}
      </section>

      <!-- STEP 5: Прихожая -->
      <section class="anketa-step" data-step="5" aria-labelledby="anketaStep5">
        <h3 id="anketaStep5">Прихожая</h3>

        <div class="anketa-block"><div class="anketa-block__title">Верхняя одежда</div>
          ${group("Постоянно проживает:",
            checkboxGroup("hallway", "residents", [
              {value:"1_2", label:"1–2 человека"},
              {value:"3_4", label:"3–4 человека"},
              {value:"5plus", label:"5 и более человек"}
            ], false)
          )}
          ${group("Необходимо хранение:",
            checkboxGroup("hallway", "outerwear_storage", [
              {value:"everyday", label:"Повседневной верхней одежды"},
              {value:"seasonal", label:"Сезонной верхней одежды"},
              {value:"guest", label:"Гостевой верхней одежды"}
            ], false)
          )}
        </div>

        <div class="anketa-block"><div class="anketa-block__title">Обувь</div>
          ${group("Необходимо хранение:",
            checkboxGroup("hallway", "shoes_storage", [
              {value:"everyday", label:"Повседневной обуви"},
              {value:"seasonal", label:"Сезонной обуви"},
              {value:"many", label:"Большого количества обуви"}
            ], false)
          )}
        </div>

        ${group("Шкаф в прихожей",
          checkboxGroup("hallway", "wardrobe_size", [
            {value:"none", label:"Не требуется"},
            {value:"up_to_120", label:"До 120 см"},
            {value:"120_240", label:"120–240 см"},
            {value:"over_240", label:"Более 240 см"},
            {value:"dressing_room", label:"Отдельная гардеробная при входе"}
          ], true)
        )}

        ${group("Хранение крупногабаритных вещей",
          checkboxGroup("hallway", "bulky_storage", [
            {value:"suitcases", label:"Чемоданы"},
            {value:"stroller", label:"Детская коляска"},
            {value:"scooter", label:"Самокат"},
            {value:"bicycle", label:"Велосипед"},
            {value:"e_scooter", label:"Электросамокат"},
            {value:"sled", label:"Санки"},
            {value:"ski", label:"Лыжи/сноуборд"}
          ], false)
        )}

        ${group("Спорт и хобби",
          checkboxGroup("hallway", "sports_hobby", [
            {value:"football", label:"Футбольная форма и инвентарь"},
            {value:"hockey", label:"Хоккейная экипировка"},
            {value:"tennis", label:"Теннисное оборудование"},
            {value:"golf", label:"Гольф"},
            {value:"dance", label:"Танцевальная форма"},
            {value:"music", label:"Музыкальные инструменты"},
            {value:"other", label:"Другое: ___________________"}
          ], false)
        )}

        ${group("Домашние животные",
          checkboxGroup("hallway", "pets", [
            {value:"none", label:"Не требуется хранение"},
            {value:"food", label:"Корм"},
            {value:"accessories", label:"Аксессуары"},
            {value:"paw_wash", label:"Место для мытья лап"},
            {value:"pet_bed", label:"Лежанка"},
            {value:"carrier", label:"Переноска"}
          ], false)
        )}

        ${group("Хозяйственное хранение",
          checkboxGroup("hallway", "household", [
            {value:"vacuum", label:"Пылесос"},
            {value:"robot_vacuum", label:"Робот-пылесос и станция"},
            {value:"ladder", label:"Стремянка"},
            {value:"ironing_board", label:"Гладильная доска"},
            {value:"cleaning_products", label:"Бытовая химия"},
            {value:"tools", label:"Инструменты"}
          ], false)
        )}

        ${group("Дополнительные пожелания",
          checkboxGroup("hallway", "extras", [
            {value:"bench", label:"Банкетка"},
            {value:"full_mirror", label:"Зеркало в полный рост"},
            {value:"dirty_zone", label:"Отдельная грязная зона"},
            {value:"closed_wardrobe", label:"Закрытая гардеробная"},
            {value:"open_hallway", label:"Открытая прихожая"}
          ], false)
        )}

        ${textareaInput("hallway_must_fit", "Что обязательно должно поместиться?")}
        ${textareaInput("hallway_extra_storage", "Что чаще всего хранится в прихожей помимо одежды и обуви?")}
      </section>

      <!-- STEP 6: Гостиная -->
      <section class="anketa-step" data-step="6" aria-labelledby="anketaStep6">
        <h3 id="anketaStep6">Гостиная</h3>

        ${group("Основное назначение гостиной",
          checkboxGroup("living", "purpose", [
            {value:"family", label:"Семейный отдых"},
            {value:"guests", label:"Прием гостей"},
            {value:"movies", label:"Просмотр фильмов"},
            {value:"games", label:"Игровая зона"},
            {value:"reading", label:"Чтение"},
            {value:"work", label:"Работа из дома"},
            {value:"universal", label:"Универсальное пространство"}
          ], false)
        )}

        <div class="anketa-block"><div class="anketa-block__title">Диванная зона</div>
          ${group("Количество посадочных мест:",
            checkboxGroup("living", "seating_count", [
              {value:"2_3", label:"2–3 человека"},
              {value:"4_5", label:"4–5 человек"},
              {value:"6plus", label:"6 и более человек"}
            ], false)
          )}
          ${group("Дополнительно:",
            checkboxGroup("living", "seating_extras", [
              {value:"corner_sofa", label:"Угловой диван"},
              {value:"u_shape_sofa", label:"П-образный диван"},
              {value:"two_sofas", label:"Два дивана"},
              {value:"armchair", label:"Кресло"},
              {value:"two_armchairs", label:"Два кресла"}
            ], false)
          )}
        </div>

        ${group("Телевизионная зона",
          checkboxGroup("living", "tv_zone", [
            {value:"tv", label:"Телевизор"},
            {value:"projector", label:"Проектор"},
            {value:"none", label:"Не требуется"}
          ], false)
        )}

        ${group("Обеденная зона в гостиной",
          checkboxGroup("living", "dining", [
            {value:"none", label:"Не требуется"},
            {value:"4_seats", label:"Стол на 4 человека"},
            {value:"6_seats", label:"Стол на 6 человек"},
            {value:"8_seats", label:"Стол на 8 человек"},
            {value:"10plus_seats", label:"Стол на 10 и более человек"}
          ], false)
        )}

        ${group("Дополнительные функции",
          checkboxGroup("living", "extras", [
            {value:"workplace", label:"Рабочее место"},
            {value:"library", label:"Библиотека"},
            {value:"kids_zone", label:"Игровая зона для детей"},
            {value:"music", label:"Музыкальный инструмент"},
            {value:"collections", label:"Коллекции (книги, искусство, модели и т.д.)"},
            {value:"home_cinema", label:"Домашний кинотеатр"}
          ], false)
        )}

        <div class="anketa-block"><div class="anketa-block__title">Хранение</div>
          ${group("Необходимо хранение:",
            checkboxGroup("living", "storage", [
              {value:"books", label:"Книг"},
              {value:"documents", label:"Документов"},
              {value:"board_games", label:"Настольных игр"},
              {value:"collections", label:"Коллекций"},
              {value:"kids_toys", label:"Детских игрушек"},
              {value:"textiles", label:"Текстиля (пледы, подушки и т.д.)"}
            ], false)
          )}
        </div>

        ${group("Дополнительные спальные места",
          checkboxGroup("living", "extra_beds", [
            {value:"none", label:"Не требуются"},
            {value:"sofa_bed", label:"Диван-кровать"},
            {value:"guest_bed", label:"Отдельное гостевое спальное место"}
          ], false)
        )}

        ${textareaInput("living_must_fit", "Что обязательно должно поместиться?")}
        ${textareaInput("living_must_not", "Что категорически не нужно?")}
      </section>

      <!-- STEP 7: Хранение -->
      <section class="anketa-step" data-step="7" aria-labelledby="anketaStep7">
        <h3 id="anketaStep7">Система хранения</h3>

        ${group("Количество постоянно проживающих",
          checkboxGroup("storage", "residents", [
            {value:"1", label:"1 человек"},
            {value:"2", label:"2 человека"},
            {value:"3", label:"3 человека"},
            {value:"4", label:"4 человека"},
            {value:"5plus", label:"5 и более человек"}
          ], false)
        )}

        ${group("Общая потребность в хранении",
          checkboxGroup("storage", "need_level", [
            {value:"minimal", label:"Минимальная"},
            {value:"standard", label:"Стандартная"},
            {value:"high", label:"Повышенная"},
            {value:"maximum", label:"Максимально возможный объем хранения"}
          ], false)
        )}

        <div class="anketa-block"><div class="anketa-block__title">Необходимо хранение</div>
          ${group("Одежда и обувь",
            checkboxGroup("storage", "clothing", [
              {value:"everyday", label:"Повседневная одежда"},
              {value:"seasonal", label:"Сезонная одежда"},
              {value:"outerwear", label:"Верхняя одежда"},
              {value:"shoes", label:"Обувь"},
              {value:"many_shoes", label:"Большое количество обуви"}
            ], false)
          )}
          ${group("Чемоданы и дорожные принадлежности",
            checkboxGroup("storage", "luggage", [
              {value:"1_2", label:"1–2 чемодана"},
              {value:"3_4", label:"3–4 чемодана"},
              {value:"4plus", label:"Более 4 чемоданов"}
            ], false)
          )}
          ${group("Спорт и активный отдых",
            checkboxGroup("storage", "sports", [
              {value:"bikes", label:"Велосипеды"},
              {value:"scooters", label:"Самокаты"},
              {value:"e_scooters", label:"Электросамокаты"},
              {value:"skis", label:"Лыжи"},
              {value:"snowboards", label:"Сноуборды"},
              {value:"hockey", label:"Хоккейная экипировка"},
              {value:"football", label:"Футбольная форма и инвентарь"},
              {value:"tennis", label:"Теннисное оборудование"},
              {value:"gym", label:"Тренажеры"},
              {value:"other", label:"Другое: ___________________"}
            ], false)
          )}
          ${group("Детские вещи",
            checkboxGroup("storage", "kids_stuff", [
              {value:"toys", label:"Игрушки"},
              {value:"stroller", label:"Коляска"},
              {value:"kids_transport", label:"Детский транспорт"},
              {value:"grow_clothes", label:"Одежда «на вырост»"},
              {value:"school", label:"Школьные принадлежности"}
            ], false)
          )}
          ${group("Домашние животные",
            checkboxGroup("storage", "pets", [
              {value:"food", label:"Корм"},
              {value:"carriers", label:"Переноски"},
              {value:"accessories", label:"Аксессуары"},
              {value:"beds", label:"Лежанки"}
            ], false)
          )}
          ${group("Хозяйственные вещи",
            checkboxGroup("storage", "household", [
              {value:"vacuum", label:"Пылесос"},
              {value:"robot_vacuum", label:"Робот-пылесос"},
              {value:"ladder", label:"Стремянка"},
              {value:"ironing_board", label:"Гладильная доска"},
              {value:"drying_rack", label:"Сушилка для белья"},
              {value:"cleaning_products", label:"Бытовая химия"},
              {value:"tools", label:"Инструменты"},
              {value:"supplies", label:"Запасы бытовых товаров"}
            ], false)
          )}
          ${group("Хобби и увлечения",
            checkboxGroup("storage", "hobbies", [
              {value:"books", label:"Книги"},
              {value:"crafts", label:"Материалы для творчества"},
              {value:"music", label:"Музыкальные инструменты"},
              {value:"photo", label:"Фотооборудование"},
              {value:"collections", label:"Коллекции"},
              {value:"other", label:"Другое: ___________________"}
            ], false)
          )}
        </div>

        ${group("Предпочтительный формат хранения",
          checkboxGroup("storage", "format", [
            {value:"entrance_dressing", label:"Гардеробная при входе"},
            {value:"bedroom_dressing", label:"Гардеробная при спальне"},
            {value:"separate_room", label:"Отдельная гардеробная комната"},
            {value:"builtin_wardrobes", label:"Встроенные шкафы"},
            {value:"combo", label:"Комбинация гардеробных и шкафов"},
            {value:"consult", label:"Не знаю, нужна консультация"}
          ], false)
        )}

        ${group("Дополнительные пожелания",
          checkboxGroup("storage", "extras", [
            {value:"to_ceiling", label:"Хранение до потолка"},
            {value:"hidden", label:"Максимально скрытые системы хранения"},
            {value:"utility_cabinet", label:"Отдельный хозяйственный шкаф"},
            {value:"pantry", label:"Отдельная кладовая"}
          ], false)
        )}

        ${textareaInput("storage_must_store", "Что обязательно должно храниться в квартире?")}
      </section>

      <!-- STEP 8: Балкон + конфиденциальность -->
      <section class="anketa-step" data-step="8" aria-labelledby="anketaStep8">
        <h3 id="anketaStep8">Балкон / Лоджия</h3>

        ${group("Планируется ли использование балкона?",
          checkboxGroup("balcony", "use", [
            {value:"no", label:"Нет, достаточно места для технического обслуживания окон"},
            {value:"yes", label:"Да"}
          ], true)
        )}

        ${group("Основное назначение",
          checkboxGroup("balcony", "purpose", [
            {value:"relax", label:"Зона отдыха"},
            {value:"office", label:"Кабинет"},
            {value:"storage", label:"Дополнительное хранение"},
            {value:"sports", label:"Спортивная зона"},
            {value:"creative", label:"Творческая мастерская"},
            {value:"plants", label:"Зона для растений"},
            {value:"combo", label:"Комбинированное использование"}
          ], false)
        )}

        <div class="anketa-block"><div class="anketa-block__title">Хранение на балконе</div>
          ${group("Необходимо хранение:",
            checkboxGroup("balcony", "storage", [
              {value:"suitcases", label:"Чемоданов"},
              {value:"seasonal", label:"Сезонных вещей"},
              {value:"bikes", label:"Велосипедов"},
              {value:"scooters", label:"Самокатов"},
              {value:"kids_transport", label:"Детского транспорта"},
              {value:"sports", label:"Спортивного инвентаря"},
              {value:"tools", label:"Инструментов"},
              {value:"household", label:"Хозяйственных принадлежностей"},
              {value:"other", label:"Другое: ___________________"}
            ], false)
          )}
        </div>

        ${group("Рабочая зона",
          checkboxGroup("balcony", "work_zone", [
            {value:"none", label:"Не требуется"},
            {value:"one", label:"Одно рабочее место"}
          ], false)
        )}

        ${group("Зона отдыха",
          checkboxGroup("balcony", "relax_zone", [
            {value:"armchair", label:"Кресло"},
            {value:"small_sofa", label:"Небольшой диван"},
            {value:"dining_group", label:"Обеденная группа"},
            {value:"coffee_table", label:"Кофейный столик"}
          ], false)
        )}

        ${group("Растения",
          checkboxGroup("balcony", "plants", [
            {value:"none", label:"Не требуются"},
            {value:"few", label:"Небольшое количество растений"},
            {value:"many", label:"Много растений"},
            {value:"mini_garden", label:"Домашний мини-сад"}
          ], false)
        )}

        ${group("Спорт и хобби",
          checkboxGroup("balcony", "sports_hobby", [
            {value:"gym", label:"Тренажер"},
            {value:"yoga", label:"Йога / растяжка"},
            {value:"creative", label:"Творческая мастерская"},
            {value:"music", label:"Музыкальные занятия"},
            {value:"other", label:"Другое: ___________________"}
          ], false)
        )}

        ${group("Утепление",
          checkboxGroup("balcony", "insulation", [
            {value:"none", label:"Не требуется"},
            {value:"yes", label:"Требуется утепление"},
            {value:"unknown", label:"Не знаю"}
          ], false)
        )}

        ${textareaInput("balcony_must_fit", "Что обязательно должно разместиться на балконе?")}
        ${textareaInput("balcony_must_not", "Что категорически не планируется размещать на балконе?")}

        <div class="anketa-divider"></div>

        <label class="anketa-check" style="margin-top:10px;">
          <input type="checkbox" name="privacy_accept" required>
          <span>
            Я согласен(на) с <a href="#" id="anketaPrivacyLink" target="_blank" rel="noopener">Политикой конфиденциальности</a>
          </span>
        </label>
      </section>

      <!-- STEP SUCCESS -->
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

  // ---- buildPayload ----
  function buildPayload(form) {
    const vals = getFormValues(form);

    function checked(name) {
      const els = Array.from(form.elements).filter(el => el.name === name && el.type === "checkbox");
      return els.filter(el => el.checked).map(el => el.value);
    }

    function radio(name) {
      const els = Array.from(form.elements).filter(el => el.name === name && el.type === "radio");
      const found = els.find(el => el.checked);
      return found ? found.value : "";
    }

    function txt(name) {
      return String(vals[name] || "").trim();
    }

    function otherText(name) {
      return String(vals[name + "_other_text"] || "").trim();
    }

    function sectionCheckboxes(section, groups) {
      const result = {};
      groups.forEach(g => {
        const key = `${section}_${g}`;
        result[g] = checked(key);
        const ot = txt(key + "_other_text");
        if (ot) result[g + "_other"] = ot;
      });
      return result;
    }

    function sectionOpenText(fields) {
      const result = {};
      fields.forEach(f => {
        const v = txt(f.name);
        if (v) result[f.key] = v;
      });
      return result;
    }

    const roomCount = radio("children_room_count") || "none";
    let childrenSection = { room_count: roomCount };

    if (roomCount === "1") {
      childrenSection.child1 = {
        age: txt("child1_age"),
        checkboxes: {
          bed: checked("child1_bed"),
          work_zone: checked("child1_work_zone"),
          wardrobe: checked("child1_wardrobe"),
          extra_storage: checked("child1_extra_storage"),
          room_functions: checked("child1_room_functions"),
          gender: checked("child1_gender"),
          transform: checked("child1_transform"),
          priority: checked("child1_priority")
        },
        open_text: { must_fit: txt("child1_must_fit") }
      };
    } else if (roomCount === "2") {
      childrenSection.child1 = {
        age: txt("child1_age_2"),
        checkboxes: {
          gender: checked("child1_gender"),
        }
      };
      childrenSection.child2 = {
        age: txt("child2_age"),
        checkboxes: {
          beds: checked("child2_beds"),
          work_zone: checked("child2_work_zone"),
          wardrobe: checked("child2_wardrobe"),
          extra_storage: checked("child2_extra_storage"),
          room_functions: checked("child2_room_functions"),
          separate_future: checked("child2_separate_future"),
          gender: checked("child2_gender"),
          transform: checked("child2_transform"),
          priority: checked("child2_priority")
        },
        open_text: { must_fit: txt("child2_must_fit") }
      };
    }

    return {
      form_version: FORM_VERSION,
      submitted_at: nowIso(),

      contact: {
        name: txt("contact_name"),
        contact: txt("contact_value"),
        family_composition: txt("family_composition")
      },

      sections: {
        bedroom: {
          checkboxes: sectionCheckboxes("bedroom", ["bed_size","nightstand","wardrobe","work_zone","vanity_zone","relax_zone","extras","activities"]),
          open_text: {
            must_fit: txt("bedroom_must_fit"),
            must_not: txt("bedroom_must_not")
          }
        },
        kitchen: {
          checkboxes: sectionCheckboxes("kitchen", ["layout","hob","oven","microwave","fridge","freezer","sink","dishwasher","sink_extras","food_storage","dishes_storage","small_appliances_storage","countertop_appliances","residents_count","dining_table","daily_seats","max_guests","dining_extras","cooking_freq","priority"]),
          open_text: {
            must_fit: txt("kitchen_must_fit"),
            must_not: txt("kitchen_must_not"),
            comments: txt("kitchen_comments")
          }
        },
        children: childrenSection,
        bathroom: {
          checkboxes: sectionCheckboxes("bathroom", ["users","shower_bath","bath_size","shower_type","sink_count","toilet","bidet","storage","laundry","extras","master_bath"]),
          open_text: {
            must_fit: txt("bathroom_must_fit"),
            must_not: txt("bathroom_must_not")
          }
        },
        hallway: {
          checkboxes: sectionCheckboxes("hallway", ["residents","outerwear_storage","shoes_storage","wardrobe_size","bulky_storage","sports_hobby","pets","household","extras"]),
          open_text: {
            must_fit: txt("hallway_must_fit"),
            extra_storage: txt("hallway_extra_storage")
          }
        },
        living: {
          checkboxes: sectionCheckboxes("living", ["purpose","seating_count","seating_extras","tv_zone","dining","extras","storage","extra_beds"]),
          open_text: {
            must_fit: txt("living_must_fit"),
            must_not: txt("living_must_not")
          }
        },
        storage: {
          checkboxes: sectionCheckboxes("storage", ["residents","need_level","clothing","luggage","sports","kids_stuff","pets","household","hobbies","format","extras"]),
          open_text: {
            must_store: txt("storage_must_store")
          }
        },
        balcony: {
          checkboxes: sectionCheckboxes("balcony", ["use","purpose","storage","work_zone","relax_zone","plants","sports_hobby","insulation"]),
          open_text: {
            must_fit: txt("balcony_must_fit"),
            must_not: txt("balcony_must_not")
          }
        }
      },

      consent: {
        privacy_accept: !!vals.privacy_accept
      },

      meta: {
        page_url: (typeof location !== "undefined") ? location.href : "",
        user_agent: (typeof navigator !== "undefined") ? navigator.userAgent : ""
      }
    };
  }

  // ---- Modal HTML builder ----
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
                <div id="anketaProgressLabel">Шаг 1 из 9</div>
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

  // ---- Modal logic ----
  const state = {
    isOpen: false,
    activeStep: 0,
    totalSteps: 9,
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

    // Delegated actions
    modal.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-anketa-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-anketa-action");
      if (!action) return;

      if (action === "close") { e.preventDefault(); closeModal(); }
      if (action === "back") { e.preventDefault(); goBack(); }
      if (action === "next") { e.preventDefault(); goNext(); }
      if (action === "clear") { e.preventDefault(); clearDraft(true); }
      if (action === "copy-json") { e.preventDefault(); copyLastPayload(); }
      if (action === "download-pdf") { e.preventDefault(); downloadReportPDF(modal, btn); }
    });

    // Close by clicking backdrop
    const backdrop = $(".anketa-modal__backdrop", modal);
    if (backdrop) {
      backdrop.addEventListener("click", () => closeModal());
    }

    // Esc to close + focus trap
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); closeModal(); return; }
      if (e.key === "Tab") { trapFocus(e, modal); }
    });

    // Children radio toggle
    modal.addEventListener("change", (e) => {
      if (e.target.name === "children_room_count") {
        updateChildrenVisibility(modal, e.target.value);
      }
      // Other checkbox reveals text input
      if (e.target.type === "checkbox" && e.target.value === "other") {
        const next = e.target.closest(".anketa-check") && e.target.closest(".anketa-check").nextElementSibling;
        if (next && next.classList.contains("anketa-other-input")) {
          next.classList.toggle("is-visible", e.target.checked);
        }
      }
    });

    // Auto-save draft
    const scheduleSave = debounce(() => {
      saveDraft(getFormValues(form), state.activeStep);
    }, 250);

    form.addEventListener("input", scheduleSave);
    form.addEventListener("change", scheduleSave);
  }

  function updateChildrenVisibility(modal, value) {
    const none = $("#childrenNone", modal);
    const g1 = $("#childrenGroup1", modal);
    const g2 = $("#childrenGroup2", modal);

    if (none) none.style.display = (value === "none") ? "" : "none";
    if (g1) g1.style.display = (value === "1") ? "" : "none";
    if (g2) g2.style.display = (value === "2") ? "" : "none";
  }

  function trapFocus(e, modal) {
    if (!state.isOpen) return;

    const focusables = getFocusable(modal);
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const isShift = e.shiftKey;

    if (!isShift && document.activeElement === last) { e.preventDefault(); first.focus(); }
    if (isShift && document.activeElement === first) { e.preventDefault(); last.focus(); }
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

    applyKVToModal(modal);
    restoreDraft(modal);
    setStep(state.activeStep, modal);

    const focusables = getFocusable(modal);
    if (focusables.length) focusables[0].focus();
  }

  function closeModal() {
    const modal = document.getElementById("anketaModal");
    if (!modal) return;

    modal.hidden = true;
    document.body.classList.remove("anketa-lock");
    state.isOpen = false;

    if (state.lastActiveEl && typeof state.lastActiveEl.focus === "function") {
      try { state.lastActiveEl.focus(); } catch (_) {}
    }
  }

  function setStep(stepIndex, modal) {
    const form = $("#anketaForm", modal);
    const steps = $$(".anketa-step", modal);

    if (stepIndex === "success") {
      steps.forEach(s => s.classList.remove("is-active"));
      const success = steps.find(s => s.getAttribute("data-step") === "success");
      if (success) success.classList.add("is-active");
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

    const nav = $(".anketa-nav", modal);
    if (nav) nav.hidden = false;

    const backBtn = modal.querySelector('[data-anketa-action="back"]');
    const nextBtn = modal.querySelector('[data-anketa-action="next"]');

    if (backBtn) backBtn.textContent = (idx === 0) ? "Закрыть" : "Назад";
    if (nextBtn) nextBtn.textContent = (idx === state.totalSteps - 1) ? "Отправить" : "Далее";

    updateProgressUI(modal, idx + 1, state.totalSteps);

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

    if (state.activeStep === 0) { closeModal(); return; }
    setStep(state.activeStep - 1, modal);
  }

  function goNext() {
    const modal = document.getElementById("anketaModal");
    if (!modal) return;

    const form = $("#anketaForm", modal);
    if (!form) return;

    if (state.activeStep === state.totalSteps - 1) {
      submit(form, modal);
      return;
    }

    const ok = validateCurrentStep(form, modal, state.activeStep);
    if (!ok) return;

    setStep(state.activeStep + 1, modal);
  }

  function validateCurrentStep(form, modal, stepIdx) {
    const step = modal.querySelector(`.anketa-step[data-step="${stepIdx}"]`);
    if (!step) return true;

    const fields = $$("input, textarea, select", step).filter(el => !el.disabled);
    for (const f of fields) {
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
    } catch (e) {}
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

    // Restore children visibility based on draft value
    const childrenCount = raw.values.children_room_count || "none";
    updateChildrenVisibility(modal, childrenCount);

    // Restore "other" input visibility
    Array.from(form.elements).forEach(el => {
      if (el.type === "checkbox" && el.value === "other" && el.checked) {
        const next = el.closest(".anketa-check") && el.closest(".anketa-check").nextElementSibling;
        if (next && next.classList.contains("anketa-other-input")) {
          next.classList.add("is-visible");
        }
      }
    });

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
      updateChildrenVisibility(modal, "none");
    }
  }

  // ---- Submission ----
  async function submit(form, modal) {
    const ok = validateCurrentStep(form, modal, state.activeStep);
    if (!ok) return;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const payload = buildPayload(form);
    // Attach the human-readable Q&A report (same source the PDF uses) so n8n/email
    // can render real answers without re-deriving labels from machine-keyed sections.
    payload.report = collectReport(modal);
    state.lastPayload = payload;

    const submitUrl = String(state.submitUrl || "").trim();

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
    if (mode === "sent") { clearDraft(false); }
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

    const showJsonBox = (mode !== "sent");
    if (box) {
      box.hidden = !showJsonBox;
      if (showJsonBox) { box.textContent = JSON.stringify(state.lastPayload || {}, null, 2); }
    }

    if (copyBtn) {
      copyBtn.hidden = false;
      copyBtn.dataset.anketaAction = (mode === "sent") ? "download-pdf" : "copy-json";
      copyBtn.textContent = (mode === "sent") ? "Скачать PDF с ответами" : "Скопировать данные";
    }

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

  // ---- Human-readable report (for PDF) ----
  function collectReport(modal) {
    const form = $("#anketaForm", modal);
    if (!form) return { sections: [] };

    const sections = [];
    const stepEls = $$(".anketa-step", modal).filter(s => s.getAttribute("data-step") !== "success");

    stepEls.forEach(step => {
      const titleEl = step.querySelector("h3");
      const sectionTitle = titleEl ? titleEl.textContent.trim() : "";
      const items = [];

      // 1) Свободные поля (.anketa-field): input/textarea
      $$(".anketa-field", step).forEach(field => {
        const labelEl = field.querySelector(".anketa-label");
        const input = field.querySelector("input, textarea");
        if (!input || !labelEl) return;
        const val = String(input.value || "").trim();
        if (!val) return;
        items.push({ question: labelEl.textContent.trim(), answers: [val] });
      });

      // 2) Группы чекбоксов/радио (.anketa-block)
      $$(".anketa-block", step).forEach(block => {
        const qTitle = block.querySelector(".anketa-block__title");
        const question = qTitle ? qTitle.textContent.trim() : "";
        const checks = $$(".anketa-check input:checked", block);
        if (!checks.length) return;
        const answers = checks.map(inp => {
          const lab = block.querySelector(`label[for="${inp.id}"]`);
          let txt = lab ? lab.textContent.trim() : inp.value;
          if (inp.value === "other") {
            const otherInput = block.querySelector(`input[name="${inp.name}_other_text"]`);
            const otherVal = otherInput ? String(otherInput.value || "").trim() : "";
            if (otherVal) txt = `${txt.replace(/:\s*_+$/, "")}: ${otherVal}`;
          }
          return txt;
        });
        items.push({ question, answers });
      });

      if (items.length) sections.push({ title: sectionTitle, items });
    });

    return { sections };
  }

  function buildReportHTML(report) {
    const today = new Date().toLocaleDateString("ru-RU");
    // Styles are scoped under .anketa-report so injecting this <style> into the
    // live document during PDF capture does not bleed onto the page.
    const css = `
      .anketa-report { font-family: -apple-system, "Segoe UI", Roboto, "PT Sans", Arial, sans-serif; color: #1a1a1a; padding: 24px; box-sizing: border-box; width: 100%; }
      .anketa-report h1 { font-size: 22px; margin: 0 0 4px; }
      .anketa-report .meta { color: #666; font-size: 12px; margin-bottom: 18px; }
      .anketa-report h2 { font-size: 16px; margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #ddd; color: #444; }
      .anketa-report .q { margin: 8px 0 4px; font-size: 13px; font-weight: 600; }
      .anketa-report .a { margin: 0 0 6px 12px; font-size: 13px; }
      .anketa-report .a li { margin: 2px 0; }
      .anketa-report ul { padding-left: 18px; margin: 0; }
    `;
    const sectionsHtml = report.sections.map(s => {
      const itemsHtml = s.items.map(it => {
        const listHtml = it.answers.length === 1
          ? `<div class="a">${escAttr(it.answers[0])}</div>`
          : `<ul class="a">${it.answers.map(a => `<li>${escAttr(a)}</li>`).join("")}</ul>`;
        return `<div class="q">${escAttr(it.question)}</div>${listHtml}`;
      }).join("");
      return `<h2>${escAttr(s.title)}</h2>${itemsHtml}`;
    }).join("");

    // Return a self-contained fragment (no <html>/<head>/<body>): those tags are
    // stripped when assigned via innerHTML on a <div>, which dropped the styles.
    return `<style>${css}</style>
      <div class="anketa-report">
        <h1>Анкета ByPlan</h1>
        <div class="meta">Заполнено: ${today}</div>
        ${sectionsHtml}
      </div>`;
  }

  function loadHtml2Pdf() {
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    if (state._html2pdfPromise) return state._html2pdfPromise;
    state._html2pdfPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      s.async = true;
      s.onload = () => resolve(window.html2pdf);
      s.onerror = () => reject(new Error("html2pdf load failed"));
      document.head.appendChild(s);
    });
    return state._html2pdfPromise;
  }

  async function downloadReportPDF(modal, btn) {
    const origLabel = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Готовим PDF…"; }
    let wrapper = null;
    try {
      const html2pdf = await loadHtml2Pdf();
      const report = collectReport(modal);
      if (!report.sections.length) { alert("Нет данных для PDF."); return; }

      // Render on-page (top-left) with an explicit width, hidden BEHIND the page
      // via z-index. Do NOT use opacity:0 or left:-10000px — html2canvas captures
      // those as blank, which produced the empty PDF.
      wrapper = document.createElement("div");
      wrapper.style.position = "absolute"; // absolute (not fixed) so tall multi-page reports render in full
      wrapper.style.left = "0";
      wrapper.style.top = "0";
      wrapper.style.width = "794px"; // ~A4 width @96dpi
      wrapper.style.zIndex = "-1";
      wrapper.style.background = "#fff";
      wrapper.innerHTML = buildReportHTML(report);
      document.body.appendChild(wrapper);

      const filename = `byplan-anketa-${new Date().toISOString().slice(0,10)}.pdf`;
      await html2pdf().set({
        margin: [10, 12, 12, 12],
        filename,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#fff", windowWidth: 794, scrollX: 0, scrollY: 0 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] }
      }).from(wrapper).save();
    } catch (e) {
      console.warn("[anketa] PDF failed:", e);
      alert("Не удалось собрать PDF. Попробуйте ещё раз или скопируйте данные.");
    } finally {
      if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
      if (btn) { btn.disabled = false; btn.textContent = origLabel; }
    }
  }

  // ---- KV => modal settings ----
  async function applyKVToModal(modal) {
    if (!state.kv || !Object.keys(state.kv).length) {
      state.kv = await loadSiteKV();
    }

    state.submitUrl = String(state.kv.anketa_submit_url || DEFAULT_SUBMIT_URL || "").trim();

    const privacyUrl = String(state.kv.privacy_url || "").trim();
    const a = $("#anketaPrivacyLink", modal);
    if (a && privacyUrl) a.href = privacyUrl;
  }

  // ---- Open triggers ----
  function bindOpenTriggers() {
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (!a) return;
      const href = (a.getAttribute("href") || "").trim();
      if (href !== OPEN_HASH) return;
      e.preventDefault();
      openModal(a);
    });

    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-anketa-open]");
      if (!t) return;
      e.preventDefault();
      openModal(t);
    });

    if (typeof location !== "undefined" && location.hash === OPEN_HASH) {
      openModal(document.querySelector(`a[href="${OPEN_HASH}"]`) || null);
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

    state.kv = await loadSiteKV();
    state.submitUrl = String(state.kv.anketa_submit_url || DEFAULT_SUBMIT_URL || "").trim();
  }

  if (isReady()) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
