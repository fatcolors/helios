/* ==========================================================
   HELIOS ATELIER — Scroll-Driven Frame Animation Engine
   ==========================================================
   Architecture follows SCROLL-ANIMATION-BEST-PRACTICES.md:
     1. Batch-preload all WebP frames
     2. Scroll handler → sets state ONLY
     3. rAF loop → draws to canvas ONLY when frame changed
     4. Overlay cards tied to scroll ranges, not timers
   ========================================================== */

(() => {
  'use strict';

  /* ── Configuration ──────────────────────────────────────── */

  const CONFIG = {
    framePath:    'frames/frame-',
    frameExt:     '.webp',
    totalFrames:  166,
    frameDigits:  4,            // frame-0001 .. frame-0166
    batchSize:    20,           // concurrent preload batch size
    frameWidth:   1366,         // native frame width
    frameHeight:  768,          // native frame height

    // Scroll-driven overlay phases  (normalised 0 → 1)
    phases: [
      { id: 'phase-1', start: 0.05, end: 0.24 },
      { id: 'phase-2', start: 0.28, end: 0.46 },
      { id: 'phase-3', start: 0.50, end: 0.68, persist: true },
      { id: 'phase-4', start: 0.72, end: 0.92, persist: true },
    ],

    // Subtle rotation mapped to scroll progress
    rotationStart: -3,    // deg at progress 0
    rotationEnd:    6,    // deg at progress 1
  };

  /* ── DOM References ─────────────────────────────────────── */

  const canvas         = document.getElementById('frame-canvas');
  const ctx            = canvas.getContext('2d');
  const loader         = document.getElementById('loader');
  const loaderBar      = document.getElementById('loader-bar');
  const loaderText     = document.getElementById('loader-text');
  const scrollHint     = document.getElementById('scroll-hint');
  const scrollProgress = document.getElementById('scroll-progress');
  const nav            = document.querySelector('.nav');
  const heroSection    = document.getElementById('hero-scroll');
  const awardBadge     = document.getElementById('award-badge');
  const heroHeading    = document.getElementById('hero-heading');
  const contactInner   = document.querySelector('.contact__inner');

  /* ── State ──────────────────────────────────────────────── */

  const frames       = new Array(CONFIG.totalFrames);   // Image objects
  let currentFrame   = 0;      // target frame (set by scroll handler)
  let drawnFrame     = -1;     // last frame rendered (rAF checks this)
  let scrollProg     = 0;      // normalised scroll progress  0 → 1
  let isLoaded       = false;

  /* ── Utility: zero-padded frame index → path ────────────── */

  function frameSrc(index) {
    const num = String(index + 1).padStart(CONFIG.frameDigits, '0');
    return `${CONFIG.framePath}${num}${CONFIG.frameExt}`;
  }

  /* ==========================================================
     1. FRAME PRELOADER  — batched, sequential groups
     ========================================================== */

  function loadSingleFrame(index) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => { frames[index] = img; resolve(); };
      img.onerror = () => reject(new Error(`Failed: ${frameSrc(index)}`));
      img.src = frameSrc(index);
    });
  }

  async function preloadAllFrames() {
    const total = CONFIG.totalFrames;
    const batch = CONFIG.batchSize;

    for (let i = 0; i < total; i += batch) {
      const promises = [];
      const end = Math.min(i + batch, total);
      for (let j = i; j < end; j++) {
        promises.push(loadSingleFrame(j));
      }
      await Promise.all(promises);

      // Update loading UI
      const loaded = Math.min(i + batch, total);
      const pct    = Math.round((loaded / total) * 100);
      loaderBar.style.width = `${pct}%`;
      loaderText.textContent = `${pct} %`;
    }
  }

  /* ==========================================================
     2. CANVAS SETUP
     ========================================================== */

  function initCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width  = CONFIG.frameWidth  * dpr;
    canvas.height = CONFIG.frameHeight * dpr;
    ctx.scale(dpr, dpr);

    updateCanvasSize();
  }

  function updateCanvasSize() {
    const aspect = CONFIG.frameWidth / CONFIG.frameHeight;
    const maxW = Math.min(window.innerWidth * 0.85, CONFIG.frameWidth);
    const maxH = window.innerHeight * 0.8;

    let w = maxW;
    let h = w / aspect;

    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }

    canvas.style.width  = `${w}px`;
    canvas.style.height = `${h}px`;
  }

  /* ==========================================================
     3. SCROLL PROGRESS CALCULATION
     ========================================================== */

  function getScrollProgress() {
    const rect = heroSection.getBoundingClientRect();
    const scrollable = rect.height - window.innerHeight;
    if (scrollable <= 0) return 0;
    const raw = -rect.top / scrollable;
    return Math.max(0, Math.min(1, raw));
  }

  /* ==========================================================
     4. SCROLL HANDLER  — state update ONLY (no drawing!)
     ========================================================== */

  function onScroll() {
    scrollProg = getScrollProgress();

    // Map progress → frame index
    currentFrame = Math.min(
      Math.floor(scrollProg * CONFIG.totalFrames),
      CONFIG.totalFrames - 1
    );

    // Update overlay phase cards
    const isMobile = window.innerWidth <= 600;
    for (const phase of CONFIG.phases) {
      const el = document.getElementById(phase.id);
      if (!el) continue;
      // On mobile, phase-3 should not persist (phase-4 replaces it)
      const shouldPersist = phase.persist && !(isMobile && phase.id === 'phase-3');
      if (shouldPersist) {
        el.classList.toggle('is-visible', scrollProg >= phase.start);
      } else if (scrollProg >= phase.start && scrollProg <= phase.end) {
        el.classList.add('is-visible');
      } else {
        el.classList.remove('is-visible');
      }
    }

    // Award badge: keep visible once it appears
    if (awardBadge) {
      awardBadge.classList.toggle('is-visible', scrollProg >= 0.65);
    }

    // Hero heading: fade out when user starts scrolling
    if (heroHeading) {
      if (scrollProg > 0.02) {
        heroHeading.classList.add('is-fading');
        heroHeading.classList.remove('is-visible');
      } else {
        heroHeading.classList.remove('is-fading');
        heroHeading.classList.add('is-visible');
      }
    }

    // Scroll hint: hide after first ~5% of scroll
    if (scrollHint) {
      scrollHint.classList.toggle('is-hidden', scrollProg > 0.04);
    }

    // Page-level scroll progress bar
    const pageScrollMax = document.documentElement.scrollHeight - window.innerHeight;
    const pageProgress  = pageScrollMax > 0 ? (window.scrollY / pageScrollMax) * 100 : 0;
    scrollProgress.style.width = `${pageProgress}%`;

    // Contact section: reveal when it enters viewport
    if (contactInner) {
      const contactRect = contactInner.getBoundingClientRect();
      if (contactRect.top < window.innerHeight * 0.85) {
        contactInner.classList.add('is-visible');
      }
    }
  }

  /* ==========================================================
     5. rAF RENDER LOOP — draws canvas ONLY when frame changes
     ========================================================== */

  function tick() {
    if (isLoaded && currentFrame !== drawnFrame && frames[currentFrame]) {
      // Draw frame to canvas
      ctx.clearRect(0, 0, CONFIG.frameWidth, CONFIG.frameHeight);
      ctx.drawImage(frames[currentFrame], 0, 0, CONFIG.frameWidth - 2, CONFIG.frameHeight, 0, 0, CONFIG.frameWidth, CONFIG.frameHeight);
      drawnFrame = currentFrame;

      // Keep canvas centered (no rotation)
      canvas.style.transform = `translate(-50%, -50%)`;
    }

    requestAnimationFrame(tick);
  }

  /* ==========================================================
     6. RESIZE HANDLER
     ========================================================== */

  function onResize() {
    updateCanvasSize();
    drawnFrame = -1;
  }

  /* ==========================================================
     7. INIT — wire everything up
     ========================================================== */

  async function init() {
    initCanvas();

    // Start preloading frames
    try {
      await preloadAllFrames();
    } catch (err) {
      console.error('[Helios] Frame preload error:', err);
      loaderText.textContent = 'Load error — please refresh';
      return;
    }

    isLoaded = true;

    // Draw the first frame immediately
    if (frames[0]) {
      ctx.drawImage(frames[0], 0, 0, CONFIG.frameWidth - 2, CONFIG.frameHeight, 0, 0, CONFIG.frameWidth, CONFIG.frameHeight);
      drawnFrame = 0;
    }

    // Dismiss loader
    loader.classList.add('is-hidden');

    // Show nav
    nav.classList.add('is-visible');

    // Show hero heading with staggered animation
    if (heroHeading) {
      setTimeout(() => heroHeading.classList.add('is-visible'), 300);
    }

    // Bind scroll (passive — never blocks scrolling)
    window.addEventListener('scroll', onScroll, { passive: true });

    // Bind resize
    window.addEventListener('resize', onResize, { passive: true });

    // Kick off the rAF render loop
    requestAnimationFrame(tick);

    // Run once to set initial state from current scroll pos
    onScroll();
  }

  /* ── Go ──────────────────────────────────────────────────── */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ── Mobile hamburger menu ─────────────────────────────── */

  const hamburger = document.querySelector('.nav__hamburger');
  const mobileMenu = document.querySelector('.mobile-menu');

  function closeMenu() {
    hamburger.classList.remove('is-active');
    mobileMenu.classList.remove('is-open');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  }

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const isOpen = hamburger.classList.toggle('is-active');
      mobileMenu.classList.toggle('is-open');
      hamburger.setAttribute('aria-expanded', isOpen);
      document.body.classList.toggle('menu-open', isOpen);
    });

    const closeBtn = mobileMenu.querySelector('.mobile-menu__close');
    if (closeBtn) closeBtn.addEventListener('click', closeMenu);
  }

})();
