/* ============================================================
   BYPLAN — polish.js
   Adds: header scrolled state, scroll-spy, reveal-on-scroll,
         FAQ smooth accordion, case image lightbox,
         cleanup of empty placeholders.

   Drop-in: include AFTER assets/js/app.js
   ============================================================ */

(function(){
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const $ = (sel, root=document) => root.querySelector(sel);

  function rafThrottle(fn){
    let ticking = false;
    return function(){
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        fn();
      });
    };
  }

  function setupHeader(){
    const header = document.querySelector('.site-header');
    if (!header) return;
    const update = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 12);
    };
    update();
    window.addEventListener('scroll', rafThrottle(update), { passive: true });
  }

  function setupScrollSpy(){
    const menu = document.querySelector('.nav__menu');
    if (!menu) return;

    const links = $$('.nav__menu a[href^="#"]', menu)
      .filter(a => (a.getAttribute('href') || '').length > 1);

    if (!links.length) return;

    const pairs = links
      .map(a => {
        const id = a.getAttribute('href').slice(1);
        const sec = document.getElementById(id);
        return sec ? { a, sec } : null;
      })
      .filter(Boolean);

    if (!pairs.length) return;

    const setActive = (active) => {
      links.forEach(l => l.classList.toggle('is-active', l === active));
    };

    const io = new IntersectionObserver((entries) => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a,b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0));

      if (!visible.length) return;
      const top = visible[0].target;
      const pair = pairs.find(p => p.sec === top);
      if (pair) setActive(pair.a);
    }, {
      root: null,
      threshold: [0.06, 0.14, 0.22, 0.33],
      rootMargin: '-30% 0px -60% 0px'
    });

    pairs.forEach(p => io.observe(p.sec));

    // initial highlight for current hash
    try {
      const hash = (location.hash || '').replace('#','');
      if (hash) {
        const active = pairs.find(p => p.sec.id === hash);
        if (active) setActive(active.a);
      }
    } catch(_){}
  }

  function setupReveal(){
    if (prefersReduced) return;
    const sections = $$('main .section')
      .filter(s => !s.classList.contains('hero'));

    sections.forEach(s => s.classList.add('reveal'));

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-inview');
          io.unobserve(e.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -10% 0px'
    });

    sections.forEach(s => io.observe(s));
  }

  function pruneEmpty(){
    // Hide dead links that remain as "#" placeholders
    $$('a[data-kv-link]').forEach(a => {
      const href = (a.getAttribute('href') || '').trim();
      // allow in-page anchors ("#contact")
      if (href === '' || href === '#' ) {
        a.style.display = 'none';
        a.setAttribute('aria-hidden','true');
      }
    });

    // Hide elements with empty text (common for data-kv placeholders)
    $$('[data-kv]').forEach(n => {
      const t = (n.textContent || '').replace(/\s+/g,' ').trim();
      if (!t) {
        n.style.display = 'none';
        n.setAttribute('aria-hidden','true');
      }
    });

    // Remove empty list items
    $$('ul li, ol li').forEach(li => {
      const t = (li.textContent || '').trim();
      if (!t) li.remove();
    });

    // Hide dot separators when neighbor is hidden
    $$('.dot').forEach(dot => {
      const prev = dot.previousElementSibling;
      const next = dot.nextElementSibling;
      const isHidden = (el) => {
        if (!el) return true;
        if (el.hidden) return true;
        const cs = getComputedStyle(el);
        return cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0';
      };
      if (isHidden(prev) || isHidden(next)) dot.style.display = 'none';
    });
  }

  function setupFAQAnim(){
    const root = document.getElementById('faqList');
    if (!root) return;

    // Prepare answers for height animation, without touching markup generation.
    $$('.faq-item', root).forEach(item => {
      const btn = $('.faq-q', item);
      const ans = $('.faq-a', item);
      if (!btn || !ans) return;

      // ensure answer is measurable
      ans.hidden = false;
      ans.setAttribute('data-anim','1');
      ans.style.height = '0px';
      ans.style.overflow = 'hidden';

      btn.setAttribute('aria-expanded','false');
      item.classList.remove('is-open');

      // Normalize icon content (keep '+' then rotate in CSS)
      const icon = $('.faq-icon', btn);
      if (icon) icon.textContent = '+';
    });

    function openItem(item){
      const btn = $('.faq-q', item);
      const ans = $('.faq-a', item);
      if (!btn || !ans) return;

      item.classList.add('is-open');
      btn.setAttribute('aria-expanded','true');

      // measure
      ans.style.height = 'auto';
      const h = ans.scrollHeight;
      ans.style.height = '0px';
      // force reflow
      void ans.offsetHeight;
      ans.style.height = h + 'px';

      const onEnd = (e) => {
        if (e.target !== ans) return;
        if (item.classList.contains('is-open')) ans.style.height = 'auto';
        ans.removeEventListener('transitionend', onEnd);
      };
      ans.addEventListener('transitionend', onEnd);
    }

    function closeItem(item){
      const btn = $('.faq-q', item);
      const ans = $('.faq-a', item);
      if (!btn || !ans) return;

      item.classList.remove('is-open');
      btn.setAttribute('aria-expanded','false');

      const h = ans.scrollHeight;
      ans.style.height = h + 'px';
      void ans.offsetHeight;
      ans.style.height = '0px';
    }

    // Capture click to prevent old listeners (if any) from firing.
    root.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('.faq-q');
      if (!btn) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const item = btn.closest('.faq-item');
      if (!item) return;

      const isOpen = item.classList.contains('is-open');

      // close others
      $$('.faq-item.is-open', root).forEach(open => {
        if (open !== item) closeItem(open);
      });

      if (isOpen) closeItem(item);
      else openItem(item);
    }, true);
  }

  function setupCaseLightbox(){
    const grid = document.getElementById('casesGrid');
    if (!grid) return;

    // Create modal
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.setAttribute('role','dialog');
    lb.setAttribute('aria-modal','true');
    lb.setAttribute('aria-label','Просмотр изображения');
    lb.innerHTML = `
      <div class="lightbox__panel">
        <div class="lightbox__top">
          <div class="lightbox__title" id="lightboxTitle"></div>
          <button class="lightbox__close" type="button" aria-label="Закрыть">✕</button>
        </div>
        <div class="lightbox__img"><img id="lightboxImg" alt="" /></div>
      </div>
    `;
    document.body.appendChild(lb);

    const titleEl = lb.querySelector('#lightboxTitle');
    const imgEl = lb.querySelector('#lightboxImg');

    function open(src, title){
      if (!src) return;
      imgEl.src = src;
      imgEl.alt = title || '';
      titleEl.textContent = title || '';
      lb.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }

    function close(){
      lb.classList.remove('is-open');
      document.body.style.overflow = '';
      imgEl.src = '';
      imgEl.alt = '';
      titleEl.textContent = '';
    }

    lb.addEventListener('click', (e) => {
      if (e.target === lb) close();
    });
    lb.querySelector('.lightbox__close').addEventListener('click', close);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lb.classList.contains('is-open')) close();
    });

    grid.addEventListener('click', (e) => {
      const img = e.target.closest && e.target.closest('.case-card__img img');
      if (!img) return;

      // If the case has an external URL button, we still allow image to open.
      e.preventDefault();

      const card = img.closest('.case-card');
      const title = card ? (card.querySelector('.case-card__title')?.textContent || '').trim() : '';
      open(img.currentSrc || img.src, title);
    });
  }

  async function waitForRender(){
    // The site renders content asynchronously from Google Sheets.
    // We'll wait until at least one of key grids is filled.
    const start = Date.now();
    while (Date.now() - start < 7000){
      const pricingReady = document.querySelector('#pricingGrid .price-card');
      const casesReady = document.querySelector('#casesGrid .case-card');
      const faqReady = document.querySelector('#faqList .faq-item');
      if (pricingReady || casesReady || faqReady) return;
      await new Promise(r => setTimeout(r, 120));
    }
  }

  async function init(){
    setupHeader();
    setupScrollSpy();

    // Wait for async content; then polish blocks that depend on it.
    await waitForRender();

    pruneEmpty();
    setupReveal();
    setupFAQAnim();
    setupCaseLightbox();
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => init().catch(console.error));
  } else {
    init().catch(console.error);
  }
})();
