// ─── MURAL DE LA COMUNIDAD ───
// Comentarios públicos con replies y avatar de Discord.
// Reglas: 500 chars máx., máx. 1 nivel de reply, "Mostrar más" para replies largas.

const MURAL_PAGE_SIZE = 10;
let muralPosts   = [];
let muralShowing = MURAL_PAGE_SIZE;
let muralTimeInterval = null;

// Metadata de roles para los badges del mural
const MURAL_ROLE_META = {
  owner:    { label: 'Owner',    icon: 'fa-crown',         color: '#f59e0b' },
  manager:  { label: 'Manager',  icon: 'fa-chess-queen',   color: '#ec4899' },
  admin:    { label: 'Admin',    icon: 'fa-shield-halved', color: '#f43f5e' },
  list_mod: { label: 'Mod',      icon: 'fa-shield',        color: '#8b5cf6' },
};

function getMuralRoleMeta(role) {
  return MURAL_ROLE_META[role] || null;
}

// ─── Carga inicial ───
async function loadMural(silent = false) {
  const wrap = document.getElementById('muralFeed');
  if (!wrap) return;
  if (!silent) {
    wrap.innerHTML = `<div class="mural-loading"><i class="fas fa-spinner fa-spin"></i> Cargando…</div>`;
  }
  try {
    const r = await fetch('/api/mural?_t=' + Date.now());
    const { posts = [] } = await r.json();
    muralPosts   = posts;
    if (!silent) muralShowing = MURAL_PAGE_SIZE;
    renderMural();
    startMuralTimeTicker();
  } catch {
    if (!silent) {
      wrap.innerHTML = `<div class="mural-error"><i class="fas fa-exclamation-circle"></i> Error al cargar el mural.</div>`;
    }
  }
}

// ─── Contador de tiempo en vivo (actualiza ".mural-time" cada 30s sin re-renderizar todo) ───
function startMuralTimeTicker() {
  if (muralTimeInterval) clearInterval(muralTimeInterval);
  muralTimeInterval = setInterval(() => {
    document.querySelectorAll('.mural-time[data-ts]').forEach(el => {
      el.textContent = relativeTime(Number(el.dataset.ts));
    });
  }, 30_000);
}

// ─── Actualizar manualmente (botón refresh) ───
async function refreshMural() {
  const btn = document.getElementById('muralRefreshBtn');
  if (btn) {
    btn.classList.add('spinning');
    btn.disabled = true;
  }
  await loadMural(false);
  if (btn) {
    setTimeout(() => { btn.classList.remove('spinning'); btn.disabled = false; }, 600);
  }
}
window.refreshMural = refreshMural;

function renderMural() {
  const wrap = document.getElementById('muralFeed');
  if (!wrap) return;

  if (!muralPosts.length) {
    wrap.innerHTML = `<div class="mural-empty"><i class="far fa-comment-dots"></i><p>Nadie ha comentado todavía.<br>¡Sé el primero!</p></div>`;
    document.getElementById('muralLoadMore')?.classList.add('hidden');
    return;
  }

  const slice = muralPosts.slice(0, muralShowing);
  wrap.innerHTML = slice.map(p => buildPostHTML(p)).join('');

  // Botón cargar más
  const btn = document.getElementById('muralLoadMore');
  if (btn) btn.classList.toggle('hidden', muralShowing >= muralPosts.length);

  // Eventos
  wrap.querySelectorAll('.mural-reply-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleReplyBox(btn.dataset.id));
  });
  wrap.querySelectorAll('.mural-replies-toggle').forEach(btn => {
    btn.addEventListener('click', () => loadReplies(btn.dataset.id));
  });
  wrap.querySelectorAll('.mural-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deletePost(btn.dataset.id));
  });
  wrap.querySelectorAll('.mural-react-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleMuralReaction(btn.dataset.postId, btn.dataset.reaction));
  });
  wrap.querySelectorAll('.mural-reply-submit').forEach(btn => {
    btn.addEventListener('click', () => submitReply(btn.dataset.id));
  });
}

function buildPostHTML(post, isReply = false) {
  const user      = window.currentUser;
  const isOwn     = user && user.id === post.discord_id;
  const isAdminUser = user && ['admin','manager','owner'].includes(user.role);
  const canDelete = isOwn || isAdminUser;

  const avatarUrl = post.discord_id && post.discord_avatar
    ? `https://cdn.discordapp.com/avatars/${post.discord_id}/${post.discord_avatar}.png?size=64`
    : null;
  const avatar = avatarUrl
    ? `<img class="mural-avatar" src="${avatarUrl}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';
  const initials = (post.display_name || post.discord_username || '?')[0].toUpperCase();

  const rankBadge = '';

  // Badge de rol del staff (solo para roles relevantes)
  const roleMeta = getMuralRoleMeta(post.role);
  const roleBadge = roleMeta
    ? `<span class="mural-role-badge mural-role-${post.role}" title="${roleMeta.label}">
         <i class="fas ${roleMeta.icon}"></i>${roleMeta.label}
       </span>`
    : '';

  // Timestamp guardado como epoch para el ticker de tiempo real
  const ts = new Date(post.created_at).getTime();
  const relTime = relativeTime(ts);

  // Username de Discord (@handle) — prefiere discord_username, fallback a gd_username
  const atHandle = post.discord_username || post.gd_username || '—';

  const repliesSection = !isReply ? `
    <div class="mural-replies-wrap" id="replies-${post.id}"></div>
    ${post.reply_count > 0
      ? `<button class="mural-replies-toggle" data-id="${post.id}" data-count="${post.reply_count}">
           <i class="fas fa-comments"></i> Ver ${post.reply_count} respuesta${post.reply_count > 1 ? 's' : ''}
         </button>`
      : ''}
    <div class="mural-reply-form hidden" id="reply-form-${post.id}">
      <textarea class="mural-reply-input" id="reply-input-${post.id}" placeholder="Tu respuesta… (máx. 500 caracteres)" maxlength="500" rows="2"></textarea>
      <div class="mural-reply-form-actions">
        <span class="mural-char-counter" id="reply-counter-${post.id}">0/500</span>
        <button class="mural-reply-cancel" onclick="document.getElementById('reply-form-${post.id}').classList.add('hidden')">Cancelar</button>
        <button class="mural-reply-submit mural-submit-btn" data-id="${post.id}"><i class="fas fa-paper-plane"></i> Responder</button>
      </div>
    </div>
  ` : '';

  return `
    <div class="mural-post${isReply ? ' mural-reply' : ''}" data-post-id="${post.id}">
      <div class="mural-post-header">
        <div class="mural-author">
          <div class="mural-avatar-wrap">
            ${avatar}
            <div class="mural-avatar-fallback" ${avatar ? 'style="display:none"' : ''}>${initials}</div>
          </div>
          <div class="mural-author-info">
            <span class="mural-display-name">${escMural(post.display_name || post.discord_username || 'Usuario')}</span>
            <span class="mural-username">@${escMural(atHandle)}</span>
          </div>
          ${rankBadge}
          ${roleBadge}
        </div>
        <div class="mural-post-meta">
          <span class="mural-time" data-ts="${ts}" title="${new Date(ts).toLocaleString('es-UY')}">${relTime}</span>
          ${canDelete
            ? `<button class="mural-delete-btn" data-id="${post.id}" title="Eliminar comentario">
                 <i class="fas fa-trash-alt"></i>
               </button>`
            : ''}
        </div>
      </div>
      <div class="mural-content">${escMural(post.content)}</div>
      <div class="mural-reactions" data-post-id="${post.id}">
        ${buildReactionBar(post, user)}
      </div>
      ${!isReply && user && !user.isBanned
        ? `<button class="mural-reply-btn" data-id="${post.id}"><i class="fas fa-reply"></i> Responder</button>`
        : ''
      }
      ${repliesSection}
    </div>
  `;
}

function buildReactionBar(post, user) {
  const myId       = user?.id;
  const iLiked     = myId && post.liked_by?.includes(myId);
  const iDisliked  = myId && post.disliked_by?.includes(myId);

  // Dropdowns de usuarios con avatar Discord — se recuperan de liked_by_users / disliked_by_users
  // (arrays de objetos {id, name, avatar} que vienen del backend) o fallback a nombres simples.
  const likedUsers    = post.liked_by_users    || (post.liked_by    || []).map(n => ({ name: n }));
  const dislikedUsers = post.disliked_by_users || (post.disliked_by || []).map(n => ({ name: n }));

  function buildUserDropdown(users, type) {
    if (!users.length) return `<div class="mural-voters-empty">Nadie aún</div>`;
    return users.map(u => {
      const av = u.discord_id && u.discord_avatar
        ? `<img src="https://cdn.discordapp.com/avatars/${u.discord_id}/${u.discord_avatar}.png?size=32" alt="" class="mural-voter-avatar" onerror="this.style.display='none'">`
        : `<span class="mural-voter-avatar mural-voter-avatar-ph">${(u.name||'?')[0].toUpperCase()}</span>`;
      return `<div class="mural-voter-row">${av}<span class="mural-voter-name">${escMural(u.name || 'Usuario')}</span></div>`;
    }).join('');
  }

  const likeDropId    = `mrd-like-${post.id}`;
  const dislikeDropId = `mrd-dislike-${post.id}`;

  if (!user) {
    return `
      <span class="mural-reaction-count mural-reaction-count-clickable"
            onclick="toggleMuralVoterDrop('${likeDropId}', event)">
        <i class="fas fa-thumbs-up"></i> ${post.likes || 0}
        <div class="mural-voters-drop" id="${likeDropId}">
          <div class="mural-voters-title"><i class="fas fa-thumbs-up"></i> Les gustó (${likedUsers.length})</div>
          ${buildUserDropdown(likedUsers, 'like')}
        </div>
      </span>
      <span class="mural-reaction-count mural-dislike-count mural-reaction-count-clickable"
            onclick="toggleMuralVoterDrop('${dislikeDropId}', event)">
        <i class="fas fa-thumbs-down"></i> ${post.dislikes || 0}
        <div class="mural-voters-drop" id="${dislikeDropId}">
          <div class="mural-voters-title"><i class="fas fa-thumbs-down"></i> No les gustó (${dislikedUsers.length})</div>
          ${buildUserDropdown(dislikedUsers, 'dislike')}
        </div>
      </span>`;
  }

  return `
    <button class="mural-react-btn mural-like-btn${iLiked ? ' active' : ''}"
            data-post-id="${post.id}" data-reaction="like">
      <i class="fas fa-thumbs-up"></i>
      <span class="mural-react-count">${post.likes || 0}</span>
    </button>
    ${likedUsers.length > 0 ? `
    <span class="mural-reaction-count-clickable mural-voters-trigger"
          onclick="toggleMuralVoterDrop('${likeDropId}', event)"
          style="position:relative">
      <span class="mural-voters-avatars">
        ${likedUsers.slice(0,3).map(u => u.discord_id && u.discord_avatar
          ? `<img src="https://cdn.discordapp.com/avatars/${u.discord_id}/${u.discord_avatar}.png?size=32" class="mural-voter-mini-avatar" alt="">`
          : `<span class="mural-voter-mini-avatar mural-voter-mini-ph">${(u.name||'?')[0].toUpperCase()}</span>`
        ).join('')}
        ${likedUsers.length > 3 ? `<span class="mural-voter-mini-more">+${likedUsers.length - 3}</span>` : ''}
      </span>
      <div class="mural-voters-drop" id="${likeDropId}">
        <div class="mural-voters-title"><i class="fas fa-thumbs-up" style="color:#4ade80"></i> Les gustó (${likedUsers.length})</div>
        ${buildUserDropdown(likedUsers, 'like')}
      </div>
    </span>` : ''}
    <button class="mural-react-btn mural-dislike-btn${iDisliked ? ' active' : ''}"
            data-post-id="${post.id}" data-reaction="dislike">
      <i class="fas fa-thumbs-down"></i>
      <span class="mural-react-count">${post.dislikes || 0}</span>
    </button>
    ${dislikedUsers.length > 0 ? `
    <span class="mural-reaction-count-clickable mural-voters-trigger"
          onclick="toggleMuralVoterDrop('${dislikeDropId}', event)"
          style="position:relative">
      <span class="mural-voters-avatars">
        ${dislikedUsers.slice(0,3).map(u => u.discord_id && u.discord_avatar
          ? `<img src="https://cdn.discordapp.com/avatars/${u.discord_id}/${u.discord_avatar}.png?size=32" class="mural-voter-mini-avatar" alt="">`
          : `<span class="mural-voter-mini-avatar mural-voter-mini-ph">${(u.name||'?')[0].toUpperCase()}</span>`
        ).join('')}
        ${dislikedUsers.length > 3 ? `<span class="mural-voter-mini-more">+${dislikedUsers.length - 3}</span>` : ''}
      </span>
      <div class="mural-voters-drop" id="${dislikeDropId}">
        <div class="mural-voters-title"><i class="fas fa-thumbs-down" style="color:var(--red)"></i> No les gustó (${dislikedUsers.length})</div>
        ${buildUserDropdown(dislikedUsers, 'dislike')}
      </div>
    </span>` : ''}`;
}

function toggleMuralVoterDrop(id, event) {
  event?.stopPropagation();
  const drop = document.getElementById(id);
  if (!drop) return;
  // Cerrar todos los demás abiertos
  document.querySelectorAll('.mural-voters-drop.open').forEach(d => {
    if (d.id !== id) d.classList.remove('open');
  });
  drop.classList.toggle('open');
}
window.toggleMuralVoterDrop = toggleMuralVoterDrop;

// Cerrar dropdowns al click fuera
document.addEventListener('click', () => {
  document.querySelectorAll('.mural-voters-drop.open').forEach(d => d.classList.remove('open'));
});

function toggleReplyBox(postId) {
  const form   = document.getElementById(`reply-form-${postId}`);
  const input  = document.getElementById(`reply-input-${postId}`);
  const counter = document.getElementById(`reply-counter-${postId}`);
  if (!form) return;
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) {
    input?.focus();
    input?.addEventListener('input', () => {
      if (counter) counter.textContent = `${input.value.length}/500`;
    });
  }
}

async function loadReplies(postId) {
  const wrap = document.getElementById(`replies-${postId}`);
  const btn  = document.querySelector(`.mural-replies-toggle[data-id="${postId}"]`);
  if (!wrap) return;

  // Toggle: si ya tiene replies mostradas, las oculta
  if (wrap.dataset.loaded === '1') {
    wrap.innerHTML = '';
    wrap.dataset.loaded = '0';
    if (btn) btn.innerHTML = `<i class="fas fa-comments"></i> ${btn.dataset.count} respuesta${btn.dataset.count > 1 ? 's' : ''}`;
    return;
  }

  wrap.innerHTML = `<div class="mural-loading-replies"><i class="fas fa-spinner fa-spin"></i></div>`;
  try {
    const r = await fetch(`/api/mural/${postId}`);
    const { replies = [] } = await r.json();
    wrap.innerHTML = replies.map(p => buildPostHTML(p, true)).join('');
    wrap.dataset.loaded = '1';
    if (btn) {
      btn.dataset.count = replies.length;
      btn.innerHTML = `<i class="fas fa-chevron-up"></i> Ocultar respuestas`;
    }
    // Eventos de delete en replies
    wrap.querySelectorAll('.mural-delete-btn').forEach(b => {
      b.addEventListener('click', () => deletePost(b.dataset.id));
    });
  } catch {
    wrap.innerHTML = `<div class="mural-error-sm">Error al cargar.</div>`;
  }
}

async function submitReply(postId) {
  const input = document.getElementById(`reply-input-${postId}`);
  if (!input) return;
  const content = input.value.trim();
  if (!content) return;

  const discordId = localStorage.getItem('uy_discord_id') || '';
  const r = await fetch('/api/mural', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-discord-id': discordId },
    body: JSON.stringify({ content, parent_id: parseInt(postId) }),
  });
  if (r.ok) {
    input.value = '';
    document.getElementById(`reply-form-${postId}`)?.classList.add('hidden');
    // Recargar replies si estaban abiertas
    const wrap = document.getElementById(`replies-${postId}`);
    if (wrap?.dataset.loaded === '1') {
      wrap.dataset.loaded = '0';
      loadReplies(postId);
    }
    // Actualizar contador
    const toggleBtn = document.querySelector(`.mural-replies-toggle[data-id="${postId}"]`);
    if (toggleBtn) {
      const count = parseInt(toggleBtn.dataset.count || 0) + 1;
      toggleBtn.dataset.count = count;
      toggleBtn.innerHTML = `<i class="fas fa-comments"></i> Ver ${count} respuesta${count > 1 ? 's' : ''}`;
    } else {
      // Mostrar toggle si no existía
      const postEl = document.querySelector(`.mural-post[data-post-id="${postId}"]`);
      if (postEl) {
        const btn = document.createElement('button');
        btn.className = 'mural-replies-toggle';
        btn.dataset.id = postId;
        btn.dataset.count = 1;
        btn.innerHTML = `<i class="fas fa-comments"></i> Ver 1 respuesta`;
        btn.addEventListener('click', () => loadReplies(postId));
        postEl.querySelector('.mural-replies-wrap')?.insertAdjacentElement('afterend', btn);
      }
    }
    showToast('Respuesta enviada', 'success');
  } else {
    const { error } = await r.json().catch(() => ({}));
    showToast(error || 'Error al enviar', 'error');
  }
}

async function deletePost(postId) {
  const ok = await uiConfirm({
    title: '¿Eliminar comentario?',
    message: 'Se borrará este comentario y todas sus respuestas.',
    type: 'warning',
    confirmText: 'Eliminar',
    cancelText: 'Cancelar',
  });
  if (!ok) return;

  const discordId = localStorage.getItem('uy_discord_id') || '';
  const r = await fetch(`/api/mural/${postId}`, {
    method: 'DELETE',
    headers: { 'x-discord-id': discordId }
  });
  if (r.ok) {
    await loadMural();
    showToast('Comentario eliminado', 'success');
  } else {
    showToast('Error al eliminar', 'error');
  }
}

// Formulario principal
function initMuralForm() {
  const textarea  = document.getElementById('muralNewText');
  const counter   = document.getElementById('muralCharCount');
  const submitBtn = document.getElementById('muralSubmit');
  if (!textarea) return;

  // ── Contador de caracteres en tiempo real ──
  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    if (counter) {
      counter.textContent = `${len}/500`;
      counter.classList.toggle('mural-counter-warn', len > 450);
      counter.classList.toggle('mural-counter-danger', len > 490);
    }
    if (submitBtn) submitBtn.disabled = len === 0 || len > 500;
    // Auto-grow del textarea (hasta 6 líneas)
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
  });

  // ── Publicar con Ctrl+Enter ──
  textarea.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      submitBtn?.click();
    }
  });

  submitBtn?.addEventListener('click', async () => {
    const content = textarea.value.trim();
    if (!content || content.length > 500) return;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Publicando…`;
    const discordId = localStorage.getItem('uy_discord_id') || '';
    const r = await fetch('/api/mural', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-discord-id': discordId },
      body: JSON.stringify({ content }),
    });
    submitBtn.innerHTML = `<i class="fas fa-paper-plane"></i> Publicar`;
    if (r.ok) {
      textarea.value = '';
      textarea.style.height = 'auto';
      if (counter) { counter.textContent = '0/500'; counter.classList.remove('mural-counter-warn','mural-counter-danger'); }
      submitBtn.disabled = true;
      await loadMural();
      showToast('¡Comentario publicado!', 'success');
    } else {
      const { error } = await r.json().catch(() => ({}));
      showToast(error || 'Error al publicar', 'error');
      submitBtn.disabled = false;
    }
  });

  document.getElementById('muralLoadMore')?.addEventListener('click', () => {
    muralShowing += MURAL_PAGE_SIZE;
    renderMural();
  });

  // ── Botón refresh ──
  document.getElementById('muralRefreshBtn')?.addEventListener('click', refreshMural);
}

// Utilidades
function escMural(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Acepta tanto un string ISO como un epoch numérico
function relativeTime(input) {
  const ts   = typeof input === 'number' ? input : new Date(input).getTime();
  const diff = Date.now() - ts;
  if (diff < 45_000)   return 'ahora mismo';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `hace ${d}d`;
  if (d < 30) return `hace ${d} días`;
  return new Date(ts).toLocaleDateString('es-UY', { day: 'numeric', month: 'short' });
}

function showToast(msg, type = 'info') {
  if (typeof showNotification === 'function') { showNotification(msg, type); return; }
  const t = document.createElement('div');
  t.className = `mural-toast mural-toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2800);
}

// Visibilidad del formulario según sesión
function updateMuralFormVisibility() {
  const formWrap  = document.getElementById('muralFormWrap');
  const loginNote = document.getElementById('muralLoginNote');
  if (!formWrap || !loginNote) return;
  const loggedIn = !!(window.currentUser);
  formWrap.classList.toggle('hidden', !loggedIn);
  loginNote.classList.toggle('hidden', loggedIn);
}

window.loadMural                 = loadMural;
window.updateMuralFormVisibility = updateMuralFormVisibility;
async function toggleMuralReaction(postId, reaction) {
  const user = window.currentUser;
  if (!user) { if (typeof showToast === 'function') showToast('Iniciá sesión para reaccionar', 'info'); return; }

  const discordId = localStorage.getItem('uy_discord_id') || '';
  try {
    const res = await fetch('/api/mural', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-discord-id': discordId },
      body: JSON.stringify({ post_id: Number(postId), reaction })
    });
    if (!res.ok) return;
    const data = await res.json();

    // Actualizar en cache sin re-renderizar todo
    const post = muralPosts.find(p => p.id === Number(postId));
    if (post) {
      post.likes       = data.likes       ?? post.likes;
      post.dislikes    = data.dislikes    ?? post.dislikes;
      post.liked_by    = data.liked_by    ?? post.liked_by;
      post.disliked_by = data.disliked_by ?? post.disliked_by;
    }

    // Actualizar solo el bar de reacciones de ese post, sin re-renderizar toda la lista
    const bar = document.querySelector(`.mural-reactions[data-post-id="${postId}"]`);
    if (bar) bar.innerHTML = buildReactionBar(post || { id: Number(postId), likes: data.likes, dislikes: data.dislikes, liked_by: data.liked_by, disliked_by: data.disliked_by }, user);

    // Re-enganchar eventos del bar actualizado
    bar?.querySelectorAll('.mural-react-btn').forEach(btn => {
      btn.addEventListener('click', () => toggleMuralReaction(btn.dataset.postId, btn.dataset.reaction));
    });
  } catch (e) {
    if (typeof showToast === 'function') showToast('Error al reaccionar', 'error');
  }
}

window.renderMural               = renderMural;

document.addEventListener('DOMContentLoaded', () => {
  initMuralForm();
  loadMural();
  updateMuralFormVisibility();
});