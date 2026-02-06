/* ============================================================
   BYPLAN — bio.js (About mini slider)
   Scope: ONLY #about block

   Changes vs previous version:
   - We DO NOT turn the whole #about into a 2-screen slider.
   - We only split the LEFT card (.about-card) into 2 screens:
       1) Биография (about-bio)
       2) Подход (trustBullets)
   - The RIGHT column ("Почему можно доверять" + stats + PDF) stays as normal
     content on the page (no swipe screen) -> no conceptual duplication.

   Also includes:
   - "Read more" toggle for the bio if it overflows
   - Stats reveal + number count-up
   ============================================================ */

(function () {
  'use strict';

  if (window.__byplanAboutMiniV1) return;
  window.__byplanAboutMiniV1 = true;

  var root = document.getElementById('about');
  if (!root) return;

  var prefersReducedMotion = false;
  try {
    prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

    // Body is the 2nd child of .about-card in the current markup
    var body = card.children && card.children.length > 1 ? card.children[1] : null;
    if (!body) return;

    var bio = body.querySelector('.about-bio');
    var bullets = body.querySelector('#trustBullets');

    // If either is missing, do nothing
    if (!bio || !bullets) return;

    // Avoid re-init
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

    // Insert the mini slider where the bio paragraph used to start
    body.insertBefore(mini, bio);

    // Move existing nodes into slides (IDs are preserved!)
    var slideBio = mini.querySelector('#aboutMiniSlideBio');
    var slideBullets = mini.querySelector('#aboutMiniSlideBullets');
    if (slideBio) slideBio.appendChild(bio);
    if (slideBullets) slideBullets.appendChild(bullets);

    // Setup interactions
    setupMiniInteractions(mini);

    // Stagger bullets for any CSS delays
    indexStagger();

    // Re-stagger when sheet data updates bullets later
    try {
      var mo = new MutationObserver(function () {
        indexStagger();
        syncMiniHeight(mini);
      });
      mo.observe(bullets, { childList: true });
    } catch (e) {
      // ignore
    }

    // Initial height
    try {
      window.requestAnimationFrame(function () { syncMiniHeight(mini); });
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
        window.requestAnimationFrame(function () { syncMiniHeight(mini); });
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

    // Swipe / drag
    var down = false;
    var dragging = false;
    var startX = 0;
    var startY = 0;
    var threshold = 46;

    function isInteractiveTarget(t) {
      if (!t || !t.closest) return false;
      return !!t.closest('button, a, input, textarea, select, label, summary, [role="button"], .about-tab, .bio-toggle');
    }

    var pointerCaptured = false;
    var activePointerId = null;

    function onDown(e) {
      if (!viewport) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // Don't hijack clicks on real controls inside the slider
      if (isInteractiveTarget(e.target)) return;
      down = true;
      dragging = false;
      pointerCaptured = false;
      activePointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
    }

    function onMove(e) {
      if (!down || !viewport || !track) return;

      var dx = e.clientX - startX;
      var dy = e.clientY - startY;

      // Determine intent
      if (!dragging) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          dragging = true;
          // Capture pointer ONLY when we are really dragging.
          // This prevents breaking clicks on buttons (e.g. "Читать полностью").
          if (!pointerCaptured) {
            try {
              if (activePointerId != null) viewport.setPointerCapture(activePointerId);
              pointerCaptured = true;
            } catch (err) {
              pointerCaptured = false;
            }
          }
        } else if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
          // vertical scroll — do not hijack
          down = false;
          return;
        }
      }
      if (!dragging) return;

      // Rubberband
      var pct = (dx / Math.max(1, viewport.clientWidth)) * 100;
      track.style.transition = 'none';
      track.style.transform = 'translate3d(calc(' + (-index * 100) + '% + ' + pct + '%),0,0)';

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

    // Initial
    applyIndex(index, { force: true });

    // Keep height synced
    window.addEventListener('resize', function () { syncMiniHeight(mini); }, { passive: true });
    window.addEventListener('load', function () { syncMiniHeight(mini); }, { passive: true });
  }

  /* ------------------------------
     Bio clamp + toggle
     ------------------------------ */
  function initBioToggle() {
    var bio = root.querySelector('.about-bio');
    if (!bio) return;

    // Avoid duplicate init
    if (bio.dataset.bioInit === '1') return;
    bio.dataset.bioInit = '1';

    // Clamp by default
    bio.classList.add('about-bio--clamp');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bio-toggle';
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML =
      '<span class="bio-toggle__text">Читать полностью</span>' +
      '<span class="bio-toggle__chev" aria-hidden="true">▾</span>';

    bio.insertAdjacentElement('afterend', btn);

    function recalc() {
      // If expanded, keep button visible
      if (bio.classList.contains('is-expanded')) {
        btn.hidden = false;
        return;
      }

      // Determine overflow
      var need = bio.scrollHeight > bio.clientHeight + 6;
      btn.hidden = !need;

      if (!need) {
        bio.classList.remove('about-bio--clamp');
      } else {
        bio.classList.add('about-bio--clamp');
      }

      // Update mini slider height if present
      var mini = root.querySelector('.about-mini');
      if (mini) syncMiniHeight(mini);
    }

    // Recalc after fonts/content settle
    setTimeout(recalc, 0);
    setTimeout(recalc, 300);
    window.addEventListener('resize', recalc, { passive: true });

    btn.addEventListener('click', function () {
      var expanded = bio.classList.toggle('is-expanded');

      // When expanded, remove clamp styles to avoid any browser quirks.
      // When collapsed, enable clamp again (recalc may remove it if not needed).
      if (expanded) bio.classList.remove('about-bio--clamp');
      else bio.classList.add('about-bio--clamp');

      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');

      var text = btn.querySelector('.bio-toggle__text');
      var chev = btn.querySelector('.bio-toggle__chev');
      if (text) text.textContent = expanded ? 'Свернуть' : 'Читать полностью';
      if (chev) chev.textContent = expanded ? '▴' : '▾';

      // Height sync
      var mini = root.querySelector('.about-mini');
      if (mini) {
        if (prefersReducedMotion) syncMiniHeight(mini);
        else window.requestAnimationFrame(function () { syncMiniHeight(mini); });
      }

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
    // prefix + number + suffix
    var m = s.match(/^([^0-9]*)([0-9]+(?:[\.,][0-9]+)?)(.*)$/);
    if (!m) return null;

    var prefix = m[1] || '';
    var numStr = m[2] || '';
    var suffix = m[3] || '';

    var num = Number(numStr.replace(',', '.'));
    if (!Number.isFinite(num)) return null;

    var decimals = 0;
    if (numStr.indexOf('.') !== -1 || numStr.indexOf(',') !== -1) {
      var parts = numStr.split(/[\.,]/);
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

      if (p < 1) {
        requestAnimationFrame(frame);
      } else {
        el.textContent = parts.prefix + format(to) + parts.suffix;
      }
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

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;

        var stat = entry.target;
        stat.classList.add('is-in');

        var num = stat.querySelector('.stat__num');
        if (num) animateNumber(num);

        io.unobserve(stat);
      });
    }, { threshold: 0.35 });

    items.forEach(function (stat) { io.observe(stat); });
  }

  /* ------------------------------
     Bootstrapping
     ------------------------------ */
  function init() {
    buildMiniSlider();
    indexStagger();

    // Wait for bio content from Sheets (KV)
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
