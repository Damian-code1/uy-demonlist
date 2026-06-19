// =============================================
// OWNER.JS — Panel exclusivo del owner
// Vincular usuarios Discord ↔ nombres del leaderboard
// =============================================

let ownerUsers = [];
let ownerLeaderboardNames = [];

function isOwnerUser() {
  return window.currentUser?.role === 'owner';
}

function openOwnerPanel() {
  if (!isOwnerUser()) {
    showToast('Solo el owner puede acceder a este panel', 'error');
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
    container.innerHTML = `<div class="admin-empty"><i class="fas fa-users"></i>Sin usuarios</div>`;
    return;
  }

  const roleOptions = ['usuario', 'list_mod', 'admin', 'owner'];

  container.innerHTML = `
    <p class="text-dim" style="font-size:.78rem;margin-bottom:.85rem">
      <i class="fas fa-info-circle"></i>
      Vinculá cada cuenta Discord con un nombre del leaderboard para que sus completions y stats aparezcan correctamente.
    </p>
    <div class="admin-table-wrap">
      <table class="admin-table owner-users-table">
        <thead><tr>
          <th>Usuario Discord</th>
          <th>GD</th>
          <th>Vinculado al leaderboard</th>
          <th>Rol</th>
          <th>Acciones</th>
        </tr></thead>
        <tbody>
          ${filtered.map(u => {
            const lbOptions = ownerLeaderboardNames.map(n =>
              `<option value="${esc(n)}"${u.linked_player_name === n ? ' selected' : ''}>${esc(n)}</option>`
            ).join('');
            const roleOpts = roleOptions.map(r =>
              `<option value="${r}"${u.role === r ? ' selected' : ''}>${r}</option>`
            ).join('');
            const avatar = u.avatar_url
              ? `<img src="${esc(u.avatar_url)}" alt="" class="owner-user-avatar">`
              : `<div class="owner-user-avatar-ph">${(u.display_label || '?')[0]}</div>`;
            return `<tr data-user-id="${u.id}">
              <td>
                <div class="owner-user-cell">
                  ${avatar}
                  <div>
                    <div class="td-name">${esc(u.display_label)}</div>
                    <div class="text-dim" style="font-size:.72rem">@${esc(u.discord_username)}</div>
                  </div>
                </div>
              </td>
              <td class="text-sub">${esc(u.gd_username || '—')}</td>
              <td>
                <select class="owner-link-select" data-user-id="${u.id}">
                  <option value="">— Sin vincular —</option>
                  ${lbOptions}
                </select>
              </td>
              <td>
                <select class="owner-role-select" data-user-id="${u.id}"${u.role === 'owner' ? ' disabled' : ''}>
                  ${roleOpts}
                </select>
              </td>
              <td>
                <button class="btn-icon btn-edit" title="Guardar cambios"
                  onclick="saveOwnerUser(${u.id})">
                  <i class="fas fa-save"></i>
                </button>
                ${u.linked_player_name ? `
                <button class="btn-icon btn-delete" title="Desvincular"
                  onclick="unlinkOwnerUser(${u.id})">
                  <i class="fas fa-unlink"></i>
                </button>` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

async function saveOwnerUser(userId) {
  const row = document.querySelector(`tr[data-user-id="${userId}"]`);
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
