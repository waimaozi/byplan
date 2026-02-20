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
  SHEET_ID: "1Sb3_veKvtCsc-gkx4dgeLr3H-UFV9wkv1I_Z-05Ngro",

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
    cases: 20,
    reviews: 20,
    faq: 20,
    contacts: 10
  }
};
