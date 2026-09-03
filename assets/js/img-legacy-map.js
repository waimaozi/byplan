(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ByplanImgPaths = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const MAP = {
    "assets/img/cases/кедрова до и после.jpg": "assets/img/cases/kedrova-do-i-posle.jpg",
    "assets/img/cases/Иван Копыл до и после.jpg": "assets/img/cases/ivan-kopyl-do-i-posle.jpg",
    "assets/img/cases/Ира Гриценко.jpg": "assets/img/cases/ira-gritsenko.jpg",
    "assets/img/cases/Ира Гриценко было.jpg": "assets/img/cases/ira-gritsenko-bylo.jpg",
    "assets/img/cases/Лапиковы до и после.jpg": "assets/img/cases/lapikovy-do-i-posle.jpg",
    "assets/img/cases/Репко до и после.jpg": "assets/img/cases/repko-do-i-posle.jpg",
    "assets/img/cases/Эпп до и после.jpg": "assets/img/cases/epp-do-i-posle.jpg",
    "assets/img/cases/расстановка мебели .jpg": "assets/img/cases/rasstanovka-mebeli.jpg",
    "assets/img/cases/тронь до и после.jpg": "assets/img/cases/tron-do-i-posle.jpg",
    "assets/img/cases/Анна Жандарова до и после.jpg": "assets/img/cases/anna-zhandarova-do-i-posle.jpg",
    "assets/img/cases/Александрова до и после.jpg": "assets/img/cases/aleksandrova-do-i-posle.jpg",
    "assets/img/cases/Дмитрий Белянинов до и после.jpg": "assets/img/cases/dmitriy-belyaninov-do-i-posle.jpg",
    "assets/img/cases/Андрей Владивосток.jpg": "assets/img/cases/andrey-vladivostok.jpg",
    "assets/img/cases/Вика Николаева.jpg": "assets/img/cases/vika-nikolaeva.jpg",
    "assets/img/cases/Кравченко до и после.jpg": "assets/img/cases/kravchenko-do-i-posle.jpg",
    "assets/img/cases/ЖК Сенатор до и после.jpg": "assets/img/cases/zhk-senator-do-i-posle.jpg",
    "assets/img/cases/OxanaS.jpg": "assets/img/cases/oxanas.jpg",
    "assets/img/cases/Krasnogorsk.jpg": "assets/img/cases/krasnogorsk.jpg",
    "assets/img/cases/1 (2).jpg": "assets/img/cases/1-(2).jpg",
    "assets/img/cases/2 (2).jpg": "assets/img/cases/2-(2).jpg",
    "assets/img/cases/3 (1).jpg": "assets/img/cases/3-(1).jpg",
    "assets/img/cases/4 (2).jpg": "assets/img/cases/4-(2).jpg",
    "assets/img/cases/5 (2).jpg": "assets/img/cases/5-(2).jpg",
    "assets/img/cases/6. (1).jpg": "assets/img/cases/6-(1).jpg",
    "assets/img/cases/7 (1).jpg": "assets/img/cases/7-(1).jpg",
    "assets/img/cases/8 (1).jpg": "assets/img/cases/8-(1).jpg"
  };

  function normalize(u) {
    const s = String(u ?? "").trim();
    if (!s) return "";
    if (/^(https?:)?\/\//i.test(s) || /^data:/i.test(s)) return s;
    const clean = s.replace(/^\/+/, "");
    return MAP[clean] || clean;
  }

  return { MAP, normalize };
});
