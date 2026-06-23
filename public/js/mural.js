// ─── MURAL DE LA COMUNIDAD ───
// Comentarios públicos con replies y avatar de Discord.
// Reglas: 500 chars máx., máx. 1 nivel de reply, "Mostrar más" para replies largas.

const MURAL_PAGE_SIZE = 10;
let muralPosts   = [];
let muralShowing = MURAL_PAGE_SIZE;

// ─── Carga inicial ───
async function loadMural() {
  const wrap = document.getElementById('muralFeed');
  if (!wrap) return;
  wrap.innerHTML = `<div class="mural-loading"><i class="fas fa-spinner fa-spin"></i> Cargando…</div>`;
  try {
    const r = await fetch('/api/mural');
    const { posts = [] } = await r.json();
    muralPosts   = posts;
    muralShowing = MURAL_PAGE_SIZE;
    renderMural();
  } catch {
    wrap.innerHTML = `<div class="mural-error"><i class="fas fa-exclamation-circle"></i> Error al cargar el mural.</div>`;
  }
}

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
  wrap.querySelectorAll('.mural-reply-submit').forEach(btn => {
    btn.addEventListener('click', () => submitReply(btn.dataset.id));
  });
}

function buildPostHTML(post, isReply = false) {
  const user      = window.currentUser;
  const isOwn     = user && user.id === post.discord_id;
  const isStaff   = user && ['admin','manager','owner'].includes(user.role);
  const canDelete = isOwn || isStaff;

  const avatarUrl = post.discord_id && post.discord_avatar
    ? `https://cdn.discordapp.com/avatars/${post.discord_id}/${post.discord_avatar}.png?size=64`
    : null;
  const avatar = avatarUrl
    ? `<img class="mural-avatar" src="${avatarUrl}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';
  const initials = (post.display_name || post.gd_username || '?')[0].toUpperCase();

  const rankBadge = post.player_rank
    ? `<span class="mural-rank-badge" title="Ranking en la lista">#${post.player_rank}</span>`
    : '';

  const relTime = relativeTime(post.created_at);

  const repliesSection = !isReply ? `
    <div class="mural-replies-wrap" id="replies-${post.id}"></div>
    ${post.reply_count > 0
      ? `<button class="mural-replies-toggle" data-id="${post.id}">
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
            <span class="mural-display-name">${escMural(post.display_name || post.gd_username || 'Usuario')}</span>
            <span class="mural-username">@${escMural(post.gd_username || '—')}</span>
          </div>
          ${rankBadge}
        </div>
        <div class="mural-post-meta">
          <span class="mural-time" title="${new Date(post.created_at).toLocaleString('es-UY')}">${relTime}</span>
          ${canDelete ? `<button class="mural-delete-btn" data-id="${post.id}" title="Eliminar"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>
      <div class="mural-content">${escMural(post.content)}</div>
      ${!isReply && window.currentUser && !window.currentUser.isBanned
        ? `<button class="mural-reply-btn" data-id="${post.id}"><i class="fas fa-reply"></i> Responder</button>`
        : ''
      }
      ${repliesSection}
    </div>
  `;
}

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
  const textarea = document.getElementById('muralNewText');
  const counter  = document.getElementById('muralCharCount');
  const submitBtn = document.getElementById('muralSubmit');
  if (!textarea) return;

  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    if (counter) {
      counter.textContent = `${len}/500`;
      counter.classList.toggle('mural-counter-warn', len > 450);
    }
    if (submitBtn) submitBtn.disabled = len === 0 || len > 500;
  });

  submitBtn?.addEventListener('click', async () => {
    const content = textarea.value.trim();
    if (!content || content.length > 500) return;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Enviando…`;
    const discordId = localStorage.getItem('uy_discord_id') || '';
    const r = await fetch('/api/mural', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-discord-id': discordId },
      body: JSON.stringify({ content }),
    });
    submitBtn.innerHTML = `<i class="fas fa-paper-plane"></i> Publicar`;
    if (r.ok) {
      textarea.value = '';
      if (counter) { counter.textContent = '0/500'; counter.classList.remove('mural-counter-warn'); }
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
}

// Utilidades
function escMural(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'ahora mismo';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `hace ${d}d`;
  return new Date(dateStr).toLocaleDateString('es-UY', { day:'numeric', month:'short' });
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

window.loadMural              = loadMural;
window.updateMuralFormVisibility = updateMuralFormVisibility;

document.addEventListener('DOMContentLoaded', () => {
  initMuralForm();
  loadMural();
  updateMuralFormVisibility();
});