// =============================================
// MAIN.JS — UY Demonlist v2
// =============================================

gsap.registerPlugin(ScrollTrigger);

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('year').textContent = new Date().getFullYear();
  setupNavbar();
  initParticles();
  initSmoothScroll();

  AOS.init({ duration: 520, easing: 'ease-out-quart', once: true, offset: 60 });

  const modal = document.getElementById('completionModal');
  if (modal) { modal.classList.remove('active'); }

  if (!location.hash) window.scrollTo(0, 0);
});

// ─── NAVBAR ───
function setupNavbar() {
  const navbar    = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');
  const links     = document.querySelectorAll('.nav-link');

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
    updateActiveLink();
  }, { passive: true });

  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navLinks.classList.toggle('open');
  });

  links.forEach(link => {
    link.addEventListener('click', e => {
      const href = link.getAttribute('href') || '';
      if (!href.startsWith('#')) return;
      e.preventDefault();
      const targetId = href.slice(1);
      const target   = document.getElementById(targetId);
      if (!target) return;
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
      const offset = navbar.offsetHeight + 8;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
      setActiveLink(link);
    });
  });

  const cta = document.querySelector('.hero-cta');
  if (cta) {
    cta.addEventListener('click', e => {
      e.preventDefault();
      const lista = document.getElementById('lista');
      if (lista) {
        const top = lista.getBoundingClientRect().top + window.scrollY - navbar.offsetHeight - 8;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  }

  updateActiveLink();
}

function setActiveLink(activeEl) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  if (activeEl) activeEl.classList.add('active');
}

function updateActiveLink() {
  const sections = ['lista', 'submissions', 'leaderboard', 'donaciones'];
  const navbar   = document.getElementById('navbar');
  const offset   = navbar.offsetHeight + 60;
  let current    = '';

  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.getBoundingClientRect().top <= offset) current = id;
  });

  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.getAttribute('data-section') === current);
  });
}

// ─── SMOOTH SCROLL ───
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    if (a.classList.contains('nav-link')) return;
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1);
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      const navbar = document.getElementById('navbar');
      const top = el.getBoundingClientRect().top + window.scrollY - (navbar ? navbar.offsetHeight + 8 : 70);
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
}

// ─── PARTICLES ───
function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;

  // Respeta accesibilidad y dispositivos de bajo rendimiento
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) { canvas.style.display = 'none'; return; }

  const ctx = canvas.getContext('2d', { alpha: true });
  let W, H, particles = [];
  // Menos partículas y un límite de conexiones por partícula en vez de O(n²) completo
  const N = window.innerWidth < 768 ? 22 : 36;
  const MAX_LINK_DIST = 100;
  const MAX_LINK_DIST_SQ = MAX_LINK_DIST * MAX_LINK_DIST;

  let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

  function resize() {
    W = canvas.width  = Math.floor(window.innerWidth * dpr);
    H = canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width  = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(resize, 150);
  }, { passive: true });

  for (let i = 0; i < N; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.4 + .3,
      vx: (Math.random() - .5) * .35,
      vy: (Math.random() - .5) * .35,
      a: Math.random() * .5 + .15,
      hue: Math.random() > .6 ? 280 : 350
    });
  }

  let running = true;
  let rafId = null;

  function frame() {
    if (!running) return;
    const w = window.innerWidth, h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue},80%,70%,${p.a})`;
      ctx.fill();
    });

    // Conexiones limitadas: cada partícula busca solo su próximo vecino más cercano
    // dentro del radio, evitando el costo cuadrático completo
    for (let i = 0; i < particles.length; i++) {
      let linksDrawn = 0;
      for (let j = i + 1; j < particles.length && linksDrawn < 3; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dSq = dx * dx + dy * dy;
        if (dSq < MAX_LINK_DIST_SQ) {
          const d = Math.sqrt(dSq);
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(139,92,246,${.08 * (1 - d / MAX_LINK_DIST)})`;
          ctx.lineWidth = .5;
          ctx.stroke();
          linksDrawn++;
        }
      }
    }

    rafId = requestAnimationFrame(frame);
  }

  // Pausar cuando la pestaña no está visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
    } else if (!running) {
      running = true;
      frame();
    }
  });

  // Pausar cuando el canvas sale del viewport (ej. al scrollear mucho hacia abajo)
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !document.hidden) {
          if (!running) { running = true; frame(); }
        } else {
          running = false;
          if (rafId) cancelAnimationFrame(rafId);
        }
      });
    }, { threshold: 0 });
    io.observe(canvas);
  }

  frame();
}

// ─── BACK TO TOP (QOL) ───
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('backToTop');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 600);
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
});

// ─── KEYBOARD NAV FOR LEVEL MODAL VICTORS (QOL) ───
document.addEventListener('keydown', e => {
  const modal = document.getElementById('levelDetailModal');
  if (!modal?.classList.contains('active')) return;
  if (e.key === 'ArrowLeft')  document.getElementById('lmPrevBtn')?.click();
  if (e.key === 'ArrowRight') document.getElementById('lmNextBtn')?.click();
});

// ─── CUSTOM SCROLLBAR FLUIDA ───
(function () {
  let bar, thumb, track;
  let rafId = null, isDragging = false;
  let dragStartY = 0, dragStartSc = 0;
  let hideTimer = null;

  function scrollMax() { return document.documentElement.scrollHeight - window.innerHeight; }
  function scrollRatio() { const m = scrollMax(); return m > 0 ? window.scrollY / m : 0; }
  function thumbH() {
    const ratio = window.innerHeight / document.documentElement.scrollHeight;
    return Math.max(32, Math.min((window.innerHeight - 20) * .9, ratio * (window.innerHeight - 20)));
  }

  function paint() {
    if (!thumb) return;
    const trackH = window.innerHeight - 20;
    const h      = thumbH();
    const top    = 10 + scrollRatio() * (trackH - h);
    thumb.style.top    = top + 'px';
    thumb.style.height = h   + 'px';
  }

  function show() {
    if (!bar) return;
    if (scrollMax() < 4) { bar.classList.remove('visible'); return; }
    bar.classList.add('visible');
    clearTimeout(hideTimer);
    if (!isDragging) hideTimer = setTimeout(() => bar.classList.remove('visible'), 1400);
  }

  function onScroll() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = null; paint(); show(); });
  }

  function startDrag(clientY) {
    isDragging  = true;
    dragStartY  = clientY;
    dragStartSc = window.scrollY;
    thumb.classList.add('dragging');
    document.body.style.userSelect = 'none';
    clearTimeout(hideTimer);
    bar.classList.add('visible');
  }

  function moveDrag(clientY) {
    if (!isDragging) return;
    const trackH = window.innerHeight - 20;
    const maxTop = trackH - thumbH();
    const ratio  = maxTop > 0 ? (clientY - dragStartY) / maxTop : 0;
    window.scrollTo({ top: Math.max(0, Math.min(scrollMax(), dragStartSc + ratio * scrollMax())) });
  }

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    thumb.classList.remove('dragging');
    document.body.style.userSelect = '';
    hideTimer = setTimeout(() => bar.classList.remove('visible'), 1000);
  }

  function init() {
    if (document.getElementById('custom-scrollbar')) return;
    bar = document.createElement('div');
    bar.id = 'custom-scrollbar';
    bar.innerHTML = '<div id="custom-scrollbar-track"></div><div id="custom-scrollbar-thumb"></div>';
    document.body.appendChild(bar);
    thumb = document.getElementById('custom-scrollbar-thumb');
    track = document.getElementById('custom-scrollbar-track');

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { paint(); show(); }, { passive: true });

    thumb.addEventListener('mousedown', e => { e.preventDefault(); startDrag(e.clientY); });
    document.addEventListener('mousemove', e => moveDrag(e.clientY));
    document.addEventListener('mouseup', endDrag);

    track.addEventListener('click', e => {
      if (e.target === thumb) return;
      const r = track.getBoundingClientRect();
      window.scrollTo({ top: ((e.clientY - r.top) / r.height) * scrollMax(), behavior: 'smooth' });
    });

    // Touch
    let tStartY = 0, tStartSc = 0;
    thumb.addEventListener('touchstart', e => {
      tStartY = e.touches[0].clientY; tStartSc = window.scrollY;
      isDragging = true; thumb.classList.add('dragging');
      clearTimeout(hideTimer);
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (!isDragging) return;
      const trackH = window.innerHeight - 20;
      const delta  = e.touches[0].clientY - tStartY;
      window.scrollTo({ top: Math.max(0, Math.min(scrollMax(), tStartSc + (delta / (trackH - thumbH())) * scrollMax())) });
    }, { passive: true });
    document.addEventListener('touchend', () => {
      isDragging = false; thumb.classList.remove('dragging');
      hideTimer = setTimeout(() => bar.classList.remove('visible'), 1000);
    });

    paint();
  }

  // API para ocultar/mostrar desde admin/modales
  window._scrollbarSetVisible = v => {
    if (!bar) return;
    if (!v) { clearTimeout(hideTimer); bar.classList.remove('visible'); bar.style.pointerEvents = 'none'; }
    else    { bar.style.pointerEvents = ''; paint(); show(); }
  };

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();

// ─── CUSTOM SCROLLBAR ───
(function () {
  function initCustomScrollbar() {
    // Crear el elemento si no existe
    if (document.getElementById('custom-scrollbar')) return;
    const bar = document.createElement('div');
    bar.id = 'custom-scrollbar';
    bar.innerHTML = `<div id="custom-scrollbar-track"></div><div id="custom-scrollbar-thumb"></div>`;
    document.body.appendChild(bar);

    const thumb = document.getElementById('custom-scrollbar-thumb');
    const track = document.getElementById('custom-scrollbar-track');

    function updateThumb() {
      const scrollTop  = window.scrollY;
      const docHeight  = document.documentElement.scrollHeight - window.innerHeight;
      const trackH     = window.innerHeight - 16; // 8px padding top+bottom
      const minThumb   = 40;
      const ratio      = docHeight > 0 ? window.innerHeight / document.documentElement.scrollHeight : 1;
      const thumbH     = Math.max(minThumb, ratio * trackH);
      const maxTop     = trackH - thumbH;
      const thumbTop   = docHeight > 0 ? (scrollTop / docHeight) * maxTop : 0;

      thumb.style.height = thumbH + 'px';
      thumb.style.top    = (8 + thumbTop) + 'px'; // 8px offset for top padding

      // Ocultar si la página no es scrolleable
      bar.style.opacity = docHeight > 10 ? '1' : '0';
    }

    window.addEventListener('scroll', updateThumb, { passive: true });
    window.addEventListener('resize', updateThumb, { passive: true });
    updateThumb();

    // Drag
    let isDragging = false, startY = 0, startScroll = 0;

    thumb.addEventListener('mousedown', e => {
      isDragging  = true;
      startY      = e.clientY;
      startScroll = window.scrollY;
      thumb.classList.add('dragging');
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const trackH    = window.innerHeight - 16;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const ratio     = Math.max(40, (window.innerHeight / document.documentElement.scrollHeight) * trackH);
      const maxTop    = trackH - ratio;
      const delta     = e.clientY - startY;
      const scrollDelta = (delta / maxTop) * docHeight;
      window.scrollTo({ top: startScroll + scrollDelta });
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      thumb.classList.remove('dragging');
      document.body.style.userSelect = '';
    });

    // Click en el track para saltar
    track.addEventListener('click', e => {
      if (e.target === thumb) return;
      const rect      = track.getBoundingClientRect();
      const clickPos  = e.clientY - rect.top;
      const trackH    = rect.height;
      const ratio     = clickPos / trackH;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: ratio * docHeight, behavior: 'smooth' });
    });

    // Touch support
    let touchStart = 0, touchScroll = 0;
    thumb.addEventListener('touchstart', e => {
      touchStart  = e.touches[0].clientY;
      touchScroll = window.scrollY;
      thumb.classList.add('dragging');
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (!thumb.classList.contains('dragging')) return;
      const trackH    = window.innerHeight - 16;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const thumbH    = Math.max(40, (window.innerHeight / document.documentElement.scrollHeight) * trackH);
      const maxTop    = trackH - thumbH;
      const delta     = e.touches[0].clientY - touchStart;
      const scrollDelta = (delta / maxTop) * docHeight;
      window.scrollTo({ top: touchScroll + scrollDelta });
    }, { passive: true });
    document.addEventListener('touchend', () => {
      thumb.classList.remove('dragging');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomScrollbar);
  } else {
    initCustomScrollbar();
  }
})();

// ─── Reubicar botones de paneles (Manager/Admin/Sanciones) en mobile ───
// para liberar la esquina superior derecha y que el widget flotante del
// usuario sea siempre accesible, sin estar tapado por esos botones.
function relocatePanelButtonsForViewport() {
  const isMobile   = window.innerWidth <= 640;
  const mobileSlot = document.getElementById('navLinksPanelsMobile');
  const navRight   = document.querySelector('.nav-right');
  const buttons    = ['navOwnerBtn', 'navAdminBtn', 'navSanctionsBtn']
    .map(id => document.getElementById(id))
    .filter(Boolean);

  if (!mobileSlot || !navRight || !buttons.length) return;

  buttons.forEach(btn => {
    const targetParent = isMobile ? mobileSlot : navRight;
    if (btn.parentElement !== targetParent) {
      if (!isMobile) {
        const loginBtn = navRight.querySelector('.login-btn');
        if (loginBtn) navRight.insertBefore(btn, loginBtn);
        else navRight.appendChild(btn);
      } else {
        mobileSlot.appendChild(btn);
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', relocatePanelButtonsForViewport);
window.addEventListener('resize', () => {
  clearTimeout(window._panelRelocateDebounce);
  window._panelRelocateDebounce = setTimeout(relocatePanelButtonsForViewport, 150);
});