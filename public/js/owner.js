// MANAGER.JS

let ownerUsers = [];
let ownerLeaderboardNames = [];

function isOwnerUser() {
  return window.currentUser && typeof isManagerRole === 'function' && isManagerRole(window.currentUser.role);
}

function openOwnerPanel() {
  if (!isOwnerUser()) {
    showToast('No tenés permiso para acceder a este panel', 'error');
    return;
  }
  document.getElementById('ownerPanel')?.classList.add('open');
  document.getElementById('ownerOverlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  window._scrollbarSetVisible?.(false);
  loadOwnerUsers();
}

function closeOwnerPanel() {
  document.getElementById('ownerPanel')?.classList.remove('open');
  document.getElementById('ownerOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
  window._scrollbarSetVisible?.(true);
}

async function loadOwnerUsers() {
  const container = document.getElementById('owner-users-table');
  if (!container) return;
  container.innerHTML = `<div class="loader-wrap"><i class="fas fa-spinner fa-spin"></i><span>Cargando usuarios…</span></div>`;

  try {
    const data = await ownerGetUsers();
    ownerUsers = data.users || [];
    ownerLeaderboardNames = data.leaderboardNames || [];
    renderOwnerUsers('');
  } catch (e) {
    container.innerHTML = `<div class="admin-notice error"><i class="fas fa-exclamation-circle"></i> ${esc(e.message)}</div>`;
  }
}

// ROLE_META en roles.js

function renderOwnerUsers(filterQ) {
  const container = document.getElementById('owner-users-table');
  if (!container) return;

  const q = (filterQ || '').trim().toLowerCase();
  const filtered = q
    ? ownerUsers.filter(u =>
        (u.display_label || '').toLowerCase().includes(q) ||
        (u.discord_username || '').toLowerCase().includes(q) ||
        (u.gd_username || '').toLowerCase().includes(q) ||
        (u.linked_player_name || '').toLowerCase().includes(q))
    : ownerUsers;

  if (!filtered.length) {
    container.innerHTML = `<div class="admin-empty"><i class="fas fa-users"></i><span>Sin usuarios encontrados</span></div>`;
    return;
  }

  const isCurrentUserOwner = window.currentUser?.role === 'owner';
  const assignableRoles = isCurrentUserOwner
    ? window.ROLE_ORDER
    : window.ROLE_ORDER.filter(r => r !== 'owner' && r !== 'manager');

  container.innerHTML = `
    <div class="ou-hint">
      <i class="fas fa-info-circle"></i>
      <span>Vinculá cada cuenta Discord con un nombre del leaderboard para que sus completions y stats aparezcan correctamente.</span>
    </div>
    <div class="ou-list">
      ${filtered.map(u => {
        const lbOptions = ownerLeaderboardNames.map(n =>
          `<option value="${esc(n)}"${u.linked_player_name === n ? ' selected' : ''}>${esc(n)}</option>`
        ).join('');
        const rowRoleOptions = assignableRoles.includes(u.role)
          ? assignableRoles
          : [u.role, ...assignableRoles];

        const roleOpts = rowRoleOptions.map(r => {
          const m = getRoleMeta(r);
          return `<option value="${r}"${u.role === r ? ' selected' : ''}>${m.label}</option>`;
        }).join('');
        const avatar = u.avatar_url
          ? `<img src="${esc(u.avatar_url)}" alt="" class="ou-avatar">`
          : `<div class="ou-avatar ou-avatar-ph">${(u.display_label || '?')[0].toUpperCase()}</div>`;
        const rm = getRoleMeta(u.role);
        const isLinked = !!u.linked_player_name;
        const isOwner  = u.role === 'owner';
        const isSelf   = window.currentUser && u.id === window.currentUser.id;
        const cannotAssignThisRole = !isCurrentUserOwner && !assignableRoles.includes(u.role);
        const isRoleLocked = isSelf || isOwner || cannotAssignThisRole;

        return `
        <div class="ou-card" data-user-id="${u.id}">
          <div class="ou-card-header">
            <div class="ou-avatar-wrap">
              ${avatar}
              <span class="ou-role-dot" style="background:${rm.color}" title="${rm.label}"></span>
            </div>
            <div class="ou-user-info">
              <div class="ou-display-name">${esc(u.display_label)}</div>
              <div class="ou-discord-handle">@${esc(u.discord_username)}</div>
            </div>
            ${u.gd_username ? `
            <div class="ou-gd-badge">
              <i class="fas fa-gamepad"></i>
              <span>${esc(u.gd_username)}</span>
            </div>` : ''}
          </div>

          <div class="ou-card-fields">
            <div class="ou-field">
              <label class="ou-field-label"><i class="fas fa-link"></i> Leaderboard</label>
              <div class="ou-select-wrap">
                <select class="ou-select owner-link-select" data-user-id="${u.id}">
                  <option value="">— Sin vincular —</option>
                  ${lbOptions}
                </select>
                <i class="fas fa-chevron-down ou-select-arrow"></i>
              </div>
            </div>
            <div class="ou-field">
              <label class="ou-field-label"><i class="fas fa-${rm.icon}"></i> Rol</label>
              <div class="ou-select-wrap">
                <select class="ou-select owner-role-select" data-user-id="${u.id}"${isRoleLocked ? ' disabled' : ''}${isSelf ? ' title="No podés cambiar tu propio rol"' : ''}>
                  ${roleOpts}
                </select>
                <i class="fas fa-chevron-down ou-select-arrow"></i>
              </div>
            </div>
          </div>

          <div class="ou-card-actions">
            ${isLinked ? `
            <button class="ou-btn ou-btn-unlink" onclick="unlinkOwnerUser(${u.id})" title="Quitar vinculación al leaderboard">
              <i class="fas fa-unlink"></i>
              <span>Desvincular</span>
            </button>` : `<div></div>`}
            <button class="ou-btn ou-btn-save" onclick="saveOwnerUser(${u.id})">
              <i class="fas fa-save"></i>
              <span>Guardar</span>
            </button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

async function saveOwnerUser(userId) {
  const row = document.querySelector(`.ou-card[data-user-id="${userId}"]`);
  if (!row) return;

  const linked = row.querySelector('.owner-link-select')?.value || null;
  const role   = row.querySelector('.owner-role-select')?.value;

  try {
    await ownerUpdateUser(userId, {
      linked_player_name: linked,
      role,
    });
    showToast('Usuario actualizado ✓', 'success');
    await loadOwnerUsers();
    if (typeof refreshPublicData === 'function') refreshPublicData();
    if (typeof checkSession === 'function') {
      window.currentUser = await checkSession();
      renderUserWidget(window.currentUser);
    }
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function unlinkOwnerUser(userId) {
  try {
    await ownerUpdateUser(userId, { linked_player_name: null });
    showToast('Desvinculado ✓', 'success');
    loadOwnerUsers();
    if (typeof refreshPublicData === 'function') refreshPublicData();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

function filterOwnerUsers(q) {
  renderOwnerUsers(q);
  const clearBtn = document.getElementById('ownerUserClear');
  if (clearBtn) clearBtn.style.display = q ? '' : 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('ownerClose')?.addEventListener('click', closeOwnerPanel);
  document.getElementById('ownerOverlay')?.addEventListener('click', closeOwnerPanel);
  document.getElementById('navOwnerBtn')?.addEventListener('click', openOwnerPanel);

  document.getElementById('ownerUserClear')?.addEventListener('click', () => {
    const input = document.getElementById('ownerUserSearch');
    if (input) { input.value = ''; input.focus(); }
    document.getElementById('ownerUserClear').style.display = 'none';
    filterOwnerUsers('');
  });
});

window.openOwnerPanel   = openOwnerPanel;
window.closeOwnerPanel  = closeOwnerPanel;
window.saveOwnerUser    = saveOwnerUser;
window.unlinkOwnerUser  = unlinkOwnerUser;
window.filterOwnerUsers = filterOwnerUsers;
window.isOwnerUser      = isOwnerUser;
