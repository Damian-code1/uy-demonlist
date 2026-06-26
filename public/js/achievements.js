// ACHIEVEMENTS.JS 

const ACH_API   = '/api/achievements';
const STAFF_ROLES = ['list_mod', 'admin', 'manager', 'owner'];

let _achievements  = [];
let _currentFilter = 'all';
let _currentAchId  = null;
let _currentUser   = null;
let _searchTerm    = '';


document.addEventListener('DOMContentLoaded', async () => {
  loadAchievements();
  setupSearch();
  initAchAuth();
  setupPlayerAutocomplete();
  setupLevelAutocomplete();
  setupFormDraftListeners();
  if (typeof loadData     === 'function') await loadData();
  if (typeof loadAredlMap === 'function') loadAredlMap();
});

function initAchAuth() {
  // Esperar a que auth.js inicialice window.currentUser
  const poll = setInterval(() => {
    if (typeof window.currentUser !== 'undefined') {
      clearInterval(poll);
      onAuthReady();
    }
  }, 80);
  // timeout de seguridad
  setTimeout(() => { clearInterval(poll); onAuthReady(); }, 3000);
}

function onAuthReady() {
  _currentUser = window.currentUser || null;
  applyStaffUI();
  updateCommentAvatar();
  renderAchievements();
}

function applyStaffUI() {
  const isStaff = _currentUser && STAFF_ROLES.includes(_currentUser.role);
  const btn = document.getElementById('achAddBtn');
  if (btn) btn.style.display = isStaff ? 'inline-flex' : 'none';
}

let _achPlayers = null;
async function getAchPlayers() {
  if (_achPlayers) return _achPlayers;
  try {
    const res = await fetch('/api/players');
    const data = await res.json();
    _achPlayers = data.players || [];
  } catch { _achPlayers = []; }
  return _achPlayers;
}

// ─── LEVEL AUTOCOMPLETE ───
function setupLevelAutocomplete() {
  const input = document.getElementById('achFormLevel');
  const sugg  = document.getElementById('achLevelSugg');
  if (!input || !sugg) return;

  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => renderLevelSugg(input.value.trim()), 120);
  });
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 1) renderLevelSugg(input.value.trim());
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#achLevelSugg') && e.target !== input) sugg.style.display = 'none';
  });
}

function scoreAchMatch(name, q) {
  if (name === q) return 200;
  if (name.startsWith(q)) return 150;
  if (name.includes(q)) return 100;
  let qi = 0;
  for (let i = 0; i < name.length && qi < q.length; i++) {
    if (name[i] === q[qi]) qi++;
  }
  if (qi === q.length) return 50;
  return 0;
}

function renderLevelSugg(q) {
  const sugg = document.getElementById('achLevelSugg');
  if (!sugg) return;
  if (!q) { sugg.style.display = 'none'; return; }

  const ql     = q.toLowerCase().trim();
  const levels = typeof getLevelsData === 'function' ? getLevelsData() : [];
  const listHits = levels
    .map(l => ({ ...l, score: scoreAchMatch((l.name || '').toLowerCase(), ql) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  const aredlMapData = window.aredlMap || {};
  const listNames    = new Set(levels.map(l => l.name?.toLowerCase()));
  const aredlHits = Object.entries(aredlMapData)
    .map(([name, info]) => ({ score: scoreAchMatch(name, ql), name, info }))
    .filter(x => x.score > 0 && !listNames.has(x.name))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(x => ({ name: x.info.originalName || x.name, ...x.info }));

  if (!listHits.length && !aredlHits.length) {
    sugg.innerHTML = `<div style="padding:.75rem 1rem;color:var(--text-dim);font-size:.82rem"><i class="fas fa-search" style="margin-right:.4rem"></i>Sin resultados</div>`;
    sugg.style.display = 'block';
    return;
  }

  const listHtml = listHits.map(l => {
    const thumb = l.youtube_id
      ? `<img src="https://img.youtube.com/vi/${l.youtube_id}/default.jpg" style="width:48px;height:28px;object-fit:cover;border-radius:4px;flex-shrink:0">`
      : `<div style="width:48px;height:28px;border-radius:4px;background:var(--bg5);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:.7rem;color:var(--text-dim)"><i class="fas fa-skull"></i></div>`;
    const aredlBadge = l.aredl_position
      ? `<span style="font-size:.65rem;color:var(--violet)"><i class="fas fa-globe"></i> AREDL #${l.aredl_position}</span>`
      : '';
    return `<div class="ach-level-sugg-item" data-name="${esc(l.name)}" style="display:flex;align-items:center;gap:.7rem;padding:.55rem .9rem;cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg4)'" onmouseout="this.style.background=''">
      ${thumb}
      <div style="min-width:0">
        <div style="font-weight:700;font-size:.85rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.name)}</div>
        <div style="display:flex;gap:.5rem;align-items:center;font-size:.65rem;color:var(--text-dim)">
          <span><i class="fas fa-trophy"></i> #${l.position} en la lista</span>
          ${aredlBadge}
        </div>
      </div>
    </div>`;
  }).join('');

  const aredlHtml = aredlHits.map(a => `
    <div class="ach-level-sugg-item" data-name="${esc(a.name)}" style="display:flex;align-items:center;gap:.7rem;padding:.55rem .9rem;cursor:pointer;transition:background .12s;opacity:.85" onmouseover="this.style.background='var(--bg4)'" onmouseout="this.style.background=''">
      <div style="width:48px;height:28px;border-radius:4px;background:var(--bg5);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:.7rem;color:var(--violet)"><i class="fas fa-globe"></i></div>
      <div style="min-width:0">
        <div style="font-weight:700;font-size:.85rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.name)}</div>
        <div style="font-size:.65rem;color:var(--violet)"><i class="fas fa-globe"></i> AREDL #${a.position || '?'} — no está en la lista UY</div>
      </div>
    </div>`).join('');

  sugg.innerHTML = listHtml + aredlHtml;
  sugg.querySelectorAll('.ach-level-sugg-item').forEach(item => {
    item.addEventListener('click', () => {
      document.getElementById('achFormLevel').value = item.dataset.name;
      sugg.style.display = 'none';
    });
  });
  sugg.style.display = 'block';
}

function setupPlayerAutocomplete() {
  const input = document.getElementById('achFormPlayer');
  const sugg  = document.getElementById('achPlayerSugg');
  if (!input || !sugg) return;
  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => renderPlayerSugg(input.value.trim()), 120);
  });
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 1) renderPlayerSugg(input.value.trim());
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#achPlayerSugg') && e.target !== input) sugg.style.display = 'none';
  });
}

async function renderPlayerSugg(q) {
  const sugg = document.getElementById('achPlayerSugg');
  if (!sugg) return;
  if (!q) { sugg.style.display = 'none'; return; }
  const players = await getAchPlayers();
  const ql  = q.toLowerCase();
  const hits = players.filter(p =>
    p.name?.toLowerCase().includes(ql) ||
    p.discord_display_name?.toLowerCase().includes(ql) ||
    p.gd_username?.toLowerCase().includes(ql)
  ).slice(0, 8);

  if (!hits.length) {
    sugg.innerHTML = `<div style="padding:.75rem 1rem;color:var(--text-dim);font-size:.82rem"><i class="fas fa-search" style="margin-right:.4rem"></i>Sin resultados</div>`;
    sugg.style.display = 'block';
    return;
  }

  sugg.innerHTML = hits.map(p => {
    const avatarUrl = p.discord_id && p.discord_avatar
      ? `https://cdn.discordapp.com/avatars/${p.discord_id}/${p.discord_avatar}.png`
      : null;
    const avatarHtml = avatarUrl
      ? `<img src="${avatarUrl}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">`
      : `<div style="width:32px;height:32px;border-radius:50%;background:var(--bg5);display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;flex-shrink:0">${(p.name||'?')[0].toUpperCase()}</div>`;
    const discordName = p.discord_display_name || p.discord_username || '';
    return `<div class="ach-player-sugg-item" data-name="${esc(p.name)}" style="
      display:flex;align-items:center;gap:.75rem;padding:.6rem 1rem;cursor:pointer;transition:background .12s
    " onmouseover="this.style.background='var(--bg4)'" onmouseout="this.style.background=''">
      ${avatarHtml}
      <div style="min-width:0">
        <div style="font-weight:700;font-size:.88rem;color:var(--text)">${esc(p.name)}</div>
        ${discordName ? `<div style="font-size:.72rem;color:var(--text-dim)"><i class="fab fa-discord" style="margin-right:.25rem;color:#5865f2"></i>${esc(discordName)}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  sugg.querySelectorAll('.ach-player-sugg-item').forEach(item => {
    item.addEventListener('click', () => {
      document.getElementById('achFormPlayer').value = item.dataset.name;
      sugg.style.display = 'none';
    });
  });
  sugg.style.display = 'block';
}

async function loadAchievements() {
  document.querySelectorAll('.ach-stat-pill').forEach(p => p.classList.add('loading'));

  try {
    const discordId = localStorage.getItem('uy_discord_id') || '';
    const res = await fetch(ACH_API, {
      headers: discordId ? { 'x-discord-id': discordId } : {},
    });
    const data = await res.json();
    _achievements = data.achievements || [];
    applyStaffUI();
    renderAchievements(); // updateHeroStats() ya se llama dentro de renderAchievements
  } catch (e) {
    document.getElementById('achList').innerHTML =
      `<div class="ach-empty"><i class="fas fa-exclamation-circle"></i><p>Error al cargar: ${e.message}</p></div>`;
  } finally {
    document.querySelectorAll('.ach-stat-pill').forEach(p => p.classList.remove('loading'));
  }
}

function renderAchievements() {
  applyStaffUI();
  const list    = document.getElementById('achList');
  const isStaff = _currentUser && STAFF_ROLES.includes(_currentUser.role);

  let filtered = _achievements.filter(a => {
    if (_currentFilter !== 'all' && a.type !== _currentFilter) return false;
    if (_searchTerm) {
      const q = _searchTerm.toLowerCase();
      if (!a.level_name?.toLowerCase().includes(q) && !a.player_name?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    list.innerHTML = `<div class="ach-empty"><i class="fas fa-trophy"></i><p>No hay achievements que mostrar.</p></div>`;
    return;
  }

  list.innerHTML = filtered.map((a, i) => {
    const ytId     = extractYTId(a.thumbnail_url || a.video_url);
    const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null;
    const myReaction = getMyReaction(a);
    const pos = a.position;
    const rankIcon = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : null;

    const rankFa = pos === 1
      ? `<i class="fas fa-crown" style="color:#f59e0b"></i>`
      : pos === 2
      ? `<i class="fas fa-medal" style="color:#cbd5e1"></i>`
      : pos === 3
      ? `<i class="fas fa-medal" style="color:#c2722a"></i>`
      : `<i class="fas fa-hashtag" style="color:var(--text-dim)"></i>`;

    return `
    <div class="ach-card-wrapper" data-aos="fade-up" data-aos-delay="${Math.min(i * 40, 300)}">
      <div class="ach-pos-col">
        <div class="ach-pos-icon">${rankFa}</div>
        <span class="ach-pos-num">${pos <= 3 ? '' : pos}</span>
      </div>
      <div class="ach-card" data-pos="${pos}" data-id="${a.id}"
           onclick="openAchDetail(${a.id})">
      <div class="ach-card-inner">
        <!-- Thumb -->
        <div class="ach-thumb-wrap">
          ${thumbUrl
            ? `<img class="ach-thumb" src="${thumbUrl}" alt="${esc(a.level_name)}" loading="lazy">
               <div class="ach-thumb-overlay"></div>`
            : `<div class="ach-thumb-ph"><i class="fas fa-trophy"></i></div>`}
        </div>
        <!-- Contenido -->
        <div class="ach-content">
          <span class="ach-type-badge ${a.type === 'completion' ? 'ach-type-completion' : 'ach-type-progress'}">
            ${a.type === 'completion'
              ? '<i class="fas fa-trophy"></i> 100% Completion'
              : '<i class="fas fa-bullseye"></i> Progress'}
          </span>
          <div class="ach-level-name">${esc(a.level_name)}</div>
          <div class="ach-player-row">
            <i class="fas fa-user"></i>
            <span class="ach-player-name">${esc(a.player_name)}</span>
            <span class="ach-progress-tag">${esc(a.progress)}</span>
          </div>
          <div class="ach-card-reactions" onclick="event.stopPropagation()">
            <button class="ach-react-btn ${myReaction === 'like' ? 'like-on' : ''}"
              onclick="reactAch(event, ${a.id}, 'like')">
              <i class="fas fa-thumbs-up"></i> ${a.likes || 0}
            </button>
            <button class="ach-react-btn ${myReaction === 'dislike' ? 'dislike-on' : ''}"
              onclick="reactAch(event, ${a.id}, 'dislike')">
              <i class="fas fa-thumbs-down"></i> ${a.dislikes || 0}
            </button>
            <span class="ach-comment-count">
              <i class="fas fa-comment"></i> ${a.comment_count || 0}
            </span>
          </div>
        </div>
        <!-- Acciones staff -->
        ${isStaff ? `
        <div class="ach-staff-actions" onclick="event.stopPropagation()">
          <button class="ach-staff-btn edit" title="Editar" onclick="openAchForm(${a.id})"><i class="fas fa-pen"></i></button>
          <button class="ach-staff-btn del"  title="Eliminar" onclick="deleteAch(${a.id})"><i class="fas fa-trash"></i></button>
        </div>` : ''}
      </div>
      </div>
    </div>`;
  }).join('');

  AOS.refresh();
}

function animateCount(el, target, duration = 900) {
  if (!el) return;
  const raw   = el.textContent.trim();
  const start = (raw === '—' || raw === '') ? 0 : (parseInt(raw) || 0);
  if (start === target) { el.textContent = target; return; }
  const startTs  = performance.now();

  function easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  function step(now) {
    const elapsed  = now - startTs;
    const progress = Math.min(elapsed / duration, 1);
    const eased    = easeOutExpo(progress);
    el.textContent = Math.round(start + (target - start) * eased);
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target;
  }
  requestAnimationFrame(step);
}

function updateHeroStats() {
  const total       = _achievements.length;
  const completions = _achievements.filter(a => a.type === 'completion').length;
  const progresses  = _achievements.filter(a => a.type === 'progress').length;

  ['achTotalCount','achCompletionCount','achProgressCount'].forEach(id => {
    const el = document.getElementById(id);
    if (el && (el.textContent === '—' || el.textContent === '')) el.textContent = '0';
  });

  animateCount(document.getElementById('achTotalCount'),      total);
  animateCount(document.getElementById('achCompletionCount'), completions);
  animateCount(document.getElementById('achProgressCount'),   progresses);
}

function setFilter(filter) {
  _currentFilter = filter;
  document.querySelectorAll('.ach-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderAchievements();
}
window.setFilter = setFilter;

function setupSearch() {
  const input = document.getElementById('achSearch');
  if (!input) return;
  let deb;
  input.addEventListener('input', () => {
    _searchTerm = input.value.trim();
    clearTimeout(deb);
    deb = setTimeout(renderAchievements, 150);
  });
}

async function openAchDetail(id) {
  const ach = _achievements.find(a => a.id === id);
  if (!ach) return;
  _currentAchId = id;

  const overlay = document.getElementById('achDetailOverlay');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Header
  const ytId     = extractYTId(ach.thumbnail_url || ach.video_url);
  const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg` : null;
  const header   = document.getElementById('achModalHeader');
  header.innerHTML = `
    ${thumbUrl
      ? `<img class="ach-modal-thumb" src="${thumbUrl}" alt="${esc(ach.level_name)}">`
      : `<div class="ach-modal-thumb-ph"><i class="fas fa-trophy"></i></div>`}
    <div class="ach-modal-header-overlay"></div>
    <div class="ach-modal-header-content">
      <div class="ach-modal-pos">#${ach.position} — ${ach.type === 'completion' ? '✅ 100% Completion' : '🎯 Progress'}</div>
      <div class="ach-modal-level" id="achModalLevel">${esc(ach.level_name)}</div>
    </div>`;

  // Meta
  const myReaction = getMyReaction(ach);
  document.getElementById('achModalMeta').innerHTML = `
    <div class="ach-modal-player"><i class="fas fa-user"></i> ${esc(ach.player_name)}</div>
    <span class="ach-progress-tag"><i class="fas fa-bullseye"></i> ${esc(ach.progress)}</span>
    <span class="status-badge ${ach.type === 'completion' ? 'status-approved' : 'status-rejected'}">
      ${ach.type === 'completion' ? '✅ Completion' : '🎯 Progress'}
    </span>`;

  // Acciones
  document.getElementById('achModalActions').innerHTML = `
    <button class="ach-modal-react ${myReaction === 'like' ? 'like-on' : ''}" id="achModalLikeBtn"
      onclick="reactAchModal(${id}, 'like')">
      <i class="fas fa-thumbs-up"></i> <span id="achModalLikes">${ach.likes || 0}</span>
    </button>
    <button class="ach-modal-react ${myReaction === 'dislike' ? 'dislike-on' : ''}" id="achModalDislikeBtn"
      onclick="reactAchModal(${id}, 'dislike')">
      <i class="fas fa-thumbs-down"></i> <span id="achModalDislikes">${ach.dislikes || 0}</span>
    </button>
    ${ach.video_url ? `
    <a href="${esc(ach.video_url)}" target="_blank" class="ach-modal-video-btn">
      <i class="fab fa-youtube"></i> Ver video
    </a>` : ''}`;

  // Notas
  document.getElementById('achModalNotes').innerHTML = ach.notes?.trim()
    ? `<div class="ach-modal-notes">${esc(ach.notes.trim())}</div>`
    : '';

  // Form de comentarios
  const commentForm = document.getElementById('achCommentForm');
  commentForm.style.display = _currentUser ? '' : 'none';
  updateCommentAvatar();
  document.getElementById('achCommentInput').value = '';

  // Cargar comentarios
  loadAchComments(id);
}

function closeAchDetail() {
  document.getElementById('achDetailOverlay').classList.remove('open');
  document.body.style.overflow = '';
  _currentAchId = null;
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('achDetailOverlay')) closeAchDetail();
}
window.handleOverlayClick = handleOverlayClick;
window.openAchDetail  = openAchDetail;
window.closeAchDetail = closeAchDetail;

function getMyReaction(ach) {
  if (!_currentUser) return null;
  return ach._myReaction ?? ach.my_reaction ?? null;
}

function isBanned() {
  const u = window.currentUser;
  return u?.isBanned === true;
}
let _banToastTs = 0;
function checkBan(action = 'hacer eso') {
  if (!isBanned()) return false;
  const now = Date.now();
  if (now - _banToastTs > 4000) {
    _banToastTs = now;
    showToast(`🚫 Estás sancionado y no podés ${action}`, 'error');
  }
  return true;
}

const _reactAchInFlight = new Set();

async function reactAch(e, id, reaction) {
  e.stopPropagation();
  if (!_currentUser) { showToast('Iniciá sesión para reaccionar', 'warning'); return; }
  if (checkBan('reaccionar')) return;
  if (_reactAchInFlight.has(id)) return; // anti-spam
  _reactAchInFlight.add(id);

  try {
    const res  = await fetch(`${ACH_API}/${id}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-discord-id': localStorage.getItem('uy_discord_id') },
      body: JSON.stringify({ reaction }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const ach = _achievements.find(a => a.id === id);
    if (ach) {
      ach.likes       = data.likes;
      ach.dislikes    = data.dislikes;
      ach._myReaction = data.action === 'removed' ? null : reaction;
      ach.my_reaction = ach._myReaction;
    }
    renderAchievements();

    const msg = data.action === 'removed'
      ? `${reaction === 'like' ? 'Like' : 'Dislike'} eliminado`
      : data.action === 'changed'
        ? `Cambiaste a ${reaction === 'like' ? 'like' : 'dislike'}`
        : `${reaction === 'like' ? '👍 Like' : '👎 Dislike'} agregado`;
    showToast(msg, 'info');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    _reactAchInFlight.delete(id);
  }
}
window.reactAch = reactAch;

async function reactAchModal(id, reaction) {
  if (!_currentUser) { showToast('Iniciá sesión para reaccionar', 'warning'); return; }
  if (checkBan('reaccionar')) return;
  if (_reactAchInFlight.has(id)) return; // anti-spam
  _reactAchInFlight.add(id);

  try {
    const res  = await fetch(`${ACH_API}/${id}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-discord-id': localStorage.getItem('uy_discord_id') },
      body: JSON.stringify({ reaction }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const ach = _achievements.find(a => a.id === id);
    if (ach) {
      ach.likes       = data.likes;
      ach.dislikes    = data.dislikes;
      ach._myReaction = data.action === 'removed' ? null : reaction;
      ach.my_reaction = ach._myReaction;
    }

    document.getElementById('achModalLikes').textContent    = data.likes;
    document.getElementById('achModalDislikes').textContent = data.dislikes;
    const likeBtn    = document.getElementById('achModalLikeBtn');
    const dislikeBtn = document.getElementById('achModalDislikeBtn');
    if (data.action === 'removed') {
      likeBtn.classList.remove('like-on');
      dislikeBtn.classList.remove('dislike-on');
    } else if (reaction === 'like') {
      likeBtn.classList.toggle('like-on', true);
      dislikeBtn.classList.remove('dislike-on');
    } else {
      dislikeBtn.classList.toggle('dislike-on', true);
      likeBtn.classList.remove('like-on');
    }

    const msg = data.action === 'removed'
      ? `${reaction === 'like' ? 'Like' : 'Dislike'} eliminado`
      : data.action === 'changed'
        ? `Cambiaste a ${reaction === 'like' ? 'like' : 'dislike'}`
        : `${reaction === 'like' ? '👍 Like' : '👎 Dislike'} agregado`;
    showToast(msg, 'info');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    _reactAchInFlight.delete(id);
  }
}
window.reactAchModal = reactAchModal;

function updateCommentAvatar() {
  const wrap = document.getElementById('achCommentAvatarWrap');
  if (!wrap) return;
  if (_currentUser?.discord_avatar) {
    wrap.outerHTML = `<img class="ach-comment-avatar" id="achCommentAvatarWrap"
      src="https://cdn.discordapp.com/avatars/${_currentUser.discord_id}/${_currentUser.discord_avatar}.webp?size=64"
      alt="">`;
  } else if (_currentUser) {
    wrap.textContent = (_currentUser.discord_display_name || _currentUser.discord_username || '?').slice(0,2).toUpperCase();
  }
}

async function loadAchComments(id) {
  const list = document.getElementById('achCommentsList');
  list.innerHTML = `<div class="ach-loader" style="padding:1.5rem"><i class="fas fa-spinner fa-spin"></i></div>`;

  try {
    const res  = await fetch(`${ACH_API}/${id}/comments`);
    const data = await res.json();
    const comments = data.comments || [];
    document.getElementById('achCommentCount').textContent = `(${comments.length})`;
    if (!comments.length) {
      list.innerHTML = `<div class="ach-comments-empty"><i class="fas fa-comment-slash"></i>Sé el primero en comentar</div>`;
      return;
    }
    list.innerHTML = comments.map(c => renderComment(c, id)).join('');
  } catch (e) {
    list.innerHTML = `<div class="ach-comments-empty"><i class="fas fa-exclamation-circle"></i>Error al cargar comentarios</div>`;
  }
}

function renderComment(c, achId, isReply = false) {
  const avatarEl = c.discord_avatar
    ? `<img class="ach-comment-avatar" src="https://cdn.discordapp.com/avatars/${c.discord_id}/${c.discord_avatar}.webp?size=64" alt="">`
    : `<div class="ach-comment-avatar-ph">${(c.display_name||'?').slice(0,2).toUpperCase()}</div>`;

  const roleLabel = { owner:'Owner', manager:'Manager', admin:'Admin', list_mod:'Mod' };
  const roleBadge = c.role && c.role !== 'usuario'
    ? `<span class="ach-comment-role-badge role-${c.role}">${roleLabel[c.role]||c.role}</span>`
    : '';

  const timeAgo = fmtRelTime(new Date(c.created_at));
  const canDel  = _currentUser && (
    _currentUser.discord_id === c.discord_id ||
    STAFF_ROLES.includes(_currentUser.role)
  );

  const replyBtn = !isReply && _currentUser
    ? `<button class="ach-comment-reply-btn" onclick="toggleReplyForm(${c.id}, ${achId})"><i class="fas fa-reply"></i> Responder</button>`
    : '';
  const showRepliesBtn = !isReply && c.reply_count > 0
    ? `<button class="ach-show-replies" id="showReplies-${c.id}" onclick="loadReplies(${c.id}, ${achId})">
         <i class="fas fa-chevron-down"></i> Ver ${c.reply_count} respuesta${c.reply_count !== 1 ? 's' : ''}
       </button>`
    : '';

  return `
  <div class="ach-comment" id="comment-${c.id}">
    ${avatarEl}
    <div class="ach-comment-body">
      <div class="ach-comment-header">
        <span class="ach-comment-name">${esc(c.display_name || c.discord_username || '?')}</span>
        ${roleBadge}
        <span class="ach-comment-time">${timeAgo}</span>
      </div>
      <div class="ach-comment-text">${esc(c.content)}</div>
      <div class="ach-comment-actions">
        <button class="ach-comment-react like-${c.id}" onclick="reactComment(${c.id}, ${achId}, 'like')">
          <i class="fas fa-thumbs-up"></i> <span class="likes-${c.id}">${c.likes||0}</span>
        </button>
        <button class="ach-comment-react dislike-${c.id}" onclick="reactComment(${c.id}, ${achId}, 'dislike')">
          <i class="fas fa-thumbs-down"></i> <span class="dislikes-${c.id}">${c.dislikes||0}</span>
        </button>
        ${replyBtn}
        ${canDel ? `<button class="ach-comment-del" onclick="deleteAchComment(${c.id}, ${achId})"><i class="fas fa-trash"></i></button>` : ''}
      </div>
      ${showRepliesBtn}
      <div class="ach-replies" id="replies-${c.id}" style="display:none"></div>
      <div id="replyForm-${c.id}" style="display:none;margin-top:.5rem">
        <div class="ach-comment-form" style="margin-bottom:0">
          <div class="ach-comment-avatar-ph" style="width:28px;height:28px;font-size:.65rem">
            ${(_currentUser?.discord_display_name || '?').slice(0,2).toUpperCase()}
          </div>
          <div class="ach-comment-input-wrap">
            <textarea class="ach-comment-input" id="replyInput-${c.id}" placeholder="Responder a ${esc(c.display_name||'?')}…" rows="1"
              oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
            <button class="ach-comment-submit" onclick="submitReply(${c.id}, ${achId})">Responder</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

async function submitAchComment() {
  if (!_currentUser) { showToast('Iniciá sesión para comentar', 'warning'); return; }
  if (checkBan('comentar')) return;
  const input   = document.getElementById('achCommentInput');
  const content = input.value.trim();
  if (!content) return;

  try {
    const res  = await fetch(`${ACH_API}/${_currentAchId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-discord-id': localStorage.getItem('uy_discord_id') },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    input.value = '';
    input.style.height = 'auto';
    loadAchComments(_currentAchId);
    const ach = _achievements.find(a => a.id === _currentAchId);
    if (ach) { ach.comment_count = (ach.comment_count || 0) + 1; renderAchievements(); }
    showToast('Comentario publicado ✓', 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}
window.submitAchComment = submitAchComment;

function toggleReplyForm(commentId, achId) {
  const form = document.getElementById(`replyForm-${commentId}`);
  if (!form) return;
  const isOpen = form.style.display !== 'none';
  form.style.display = isOpen ? 'none' : '';
  if (!isOpen) document.getElementById(`replyInput-${commentId}`)?.focus();
}
window.toggleReplyForm = toggleReplyForm;

async function submitReply(parentId, achId) {
  if (!_currentUser) return;
  if (checkBan('responder')) return;
  const input   = document.getElementById(`replyInput-${parentId}`);
  const content = input?.value.trim();
  if (!content) return;

  try {
    const res  = await fetch(`${ACH_API}/${achId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-discord-id': localStorage.getItem('uy_discord_id') },
      body: JSON.stringify({ content, parent_id: parentId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (input) { input.value = ''; input.style.height = 'auto'; }
    document.getElementById(`replyForm-${parentId}`).style.display = 'none';
    loadReplies(parentId, achId);
    showToast('Respuesta publicada ✓', 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}
window.submitReply = submitReply;

async function loadReplies(commentId, achId) {
  const container = document.getElementById(`replies-${commentId}`);
  const showBtn   = document.getElementById(`showReplies-${commentId}`);
  if (!container) return;

  if (container.style.display !== 'none') {
    container.style.display = 'none';
    if (showBtn) showBtn.innerHTML = `<i class="fas fa-chevron-down"></i> Ver respuestas`;
    return;
  }

  container.style.display = '';
  container.innerHTML = `<div style="padding:.5rem;color:var(--text-dim);font-size:.78rem"><i class="fas fa-spinner fa-spin"></i> Cargando…</div>`;

  try {
    const res  = await fetch(`${ACH_API}/${achId}/comments/${commentId}`);
    const data = await res.json();
    container.innerHTML = (data.replies || []).map(r => renderComment(r, achId, true)).join('');
    if (showBtn) showBtn.innerHTML = `<i class="fas fa-chevron-up"></i> Ocultar respuestas`;
  } catch {
    container.innerHTML = `<div style="color:var(--text-dim);font-size:.78rem">Error al cargar</div>`;
  }
}
window.loadReplies = loadReplies;

async function reactComment(commentId, achId, reaction) {
  if (!_currentUser) { showToast('Iniciá sesión para reaccionar', 'warning'); return; }

  try {
    const res  = await fetch(`${ACH_API}/${achId}/comments/${commentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-discord-id': _currentUser.discord_id },
      body: JSON.stringify({ reaction }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.querySelectorAll(`.likes-${commentId}`).forEach(el => el.textContent = data.likes);
    document.querySelectorAll(`.dislikes-${commentId}`).forEach(el => el.textContent = data.dislikes);

    const msg = data.action === 'removed'
      ? `${reaction === 'like' ? 'Like' : 'Dislike'} eliminado`
      : data.action === 'changed'
        ? `Cambiaste a ${reaction === 'like' ? 'like' : 'dislike'}`
        : `${reaction === 'like' ? '👍' : '👎'} agregado`;
    showToast(msg, 'info');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}
window.reactComment = reactComment;

async function deleteAchComment(commentId, achId) {
  const ok = await uiConfirm({ title: '¿Eliminar comentario?', message: 'Esta acción no se puede deshacer.', type: 'warning', confirmText: 'Eliminar', cancelText: 'Cancelar' });
  if (!ok) return;
  try {
    const res = await fetch(`${ACH_API}/${achId}/comments/${commentId}`, {
      method: 'DELETE',
      headers: { 'x-discord-id': localStorage.getItem('uy_discord_id') },
    });
    if (!res.ok) throw new Error((await res.json()).error);
    document.getElementById(`comment-${commentId}`)?.remove();
    showToast('Comentario eliminado', 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}
window.deleteAchComment = deleteAchComment;

const ACH_FORM_DRAFT_KEY = 'ach_form_draft';

function saveFormDraft() {
  if (document.getElementById('achFormId')?.value) return; // no guardar en edición
  const draft = {
    pos:      document.getElementById('achFormPos')?.value,
    type:     document.getElementById('achFormType')?.value,
    player:   document.getElementById('achFormPlayer')?.value,
    level:    document.getElementById('achFormLevel')?.value,
    progress: document.getElementById('achFormProgress')?.value,
    video:    document.getElementById('achFormVideo')?.value,
    thumb:    document.getElementById('achFormThumb')?.value,
    notes:    document.getElementById('achFormNotes')?.value,
  };
  const hasData = Object.values(draft).some(v => v && v.trim());
  if (hasData) localStorage.setItem(ACH_FORM_DRAFT_KEY, JSON.stringify(draft));
  else localStorage.removeItem(ACH_FORM_DRAFT_KEY);
}

function loadFormDraft() {
  try {
    const raw = localStorage.getItem(ACH_FORM_DRAFT_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (d.pos)      document.getElementById('achFormPos').value      = d.pos;
    if (d.type)     document.getElementById('achFormType').value      = d.type;
    if (d.player)   document.getElementById('achFormPlayer').value    = d.player;
    if (d.level)    document.getElementById('achFormLevel').value     = d.level;
    if (d.progress) document.getElementById('achFormProgress').value  = d.progress;
    if (d.video)    document.getElementById('achFormVideo').value     = d.video;
    if (d.thumb) {
      document.getElementById('achFormThumb').value = d.thumb;
      previewAchThumb(d.thumb);
    }
    if (d.notes)    document.getElementById('achFormNotes').value     = d.notes;
    document.getElementById('achFormType').dispatchEvent(new Event('change'));
    return Object.values(d).some(v => v && v.trim());
  } catch { return false; }
}

function clearFormDraft() {
  localStorage.removeItem(ACH_FORM_DRAFT_KEY);
}

function setupFormDraftListeners() {
  const fields = ['achFormPos','achFormType','achFormPlayer','achFormLevel','achFormProgress','achFormVideo','achFormThumb','achFormNotes'];
  fields.forEach(id => {
    document.getElementById(id)?.addEventListener('input', saveFormDraft);
    document.getElementById(id)?.addEventListener('change', saveFormDraft);
  });
}

function openAchForm(id = null) {
  const isStaff = _currentUser && STAFF_ROLES.includes(_currentUser.role);
  if (!isStaff) return;

  document.getElementById('achFormId').value = id || '';
  document.getElementById('achFormTitle').textContent = id ? 'Editar Achievement' : 'Agregar Achievement';
  document.getElementById('achFormThumbPreview').style.display = 'none';

  if (id) {
    const ach = _achievements.find(a => a.id === id);
    if (ach) {
      document.getElementById('achFormPos').value      = ach.position;
      document.getElementById('achFormType').value     = ach.type;
      document.getElementById('achFormPlayer').value   = ach.player_name;
      document.getElementById('achFormLevel').value    = ach.level_name;
      document.getElementById('achFormProgress').value = ach.progress;
      document.getElementById('achFormVideo').value    = ach.video_url || '';
      document.getElementById('achFormThumb').value    = ach.thumbnail_url || ach.video_url || '';
      document.getElementById('achFormNotes').value    = ach.notes || '';
      previewAchThumb(ach.thumbnail_url || ach.video_url || '');
    }
  } else {
    document.getElementById('achFormPos').value      = _achievements.length + 1;
    document.getElementById('achFormType').value     = 'completion';
    document.getElementById('achFormType').dispatchEvent(new Event('change'));
    document.getElementById('achFormPlayer').value   = '';
    document.getElementById('achFormLevel').value    = '';
    document.getElementById('achFormProgress').value = '';
    document.getElementById('achFormVideo').value    = '';
    document.getElementById('achFormThumb').value    = '';
    document.getElementById('achFormNotes').value    = '';

    const hasDraft = loadFormDraft();
    if (hasDraft) showToast('Borrador restaurado ✓', 'info');
  }

  document.getElementById('achFormOverlay').classList.add('open');
}

function closeAchForm() {
  saveFormDraft();
  document.getElementById('achFormOverlay').classList.remove('open');
}
window.openAchForm  = openAchForm;
window.closeAchForm = closeAchForm;

function previewAchThumb(url) {
  const preview = document.getElementById('achFormThumbPreview');
  const img     = document.getElementById('achFormThumbImg');
  if (!preview || !img) return;

  const trimmed = (url || '').trim();
  if (!trimmed) {
    preview.style.display = 'none';
    return;
  }

  const ytId = extractYTId(trimmed);
  if (!ytId) {
    preview.style.display = 'block';
    preview.innerHTML = `<div class="ach-form-thumb-error"><i class="fas fa-exclamation-circle"></i> Ingresá un link de YouTube válido para ver la preview</div>`;
    return;
  }

  preview.style.display = 'block';
  preview.innerHTML = `
    <div class="ach-form-thumb-loader"><i class="fas fa-spinner fa-spin"></i> Cargando preview…</div>
    <img id="achFormThumbImg" src="" alt="" style="display:none">`;

  const newImg = document.getElementById('achFormThumbImg');
  newImg.onload = () => {
    preview.querySelector('.ach-form-thumb-loader')?.remove();
    newImg.style.display = 'block';
  };
  newImg.onerror = () => {
    preview.innerHTML = `<div class="ach-form-thumb-error"><i class="fas fa-exclamation-circle"></i> No se pudo cargar la thumbnail</div>`;
  };
  newImg.src = `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
}
window.previewAchThumb = previewAchThumb;

async function saveAchForm() {
  const id       = document.getElementById('achFormId').value;
  const position = parseInt(document.getElementById('achFormPos').value);
  const type     = document.getElementById('achFormType').value;
  const player   = document.getElementById('achFormPlayer').value.trim();
  const level    = document.getElementById('achFormLevel').value.trim();
  const progress = document.getElementById('achFormProgress').value.trim();
  const video    = document.getElementById('achFormVideo').value.trim() || null;
  const thumb    = document.getElementById('achFormThumb').value.trim() || null;
  const notes    = document.getElementById('achFormNotes').value.trim() || null;

  if (!position || !player || !level || !type) {
    return showToast('Completá los campos obligatorios', 'error');
  }
  if (type === 'progress' && !progress) {
    return showToast('El campo Progreso es obligatorio para tipo Progreso', 'error');
  }

  // Validar URL de video
  if (video) {
    const validVideo = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/|twitch\.tv\/|clips\.twitch\.tv\/|medal\.tv\/|streamable\.com\/|x\.com\/|twitter\.com\/).+/.test(video);
    if (!validVideo) return showToast('URL de video inválida. Usá YouTube, Twitch, Medal, Streamable o Twitter/X', 'error');
  }

  // Validar URL de thumbnail (solo YouTube)
  if (thumb) {
    const validThumb = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/).+/.test(thumb);
    if (!validThumb) return showToast('El thumbnail debe ser un link de YouTube', 'error');
  }

  const body = { position, player_name: player, level_name: level, progress: progress || '100%', type, video_url: video, thumbnail_url: thumb, notes };

  try {
    const discordId = localStorage.getItem('uy_discord_id');
    if (!discordId) return showToast('No hay sesión activa', 'error');
    const res = await fetch(id ? `${ACH_API}/${id}` : ACH_API, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'x-discord-id': discordId },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(id ? 'Achievement actualizado ✓' : 'Achievement agregado ✓', 'success');
    clearFormDraft();
    closeAchForm();
    loadAchievements();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}
window.saveAchForm = saveAchForm;

async function deleteAch(id) {
  const ok = await uiConfirm({
    title: '¿Eliminar achievement?',
    message: 'Se eliminará permanentemente, incluyendo comentarios y reacciones.',
    type: 'warning', confirmText: 'Eliminar', cancelText: 'Cancelar',
  });
  if (!ok) return;

  try {
    const res = await fetch(`${ACH_API}/${id}`, {
      method: 'DELETE',
      headers: { 'x-discord-id': localStorage.getItem('uy_discord_id') },
    });
    if (!res.ok) throw new Error((await res.json()).error);
    showToast('Achievement eliminado', 'success');
    loadAchievements();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}
window.deleteAch = deleteAch;

function extractYTId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/);
  return m ? m[1] : null;
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtRelTime(date) {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)    return 'hace un momento';
  if (diff < 3600)  return `hace ${Math.floor(diff/60)}m`;
  if (diff < 86400) return `hace ${Math.floor(diff/3600)}h`;
  if (diff < 604800) return `hace ${Math.floor(diff/86400)}d`;
  return date.toLocaleDateString('es-UY', { day:'numeric', month:'short', year:'numeric' });
}

// ─── showToast (por si ui.js no lo carga aún) ───
function showToast(message, type = 'info') {
  if (typeof Toastify === 'undefined') return;
  const colors = { success:'linear-gradient(135deg,#16a34a,#22c55e)', error:'linear-gradient(135deg,#dc2626,#f43f5e)', warning:'linear-gradient(135deg,#d97706,#f59e0b)', info:'linear-gradient(135deg,#7c3aed,#8b5cf6)' };
  Toastify({ text: message, duration: 3500, gravity:'top', position:'right', stopOnFocus:true,
    style: { background: colors[type]||colors.info, borderRadius:'10px', padding:'12px 20px', fontWeight:'600', fontSize:'.88rem', boxShadow:'0 8px 32px rgba(0,0,0,.4)', maxWidth:'360px' }
  }).showToast();
}

// Cerrar form overlay al hacer click fuera
document.getElementById('achFormOverlay')?.addEventListener('click', e => {
  if (e.target === document.getElementById('achFormOverlay')) closeAchForm();
});

// ESC cierra modales
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('achFormOverlay')?.classList.contains('open')) { closeAchForm(); return; }
  if (document.getElementById('achDetailOverlay')?.classList.contains('open')) { closeAchDetail(); return; }
});