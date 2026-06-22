// =============================================
// AUTH.JS — UY Demonlist v2
// Floating user widget + Discord OAuth
// =============================================

let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});

async function initAuth() {
  const params = new URLSearchParams(window.location.search);
  const uid    = params.get('uid');
  const auth   = params.get('auth');

  if (uid && auth === 'success') {
    localStorage.setItem('uy_discord_id', uid);
    window.history.replaceState({}, '', window.location.pathname);
    showToast('¡Sesión iniciada!', 'success');
  } else if (auth === 'error') {
    window.history.replaceState({}, '', window.location.pathname);
    showToast('Error al iniciar sesión con Discord', 'error');
  }

  currentUser = await checkSession();
  window.currentUser = currentUser;
  renderUserWidget(currentUser);
  if (typeof refreshMySubmissions === 'function') refreshMySubmissions();

  if (currentUser?.isBanned && typeof showBanCountdown === 'function') {
    showBanCountdown(currentUser.bannedUntil, currentUser.banReason);
  }

  // Auto-actualizar avatar: si el avatar en DB cambió, re-renderizar el widget
  if (currentUser?.image) {
    const img = new Image();
    img.onload = () => {}; // avatar actual carga bien, no hacer nada
    img.onerror = async () => {
      // Avatar roto → re-fetch sesión y re-renderizar
      const discordId = localStorage.getItem('uy_discord_id');
      if (!discordId) return;
      try {
        const res  = await fetch(`/api/auth/session?uid=${discordId}`);
        const data = await res.json();
        if (data.user) {
          window.currentUser = data.user;
          renderUserWidget(data.user);
        }
      } catch {}
    };
    img.src = currentUser.image;
  }

  // Polling cada 30s para detectar cambios de sanción sin necesitar F5
  startSanctionPolling();

  document.getElementById('loginBtn')?.addEventListener('click', loginWithDiscord);

  document.addEventListener('click', e => {
    const widget = document.getElementById('userWidget');
    if (widget && !widget.contains(e.target)) closeUserDropdown();
  });
}

async function checkSession() {
  const discordId = localStorage.getItem('uy_discord_id');
  if (!discordId) return null;
  try {
    const res  = await fetch(`/api/auth/session?uid=${discordId}`);
    const data = await res.json();
    return data.user || null;
  } catch { return null; }
}

function loginWithDiscord() {
  window.location.href = 'https://discord.com/oauth2/authorize?client_id=1503353668941123684&response_type=code&redirect_uri=https%3A%2F%2Fuy-demonlist.vercel.app%2Fapi%2Fauth%2Fcallback%2Fdiscord&scope=identify+email';
}

async function logout() {
  localStorage.removeItem('uy_discord_id');
  // Recarga inmediata: garantiza que TODOS los paneles que dependan de la
  // sesión (sanciones, submissions, admin, etc.) arranquen limpios desde
  // cero, sin tener que refrescar cada uno a mano desde acá.
  window.location.reload();
}

function isAdminUser() {
  return currentUser && typeof isAdminRole === 'function' && isAdminRole(currentUser.role);
}

// ─── Floating Widget ───
function renderUserWidget(user) {
  const widget   = document.getElementById('userWidget');
  const loginBtn = document.getElementById('loginBtn');
  const adminBtn = document.getElementById('navAdminBtn');
  const ownerBtn = document.getElementById('navOwnerBtn');

  if (!widget) return;

  if (!user) {
    widget.classList.remove('visible');
    if (loginBtn)  loginBtn.style.display = 'flex';
    if (adminBtn)  adminBtn.style.display = 'none';
    if (ownerBtn)  ownerBtn.style.display = 'none';
    return;
  }

  if (loginBtn) loginBtn.style.display = 'none';
  widget.classList.add('visible');

  if (adminBtn) {
    adminBtn.style.display = isAdminRole(user.role) ? 'flex' : 'none';
  }

  const sanctionsBtn = document.getElementById('navSanctionsBtn');
  if (sanctionsBtn) {
    const canSeeSanctions = typeof isSanctionsStaffRole === 'function'
      ? isSanctionsStaffRole(user.role)
      : ['owner','admin','manager'].includes(user.role);
    sanctionsBtn.style.display = canSeeSanctions ? 'flex' : 'none';
  }

  if (user.isBanned && typeof showBanCountdown === 'function') {
    showBanCountdown(user.bannedUntil, user.banReason);
  } else if (typeof hideBanCountdown === 'function') {
    hideBanCountdown();
  }
  if (ownerBtn) {
    ownerBtn.style.display = isManagerRole(user.role) ? 'flex' : 'none';
  }

  const avatarHtml = user.image
    ? `<img src="${esc(user.image)}" alt="" class="user-widget-avatar">`
    : `<div class="user-widget-avatar-placeholder">${(user.name || 'U')[0].toUpperCase()}</div>`;

  const roleClass = `role-${user.role || 'usuario'}`;
  const roleLabel = {
    owner:    '👑 OWNER',
    manager:  '🔱 MANAGER',
    admin:    '⚡ ADMIN',
    list_mod: '🛡 MOD',
    usuario:  'USUARIO',
  }[user.role] || 'USUARIO';

  const card = widget.querySelector('.user-widget-card');
  const drop = widget.querySelector('.user-widget-dropdown');

  if (card) {
    card.innerHTML = `
      ${avatarHtml}
      <div class="user-widget-info">
        <div class="user-widget-name">${esc(user.name || 'Usuario')}</div>
        <div class="user-widget-role ${roleClass}">${roleLabel}</div>
      </div>
      <i class="fas fa-chevron-down user-widget-chevron"></i>`;
    card.onclick = toggleUserDropdown;
  }

const isRoulettePage = window.location.pathname.includes('roulette');

  // ─── Ruleta: perfil flotante de solo lectura, sin dropdown ───
  // Solo usuario, avatar y rango — sin stats, sin GD, sin acciones, sin logout.
  if (isRoulettePage) {
    if (card) {
      card.innerHTML = `
        ${avatarHtml}
        <div class="user-widget-info">
          <div class="user-widget-name">${esc(user.name || 'Usuario')}</div>
          <div class="user-widget-role ${roleClass}">${roleLabel}</div>
        </div>`;
      card.onclick = null;
    }
    if (drop) drop.innerHTML = '';
    return;
  }

  if (drop) {
    const gdSection = user.gdUsername
      ? `<div class="wdd-gd-linked">
           <div class="wdd-gd-icon">
             <img src="https://gdbrowser.com/assets/difficulties/harder.png"
               onerror="this.src=''" alt=""
               style="width:28px;height:28px;object-fit:contain;image-rendering:pixelated">
           </div>
           <div class="wdd-gd-info">
             <span class="wdd-gd-label">Cuenta de GD vinculada</span>
             <span class="wdd-gd-nick">${esc(user.gdUsername)}</span>
           </div>
           <span class="wdd-gd-check"><i class="fas fa-circle-check"></i></span>
           <button class="wdd-gd-unlink-btn" title="Desvincular cuenta de GD" onclick="unlinkGdUsername()">
             <i class="fas fa-link-slash"></i>
           </button>
         </div>`
      : `<div class="wdd-gd-unlinked">
           <div class="wdd-gd-icon wdd-gd-icon-empty">
             <i class="fas fa-gamepad"></i>
           </div>
           <div class="wdd-gd-info">
             <span class="wdd-gd-label">Sin cuenta de GD</span>
             <span class="wdd-gd-sublabel">Vinculá para ver tus stats</span>
           </div>
           <button class="wdd-gd-link-btn" onclick="promptLinkGdUsername()">
             <i class="fas fa-link"></i>
           </button>
         </div>`;

    drop.innerHTML = `
      ${!isRoulettePage ? `
      <div class="wdd-stats-row">
        <div class="wdd-stat">
          <span class="wdd-stat-val">${(user.points || 0).toLocaleString()}</span>
          <span class="wdd-stat-lbl"><i class="fas fa-star"></i> Puntos</span>
        </div>
        <div class="wdd-stat-sep"></div>
        <div class="wdd-stat">
          <span class="wdd-stat-val">${user.completions || 0}</span>
          <span class="wdd-stat-lbl"><i class="fas fa-flag-checkered"></i> Completions</span>
        </div>
      </div>` : ''}

      <div class="wdd-gd-section">
        ${gdSection}
      </div>

      <div class="wdd-actions">
        ${!isRoulettePage ? `
        <button class="wdd-action-btn" onclick="goToMyRanking()">
          <i class="fas fa-list-ol"></i>
          <span>Mi ranking</span>
        </button>` : ''}
        ${isAdminUser() && !isRoulettePage ? `
        <button class="wdd-action-btn wdd-action-admin" onclick="openAdminPanel();closeUserDropdown()">
          <i class="fas fa-shield-alt"></i>
          <span>Admin</span>
        </button>` : ''}
        ${isManagerRole(user.role) && !isRoulettePage ? `
        <button class="wdd-action-btn wdd-action-owner" onclick="openOwnerPanel();closeUserDropdown()">
          <i class="fas fa-crown"></i>
          <span>Owner</span>
        </button>` : ''}
      </div>

      <div class="wdd-footer">
        <button class="wdd-logout-btn" onclick="logout()">
          <i class="fas fa-sign-out-alt"></i> Cerrar Sesión
        </button>
      </div>`;
  }
}

async function promptLinkGdUsername() {
  const players = typeof getPlayersData === 'function'
    ? getPlayersData().map(p => p.name)
    : [];

  const nick = await uiPrompt({
    title:       'VINCULAR CUENTA DE GD',
    message:     'Ingresá tu nick de Geometry Dash. Se verificará que exista en GD.',
    placeholder: 'Tu nick de GD…',
    confirmText: 'Vincular',
    suggestions: players,
  });

  if (!nick) return;

  try {
    const discordId = localStorage.getItem('uy_discord_id');
    const res = await fetch('/api/users/link-gd', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-discord-id': discordId || '' },
      body:    JSON.stringify({ gd_username: nick }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al vincular');
    await uiAlert({
      title:   '¡VINCULADO!',
      message: `Tu cuenta está vinculada como <strong>${nick}</strong>. Recargando…`,
      type:    'success',
    });
    location.reload();
  } catch (e) {
    await uiAlert({ title: 'ERROR', message: e.message, type: 'error' });
  }
}
window.promptLinkGdUsername = promptLinkGdUsername;

async function unlinkGdUsername() {
  const ok = await uiConfirm({
    title:       '¿Desvincular cuenta de GD?',
    message:     'Vas a dejar de ver tus stats vinculadas a tu cuenta de Discord. Podés volver a vincularla cuando quieras.',
    type:        'warning',
    confirmText: 'Desvincular',
    cancelText:  'Cancelar',
  });
  if (!ok) return;

  try {
    const discordId = localStorage.getItem('uy_discord_id');
    const res = await fetch('/api/users/link-gd', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-discord-id': discordId || '' },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al desvincular');
    showToast('Cuenta de GD desvinculada', 'success');
    location.reload();
  } catch (e) {
    await uiAlert({ title: 'ERROR', message: e.message, type: 'error' });
  }
}
window.unlinkGdUsername = unlinkGdUsername;

function toggleUserDropdown() {
  const card = document.querySelector('.user-widget-card');
  const drop = document.querySelector('.user-widget-dropdown');
  if (!drop) return;
  const isOpen = drop.classList.toggle('open');
  card?.classList.toggle('open', isOpen);
  if (typeof repositionBanCountdown === 'function') repositionBanCountdown();
}

function closeUserDropdown() {
  document.querySelector('.user-widget-dropdown')?.classList.remove('open');
  document.querySelector('.user-widget-card')?.classList.remove('open');
}

function showToast(msg, type = 'info') {
  const colors = {
    success: 'linear-gradient(135deg, #22c55e, #16a34a)',
    error:   'linear-gradient(135deg, #f43f5e, #e11d48)',
    info:    'linear-gradient(135deg, #8b5cf6, #6d28d9)'
  };
  if (typeof Toastify !== 'undefined') {
    Toastify({
      text: msg, duration: 3000, gravity: 'bottom', position: 'right',
      style: { background: colors[type] || colors.info, borderRadius: '8px', fontSize: '.85rem', fontFamily: 'Inter,sans-serif' }
    }).showToast();
  }
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.logout           = logout;
window.loginWithDiscord = loginWithDiscord;
window.showToast        = showToast;
window.isAdminUser      = isAdminUser;
window.checkSession     = checkSession;
window.renderUserWidget = renderUserWidget;

let _sanctionPollInterval = null;
let _lastBanState = null;

function startSanctionPolling() {
  if (_sanctionPollInterval) clearInterval(_sanctionPollInterval);
  _sanctionPollInterval = setInterval(async () => {
    const discordId = localStorage.getItem('uy_discord_id');
    if (!discordId) return;
    try {
      const res  = await fetch(`/api/auth/session?uid=${discordId}`);
      const data = await res.json();
      const user = data.user || null;
      if (!user) return;

      const nowBanned = !!user.isBanned;
      const wasBanned = !!_lastBanState;

      // Se acaba de sancionar → recargar para mostrar ban
      if (nowBanned && !wasBanned) {
        location.reload();
        return;
      }

      // Se levantó la sanción → recargar para quitar ban
      if (!nowBanned && wasBanned) {
        location.reload();
        return;
      }

      _lastBanState = nowBanned;
      window.currentUser = user;
    } catch {}
  }, 30000);

  // Inicializar estado
  if (currentUser) _lastBanState = !!currentUser.isBanned;
}
window.startSanctionPolling = startSanctionPolling;
