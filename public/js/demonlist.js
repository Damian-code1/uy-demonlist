// =============================================
// DEMONLIST.JS — UY Demonlist v2
// =============================================

let filteredLevels  = [];
let currentView     = localStorage.getItem('preferredView') || 'list';
let activeModalLevel = null;
let activeVictorIdx  = 0;

document.addEventListener('DOMContentLoaded', async () => {
  showLevelsLoader();
  await loadData();
  await loadAredlMap();
  syncHeroStats();
  renderLevels();
  setupSearch();
  setupViewToggles();
  setupLevelModal();
  renderLeaderboard();
  setupPlayerSearch();
  loadDiscordWidget();
  addDiscordLinks();
  setupSubmissionAutocomplete();
});

// ─── HERO STATS ───
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
  levels.forEach((level, i) => {
    const card = buildCard(level, i);
    container.appendChild(card);
    if (animated) {
      gsap.from(card, { opacity: 0, y: 12, duration: .35, ease: 'power3.out', delay: Math.min(i * .015, .7) });
    }
  });
}

function levelPoints(level) {
  if (level.points != null) return level.points;
  return Math.max(1, 1000 - ((level.position || 1) - 1) * 5);
}

// ─── BUILD COMPACT CARD ───
function buildCard(level, index) {
  const pos      = level.position || (index + 1);
  const victors  = level.victors || [];
  const aredlPos = level.aredl_position || null;
  const thumb = level.thumb_url || null;
  const pts      = levelPoints(level);

  const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
  const isFav     = favorites.includes(level.id);
  const isNew     = !!level.isNew;

  const card = document.createElement('div');
  card.className = `level-card${pos <= 3 ? ' top-3' : ''}`;
  card.dataset.id = level.id;
  card.tabIndex = 0;

  // Ícono de medalla para top 3 (sin emoji, sin seleccionable)
  let rankHtml;
  if (pos === 1) {
    rankHtml = `<div class="lc-rank lc-rank-medal lc-rank-gold" aria-label="Posición 1">
      <i class="fas fa-crown"></i><span class="lc-rank-num">1</span>
    </div>`;
  } else if (pos === 2) {
    rankHtml = `<div class="lc-rank lc-rank-medal lc-rank-silver" aria-label="Posición 2">
      <i class="fas fa-medal"></i><span class="lc-rank-num">2</span>
    </div>`;
  } else if (pos === 3) {
    rankHtml = `<div class="lc-rank lc-rank-medal lc-rank-bronze" aria-label="Posición 3">
      <i class="fas fa-medal"></i><span class="lc-rank-num">3</span>
    </div>`;
  } else {
    rankHtml = `<div class="lc-rank" aria-label="Posición ${pos}"><span class="lc-rank-num">#${pos}</span></div>`;
  }

    const firstVictorName = victors[0]?.name || null;
  const extraVictors    = victors.length > 1 ? victors.length - 1 : 0;

  // Colores dinámicos según posición en la lista
  const hue = Math.round((pos / (getLevelsData().length || 100)) * 120); // verde → rojo
  const cardAccent = `hsl(${120 - hue}, 70%, 55%)`;
  card.style.setProperty('--card-accent', cardAccent);

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
    <div class="lc-thumb-fade"></div>
    <div class="lc-color-bg"></div>

    ${rankHtml}

    <div class="lc-body">
      <div class="lc-title-row">
        <h3 class="lc-name">${esc(level.name)}</h3>
        <div class="lc-badges">
          ${aredlPos ? `<span class="aredl-pos" title="Posición en AREDL (lista global)"><i class="fas fa-globe"></i>#${aredlPos}</span>` : ''}
          ${isNew    ? `<span class="lc-new-badge">NUEVO</span>` : ''}
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
        <span class="lc-pts-badge" title="Puntos por esta completion">
          <i class="fas fa-star"></i>${pts.toLocaleString()} pts
        </span>
      </div>
    </div>
  `;

  card.querySelector('.lc-fav-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    const favs = JSON.parse(localStorage.getItem('favorites') || '[]');
    const idx  = favs.indexOf(level.id);
    if (idx >= 0) favs.splice(idx, 1); else favs.push(level.id);
    localStorage.setItem('favorites', JSON.stringify(favs));
    renderLevels();
  });

  card.addEventListener('click', () => openLevelModal(level));
  card.addEventListener('keydown', e => { if (e.key === 'Enter') openLevelModal(level); });

  return card;
}

// ─── Extract dominant color from thumbnail for dynamic gradient ───

// ─── LEVEL MODAL (with switchable victor player) ───
function setupLevelModal() {
  const modal = document.getElementById('levelDetailModal');
  modal?.querySelector('.modal-backdrop')?.addEventListener('click', closeLevelDetailModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLevelDetailModal(); });
}

async function openLevelModal(level) {
  const modal = document.getElementById('levelDetailModal');
  if (!modal) return;

  activeModalLevel = level;
  activeVictorIdx  = 0;

  renderModalContent(level);
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Enrich with GDBrowser data — usar ID de AREDL si existe (más preciso)
  const gd = level.gd_level_id
    ? await fetchGdBrowserInfoById(level.gd_level_id)
    : await fetchGdBrowserInfo(level.name);
  if (gd && activeModalLevel === level) {
    const statsEl = document.getElementById('lmGdStats');
    if (statsEl) {
      statsEl.innerHTML = buildGdStatsHtml(gd);
      statsEl.style.display = 'flex';
    }
  }
}

function buildGdStatsHtml(gd) {
  const parts = [];
  if (gd.author)     parts.push(`<span class="lm-gd-chip"><i class="fas fa-user-edit"></i> ${esc(gd.author)}</span>`);
  if (gd.difficulty) parts.push(`<span class="lm-gd-chip"><i class="fas fa-skull"></i> ${esc(gd.difficulty)}</span>`);
  if (gd.length)     parts.push(`<span class="lm-gd-chip"><i class="fas fa-ruler-horizontal"></i> ${esc(gd.length)}</span>`);
  if (gd.song)       parts.push(`<span class="lm-gd-chip"><i class="fas fa-music"></i> ${esc(gd.song)}</span>`);
  return parts.join('');
}

function renderModalContent(level) {
  const modal = document.getElementById('levelDetailModal');
  const box   = modal.querySelector('.level-modal-box');
  const pos      = level.position;
  const victors  = level.victors || [];
  const aredlPos = level.aredl_position || null;
  const isAdmin  = typeof isAdminUser === 'function' && isAdminUser();

  const current  = victors[activeVictorIdx] || victors[0] || null;
  const videoUrl = current?.videoUrl || level.youtube_url || null;
  const videoId  = extractYTId(current?.videoUrl)
    || extractYTId(level.youtube_url)
    || level.youtube_id
    || null;

  box.innerHTML = `
    <button class="modal-close" id="levelModalClose"><i class="fas fa-times"></i></button>

    <div class="lm-player-wrap">
      ${videoId
        ? `<iframe src="https://www.youtube.com/embed/${videoId}?rel=0" frameborder="0"
             allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
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
          : `<div class="lm-no-video"><i class="fas fa-video-slash"></i><p>Sin video disponible</p></div>`}
    </div>

    <div class="lm-body">
      <div class="lm-header-row">
        <div class="lm-rank-badge">${pos <= 3 ? ['🥇','🥈','🥉'][pos-1] : `#${pos}`}</div>
        <div>
          <h2 class="lm-title">${esc(level.name)}</h2>
          <div class="lm-badges">
            ${aredlPos ? `<span class="aredl-pos"><i class="fas fa-trophy"></i> AREDL #${aredlPos}</span>` : ''}
            <span class="lm-badge-vic"><i class="fas fa-flag-checkered"></i> ${victors.length} ${victors.length === 1 ? 'Victor' : 'Victors'}</span>
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
        <span class="lm-level-id-label"><i class="fas fa-hashtag"></i> ID del Nivel GD</span>
        <button class="lm-level-id-btn" id="copyLevelIdBtn" data-id="${level.gd_level_id}" title="Copiar ID al portapapeles">
          <span class="lm-level-id-num">${level.gd_level_id}</span>
          <i class="fas fa-copy"></i>
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
    </div>`;

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

  // Victor tab switching
  box.querySelectorAll('.lm-victor-tab').forEach(tab => {
    tab.addEventListener('click', e => {
      if (e.target.closest('.lm-victor-edit-icon')) return; // handled separately
      activeVictorIdx = parseInt(tab.dataset.idx);
      renderModalContent(level);
    });
  });

  // Admin edit-victor icon
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
  renderModalContent(fresh);
}
window.refreshOpenLevelModal = refreshOpenLevelModal;

// ─── SEARCH ───
function setupSearch() {
  const input    = document.getElementById('searchInput');
  const clearBtn = document.getElementById('listSearchClear');
  if (!input) return;
  let debounce;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (clearBtn) clearBtn.style.display = q ? '' : 'none';
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const ql = q.toLowerCase().trim();
      const qlNorm = ql.replace(/\s+/g, '');
      // Normaliza fullwidth (２１１ → 211) y halfwidth
      const normalize = s => s.replace(/[\uff01-\uff5e]/g, c =>
        String.fromCharCode(c.charCodeAt(0) - 0xfee0)
      ).replace(/\u3000/g, ' ').toLowerCase().trim();
      const qlFull = normalize(ql);
      filteredLevels = !ql
        ? [...getLevelsData()]
        : getLevelsData().filter(l => {
            const name = l.name?.toLowerCase() || '';
            const nameNorm = name.replace(/\s+/g, '');
            const nameFull = normalize(l.name || '');
            const nameFullNorm = nameFull.replace(/\s+/g, '');
            return name.includes(ql) ||
              nameNorm.includes(qlNorm) ||
              nameFull.includes(qlFull) ||
              nameFullNorm.includes(qlFull.replace(/\s+/g, '')) ||
              (l.victors||[]).some(v => v.name?.toLowerCase().includes(ql));
          });
      paintCards(filteredLevels, false);
    }, 200);
  });

  clearBtn?.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    filteredLevels = [...getLevelsData()];
    paintCards(filteredLevels, false);
    input.focus();
  });
}

// ─── VIEW TOGGLES ───
function setupViewToggles() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === currentView);
    btn.addEventListener('click', () => {
      currentView = btn.dataset.view;
      localStorage.setItem('preferredView', currentView);
      document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b === btn));
      paintCards(filteredLevels, false);
    });
  });
}

// ─── SUBMISSION AUTOCOMPLETE ───
function setupSubmissionAutocomplete() {}

// ─── SCROLL TO SUBMISSIONS ───
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

// ─── LEADERBOARD ───
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
    const avatarUrl = player.discord_id && player.discord_avatar
    ? `https://cdn.discordapp.com/avatars/${player.discord_id}/${player.discord_avatar}.png?size=128`
    : null;
    const medalColors = ['#f59e0b','#cbd5e1','#c2722a'];
    const rankColors  = ['rgba(245,158,11,.15)','rgba(203,213,225,.1)','rgba(194,114,42,.1)'];

    const row = document.createElement('div');
    row.className = `lb-row${pos<=3 ? ` top${pos}` : ''}`;
    row.style.cursor = 'pointer';
  row.addEventListener('click', () => openPlayerProfile(player.name));
    row.innerHTML = `
      <div class="lb-pos-wrap">
        ${pos === 1
          ? `<div class="lb-medal lb-medal-gold"><i class="fas fa-crown"></i></div>`
          : pos === 2
          ? `<div class="lb-medal lb-medal-silver"><i class="fas fa-medal"></i></div>`
          : pos === 3
          ? `<div class="lb-medal lb-medal-bronze"><i class="fas fa-medal"></i></div>`
          : `<div class="lb-pos-num">#${pos}</div>`
        }
      </div>

      <div class="lb-avatar" style="--av-color:${playerColor(player.name)}">
${avatarUrl
  ? `<img src="${esc(avatarUrl)}" alt="">`
  : `<span>${initials}</span>`
}
      </div>

      <div class="lb-info">
        <span class="lb-player-name">${esc(player.gd_username || player.name)}</span>
        ${player.hardest_level
          ? `<span class="lb-hardest"><i class="fas fa-skull"></i> ${esc(player.hardest_level)}</span>`
          : `<span class="lb-hardest"><i class="fas fa-flag"></i> Uruguay</span>`
        }
      </div>

      <div class="lb-stats-group">
        <div class="lb-stat-pill lb-stat-pts">
          <i class="fas fa-star"></i>
          <span>${(player.points||0).toLocaleString()}</span>
          <small>pts</small>
        </div>
        <div class="lb-stat-pill lb-stat-comp">
          <i class="fas fa-flag-checkered"></i>
          <span>${player.completions||0}</span>
          <small>comps</small>
        </div>
      </div>

      <div class="lb-progress-wrap">
        <div class="lb-progress-track">
          <div class="lb-progress-fill" style="width:${pct}%"></div>
        </div>
        <span class="lb-pct">${pct}%</span>
      </div>`;

    tbody.appendChild(row);
    // Animar la barra con delay
    setTimeout(() => {
      row.querySelector('.lb-progress-fill')?.style.setProperty('width', pct + '%');
    }, 50 + i * 30);
  });
}

function playerColor(name) {
  // Genera un color consistente basado en el nombre
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
      // Mostrar mensaje si no hay resultados
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

/* ─── Card Color Extractor ─── */
(function () {

  // Extrae el color dominante de una imagen via canvas
  function getDominantColor(img) {
    const canvas = document.createElement('canvas');
    const size = 40; // downscale para velocidad
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const pr = data[i], pg = data[i+1], pb = data[i+2], a = data[i+3];
      if (a < 128) continue; // skip transparent
      // Skip near-black and near-white (no aportan color interesante)
      const brightness = (pr + pg + pb) / 3;
      if (brightness < 20 || brightness > 230) continue;
      r += pr; g += pg; b += pb; count++;
    }
    if (count === 0) return null;
    return [Math.round(r/count), Math.round(g/count), Math.round(b/count)];
  }

  // Ajusta saturación y oscurece el color para que quede bien de fondo
  function toCardBg(r, g, b) {
    // Convertir a HSL
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

    // Forzar: oscuro (L 10-22%), saturado (S 45-75%)
    l = Math.max(0.10, Math.min(0.22, l * 0.35));
    s = Math.max(0.45, Math.min(0.75, s * 1.6));

    // HSL → RGB
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

  // Aplica el color a una card dada su thumbnail
  function applyCardColor(card, img) {
    try {
      const rgb = getDominantColor(img);
      if (!rgb) return;
      const color = toCardBg(...rgb);
      card.style.setProperty('--card-color', color);
      // También suaviza el borde con el color
      card.style.borderColor = `color-mix(in srgb, ${color} 60%, rgba(255,255,255,.12))`;
    } catch (e) {
      // CORS o error de canvas — no pasa nada, queda el fondo default
    }
  }

  // Procesa todas las tarjetas que ya existen y observa las nuevas
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

  // MutationObserver para cards que se rendericen después
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

// ─── PLAYER PROFILE MODAL ───
function openPlayerProfile(playerName) {
  const players = getPlayersData();
  const player  = players.find(p => p.name === playerName);
  if (!player) return;

  // Buscar todas las completions del jugador en levelsData
  const completions = getLevelsData()
    .filter(l => (l.victors||[]).some(v => v.name === playerName))
    .map(l => {
      const victor = (l.victors||[]).find(v => v.name === playerName);
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
  const rankLabel = rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : `#${rank}`;

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
          <h2 class="pm-name">${esc(player.gd_username || player.name)}</h2>
          <div class="pm-badges-row">
            <span class="pm-rank-badge">${rankLabel} en Uruguay</span>
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
                const ytId  = victor?.videoId || extractYTId(victor?.videoUrl);
                const thumb = level.thumb_url || null;
                const pos   = level.position;
                const posLabel = pos <= 3 ? ['🥇','🥈','🥉'][pos-1] : `#${pos}`;
                return `
                  <div class="pm-completion-row" onclick="closePlayerProfile();openLevelModal(${JSON.stringify(level).replace(/"/g,'&quot;')})">
                    ${thumb
                      ? `<img class="pm-comp-thumb" src="${thumb}" alt="">`
                      : `<div class="pm-comp-thumb pm-comp-thumb-ph"></div>`
                    }
                    <div class="pm-comp-info">
                      <span class="pm-comp-name">${esc(level.name)}</span>
                      <span class="pm-comp-pos">${posLabel} en la lista</span>
                    </div>
                    ${(() => {
                      const vUrl = victor?.videoUrl || null;
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
                        if (plat) {
                          return `<a class="pm-comp-video pm-comp-video-ext" href="${esc(vUrl)}"
                              target="_blank" rel="noopener" onclick="event.stopPropagation()"
                              style="--plat-color:${plat.color}">
                              <i class="${plat.icon}"></i> ${plat.label}
                            </a>`;
                        }
                      }
                      return `<span class="pm-comp-novideo" title="Sin video"><i class="fas fa-video-slash"></i></span>`;
                    })()}
                  </div>`;
              }).join('')}
            </div>`
        }
      </div>
    </div>`;

// Detectar videos privados de YT: thumbnail de 120x90 = placeholder "no disponible"
  modal.querySelectorAll('a[data-ytid]').forEach(link => {
    const img = new Image();
    img.onload = function() {
      if (this.naturalWidth === 120 && this.naturalHeight === 90) {
        link.innerHTML = '<i class="fas fa-lock"></i> Privado';
        link.style.cssText += ';opacity:.5;pointer-events:none;filter:grayscale(1);cursor:default';
      }
    };
    img.src = `https://img.youtube.com/vi/${link.dataset.ytid}/mqdefault.jpg`;
  });

modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Cargar perfil de GDBrowser en background — ícono GD va en sección propia, NO en el avatar de Discord
  const _API = typeof API_BASE !== 'undefined' ? API_BASE : 'http://localhost:3001/api';
  const _gdName = player.gd_username || playerName;
  fetch(`${_API}/gdbrowser?player=${encodeURIComponent(_gdName)}`)
    .then(r => r.json())
    .then(gd => {
      if (!gd?.found) return;

      // Mostrar badge GD en el avatar
      const gdBadge = box.querySelector('#pmGdBadge');
      if (gdBadge) gdBadge.style.display = 'flex';

      const statsEl = box.querySelector('#pmGdStats');
      if (!statsEl) return;

      const chips = [
        gd.stars     != null ? `<div class="pm-gd-chip"><i class="fas fa-star"    style="color:#f59e0b"></i><span>${Number(gd.stars).toLocaleString()}</span><small>estrellas</small></div>`         : '',
        gd.moons     != null ? `<div class="pm-gd-chip"><i class="fas fa-moon"    style="color:#a78bfa"></i><span>${Number(gd.moons).toLocaleString()}</span><small>lunas</small></div>`             : '',
        gd.demons    != null ? `<div class="pm-gd-chip"><i class="fas fa-skull"   style="color:var(--red)"></i><span>${Number(gd.demons).toLocaleString()}</span><small>demons</small></div>`        : '',
        gd.diamonds  != null ? `<div class="pm-gd-chip"><i class="fas fa-gem"     style="color:#38bdf8"></i><span>${Number(gd.diamonds).toLocaleString()}</span><small>diamonds</small></div>`       : '',
        gd.coins     != null ? `<div class="pm-gd-chip"><i class="fas fa-coins"   style="color:#f59e0b"></i><span>${gd.coins}</span><small>coins</small></div>`                                      : '',
        gd.userCoins != null ? `<div class="pm-gd-chip"><i class="fas fa-medal"   style="color:#c2722a"></i><span>${gd.userCoins}</span><small>user coins</small></div>`                            : '',
        gd.cp        != null ? `<div class="pm-gd-chip"><i class="fas fa-fire"    style="color:var(--red)"></i><span>${gd.cp}</span><small>creator pts</small></div>`                               : '',
        gd.rank      != null ? `<div class="pm-gd-chip"><i class="fas fa-globe"   style="color:var(--violet)"></i><span>#${Number(gd.rank).toLocaleString()}</span><small>global</small></div>`     : '',
      ].filter(Boolean);

      if (!chips.length) return;

      statsEl.innerHTML = `
        <div class="pm-gd-block">
          <div class="pm-gd-block-left">
            ${gd.iconUrl
              ? `<div class="pm-gd-icon-wrap">
                   <img src="${esc(gd.iconUrl)}" alt="${esc(gd.username || '')}"
                        class="pm-gd-icon-img"
                        onerror="this.closest('.pm-gd-icon-wrap').style.display='none'">`
              : `<div class="pm-gd-icon-wrap pm-gd-icon-ph">
                   <i class="fas fa-gamepad"></i>`
            }
                 </div>
            <span class="pm-gd-nick">${esc(gd.username || _gdName)}</span>
            ${gd.rank != null
              ? `<span class="pm-gd-global-rank">
                   <i class="fas fa-globe"></i>#${Number(gd.rank).toLocaleString()}
                 </span>`
              : ''
            }
          </div>
          <div class="pm-gd-chips-wrap">
            ${chips.join('')}
          </div>
        </div>`;
      statsEl.style.display = 'block';
    })
    .catch(() => {});

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

window.openLevelModal        = openLevelModal;
window.closeLevelDetailModal = closeLevelDetailModal;
window.scrollToSubmissions   = scrollToSubmissions;

// ─── IR A MI RANKING en el leaderboard ───
function goToMyRanking() {
  if (typeof closeUserDropdown === 'function') closeUserDropdown();
  const name = window.currentUser?.gdUsername || window.currentUser?.name;

  // Si estamos en roulette.html u otra página, redirigir con parámetro
  if (!document.getElementById('leaderboardBody')) {
    window.location.href = name
      ? `index.html#leaderboard?highlight=${encodeURIComponent(name)}`
      : 'index.html#leaderboard';
    return;
  }

  // Scroll al leaderboard
  const section = document.getElementById('leaderboard');
  if (section) {
    const navbar = document.getElementById('navbar');
    const top = section.getBoundingClientRect().top + window.scrollY - (navbar?.offsetHeight || 62) - 8;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  // Resaltar la fila del jugador actual
  if (name) {
    setTimeout(() => {
      document.querySelectorAll('.lb-row').forEach(row => {
        const rowName = row.querySelector('.lb-player-name')?.textContent?.trim().toLowerCase();
        if (rowName === name.toLowerCase()) {
          row.classList.add('lb-row-highlight');
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => row.classList.remove('lb-row-highlight'), 2800);
        }
      });
    }, 600);
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