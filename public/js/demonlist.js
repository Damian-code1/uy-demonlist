// DEMONLIST.JS

let filteredLevels   = [];
let currentView      = localStorage.getItem('preferredView') || 'list';
let activeModalLevel = null;
let activeVictorIdx  = 0;
let _lmGdStatsCache = {};
let favoritesView    = false;
let userFavorites    = JSON.parse(localStorage.getItem('favorites') || '[]');

async function syncFavoritesWithDB() {
  if (!window.currentUser) return;
  const discordId = localStorage.getItem('uy_discord_id');
  if (!discordId) return;
  try {
    const res  = await fetch('/api/admin/users/favorites', {
      headers: { 'x-discord-id': discordId }
    });
    const data = await res.json();
    if (Array.isArray(data.favorites)) {
      userFavorites = data.favorites;
      localStorage.setItem('favorites', JSON.stringify(userFavorites));
    }
  } catch {}
}

async function toggleFavoriteDB(levelId) {
  const idx    = userFavorites.indexOf(levelId);
  const action = idx >= 0 ? 'remove' : 'add';
  if (idx >= 0) userFavorites.splice(idx, 1); else userFavorites.push(levelId);
  localStorage.setItem('favorites', JSON.stringify(userFavorites));

  if (window.currentUser) {
    const discordId = localStorage.getItem('uy_discord_id');
    if (discordId) {
      try {
        await fetch('/api/admin/users/favorites', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-discord-id': discordId
          },
          body: JSON.stringify({ levelId, action })
        });
      } catch {}
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  showLevelsLoader();
  await loadData();
  await loadAredlMap();
  syncHeroStats();
  await syncFavoritesWithDB();
  renderLevels();
  setupSearch();
  setupViewToggles();
  setupFavoritesToggle();
  setupLevelModal();
  renderLeaderboard();
  setupPlayerSearch();
  loadDiscordWidget();
  addDiscordLinks();
  loadFooterCredits();
  setupSubmissionAutocomplete();
});

function syncHeroStats() {
  const { totalLevels, totalPlayers, totalCompletions } = getGlobalStats();
  animateCounter(document.getElementById('statLevels'),      totalLevels);
  animateCounter(document.getElementById('statPlayers'),     totalPlayers);
  animateCounter(document.getElementById('statCompletions'), totalCompletions);
}

function showLevelsLoader() {
  const c = document.getElementById('levelsContainer');
  if (c) c.innerHTML = `<div class="loader-wrap"><i class="fas fa-spinner fa-spin"></i><span>Cargando niveles…</span></div>`;
}

function renderLevels() {
  filteredLevels = [...getLevelsData()];
  paintCards(filteredLevels);
}

function paintCards(levels, animated = true) {
  const container = document.getElementById('levelsContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!levels.length) {
    container.innerHTML = `<div class="loader-wrap"><i class="fas fa-search"></i><span>No se encontraron niveles</span></div>`;
    return;
  }
  container.classList.toggle('grid-view', currentView === 'grid');

  const fragment = document.createDocumentFragment();
  const cardEls  = [];
  const firstLegacyIdx = levels.findIndex(l => l.legacy);
  let dividerInserted  = false;

  levels.forEach((level, i) => {
    // Separador antes del primer nivel legacy
    if (!dividerInserted && level.legacy && i === firstLegacyIdx) {
      const divider = document.createElement('div');
      divider.className = 'legacy-divider';
      divider.innerHTML = `
        <div class="legacy-divider-line"></div>
        <div class="legacy-divider-badge">
          <i class="fas fa-history"></i>
          <span>LEGACY LIST</span>
          <span class="legacy-divider-sub">Insane Demons · sin puntos</span>
        </div>
        <div class="legacy-divider-line"></div>
      `;
      fragment.appendChild(divider);
      dividerInserted = true;
    }
    const card = buildCard(level, i);
    fragment.appendChild(card);
    cardEls.push(card);
  });
  container.appendChild(fragment);

  if (!animated) return;

  
  const firstScreenCount = 14;
  cardEls.slice(0, firstScreenCount).forEach((card, i) => {
    gsap.from(card, { opacity: 0, y: 12, duration: .35, ease: 'power3.out', delay: Math.min(i * .02, .35) });
  });

  if (cardEls.length <= firstScreenCount) return;

  cardEls.slice(firstScreenCount).forEach(card => {
    card.style.opacity = '1';
  });

  const lazyObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      gsap.fromTo(entry.target,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: .3, ease: 'power3.out' }
      );
      obs.unobserve(entry.target);
    });
  }, { rootMargin: '200px 0px', threshold: 0 });

  cardEls.slice(firstScreenCount).forEach(card => lazyObserver.observe(card));
}


const POINTS_MAX           = 1000;
const POINTS_MIN           = 1;
const POINTS_MAX_POSITION_REF = 250; // techo de referencia fijo (no recalibra puntos si la lista crece/encoge)
const POINTS_EXPONENT       = 3;

function computeAutoPoints(position) {
  const pos  = Math.min(position || 1, POINTS_MAX_POSITION_REF);
  const frac = (POINTS_MAX_POSITION_REF - pos) / (POINTS_MAX_POSITION_REF - 1);
  return Math.max(POINTS_MIN, Math.round(POINTS_MIN + (POINTS_MAX - POINTS_MIN) * Math.pow(frac, POINTS_EXPONENT)));
}
window.computeAutoPoints = computeAutoPoints;

function levelPoints(level) {
  if (level.points != null) return level.points;
  return computeAutoPoints(level.position || 1);
}

function levelTierAccent(pos) {
  if (pos <= 10) {
    const t = (pos - 1) / 9;
    return `hsl(${Math.round(16 - t * 16)}, 90%, ${Math.round(58 - t * 5)}%)`; // ascua → rojo intenso
  }
  if (pos <= 75) {
    const t = (pos - 11) / 64;
    return `hsl(${Math.round(272 - t * 16)}, 78%, ${Math.round(65 - t * 7)}%)`; // violeta
  }
  if (pos <= 150) {
    const t = (pos - 76) / 74;
    return `hsl(${Math.round(206 - t * 16)}, 75%, ${Math.round(58 - t * 8)}%)`; // celeste
  }
  const restTotal = Math.max((getLevelsData().length || 250) - 150, 1);
  const t = Math.min((pos - 151) / restTotal, 1);
  return `hsl(${Math.round(150 - t * 55)}, 45%, ${Math.round(44 - t * 6)}%)`; // verde → gris-verde apagado
}
window.levelTierAccent = levelTierAccent;

function levelTierBodyColor(pos) {
  if (pos <= 10) {
    const t = (pos - 1) / 9;
    return `hsl(${Math.round(16 - t * 16)}, 55%, ${Math.round(16 - t * 3)}%)`; // ascua → rojo, oscuro
  }
  if (pos <= 75) {
    const t = (pos - 11) / 64;
    return `hsl(${Math.round(272 - t * 16)}, 42%, ${Math.round(15 - t * 2)}%)`; // violeta oscuro
  }
  if (pos <= 150) {
    const t = (pos - 76) / 74;
    return `hsl(${Math.round(206 - t * 16)}, 38%, ${Math.round(14 - t * 2)}%)`; // celeste oscuro
  }
  const restTotal = Math.max((getLevelsData().length || 250) - 150, 1);
  const t = Math.min((pos - 151) / restTotal, 1);
  return `hsl(${Math.round(150 - t * 55)}, 26%, ${Math.round(13 - t * 2)}%)`; // verde apagado, oscuro
}
window.levelTierBodyColor = levelTierBodyColor;


function buildCard(level, index) {
  const pos      = level.position || (index + 1);
  const victors  = level.victors || [];
  const aredlPos  = (!level.legacy && level.aredl_position) ? level.aredl_position : null;
  const thumb     = level.thumb_url || null;
  const pts       = level.legacy ? null : levelPoints(level);

  const isFav = userFavorites.includes(level.id);
  const isNew     = !!level.isNew;
  const isNewTop1 = !!level.isNewTop1;

  const card = document.createElement('div');
  const topPosClass = pos === 1 ? ' level-card-first' : pos === 2 ? ' level-card-second' : pos === 3 ? ' level-card-third' : '';
  card.className = `level-card${pos <= 3 ? ' top-3' : ''}${topPosClass}`;
  card.dataset.id = level.id;
  card.tabIndex = 0;

  let rankHtml;
  if (pos === 1) {
    rankHtml = `<div class="lc-rank lc-rank-medal lc-rank-gold" aria-label="Posición 1">
      <i class="fas fa-crown"></i><span class="lc-rank-num">1</span>
    </div>
    <div class="lc-fire-border">
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
    </div>`;
  } else if (pos === 2) {
    rankHtml = `<div class="lc-rank lc-rank-medal lc-rank-silver" aria-label="Posición 2">
      <i class="fas fa-medal"></i><span class="lc-rank-num">2</span>
    </div>
    <div class="lc-fire-border silver">
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
    </div>`;
  } else if (pos === 3) {
    rankHtml = `<div class="lc-rank lc-rank-medal lc-rank-bronze" aria-label="Posición 3">
      <i class="fas fa-medal"></i><span class="lc-rank-num">3</span>
    </div>
    <div class="lc-fire-border bronze">
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
      <span class="lc-fire-spark"></span>
    </div>`;
  } else if (level.legacy) {
    rankHtml = `<div class="lc-rank lc-rank-legacy" aria-label="Nivel legacy"><span class="lc-rank-legacy-label">LEGACY</span></div>`;
  } else {
    rankHtml = `<div class="lc-rank" aria-label="Posición ${pos}"><span class="lc-rank-num">#${pos}</span></div>`;
  }

    const firstVictorName = victors[0]?.name || null;
  const extraVictors    = victors.length > 1 ? victors.length - 1 : 0;

  const cardBodyColor = levelTierBodyColor(pos);
  const cardAccent    = levelTierAccent(pos);
  card.style.setProperty('--card-accent', cardAccent);
  card.style.setProperty('--card-body-color', cardBodyColor);

  card.innerHTML = `
    <button class="lc-fav-btn${isFav ? ' active' : ''}" data-id="${level.id}" title="${isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}">
      <i class="fa${isFav ? 's' : 'r'} fa-star"></i>
    </button>

    ${thumb
      ? `<img class="lc-thumb" src="${thumb}" alt=""
           data-fallback="${level.thumb_url_fallback || ''}"
           onerror="
             var fb=this.dataset.fallback;
             if(fb&&this.src!==fb){this.src=fb;return;}
             this.style.display='none';
             var ph=this.parentElement.querySelector('.lc-thumb-ph');
             if(ph){ph.style.display='flex';}
           ">`
      : ``
    }
    <div class="lc-thumb lc-thumb-ph" style="${thumb ? 'display:none' : ''}"></div>

    ${rankHtml}

    <div class="lc-body">
      <div class="lc-title-row">
        <h3 class="lc-name">${esc(level.name)}</h3>
        <div class="lc-badges">
          ${aredlPos ? `<span class="aredl-pos" title="Posición en AREDL (lista global)"><i class="fas fa-globe"></i>#${aredlPos}</span>` : ''}
          ${isNewTop1
            ? `<span class="lc-top1-badge"><i class="fas fa-fire"></i><span class="lc-top1-label">TOP 1</span><span class="lc-top1-spark"></span><span class="lc-top1-spark"></span><span class="lc-top1-spark"></span><span class="lc-top1-spark"></span><span class="lc-top1-spark"></span></span>`
            : (isNew ? `<span class="lc-new-badge">NUEVO</span>` : '')}
        </div>
      </div>

      <div class="lc-meta-row">
        <span class="lc-victor-count" title="${victors.length} completion${victors.length !== 1 ? 's' : ''}">
          <i class="fas fa-flag-checkered"></i>${victors.length}
        </span>
        ${firstVictorName
          ? `<span class="lc-first-victor">
               <i class="fas fa-user" style="font-size:.65rem;opacity:.6"></i>
               ${esc(firstVictorName)}${extraVictors > 0 ? ` <span class="lc-extra-victors">+${extraVictors}</span>` : ''}
             </span>`
          : ''
        }
        ${pts !== null
          ? `<span class="lc-pts-badge" title="Puntos por esta completion">
               <i class="fas fa-star"></i>${pts.toLocaleString()} pts
             </span>`
          : `<span class="lc-pts-badge lc-pts-legacy" title="Nivel legacy — no otorga puntos">
               <i class="fas fa-archive"></i>Legacy
             </span>`
        }
      </div>
    </div>
  `;

  card.querySelector('.lc-fav-btn')?.addEventListener('click', async e => {
    e.stopPropagation();
    await toggleFavoriteDB(level.id);
    paintCards(favoritesView
      ? getLevelsData().filter(l => userFavorites.includes(l.id))
      : filteredLevels, false);
  });

  card.addEventListener('click', () => openLevelModal(level));
  card.addEventListener('keydown', e => { if (e.key === 'Enter') openLevelModal(level); });

  return card;
}


function setupLevelModal() {
  const modal = document.getElementById('levelDetailModal');
  modal?.querySelector('.modal-backdrop')?.addEventListener('click', closeLevelDetailModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLevelDetailModal(); });
}

async function openLevelModal(level, opts = {}) {
  const modal = document.getElementById('levelDetailModal');
  if (!modal) return;

  activeModalLevel = level;
  activeVictorIdx  = 0;

  if (opts.targetVictorName) {
    const norm = s => (s || '').trim().toLowerCase();
    const foundIdx = (level.victors || []).findIndex(v => norm(v.name) === norm(opts.targetVictorName));
    if (foundIdx !== -1) activeVictorIdx = foundIdx;
  }

  _lmCurrentVideoId  = null;
  _lmCurrentVideoUrl = null;

  renderModalContent(level);
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  if (_lmGdStatsCache[level.id]) {
    paintGdStats(_lmGdStatsCache[level.id]);
  }

  const gd = level.gd_level_id
    ? await fetchGdBrowserInfoById(level.gd_level_id)
    : await fetchGdBrowserInfo(level.name);
  if (gd && activeModalLevel === level) {
    _lmGdStatsCache[level.id] = gd;
    paintGdStats(gd);
  }
}

function paintGdStats(gd) {
  const statsEl = document.getElementById('lmGdStats');
  if (!statsEl) return;
  statsEl.innerHTML = buildGdStatsHtml(gd);
  statsEl.style.display = 'flex';
}


const _DF = 'https://autonick.github.io/diff-faces';

const _DF_DIFF_MAP = {
  'na': 'na', 'auto': 'auto', 'easy': 'easy', 'normal': 'normal',
  'hard': 'hard', 'harder': 'harder', 'insane': 'insane',
  'easy demon': 'easyDemon', 'medium demon': 'mediumDemon',
  'hard demon': 'hardDemon', 'insane demon': 'insaneDemon',
  'extreme demon': 'extremeDemon',
};

function _dfBuildUrl(gd) {
  const diff   = _DF_DIFF_MAP[(gd.difficulty || '').toLowerCase().trim()] || 'extremeDemon';
  const type   = gd.mythic ? 'mythic' : gd.legendary ? 'legendary' : gd.epic ? 'epic' : gd.featured ? 'feature' : 'none';
  const n      = Math.min(gd.coins || 0, 3);
  const coins  = n === 0 ? 'none' : `${n}${gd.verifiedCoins ? 'v' : 'u'}`;
  const rating = gd.stars ? `${Math.min(gd.stars, 10)}s` : gd.moons ? `${Math.min(gd.moons, 10)}m` : 'none';
  return `${_DF}/levels/${type}/${diff}/${coins}/${rating}.png`;
}

function buildGdStatsHtml(gd) {
  const diffFaceUrl = _dfBuildUrl(gd);
  const thumbUrl    = gd.id ? `https://gd-level-api.liamt.xyz/thumbnail/${gd.id}` : null;

  const ratingLabel = gd.mythic ? 'Mythic' : gd.legendary ? 'Legendary'
    : gd.epic ? 'Epic' : gd.featured ? 'Featured'
    : gd.stars ? 'Rated' : 'Sin rating';
  const ratingClass = gd.mythic ? 'mythic' : gd.legendary ? 'legendary'
    : gd.epic ? 'epic' : gd.featured ? 'featured'
    : gd.stars ? 'rated' : 'unrated';

  const chips = [];
  if (gd.author)    chips.push(`<span class="lm-gd-chip"><i class="fas fa-user-edit"></i> ${esc(gd.author)}</span>`);
  if (gd.length)    chips.push(`<span class="lm-gd-chip"><i class="fas fa-ruler-horizontal"></i> ${esc(gd.length)}</span>`);
  if (gd.song)      chips.push(`<span class="lm-gd-chip"><i class="fas fa-music"></i> ${esc(gd.song)}</span>`);
  if (gd.objects)   chips.push(`<span class="lm-gd-chip"><i class="fas fa-cube"></i> ${Number(gd.objects).toLocaleString()} obj</span>`);
  if (gd.downloads) chips.push(`<span class="lm-gd-chip"><i class="fas fa-download"></i> ${Number(gd.downloads).toLocaleString()}</span>`);
  if (gd.likes)     chips.push(`<span class="lm-gd-chip"><i class="fas fa-thumbs-up"></i> ${Number(gd.likes).toLocaleString()}</span>`);

  return `
  <div class="lm-gd-divider"></div>
  <div class="lm-gd-ingame-card">
    <div class="lm-gd-ingame-left">
      <div class="lm-gd-face-col">
        <img class="lm-gd-face-img"
          src="${diffFaceUrl}"
          onerror="this.closest('.lm-gd-face-col').style.display='none'"
          alt="${esc(gd.difficulty || 'Extreme Demon')}">
      </div>
      <div class="lm-gd-ingame-info">
        <div class="lm-gd-ingame-diff">${esc(gd.difficulty || 'Extreme Demon')}</div>
        <div class="lm-gd-ingame-rating lm-gd-rating-${ratingClass}">${ratingLabel}</div>
      </div>
    </div>
    ${thumbUrl ? `
    <div class="lm-gd-thumb-wrap" onclick="openThumbPopup('${esc(thumbUrl)}')" title="Ver thumbnail completa">
      <img class="lm-gd-thumb" src="${thumbUrl}" loading="lazy"
        onerror="this.closest('.lm-gd-thumb-wrap').style.display='none'">
    </div>` : ''}
  </div>
  ${chips.length ? `<div class="lm-gd-chips-row">${chips.join('')}</div>` : ''}`;
}

let _lmCurrentVideoId  = null;
let _lmCurrentVideoUrl = null;

function renderLmPlayer(videoId, videoUrl) {
  const wrap = document.querySelector('#levelDetailModal .lm-player-wrap');
  if (!wrap) return;
  wrap.innerHTML = videoId
    ? `<iframe
         src="https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}"
         frameborder="0"
         loading="lazy"
         allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
         allowfullscreen
         title="Video del nivel"></iframe>`
    : videoUrl
      ? (() => {
          const plat = typeof detectVideoPlatform === 'function' ? detectVideoPlatform(videoUrl) : null;
          return `<div class="lm-external-video" style="background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;min-height:200px">
            <i class="${plat?.icon || 'fas fa-play-circle'}" style="font-size:2.5rem;color:${plat?.color || 'var(--violet)'}"></i>
            <a href="${esc(videoUrl)}" target="_blank" rel="noopener" class="lm-external-btn" style="font-size:.95rem;padding:12px 24px;background:${plat?.color || 'var(--violet)'};color:#fff;border-radius:8px;text-decoration:none;display:flex;align-items:center;gap:8px;font-weight:600">
              <i class="fas fa-external-link-alt"></i> Ver en ${plat?.label || 'video'}
            </a>
          </div>`;
        })()
      : `<div class="lm-no-video"><i class="fas fa-video-slash"></i><p>Sin video disponible</p></div>`;
}

function renderModalContent(level, opts = {}) {
  const modal = document.getElementById('levelDetailModal');
  const box   = modal.querySelector('.level-modal-box');
  const pos      = level.position;
  const victors  = level.victors || [];
  const aredlPos = level.aredl_position || null;
  const isAdmin  = typeof isAdminUser === 'function' && isAdminUser();

  const idx      = victors[activeVictorIdx] ? activeVictorIdx : 0;
  const current  = victors[idx] || null;
  
  const currentVideoUrl = current?.videoUrl || null;
  const isFirstVictor   = idx === 0;
  const videoUrl = currentVideoUrl
    || ((victors.length === 0 || isFirstVictor) ? (level.youtube_url || null) : null);
  const videoId  = videoUrl ? extractYTId(videoUrl) : null;

  
  const normId  = videoId  || null;
  const normUrl = videoUrl || null;
  
  const samePlayer = normId !== null
    ? normId === _lmCurrentVideoId
    : normUrl !== null && normUrl === _lmCurrentVideoUrl;
  const skipPlayerRerender = !!(opts.preservePlayer && samePlayer);

  
  const existingPlayerWrap = skipPlayerRerender
    ? box.querySelector('.lm-player-wrap')
    : null;
  if (existingPlayerWrap) existingPlayerWrap.remove(); 

  _lmCurrentVideoId  = videoId;
  _lmCurrentVideoUrl = videoUrl;

  box.innerHTML = `
    <button class="modal-close" id="levelModalClose"><i class="fas fa-times"></i></button>

    <div class="lm-player-wrap"></div>

    <div class="lm-body">
      <div class="lm-header-row">
        <div class="lm-rank-badge">${pos <= 3
          ? [
              `<i class="fas fa-crown" style="color:#f59e0b"></i>`,
              `<i class="fas fa-medal" style="color:#cbd5e1"></i>`,
              `<i class="fas fa-medal" style="color:#c2722a"></i>`,
            ][pos-1]
          : `#${pos}`
        }</div>
        <div>
          <h2 class="lm-title">${esc(level.name)}</h2>
          <div class="lm-badges">
            ${aredlPos ? `<span class="aredl-pos"><i class="fas fa-trophy"></i> AREDL #${aredlPos}</span>` : ''}
            <span class="lm-badge-vic"><i class="fas fa-flag-checkered"></i> ${victors.length} ${victors.length === 1 ? 'Victor' : 'Victors'}</span>
            ${!level.legacy ? `<span class="lm-badge-pts" style="user-select:none;-webkit-user-select:none"><i class="fas fa-star" style="color:#f59e0b;font-size:.7rem"></i> ${levelPoints(level).toLocaleString()} pts</span>` : ''}
          </div>
        </div>
        ${isAdmin ? `
        <button class="lm-edit-level-btn" onclick="closeLevelDetailModal();openAdminPanel();setTimeout(()=>loadAdminTab('levels'),200)">
          <i class="fas fa-pen"></i> Editar nivel
        </button>` : ''}
      </div>

      <div class="lm-gd-stats" id="lmGdStats" style="display:none"></div>
      ${level.gd_level_id ? `
      <div class="lm-level-id-row">
        <button class="lm-level-id-btn" id="copyLevelIdBtn" data-id="${level.gd_level_id}" title="Copiar ID al portapapeles">
          <span class="lm-level-id-label"><i class="fas fa-gamepad"></i> ID</span>
          <span class="lm-level-id-num">${level.gd_level_id}</span>
          <span class="lm-level-id-copy-hint"><i class="fas fa-copy"></i></span>
        </button>
      </div>` : ''}

      <h4 class="lm-section-title"><i class="fas fa-trophy"></i> Victors — click para ver su completion</h4>
      <div class="lm-victors-tabs" id="lmVictorsTabs">
        ${victors.length === 0
          ? `<p class="text-dim" style="font-size:.85rem">Sin victors aún</p>`
          : victors.map((v, i) => `
            <button class="lm-victor-tab${i === activeVictorIdx ? ' active' : ''}" data-idx="${i}">
              <span class="lm-victor-tab-num">${i + 1}</span>
              <span class="lm-victor-tab-name">${esc(v.name)}</span>
              ${isAdmin ? `<i class="fas fa-pen lm-victor-edit-icon" data-victor-id="${v.id}" data-victor-name="${esc(v.name)}" data-victor-video="${esc(v.videoUrl||'')}" title="Editar victor"></i>` : ''}
            </button>`).join('')}
      </div>

      ${victors.length > 1 ? `
      <div class="lm-nav-buttons">
        <button class="lm-nav-btn" id="lmPrevBtn"><i class="fas fa-chevron-left"></i> Anterior</button>
        <span class="lm-nav-count">${activeVictorIdx + 1} / ${victors.length}</span>
        <button class="lm-nav-btn" id="lmNextBtn">Siguiente <i class="fas fa-chevron-right"></i></button>
      </div>` : ''}

      <div class="lm-actions">
        <button class="submit-btn" style="max-width:280px" onclick="closeLevelDetailModal();scrollToSubmissions('${esc(level.name)}')">
          <i class="fas fa-paper-plane"></i> Enviar mi Completion
        </button>
      </div>

      <!-- Comentarios -->
      <div class="lm-comments-section" id="lmCommentsSection" data-level-id="${level.id}">
        <div class="lm-section-title" style="margin-top:1.25rem">
          <i class="fas fa-comments"></i> COMENTARIOS
        </div>
        <div id="lmCommentsList" class="lm-comments-list">
          <div class="lm-comments-loading"><i class="fas fa-spinner fa-spin"></i></div>
        </div>
        <div class="lm-comment-form" id="lmCommentForm">
          <div class="lm-comment-input-wrap">
            <textarea id="lmCommentInput" class="lm-comment-input" placeholder="Escribí tu comentario sobre este nivel… (máx. 500 caracteres)" maxlength="500" rows="2"></textarea>
            <div class="lm-comment-form-footer">
              <span class="lm-comment-char-count" id="lmCommentCount">0/500</span>
              <button class="lm-comment-submit" id="lmCommentSubmit">
                <i class="fas fa-paper-plane"></i> Comentar
              </button>
            </div>
          </div>
        </div>
        <div class="lm-comment-login-prompt" id="lmCommentLoginPrompt" style="display:none">
          <i class="fas fa-lock"></i> Iniciá sesión para comentar
        </div>
      </div>
    </div>`;

  if (existingPlayerWrap) {
    box.querySelector('.lm-player-wrap')?.replaceWith(existingPlayerWrap);
  } else {
    renderLmPlayer(videoId, videoUrl);
  }

  // Cargar comentarios del nivel
  setTimeout(() => initLevelComments(level.id), 50);

  if (_lmGdStatsCache[level.id]) {
    paintGdStats(_lmGdStatsCache[level.id]);
  }

  box.querySelector('#levelModalClose')?.addEventListener('click', closeLevelDetailModal);

  box.querySelector('#copyLevelIdBtn')?.addEventListener('click', function() {
    const id = this.dataset.id;
    navigator.clipboard.writeText(id).then(() => {
      const orig = this.innerHTML;
      this.innerHTML = '<i class="fas fa-check"></i> Copiado';
      this.classList.add('copied');
      if (typeof showToast === 'function') showToast('ID copiado: ' + id, 'success');
      setTimeout(() => { this.innerHTML = orig; this.classList.remove('copied'); }, 1800);
    }).catch(() => {
      if (typeof showToast === 'function') showToast('No se pudo copiar', 'error');
    });
  });

 
  box.querySelectorAll('.lm-victor-tab').forEach(tab => {
    tab.addEventListener('click', e => {
      if (e.target.closest('.lm-victor-edit-icon')) return; // handled separately
      activeVictorIdx = parseInt(tab.dataset.idx);
      renderModalContent(level);
    });
  });

  
  if (isAdmin) {
    box.querySelectorAll('.lm-victor-edit-icon').forEach(icon => {
      icon.addEventListener('click', e => {
        e.stopPropagation();
        const id    = icon.dataset.victorId;
        const name  = icon.dataset.victorName;
        const video = icon.dataset.victorVideo;
        closeLevelDetailModal();
        openAdminPanel();
        setTimeout(() => {
          loadAdminTab('victors');
          setTimeout(() => openVictorModal(id, name, video), 250);
        }, 200);
      });
    });
  }

  // Prev/next nav
  box.querySelector('#lmPrevBtn')?.addEventListener('click', () => {
    activeVictorIdx = (activeVictorIdx - 1 + victors.length) % victors.length;
    renderModalContent(level);
  });
  box.querySelector('#lmNextBtn')?.addEventListener('click', () => {
    activeVictorIdx = (activeVictorIdx + 1) % victors.length;
    renderModalContent(level);
  });
}

function closeLevelDetailModal() {
  document.getElementById('levelDetailModal')?.classList.remove('active');
  document.body.style.overflow = '';
  activeModalLevel = null;
  _lmCurrentVideoId  = null;
  _lmCurrentVideoUrl = null;
  _lmGdStatsCache    = {};

  const playerWrap = document.querySelector('#levelDetailModal .lm-player-wrap');
  if (playerWrap) playerWrap.innerHTML = '';
}

function refreshOpenLevelModal(levelId) {
  const modal = document.getElementById('levelDetailModal');
  if (!modal?.classList.contains('active') && !levelId) return;

  const targetId = levelId || activeModalLevel?.id;
  if (!targetId) return;

  const fresh = getLevelsData().find(l => l.id === targetId || l.id === parseInt(targetId, 10));
  if (!fresh) return;

  activeModalLevel = fresh;
  if (activeVictorIdx >= (fresh.victors?.length || 0)) {
    activeVictorIdx = Math.max(0, (fresh.victors?.length || 1) - 1);
  }

  const existingIframe = modal.querySelector('.lm-player-wrap iframe');
  if (existingIframe && !_lmCurrentVideoId && !_lmCurrentVideoUrl) {
    const srcMatch = existingIframe.src?.match(/embed\/([a-zA-Z0-9_-]{11})/);
    if (srcMatch) {
      _lmCurrentVideoId  = srcMatch[1];
      _lmCurrentVideoUrl = `https://www.youtube.com/watch?v=${srcMatch[1]}`;
    }
  }

  renderModalContent(fresh, { preservePlayer: true });
}
window.refreshOpenLevelModal = refreshOpenLevelModal;


let _listFilter = 'all';

function setListFilter(filter, label, el) {
  _listFilter = filter;
  document.getElementById('listFilterLabel').textContent = label;
  document.querySelectorAll('.list-filter-option').forEach(b => b.classList.remove('active'));
  el?.classList.add('active');
  closeListFilterMenu();

  // Actualizar placeholder del input
  const input = document.getElementById('searchInput');
  if (input) {
    const placeholders = {
      all:       'Buscar nivel o jugador…',
      level:     'Buscar por nombre de nivel…',
      player:    'Buscar por jugador / victor…',
      top3:      '',
      withvideo: '',
    };
    input.placeholder = placeholders[filter] ?? 'Buscar…';
  }

  applyListSearch();
}
window.setListFilter = setListFilter;

function _ensureMenuInBody() {
  const menu = document.getElementById('listFilterMenu');
  if (!menu || menu.parentElement === document.body) return;
  document.body.appendChild(menu);
  menu.style.position = 'fixed';
  menu.style.zIndex   = '99999';
}

function _repositionListFilterMenu() {
  const btn  = document.getElementById('listFilterBtn');
  const menu = document.getElementById('listFilterMenu');
  if (!btn || !menu) return;
  const r = btn.getBoundingClientRect();
  menu.style.top  = (r.bottom + 8) + 'px';
  menu.style.left = r.left + 'px';
  const menuW = menu.offsetWidth || 200;
  if (r.left + menuW > window.innerWidth - 8) {
    menu.style.left = (window.innerWidth - menuW - 8) + 'px';
  }
}

function toggleListFilterMenu() {
  _ensureMenuInBody();
  const menu    = document.getElementById('listFilterMenu');
  const chevron = document.getElementById('listFilterChevron');
  const btn     = document.getElementById('listFilterBtn');
  if (!menu) return;
  const isOpen = menu.classList.contains('open');
  if (!isOpen) _repositionListFilterMenu();
  menu.classList.toggle('open', !isOpen);
  chevron?.classList.toggle('rotated', !isOpen);
  btn?.classList.toggle('open', !isOpen);
}
window.toggleListFilterMenu = toggleListFilterMenu;

function closeListFilterMenu() {
  document.getElementById('listFilterMenu')?.classList.remove('open');
  document.getElementById('listFilterChevron')?.classList.remove('rotated');
  document.getElementById('listFilterBtn')?.classList.remove('open');
}

document.addEventListener('click', e => {
  if (!e.target.closest('#listFilterDropdown') && !e.target.closest('#listFilterMenu')) {
    closeListFilterMenu();
  }
});

window.addEventListener('scroll', () => {
  if (document.getElementById('listFilterMenu')?.classList.contains('open')) {
    _repositionListFilterMenu();
  }
}, { passive: true });
window.addEventListener('resize', () => {
  if (document.getElementById('listFilterMenu')?.classList.contains('open')) {
    _repositionListFilterMenu();
  }
});

function applyListSearch() {
  const input = document.getElementById('searchInput');
  const q     = (input?.value || '').trim();
  const ql    = q.toLowerCase();

  const normalize = typeof normalizeForSearch === 'function'
    ? normalizeForSearch
    : s => s.replace(/[\uff01-\uff5e]/g, c =>
        String.fromCharCode(c.charCodeAt(0) - 0xfee0)
      ).replace(/\u3000/g, ' ').toLowerCase().trim();

  let base = [...getLevelsData()];

  // Filtros sin texto
  if (_listFilter === 'top3') {
    filteredLevels = base.filter(l => (l.position || 999) <= 3);
    paintCards(filteredLevels, false);
    return;
  }
  if (_listFilter === 'withvideo') {
    filteredLevels = base.filter(l =>
      l.youtube_url || (l.victors || []).some(v => v.videoUrl)
    );
    paintCards(filteredLevels, false);
    return;
  }

  if (!q) {
    filteredLevels = base;
    paintCards(filteredLevels, false);
    return;
  }

  const qlNorm = ql.replace(/\s+/g, '');
  const qlFull = normalize(ql);

  filteredLevels = base.filter(l => {
    const name     = l.name?.toLowerCase() || '';
    const nameNorm = name.replace(/\s+/g, '');
    const nameFull = normalize(l.name || '');

    const matchName = name.includes(ql) || nameNorm.includes(qlNorm) ||
      nameFull.includes(qlFull);

    const matchPlayer = (l.victors || []).some(v =>
      v.name?.toLowerCase().includes(ql)
    );

    if (_listFilter === 'level')  return matchName;
    if (_listFilter === 'player') return matchPlayer;
    return matchName || matchPlayer;
  });

  paintCards(filteredLevels, false);
}

function setupSearch() {
  const input    = document.getElementById('searchInput');
  const clearBtn = document.getElementById('listSearchClear');
  if (!input) return;
  let debounce;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (clearBtn) clearBtn.style.display = q ? '' : 'none';
    clearTimeout(debounce);
    debounce = setTimeout(applyListSearch, 200);
  });

  clearBtn?.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    filteredLevels = [...getLevelsData()];
    paintCards(filteredLevels, false);
    input.focus();
  });
}


function setupViewToggles() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === currentView);
    btn.addEventListener('click', () => {
      currentView = btn.dataset.view;
      localStorage.setItem('preferredView', currentView);
      document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b === btn));
      const toShow = favoritesView
        ? getLevelsData().filter(l => userFavorites.includes(l.id))
        : filteredLevels;
      paintCards(toShow, false);
    });
  });
}


function setupFavoritesToggle() {
  const btn = document.getElementById('favViewBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    favoritesView = !favoritesView;
    btn.classList.toggle('active', favoritesView);
    btn.title = favoritesView ? 'Ver todos los niveles' : 'Ver favoritos';
    btn.querySelector('i').className = favoritesView ? 'fas fa-star' : 'far fa-star';

    if (favoritesView) {
      const favLevels = getLevelsData().filter(l => userFavorites.includes(l.id));
      paintCards(favLevels, true);
    } else {
      paintCards(filteredLevels, true);
    }
  });
}


function setupSubmissionAutocomplete() {}


function scrollToSubmissions(levelName) {
  const section = document.getElementById('submissions');
  const input   = document.getElementById('levelName');
  if (section) {
    const navbar = document.getElementById('navbar');
    const top = section.getBoundingClientRect().top + window.scrollY - (navbar?.offsetHeight||62) - 8;
    window.scrollTo({ top, behavior: 'smooth' });
  }
  if (input) {
    input.value = levelName || '';
    input.dispatchEvent(new Event('input'));
    setTimeout(() => input.focus(), 500);
  }
}


function renderLeaderboard() {
  const tbody = document.getElementById('leaderboardBody');
  if (!tbody) return;
  const players = getPlayersData();
  if (!players.length) {
    tbody.innerHTML = '<div class="loader-wrap"><i class="fas fa-users"></i><span>No hay jugadores</span></div>';
    return;
  }
  const maxPts = players[0]?.points || 1;
  tbody.innerHTML = '';
  players.forEach((player, i) => {
    const pos = i + 1;
    const pct = ((player.points||0) / maxPts * 100).toFixed(1);
    const initials = (player.name||'?').slice(0,2).toUpperCase();
    
    const isCurrentUser = window.currentUser &&
      (player.discord_id === window.currentUser.discordId ||
       (player.name && window.currentUser.linkedPlayer &&
        player.name.toLowerCase() === window.currentUser.linkedPlayer.toLowerCase()));
    const avatarUrl = isCurrentUser && window.currentUser.image
      ? window.currentUser.image
      : (player.discord_id && player.discord_avatar
          ? `https://cdn.discordapp.com/avatars/${player.discord_id}/${player.discord_avatar}.png?size=128`
          : null);
    const medalColors = ['#f59e0b','#cbd5e1','#c2722a'];
    const rankColors  = ['rgba(245,158,11,.15)','rgba(203,213,225,.1)','rgba(194,114,42,.1)'];

    const row = document.createElement('div');
    row.className = `lb-row${pos<=3 ? ` top${pos}` : ''}`;
    row.style.cursor = 'pointer';
    row.style.animationDelay = `${Math.min(i * 30, 600)}ms`;
  row.addEventListener('click', () => openPlayerProfile(player.name));
    
    row.innerHTML = `
      <div class="lb-pos-wrap">
        ${pos === 1
          ? `<div class="lb-medal lb-medal-gold" style="--mc:#f59e0b;--mb:rgba(245,158,11,.13)"><i class="fas fa-crown"></i></div>`
          : pos === 2
          ? `<div class="lb-medal lb-medal-silver" style="--mc:#cbd5e1;--mb:rgba(203,213,225,.1)"><i class="fas fa-trophy"></i></div>`
          : pos === 3
          ? `<div class="lb-medal lb-medal-bronze" style="--mc:#c2722a;--mb:rgba(194,114,42,.1)"><i class="fas fa-award"></i></div>`
          : `<div class="lb-pos-num">#${pos}</div>`
        }
      </div>

      <div class="lb-avatar" style="--av-color:${playerColor(player.name)}">
${avatarUrl
  ? `<img src="${esc(avatarUrl)}" alt="" onerror="this.style.display='none';this.nextElementSibling?.style.setProperty('display','flex')">`
  : ''
}
        <span style="${avatarUrl ? 'display:none' : ''}">${initials}</span>
      </div>

      <div class="lb-info">
        <span class="lb-player-name">${esc(player.discord_display_name || player.discord_username || player.name)}</span>
        ${player.hardest_level
          ? `<span class="lb-hardest"><i class="fas fa-skull"></i> ${esc(player.hardest_level)}</span>`
          : `<span class="lb-hardest"><i class="fas fa-flag"></i> Uruguay</span>`
        }
      </div>

      <div class="lb-stats-horizontal">
        <div class="lb-stat-item si-pts">
          <i class="fas fa-bolt-lightning"></i>
          <span>${(player.points||0).toLocaleString()}</span>
          <small>pts</small>
        </div>
        <div class="lb-stat-item si-comp">
          <i class="fas fa-skull-crossbones"></i>
          <span>${player.completions||0}</span>
          <small>comps</small>
        </div>
        <div class="lb-stat-item si-prog">
          <i class="fas fa-arrow-trend-up"></i>
          <span>${pct}%</span>
          <small>prog</small>
        </div>
      </div>`;

    tbody.appendChild(row);
  });
}

function playerColor(name) {
  
  let hash = 0;
  for (let c of (name||'')) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 55%, 35%)`;
}

function setupPlayerSearch() {
  const input    = document.getElementById('playerSearch');
  const clearBtn = document.getElementById('lbSearchClear');
  if (!input) return;
  let debounce;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (clearBtn) clearBtn.style.display = q ? '' : 'none';
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const ql = q.toLowerCase();
      let found = 0;
      document.querySelectorAll('.lb-row').forEach(row => {
        const name = row.querySelector('.lb-player-name')?.textContent.toLowerCase() || '';
        const show = !ql || name.includes(ql);
        row.style.display = show ? '' : 'none';
        if (show) found++;
      });
      
      let noResult = document.getElementById('lbNoResult');
      if (!noResult) {
        noResult = document.createElement('div');
        noResult.id = 'lbNoResult';
        noResult.className = 'lb-no-result';
        document.getElementById('leaderboardBody')?.appendChild(noResult);
      }
      if (ql && found === 0) {
        noResult.innerHTML = `<i class="fas fa-search"></i> Sin resultados para "<strong>${esc(q)}</strong>"`;
        noResult.style.display = '';
      } else {
        noResult.style.display = 'none';
      }
    }, 150);
  });

  clearBtn?.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    document.querySelectorAll('.lb-row').forEach(row => row.style.display = '');
    const noResult = document.getElementById('lbNoResult');
    if (noResult) noResult.style.display = 'none';
    input.focus();
  });
}


(function () {
  return;

  
  function getDominantColor(img) {
    const canvas = document.createElement('canvas');
    const size = 40; 
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const pr = data[i], pg = data[i+1], pb = data[i+2], a = data[i+3];
      if (a < 128) continue; 

      const brightness = (pr + pg + pb) / 3;
      if (brightness < 20 || brightness > 230) continue;
      r += pr; g += pg; b += pb; count++;
    }
    if (count === 0) return null;
    return [Math.round(r/count), Math.round(g/count), Math.round(b/count)];
  }

  
  function toCardBg(r, g, b) {
    
    const rn = r/255, gn = g/255, bn = b/255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
        case gn: h = ((bn - rn) / d + 2) / 6; break;
        case bn: h = ((rn - gn) / d + 4) / 6; break;
      }
    }

    
    l = Math.max(0.10, Math.min(0.22, l * 0.35));
    s = Math.max(0.45, Math.min(0.75, s * 1.6));

    
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    }
    const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p2 = 2 * l - q2;
    const rf = Math.round(hue2rgb(p2, q2, h + 1/3) * 255);
    const gf = Math.round(hue2rgb(p2, q2, h) * 255);
    const bf = Math.round(hue2rgb(p2, q2, h - 1/3) * 255);
    return `rgb(${rf},${gf},${bf})`;
  }

  
  function applyCardColor(card, img) {
    try {
      const rgb = getDominantColor(img);
      if (!rgb) return;
      const color = toCardBg(...rgb);
      card.style.setProperty('--card-color', color);
      
      card.style.borderColor = `color-mix(in srgb, ${color} 60%, rgba(255,255,255,.12))`;
    } catch (e) {
      
    }
  }

  
  function processCard(card) {
    const thumb = card.querySelector('.lc-thumb');
    if (!thumb || thumb.dataset.colorized) return;
    thumb.dataset.colorized = '1';

    if (thumb.complete && thumb.naturalWidth > 0) {
      applyCardColor(card, thumb);
    } else {
      thumb.addEventListener('load', () => applyCardColor(card, thumb), { once: true });
      thumb.addEventListener('error', () => {}, { once: true });
    }
  }

  
  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.classList?.contains('level-card')) processCard(node);
        node.querySelectorAll?.('.level-card').forEach(processCard);
      }
    }
  });

  function init() {
    document.querySelectorAll('.level-card').forEach(processCard);
    observer.observe(document.getElementById('levelsContainer') || document.body, {
      childList: true, subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


function openPlayerProfile(playerName) {
  const players = getPlayersData();
  const player  = players.find(p => p.name === playerName);
  if (!player) return;

  
  const normName = s => (s||'').trim().toLowerCase();
  const completions = getLevelsData()
    .filter(l => (l.victors||[]).some(v => normName(v.name) === normName(playerName)))
    .map(l => {
      const victor = (l.victors||[]).find(v => normName(v.name) === normName(playerName));
      return { level: l, victor };
    })
    .sort((a, b) => (a.level.position||999) - (b.level.position||999));

  const maxPts   = getPlayersData()[0]?.points || 1;
  const pct      = ((player.points||0) / maxPts * 100).toFixed(1);
  const initials = (player.name||'?').slice(0,2).toUpperCase();
const avatarUrl = player.discord_id && player.discord_avatar
  ? `https://cdn.discordapp.com/avatars/${player.discord_id}/${player.discord_avatar}.png?size=128`
  : null;
  const rank     = players.findIndex(p => p.name === playerName) + 1;
  const rankIcons = [
    `<i class="fas fa-crown" style="color:#f59e0b;font-size:.85em"></i>`,
    `<i class="fas fa-medal" style="color:#cbd5e1;font-size:.85em"></i>`,
    `<i class="fas fa-medal" style="color:#c2722a;font-size:.85em"></i>`,
  ];
  const rankLabel = rank <= 3 ? rankIcons[rank-1] : `#${rank}`;

  // Crear o reusar el modal
  let modal = document.getElementById('playerProfileModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'playerProfileModal';
    modal.className = 'player-modal';
    modal.innerHTML = `
      <div class="player-modal-backdrop"></div>
      <div class="player-modal-box"></div>`;
    document.body.appendChild(modal);
    modal.querySelector('.player-modal-backdrop').addEventListener('click', closePlayerProfile);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePlayerProfile(); });
  }

  const box = modal.querySelector('.player-modal-box');

  box.innerHTML = `
    <button class="player-modal-close" onclick="closePlayerProfile()">
      <i class="fas fa-times"></i>
    </button>

    <div class="pm-banner" style="--pcolor:${playerColor(player.name)}">
      <div class="pm-banner-overlay"></div>
    </div>

    <div class="pm-content">
      <div class="pm-header">
        <div class="pm-avatar-wrap">
          <div class="pm-avatar" style="--av-color:${playerColor(player.name)}">
            ${avatarUrl
              ? `<img src="${esc(avatarUrl)}" alt="">`
              : `<span>${initials}</span>`
            }
          </div>
          <div class="pm-avatar-discord-badge" title="Conectado con Discord">
            <i class="fab fa-discord"></i>
          </div>
          <div class="pm-avatar-gd-badge" id="pmGdBadge" style="display:none" title="Cuenta GD vinculada">
            <i class="fas fa-gamepad"></i>
          </div>
        </div>
        <div class="pm-header-info">
          <h2 class="pm-name">${esc(player.discord_display_name || player.discord_username || player.name)}</h2>
          <div class="pm-badges-row">
            <span class="pm-rank-badge">${rankLabel} en Uruguay</span>
            ${player.role && player.role !== 'usuario'
              ? `<span class="pm-role-badge role-${esc(player.role)}">
                   <i class="fas ${getRoleMeta(player.role).icon}"></i> ${esc(getRoleMeta(player.role).label)}
                 </span>`
              : ''
            }
            ${player.hardest_level
              ? `<span class="pm-hardest-badge">
                   <i class="fas fa-skull"></i> ${esc(player.hardest_level)}
                 </span>`
              : ''
            }
          </div>
        </div>
      </div>

      <!-- GD Stats (async) — ícono GD aquí, NO en el avatar -->
      <div class="pm-gd-stats" id="pmGdStats" style="display:none"></div>
      <!-- Stats grandes -->
      <div class="pm-stats-grid">
        <div class="pm-stat-card">
          <span class="pm-stat-val" style="color:var(--violet)">${(player.points||0).toLocaleString()}</span>
          <span class="pm-stat-lbl">Puntos</span>
        </div>
        <div class="pm-stat-card">
          <span class="pm-stat-val" style="color:var(--red)">${player.completions||0}</span>
          <span class="pm-stat-lbl">Completions</span>
        </div>
        <div class="pm-stat-card">
          <span class="pm-stat-val" style="color:var(--gold)">${rankLabel}</span>
          <span class="pm-stat-lbl">Ranking UY</span>
        </div>
        <div class="pm-stat-card">
          <span class="pm-stat-val" style="color:var(--success)">${pct}%</span>
          <span class="pm-stat-lbl">vs #1</span>
        </div>
      </div>

      <!-- Barra vs #1 -->
      <div class="pm-progress-section">
        <div class="pm-progress-label">
          <span>Progreso vs jugador #1</span>
          <span>${pct}%</span>
        </div>
        <div class="pm-progress-track">
          <div class="pm-progress-fill" style="width:0%;--target:${pct}%"></div>
        </div>
      </div>

      <!-- Completions -->
      <div class="pm-completions-section">
        <h3 class="pm-section-title">
          <i class="fas fa-flag-checkered"></i>
          Completions en la lista (${completions.length})
        </h3>
        ${completions.length === 0
          ? `<p class="pm-empty">Sin completions en la lista aún</p>`
          : `<div class="pm-completions-list">
              ${completions.map(({ level, victor }) => {
                
                const isFirstVictor   = (level.victors||[])[0]?.id === victor?.id;
                const ownVideoUrl     = (victor?.videoUrl || '').trim() || null;
                const effectiveVideoUrl = ownVideoUrl
                  || (isFirstVictor ? (level.youtube_url || null) : null);

                const ytId  = victor?.videoId || extractYTId(effectiveVideoUrl);
                const victorThumb = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null;
                const fallbackThumb = level.thumb_url || null;
                const thumb = victorThumb || fallbackThumb;
                const pos   = level.position;
                const posIcons = [
                  `<i class="fas fa-crown" style="color:#f59e0b;font-size:.8em"></i>`,
                  `<i class="fas fa-medal" style="color:#cbd5e1;font-size:.8em"></i>`,
                  `<i class="fas fa-medal" style="color:#c2722a;font-size:.8em"></i>`,
                ];
                const posLabel = pos <= 3 ? posIcons[pos-1] : `#${pos}`;
                return `
                  <div class="pm-completion-row" onclick="closePlayerProfile();openLevelModal(${JSON.stringify(level).replace(/"/g,'&quot;')},{targetVictorName:${JSON.stringify(playerName).replace(/"/g,'&quot;')}})">
                    ${thumb
                      ? `<img class="pm-comp-thumb" src="${thumb}" alt="" onerror="this.src='${fallbackThumb||''}';this.onerror=null">`
                      : `<div class="pm-comp-thumb pm-comp-thumb-ph"></div>`
                    }
                    <div class="pm-comp-info">
                      <span class="pm-comp-name">${esc(level.name)}</span>
                      <span class="pm-comp-pos">${posLabel} en la lista</span>
                    </div>
                    ${(() => {
                      const vUrl = effectiveVideoUrl;
                      if (ytId) {
                        const uid = 'pmv-' + (victor?.id || Math.random().toString(36).slice(2));
                        return `<a class="pm-comp-video" href="https://youtube.com/watch?v=${ytId}"
                            target="_blank" rel="noopener" onclick="event.stopPropagation()"
                            data-ytid="${ytId}" id="${uid}">
                            <i class="fab fa-youtube"></i> Ver video
                          </a>`;
                      }
                      if (vUrl) {
                        const plat = typeof detectVideoPlatform === 'function' ? detectVideoPlatform(vUrl) : null;
                        const safePlat = plat || { icon: 'fas fa-external-link-alt', label: 'Ver video', color: 'var(--violet)' };
                        return `<a class="pm-comp-video pm-comp-video-ext" href="${esc(vUrl)}"
                            target="_blank" rel="noopener" onclick="event.stopPropagation()"
                            style="--plat-color:${safePlat.color}">
                            <i class="${safePlat.icon}"></i> ${safePlat.label}
                          </a>`;
                      }
                      return `<span class="pm-comp-novideo" title="Sin video"><i class="fas fa-video-slash"></i></span>`;
                    })()}
                  </div>`;
              }).join('')}
            </div>`
        }
      </div>
    </div>`;


  modal.querySelectorAll('a[data-ytid]').forEach(link => {
    const ytid = link.dataset.ytid;
    if (!ytid) return;
    
    const img = new Image();
    let tried = 0;
    const sizes = ['maxresdefault', 'hqdefault', 'mqdefault'];
    function tryNext() {
      if (tried >= sizes.length) {
        // No se pudo cargar ninguna miniatura — marcar como sin video
        link.innerHTML = '<i class="fas fa-video-slash"></i> Sin video';
        link.style.cssText += ';opacity:.5;pointer-events:none;cursor:default';
        return;
      }
      img.src = `https://img.youtube.com/vi/${ytid}/${sizes[tried]}.jpg`;
      tried++;
    }
    img.onload = function() {
      // mqdefault 120x90 = placeholder de YT = video privado/borrado
      if (sizes[tried-1] === 'mqdefault' && this.naturalWidth === 120 && this.naturalHeight === 90) {
        // Verificar si tiene videoUrl directa antes de marcar como privado
        const directHref = link.href;
        if (directHref && directHref !== '#') {
          // Tiene URL directa válida, mostrar link aunque no haya miniatura
          link.innerHTML = '<i class="fab fa-youtube"></i> Ver video';
          link.style.opacity = '1';
          link.style.pointerEvents = '';
        } else {
          link.innerHTML = '<i class="fas fa-lock"></i> Privado';
          link.style.cssText += ';opacity:.5;pointer-events:none;filter:grayscale(1);cursor:default';
        }
      }
      // Si cargó bien, no hacer nada — el link ya tiene el texto correcto
    };
    img.onerror = tryNext;
    tryNext();
  });

modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Cargar perfil de GDBrowser en background - ícono GD va en sección propia, NO en el avatar de Discord
  
  // Cargar perfil GD + iconset completo
  const _API = typeof API_BASE !== 'undefined' ? API_BASE : 'http://localhost:3001/api';
  const _gdName = player.gd_username || playerName;

  // Las dos llamadas en paralelo: stats del jugador + todos sus iconos
  Promise.all([
    fetch(`${_API}/gdbrowser?player=${encodeURIComponent(_gdName)}`).then(r => r.json()).catch(() => null),
    fetch(`/api/gd-icon/${encodeURIComponent(_gdName)}?all=1`).then(r => r.json()).catch(() => null),
  ]).then(([gd, iconData]) => {
    if (!gd?.found && !iconData?.found) return;

    const gdBadge = box.querySelector('#pmGdBadge');
    if (gdBadge) gdBadge.style.display = 'flex';

    const statsEl = box.querySelector('#pmGdStats');
    if (!statsEl) return;

    // Fila de iconos: cube, ship, ball, ufo, wave, robot, spider, swing (mismo orden que GDB)
    const ICON_ORDER = ['cube','ship','ball','ufo','wave','robot','spider','swing'];
    const ICON_LABELS = { cube:'Cube', ship:'Ship', ball:'Ball', ufo:'UFO', wave:'Wave', robot:'Robot', spider:'Spider', swing:'Swing' };

    let iconRowHtml = '';
    if (iconData?.found && iconData.icons) {
      iconRowHtml = `
        <div class="pm-gd-iconset">
          <div class="pm-gd-iconset-label">
            <i class="fas fa-gamepad"></i>
            <span>${esc(_gdName)}</span>
            ${gd?.rank != null ? `<span class="pm-gd-global-rank"><i class="fas fa-globe"></i>#${Number(gd.rank).toLocaleString()}</span>` : ''}
            <span style="margin-left:auto;font-size:.58rem;color:var(--text-dim);opacity:.45;font-weight:400;letter-spacing:0;text-transform:none;font-style:italic">made by ft8d :3</span>
          </div>
          <div class="pm-gd-iconset-row">
            ${ICON_ORDER.map(f => {
              const ic = iconData.icons[f];
              if (!ic) return '';
              return `
                <div class="pm-gd-icon-cell" title="${ICON_LABELS[f]}">
                  <img src="${esc(ic.url)}" alt="${f}"
                       class="pm-gd-icon-img"
                       onerror="this.closest('.pm-gd-icon-cell').style.opacity='.3'">
                  <span class="pm-gd-icon-label">${ICON_LABELS[f]}</span>
                </div>`;
            }).join('')}
          </div>
        </div>`;
    }

    // Fila de stats en horizontal
    const chips = [
      gd?.stars     != null ? `<div class="pm-gd-stat"><i class="fas fa-star"     style="color:#f59e0b"></i><span>${Number(gd.stars).toLocaleString()}</span><small>estrellas</small></div>`    : '',
      gd?.moons     != null ? `<div class="pm-gd-stat"><i class="fas fa-moon"     style="color:#a78bfa"></i><span>${Number(gd.moons).toLocaleString()}</span><small>lunas</small></div>`       : '',
      gd?.demons    != null ? `<div class="pm-gd-stat"><i class="fas fa-skull"    style="color:var(--red)"></i><span>${Number(gd.demons).toLocaleString()}</span><small>demons</small></div>`  : '',
      gd?.diamonds  != null ? `<div class="pm-gd-stat"><i class="fas fa-gem"      style="color:#38bdf8"></i><span>${Number(gd.diamonds).toLocaleString()}</span><small>diamonds</small></div>` : '',
      gd?.coins     != null ? `<div class="pm-gd-stat"><i class="fas fa-coins"    style="color:#f59e0b"></i><span>${gd.coins}</span><small>coins</small></div>`                                 : '',
      gd?.userCoins != null ? `<div class="pm-gd-stat"><i class="fas fa-medal"    style="color:#c2722a"></i><span>${gd.userCoins}</span><small>user coins</small></div>`                       : '',
      gd?.cp        != null ? `<div class="pm-gd-stat"><i class="fas fa-fire"     style="color:var(--red)"></i><span>${gd.cp}</span><small>creator pts</small></div>`                          : '',
    ].filter(Boolean);

    if (!iconRowHtml && !chips.length) return;

    statsEl.innerHTML = `
      <div class="pm-gd-section">
        ${iconRowHtml}
        ${chips.length ? `<div class="pm-gd-stats-row">${chips.join('')}</div>` : ''}
      </div>`;
    statsEl.style.display = 'block';
  });

  // Animar la barra de progreso
  requestAnimationFrame(() => {
    setTimeout(() => {
      const fill = box.querySelector('.pm-progress-fill');
      if (fill) fill.style.width = fill.style.getPropertyValue('--target') || pct + '%';
    }, 80);
  });
}

function closePlayerProfile() {
  document.getElementById('playerProfileModal')?.classList.remove('active');
  document.body.style.overflow = '';
}

window.closePlayerProfile = closePlayerProfile;

// ─── UTILS ───
function extractYTId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/);
  return m ? m[1] : null;
}
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── COMENTARIOS DEL MODAL DE NIVEL ───
async function initLevelComments(levelId) {
  const user = window.currentUser;
  const form  = document.getElementById('lmCommentForm');
  const prompt = document.getElementById('lmCommentLoginPrompt');
  if (form)   form.style.display   = user ? '' : 'none';
  if (prompt) prompt.style.display = user ? 'none' : '';

  // Contador de caracteres
  const input = document.getElementById('lmCommentInput');
  const counter = document.getElementById('lmCommentCount');
  if (input && counter) {
    input.addEventListener('input', () => {
      counter.textContent = `${input.value.length}/500`;
    });
  }

  // Submit
  const submitBtn = document.getElementById('lmCommentSubmit');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      if (!input?.value.trim()) return;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      await postLevelComment(levelId, input.value.trim());
      input.value = '';
      if (counter) counter.textContent = '0/500';
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Comentar';
    });
  }

  await loadLevelComments(levelId);
}

async function loadLevelComments(levelId) {
  const list = document.getElementById('lmCommentsList');
  if (!list) return;
  list.innerHTML = '<div class="lm-comments-loading"><i class="fas fa-spinner fa-spin"></i></div>';

  try {
    const res = await fetch(`/api/level-comments?level_id=${levelId}`);
    const { comments = [] } = await res.json();
    renderLevelComments(comments, levelId);
  } catch {
    list.innerHTML = '<div class="lm-comments-empty">Error al cargar comentarios.</div>';
  }
}

function renderLevelComments(comments, levelId) {
  const list = document.getElementById('lmCommentsList');
  if (!list) return;
  const user = window.currentUser;

  if (!comments.length) {
    list.innerHTML = '<div class="lm-comments-empty"><i class="far fa-comment-dots"></i> Nadie comentó este nivel todavía.</div>';
    return;
  }

  list.innerHTML = comments.map(c => buildLevelCommentHTML(c, user, false)).join('');

  // Eventos delegados en el contenedor
  attachLevelCommentEvents(list, levelId);
}

function buildLevelCommentHTML(c, user, isReply) {
  const isOwn     = user && user.id === c.discord_id;
  const isAdmin   = user && ['admin','manager','owner'].includes(user.role);
  const canDelete = isOwn || isAdmin;
  const iLiked    = user && (c.liked_by||[]).some(r => r.id === user.id);
  const iDisliked = user && (c.disliked_by||[]).some(r => r.id === user.id);
  const avatarUrl = c.discord_id && c.discord_avatar
    ? `https://cdn.discordapp.com/avatars/${c.discord_id}/${c.discord_avatar}.png?size=64`
    : null;
  const ts  = new Date(c.created_at).getTime();
  const rel = lcRelTime(ts);

  const likeNames    = (c.liked_by    || []).length;
  const dislikeNames = (c.disliked_by || []).length;

  const reactorsLike    = JSON.stringify(c.liked_by    || []).replace(/'/g, '&#39;');
  const reactorsDislike = JSON.stringify(c.disliked_by || []).replace(/'/g, '&#39;');
  const reactionsHTML = user ? `
    <button class="lm-comment-react-btn lm-like-btn${iLiked ? ' active-like' : ''}"
      data-id="${c.id}" data-reaction="like"
      data-reactors='${reactorsLike}'>
      <i class="fas fa-thumbs-up"></i> <span>${c.likes || 0}</span>
    </button>
    <button class="lm-comment-react-btn lm-dislike-btn${iDisliked ? ' active-dislike' : ''}"
      data-id="${c.id}" data-reaction="dislike"
      data-reactors='${reactorsDislike}'>
      <i class="fas fa-thumbs-down"></i> <span>${c.dislikes || 0}</span>
    </button>` : `
    <span class="lm-comment-react-static" data-reactors='${reactorsLike}' data-reaction="like" style="cursor:${likeNames?'pointer':'default'}">
      <i class="fas fa-thumbs-up"></i> ${c.likes||0}
    </span>
    <span class="lm-comment-react-static" data-reactors='${reactorsDislike}' data-reaction="dislike" style="cursor:${dislikeNames?'pointer':'default'}">
      <i class="fas fa-thumbs-down"></i> ${c.dislikes||0}
    </span>`;

  const replySection = !isReply ? `
    <div class="lm-comment-replies-wrap" id="lc-replies-${c.id}"></div>
    ${(c.reply_count > 0) ? `
      <button class="lm-comment-replies-toggle" data-id="${c.id}" data-count="${c.reply_count}">
        <i class="fas fa-comment-dots"></i> ${c.reply_count} respuesta${c.reply_count > 1 ? 's' : ''}
      </button>` : ''}
    ${user ? `
      <button class="lm-comment-reply-btn" data-id="${c.id}">
        <i class="fas fa-reply"></i> Responder
      </button>
      <div class="lm-reply-form hidden" id="lc-reply-form-${c.id}">
        <textarea class="lm-comment-input lm-reply-input" id="lc-reply-input-${c.id}"
          placeholder="Tu respuesta… (máx. 500 car.)" maxlength="500" rows="2"></textarea>
        <div class="lm-comment-form-footer" style="padding:.3rem .5rem .35rem">
          <span class="lm-comment-char-count" id="lc-reply-count-${c.id}">0/500</span>
          <button class="lm-comment-reply-cancel" data-id="${c.id}">Cancelar</button>
          <button class="lm-comment-submit lm-reply-submit" data-id="${c.id}" style="padding:.28rem .7rem;font-size:.72rem">
            <i class="fas fa-paper-plane"></i> Responder
          </button>
        </div>
      </div>` : ''}
  ` : '';

  return `
    <div class="lm-comment${isReply ? ' lm-comment-reply' : ''}" data-id="${c.id}">
      <div class="lm-comment-header">
        <div class="lm-comment-author">
          ${avatarUrl
            ? `<img class="lm-comment-avatar" src="${avatarUrl}" alt="" onerror="this.style.display='none';this.nextElementSibling?.style.setProperty('display','flex')">`
            : ''}
          <div class="lm-comment-avatar lm-comment-avatar-ph" ${avatarUrl ? 'style="display:none"' : ''}>
            ${(c.display_name||'?')[0].toUpperCase()}
          </div>
          <div>
            <span class="lm-comment-name">${esc(c.display_name || c.discord_username || 'Usuario')}</span>
            ${c.is_victor ? `<span class="lm-victor-tag"><i class="fas fa-flag-checkered"></i> Completado</span>` : ''}
            <span class="lm-comment-time" data-ts="${ts}">${rel}</span>
          </div>
        </div>
        ${canDelete ? `<button class="lm-comment-delete" data-id="${c.id}" data-own="${isOwn?'1':'0'}" title="Eliminar"><i class="fas fa-trash-alt"></i></button>` : ''}
      </div>
      <div class="lm-comment-body">${esc(c.content)}</div>
      <div class="lm-comment-reactions">${reactionsHTML}</div>
      ${replySection}
    </div>`;
}

function lcRelTime(ts) {
  const d = Date.now() - ts, m = 60000;
  if (d < m)       return 'ahora';
  if (d < 60*m)    return `hace ${Math.floor(d/m)}m`;
  if (d < 1440*m)  return `hace ${Math.floor(d/3600000)}h`;
  return `hace ${Math.floor(d/86400000)}d`;
}

// Actualiza los tiempos relativos cada 30s
let _lcTimeInterval = null;
function startLcTimeUpdater(list) {
  if (_lcTimeInterval) clearInterval(_lcTimeInterval);
  _lcTimeInterval = setInterval(() => {
    list.querySelectorAll('.lm-comment-time[data-ts]').forEach(el => {
      el.textContent = lcRelTime(Number(el.dataset.ts));
    });
  }, 30000);
}

function showLcReactionPopup(reactors, type, anchorEl) {
  document.getElementById('lcReactionPopup')?.remove();
  if (!reactors?.length) return;

  const icon  = type === 'like' ? 'thumbs-up' : 'thumbs-down';
  const label = type === 'like' ? 'Les gustó' : 'No les gustó';
  const color = type === 'like' ? '#4ade80' : '#f87171';

  const popup = document.createElement('div');
  popup.id = 'lcReactionPopup';
  popup.className = 'lc-reaction-popup';
  popup.innerHTML = `
    <div class="lc-reaction-popup-title" style="color:${color}">
      <i class="fas fa-${icon}"></i> ${label} (${reactors.length})
    </div>
    <div class="lc-reaction-popup-list">
      ${reactors.map(r => {
        const av = r.id && r.avatar
          ? `<img src="https://cdn.discordapp.com/avatars/${r.id}/${r.avatar}.png?size=32" class="lc-reaction-avatar" onerror="this.style.display='none'">`
          : `<div class="lc-reaction-avatar lc-reaction-avatar-ph">${(r.name||'?')[0].toUpperCase()}</div>`;
        return `<div class="lc-reaction-user">${av}<span>${esc(r.name||'Usuario')}</span></div>`;
      }).join('')}
    </div>`;
  document.body.appendChild(popup);

  const rect = anchorEl.getBoundingClientRect();
  let top  = rect.bottom + window.scrollY + 8;
  let left = rect.left  + window.scrollX;
  const popW = 210;
  if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
  if (left < 8) left = 8;
  // Si el popup quedaría fuera de la pantalla por abajo, mostrarlo arriba
  const estH = Math.min(reactors.length * 36 + 50, 250);
  if (rect.bottom + estH > window.innerHeight) top = rect.top + window.scrollY - estH - 8;
  popup.style.top  = `${top}px`;
  popup.style.left = `${left}px`;

  const close = e => { if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('pointerdown', close); }};
  setTimeout(() => document.addEventListener('pointerdown', close), 50);
}

function attachLevelCommentEvents(list, levelId) {
  const discordId = () => localStorage.getItem('uy_discord_id') || '';

  // Delete con confirmación diferenciada por rol
  list.querySelectorAll('.lm-comment-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const isOwn   = btn.dataset.own === '1';
      const author  = btn.closest('.lm-comment')?.querySelector('.lm-comment-name')?.textContent || 'este comentario';
      const ok = await uiConfirm(isOwn ? {
        title:       '¿Eliminar tu comentario?',
        message:     'Esta acción no se puede deshacer.',
        type:        'warning',
        confirmText: 'Eliminar',
        cancelText:  'Cancelar',
      } : {
        title:       `¿Eliminar comentario de ${author}?`,
        message:     'Estás eliminando el comentario de otro usuario como staff. Esta acción no se puede deshacer.',
        type:        'warning',
        confirmText: 'Eliminar de todas formas',
        cancelText:  'Cancelar',
      });
      if (!ok) return;
      btn.disabled = true;
      try {
        const res = await fetch(`/api/level-comments?id=${btn.dataset.id}`, {
          method: 'DELETE', headers: { 'x-discord-id': discordId() }
        });
        if (res.ok) await loadLevelComments(levelId);
        else btn.disabled = false;
      } catch { btn.disabled = false; }
    });
  });

  // Reacciones — click = toggle, longpress/contextmenu = popup de usuarios
  list.querySelectorAll('.lm-comment-react-btn, .lm-comment-react-static').forEach(el => {
    const getReactors = () => {
      try { return JSON.parse(el.dataset.reactors || '[]'); } catch { return []; }
    };
    const showPopup = () => {
      const reactors = getReactors();
      if (reactors.length) showLcReactionPopup(reactors, el.dataset.reaction, el);
    };

    if (el.classList.contains('lm-comment-react-btn')) {
      el.addEventListener('click', async () => {
        const reaction = el.dataset.reaction;
        const wasActive   = reaction === 'like'
          ? el.classList.contains('active-like')
          : el.classList.contains('active-dislike');
        const hadOpposite = reaction === 'like'
          ? el.closest('.lm-comment')?.querySelector('.lm-dislike-btn')?.classList.contains('active-dislike')
          : el.closest('.lm-comment')?.querySelector('.lm-like-btn')?.classList.contains('active-like');

        el.classList.remove('reaction-pop');
        void el.offsetWidth;
        el.classList.add('reaction-pop');
        setTimeout(() => el.classList.remove('reaction-pop'), 400);

        try {
          const res = await fetch('/api/level-comments', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-discord-id': discordId() },
            body: JSON.stringify({ comment_id: Number(el.dataset.id), reaction })
          });
          if (res.ok) {
            if (wasActive) {
              if (typeof showToast === 'function') showToast(reaction === 'like' ? '💔 Quitaste el like' : '✌️ Quitaste el dislike', 'info');
            } else if (hadOpposite) {
              if (typeof showToast === 'function') showToast(reaction === 'like' ? '👍 Cambiaste a like' : '👎 Cambiaste a dislike', 'info');
            } else if (reaction === 'like') {
              if (typeof showToast === 'function') showToast('👍 ¡Le diste like!', 'success');
            } else {
              if (typeof showToast === 'function') showToast('👎 Le diste dislike', 'info');
            }
            await loadLevelComments(levelId);
          }
        } catch {}
      });
    } else {
      // Estático (no logueado): click directo muestra popup
      el.addEventListener('click', showPopup);
    }

    // Longpress mobile + contextmenu desktop en ambos tipos
    let pressTimer;
    el.addEventListener('pointerdown', () => { pressTimer = setTimeout(showPopup, 500); });
    el.addEventListener('pointerup',   () => clearTimeout(pressTimer));
    el.addEventListener('pointerleave',() => clearTimeout(pressTimer));
    el.addEventListener('contextmenu', e => { e.preventDefault(); showPopup(); });
  });

  // Toggle replies
  list.querySelectorAll('.lm-comment-replies-toggle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id   = btn.dataset.id;
      const wrap = document.getElementById(`lc-replies-${id}`);
      if (!wrap) return;

      if (wrap.dataset.loaded === '1') {
        wrap.innerHTML = '';
        wrap.dataset.loaded = '0';
        btn.innerHTML = `<i class="fas fa-comment-dots"></i> ${btn.dataset.count} respuesta${btn.dataset.count > 1 ? 's' : ''}`;
        return;
      }

      wrap.innerHTML = '<div class="lm-comments-loading" style="padding:.5rem"><i class="fas fa-spinner fa-spin"></i></div>';
      try {
        const res  = await fetch(`/api/level-comments/${id}`);
        const { replies = [] } = await res.json();
        const user = window.currentUser;
        wrap.innerHTML = replies.map(r => buildLevelCommentHTML(r, user, true)).join('');
        wrap.dataset.loaded = '1';
        btn.innerHTML = `<i class="fas fa-chevron-up"></i> Ocultar respuestas`;
        // Eventos en replies
        attachLevelCommentEvents(wrap, levelId);
      } catch {
        wrap.innerHTML = '<div class="lm-comments-empty" style="padding:.5rem">Error al cargar</div>';
      }
    });
  });

  // Abrir/cerrar form de reply
  list.querySelectorAll('.lm-comment-reply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const form  = document.getElementById(`lc-reply-form-${btn.dataset.id}`);
      const input = document.getElementById(`lc-reply-input-${btn.dataset.id}`);
      form?.classList.toggle('hidden');
      if (!form?.classList.contains('hidden')) input?.focus();
    });
  });

  list.querySelectorAll('.lm-comment-reply-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(`lc-reply-form-${btn.dataset.id}`)?.classList.add('hidden');
    });
  });

  // Contador chars en replies
  list.querySelectorAll('.lm-reply-input').forEach(input => {
    const id      = input.id.replace('lc-reply-input-', '');
    const counter = document.getElementById(`lc-reply-count-${id}`);
    input.addEventListener('input', () => {
      if (counter) counter.textContent = `${input.value.length}/500`;
    });
  });

  // Submit reply
  list.querySelectorAll('.lm-reply-submit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id    = btn.dataset.id;
      const input = document.getElementById(`lc-reply-input-${id}`);
      const text  = input?.value.trim();
      if (!text) return;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      try {
        const res = await fetch('/api/level-comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-discord-id': discordId() },
          body: JSON.stringify({ level_id: levelId, content: text, parent_id: Number(id) })
        });
        if (res.ok) {
          input.value = '';
          document.getElementById(`lc-reply-form-${id}`)?.classList.add('hidden');
          
          const wrap = document.getElementById(`lc-replies-${id}`);
          if (wrap?.dataset.loaded === '1') {
            wrap.dataset.loaded = '0';
            const toggle = list.querySelector(`.lm-comment-replies-toggle[data-id="${id}"]`);
            toggle?.click();
          } else {
            const toggle = list.querySelector(`.lm-comment-replies-toggle[data-id="${id}"]`);
            if (toggle) {
              const newCount = Number(toggle.dataset.count || 0) + 1;
              toggle.dataset.count = newCount;
              toggle.innerHTML = `<i class="fas fa-comment-dots"></i> ${newCount} respuesta${newCount > 1 ? 's' : ''}`;
            } else {
              await loadLevelComments(levelId);
            }
          }
        } else {
          const err = await res.json().catch(() => ({}));
          if (typeof showToast === 'function') showToast(err.error || 'Error', 'error');
        }
      } catch {
        if (typeof showToast === 'function') showToast('Error de red', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Responder';
      }
    });
  });

  startLcTimeUpdater(list);
}

async function postLevelComment(levelId, content) {
  const discordId = localStorage.getItem('uy_discord_id') || '';
  try {
    const res = await fetch('/api/level-comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-discord-id': discordId },
      body: JSON.stringify({ level_id: levelId, content })
    });
    if (res.ok) await loadLevelComments(levelId);
    else {
      const err = await res.json().catch(() => ({}));
      if (typeof showToast === 'function') showToast(err.error || 'Error al comentar', 'error');
    }
  } catch {
    if (typeof showToast === 'function') showToast('Error de red', 'error');
  }
}

window.openLevelModal        = openLevelModal;
window.closeLevelDetailModal = closeLevelDetailModal;
window.scrollToSubmissions   = scrollToSubmissions;

function openThumbPopup(url) {
  const existing = document.getElementById('lmThumbPopup');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'lmThumbPopup';
  overlay.className = 'lm-thumb-popup-overlay';
  overlay.innerHTML = `<img class="lm-thumb-popup-img" src="${url}" alt="Thumbnail">`;
  overlay.addEventListener('click', () => overlay.remove());
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
  });
  document.body.appendChild(overlay);
}
window.openThumbPopup = openThumbPopup;

function goToMyRanking() {
  if (typeof closeUserDropdown === 'function') closeUserDropdown();
  const name = window.currentUser?.linkedPlayer
    || window.currentUser?.gdUsername
    || window.currentUser?.name;

  if (!document.getElementById('leaderboardBody')) {
    window.location.href = name
      ? `index.html#leaderboard?highlight=${encodeURIComponent(name)}`
      : 'index.html#leaderboard';
    return;
  }

  if (name) {
    let found = false;
    document.querySelectorAll('.lb-row').forEach(row => {
      const rowName = row.querySelector('.lb-player-name')?.textContent?.trim().toLowerCase();
      if (rowName === name.toLowerCase()) {
        found = true;
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('lb-row-highlight');
        setTimeout(() => row.classList.remove('lb-row-highlight'), 2800);
      }
    });
    if (found) return;
  }

  // Sin nombre o no se encontró la fila: scroll genérico a la sección
  const section = document.getElementById('leaderboard');
  if (section) {
    const navbar = document.getElementById('navbar');
    const top = section.getBoundingClientRect().top + window.scrollY - (navbar?.offsetHeight || 62) - 8;
    window.scrollTo({ top, behavior: 'smooth' });
  }
}
window.goToMyRanking = goToMyRanking;

// Leer parámetro ?highlight= al cargar index.html
document.addEventListener('DOMContentLoaded', () => {
  const hash   = window.location.hash || '';
  const match  = hash.match(/highlight=([^&]+)/);
  if (!match) return;
  const name = decodeURIComponent(match[1]);
  // Esperar a que el leaderboard se renderice
  setTimeout(() => {
    document.querySelectorAll('.lb-row').forEach(row => {
      const rowName = row.querySelector('.lb-player-name')?.textContent?.trim().toLowerCase();
      if (rowName === name.toLowerCase()) {
        row.classList.add('lb-row-highlight');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => row.classList.remove('lb-row-highlight'), 2800);
      }
    });
  }, 1200);
});

// ─── Helper: rol meta para player profile ───
function getRoleMeta(role) {
  const map = {
    owner:    { icon: 'fa-crown',       label: 'Owner'   },
    manager:  { icon: 'fa-chess-queen', label: 'Manager' },
    admin:    { icon: 'fa-shield-alt',  label: 'Admin'   },
    list_mod: { icon: 'fa-shield',      label: 'Mod'     },
  };
  return map[role] || { icon: 'fa-user', label: role };
}