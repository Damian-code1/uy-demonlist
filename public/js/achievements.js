// =============================================
// ACHIEVEMENTS.JS — UY Demonlist v2
// =============================================

const ACH_API   = '/api/achievements';
const STAFF_ROLES = ['list_mod', 'admin', 'manager', 'owner'];

let _achievements  = [];
let _currentFilter = 'all';
let _currentAchId  = null;
let _currentUser   = null;
let _searchTerm    = '';

// ─── INIT ───
document.addEventListener('DOMContentLoaded', () => {
  loadAchievements();
  setupSearch();
  initAchAuth();
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
  if (typeof updateDiscordLogo === 'function') updateDiscordLogo();
  if (typeof addDiscordLinks   === 'function') addDiscordLinks();
  if (typeof loadFooterCredits === 'function') loadFooterCredits();
  const isStaff = _currentUser && STAFF_ROLES.includes(_currentUser.role);
  if (isStaff) {
    document.getElementById('achAddBtn').style.display = '';
  }
  // Actualizar avatar en el form de comentarios
  updateCommentAvatar();
  // Re-render para mostrar botones de staff
  renderAchievements();
}

// ─── API ───
async function loadAchievements() {
  try {
    const res  = await fetch(ACH_API);
    const data = await res.json();
    _achievements = data.achievements || [];
    renderAchievements();
    updateHeroStats();
  } catch (e) {
    document.getElementById('achList').innerHTML =
      `<div class="ach-empty"><i class="fas fa-exclamation-circle"></i><p>Error al cargar: ${e.message}</p></div>`;
  }
}

// ─── RENDER ───
function renderAchievements() {
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

    return `
    <div class="ach-card" data-pos="${pos}" data-id="${a.id}"
         data-aos="fade-up" data-aos-delay="${Math.min(i * 40, 300)}"
         onclick="openAchDetail(${a.id})">
      <div class="ach-card-inner">
        <!-- Rank -->
        <div class="ach-rank-stripe">
          ${rankIcon
            ? `<span class="ach-rank-icon">${rankIcon}</span>`
            : `<span class="ach-rank-num">#${pos}</span>`}
        </div>
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
    </div>`;
  }).join('');

  AOS.refresh();
}

function updateHeroStats() {
  document.getElementById('achTotalCount').textContent     = _achievements.length;
  document.getElementById('achCompletionCount').textContent = _achievements.filter(a => a.type === 'completion').length;
  document.getElementById('achProgressCount').textContent   = _achievements.filter(a => a.type === 'progress').length;
}

// ─── FILTROS ───
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

// ─── MODAL DETALLE ───
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

// ─── REACCIONES ───
function getMyReaction(ach) {
  if (!_currentUser || !ach._myReaction) return null;
  return ach._myReaction;
}

function isBanned() {
  const u = window.currentUser;
  return u?.isBanned === true;
}
function checkBan(action = 'hacer eso') {
  if (isBanned()) { showToast(`Estás sancionado y no podés ${action}`, 'error'); return true; }
  return false;
}

async function reactAch(e, id, reaction) {
  e.stopPropagation();
  if (!_currentUser) { showToast('Iniciá sesión para reaccionar', 'warning'); return; }
  if (checkBan('reaccionar')) return;

  try {
    const res  = await fetch(`${ACH_API}/${id}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-discord-id': _currentUser.discord_id },
      body: JSON.stringify({ reaction }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Actualizar local
    const ach = _achievements.find(a => a.id === id);
    if (ach) {
      ach.likes    = data.likes;
      ach.dislikes = data.dislikes;
      if (data.action === 'removed')     ach._myReaction = null;
      else if (data.action === 'added')  ach._myReaction = reaction;
      else if (data.action === 'changed') ach._myReaction = reaction;
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
  }
}
window.reactAch = reactAch;

async function reactAchModal(id, reaction) {
  if (!_currentUser) { showToast('Iniciá sesión para reaccionar', 'warning'); return; }
  if (checkBan('reaccionar')) return;

  try {
    const res  = await fetch(`${ACH_API}/${id}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-discord-id': _currentUser.discord_id },
      body: JSON.stringify({ reaction }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const ach = _achievements.find(a => a.id === id);
    if (ach) {
      ach.likes    = data.likes;
      ach.dislikes = data.dislikes;
      if (data.action === 'removed')  ach._myReaction = null;
      else                            ach._myReaction = reaction;
    }

    // Actualizar botones del modal
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
  }
}
window.reactAchModal = reactAchModal;

// ─── COMENTARIOS ───
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
      headers: { 'Content-Type': 'application/json', 'x-discord-id': _currentUser.discord_id },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    input.value = '';
    input.style.height = 'auto';
    loadAchComments(_currentAchId);
    // Actualizar count en la card
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
      headers: { 'Content-Type': 'application/json', 'x-discord-id': _currentUser.discord_id },
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

    // Actualizar contadores en UI
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
      headers: { 'x-discord-id': _currentUser.discord_id },
    });
    if (!res.ok) throw new Error((await res.json()).error);
    document.getElementById(`comment-${commentId}`)?.remove();
    showToast('Comentario eliminado', 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}
window.deleteAchComment = deleteAchComment;

// ─── FORM STAFF (add/edit) ───
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
    document.getElementById('achFormPlayer').value   = '';
    document.getElementById('achFormLevel').value    = '';
    document.getElementById('achFormProgress').value = '';
    document.getElementById('achFormVideo').value    = '';
    document.getElementById('achFormThumb').value    = '';
    document.getElementById('achFormNotes').value    = '';
  }

  document.getElementById('achFormOverlay').classList.add('open');
}

function closeAchForm() {
  document.getElementById('achFormOverlay').classList.remove('open');
}
window.openAchForm  = openAchForm;
window.closeAchForm = closeAchForm;

function previewAchThumb(url) {
  const ytId    = extractYTId(url);
  const preview = document.getElementById('achFormThumbPreview');
  const img     = document.getElementById('achFormThumbImg');
  if (ytId) {
    img.src = `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
    preview.style.display = '';
  } else {
    preview.style.display = 'none';
  }
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

  if (!position || !player || !level || !progress || !type) {
    return showToast('Completá los campos obligatorios', 'error');
  }

  const body = { position, player_name: player, level_name: level, progress, type, video_url: video, thumbnail_url: thumb, notes };

  try {
    const res = await fetch(id ? `${ACH_API}/${id}` : ACH_API, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'x-discord-id': _currentUser.discord_id },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(id ? 'Achievement actualizado ✓' : 'Achievement agregado ✓', 'success');
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
      headers: { 'x-discord-id': _currentUser.discord_id },
    });
    if (!res.ok) throw new Error((await res.json()).error);
    showToast('Achievement eliminado', 'success');
    loadAchievements();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}
window.deleteAch = deleteAch;

// ─── HELPERS ───
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