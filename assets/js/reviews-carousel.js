/**
 * Reviews Carousel (BYPLAN)
 * - превращает список отзывов (#reviewsGrid) в горизонтальную карусель со снапом
 * - добавляет навигацию (prev/next), точки, счетчик
 * - "Читать полностью" открывает модальное окно
 *
 * Работает даже если отзывы подгружаются асинхронно (MutationObserver).
 */
(function () {
  "use strict";

  const ROOT_ID = "reviewsGrid";

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function normalizeText(s) {
    return (s || "").replace(/\r/g, "").trim();
  }

  function extractReviews(container) {
    // 1) уже в формате review-card__*
    const cards = qsa(".review-card", container);
    if (cards.length) {
      return cards.map((card) => ({
        name: normalizeText(qs(".review-card__name", card)?.textContent),
        role: normalizeText(qs(".review-card__role", card)?.textContent),
        text: normalizeText(qs(".review-card__text", card)?.textContent),
      })).filter(r => r.name || r.text);
    }

    // 2) старый формат article.review (из app.js v1)
    const old = qsa("article.review", container);
    if (old.length) {
      return old.map((el) => ({
        name: normalizeText(qs(".review__name", el)?.textContent),
        role: normalizeText(qs(".review__role", el)?.textContent),
        text: normalizeText(qs(".review__text", el)?.textContent),
      })).filter(r => r.name || r.text);
    }

    // 3) fallback: любые прямые дети (плохой, но лучше чем ничего)
    const direct = Array.from(container.children).filter((el) => el.textContent && el.textContent.trim());
    if (direct.length) {
      return direct.map((el) => {
        const lines = normalizeText(el.textContent).split("\n").map(s => s.trim()).filter(Boolean);
        const name = lines[0] || "";
        const role = lines[1] || "";
        const text = lines.slice(2).join("\n");
        return { name, role, text };
      }).filter(r => r.name || r.text);
    }

    return [];
  }

  function ensureModal() {
    let modal = qs("#reviewModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "review-modal";
    modal.id = "reviewModal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Отзыв полностью");

    modal.innerHTML = `
      <div class="review-modal__panel" role="document">
        <button class="review-modal__close" type="button" aria-label="Закрыть">×</button>
        <div class="review-modal__name" id="reviewModalName"></div>
        <div class="review-modal__role" id="reviewModalRole"></div>
        <div class="review-modal__text" id="reviewModalText"></div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = qs(".review-modal__close", modal);
    function close() {
      modal.classList.remove("is-open");
      document.documentElement.classList.remove("modal-open");
      document.body.classList.remove("modal-open");
    }

    closeBtn.addEventListener("click", close);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("is-open")) close();
    });

    // expose close for internal use
    modal.__close = close;
    return modal;
  }

  function openModal(review) {
    const modal = ensureModal();
    qs("#reviewModalName", modal).textContent = review.name || "";
    qs("#reviewModalRole", modal).textContent = review.role || "";
    qs("#reviewModalText", modal).textContent = review.text || "";
    modal.classList.add("is-open");
    document.documentElement.classList.add("modal-open");
    document.body.classList.add("modal-open");
  }

  function buildReviewCard(review) {
    const card = document.createElement("article");
    card.className = "review-card";
    card.setAttribute("tabindex", "-1");

    const meta = document.createElement("div");
    meta.className = "review-card__meta";

    const name = document.createElement("div");
    name.className = "review-card__name";
    name.textContent = review.name || "";

    const role = document.createElement("div");
    role.className = "review-card__role";
    role.textContent = review.role || "";

    meta.appendChild(name);
    if (review.role) meta.appendChild(role);

    const text = document.createElement("div");
    text.className = "review-card__text";
    text.textContent = review.text || "";

    const more = document.createElement("button");
    more.className = "review-card__more";
    more.type = "button";
    more.textContent = "Читать полностью";

    // Показываем кнопку только если текст реально длинный
    const long = (review.text || "").length > 260 || (review.text || "").split("\n").length > 5;
    if (long) {
      text.classList.add("review-card__text--clamp");
      more.addEventListener("click", () => openModal(review));
    } else {
      more.style.display = "none";
    }

    card.appendChild(meta);
    card.appendChild(text);
    card.appendChild(more);

    return card;
  }

  function initCarousel(container) {
    if (!container || container.dataset.carouselReady === "1") return;

    const reviews = extractReviews(container);
    if (!reviews.length) return;

    // Перерисовываем в правильную структуру под CSS (reviews-slider.css)
    container.innerHTML = "";
    container.classList.remove("grid", "reviews");
    container.classList.add("reviews-carousel");
    container.dataset.carouselReady = "1";

    const viewport = document.createElement("div");
    viewport.className = "reviews-carousel__viewport";
    viewport.setAttribute("tabindex", "0");

    const track = document.createElement("div");
    track.className = "reviews-carousel__track";

    const cards = reviews.map(buildReviewCard);
    cards.forEach((c) => track.appendChild(c));
    viewport.appendChild(track);

    const prev = document.createElement("button");
    prev.className = "reviews-carousel__nav reviews-carousel__nav--prev";
    prev.type = "button";
    prev.setAttribute("aria-label", "Предыдущий отзыв");
    prev.textContent = "‹";

    const next = document.createElement("button");
    next.className = "reviews-carousel__nav reviews-carousel__nav--next";
    next.type = "button";
    next.setAttribute("aria-label", "Следующий отзыв");
    next.textContent = "›";

    const dotsWrap = document.createElement("div");
    dotsWrap.className = "reviews-carousel__dots";

    const dots = reviews.map((_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "reviews-carousel__dot";
      b.setAttribute("aria-label", `Показать отзыв ${i + 1}`);
      dotsWrap.appendChild(b);
      return b;
    });

    const count = document.createElement("div");
    count.className = "reviews-carousel__count";

    container.appendChild(prev);
    container.appendChild(next);
    container.appendChild(viewport);
    container.appendChild(dotsWrap);
    container.appendChild(count);

    // --- FIX: allow the LAST review to snap into view (important for odd counts)
    // Without a trailing spacer, the last card cannot align to the left edge,
    // so navigation "stops" at the previous one (e.g. 6/7).
    const tail = document.createElement("div");
    tail.className = "reviews-carousel__tail";
    tail.setAttribute("aria-hidden", "true");
    tail.style.pointerEvents = "none";
    tail.style.flex = "0 0 0px";
    track.appendChild(tail);

    function updateTail() {
      const firstCard = qs(".review-card", track);
      if (!firstCard) return;

      const cs = getComputedStyle(viewport);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const trackW = viewport.clientWidth - padL - padR;
      const cardW = firstCard.getBoundingClientRect().width;

      const extra = Math.max(0, trackW - cardW);
      tail.style.flex = `0 0 ${Math.ceil(extra)}px`;
    }


    // --- поведение ---
    let raf = 0;

    function getIndexByScroll() {
      const x = viewport.scrollLeft;
      const cardEls = qsa(".review-card", track);
      if (!cardEls.length) return 0;

      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < cardEls.length; i++) {
        const dist = Math.abs(cardEls[i].offsetLeft - x);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      return best;
    }

    function scrollToIndex(i) {
      const cardEls = qsa(".review-card", track);
      if (!cardEls.length) return;
      const idx = Math.max(0, Math.min(i, cardEls.length - 1));
      viewport.scrollTo({ left: cardEls[idx].offsetLeft, behavior: "smooth" });
    }

    function updateUI() {
      const idx = getIndexByScroll();
      const total = reviews.length;

      count.textContent = `${idx + 1} / ${total}`;

      dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));

      const atStart = idx <= 0;
      const atEnd = idx >= total - 1;

      prev.classList.toggle("is-disabled", atStart);
      prev.disabled = atStart;

      next.classList.toggle("is-disabled", atEnd);
      next.disabled = atEnd;
    }

    prev.addEventListener("click", () => scrollToIndex(getIndexByScroll() - 1));
    next.addEventListener("click", () => scrollToIndex(getIndexByScroll() + 1));

    dots.forEach((d, i) => d.addEventListener("click", () => scrollToIndex(i)));

    viewport.addEventListener("scroll", () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateUI);
    });

    window.addEventListener("resize", () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { updateTail(); updateUI(); });
    });

    // initial
    updateTail();
    updateUI();
  }

  function bootstrap() {
    const container = document.getElementById(ROOT_ID);
    if (!container) return;

    // пробуем сразу
    initCarousel(container);

    // если отзывы подгрузятся позже — отловим
    const obs = new MutationObserver(() => {
      if (container.dataset.carouselReady === "1") return;
      initCarousel(container);
    });
    obs.observe(container, { childList: true, subtree: true });

    // страховка: через 2 секунды попробовать еще раз (на случай если DOM дергается)
    setTimeout(() => {
      if (container.dataset.carouselReady !== "1") initCarousel(container);
    }, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();