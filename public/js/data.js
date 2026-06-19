// =============================================
// DATA.JS — UY Demonlist v2
// =============================================

const API_BASE = window.location.origin + '/api';
const DISCORD_INVITE   = 'btnc2bjNTh';
const DISCORD_GUILD_ID = '1487918041722392708';

let levelsData  = [];
let playersData = [];
let aredlMap    = {};
let dataLoaded  = false;

// ─── Load from MySQL via API ───
async function loadData(force = false) {
  if (dataLoaded && !force) return;
  try {
    const bust = force ? `?bust=1` : '';
    const [lvlRes, plrRes] = await Promise.all([
      fetch(`${API_BASE}/levels${bust}`),
      fetch(`${API_BASE}/players${bust}`)
    ]);
    if (!lvlRes.ok || !plrRes.ok) throw new Error('API error');

    const lvlJson = await lvlRes.json();
    const plrJson = await plrRes.json();

    levelsData  = (lvlJson.levels || []).sort((a, b) => (a.position || 999) - (b.position || 999));
    playersData = plrJson.players || [];
    dataLoaded  = true;

    applyAredlToLevels();

    console.log(`✅ Loaded from DB: ${levelsData.length} niveles, ${playersData.length} jugadores`);
  } catch (e) {
    if (force) {
      console.error('⚠️ DB API refresh failed:', e.message);
      throw e;
    }
    console.warn('⚠️ DB API not available, falling back to levels.json:', e.message);
    await loadFromJSON();
  }
}

function normalizeForSearch(s) {
  return (s || '').replace(/[\uff01-\uff5e]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  ).replace(/\u3000/g, ' ').toLowerCase().trim();
}
window.normalizeForSearch = normalizeForSearch;

function applyAredlToLevels() {
  if (!Object.keys(aredlMap).length) return;
  levelsData.forEach(l => {
    const key     = l.name?.toLowerCase().trim();
    const keyNorm = normalizeForSearch(l.name);
    const match   = aredlMap[key] || aredlMap[keyNorm];
    if (match) {
      l.aredl_position = match.position;
      l.aredl_level_id = match.level_id;
      l.aredl_video_id = match.video_id || null;
    }
    l.gd_level_id = l.gd_id || l.aredl_level_id || null;
  });
}

// ─── Refresca datos públicos y re-pinta lista + leaderboard sin F5 ───
async function refreshPublicData(opts = {}) {
  dataLoaded = false;
  await loadData(true);
  await loadAredlMap();
  applyAredlToLevels();

  // Refrescar el widget del usuario (puntos/completions pueden haber cambiado)
  if (typeof checkSession === 'function' && typeof renderUserWidget === 'function') {
    const discordId = localStorage.getItem('uy_discord_id');
    if (discordId) {
      try {
        const res  = await fetch(`${API_BASE}/auth/session?uid=${discordId}&bust=1`);
        const data = await res.json();
        if (data.user) {
          window.currentUser = data.user;
          renderUserWidget(data.user);
        }
      } catch {}
    }
  }

  const searchInput = document.getElementById('searchInput');
  const searchQ = (searchInput?.value || '').trim().toLowerCase();
  const allLevels = getLevelsData();

  if (typeof renderLevels === 'function') {
    filteredLevels = searchQ
      ? allLevels.filter(l => l.name?.toLowerCase().includes(searchQ))
      : [...allLevels];
    paintCards(filteredLevels, false);
  }
  if (typeof renderLeaderboard === 'function') renderLeaderboard();
  if (typeof syncHeroStats === 'function') syncHeroStats();
  if (typeof refreshOpenLevelModal === 'function') refreshOpenLevelModal(opts.levelId);

  if (opts.scrollToLevelId) {
    setTimeout(() => {
      const card = document.querySelector(`.level-card[data-id="${opts.scrollToLevelId}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('lc-highlight-new');
        setTimeout(() => card.classList.remove('lc-highlight-new'), 2500);
      }
    }, 120);
  }
}
window.refreshPublicData = refreshPublicData;

// ─── Polling de cambios en tiempo real (todos los usuarios, no solo admin) ───
let _lastKnownChange = null;
const REALTIME_POLL_MS = 25000; // 25 segundos — suficiente para no spamear

async function pollForRealtimeChanges() {
  try {
    const res = await fetch(`${API_BASE}/heartbeat`, { cache: 'no-store' });
    if (!res.ok) return;
    const { lastChange } = await res.json();

    if (_lastKnownChange === null) {
      _lastKnownChange = lastChange; // primera vez: solo establece la marca, no refresca
      return;
    }

    if (lastChange !== _lastKnownChange) {
      _lastKnownChange = lastChange;
      await refreshPublicData();
      // No mostrar toast en auto-refresh silencioso — solo el admin que hizo el cambio ve el toast
    }
  } catch (e) {
    console.warn('Realtime poll falló:', e.message);
  }
}

function startRealtimePolling() {
  pollForRealtimeChanges();
  setInterval(pollForRealtimeChanges, REALTIME_POLL_MS);
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(startRealtimePolling, 1500);
});

async function loadFromJSON() {
  try {
    const res  = await fetch('data/levels.json');
    const json = await res.json();
    levelsData = (json.levels || []).map(l => ({
      ...l,
      victors: (l.victors || []).map(v => ({
        name:     v.name || v.player_name || '',
        videoUrl: v.videoUrl || v.video_url || l.youtubeUrl || null,
        videoId:  v.videoId  || v.video_id  || null
      }))
    }));
    playersData = json.players || [];
    dataLoaded  = true;
  } catch (e) {
    console.error('❌ Error loading data:', e);
  }
}

// ─── AREDL map (via our own proxy, avoids CORS) ───
async function loadAredlMap() {
  try {
    const res = await fetch(`${API_BASE}/aredl`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    (data.levels || []).forEach(e => {
      if (e.name) aredlMap[e.name.toLowerCase().trim()] = { position: e.position, level_id: e.level_id, video_id: e.video_id || null, originalName: e.name.trim() };
    });
    applyAredlToLevels();
    window.aredlMap = aredlMap;
    console.log(`✅ AREDL: ${Object.keys(aredlMap).length} niveles mapeados`);
  } catch (e) {
    console.warn('AREDL unavailable:', e.message);
  }
}

// ─── GDBrowser enrichment (best-effort, per-level on demand) ───
async function fetchGdBrowserInfo(levelName) {
  try {
    const res  = await fetch(`${API_BASE}/gdbrowser?name=${encodeURIComponent(levelName)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.found ? data : null;
  } catch { return null; }
}

async function fetchGdBrowserInfoById(gdLevelId) {
  try {
    const res  = await fetch(`${API_BASE}/gdbrowser?id=${encodeURIComponent(gdLevelId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.found ? data : null;
  } catch { return null; }
}

// ─── Getters ───
function getLevelsData()  { return levelsData; }
function getPlayersData() { return playersData; }
function getGlobalStats() {
  return {
    totalLevels:      levelsData.length,
    totalPlayers:     playersData.length,
    totalCompletions: levelsData.reduce((s, l) => s + (l.victors?.length || 0), 0)
  };
}

// ─── Discord: logo + community card ───
async function updateDiscordLogo() {
  try {
    const res  = await fetch(`https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`);
    const data = await res.json();
    if (data?.icon) {
      const iconUrl = `https://cdn.discordapp.com/icons/${DISCORD_GUILD_ID}/${data.icon}.png`;
      const logoImg  = document.getElementById('serverLogoImg');
      const logoFlag = document.getElementById('logoFlag');
      if (logoImg)  { logoImg.src = iconUrl; logoImg.style.display = 'block'; }
      if (logoFlag) logoFlag.style.display = 'none';
    }
  } catch {}
}

function addDiscordLinks() {
  const inviteUrl = `https://discord.gg/${DISCORD_INVITE}`;
  document.querySelectorAll('.footer-discord-link').forEach(l => { l.href = inviteUrl; });
}

async function loadDiscordWidget() {
  const card = document.getElementById('discordCard');
  if (!card) return;

  const inviteUrl = `https://discord.gg/${DISCORD_INVITE}`;
  let iconHash = null, guildName = 'GD Uruguay', onlineCount = null, totalCount = null;

  // 1) Try the invite API first — works even if the widget feature is disabled
  try {
    const invRes  = await fetch(`https://discord.com/api/v10/invites/${DISCORD_INVITE}?with_counts=true&with_expiration=false`);
    if (invRes.ok) {
      const inv = await invRes.json();
      if (inv.guild) {
        iconHash    = inv.guild.icon || null;
        guildName   = inv.guild.name || guildName;
        totalCount  = inv.approximate_member_count ?? null;
        onlineCount = inv.approximate_presence_count ?? null;
      }
    }
  } catch (e) { console.warn('Discord invite API failed:', e.message); }

  // 2) Try widget.json for a more accurate online count (optional enhancement)
  try {
    const res  = await fetch(`https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`);
    if (res.ok) {
      const data = await res.json();
      if (data?.presence_count != null) onlineCount = data.presence_count;
      if (data?.icon && !iconHash) iconHash = data.icon;
      if (data?.name) guildName = data.name;
    }
  } catch {}

  const iconUrl = iconHash ? `https://cdn.discordapp.com/icons/${DISCORD_GUILD_ID}/${iconHash}.png` : null;

  // Update navbar logo too
  if (iconUrl) {
    const logoImg  = document.getElementById('serverLogoImg');
    const logoFlag = document.getElementById('logoFlag');
    if (logoImg)  { logoImg.src = iconUrl; logoImg.style.display = 'block'; }
    if (logoFlag) logoFlag.style.display = 'none';
  }

  card.innerHTML = `
    <div class="dc-banner"><div class="dc-banner-overlay"></div></div>
    <div class="dc-header">
      <div class="dc-icon-wrap">
        ${iconUrl
          ? `<img src="${iconUrl}" alt="${esc(guildName)}">`
          : `<div class="dc-icon-placeholder">🇺🇾</div>`}
      </div>
      <div class="dc-name">${esc(guildName)}</div>
      <div class="dc-desc">Comunidad oficial de Geometry Dash Uruguay</div>
      <div class="dc-stats">
        ${onlineCount != null ? `
        <div class="dc-stat">
          <span class="dc-stat-dot online"></span>
          <span class="dc-stat-val">${onlineCount.toLocaleString()}</span>
          <span class="dc-stat-lbl">en línea</span>
        </div>` : ''}
        ${totalCount != null ? `
        <div class="dc-stat">
          <span class="dc-stat-dot total"></span>
          <span class="dc-stat-val">${totalCount.toLocaleString()}</span>
          <span class="dc-stat-lbl">miembros</span>
        </div>` : ''}
      </div>
      <a href="${inviteUrl}" target="_blank" rel="noopener" class="dc-join-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
        </svg>
        Unirse al servidor
      </a>
    </div>`;
}

// ─── Counter animation ───
function animateCounter(el, target, duration = 1400) {
  if (!el) return;
  const start = performance.now();
  function step(now) {
    const t    = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 4);
    el.textContent = Math.round(target * ease);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ─── Submit to API ───
async function submitToAPI(data) {
  const res = await fetch(`${API_BASE}/submissions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  return res.json();
}

// ─── Admin API helpers ───
async function adminFetch(path, opts = {}) {
  const discordId = localStorage.getItem('uy_discord_id');
  const res = await fetch(`${API_BASE}/admin${path}`, {
    headers: { 'Content-Type': 'application/json', 'x-discord-id': discordId || '' },
    ...opts
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

let _adminLevelsCache = null;
let _adminLevelsCacheTs = 0;
async function adminGetLevels({ force = false } = {}) {
  const now = Date.now();
  if (!force && _adminLevelsCache && (now - _adminLevelsCacheTs) < 30_000) {
    return _adminLevelsCache;
  }
  const data = await adminFetch('/levels');
  _adminLevelsCache = data;
  _adminLevelsCacheTs = now;
  return data;
}
function invalidateAdminLevelsCache() {
  _adminLevelsCache = null;
}
async function adminAddLevel(data)           { return adminFetch('/levels', { method: 'POST', body: JSON.stringify(data) }); }
async function adminUpdateLevel(id, data)    { return adminFetch(`/levels/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
async function adminDeleteLevel(id)          { return adminFetch(`/levels/${id}`, { method: 'DELETE' }); }

async function adminGetVictors(levelId)      { return adminFetch(levelId ? `/victors?level_id=${levelId}` : '/victors'); }
async function adminAddVictor(data)          { return adminFetch('/victors', { method: 'POST', body: JSON.stringify(data) }); }
async function adminUpdateVictor(id, data)   { return adminFetch(`/victors/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
async function adminDeleteVictor(id)         { return adminFetch(`/victors/${id}`, { method: 'DELETE' }); }

async function adminGetPlayers()             { return adminFetch('/players'); }
async function adminRenamePlayer(name, newName) { return adminFetch(`/players/by-name/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify({ newName }) }); }
async function adminDeletePlayer(name)       { return adminFetch(`/players/by-name/${encodeURIComponent(name)}`, { method: 'DELETE' }); }

async function adminGetSubmissions()                { return adminFetch('/submissions'); }
async function adminDeleteAllSubmissions(filter)    { return adminFetch(`/submissions?filter=${filter}`, { method: 'DELETE' }); }
async function adminUpdateSubmission(id, d)  { return adminFetch(`/submissions/${id}`, { method: 'PUT', body: JSON.stringify(d) }); }
async function adminDeleteSubmission(id)     { return adminFetch(`/submissions/${id}`, { method: 'DELETE' }); }
async function adminApproveSubmission(id)    { return adminUpdateSubmission(id, { status: 'approved' }); }
async function adminRejectSubmission(id)     { return adminUpdateSubmission(id, { status: 'rejected' }); }
async function adminSyncPositions()          { return adminFetch('/sync-positions', { method: 'POST' }); }
async function adminUpdateLevelThumbnail(id, url) {
  if (!url) return adminFetch(`/levels/${id}/thumbnail`, { method: 'DELETE' });
  return adminFetch(`/levels/${id}/thumbnail`, { method: 'PUT', body: JSON.stringify({ youtube_url: url }) });
}

async function ownerGetUsers()               { return adminFetch('/users'); }
async function ownerUpdateUser(id, data)     { return adminFetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Detección de plataforma de video (no todos los links son YouTube) ───
function detectVideoPlatform(url) {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return { platform: 'youtube', icon: 'fab fa-youtube', label: 'YouTube', color: '#ff0000' };
  if (u.includes('twitch.tv'))     return { platform: 'twitch',  icon: 'fab fa-twitch',  label: 'Twitch',   color: '#9146ff' };
  if (u.includes('medal.tv'))      return { platform: 'medal',   icon: 'fas fa-medal',   label: 'Medal.tv', color: '#f23158' };
  if (u.includes('streamable.com'))return { platform: 'streamable', icon: 'fas fa-play-circle', label: 'Streamable', color: '#1ca5e3' };
  if (u.includes('drive.google'))  return { platform: 'gdrive',  icon: 'fab fa-google-drive', label: 'Google Drive', color: '#4285f4' };
  if (u.includes('vimeo.com'))     return { platform: 'vimeo',   icon: 'fab fa-vimeo',   label: 'Vimeo',     color: '#1ab7ea' };
  return { platform: 'other', icon: 'fas fa-external-link-alt', label: 'Ver video', color: 'var(--violet)' };
}
window.detectVideoPlatform = detectVideoPlatform;

// ─── Copiar texto al portapapeles + toast ───
async function copyToClipboard(text, successMsg = 'Copiado ✓') {
  try {
    await navigator.clipboard.writeText(text);
    if (typeof showToast === 'function') showToast(successMsg, 'success');
  } catch {
    if (typeof showToast === 'function') showToast('No se pudo copiar', 'error');
  }
}
window.copyToClipboard = copyToClipboard;
