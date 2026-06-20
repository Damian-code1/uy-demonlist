// =============================================
// ADMIN.JS — UY Demonlist v2
// =============================================

let adminCurrentTab  = 'levels';
let adminVictorLevelId = null;

function openAdminPanel() {
  document.getElementById('adminPanel')?.classList.add('open');
  document.getElementById('adminOverlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  window._scrollbarSetVisible?.(false);
  loadAdminTab('levels');
}

function closeAdminPanel() {
  document.getElementById('adminPanel')?.classList.remove('open');
  document.getElementById('adminOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
  window._scrollbarSetVisible?.(true);
  closeUserDropdown();
}

function loadAdminTab(tab) { 
  adminCurrentTab = tab;
  document.querySelectorAll('.admin-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.admin-section').forEach(s =>
    s.classList.toggle('active', s.id === `admin-${tab}`));

  switch (tab) {
    case 'levels':      loadAdminLevels();      break;
    case 'victors':     loadAdminVictors();     break;
    case 'players':     loadAdminPlayers();     break;
    case 'points':      loadAdminPoints();      break;
    case 'submissions': loadAdminSubmissions(); break;
    case 'thumbnails':  loadAdminThumbnails();  break;
    case 'sync':        loadAdminSyncTab();     break;
}
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('adminClose')?.addEventListener('click', closeAdminPanel);
  document.getElementById('adminOverlay')?.addEventListener('click', closeAdminPanel);
  document.querySelectorAll('.admin-tab').forEach(tab =>
    tab.addEventListener('click', () => loadAdminTab(tab.dataset.tab)));
  document.getElementById('navAdminBtn')?.addEventListener('click', openAdminPanel);
});

// ─── HELPERS ───
function adminLoading() {
  return `<div class="loader-wrap"><i class="fas fa-spinner fa-spin"></i><span>Cargando…</span></div>`;
}
function adminError(msg) {
  return `<div class="admin-notice error"><i class="fas fa-exclamation-circle"></i> ${msg}</div>`;
}
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// =============================================
// LEVELS
// =============================================
async function loadAdminLevels() {
  const container = document.getElementById('admin-levels-table');
  if (!container) return;
  container.innerHTML = adminLoading();

  try {
    const data = await adminGetLevels();
    renderAdminLevels(data.levels || []);
  } catch (e) {
    container.innerHTML = adminError('Error al cargar niveles: ' + e.message);
  }
}

function renderAdminLevels(levels) {
  const container = document.getElementById('admin-levels-table');
  if (!container) return;

  if (!levels.length) {
    container.innerHTML = `<div class="admin-empty"><i class="fas fa-list"></i>No hay niveles</div>`;
    return;
  }

  container.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>#</th><th>Nombre</th><th>Victors</th><th>Acciones</th>
        </tr></thead>
        <tbody id="adminLevelsBody"></tbody>
      </table>
    </div>`;

  const tbody = document.getElementById('adminLevelsBody');
  levels.forEach(level => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="font-mono">${level.position}</td>
      <td class="td-name">${esc(level.name)}</td>
      <td><span class="text-violet font-mono">${level.victorCount || 0}</span></td>
      <td>
        <button class="btn-icon btn-edit" title="Editar"
          onclick="openAdminLevelModal(${level.id},'${esc(level.name)}',${level.position},'${esc(level.youtube_url||'')}','${esc(level.gd_id||'')}',${level.legacy?1:0},${level.two_player?1:0})">
          <i class="fas fa-pen"></i>
        </button>
        <button class="btn-icon btn-delete" title="Eliminar"
          onclick="deleteLevel(${level.id})">
          <i class="fas fa-trash"></i>
        </button>
      </td>`;
    tbody.appendChild(tr);
  });
}

function filterAdminLevels(q) {
  const ql      = q.toLowerCase();
  const clearBtn = document.getElementById('adminLevelClear');
  if (clearBtn) clearBtn.style.display = q ? '' : 'none';

  let found = 0;
  document.querySelectorAll('#adminLevelsBody tr').forEach(r => {
    const name = r.querySelector('.td-name')?.textContent.toLowerCase() || '';
    const show = !ql || name.includes(ql);
    r.style.display = show ? '' : 'none';
    if (show) found++;
  });

  // Mensaje sin resultados
  let noRow = document.getElementById('adminLevelsNoResult');
  if (!noRow) {
    noRow = document.createElement('tr');
    noRow.id = 'adminLevelsNoResult';
    noRow.innerHTML = `<td colspan="4" class="admin-search-empty">
      <i class="fas fa-search"></i> Sin resultados
    </td>`;
    document.getElementById('adminLevelsBody')?.appendChild(noRow);
  }
  noRow.style.display = (ql && found === 0) ? '' : 'none';
}

function openAdminLevelModal(id, name, pos, youtubeUrl, gdId, legacy, twoPlayer) {
  const modal = document.getElementById('levelFormModal');
  if (!modal) return;
  document.getElementById('levelFormTitle').textContent = id ? 'Editar Nivel' : 'Agregar Nivel';
  document.getElementById('levelFormId').value          = id          || '';
  document.getElementById('levelFormName').value        = name        || '';
  document.getElementById('levelFormPos').value         = pos         || '';
  document.getElementById('levelFormYoutube').value     = youtubeUrl  || '';
  document.getElementById('levelFormGdId').value        = gdId        || '';
  document.getElementById('levelFormLegacy').checked    = !!legacy;
  document.getElementById('levelFormTwoPlayer').checked = !!twoPlayer;
  modal.classList.add('open');
}

function closeLevelModal() {
  document.getElementById('levelFormModal')?.classList.remove('open');
}

async function saveLevelForm() {
  const id         = document.getElementById('levelFormId')?.value;
  const name       = document.getElementById('levelFormName')?.value.trim();
  const position   = parseInt(document.getElementById('levelFormPos')?.value);
  const youtubeUrl = document.getElementById('levelFormYoutube')?.value.trim() || null;
  const gdId       = document.getElementById('levelFormGdId')?.value.trim() || null;
  const legacy     = document.getElementById('levelFormLegacy')?.checked ? 1 : 0;
  const twoPlayer  = document.getElementById('levelFormTwoPlayer')?.checked ? 1 : 0;

  if (!name)     return showToast('El nombre es requerido', 'error');
  if (!position) return showToast('La posición es requerida', 'error');

  try {
    if (id) {
      await adminUpdateLevel(id, { name, position, youtube_url: youtubeUrl, gd_id: gdId, legacy, two_player: twoPlayer });
    } else {
      await adminAddLevel({ name, position, youtube_url: youtubeUrl, gd_id: gdId, legacy, two_player: twoPlayer });
    }
    closeLevelModal();
    showToast('Nivel guardado ✓', 'success');
    invalidateAdminLevelsCache();
    loadAdminLevels();
    refreshPublicData();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function deleteLevel(id) {
  const ok = await uiConfirm({
    title: '¿Eliminar este nivel?',
    message: 'Se eliminarán todos sus victors también. Esta acción no se puede deshacer.',
    type: 'warning',
    confirmText: 'Eliminar',
    cancelText: 'Cancelar'
  });
  if (!ok) return;
  try {
    await adminDeleteLevel(id);
    showToast('Nivel eliminado', 'success');
    invalidateAdminLevelsCache();
    loadAdminLevels();
    refreshPublicData();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// =============================================
// VICTORS
// =============================================
let _victorOutsideClickHandler = null;

async function loadAdminVictors() {
  const container = document.getElementById('admin-victors-table');
  if (!container) return;

  const levels = getLevelsData();
  container.innerHTML = `
    <div class="admin-toolbar" style="margin-bottom:1rem;gap:.6rem;flex-wrap:wrap">
      <!-- Dropdown original -->
      <select id="victorLevelSelect"
        style="padding:.55rem .9rem;background:var(--bg3);border:1px solid var(--border-s);border-radius:var(--r-sm);color:var(--text);outline:none;min-width:200px;flex:1"
        onchange="onVictorLevelChange(this.value)">
        <option value="">— Todos los niveles —</option>
        ${levels.map(l => `<option value="${l.id}">${l.position}. ${esc(l.name)}</option>`).join('')}
      </select>

      <!-- Buscador con autocomplete -->
      <div class="adm-search-wrap" id="victorLevelSearchWrap" style="position:relative;flex:2;min-width:200px">
        <i class="fas fa-search adm-search-icon"></i>
        <input type="text" id="victorLevelSearch" class="adm-search-input"
          placeholder="Buscar nivel… (vacío = todos)" autocomplete="off">
        <button type="button" class="adm-search-clear" id="victorLevelClear" style="display:none">
          <i class="fas fa-times-circle"></i>
        </button>
        <div class="adm-level-suggestions" id="victorLevelSuggestions"></div>
      </div>

      <button class="btn-admin-add" onclick="openVictorModal()">
        <i class="fas fa-plus"></i> Agregar Victor
      </button>
    </div>
    <div id="adminVictorsTableInner"></div>`;

  // Lógica del buscador
  const searchInput = document.getElementById('victorLevelSearch');
  const clearBtn    = document.getElementById('victorLevelClear');
  const sugg        = document.getElementById('victorLevelSuggestions');
  const dropdown    = document.getElementById('victorLevelSelect');

  let debounce;
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    clearBtn.style.display = q ? '' : 'none';
    clearTimeout(debounce);
    // Siempre usar getLevelsData() fresco en cada búsqueda
    debounce = setTimeout(() => renderVictorLevelSuggestions(q, getLevelsData(), sugg, searchInput, clearBtn, dropdown), 120);
  });

  searchInput.addEventListener('focus', () => {
    const q = searchInput.value.trim();
    if (q.length >= 1) renderVictorLevelSuggestions(q, getLevelsData(), sugg, searchInput, clearBtn, dropdown);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    sugg.classList.remove('open');
    sugg.innerHTML = '';
    dropdown.value = '';
    adminVictorLevelId = null;
    loadAllAdminVictors();
  });

  // Cerrar sugerencias al hacer click fuera (se limpia el listener anterior para no acumular)
  if (_victorOutsideClickHandler) {
    document.removeEventListener('click', _victorOutsideClickHandler);
  }
  _victorOutsideClickHandler = e => {
    if (!e.target.closest('#victorLevelSearchWrap')) {
      sugg.classList.remove('open');
    }
  };
  document.addEventListener('click', _victorOutsideClickHandler);

  // Vista por defecto: todos los victors de todos los niveles, con loading
  adminVictorLevelId = null;
  loadAllAdminVictors();
}

async function loadAllAdminVictors() {
  const container = document.getElementById('adminVictorsTableInner');
  if (!container) return;
  container.innerHTML = adminLoading();

  try {
    const data    = await adminGetVictors(); // sin level_id → trae todos
    const victors = data.victors || [];
    renderVictorsTable(victors, { showLevel: true });
  } catch (e) {
    container.innerHTML = adminError('Error: ' + e.message);
  }
}

function renderVictorLevelSuggestions(q, levels, sugg, input, clearBtn, dropdown) {
  if (!q) { sugg.classList.remove('open'); sugg.innerHTML = ''; return; }
  const ql   = q.toLowerCase();
  const hits = levels.filter(l => l.name?.toLowerCase().includes(ql)).slice(0, 8);

  if (!hits.length) {
    sugg.innerHTML = `<div class="adm-sug-empty"><i class="fas fa-search"></i> Sin resultados</div>`;
    sugg.classList.add('open');
    return;
  }

  sugg.innerHTML = hits.map(l => {
    const aredlBadge = l.aredl_position ? `<span class="adm-sug-aredl">AREDL #${l.aredl_position}</span>` : '';
    const victCount  = (l.victors || []).length;
    return `<div class="adm-sug-item" data-id="${l.id}" data-name="${esc(l.name)}">
      <div class="adm-sug-main">
        <span class="adm-sug-pos">#${l.position}</span>
        <span class="adm-sug-name">${esc(l.name)}</span>
      </div>
      <div class="adm-sug-meta">
        ${aredlBadge}
        <span class="adm-sug-vic"><i class="fas fa-trophy"></i> ${victCount} victor${victCount !== 1 ? 's' : ''}</span>
      </div>
    </div>`;
  }).join('');

  sugg.classList.add('open');

  sugg.querySelectorAll('.adm-sug-item').forEach(item => {
    item.addEventListener('click', () => {
      const id   = item.dataset.id;
      const name = item.dataset.name;
      input.value = name;
      clearBtn.style.display = '';
      sugg.classList.remove('open');
      sugg.innerHTML = '';
      // Sincronizar dropdown
      if (dropdown) dropdown.value = id;
      onVictorLevelChange(id);
    });
  });
}

function onVictorLevelChange(val) {
  adminVictorLevelId = val || null;
  if (!val) { loadAllAdminVictors(); return; }
  loadVictorsForLevel(val);
}

async function loadVictorsForLevel(levelId) {
  const container = document.getElementById('adminVictorsTableInner');
  if (!container) return;
  container.innerHTML = adminLoading();

  try {
    const data    = await adminGetVictors(levelId);
    const victors = data.victors || [];
    renderVictorsTable(victors);
  } catch (e) {
    container.innerHTML = adminError('Error: ' + e.message);
  }
}

function renderVictorsTable(victors, opts = {}) {
  const container = document.getElementById('adminVictorsTableInner');
  if (!container) return;

  const showLevel = !!opts.showLevel;

  if (!victors.length) {
    container.innerHTML = `<div class="admin-empty"><i class="fas fa-trophy"></i>Sin victors${showLevel ? '' : ' en este nivel'}</div>`;
    return;
  }

  container.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>${showLevel ? '<th>Nivel</th>' : ''}<th>Jugador</th><th>Video</th><th>Acciones</th></tr></thead>
        <tbody id="adminVictorsBody"></tbody>
      </table>
    </div>`;

  const tbody = document.getElementById('adminVictorsBody');
  victors.forEach(v => {
    const name        = v.player_name || '';
    const ownVideoUrl = v.video_url   || ''; // SOLO el propio del victor — esto es lo que se edita
    const effectiveUrl = v.effective_video_url || ownVideoUrl || '';
    const isShowcase  = !!v.is_showcase_fallback;

    const videoCell = effectiveUrl
      ? `<a href="${esc(effectiveUrl)}" target="_blank" style="color:var(--red);font-size:.8rem">
           <i class="fab fa-youtube"></i> Ver
         </a>${isShowcase
            ? `<span class="text-dim" title="Heredado del Video de Showcase del nivel — este victor no tiene video propio cargado" style="font-size:.68rem;margin-left:.4rem;cursor:help"><i class="fas fa-circle-info"></i> showcase</span>`
            : ''}`
      : '<span class="text-dim">Sin video</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      ${showLevel ? `<td class="text-dim" style="font-size:.82rem">${esc(v.level_name || '—')}</td>` : ''}
      <td class="td-name">${esc(name)}</td>
      <td>${videoCell}</td>
      <td>
        <button class="btn-icon btn-edit"
          onclick="openVictorModal(${v.id},'${esc(name)}','${esc(effectiveUrl)}')">
          <i class="fas fa-pen"></i>
        </button>
        <button class="btn-icon btn-delete" onclick="deleteVictor(${v.id})">
          <i class="fas fa-trash"></i>
        </button>
      </td>`;
    tbody.appendChild(tr);
  });
}

function openVictorModal(id='', name='', videoUrl='') {
  const modal = document.getElementById('victorFormModal');
  if (!modal) return;
  document.getElementById('victorFormTitle').textContent = id ? 'Editar Victor' : 'Agregar Victor';
  document.getElementById('victorFormId').value          = id;
  document.getElementById('victorFormName').value        = name;
  document.getElementById('victorFormVideo').value       = videoUrl;
  modal.classList.add('open');
}

function closeVictorModal() {
  document.getElementById('victorFormModal')?.classList.remove('open');
}

async function saveVictorForm() {
  const id         = document.getElementById('victorFormId')?.value;
  const player_name = document.getElementById('victorFormName')?.value.trim();
  const video_url   = document.getElementById('victorFormVideo')?.value.trim() || null;

  if (!player_name) return showToast('El nombre es requerido', 'error');
  if (!id && !adminVictorLevelId) return showToast('Seleccioná un nivel primero', 'error');

  try {
    if (id) {
      await adminUpdateVictor(id, { player_name, video_url });
    } else {
      await adminAddVictor({ level_id: adminVictorLevelId, player_name, video_url });
    }
    closeVictorModal();
    showToast('Victor guardado ✓', 'success');
    if (adminVictorLevelId) loadVictorsForLevel(adminVictorLevelId);
refreshPublicData();
    
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function deleteVictor(id) {
  const ok = await uiConfirm({
    title: '¿Eliminar este victor?',
    message: 'Si el nivel se queda sin victors, se eliminará automáticamente.',
    type: 'warning',
    confirmText: 'Eliminar',
    cancelText: 'Cancelar'
  });
  if (!ok) return;
  try {
    const result = await adminDeleteVictor(id);
    showToast('Victor eliminado', 'success');
    if (result?.levelDeleted) {
      showToast('El nivel se quedó sin victors y fue eliminado', 'info');
    }
    if (adminVictorLevelId) {
      loadVictorsForLevel(adminVictorLevelId);
    } else if (adminCurrentTab === 'victors') {
      loadAllAdminVictors();
    }
    if (adminCurrentTab === 'levels') loadAdminLevels();
    refreshPublicData();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// =============================================
// PLAYERS — stats fully computed from victors, no manual points/completions
// =============================================
async function loadAdminPlayers() {
  const container = document.getElementById('admin-players-table');
  if (!container) return;
  container.innerHTML = adminLoading();

  try {
    const data = await adminGetPlayers();
    renderAdminPlayers(data.players || []);
  } catch (e) {
    container.innerHTML = adminError('Error: ' + e.message);
  }
}

function renderAdminPlayers(players) {
  const container = document.getElementById('admin-players-table');
  if (!container) return;

  if (!players.length) {
    container.innerHTML = `<div class="admin-empty"><i class="fas fa-users"></i>No hay jugadores</div>`;
    return;
  }

  // Guardar lista completa para el filtro
  window._adminAllPlayers = players;

  container.innerHTML = `
    <div class="admin-toolbar" style="margin-bottom:.9rem">
      <div class="search-box enhanced-search" id="adminPlayerSearchWrap" style="flex:1">
        <i class="fas fa-search search-icon-left"></i>
        <input type="text" id="adminPlayerSearchInput" class="adm-search-input"
          placeholder="Buscar jugador…" autocomplete="off">
        <button type="button" class="search-clear-btn" id="adminPlayerClear" style="display:none" title="Limpiar">
          <i class="fas fa-times-circle"></i>
        </button>
      </div>
      <span class="adm-player-count" id="adminPlayerCount">${players.length} jugadores</span>
    </div>
    <p class="text-dim" style="font-size:.78rem;margin-bottom:.85rem">
      <i class="fas fa-info-circle"></i> Puntos, completions y hardest level se calculan automáticamente desde los victors.
    </p>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Jugador</th><th>Puntos</th><th>Completions</th><th>Hardest</th><th>Acciones</th>
        </tr></thead>
        <tbody id="adminPlayersBody"></tbody>
      </table>
    </div>`;

  renderAdminPlayersFiltered('');
  setupAdminPlayerSearch();
}

function setupAdminPlayerSearch() {
  const input    = document.getElementById('adminPlayerSearchInput');
  const clearBtn = document.getElementById('adminPlayerClear');
  if (!input) return;

  let debounce;
  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearBtn.style.display = q ? '' : 'none';
    clearTimeout(debounce);
    debounce = setTimeout(() => renderAdminPlayersFiltered(q), 130);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    renderAdminPlayersFiltered('');
    input.focus();
  });
}

function renderAdminPlayersFiltered(q) {
  const tbody   = document.getElementById('adminPlayersBody');
  const countEl = document.getElementById('adminPlayerCount');
  if (!tbody) return;

  const players = window._adminAllPlayers || [];
  const ql      = q.trim().toLowerCase();
  const filtered = ql
    ? players.filter(p =>
        p.name?.toLowerCase().includes(ql) ||
        p.hardest_level?.toLowerCase().includes(ql))
    : players;

  if (countEl) countEl.textContent = `${filtered.length} jugador${filtered.length !== 1 ? 'es' : ''}`;

  tbody.innerHTML = '';

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="admin-search-empty">
      <i class="fas fa-search"></i> Sin resultados para "<strong>${esc(q)}</strong>"
    </td></tr>`;
    return;
  }

  filtered.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-name">${esc(p.name)}</td>
      <td class="font-mono text-violet">${(p.points||0).toLocaleString()}</td>
      <td>${p.completions||0}</td>
      <td class="text-sub">${esc(p.hardest_level||'—')}</td>
      <td>
        <button class="btn-icon btn-edit" title="Renombrar"
          onclick="openPlayerModal('${esc(p.name)}')">
          <i class="fas fa-pen"></i>
        </button>
        <button class="btn-icon btn-delete" title="Eliminar jugador (y sus victors)"
          onclick="deletePlayer('${esc(p.name)}')">
          <i class="fas fa-trash"></i>
        </button>
      </td>`;
    tbody.appendChild(tr);
  });
}

function openPlayerModal(name) {
  const modal = document.getElementById('playerFormModal');
  if (!modal) return;
  document.getElementById('playerFormOldName').value = name;
  document.getElementById('playerFormName').value     = name;
  modal.classList.add('open');
}

function closePlayerModal() {
  document.getElementById('playerFormModal')?.classList.remove('open');
}

async function savePlayerForm() {
  const oldName = document.getElementById('playerFormOldName')?.value;
  const newName = document.getElementById('playerFormName')?.value.trim();
  if (!newName) return showToast('El nombre es requerido', 'error');

  try {
    await adminRenamePlayer(oldName, newName);
    closePlayerModal();
    showToast('Jugador renombrado ✓', 'success');
    loadAdminPlayers();
    refreshPublicData();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function deletePlayer(name) {
  const ok = await uiConfirm({
    title: `¿Eliminar a "${name}"?`,
    message: 'Se eliminarán todos sus victors también. Esta acción no se puede deshacer.',
    type: 'warning',
    confirmText: 'Eliminar',
    cancelText: 'Cancelar'
  });
  if (!ok) return;
  try {
    await adminDeletePlayer(name);
    showToast('Jugador eliminado', 'success');
    loadAdminPlayers();
    refreshPublicData();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// =============================================
// PUNTOS POR NIVEL
// =============================================
async function loadAdminPoints() {
  const container = document.getElementById('admin-points-table');
  if (!container) return;
  container.innerHTML = adminLoading();

  try {
    const data = await adminGetLevels();
    renderAdminPoints(data.levels || []);
  } catch (e) {
    container.innerHTML = adminError('Error al cargar niveles: ' + e.message);
  }
}

function renderAdminPoints(levels) {
  const container = document.getElementById('admin-points-table');
  if (!container) return;

  window._adminPointsLevels = levels;

  container.innerHTML = `
    <div class="admin-toolbar" style="margin-bottom:.9rem">
      <div class="search-box enhanced-search" style="flex:1">
        <i class="fas fa-search search-icon-left"></i>
        <input type="text" id="adminPointsSearch" class="adm-search-input"
          placeholder="Buscar nivel…" autocomplete="off">
        <button type="button" class="search-clear-btn" id="adminPointsClear" style="display:none">
          <i class="fas fa-times-circle"></i>
        </button>
      </div>
      <span class="adm-player-count" id="adminPointsCount">${levels.length} niveles</span>
    </div>
    <p class="text-dim" style="font-size:.78rem;margin-bottom:.85rem">
      <i class="fas fa-info-circle"></i>
      Por defecto los puntos se calculan como <code>MAX(1, 1000 − (posición − 1) × 5)</code>.
      Podés sobreescribir manualmente el valor de cualquier nivel.
    </p>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>#</th><th>Nivel</th><th>Pts auto</th><th>Pts custom</th><th>Acción</th>
        </tr></thead>
        <tbody id="adminPointsBody"></tbody>
      </table>
    </div>`;

  renderAdminPointsFiltered('');

  const input    = document.getElementById('adminPointsSearch');
  const clearBtn = document.getElementById('adminPointsClear');
  let debounce;
  input?.addEventListener('input', () => {
    clearBtn.style.display = input.value ? '' : 'none';
    clearTimeout(debounce);
    debounce = setTimeout(() => renderAdminPointsFiltered(input.value), 130);
  });
  clearBtn?.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    renderAdminPointsFiltered('');
    input.focus();
  });
}

function renderAdminPointsFiltered(q) {
  const tbody   = document.getElementById('adminPointsBody');
  const countEl = document.getElementById('adminPointsCount');
  if (!tbody) return;

  const levels   = window._adminPointsLevels || [];
  const ql       = q.trim().toLowerCase();
  const filtered = ql ? levels.filter(l => l.name?.toLowerCase().includes(ql)) : levels;

  if (countEl) countEl.textContent = `${filtered.length} nivel${filtered.length !== 1 ? 'es' : ''}`;
  tbody.innerHTML = '';

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="admin-search-empty">
      <i class="fas fa-search"></i> Sin resultados
    </td></tr>`;
    return;
  }

  filtered.forEach(l => {
    const autoPoints   = typeof computeAutoPoints === 'function' ? computeAutoPoints(l.position) : 1;
    const customPoints = l.points != null ? l.points : '';
    const tr           = document.createElement('tr');
    tr.id = `pts-row-${l.id}`;
    tr.innerHTML = `
      <td class="font-mono text-dim">${l.position}</td>
      <td class="td-name">${esc(l.name)}</td>
      <td class="font-mono text-sub">${autoPoints.toLocaleString()}</td>
      <td>
        <input
          type="number" min="1" max="9999"
          class="adm-pts-input" id="pts-input-${l.id}"
          value="${esc(String(customPoints))}"
          placeholder="${autoPoints}"
          title="Vacío = usar fórmula automática">
      </td>
      <td>
        <button class="btn-icon btn-edit" title="Guardar"
          onclick="savePointsForLevel(${l.id}, ${l.position})">
          <i class="fas fa-save"></i>
        </button>
        ${customPoints !== ''
          ? `<button class="btn-icon btn-delete" title="Restablecer automático"
               onclick="resetPointsForLevel(${l.id}, ${l.position})">
               <i class="fas fa-undo"></i>
             </button>`
          : ''}
      </td>`;
    tbody.appendChild(tr);
  });
}

async function savePointsForLevel(id, position) {
  const input = document.getElementById(`pts-input-${id}`);
  const val   = input?.value.trim();
  const pts   = val === '' ? null : parseInt(val);
  if (pts !== null && (isNaN(pts) || pts < 1)) {
    return showToast('Valor inválido', 'error');
  }
  try {
    await adminUpdateLevel(id, { position, points: pts });
    showToast(pts === null ? 'Restaurado a automático ✓' : `Puntos actualizados: ${pts} ✓`, 'success');
    loadAdminPoints();
    refreshPublicData();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function resetPointsForLevel(id, position) {
  try {
    await adminUpdateLevel(id, { position, points: null });
    showToast('Restaurado a automático ✓', 'success');
    loadAdminPoints();
    refreshPublicData();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

window.savePointsForLevel  = savePointsForLevel;
window.resetPointsForLevel = resetPointsForLevel;

// =============================================
// SUBMISSIONS
// =============================================
async function loadAdminSubmissions() {
  const container = document.getElementById('admin-submissions-table');
  if (!container) return;
  container.innerHTML = adminLoading();

  try {
    const data = await adminGetSubmissions();
    renderAdminSubmissions(data.submissions || []);
  } catch (e) {
    container.innerHTML = adminError('Error al cargar submissions: ' + e.message);
  }
}

function renderAdminSubmissions(subs) {
  const container = document.getElementById('admin-submissions-table');
  if (!container) return;

  // Guardar lista completa para filtros
  window._adminAllSubs = subs;

  container.innerHTML = `
    <!-- Barra de filtros -->
    <div class="adm-subs-filters">
      <div class="adm-search-wrap" style="flex:2;min-width:160px">
        <i class="fas fa-user adm-search-icon"></i>
        <input type="text" id="subFilterPlayer" class="adm-search-input" placeholder="Filtrar por jugador…">
        <button type="button" class="adm-search-clear" id="subFilterPlayerClear" style="display:none">
          <i class="fas fa-times-circle"></i>
        </button>
        <div class="adm-level-suggestions" id="subFilterPlayerSugg"></div>
      </div>
      <div class="adm-search-wrap" style="flex:2;min-width:160px">
        <i class="fas fa-skull adm-search-icon"></i>
        <input type="text" id="subFilterLevel" class="adm-search-input" placeholder="Filtrar por nivel…">
        <button type="button" class="adm-search-clear" id="subFilterLevelClear" style="display:none">
          <i class="fas fa-times-circle"></i>
        </button>
      </div>
      <select id="subFilterStatus" class="adm-filter-select">
        <option value="">Todos los estados</option>
        <option value="pending">Pendiente</option>
        <option value="approved">Aprobado</option>
        <option value="rejected">Rechazado</option>
      </select>
      <button class="adm-filter-clear-all" onclick="clearSubFilters()">
        <i class="fas fa-times"></i> Limpiar
      </button>
      <button class="adm-filter-clear-all" style="background:rgba(220,50,50,.15);color:#ff6b6b;border-color:rgba(220,50,50,.3)" onclick="deleteAllSubmissions()">
        <i class="fas fa-trash"></i> Eliminar
      </button>
    </div>

    <div id="adminSubsList"></div>`;

  renderSubsFiltered();
  setupSubFilters(subs);
}

function setupSubFilters(subs) {
  const playerInput  = document.getElementById('subFilterPlayer');
  const playerClear  = document.getElementById('subFilterPlayerClear');
  const playerSugg   = document.getElementById('subFilterPlayerSugg');
  const levelInput   = document.getElementById('subFilterLevel');
  const levelClear   = document.getElementById('subFilterLevelClear');
  const statusSelect = document.getElementById('subFilterStatus');

  // Sugerencias de jugadores
  const players = [...new Set(subs.map(s => s.username || s.player_name).filter(Boolean))];
  let debP;
  playerInput?.addEventListener('input', () => {
    playerClear.style.display = playerInput.value ? '' : 'none';
    clearTimeout(debP);
    debP = setTimeout(() => {
      const q    = playerInput.value.trim().toLowerCase();
      const hits = q ? players.filter(p => p.toLowerCase().includes(q)).slice(0, 6) : [];
      if (!hits.length) { playerSugg.classList.remove('open'); playerSugg.innerHTML = ''; }
      else {
        playerSugg.innerHTML = hits.map(p =>
          `<div class="adm-sug-item adm-sug-player" data-val="${esc(p)}">
            <i class="fas fa-user" style="color:var(--violet);margin-right:.4rem"></i>${esc(p)}
          </div>`).join('');
        playerSugg.classList.add('open');
        playerSugg.querySelectorAll('.adm-sug-player').forEach(el => {
          el.addEventListener('click', () => {
            playerInput.value = el.dataset.val;
            playerClear.style.display = '';
            playerSugg.classList.remove('open');
            renderSubsFiltered();
          });
        });
      }
    }, 100);
    renderSubsFiltered();
  });
  playerClear?.addEventListener('click', () => {
    playerInput.value = '';
    playerClear.style.display = 'none';
    playerSugg.classList.remove('open');
    renderSubsFiltered();
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#subFilterPlayer') && !e.target.closest('#subFilterPlayerSugg')) {
      playerSugg?.classList.remove('open');
    }
  });

  levelInput?.addEventListener('input', () => {
    levelClear.style.display = levelInput.value ? '' : 'none';
    renderSubsFiltered();
  });
  levelClear?.addEventListener('click', () => {
    levelInput.value = '';
    levelClear.style.display = 'none';
    renderSubsFiltered();
  });
  statusSelect?.addEventListener('change', renderSubsFiltered);
}

function renderSubsFiltered() {
  const list   = document.getElementById('adminSubsList');
  if (!list) return;
  const subs   = window._adminAllSubs || [];
  const pQ     = (document.getElementById('subFilterPlayer')?.value || '').trim().toLowerCase();
  const lQ     = (document.getElementById('subFilterLevel')?.value  || '').trim().toLowerCase();
  const status = document.getElementById('subFilterStatus')?.value || '';

  const filtered = subs.filter(s => {
    const name = (s.username || s.player_name || '').toLowerCase();
    const lev  = (s.level_name || '').toLowerCase();
    if (pQ && !name.includes(pQ))   return false;
    if (lQ && !lev.includes(lQ))    return false;
    if (status && s.status !== status) return false;
    return true;
  });

  if (!filtered.length) {
    list.innerHTML = `<div class="admin-empty"><i class="fas fa-inbox"></i>Sin resultados</div>`;
    return;
  }

  list.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Jugador</th><th>Nivel</th><th>Video</th><th>Raw</th><th>Estado</th><th>Acciones</th>
        </tr></thead>
        <tbody id="adminSubsBody"></tbody>
      </table>
    </div>`;

  const tbody = document.getElementById('adminSubsBody');
  filtered.forEach(sub => {
    const status   = sub.status || 'pending';
    const videoUrl = sub.youtube_url || sub.youtube_link || '';
    const rawUrl   = sub.raw_url || '';
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.title = 'Click para ver detalles';
    tr.addEventListener('click', e => {
      if (e.target.closest('button') || e.target.closest('a')) return;
      openSubDetailModal(sub);
    });
    tr.innerHTML = `
      <td class="td-name">${esc(sub.username || sub.player_name)}</td>
      <td>${esc(sub.level_name)}</td>
      <td>${videoUrl
        ? `<a href="${esc(videoUrl)}" target="_blank" style="color:var(--red);font-size:.8rem"><i class="fab fa-youtube"></i> Ver</a>`
        : '—'}</td>
      <td>${rawUrl
        ? `<a href="${esc(rawUrl)}" target="_blank" style="color:var(--violet);font-size:.8rem"><i class="fas fa-film"></i> Raw</a>`
        : '<span class="text-dim">—</span>'}</td>
      <td><span class="status-badge status-${status}">${status}</span></td>
      <td style="white-space:nowrap">
        ${status === 'pending' ? (
          sub.submitted_by === window.currentUser?.id ? `
          <span class="text-dim" style="font-size:.72rem;font-style:italic" title="No podés revisar tu propia submission">
            <i class="fas fa-lock"></i> Tuya
          </span>` : `
          <button class="btn-icon" style="color:var(--success)" title="Aprobar"
            onclick="approveSubmission(${sub.id})"><i class="fas fa-check"></i></button>
          <button class="btn-icon" style="color:var(--warning)" title="Rechazar"
            onclick="rejectSubmission(${sub.id})"><i class="fas fa-times"></i></button>`
        ) : ''}
        <button class="btn-icon btn-delete" title="Eliminar"
          onclick="deleteSubmission(${sub.id})"><i class="fas fa-trash"></i></button>
      </td>`;
    tbody.appendChild(tr);
  });
}

function clearSubFilters() {
  const ids = ['subFilterPlayer','subFilterLevel'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const status = document.getElementById('subFilterStatus');
  if (status) status.value = '';
  ['subFilterPlayerClear','subFilterLevelClear'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  renderSubsFiltered();
}
window.clearSubFilters = clearSubFilters;


// ─── SUBMISSION DETAIL POPUP ───
function openSubDetailModal(sub) {
  const modal = document.getElementById('subDetailModal');
  if (!modal) return;

  // Iniciales del jugador
  const name = sub.username || sub.player_name || '?';
  document.getElementById('subDetailAvatar').textContent = name.slice(0,2).toUpperCase();
  document.getElementById('subDetailPlayer').textContent = name;

  // Fecha
  const d = sub.created_at ? new Date(sub.created_at) : null;
  document.getElementById('subDetailDate').textContent = d
    ? d.toLocaleString('es-UY', { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  // Estado
  const statusEl = document.getElementById('subDetailStatus');
  const sm = { pending:['Pendiente','status-pending'], approved:['Aprobado','status-approved'], rejected:['Rechazado','status-rejected'] };
  const [sl, sc] = sm[sub.status] || ['—',''];
  statusEl.textContent = sl;
  statusEl.className = 'status-badge ' + sc;

  // Cuerpo
  const ytUrl  = sub.youtube_url || sub.youtube_link || '';
  const rawUrl = sub.raw_url || '';
  const ytId   = ytUrl.match(/(?:v=|youtu\.be\/)([^&\s]{11})/)?.[1] || null;

  document.getElementById('subDetailBody').innerHTML = `
    <div class="sub-detail-row">
      <div class="sub-detail-label"><i class="fas fa-skull" style="color:var(--red);margin-right:.35rem"></i>Nivel</div>
      <div class="sub-detail-value" style="font-size:1.05rem;font-weight:700">${esc(sub.level_name || '—')}</div>
    </div>

    ${ytUrl ? `
    <div class="sub-detail-row">
      <div class="sub-detail-label"><i class="fab fa-youtube" style="color:#ff4444;margin-right:.35rem"></i>Video YouTube</div>
      ${ytId ? `<img class="sub-detail-thumb" src="https://img.youtube.com/vi/${ytId}/mqdefault.jpg" alt="">` : ''}
      <a href="${esc(ytUrl)}" target="_blank" class="sub-detail-video-link">
        <i class="fab fa-youtube" style="color:#ff4444"></i> Ver video
      </a>
    </div>` : ''}

    ${rawUrl ? `
    <div class="sub-detail-row">
      <div class="sub-detail-label"><i class="fas fa-film" style="color:var(--violet);margin-right:.35rem"></i>Raw Footage</div>
      <a href="${esc(rawUrl)}" target="_blank" class="sub-detail-video-link">
        <i class="fas fa-film" style="color:var(--violet)"></i> Ver raw
      </a>
    </div>` : ''}

    ${sub.notes?.trim() ? `
    <div class="sub-detail-row">
      <div class="sub-detail-label"><i class="fas fa-comment-alt" style="margin-right:.35rem"></i>Notas del jugador</div>
      <div class="sub-detail-value" style="white-space:pre-wrap;line-height:1.6;color:var(--text-sub)">${esc(sub.notes.trim())}</div>
    </div>` : ''}

    ${sub.status === 'approved' ? `
    <div class="sub-detail-row" style="border-left:3px solid #22c55e;padding-left:.75rem;margin-top:.25rem">
      <div class="sub-detail-label"><i class="fas fa-comment-dots" style="color:#22c55e;margin-right:.35rem"></i>Nota del staff</div>
      <div class="sub-detail-value" style="white-space:pre-wrap;line-height:1.6;color:#86efac">
        ${sub.approval_note?.trim() ? esc(sub.approval_note.trim()) : '<span style="opacity:.5;font-style:italic">Sin nota</span>'}
      </div>
    </div>` : ''}

    ${sub.status === 'rejected' ? `
    <div class="sub-detail-row" style="border-left:3px solid var(--red);padding-left:.75rem;margin-top:.25rem">
      <div class="sub-detail-label"><i class="fas fa-times-circle" style="color:var(--red);margin-right:.35rem"></i>Razón del rechazo</div>
      <div class="sub-detail-value" style="white-space:pre-wrap;line-height:1.6;color:#fca5a5">
        ${sub.rejection_reason?.trim() ? esc(sub.rejection_reason.trim()) : '<span style="opacity:.5;font-style:italic">Sin razón registrada</span>'}
      </div>
    </div>` : ''}
  `;

  // Acciones
  const isOwnSubmission = sub.submitted_by === window.currentUser?.id;
  document.getElementById('subDetailActions').innerHTML = sub.status === 'pending' ? (
    isOwnSubmission ? `
    <div class="admin-notice" style="width:100%;display:flex;align-items:center;gap:.5rem;font-size:.82rem">
      <i class="fas fa-lock"></i> No podés aprobar ni rechazar tu propia submission — otro miembro del staff debe revisarla.
    </div>
    <button class="btn-icon btn-delete" title="Eliminar" style="width:auto;padding:.6rem .85rem"
      onclick="closeSubDetailModal();deleteSubmission(${sub.id})">
      <i class="fas fa-trash"></i>
    </button>` : `
    <button class="btn-approve" onclick="closeSubDetailModal();approveSubmission(${sub.id})">
      <i class="fas fa-check"></i> Aprobar
    </button>
    <button class="btn-reject" onclick="closeSubDetailModal();rejectSubmission(${sub.id})">
      <i class="fas fa-times"></i> Rechazar
    </button>
    <button class="btn-icon btn-delete" title="Eliminar" style="width:auto;padding:.6rem .85rem"
      onclick="closeSubDetailModal();deleteSubmission(${sub.id})">
      <i class="fas fa-trash"></i>
    </button>`
  ) : `
    <button class="btn-icon btn-delete" title="Eliminar" style="width:auto;flex:1;padding:.65rem;border-radius:var(--r-sm);font-size:.85rem;font-weight:700;display:flex;align-items:center;justify-content:center;gap:.4rem"
      onclick="closeSubDetailModal();deleteSubmission(${sub.id})">
      <i class="fas fa-trash"></i> Eliminar submission
    </button>`;

  modal.classList.add('open');
}

function closeSubDetailModal() {
  document.getElementById('subDetailModal')?.classList.remove('open');
}
window.openSubDetailModal  = openSubDetailModal;
window.closeSubDetailModal = closeSubDetailModal;

async function approveSubmission(id) {
  const note = await uiPrompt({
    title: 'Aprobar submission',
    message: 'Podés dejar una nota opcional para el jugador (ej: "¡Buen trabajo!"). Si no querés dejar nada, presioná Aprobar directamente.',
    placeholder: 'Nota opcional...',
    confirmText: 'Aprobar',
    cancelText: 'Cancelar',
    allowEmpty: true,
  });
  if (note === null) return; // canceló con el botón cancelar o clic afuera

  console.log('[admin] Aprobando submission', id);

  // 1) Cerrar modal y actualizar la tabla SIEMPRE primero, así el usuario ve feedback inmediato
  closeSubDetailModal();
  _updateSubmissionStatusInTable(id, 'approved', { approval_note: note || null });

  try {
    const result = await adminApproveSubmission(id, note || null);
    console.log('[admin] Submission aprobada, resultado:', result);
    showToast('Submission aprobada — sumada al perfil del jugador', 'success');
  } catch (e) {
    console.error('[admin] Error aprobando submission:', e);
    showToast('Error al aprobar: ' + e.message, 'error');
    // Revertir el estado visual si falló de verdad
    loadAdminSubmissions();
    return;
  }

  // 2) Refrescar datos públicos SIEMPRE, en un try aparte para que un fallo acá
  //    no se confunda con un fallo en la aprobación misma
  try {
    await refreshPublicData();
  } catch (e) {
    console.error('[admin] Error refrescando datos públicos tras aprobar:', e);
    showToast('Aprobada, pero no se pudo refrescar la lista automáticamente', 'warning');
  }
}

async function rejectSubmission(id) {
  const reason = await uiPrompt({
    title: 'Razón de rechazo',
    message: 'Podés indicar opcionalmente por qué se rechaza esta submission. El jugador será notificado igual.',
    placeholder: 'Ej: El video no muestra el completion completo...',
    confirmText: 'Rechazar',
    cancelText: 'Cancelar',
  });
  if (reason === null) return; // canceló con el botón cancelar

  console.log('[admin] Rechazando submission', id);

  closeSubDetailModal();
  _updateSubmissionStatusInTable(id, 'rejected', { rejection_reason: reason || null });

  try {
    await adminRejectSubmission(id, reason || null);
    showToast('Submission rechazada', 'info');
  } catch (e) {
    console.error('[admin] Error rechazando submission:', e);
    showToast('Error al rechazar: ' + e.message, 'error');
    loadAdminSubmissions();
    return;
  }

  try {
    await refreshPublicData();
  } catch (e) {
    console.error('[admin] Error refrescando datos públicos tras rechazar:', e);
  }
}
async function deleteSubmission(id) {
  const ok = await uiConfirm({
    title: '¿Eliminar esta submission?',
    message: 'Esta acción no se puede deshacer.',
    type: 'warning',
    confirmText: 'Eliminar',
    cancelText: 'Cancelar'
  });
  if (!ok) return;
  try {
    await adminDeleteSubmission(id);
    showToast('Submission eliminada', 'success');
    closeSubDetailModal();
    // Quitar la fila de la tabla sin recargar todo
    _removeSubmissionFromTable(id);
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function deleteAllSubmissions() {
  const ok = await uiConfirm({
    title: '¿Eliminar submissions?',
    message: '¿Qué submissions querés eliminar?',
    type: 'warning',
    confirmText: 'Todas',
    cancelText: 'Cancelar',
    extraButtons: [
      { text: 'Solo aprobadas',  value: 'approved' },
      { text: 'Solo rechazadas', value: 'rejected' },
    ],
  });
  if (!ok) return;
  const filter = ok === true ? 'all' : ok;
  try {
    const result = await adminDeleteAllSubmissions(filter);
    showToast(`${result.deleted} submission${result.deleted !== 1 ? 's' : ''} eliminada${result.deleted !== 1 ? 's' : ''} ✓`, 'success');
    loadAdminSubmissions();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// Actualiza el estado de una submission en la tabla sin recargar todo
function _updateSubmissionStatusInTable(id, newStatus, extra = {}) {
  const subs = window._adminAllSubs || [];
  const sub  = subs.find(s => s.id === id);
  if (sub) {
    sub.status = newStatus;
    if (extra.approval_note   !== undefined) sub.approval_note   = extra.approval_note;
    if (extra.rejection_reason !== undefined) sub.rejection_reason = extra.rejection_reason;
  }
  renderSubsFiltered();
}

// Quita una submission de la lista local y re-renderiza
function _removeSubmissionFromTable(id) {
  window._adminAllSubs = (window._adminAllSubs || []).filter(s => s.id !== id);
  renderSubsFiltered();
}

// Clear del buscador de niveles en admin
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('adminLevelClear')?.addEventListener('click', () => {
    const input = document.getElementById('adminLevelSearchInput');
    if (input) { input.value = ''; input.focus(); }
    document.getElementById('adminLevelClear').style.display = 'none';
    filterAdminLevels('');
  });
});

// =============================================
// SYNC POSICIONES CON AREDL
// =============================================
async function syncPositionsWithAredl() {
  const btn = document.getElementById('syncPositionsBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando…';
  }
  try {
    const data = await adminSyncPositions();
    showToast(`✓ ${data.message} (${data.total} niveles)`, 'success');
    loadAdminLevels();
    if (typeof refreshPublicData === 'function') refreshPublicData();
  } catch (e) {
    showToast('Error al sincronizar: ' + e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizar ahora';
    }
  }
}

function loadAdminSyncTab() {
  const container = document.getElementById('admin-sync-table');
  if (!container) return;
  container.innerHTML = `
    <div class="sync-page">
      <div class="sync-hero">
        <div class="sync-hero-icon">
          <i class="fas fa-sync-alt"></i>
        </div>
        <div class="sync-hero-text">
          <h2>Sincronizar con AREDL</h2>
          <p>Reordena todos los niveles según su posición actual en la All Rated Extreme Demon List.</p>
        </div>
      </div>

      <div class="sync-cards">
        <div class="sync-info-card">
          <div class="sync-info-icon"><i class="fas fa-list-ol"></i></div>
          <div>
            <div class="sync-info-title">Reordenamiento automático</div>
            <div class="sync-info-desc">Los niveles se ordenan según su posición en AREDL. Los que no estén en AREDL van al final, ordenados alfabéticamente.</div>
          </div>
        </div>
        <div class="sync-info-card">
          <div class="sync-info-icon" style="color:#34d399;background:rgba(52,211,153,.12)"><i class="fas fa-shield-alt"></i></div>
          <div>
            <div class="sync-info-title">Operación segura</div>
            <div class="sync-info-desc">Solo se modifican las posiciones. Victors, videos y thumbnails no se tocan. Reversible manualmente desde el tab Niveles.</div>
          </div>
        </div>
        <div class="sync-info-card">
          <div class="sync-info-icon" style="color:#f59e0b;background:rgba(245,158,11,.12)"><i class="fas fa-globe"></i></div>
          <div>
            <div class="sync-info-title">Datos en tiempo real</div>
            <div class="sync-info-desc">Se consulta la AREDL en el momento de la sincronización para usar las posiciones más actualizadas.</div>
          </div>
        </div>
      </div>

      <div class="sync-action">
        <button class="btn-sync-main" id="syncPositionsBtn" onclick="syncPositionsWithAredl()">
          <i class="fas fa-sync-alt"></i>
          <span>Sincronizar ahora</span>
        </button>
        <p class="sync-action-hint"><i class="fas fa-clock"></i> El proceso puede tardar unos segundos</p>
      </div>
    </div>`;
}

// =============================================
// THUMBNAILS
// =============================================

function extractYTIdClient(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/);
  return m ? m[1] : null;
}

async function loadAdminThumbnails() {
  const container = document.getElementById('admin-thumbnails-table');
  if (!container) return;

  container.innerHTML = adminLoading();

  try {
    const data = await adminGetLevels();
    window._adminAllThumbLevels = data.levels || [];
    renderAdminThumbnailsFiltered('');
  }
  catch (e) {
    container.innerHTML = adminError(e.message);
  }
}

function filterAdminThumbnails(q) {
  const clearBtn = document.getElementById('adminThumbClear');
  if (clearBtn) clearBtn.style.display = q ? '' : 'none';
  renderAdminThumbnailsFiltered(q);
}

function renderAdminThumbnailsFiltered(q) {
  const container = document.getElementById('admin-thumbnails-table');
  if (!container) return;

  const levels  = window._adminAllThumbLevels || [];
  const ql      = q.trim().toLowerCase();
  const filtered = ql ? levels.filter(l => l.name?.toLowerCase().includes(ql)) : levels;

  if (!filtered.length) {
    container.innerHTML = `<div class="admin-empty"><i class="fas fa-image"></i>Sin resultados</div>`;
    return;
  }

  container.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Nivel</th>
            <th>Thumbnail actual</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(level => `
            <tr>
              <td class="td-name">${esc(level.name)}</td>
              <td>
                ${
                  level.thumbnail_youtube_id
                    ? `<img src="https://img.youtube.com/vi/${level.thumbnail_youtube_id}/mqdefault.jpg" style="width:120px;border-radius:8px">`
                    : '<span class="text-dim">Automática</span>'
                }
              </td>
              <td>
                <button class="btn-icon btn-edit" title="Editar thumbnail"
                  onclick="openThumbModal(${level.id},'${esc(level.name)}','${esc(level.thumbnail_url || '')}',${level.thumbnail_youtube_id ? 1 : 0})">
                  <i class="fas fa-pen"></i>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ─── Popup dedicado de thumbnail ───
function openThumbModal(levelId, levelName, currentUrl, hasCustom) {
  const modal = document.getElementById('thumbFormModal');
  if (!modal) return;

  document.getElementById('thumbFormTitle').textContent = `Thumbnail — ${levelName}`;
  document.getElementById('thumbFormLevelId').value = levelId;
  document.getElementById('thumbFormUrl').value = currentUrl || '';
  document.getElementById('thumbFormError').style.display = 'none';
  document.getElementById('thumbFormResetBtn').style.display = hasCustom ? '' : 'none';

  previewThumbModalInput(currentUrl || '');
  modal.classList.add('open');
  document.getElementById('thumbFormUrl').focus();
}

function closeThumbModal() {
  document.getElementById('thumbFormModal')?.classList.remove('open');
}

function previewThumbModalInput(url) {
  const errorEl = document.getElementById('thumbFormError');
  const wrap    = document.getElementById('thumbFormPreviewWrap');
  const empty   = document.getElementById('thumbFormPreviewEmpty');
  const img     = document.getElementById('thumbFormPreview');

  const trimmed = (url || '').trim();
  if (!trimmed) {
    errorEl.style.display = 'none';
    wrap.style.display = 'none';
    empty.style.display = '';
    return;
  }

  const ytId = extractYTIdClient(trimmed);
  if (!ytId) {
    errorEl.style.display = '';
    wrap.style.display = 'none';
    empty.style.display = 'none';
    return;
  }

  errorEl.style.display = 'none';
  empty.style.display = 'none';
  wrap.style.display = '';
  img.src = `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
}

async function saveLevelThumbnailFromModal() {
  const levelId = document.getElementById('thumbFormLevelId')?.value;
  const url     = document.getElementById('thumbFormUrl')?.value.trim();
  const errorEl = document.getElementById('thumbFormError');

  if (!url) return showToast('Pegá un link de YouTube', 'error');
  if (!extractYTIdClient(url)) {
    errorEl.style.display = '';
    return showToast('Link inválido: no es de YouTube', 'error');
  }

  try {
    await adminUpdateLevelThumbnail(levelId, url);
    showToast('Thumbnail actualizada ✓', 'success');
    closeThumbModal();
    loadAdminThumbnails();
    refreshPublicData();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function resetLevelThumbnailFromModal() {
  const levelId = document.getElementById('thumbFormLevelId')?.value;
  try {
    await adminUpdateLevelThumbnail(levelId, null);
    showToast('Thumbnail restaurada ✓', 'success');
    closeThumbModal();
    loadAdminThumbnails();
    refreshPublicData();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

window.openThumbModal       = openThumbModal;
window.closeThumbModal      = closeThumbModal;
window.previewThumbModalInput = previewThumbModalInput;
window.saveLevelThumbnailFromModal  = saveLevelThumbnailFromModal;
window.resetLevelThumbnailFromModal = resetLevelThumbnailFromModal;
window.filterAdminThumbnails = filterAdminThumbnails;

// ─── Globals ───
window.openAdminPanel      = openAdminPanel;
window.closeAdminPanel     = closeAdminPanel;
window.loadAdminTab        = loadAdminTab;
window.filterAdminLevels   = filterAdminLevels;
window.openAdminLevelModal = openAdminLevelModal;
window.closeLevelModal     = closeLevelModal;
window.saveLevelForm       = saveLevelForm;
window.deleteLevel         = deleteLevel;
window.onVictorLevelChange = onVictorLevelChange;
window.openVictorModal     = openVictorModal;
window.closeVictorModal    = closeVictorModal;
window.saveVictorForm      = saveVictorForm;
window.deleteVictor        = deleteVictor;
window.openPlayerModal     = openPlayerModal;
window.closePlayerModal    = closePlayerModal;
window.savePlayerForm      = savePlayerForm;
window.deletePlayer        = deletePlayer;
window.approveSubmission   = approveSubmission;
window.rejectSubmission    = rejectSubmission;
window.deleteSubmission    = deleteSubmission;
window.clearSubFilters         = clearSubFilters;
window.renderSubsFiltered      = renderSubsFiltered;
window.deleteAllSubmissions    = deleteAllSubmissions;
window.syncPositionsWithAredl  = syncPositionsWithAredl;

// ESC limpia filtros activos en submissions
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const pv = document.getElementById('subFilterPlayer')?.value;
  const lv = document.getElementById('subFilterLevel')?.value;
  const sv = document.getElementById('subFilterStatus')?.value;
  if (pv || lv || sv) { clearSubFilters(); e.stopPropagation(); }
});
