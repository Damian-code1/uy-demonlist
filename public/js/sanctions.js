// SANCTIONS.JS

let sanctionsUsers = [];
let sanctionsLog    = [];

function canManageSanctions() {
  return window.currentUser && typeof isSanctionsStaffRole === 'function' && isSanctionsStaffRole(window.currentUser.role);
}

function openSanctionsPanel() {
  if (!canManageSanctions()) {
    showToast('No tenés permiso para acceder a este panel', 'error');
    return;
  }
  document.getElementById('sanctionsPanel')?.classList.add('open');
  document.getElementById('sanctionsOverlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  window._scrollbarSetVisible?.(false);
  loadSanctionsTab('users');
}

function closeSanctionsPanel() {
  document.getElementById('sanctionsPanel')?.classList.remove('open');
  document.getElementById('sanctionsOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
  window._scrollbarSetVisible?.(true);
}

let sanctionsCurrentTab = 'users';

function loadSanctionsTab(tab) {
  sanctionsCurrentTab = tab;
  document.querySelectorAll('#sanctionsPanel .admin-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.satab === tab));
  document.getElementById('sanctions-users')?.classList.toggle('active', tab === 'users');
  document.getElementById('sanctions-log')?.classList.toggle('active', tab === 'log');

  const isOwner = window.currentUser?.role === 'owner';
  const clearAllBtn = document.getElementById('sanctionsClearAllBtn');
  if (clearAllBtn) clearAllBtn.style.display = (tab === 'log' && isOwner) ? '' : 'none';

  if (tab === 'log') renderSanctionsLog('');
}

async function sanctionsFetch(path, opts = {}) {
  const discordId = localStorage.getItem('uy_discord_id');
  const res = await fetch(`${API_BASE}/admin/sanctions${path}`, {
    headers: { 'Content-Type': 'application/json', 'x-discord-id': discordId || '' },
    ...opts
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function loadSanctionsUsers() {
  const container = document.getElementById('sanctions-users-table');
  if (!container) return;
  container.innerHTML = `<div class="loader-wrap"><i class="fas fa-spinner fa-spin"></i><span>Cargando usuarios…</span></div>`;

  try {
    const data = await sanctionsFetch('');
    sanctionsUsers = data.users || [];
    sanctionsLog   = data.log   || [];
    renderSanctionsUsers('');
  } catch (e) {
    container.innerHTML = `<div class="admin-notice error"><i class="fas fa-exclamation-circle"></i> ${esc(e.message)}</div>`;
  }
}

function fmtRemaining(expiresAt) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expirado';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m restantes`;
  return `${m}m restantes`;
}

const SANCTIONS_ROLE_LEVELS = { usuario: 0, list_mod: 1, admin: 2, manager: 3, owner: 4 };

function renderSanctionsUsers(filterQ) {
  const container = document.getElementById('sanctions-users-table');
  if (!container) return;

  const q = (filterQ || '').trim().toLowerCase();
  const filtered = q
    ? sanctionsUsers.filter(u =>
        (u.display_label || '').toLowerCase().includes(q) ||
        (u.discord_username || '').toLowerCase().includes(q) ||
        (u.gd_username || '').toLowerCase().includes(q))
    : sanctionsUsers;

  if (!filtered.length) {
    container.innerHTML = `<div class="admin-empty"><i class="fas fa-shield-alt"></i><span>Sin usuarios encontrados</span></div>`;
    return;
  }

  const myDiscordId = window.currentUser?.discordId || null;
  const myLevel = SANCTIONS_ROLE_LEVELS[window.currentUser?.role] ?? 0;

  container.innerHTML = `
    <div class="sa-hint">
      <i class="fas fa-info-circle"></i>
      <span>Los usuarios sancionados no pueden enviar submissions hasta que finalice el tiempo de penalización.</span>
    </div>
    <div class="sa-list">
      ${filtered.map(u => {
        const avatar = u.avatar_url
          ? `<img src="${esc(u.avatar_url)}" alt="" class="sa-avatar">`
          : `<div class="sa-avatar sa-avatar-ph">${(u.display_label || '?')[0].toUpperCase()}</div>`;
        const isOwner = u.role === 'owner';
        const isSelf  = myDiscordId && u.discord_id === myDiscordId;
        const targetLevel = SANCTIONS_ROLE_LEVELS[u.role] ?? 0;
        const isHigherOrEqualRank = targetLevel >= myLevel;

        const amOwner = window.currentUser?.role === 'owner';
        let actionsHtml;
        if (isSelf && amOwner) {
          if (u.is_banned) {
            actionsHtml = `<button class="sa-btn sa-btn-lift" onclick="liftSanction('${esc(u.discord_id)}')">
                             <i class="fas fa-unlock"></i><span>Levantar sanción</span>
                           </button>`;
          } else {
            actionsHtml = `<button class="sa-btn sa-btn-ban" onclick="openBanModal('${esc(u.discord_id)}','${esc(u.display_label)}')">
                             <i class="fas fa-flask"></i><span>Sancionar (test)</span>
                           </button>`;
          }
        } else if (isOwner) {
          actionsHtml = `<div class="sa-owner-protected"><i class="fas fa-crown"></i> Owner protegido</div>`;
        } else if (isSelf) {
          actionsHtml = `<div class="sa-owner-protected" title="No podés sancionarte a vos mismo"><i class="fas fa-ban"></i> No podés sancionarte a vos mismo</div>`;
        } else if (u.is_banned) {
          actionsHtml = `<button class="sa-btn sa-btn-lift" onclick="liftSanction('${esc(u.discord_id)}')">
                           <i class="fas fa-unlock"></i><span>Levantar sanción</span>
                         </button>`;
        } else if (isHigherOrEqualRank) {
          actionsHtml = `<div class="sa-owner-protected" title="No podés sancionar a alguien de tu mismo rango o superior"><i class="fas fa-lock"></i> Rango protegido</div>`;
        } else {
          actionsHtml = `<button class="sa-btn sa-btn-ban" onclick="openBanModal('${esc(u.discord_id)}','${esc(u.display_label)}')">
                           <i class="fas fa-gavel"></i><span>Sancionar</span>
                         </button>`;
        }

        return `
        <div class="sa-card${u.is_banned ? ' sa-card-banned' : ''}" data-discord-id="${esc(u.discord_id)}" onclick="openPlayerSanctionsModal('${esc(u.discord_id)}')">
          <div class="sa-card-header" onclick="openPlayerSanctionsModal('${esc(u.discord_id)}')">
            <div class="sa-avatar-wrap">
              ${avatar}
              ${u.is_banned ? `<span class="sa-ban-dot" title="Sancionado"></span>` : ''}
            </div>
            <div class="sa-user-info">
              <div class="sa-display-name">${esc(u.display_label)}${isSelf ? ' <span class="text-dim" style="font-size:.7rem">(vos)</span>' : ''}</div>
              <div class="sa-discord-handle">@${esc(u.discord_username)}</div>
            </div>
            ${u.is_banned
              ? `<div class="sa-status-badge sa-status-banned">
                   <i class="fas fa-ban"></i>
                   <span>${fmtRemaining(u.banned_until)}</span>
                 </div>`
              : u.sanctions_count > 0
                ? `<div class="sa-status-badge sa-status-history" title="Tiene sanciones en su historial">
                     <i class="fas fa-history"></i>
                     <span>${u.sanctions_count} ${u.sanctions_count === 1 ? 'sanción' : 'sanciones'}</span>
                   </div>`
                : `<div class="sa-status-badge sa-status-ok">
                     <i class="fas fa-check-circle"></i>
                     <span>Sin sanciones</span>
                   </div>`
            }
          </div>

          ${u.is_banned && u.ban_reason ? `
          <div class="sa-ban-reason">
            <i class="fas fa-comment-dots"></i> ${esc(u.ban_reason)}
            ${u.banned_by ? ` <span class="sa-ban-by">— ${esc(u.banned_by)}</span>` : ''}
          </div>` : ''}

          <div class="sa-card-actions" onclick="event.stopPropagation()">
            ${actionsHtml}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function filterSanctionsUsers(q) {
  renderSanctionsUsers(q);
  const clearBtn = document.getElementById('sanctionsUserClear');
  if (clearBtn) clearBtn.style.display = q ? '' : 'none';
}

// Log de sanciones
function fmtLogDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function sanctionLogStatus(entry) {
  if (entry.lifted_early) return { key: 'lifted', label: 'Levantada', cls: 'sa-status-lifted' };
  if (new Date(entry.expires_at) > new Date()) return { key: 'active', label: 'Activa', cls: 'sa-status-active' };
  return { key: 'expired', label: 'Expirada', cls: 'sa-status-expired' };
}

function renderSanctionsLog(filterQ) {
  const container = document.getElementById('sanctions-log-table');
  if (!container) return;

  const q = (filterQ || '').trim().toLowerCase();
  const filtered = q
    ? sanctionsLog.filter(l =>
        (l.display_label || '').toLowerCase().includes(q) ||
        (l.staff_label || '').toLowerCase().includes(q) ||
        (l.reason || '').toLowerCase().includes(q))
    : sanctionsLog;

  if (!filtered.length) {
    container.innerHTML = `<div class="admin-empty"><i class="fas fa-scroll"></i><span>Sin sanciones registradas</span></div>`;
    return;
  }

  const isOwner = window.currentUser?.role === 'owner';

  container.innerHTML = `
    <div class="sa-hint">
      <i class="fas fa-info-circle"></i>
      <span>Historial completo de sanciones aplicadas. Hacé clic en una fila para ver el detalle.</span>
    </div>
    <div class="sa-log-list">
      ${filtered.map(l => {
        const status = sanctionLogStatus(l);
        return `
        <div class="sa-log-row" onclick="openSanctionDetail(${l.id})">
          <div class="sa-log-icon${status.key === 'lifted' ? ' sa-log-lifted' : ''}">
            <i class="fas ${status.key === 'lifted' ? 'fa-unlock' : 'fa-gavel'}"></i>
          </div>
          <div class="sa-log-main">
            <div class="sa-log-target">${esc(l.display_label || 'Usuario desconocido')}</div>
            <div class="sa-log-meta">Sancionado por <strong>${esc(l.staff_label || 'Desconocido')}</strong></div>
          </div>
          <div class="sa-log-side">
            <div class="sa-log-date">${fmtLogDate(l.created_at)}</div>
            <span class="sa-log-status ${status.cls}">${status.label}</span>
          </div>
          ${isOwner ? `
          <button class="sa-log-delete" title="Eliminar del log" onclick="event.stopPropagation();deleteSanctionLog(${l.id})">
            <i class="fas fa-trash-alt"></i>
          </button>` : ''}
        </div>`;
      }).join('')}
    </div>`;
}

function filterSanctionsLog(q) {
  renderSanctionsLog(q);
  const clearBtn = document.getElementById('sanctionsLogClear');
  if (clearBtn) clearBtn.style.display = q ? '' : 'none';
}

// Modal de detalle de sanción
function openSanctionDetail(logId) {
  const entry = sanctionsLog.find(l => l.id === logId);
  if (!entry) return;

  const status = sanctionLogStatus(entry);
  const isOwner = window.currentUser?.role === 'owner';

  const staffAvatar = entry.staff_avatar_url
    ? `<img src="${esc(entry.staff_avatar_url)}" alt="" class="sa-avatar">`
    : `<div class="sa-avatar sa-avatar-ph">${(entry.staff_label || '?')[0].toUpperCase()}</div>`;

  const box = document.getElementById('sanctionDetailBox');
  box.innerHTML = `
    <div class="sa-detail-header"><i class="fas fa-gavel"></i> Detalle de sanción</div>

    <div class="sa-detail-section">
      <div class="sa-detail-label"><i class="fas fa-user"></i> Usuario sancionado</div>
      <div class="sa-detail-staff">
        <div class="sa-detail-staff-info">
          <div class="sa-detail-staff-name">${esc(entry.display_label || 'Desconocido')}</div>
          <div class="sa-detail-staff-handle">ID Discord: ${esc(entry.target_discord_id || entry.discord_id)}</div>
        </div>
      </div>
    </div>

    <div class="sa-detail-section">
      <div class="sa-detail-label"><i class="fas fa-shield-alt"></i> Staff que sancionó</div>
      <div class="sa-detail-staff">
        ${staffAvatar}
        <div class="sa-detail-staff-info">
          <div class="sa-detail-staff-name">${esc(entry.staff_label || entry.banned_by_label || 'Desconocido')}</div>
          <div class="sa-detail-staff-handle">@${esc(entry.staff_username || entry.banned_by || '—')}</div>
        </div>
      </div>
    </div>

    <div class="sa-detail-section">
      <div class="sa-detail-label"><i class="fas fa-clock"></i> Fecha y duración</div>
      <div class="sa-detail-grid">
        <div class="sa-detail-stat">
          <div class="sa-detail-stat-label">Aplicada</div>
          <div class="sa-detail-stat-val">${fmtLogDate(entry.created_at)}</div>
        </div>
        <div class="sa-detail-stat">
          <div class="sa-detail-stat-label">Expira</div>
          <div class="sa-detail-stat-val">${fmtLogDate(entry.expires_at)}</div>
        </div>
        <div class="sa-detail-stat">
          <div class="sa-detail-stat-label">Duración</div>
          <div class="sa-detail-stat-val">${entry.duration_minutes} min</div>
        </div>
        <div class="sa-detail-stat">
          <div class="sa-detail-stat-label">Estado</div>
          <div class="sa-detail-stat-val">${status.label}</div>
        </div>
      </div>
    </div>

    <div class="sa-detail-section">
      <div class="sa-detail-label"><i class="fas fa-comment-dots"></i> Motivo</div>
      <div class="sa-detail-reason">${esc(entry.reason || 'Sin motivo especificado')}</div>
    </div>

    <div class="sa-detail-actions">
      ${isOwner
        ? `<button class="sa-detail-delete-btn" onclick="deleteSanctionLog(${entry.id}, true)">
             <i class="fas fa-trash-alt"></i><span>Eliminar esta sanción del log</span>
           </button>`
        : `<div class="sa-detail-owner-only"><i class="fas fa-lock"></i> Solo el owner puede eliminar sanciones</div>`
      }
    </div>
  `;

  document.getElementById('sanctionDetailModal')?.classList.add('open');
}

function closeSanctionDetail() {
  document.getElementById('sanctionDetailModal')?.classList.remove('open');
}

// Modal: detalle de jugador
function openPlayerSanctionsModal(discordId) {
  const user = sanctionsUsers.find(u => u.discord_id === discordId);
  if (!user) return;

  const history = sanctionsLog
    .filter(l => (l.target_discord_id || l.discord_id) === discordId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const candidateNames = [
    user.linked_player_name,
    user.gd_username,
    user.discord_display_name,
    user.discord_username,
  ].filter(Boolean).map(n => n.toLowerCase());
  const playerStats = candidateNames.length
    ? (window.playersData || []).find(p => candidateNames.includes(p.name.toLowerCase()))
    : null;

  const avatar = user.avatar_url
    ? `<img src="${esc(user.avatar_url)}" alt="" class="psm-avatar">`
    : `<div class="psm-avatar psm-avatar-ph">${(user.display_label || '?')[0].toUpperCase()}</div>`;

  const statsHtml = playerStats ? `
    <div class="psm-stats-grid">
      <div class="psm-stat">
        <div class="psm-stat-val">${playerStats.completions}</div>
        <div class="psm-stat-label">Completions</div>
      </div>
      <div class="psm-stat">
        <div class="psm-stat-val">${playerStats.points.toLocaleString('es-UY')}</div>
        <div class="psm-stat-label">Puntos</div>
      </div>
      <div class="psm-stat psm-stat-hardest">
        <div class="psm-stat-val">${esc(playerStats.hardest_level)}</div>
        <div class="psm-stat-label">Nivel más difícil</div>
      </div>
    </div>` : '';

  const currentBanHtml = user.is_banned ? `
    <div class="psm-current-ban">
      <i class="fas fa-gavel"></i>
      <div>
        <div class="psm-current-ban-title">Sanción activa — ${fmtRemaining(user.banned_until)}</div>
        <div class="psm-current-ban-meta">
          ${user.ban_reason ? esc(user.ban_reason) : 'Sin motivo especificado'}
          ${user.banned_by ? ` — por <strong>${esc(user.banned_by)}</strong>` : ''}
        </div>
      </div>
    </div>` : '';

  const historyHtml = history.length ? `
    <h4 class="psm-section-title"><i class="fas fa-scroll"></i> Historial de sanciones (${history.length})</h4>
    <div class="psm-history-list">
      ${history.map(l => {
        const status = sanctionLogStatus(l);
        return `
        <div class="psm-history-row" onclick="closePlayerSanctionsModal();openSanctionDetail(${l.id})">
          <div class="psm-history-icon${status.key === 'lifted' ? ' psm-history-lifted' : ''}">
            <i class="fas ${status.key === 'lifted' ? 'fa-unlock' : 'fa-gavel'}"></i>
          </div>
          <div class="psm-history-main">
            <div class="psm-history-reason">${esc(l.reason || 'Sin motivo especificado')}</div>
            <div class="psm-history-meta">Por <strong>${esc(l.staff_label || 'Desconocido')}</strong> · ${l.duration_minutes} min</div>
          </div>
          <div class="psm-history-side">
            <div class="psm-history-date">${fmtLogDate(l.created_at)}</div>
            <span class="psm-history-badge ${status.cls}">${status.label}</span>
          </div>
        </div>`;
      }).join('')}
    </div>` : `
    <div class="psm-empty">
      <i class="fas fa-shield-alt"></i>
      <span>Este jugador no tiene sanciones registradas</span>
    </div>`;

  const box = document.getElementById('playerSanctionsBox');
  box.innerHTML = `
    <div class="psm-header">
      <button class="psm-close" onclick="closePlayerSanctionsModal()"><i class="fas fa-times"></i></button>
      <div class="psm-header-content">
        ${avatar}
        <div class="psm-title-wrap">
          <div class="psm-name">${esc(user.display_label)}</div>
          <div class="psm-handle">@${esc(user.discord_username)}</div>
        </div>
      </div>
      <div class="psm-status-row">
        ${user.is_banned
          ? `<span class="psm-status psm-status-banned"><i class="fas fa-ban"></i> Sancionado actualmente</span>`
          : `<span class="psm-status psm-status-ok"><i class="fas fa-check-circle"></i> Sin sanciones activas</span>`
        }
      </div>
    </div>
    <div class="psm-body">
      ${statsHtml}
      ${currentBanHtml}
      ${historyHtml}
    </div>`;

  document.getElementById('playerSanctionsModal')?.classList.add('open');
}

function closePlayerSanctionsModal() {
  document.getElementById('playerSanctionsModal')?.classList.remove('open');
}

window.openPlayerSanctionsModal  = openPlayerSanctionsModal;
window.closePlayerSanctionsModal = closePlayerSanctionsModal;

async function deleteSanctionLog(logId, closeModalAfter) {
  const ok = await uiConfirm({
    title: '¿Eliminar sanción?',
    message: 'Esta sanción se va a borrar del log. Esta acción no se puede deshacer.',
    type: 'warning',
    confirmText: 'Eliminar',
    cancelText: 'Cancelar',
  });
  if (!ok) return;
  try {
    await sanctionsFetch(`?logId=${logId}`, { method: 'DELETE' });
    showToast('Sanción eliminada del log ✓', 'success');
    if (closeModalAfter) closeSanctionDetail();
    await loadSanctionsUsers();
    renderSanctionsLog(document.getElementById('sanctionsLogSearch')?.value || '');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function confirmClearAllSanctions() {
  if (window.currentUser?.role !== 'owner') return;
  const ok = await uiConfirm({
    title: '¿Limpiar todo el log?',
    message: 'Se va a borrar TODO el historial de sanciones. Esta acción no se puede deshacer.',
    type: 'error',
    confirmText: 'Limpiar todo',
    cancelText: 'Cancelar',
  });
  if (!ok) return;
  try {
    await sanctionsFetch(`?clearAll=1`, { method: 'DELETE' });
    showToast('Log de sanciones limpiado ✓', 'success');
    await loadSanctionsUsers();
    renderSanctionsLog('');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

window.loadSanctionsTab        = loadSanctionsTab;
window.filterSanctionsLog      = filterSanctionsLog;
window.openSanctionDetail      = openSanctionDetail;
window.closeSanctionDetail     = closeSanctionDetail;
window.deleteSanctionLog       = deleteSanctionLog;
window.confirmClearAllSanctions = confirmClearAllSanctions;

// Modal de sanción
let banTargetId = null;

function openBanModal(discordId, label) {
  banTargetId = discordId;
  document.getElementById('banModalTarget').textContent = label;
  document.getElementById('banModalReason').value = '';
  document.getElementById('banModalDays').value    = '';
  document.getElementById('banModalHours').value   = '';
  document.getElementById('banModalMinutes').value = '';
  document.getElementById('banModal')?.classList.add('open');
}

function closeBanModal() {
  document.getElementById('banModal')?.classList.remove('open');
  banTargetId = null;
}

async function confirmBanUser() {
  if (!banTargetId) return;

  if (banTargetId === window.currentUser?.discordId && window.currentUser?.role !== 'owner') {
    showToast('No podés sancionarte a vos mismo', 'error');
    closeBanModal();
    return;
  }

  const days    = parseInt(document.getElementById('banModalDays').value)    || 0;
  const hours   = parseInt(document.getElementById('banModalHours').value)   || 0;
  const minutes = parseInt(document.getElementById('banModalMinutes').value) || 0;
  const duration = days * 1440 + hours * 60 + minutes;
  const reason   = document.getElementById('banModalReason').value.trim();

  if (duration <= 0)         { showToast('La duración no puede ser cero', 'error'); document.getElementById('banModalDays').focus(); return; }
  if (days > 365)            { showToast('Máximo 365 días', 'error'); document.getElementById('banModalDays').focus(); return; }
  if (hours > 23)            { showToast('Las horas deben ser 0-23', 'error'); document.getElementById('banModalHours').focus(); return; }
  if (minutes > 59)          { showToast('Los minutos deben ser 0-59', 'error'); document.getElementById('banModalMinutes').focus(); return; }
  if (duration > 365 * 1440) { showToast('La sanción no puede superar 365 días en total', 'error'); return; }
  if (!reason)               { showToast('El motivo es obligatorio', 'error'); document.getElementById('banModalReason').focus(); return; }
  if (reason.length > 200)   { showToast('El motivo no puede superar 200 caracteres', 'error'); document.getElementById('banModalReason').focus(); return; }

  try {
    await sanctionsFetch('', {
      method: 'POST',
      body: JSON.stringify({ discordId: banTargetId, durationMinutes: duration, reason })
    });
    showToast('Usuario sancionado ✓', 'success');
    closeBanModal();
    loadSanctionsUsers();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function liftSanction(discordId) {
  try {
    await sanctionsFetch(`?discordId=${encodeURIComponent(discordId)}`, { method: 'DELETE' });
    showToast('Sanción levantada ✓', 'success');
    loadSanctionsUsers();
    if (window.currentUser?.discordId === discordId && typeof checkSession === 'function') {
      window.currentUser = await checkSession();
      renderUserWidget(window.currentUser);
      hideBanCountdown();
    }
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sanctionsClose')?.addEventListener('click', closeSanctionsPanel);
  document.getElementById('sanctionsOverlay')?.addEventListener('click', closeSanctionsPanel);
  document.getElementById('navSanctionsBtn')?.addEventListener('click', openSanctionsPanel);

  document.querySelectorAll('#sanctionsPanel .admin-tab').forEach(tab =>
    tab.addEventListener('click', () => loadSanctionsTab(tab.dataset.satab)));

  document.getElementById('sanctionsUserClear')?.addEventListener('click', () => {
    const input = document.getElementById('sanctionsUserSearch');
    if (input) { input.value = ''; input.focus(); }
    document.getElementById('sanctionsUserClear').style.display = 'none';
    filterSanctionsUsers('');
  });

  document.getElementById('sanctionsLogClear')?.addEventListener('click', () => {
    const input = document.getElementById('sanctionsLogSearch');
    if (input) { input.value = ''; input.focus(); }
    document.getElementById('sanctionsLogClear').style.display = 'none';
    filterSanctionsLog('');
  });

  document.getElementById('banModalCancel')?.addEventListener('click', closeBanModal);
  document.getElementById('banModalConfirm')?.addEventListener('click', confirmBanUser);
  document.querySelector('#banModal .modal-backdrop')?.addEventListener('click', closeBanModal);

  document.querySelector('#sanctionDetailModal .modal-backdrop')?.addEventListener('click', closeSanctionDetail);
  document.querySelector('#playerSanctionsModal .modal-backdrop')?.addEventListener('click', closePlayerSanctionsModal);
});

window.openSanctionsPanel   = openSanctionsPanel;
window.closeSanctionsPanel  = closeSanctionsPanel;
window.filterSanctionsUsers = filterSanctionsUsers;
window.openBanModal         = openBanModal;
window.closeBanModal        = closeBanModal;
window.confirmBanUser       = confirmBanUser;
window.liftSanction         = liftSanction;
window.canManageSanctions   = canManageSanctions;

// Countdown flotante
let _banCountdownInterval = null;

let _banCountdownBannedUntil = null;
let _banCountdownReason      = null;
let _banCountdownReposObserver = null;

function repositionBanCountdown() {
  const el     = document.getElementById('banCountdownFloat');
  const widget = document.getElementById('userWidget');
  if (!el || !widget) return;

  const dropOpen = widget.querySelector('.user-widget-dropdown')?.classList.contains('open');

  if (dropOpen) {
    el.classList.add('hidden-by-dropdown');
    return;
  }
  el.classList.remove('hidden-by-dropdown');

  const cardRect = widget.querySelector('.user-widget-card')?.getBoundingClientRect();
  if (!cardRect) return;

  el.style.position = 'fixed';
  el.style.top   = `${cardRect.bottom + 10}px`;
  const rightOffset = Math.max(10, Math.min(window.innerWidth - cardRect.right, window.innerWidth - 20));
  el.style.right = `${rightOffset}px`;
  el.style.left  = 'auto';
}
window.repositionBanCountdown = repositionBanCountdown;

function showBanCountdown(bannedUntil, reason) {
  _banCountdownBannedUntil = bannedUntil;
  _banCountdownReason      = reason;

  let el = document.getElementById('banCountdownFloat');
  if (!el) {
    el = document.createElement('div');
    el.id = 'banCountdownFloat';
    el.className = 'ban-countdown-float';
    document.body.appendChild(el);
  }

  const user = window.currentUser;
  const avatarHtml = user?.image
    ? `<img src="${esc(user.image)}" alt="" class="bcd-avatar">`
    : `<div class="bcd-avatar bcd-avatar-placeholder">${(user?.name || 'U')[0].toUpperCase()}</div>`;

  el.innerHTML = `
    <div class="bcd-gradient-border"></div>
    <div class="bcd-header">
      ${avatarHtml}
      <div class="bcd-header-info">
        <span class="bcd-username">${esc(user?.name || 'Usuario')}</span>
        <span class="bcd-badge"><i class="fas fa-gavel"></i> SANCIONADO</span>
      </div>
    </div>
    <div class="bcd-timer-row">
      <i class="fas fa-hourglass-half bcd-timer-icon"></i>
      <span class="ban-countdown-timer" id="banCountdownTimer">--:--:--</span>
    </div>
    ${reason ? `<div class="bcd-reason"><i class="fas fa-comment-dots"></i> ${esc(reason)}</div>` : ''}
  `;
  el.classList.add('visible');
  repositionBanCountdown();

  window.addEventListener('resize', repositionBanCountdown);
  const dropdownEl = document.querySelector('.user-widget-dropdown');
  if (dropdownEl && !_banCountdownReposObserver) {
    _banCountdownReposObserver = new MutationObserver(repositionBanCountdown);
    _banCountdownReposObserver.observe(dropdownEl, { attributes: true, attributeFilter: ['class'] });
  }

  clearInterval(_banCountdownInterval);
  _banCountdownInterval = setInterval(() => {
    const diff = new Date(bannedUntil).getTime() - Date.now();
    if (diff <= 0) {
      clearInterval(_banCountdownInterval);
      hideBanCountdown();
      showToast('Tu sanción ha finalizado, ya podés enviar submissions', 'success');
      if (typeof checkSession === 'function') {
        checkSession().then(u => { window.currentUser = u; renderUserWidget(u); });
      }
      return;
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const timerEl = document.getElementById('banCountdownTimer');
    if (timerEl) timerEl.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }, 1000);
}

function hideBanCountdown() {
  document.getElementById('banCountdownFloat')?.classList.remove('visible');
  clearInterval(_banCountdownInterval);
  window.removeEventListener('resize', repositionBanCountdown);
  _banCountdownReposObserver?.disconnect();
  _banCountdownReposObserver = null;
  _banCountdownBannedUntil = null;
  _banCountdownReason      = null;
}

window.showBanCountdown = showBanCountdown;
window.hideBanCountdown = hideBanCountdown;