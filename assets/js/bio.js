/* ============================================================
   BYPLAN — bio.js (Root version)
   Scope: ONLY #about block

   Fixes:
   - "Works only when DevTools open" bug:
     1) Do NOT hijack pointer events when user clicks buttons/links inside the slide
        (prevents swipe handler from eating "Читать полностью" click).
     2) Recalc clamp after fonts load + on window load.

   Features:
   - Mini slider inside .about-card: "Биография" / "Подход"
   - Click-to-zoom for designer photo
   - Bio clamp + "Читать полностью"
   - Stats reveal + number count-up
   ============================================================ */

(function () {
  'use strict';

  if (window.__byplanBioRootV1) return;
  window.__byplanBioRootV1 = true;

  var root = document.getElementById('about');
  if (!root) return;

  var prefersReducedMotion = false;
  try {
    prefersReducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    prefersReducedMotion = false;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function waitFor(checkFn, cb, opts) {
    var interval = (opts && opts.interval) || 120;
    var timeout = (opts && opts.timeout) || 9000;
    var start = Date.now();

    (function tick() {
      try {
        if (checkFn()) {
          cb();
          return;
        }
      } catch (e) {
        // ignore
      }

      if (Date.now() - start >= timeout) return;
      setTimeout(tick, interval);
    })();
  }

  function indexStagger() {
    var bullets = root.querySelector('#trustBullets');
    if (bullets) {
      Array.prototype.slice.call(bullets.children).forEach(function (el, i) {
        el.style.setProperty('--i', String(i));
      });
    }
  }

  /* ------------------------------
     Mini slider inside .about-card
     ------------------------------ */
  function buildMiniSlider() {
    if (root.dataset.aboutMiniReady === '1') return;

    var card = root.querySelector('.about-card');
    if (!card) return;

    // Body is the text column (usually second child)
    var body = null;
    if (card.children && card.children.length > 1) body = card.children[1];
    if (!body) return;

    var bio = body.querySelector('.about-bio');
    var bullets = body.querySelector('#trustBullets');

    if (!bio || !bullets) return;

    root.dataset.aboutMiniReady = '1';

    // Build slider skeleton
    var mini = document.createElement('div');
    mini.className = 'about-mini';
    mini.dataset.index = '0';

    mini.innerHTML =
      '<div class="about-mini__top">' +
      '  <div class="about-tabs" role="tablist" aria-label="Биография и подход">' +
      '    <button class="about-tab is-active" type="button" role="tab" aria-selected="true" aria-controls="aboutMiniSlideBio" id="aboutMiniTabBio" data-index="0">' +
      '      <span class="about-tab__icon" aria-hidden="true">📖</span>' +
      '      <span class="about-tab__label">Биография</span>' +
      '    </button>' +
      '    <button class="about-tab" type="button" role="tab" aria-selected="false" aria-controls="aboutMiniSlideBullets" id="aboutMiniTabBullets" data-index="1">' +
      '      <span class="about-tab__icon" aria-hidden="true">✓</span>' +
      '      <span class="about-tab__label">Подход</span>' +
      '    </button>' +
      '  </div>' +
      '</div>' +
      '<div class="about-carousel" aria-label="Слайдер: биография / подход">' +
      '  <div class="about-carousel__viewport" tabindex="0">' +
      '    <div class="about-carousel__track">' +
      '      <article class="about-slide about-slide--bio is-active" role="tabpanel" id="aboutMiniSlideBio" aria-labelledby="aboutMiniTabBio"></article>' +
      '      <article class="about-slide about-slide--bullets" role="tabpanel" id="aboutMiniSlideBullets" aria-labelledby="aboutMiniTabBullets"></article>' +
      '    </div>' +
      '  </div>' +
      '  <div class="about-dots" aria-hidden="true">' +
      '    <span class="about-dot is-active"></span>' +
      '    <span class="about-dot"></span>' +
      '  </div>' +
      '</div>';

    body.insertBefore(mini, bio);

    // Move nodes into slides (IDs preserved)
    var slideBio = mini.querySelector('#aboutMiniSlideBio');
    var slideBullets = mini.querySelector('#aboutMiniSlideBullets');
    if (slideBio) slideBio.appendChild(bio);
    if (slideBullets) slideBullets.appendChild(bullets);

    setupMiniInteractions(mini);

    indexStagger();

    // Re-stagger + resync height when bullets update from Sheets
    try {
      var mo = new MutationObserver(function () {
        indexStagger();
        syncMiniHeight(mini);
      });
      mo.observe(bullets, { childList: true, subtree: false });
    } catch (e) {
      // ignore
    }

    // Initial height after layout settles
    try {
      window.requestAnimationFrame(function () {
        syncMiniHeight(mini);
      });
    } catch (e) {
      syncMiniHeight(mini);
    }
  }

  function syncMiniHeight(mini) {
    if (!mini) return;
    var viewport = mini.querySelector('.about-carousel__viewport');
    var slides = mini.querySelectorAll('.about-slide');
    var idx = parseInt(mini.dataset.index || '0', 10) || 0;
    idx = clamp(idx, 0, 1);

    var active = slides && slides.length ? slides[idx] : null;
    if (!viewport || !active) return;

    var h = active.offsetHeight;
    if (h > 0) viewport.style.height = h + 'px';
  }

  function setupMiniInteractions(mini) {
    var tabs = Array.prototype.slice.call(mini.querySelectorAll('.about-tab'));
    var dots = Array.prototype.slice.call(mini.querySelectorAll('.about-dot'));
    var track = mini.querySelector('.about-carousel__track');
    var viewport = mini.querySelector('.about-carousel__viewport');
    var slides = Array.prototype.slice.call(mini.querySelectorAll('.about-slide'));

    var index = parseInt(mini.dataset.index || '0', 10) || 0;
    index = clamp(index, 0, 1);

    function applyIndex(next, opts) {
      var force = opts && opts.force;
      next = clamp(next, 0, 1);
      if (next === index && !force) return;

      index = next;
      mini.dataset.index = String(index);

      if (track) track.style.transform = 'translate3d(' + (-index * 100) + '%,0,0)';

      tabs.forEach(function (btn, i) {
        var active = i === index;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
        btn.tabIndex = active ? 0 : -1;
      });

      dots.forEach(function (d, i) {
        d.classList.toggle('is-active', i === index);
      });

      slides.forEach(function (s, i) {
        s.classList.toggle('is-active', i === index);
      });

      if (prefersReducedMotion) {
        syncMiniHeight(mini);
      } else {
        window.requestAnimationFrame(function () {
          syncMiniHeight(mini);
        });
      }
    }

    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = parseInt(btn.dataset.index || '0', 10) || 0;
        applyIndex(next);
      });
    });

    // Keyboard navigation
    if (viewport) {
      viewport.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          applyIndex(index - 1);
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          applyIndex(index + 1);
        }
      });
    }

    // Swipe / drag (FIXED: don't eat clicks on buttons/links)
    var down = false;
    var dragging = false;
    var startX = 0;
    var startY = 0;
    var threshold = 46;

    function isInteractiveTarget(node) {
      if (!node || !node.closest) return false;
      return !!node.closest(
        'button, a, input, textarea, select, label, [role="button"], [data-no-swipe]'
      );
    }

    function onDown(e) {
      if (!viewport) return;
      if (isInteractiveTarget(e.target)) return; // <-- IMPORTANT FIX
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      down = true;
      dragging = false;
      startX = e.clientX;
      startY = e.clientY;
      // Do NOT setPointerCapture here (only after we are sure it is a drag)
    }

    function onMove(e) {
      if (!down || !viewport || !track) return;

      var dx = e.clientX - startX;
      var dy = e.clientY - startY;

      if (!dragging) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          dragging = true;
          // Capture only now (real drag) — so clicks on "Читать полностью" are not broken
          try {
            viewport.setPointerCapture(e.pointerId);
          } catch (err) {}
        } else if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
          // vertical scroll — do not hijack
          down = false;
          return;
        }
      }
      if (!dragging) return;

      var pct = (dx / Math.max(1, viewport.clientWidth)) * 100;
      track.style.transition = 'none';
      track.style.transform =
        'translate3d(calc(' + (-index * 100) + '% + ' + pct + '%),0,0)';

      e.preventDefault();
    }

    function onUp(e) {
      if (!down) return;
      down = false;

      if (track) track.style.transition = '';

      var dx = e.clientX - startX;
      var dy = e.clientY - startY;

      if (dragging && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
        applyIndex(index + (dx < 0 ? 1 : -1));
      } else {
        applyIndex(index, { force: true });
      }

      dragging = false;
    }

    if (viewport && window.PointerEvent) {
      viewport.addEventListener('pointerdown', onDown);
      viewport.addEventListener('pointermove', onMove, { passive: false });
      viewport.addEventListener('pointerup', onUp);
      viewport.addEventListener('pointercancel', onUp);
    }

    applyIndex(index, { force: true });

    window.addEventListener(
      'resize',
      function () {
        syncMiniHeight(mini);
      },
      { passive: true }
    );

    window.addEventListener(
      'load',
      function () {
        syncMiniHeight(mini);
      },
      { passive: true }
    );

    // Also resync after fonts load (height can change)
    try {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          setTimeout(function () {
            syncMiniHeight(mini);
          }, 0);
        });
      }
    } catch (e) {}
  }

  /* ------------------------------
     Designer photo: click-to-zoom (lightbox)
     ------------------------------ */
  function ensureDesignerPhotoModal() {
    var modal = document.querySelector('.about-photo-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'about-photo-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Фото дизайнера');
    modal.setAttribute('aria-hidden', 'true');
    modal.hidden = true;

    modal.innerHTML =
      '<div class="about-photo-modal__dialog" role="document">' +
      '  <button class="about-photo-modal__close" type="button" aria-label="Закрыть">✕</button>' +
      '  <img class="about-photo-modal__img" alt="">' +
      '</div>';

    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) {
      var closeBtn =
        e.target && e.target.closest ? e.target.closest('.about-photo-modal__close') : null;
      if (closeBtn) {
        closeDesignerPhotoModal();
        return;
      }

      var dialog =
        e.target && e.target.closest ? e.target.closest('.about-photo-modal__dialog') : null;
      if (!dialog && e.target === modal) closeDesignerPhotoModal();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var opened = document.querySelector('.about-photo-modal.is-open');
      if (!opened) return;
      closeDesignerPhotoModal();
    });

    return modal;
  }

  function openDesignerPhotoModal(src, alt) {
    if (!src) return;
    var modal = ensureDesignerPhotoModal();
    var img = modal.querySelector('.about-photo-modal__img');
    if (!img) return;

    img.src = src;
    img.alt = alt || 'Фото дизайнера';

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');

    try {
      modal.offsetHeight;
    } catch (e) {}
    modal.classList.add('is-open');

    document.documentElement.classList.add('about-photo-open');
    document.body.classList.add('about-photo-open');
  }

  function closeDesignerPhotoModal() {
    var modal = document.querySelector('.about-photo-modal');
    if (!modal || modal.hidden) return;

    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');

    document.documentElement.classList.remove('about-photo-open');
    document.body.classList.remove('about-photo-open');

    var img = modal.querySelector('.about-photo-modal__img');
    window.setTimeout(function () {
      modal.hidden = true;
      if (img) img.src = '';
    }, 220);
  }

  function initDesignerPhotoZoom() {
    var img = root.querySelector('#designerPhoto');
    if (!img) return;

    if (img.dataset.zoomBound === '1') return;
    img.dataset.zoomBound = '1';

    img.classList.add('is-zoomable');

    img.addEventListener('click', function () {
      var src = img.currentSrc || img.getAttribute('src');
      openDesignerPhotoModal(src, img.alt);
    });

    if (!img.hasAttribute('tabindex')) img.setAttribute('tabindex', '0');
    if (!img.hasAttribute('role')) img.setAttribute('role', 'button');

    img.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        var src = img.currentSrc || img.getAttribute('src');
        openDesignerPhotoModal(src, img.alt);
      }
    });
  }

  /* ------------------------------
     Bio clamp + toggle
     ------------------------------ */
  function initBioToggle() {
    var bio = root.querySelector('.about-bio');
    if (!bio) return;

    if (bio.dataset.bioInit === '1') return;
    bio.dataset.bioInit = '1';

    bio.classList.add('about-bio--clamp');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bio-toggle';
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML =
      '<span class="bio-toggle__text">Читать полностью</span>' +
      '<span class="bio-toggle__chev" aria-hidden="true">▾</span>';

    bio.insertAdjacentElement('afterend', btn);

    function syncMiniIfAny() {
      var mini = root.querySelector('.about-mini');
      if (mini) {
        if (prefersReducedMotion) syncMiniHeight(mini);
        else window.requestAnimationFrame(function () { syncMiniHeight(mini); });
      }
    }

    function recalc() {
      if (bio.classList.contains('is-expanded')) {
        btn.hidden = false;
        syncMiniIfAny();
        return;
      }

      // Determine overflow
      var need = bio.scrollHeight > bio.clientHeight + 6;
      btn.hidden = !need;

      if (!need) bio.classList.remove('about-bio--clamp');
      else bio.classList.add('about-bio--clamp');

      syncMiniIfAny();
    }

    // Recalc after layout / fonts / load
    try {
      window.requestAnimationFrame(recalc);
    } catch (e) {
      setTimeout(recalc, 0);
    }
    setTimeout(recalc, 200);
    setTimeout(recalc, 600);

    window.addEventListener('resize', recalc, { passive: true });
    window.addEventListener('load', recalc, { passive: true });

    try {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          setTimeout(recalc, 0);
        });
      }
    } catch (e) {}

    btn.addEventListener('click', function () {
      var expanded = bio.classList.toggle('is-expanded');
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');

      var text = btn.querySelector('.bio-toggle__text');
      var chev = btn.querySelector('.bio-toggle__chev');
      if (text) text.textContent = expanded ? 'Свернуть' : 'Читать полностью';
      if (chev) chev.textContent = expanded ? '▴' : '▾';

      syncMiniIfAny();

      if (!expanded) recalc();
    });

    // If bio text changes later (Sheets KV), reset toggle
    try {
      var mo = new MutationObserver(function () {
        bio.classList.remove('is-expanded');
        btn.setAttribute('aria-expanded', 'false');

        var text = btn.querySelector('.bio-toggle__text');
        var chev = btn.querySelector('.bio-toggle__chev');
        if (text) text.textContent = 'Читать полностью';
        if (chev) chev.textContent = '▾';

        bio.classList.add('about-bio--clamp');
        setTimeout(recalc, 0);
      });
      mo.observe(bio, { characterData: true, childList: true, subtree: true });
    } catch (e) {
      // ignore
    }
  }

  /* ------------------------------
     Stats reveal + number count
     ------------------------------ */
  function parseNumberParts(raw) {
    var s = String(raw || '').trim();
    var m = s.match(/^([^0-9]*)([0-9]+(?:[\\.,][0-9]+)?)(.*)$/);
    if (!m) return null;

    var prefix = m[1] || '';
    var numStr = m[2] || '';
    var suffix = m[3] || '';

    var num = Number(numStr.replace(',', '.'));
    if (!Number.isFinite(num)) return null;

    var decimals = 0;
    if (numStr.indexOf('.') !== -1 || numStr.indexOf(',') !== -1) {
      var parts = numStr.split(/[\\.,]/);
      decimals = (parts[1] || '').length;
    }

    return { prefix: prefix, num: num, suffix: suffix, decimals: decimals };
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animateNumber(el) {
    if (!el) return;
    if (el.dataset.animated === '1') return;

    var parts = parseNumberParts(el.textContent);
    if (!parts) return;

    el.dataset.animated = '1';
    if (prefersReducedMotion) return;

    var start = performance.now();
    var duration = 820;
    var from = 0;
    var to = parts.num;

    function format(v) {
      if (parts.decimals > 0) return v.toFixed(parts.decimals);
      return String(Math.round(v));
    }

    function frame(now) {
      var p = Math.min(1, (now - start) / duration);
      var v = from + (to - from) * easeOutCubic(p);
      el.textContent = parts.prefix + format(v) + parts.suffix;

      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = parts.prefix + format(to) + parts.suffix;
    }

    requestAnimationFrame(frame);
  }

  function initStatsReveal() {
    var grid = root.querySelector('#statsGrid');
    if (!grid) return;

    var items = Array.prototype.slice.call(grid.querySelectorAll('.stat'));
    if (!items.length) return;

    if (!('IntersectionObserver' in window)) {
      items.forEach(function (stat) {
        stat.classList.add('is-in');
        var num = stat.querySelector('.stat__num');
        if (num) animateNumber(num);
      });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;

          var stat = entry.target;
          stat.classList.add('is-in');

          var num = stat.querySelector('.stat__num');
          if (num) animateNumber(num);

          io.unobserve(stat);
        });
      },
      { threshold: 0.35 }
    );

    items.forEach(function (stat) {
      io.observe(stat);
    });
  }

  /* ------------------------------
     Bootstrapping
     ------------------------------ */
  function init() {
    initDesignerPhotoZoom();

    // Build slider (can be built even before Sheets fill bullets)
    buildMiniSlider();
    indexStagger();

    // Wait for bio content (Sheets KV) then init toggle
    waitFor(
      function () {
        var bio = root.querySelector('.about-bio');
        return bio && bio.textContent && bio.textContent.trim().length > 0;
      },
      initBioToggle,
      { timeout: 12000 }
    );

    // Wait for stats render
    waitFor(
      function () {
        return root.querySelectorAll('#statsGrid .stat').length > 0;
      },
      initStatsReveal,
      { timeout: 15000 }
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
