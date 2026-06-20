// =============================================
// ROULETTE.JS — UY Demonlist Extreme Demon Roulette
// Based on the demonlist, syncs with live API data
// =============================================

// ─── STATE ───
const RL = {
  levels:       [],
  pool:         [],
  session:      [],       // [{level, status, percentage, timestamp}]
  current:      null,
  sessionActive:false,
  totalGoal:    50,
  spinDuration: 1200,
  revealHidden: false,
  filterRange: [1, 1],
  filterAredlOnly: false,
  spinning:     false,
  surrendered:  false,
  confettiCtx:  null,
  confettiParticles: [],
  pctModalMode: 'complete', // 'complete' | 'fail'
};

const RL_STORAGE_KEY = 'uydl_roulette_session_v1';

// ─── INIT ───
document.addEventListener('DOMContentLoaded', async () => {
  buildEmbers();
  if (typeof loadDiscordWidget === 'function') loadDiscordWidget();
  if (typeof addDiscordLinks === 'function') addDiscordLinks();
  if (typeof loadFooterCredits === 'function') loadFooterCredits();
  await fetchLevels();
loadSession();
initControls();
initPctModal();
updatePoolStats();
renderHistory();
updateSessionStats();
checkActiveSession();
rebuildPool();

if (RL.current) {
  renderCurrentLevel(RL.current);

  const pendingExists = RL.session.some(
    s => s.level.id === RL.current.id && s.status === 'pending'
  );

  if (!pendingExists) {
  RL.session.unshift({
    level: RL.current,
    status: 'pending',
    percentage: null,
    timestamp: Date.now()
  });

  saveSession();
}

  updateButtons();
}
});

// ─── FETCH LEVELS from API (mismo endpoint que index.html) ───
async function fetchLevels() {
  const API = typeof API_BASE !== 'undefined' ? API_BASE : 'http://localhost:3001/api';
  try {
    const [lvlRes, aredlRes] = await Promise.allSettled([
      fetch(`${API}/levels`, { cache: 'no-store' }),
      fetch(`${API}/aredl`,  { cache: 'no-store' }),
    ]);

    if (lvlRes.status === 'fulfilled' && lvlRes.value.ok) {
      const d = await lvlRes.value.json();
      RL.levels = d.levels || [];
    }

    if (aredlRes.status === 'fulfilled' && aredlRes.value.ok) {
      const d = await aredlRes.value.json();
      const map = {};
      (d.levels || []).forEach(e => {
        if (e.name) map[e.name.toLowerCase().trim()] = { position: e.position, level_id: e.level_id };
      });
      RL.levels.forEach(l => {
        const k = l.name?.toLowerCase().trim();
        if (k && map[k]) { l.aredl_position = map[k].position; l.aredl_level_id = map[k].level_id; }
      });
    }
  } catch (e) {
    console.warn('[Roulette] API not available, trying levels.json fallback');
    try {
      const r = await fetch('data/levels.json');
      const d = await r.json();
      RL.levels = d.levels || [];
    } catch {}
  }

  document.getElementById('rlStatLevels').textContent = RL.levels.length;
  const withAredl = RL.levels.filter(l => l.aredl_position).length;
  document.getElementById('rlStatAredl').textContent = withAredl;

  const total = RL.levels.length || 1;
  RL.filterRange[1] = total;
  const rangeEl = document.getElementById('rlRangeMax');
  if (rangeEl) {
    rangeEl.max   = total;
    rangeEl.value = total;
  }
  updateRangeDisplay();
  rebuildPool();
}

// ─── BUILD POOL ───
function rebuildPool() {
  const [minPos, maxPos] = RL.filterRange;
  RL.pool = RL.levels.filter(l => {
    const pos = l.position || 999;
    if (pos < minPos || pos > maxPos) return false;
    if (RL.filterAredlOnly && !l.aredl_position) return false;
    if (
  RL.session.some(
    s => s.level.id === l.id &&
    (s.status === 'completed' || s.status === 'failed' || s.status === 'skipped')
  )
) return false;
    return true;
  });
  document.getElementById('rlStatPool').textContent = RL.pool.length;
  updatePoolStats();
}

function updatePoolStats() {
  const el = document.getElementById('rlPoolInfo');
  if (el) el.textContent = `${RL.pool.length} niveles disponibles`;
}

// ─── PERCENTAGE HELPERS ───
function getLastRecordedPercentage() {
  for (const s of RL.session) {
    if (s.percentage != null && (s.status === 'completed' || s.status === 'failed')) {
      return s.percentage;
    }
  }
  return null;
}

function validatePercentage(value, mode) {
  const num = parseInt(value, 10);
  if (isNaN(num) || num < 0 || num > 100) {
    return { ok: false, msg: 'Ingresá un porcentaje válido entre 0 y 100.' };
  }
  // Al rendirse/abandonar, el porcentaje es un intento nuevo e independiente:
  // no tiene por qué ser mayor al de un nivel anterior (ej. llegaste al 35% en
  // un nivel y te rendiste al 26% en otro). Solo se exige que esté en [0, 100].
  if (mode === 'fail') {
    return { ok: true, value: num };
  }
  const last = getLastRecordedPercentage();
  if (last != null && num <= last) {
    return { ok: false, msg: `El porcentaje es inválido: debe ser estrictamente mayor al anterior (${last}%).` };
  }
  return { ok: true, value: num };
}

// ─── PERCENTAGE MODAL ───
function initPctModal() {
  document.getElementById('rlPctCancel')?.addEventListener('click', closePctModal);
  document.getElementById('rlPctBackdrop')?.addEventListener('click', closePctModal);
  document.getElementById('rlPctSubmit')?.addEventListener('click', submitPctModal);
  document.getElementById('rlPctInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitPctModal();
    if (e.key === 'Escape') closePctModal();
  });
  document.getElementById('rlPctInput')?.addEventListener('input', () => {
    const errEl = document.getElementById('rlPctError');
    if (errEl) errEl.textContent = '';
  });
}

function openPctModal(mode) {
  if (!RL.current || isSessionEnded()) return;
  RL.pctModalMode = mode;

  const modal   = document.getElementById('rlPctModal');
  const title   = document.getElementById('rlPctTitle');
  const sub     = document.getElementById('rlPctSub');
  const icon    = document.getElementById('rlPctIcon');
  const levelEl = document.getElementById('rlPctLevelName');
  const hint    = document.getElementById('rlPctHint');
  const errEl   = document.getElementById('rlPctError');
  const input   = document.getElementById('rlPctInput');
  const submit  = document.getElementById('rlPctSubmit');

  if (mode === 'fail') {
    if (title) title.textContent = 'Abandonar nivel';
    if (sub)   sub.textContent   = '¿Hasta qué porcentaje llegaste antes de abandonar?';
    if (icon)  icon.innerHTML     = '<i class="fas fa-skull-crossbones"></i>';
    if (submit) submit.innerHTML  = '<i class="fas fa-skull-crossbones"></i> Confirmar abandono';
  } else {
    if (title) title.textContent = 'Registrar progreso';
    if (sub)   sub.textContent   = '¿Hasta qué porcentaje llegaste en este nivel?';
    if (icon)  icon.innerHTML     = '<i class="fas fa-percent"></i>';
    if (submit) submit.innerHTML  = '<i class="fas fa-check"></i> Confirmar';
  }

  if (levelEl) levelEl.textContent = RL.current.name;
  if (errEl)   errEl.textContent   = '';

  const last = getLastRecordedPercentage();
  if (hint) {
    if (mode === 'fail') {
      hint.textContent = 'Podés ingresar cualquier porcentaje del 0 al 100, sin importar tus intentos anteriores.';
    } else {
      hint.textContent = last != null
        ? `Debe ser mayor que ${last}%`
        : 'Primer nivel: podés ingresar cualquier porcentaje del 1 al 100.';
    }
  }

  if (input) {
    input.value = '';
    input.min = mode === 'fail' ? 0 : (last != null ? last : 1);
    input.max = 100;
  }

  modal?.classList.add('open');
  setTimeout(() => input?.focus(), 100);
}

function closePctModal() {
  document.getElementById('rlPctModal')?.classList.remove('open');

  const err = document.getElementById('rlPctError');
  if (err) err.textContent = '';
}

function submitPctModal() {
  const input = document.getElementById('rlPctInput');
  const errEl = document.getElementById('rlPctError');
  const result = validatePercentage(input?.value, RL.pctModalMode);

  if (!result.ok) {
    if (errEl) errEl.textContent = result.msg;
    input?.focus();
    return;
  }

  closePctModal();

  if (RL.pctModalMode === 'fail') {
    finalizeFail(result.value);
  } else {
    finalizeComplete(result.value);
  }
}


// ─── INIT CONTROLS ───
function initControls() {
  const goalSlider = document.getElementById('rlGoalSlider');

  goalSlider?.addEventListener('input', () => {
    RL.totalGoal = parseInt(goalSlider.value, 10);
    document.getElementById('rlGoalVal').textContent = RL.totalGoal;
    updateProgressUI();
    saveSession();
  });

  const rangeMax = document.getElementById('rlRangeMax');

if (rangeMax) {
  rangeMax.addEventListener('input', () => {
    RL.filterRange[1] = parseInt(rangeMax.value, 10);
    updateRangeDisplay();
    rebuildPool();
  });
}

  document.getElementById('rlAredlOnly')?.addEventListener('change', e => {
    RL.filterAredlOnly = e.target.checked;
    rebuildPool();
  });

  document.getElementById('rlHideLevel')?.addEventListener('change', e => {
    RL.revealHidden = e.target.checked;
  });

  document.getElementById('rlBtnSpin')?.addEventListener('click', handleSpin);
  document.getElementById('rlBtnSkip')?.addEventListener('click', handleSkip);
  document.getElementById('rlBtnComplete')?.addEventListener('click', () => openPctModal('complete'));
  document.getElementById('rlBtnFail')?.addEventListener('click', () => openPctModal('fail'));
  document.getElementById('rlBtnDownloadPdf')?.addEventListener('click', downloadSessionPdf);
  document.getElementById('rlBtnFinishPdf')?.addEventListener('click', downloadSessionPdf);

  document.getElementById('rlBtnNewSession')?.addEventListener('click', () => {
    document.getElementById('rlFinishModal')?.classList.remove('open');
    resetSession();
  });
  document.getElementById('rlBtnCloseFinish')?.addEventListener('click', () => {
    document.getElementById('rlFinishModal')?.classList.remove('open');
  });
  document.getElementById('rlHistoryClear')?.addEventListener('click', () => {
    if (RL.session.length && confirm('¿Limpiar el historial de esta sesión?')) {
      resetSession();
    }
  });

  document.getElementById('rlHeroCta')?.addEventListener('click', () => {
    document.getElementById('rlSlotSection')?.scrollIntoView({ behavior: 'smooth' });
    if (!RL.sessionActive) startSession();
  });

  const canvas = document.getElementById('confettiCanvas');
  if (canvas) {
    RL.confettiCtx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    window.addEventListener('resize', () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    });
  }

  updateProgressUI();
  updateButtons();
}

function isSessionEnded() {
  return RL.surrendered || RL.session.some(s => s.status === 'failed');
}

function showSurrenderBanner() {
  let banner = document.getElementById('rlSurrenderBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'rlSurrenderBanner';
    banner.className = 'rl-surrender-banner';
    banner.innerHTML = '<i class="fas fa-skull-crossbones"></i> Sesión terminada — te rendiste. Iniciá una nueva sesión para continuar.';
    document.getElementById('rlSlotSection')?.prepend(banner);
  }
  banner.style.display = '';
}

function hideSurrenderBanner() {
  const banner = document.getElementById('rlSurrenderBanner');
  if (banner) banner.style.display = 'none';
}

function updateRangeDisplay() {
  const maxEl = document.getElementById('rlRangeMaxVal');
  const total = RL.levels.length || parseInt(document.getElementById('rlRangeMax')?.max, 10) || 1;
  const current = RL.filterRange[1];
  if (maxEl) {
    maxEl.textContent = current >= total ? `${total} de ${total}` : `#1 – #${current} de ${total}`;
  }
}

function saveSession() {
  const data = {
    session: RL.session,
    current: RL.current,
    sessionActive: RL.sessionActive,
    surrendered: RL.surrendered,
    totalGoal: RL.totalGoal,
    filterRange: RL.filterRange,
    filterAredlOnly: RL.filterAredlOnly,
    revealHidden: RL.revealHidden
  };

  console.log('[ROULETTE SAVE]', data);

  localStorage.setItem(
    RL_STORAGE_KEY,
    JSON.stringify(data)
  );
}

function loadSession() {
  try {
    const raw = localStorage.getItem(RL_STORAGE_KEY);
    if (!raw) return;

    const data = JSON.parse(raw);

    RL.session = data.session || [];
    RL.current = data.current || null;
    RL.sessionActive = !!data.sessionActive;
    RL.surrendered = !!data.surrendered || RL.session.some(s => s.status === 'failed');
    RL.totalGoal = data.totalGoal || 50;
    RL.filterRange = data.filterRange || [1, RL.filterRange[1]];
    RL.filterAredlOnly = !!data.filterAredlOnly;
    RL.revealHidden = !!data.revealHidden;
    const slider = document.getElementById('rlGoalSlider');
    const value = document.getElementById('rlGoalVal');

    if (slider) slider.value = RL.totalGoal;
    if (value) value.textContent = RL.totalGoal;
    const range = document.getElementById('rlRangeMax');
    if (range) range.value = RL.filterRange[1];

    const aredl = document.getElementById('rlAredlOnly');
    if (aredl) aredl.checked = RL.filterAredlOnly;

    const hide = document.getElementById('rlHideLevel');
    if (hide) hide.checked = RL.revealHidden;

    if (RL.surrendered) showSurrenderBanner();

  } catch (err) {
    console.error('Roulette save corrupted', err);
  }
}

// ─── SESSION MANAGEMENT ───
function startSession() {
  RL.session = [];
  RL.sessionActive = true;
  RL.surrendered = false;
  RL.current = null;
  hideSurrenderBanner();
  resetSlotDisplay();
  updateButtons();
  rebuildPool();
  updateProgressUI();
  renderHistory();
  updateSessionStats();
  updateButtons();
  handleSpin();
  saveSession();
}

function resetSession() {
  RL.session = [];
  RL.sessionActive = false;
  RL.surrendered = false;
  RL.current = null;
  hideSurrenderBanner();
  console.trace('SAVE');
  resetSlotDisplay();
  updateButtons();
  rebuildPool();
  renderHistory();
  updateProgressUI();
  updateSessionStats();
  resetSlotDisplay();
  console.trace('SAVE');
  saveSession();
}

function checkActiveSession() {
  if (RL.session.length > 0 || RL.current) {
    RL.sessionActive = true;

    if (RL.current) {
      renderCurrentLevel(RL.current);
    }

    if (RL.surrendered) showSurrenderBanner();

    updateProgressUI();
    updateSessionStats();
    updateButtons();
  }
}

// ─── SPIN ───
async function handleSpin() {
  if (isSessionEnded()) {
    showRlToast('La sesión terminó porque te rendiste.', 'error');
    showSurrenderBanner();
    return;
  }

  if (RL.spinning) return;

if (RL.current) {
  showRlToast(
    'Debés completar, rendirte o saltear el nivel actual antes de volver a girar.',
    'error'
  );
  return;
}
  if (RL.pool.length === 0) {
    showRlToast('¡No hay niveles disponibles con los filtros actuales!', 'error');
    return;
  }

  if (!RL.sessionActive) RL.sessionActive = true;

  RL.spinning = true;
  updateButtons();

  // Delete the pending level
  const index = RL.session.findIndex(l => l.status === 'pending');
  if (index !== -1) RL.session.splice(index, 1);

  const chosen = RL.pool[Math.floor(Math.random() * RL.pool.length)];
  RL.current = chosen;
  console.trace('SAVE');
  saveSession();

  const machine = document.getElementById('rlSlotMachine');
  machine?.classList.add('spinning');
  machine?.classList.remove('revealed');

  await animateSlotMachine(chosen);

  machine?.classList.remove('spinning');
  machine?.classList.add('revealed');
  renderCurrentLevel(chosen);

  RL.spinning = false;
  updateButtons();
}

async function animateSlotMachine(target) {
  const strip = document.getElementById('rlSpinStrip');
  if (!strip) return;

  const names = RL.levels.map(l => l.name).sort(() => Math.random() - .5);
  const items = [...names, ...names, target.name].slice(0, 40);
  strip.innerHTML = items.map((n, i) => `
    <div class="rl-spin-item${i === items.length - 1 ? ' highlight' : ''}">${n}</div>
  `).join('');

  return new Promise(r => setTimeout(r, RL.spinDuration || 1200));
}

function renderCurrentLevel(level) {
  const thumb    = level.thumb_url || null;
  const pos      = level.position || '?';
  const aredlPos = level.aredl_position || null;
  const pts      = level.points != null ? level.points : Math.max(1, 1000 - ((pos || 1) - 1) * 5);
  const ytId     = level.youtube_id || extractYoutubeId(level.youtube_url);

  const thumbEl = document.getElementById('rlSlotThumb');
  if (thumbEl) {
    thumbEl.src = thumb || '';
    thumbEl.style.display = thumb ? '' : 'none';
    thumbEl.className = `rl-slot-thumb${RL.revealHidden ? ' hidden-thumb' : ''}`;
  }

  const infoEl = document.getElementById('rlSlotInfo');
  if (infoEl) {
    infoEl.innerHTML = `
      <div class="rl-slot-pos-badge">
        <i class="fas fa-list"></i> #${pos} en la lista
        ${aredlPos ? `<span style="opacity:.7">· AREDL #${aredlPos}</span>` : ''}
      </div>
      <div class="rl-slot-name">${esc(level.name)}</div>
      <div class="rl-slot-meta">
        <span class="rl-slot-chip"><i class="fas fa-star" style="color:var(--gold)"></i>${pts.toLocaleString()} pts</span>
        ${level.victors?.length ? `<span class="rl-slot-chip"><i class="fas fa-flag-checkered" style="color:var(--violet)"></i>${level.victors.length} completion${level.victors.length !== 1 ? 's' : ''}</span>` : ''}
        ${level.aredl_level_id ? `
<button class="rl-slot-chip rl-copy-id-btn" onclick="copyLevelId('${level.aredl_level_id}')">
  <i class="fas fa-copy"></i> ID ${level.aredl_level_id}
</button>
` : ''}

${ytId ? `<a href="https://youtube.com/watch?v=${ytId}" target="_blank" class="rl-slot-chip" style="color:var(--red);text-decoration:none;border-color:rgba(244,63,94,.3)"><i class="fab fa-youtube"></i> Ver showcase</a>` : ''}
      </div>
    `;
  }

  RL.session = RL.session.filter(
  s => !(s.status === 'pending' && s.level.id !== level.id)
);

const existing = RL.session.find(
  s => s.level.id === level.id && s.status === 'pending'
);
  if (!existing) {
    RL.session.unshift({ level, status: 'pending', percentage: null, timestamp: Date.now() });
  }

  renderHistory();
  updateProgressUI();
  updateSessionStats();
  console.trace('SAVE');
  saveSession();
}

function resetSlotDisplay() {
  const machine = document.getElementById('rlSlotMachine');
  machine?.classList.remove('spinning', 'revealed');
  const infoEl = document.getElementById('rlSlotInfo');
  if (infoEl) infoEl.innerHTML = `
    <div class="rl-slot-pos-badge"><i class="fas fa-dice"></i> ¿Qué nivel te toca?</div>
    <div class="rl-slot-name">Presioná GIRAR</div>
    <div class="rl-slot-meta"></div>
  `;
  const thumbEl = document.getElementById('rlSlotThumb');
  if (thumbEl) { thumbEl.src = ''; thumbEl.style.display = 'none'; }
}

// ─── COMPLETE / FAIL / SKIP ───
function finalizeComplete(percentage) {
  if (isSessionEnded()) return;
  if (!RL.current) return;
  const entry = RL.session.find(s => s.level.id === RL.current.id);
  if (entry) {
    entry.status     = 'completed';
    entry.percentage = percentage;
    entry.timestamp  = Date.now();
  }

  const completedCount = RL.session.filter(s => s.status === 'completed').length;
  const isFull = percentage >= 100;

  showRlToast(
    isFull ? `¡${RL.current.name} completado al 100%! 🔥` : `${RL.current.name} — ${percentage}% registrado ✓`,
    'success'
  );
  if (isFull) launchConfetti();
  console.trace('SAVE');
  saveSession();

  if (completedCount >= RL.totalGoal) {
    setTimeout(showFinishModal, 800);
    return;
  }

  rebuildPool();
  renderHistory();
  updateProgressUI();
  updateSessionStats();

  RL.current = null;
  console.trace('SAVE');
  saveSession();
  resetSlotDisplay();
  updateButtons();
}

  function finalizeFail(percentage) {
  if (!RL.current || isSessionEnded()) return;

  const entry = RL.session.find(
    s => s.level.id === RL.current.id
  );

  if (entry) {
    entry.status = 'failed';
    entry.percentage = percentage;
    entry.timestamp = Date.now();
  }

  RL.surrendered = true;
  RL.sessionActive = false;

  showSurrenderBanner();
  showRlToast(
    `${RL.current.name} — Abandonado en ${percentage}%. Sesión terminada.`,
    'info'
  );

  rebuildPool();
  renderHistory();
  updateProgressUI();
  updateSessionStats();

  RL.current = null;

  resetSlotDisplay();
  updateButtons();
  saveSession();
}

function handleSkip() {
  if (isSessionEnded()) return;
  if (!RL.current) return;
  const entry = RL.session.find(s => s.level.id === RL.current.id);
  if (entry) {
    entry.status     = 'skipped';
    entry.percentage = null;
    entry.timestamp  = Date.now();
  }

  showRlToast(`${RL.current.name} salteado`, 'info');
  rebuildPool();
  renderHistory();
  updateProgressUI();
  updateSessionStats();

  RL.current = null;
  console.trace('SAVE');
  saveSession();
  resetSlotDisplay();
  updateButtons();
}

// ─── PROGRESS UI ───
function updateProgressUI() {
  const completed = RL.session.filter(s => s.status === 'completed').length;
  const skipped   = RL.session.filter(s => s.status === 'skipped').length;
  const failed    = RL.session.filter(s => s.status === 'failed').length;
  const total     = RL.totalGoal;
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0;

  const bar = document.getElementById('rlProgressFill');
  if (bar) bar.style.width = pct + '%';

  const countEl = document.getElementById('rlProgressCount');
  if (countEl) countEl.textContent = `${completed} / ${total}`;

  const dotsEl = document.getElementById('rlProgressDots');
  if (dotsEl) {
    dotsEl.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('div');
      if (i < completed) {
        dot.className = 'rl-progress-dot completed';
        dot.title = `Nivel ${i + 1}: completado`;
      } else if (i === completed && RL.current) {
        dot.className = 'rl-progress-dot current';
        dot.title = 'Nivel actual';
      } else {
        dot.className = 'rl-progress-dot';
      }
      dotsEl.appendChild(dot);
    }
  }

  const infoEl = document.getElementById('rlControlsInfo');
  if (infoEl) infoEl.textContent = `${completed} completados · ${failed} rendidos · ${skipped} salteados`;
}

// ─── SESSION STATS ───
function updateSessionStats() {
  const completed = RL.session.filter(s => s.status === 'completed').length;
  const failed    = RL.session.filter(s => s.status === 'failed').length;
  const skipped   = RL.session.filter(s => s.status === 'skipped').length;
  const pcts      = RL.session
    .filter(s => s.percentage != null)
    .map(s => s.percentage);

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  set('rlStatCompleted', completed);
  set('rlStatFailed', failed);
  set('rlStatSkipped', skipped);

  if (pcts.length) {
    const avg  = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
    const best = Math.max(...pcts);
    const last = getLastRecordedPercentage();
    set('rlStatAvgPct', avg + '%');
    set('rlStatBestPct', best + '%');
    set('rlStatLastPct', last != null ? last + '%' : '—');
  } else {
    set('rlStatAvgPct', '—');
    set('rlStatBestPct', '—');
    set('rlStatLastPct', '—');
  }

  const pdfBtn = document.getElementById('rlBtnDownloadPdf');
  if (pdfBtn) pdfBtn.disabled = RL.session.length === 0;

  const detail = document.getElementById('rlStatsDetail');
  if (!detail) return;

  if (!RL.session.length) {
    detail.innerHTML = '<p class="rl-stats-empty">Girá la ruleta para empezar a registrar estadísticas.</p>';
    return;
  }

  detail.innerHTML = RL.session.map((entry, i) => {
    const num    = RL.session.length - i;
    const level  = entry.level;
    const pos    = level.position || '?';
    const status = statusLabel(entry);
    const pctStr = entry.percentage != null ? ` · ${entry.percentage}%` : '';
    return `<div class="rl-stats-row">
      <span class="rl-stats-row-num">${num}</span>
      <span class="rl-stats-row-name">${esc(level.name)}</span>
      <span class="rl-stats-row-pos">#${pos}</span>
      <span class="rl-stats-row-status ${entry.status}">${status}${pctStr}</span>
    </div>`;
  }).join('');
}

function statusLabel(entry) {
  if (entry.status === 'completed') return entry.percentage >= 100 ? '✓ Completado' : '✓ Completado';
  if (entry.status === 'failed')    return '✗ Rendido';
  if (entry.status === 'skipped')   return '↩ Salteado';
  return '⏳ Pendiente';
}

// ─── HISTORY ───
function renderHistory() {
  const list  = document.getElementById('rlHistoryList');
  const empty = document.getElementById('rlHistoryEmpty');
  if (!list) return;

  if (!RL.session.length) {
    list.style.display = 'none';
    if (empty) empty.style.display = '';
    return;
  }

  if (empty) empty.style.display = 'none';
  list.style.display = '';

  list.innerHTML = RL.session.map((entry, i) => {
    const level  = entry.level;
    const thumb  = level.thumb_url || null;
    const ytId   = level.youtube_id || extractYoutubeId(level.youtube_url);
    const pos    = level.position || '?';
    const pts    = level.points != null ? level.points : Math.max(1, 1000 - ((pos || 1) - 1) * 5);
    const num    = RL.session.length - i;

    let statusHtml;
    const pctBadge = entry.percentage != null
      ? `<span class="rl-history-pct">${entry.percentage}%</span>` : '';

    if (entry.status === 'completed') {
      statusHtml = `<span class="rl-history-status rl-status-completed">✓ Completado ${pctBadge}</span>`;
    } else if (entry.status === 'failed') {
      statusHtml = `<span class="rl-history-status rl-status-failed">✗ Rendido ${pctBadge}</span>`;
    } else if (entry.status === 'skipped') {
      statusHtml = `<span class="rl-history-status rl-status-skipped">↩ Salteado</span>`;
    } else {
      statusHtml = `<span class="rl-history-status rl-status-pending">⏳ Pendiente</span>`;
    }

    return `
      <div class="rl-history-item">
        <span class="rl-history-num">${num}</span>
        ${thumb
          ? `<img class="rl-history-thumb" src="${thumb}" alt="" onerror="this.className='rl-history-thumb rl-history-thumb-ph';this.src='';">`
          : `<div class="rl-history-thumb rl-history-thumb-ph"></div>`
        }
        <div class="rl-history-info">
          <div class="rl-history-name">${esc(level.name)}</div>
          <div class="rl-history-meta">
            <span>#${pos} en lista</span>
            <span>·</span>
            <span>${pts.toLocaleString()} pts</span>
            ${level.aredl_position ? `<span>· AREDL #${level.aredl_position}</span>` : ''}
          </div>
        </div>
        ${statusHtml}
        ${ytId && entry.status !== 'pending'
          ? `<a href="https://youtube.com/watch?v=${ytId}" target="_blank" class="rl-history-yt-btn">
               <i class="fab fa-youtube"></i> Ver
             </a>`
          : ''
        }
      </div>`;
  }).join('');
}

// ─── BUTTONS STATE ───
function updateButtons() {
  const ended       = isSessionEnded();
  const spinBtn     = document.getElementById('rlBtnSpin');
  const skipBtn     = document.getElementById('rlBtnSkip');
  const completeBtn = document.getElementById('rlBtnComplete');
  const failBtn     = document.getElementById('rlBtnFail');
  const goalSlider  = document.getElementById('rlGoalSlider');
  const rangeMax    = document.getElementById('rlRangeMax');
  const aredlOnly   = document.getElementById('rlAredlOnly');
  const hideLevel   = document.getElementById('rlHideLevel');
  const heroCta     = document.getElementById('rlHeroCta');

  if (spinBtn) {
    spinBtn.disabled = ended || RL.spinning || !!RL.current;
    spinBtn.classList.toggle('spinning', RL.spinning);
    spinBtn.querySelector('.spin-text').textContent = ended ? 'Sesión terminada' : (RL.spinning ? 'Girando...' : 'Girar');
  }
  if (skipBtn)     skipBtn.disabled     = ended || RL.spinning || !RL.current;
  if (completeBtn) completeBtn.disabled = ended || RL.spinning || !RL.current;
  if (failBtn)     failBtn.disabled     = ended || RL.spinning || !RL.current;
  if (goalSlider)  goalSlider.disabled  = ended;
  if (rangeMax)    rangeMax.disabled    = ended;
  if (aredlOnly)   aredlOnly.disabled   = ended;
  if (hideLevel)   hideLevel.disabled   = ended;
  if (heroCta)     heroCta.disabled     = ended;
}

// ─── FINISH MODAL ───
function showFinishModal() {
  const modal = document.getElementById('rlFinishModal');
  if (!modal) return;

  const completed = RL.session.filter(s => s.status === 'completed').length;
  const failed    = RL.session.filter(s => s.status === 'failed').length;
  const skipped   = RL.session.filter(s => s.status === 'skipped').length;
  const total     = completed + failed + skipped;
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0;

  document.getElementById('rlFinishCompleted').textContent = completed;
  document.getElementById('rlFinishFailed').textContent    = failed;
  document.getElementById('rlFinishSkipped').textContent   = skipped;
  document.getElementById('rlFinishPct').textContent       = pct + '%';

  modal.classList.add('open');
  launchConfetti();
}

// ─── PDF EXPORT ───
// ─── PDF EXPORT ───
function downloadSessionPdf() {
  if (!RL.session.length) {
    showRlToast('No hay datos de sesión para exportar', 'error');
    return;
  }

  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    showRlToast('Error al cargar la librería PDF', 'error');
    return;
  }

  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W    = doc.internal.pageSize.getWidth();
  const H    = doc.internal.pageSize.getHeight();
  const ML   = 14;   // margin left
  const MR   = 14;   // margin right
  const CW   = W - ML - MR;

  // ── Colores principales ──
  const C = {
    violet:    [124, 58, 237],
    red:       [244, 63, 94],
    green:     [34,  197, 94],
    amber:     [245, 158, 11],
    white:     [255, 255, 255],
    bg:        [14,  14,  24],
    bg2:       [22,  22,  36],
    bg3:       [30,  30,  48],
    text:      [240, 240, 248],
    textSub:   [144, 144, 176],
    textDim:   [85,  85,  106],
    border:    [40,  40,  64],
  };

  function setFill(...rgb)   { doc.setFillColor(...rgb); }
  function setStroke(...rgb) { doc.setDrawColor(...rgb); }
  function setTxt(...rgb)    { doc.setTextColor(...rgb); }
  function setFont(style, size) { doc.setFont('helvetica', style); doc.setFontSize(size); }
  function rect(x, y, w, h, fill = true) {
    if (fill) doc.rect(x, y, w, h, 'F');
    else      doc.rect(x, y, w, h, 'S');
  }
  function roundRect(x, y, w, h, r = 3) {
    doc.roundedRect(x, y, w, h, r, r, 'F');
  }

  // ── HEADER ──
  setFill(...C.bg);
  rect(0, 0, W, H);

  // Header gradient bar (violet → red simulation via two rects)
  setFill(...C.violet);
  rect(0, 0, W * .6, 32);
  setFill(...C.red);
  rect(W * .4, 0, W * .6, 32);
  // Overlay dark to blend
  setFill(7, 7, 13);
  doc.setGState(doc.GState({ opacity: 0.35 }));
  rect(0, 0, W, 32);
  doc.setGState(doc.GState({ opacity: 1 }));

  setTxt(...C.white);
  setFont('bold', 20);
  doc.text('UY DEMONLIST', ML, 13);
  setFont('normal', 9);
  setTxt(...C.textSub);
  doc.text('Extreme Demon Roulette — Session Report', ML, 20);
  setFont('normal', 8);
  setTxt(...C.textDim);
  doc.text(new Date().toLocaleString('es-UY', { dateStyle: 'full', timeStyle: 'short' }), W - MR, 20, { align: 'right' });

  // Decorative line below header
  setFill(...C.violet);
  rect(0, 32, W, 1);

  let y = 44;

  // ── STATS GRID ──
  const completed = RL.session.filter(s => s.status === 'completed').length;
  const failed    = RL.session.filter(s => s.status === 'failed').length;
  const skipped   = RL.session.filter(s => s.status === 'skipped').length;
  const pcts      = RL.session.filter(s => s.percentage != null).map(s => s.percentage);
  const avg       = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const best      = pcts.length ? Math.max(...pcts) : null;
  const last      = getLastRecordedPercentage();
  const total     = RL.session.filter(s => s.status !== 'pending').length;
  const ratio     = total > 0 ? Math.round((completed / total) * 100) : 0;

  const statCards = [
    { label: 'Meta',        val: `${RL.totalGoal}`,                  color: C.violet },
    { label: 'Completados', val: `${completed}`,                 color: C.green  },
    { label: 'Rendidos',  val: `${failed}`,                      color: C.red    },
    { label: 'Salteados',  val: `${skipped}`,                    color: C.amber  },
    { label: 'Ratio',      val: `${ratio}%`,                     color: C.violet },
    { label: 'Promedio %', val: avg != null ? `${avg}%` : '-',   color: C.textSub },
    { label: 'Mejor %',   val: best != null ? `${best}%` : '-', color: C.green  },
    { label: 'Último %',  val: last != null ? `${last}%` : '-', color: C.amber  },
  ];

  setFont('bold', 9);
  setTxt(...C.textSub);
  doc.text('RESUMEN DE SESIÓN', ML, y);
  y += 5;

  const cols   = 4;
  const gap    = 3;
  const cardW  = (CW - gap * (cols - 1)) / cols;
  const cardH  = 14;

  statCards.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx  = ML + col * (cardW + gap);
    const cy  = y + row * (cardH + gap);

    setFill(...C.bg3);
    roundRect(cx, cy, cardW, cardH, 2);

    // Left color bar
    setFill(...s.color);
    roundRect(cx, cy, 2.5, cardH, 1);

    setFont('bold', 8);
    setTxt(...s.color);
    doc.text(s.val, cx + cardW / 2, cy + 5.5, { align: 'center' });

    setFont('normal', 6);
    setTxt(...C.textSub);
    doc.text(s.label, cx + cardW / 2, cy + 10.5, { align: 'center' });
  });

  y += Math.ceil(statCards.length / cols) * (cardH + gap) + 8;

  // Config info row
  setFill(...C.bg2);
  roundRect(ML, y, CW, 8, 2);
  setFont('normal', 7);
  setTxt(...C.textDim);
  const configStr = `Rango: ${document.getElementById('rlRangeMaxVal')?.textContent || '—'}  ·  Solo AREDL: ${RL.filterAredlOnly ? 'Sí' : 'No'}  ·  Pool disponible: ${RL.pool.length} niveles`;
  doc.text(configStr, W / 2, y + 5, { align: 'center' });
  y += 14;

  // ── TABLE HEADER ──
  setFont('bold', 9);
  setTxt(...C.textSub);
  doc.text('HISTORIAL DE NIVELES', ML, y);
  y += 5;

  const cols2 = [
    { label: '#',       w: 8,  align: 'center' },
    { label: 'Nivel',   w: 58, align: 'left'   },
    { label: 'Pos.',    w: 15, align: 'center'  },
    { label: 'AREDL',  w: 18, align: 'center'  },
    { label: 'Pts',     w: 18, align: 'center'  },
    { label: 'Estado',  w: 28, align: 'center'  },
    { label: '%',       w: 12, align: 'center'  },
  ];

  // Table header background
  setFill(...C.violet);
  rect(ML, y, CW, 7);

  let cx = ML + 2;
  setFont('bold', 7.5);
  setTxt(...C.white);
  cols2.forEach(col => {
    doc.text(col.label, col.align === 'center' ? cx + col.w / 2 : cx, y + 5,
      { align: col.align === 'center' ? 'center' : 'left' });
    cx += col.w;
  });
  y += 7;

  // ── TABLE ROWS ──
  const visibleEntries = RL.session.filter(s => s.status !== 'pending');

  visibleEntries.forEach((entry, idx) => {
    if (y > H - 20) {
      // Footer before new page
      setFont('normal', 7);
      setTxt(...C.textDim);
      doc.text(`Página ${doc.internal.getCurrentPageInfo().pageNumber}`, W - MR, H - 8, { align: 'right' });
      doc.addPage();
      setFill(...C.bg);
      rect(0, 0, W, H);
      y = 15;
    }

    const rowH = 8;
    const isEven = idx % 2 === 0;

    // Row background
    setFill(...(isEven ? C.bg2 : C.bg3));
    rect(ML, y, CW, rowH);

    // Status color accent on left
    let statusColor = C.textDim;
    let statusStr   = '—';
    if (entry.status === 'completed') { statusColor = C.green;  statusStr = 'Completado'; }
    if (entry.status === 'failed')    { statusColor = C.red;    statusStr = 'Rendido';    }
    if (entry.status === 'skipped')   { statusColor = C.amber;  statusStr = 'Salteado';   }

    setFill(...statusColor);
    rect(ML, y, 1.5, rowH);

    const level  = entry.level;
    const pos    = level.position || '?';
    const pts    = level.points != null ? level.points : Math.max(1, 1000 - ((pos || 1) - 1) * 5);
    const num    = visibleEntries.length - idx;
    const name   = (level.name || '—').substring(0, 32);
    const pctStr = entry.percentage != null ? `${entry.percentage}%` : '—';
    const aredl  = level.aredl_position ? `#${level.aredl_position}` : '—';

    const cells = [
      { val: `${num}`,                align: 'center', color: C.textSub },
      { val: name,                    align: 'left',   color: C.text    },
      { val: `#${pos}`,               align: 'center', color: C.violet  },
      { val: aredl,                   align: 'center', color: C.textSub },
      { val: pts.toLocaleString(),    align: 'center', color: C.amber   },
      { val: statusStr,               align: 'center', color: statusColor },
      { val: pctStr,                  align: 'center', color: entry.percentage != null ? C.green : C.textDim },
    ];

    cx = ML + 2;
    setFont('normal', 7);
    cells.forEach((cell, ci) => {
      const col = cols2[ci];
      setTxt(...cell.color);
      doc.text(cell.val, cell.align === 'center' ? cx + col.w / 2 : cx, y + 5.5,
        { align: cell.align === 'center' ? 'center' : 'left', maxWidth: col.w - 2 });
      cx += col.w;
    });

    y += rowH;
  });

  // ── FOOTER ON LAST PAGE ──
  y += 8;
  if (y > H - 22) {
    doc.addPage();
    setFill(...C.bg);
    rect(0, 0, W, H);
    y = 15;
  }

  // Signature line
  setFill(...C.border);
  rect(ML, y, CW, 0.5);
  y += 5;

  setFont('normal', 7);
  setTxt(...C.textDim);
  doc.text('Generado por UY Demonlist · uy-demonlist-v2 · Basado en datos en vivo de la lista', W / 2, y, { align: 'center' });
  y += 4;
  doc.text(`https://gduruguay.com  ·  Sesión: ${new Date().toLocaleString('es-UY')}`, W / 2, y, { align: 'center' });

  // Page number footer on last page
  setFont('normal', 7);
  setTxt(...C.textDim);
  doc.text(`Página ${doc.internal.getCurrentPageInfo().pageNumber}`, W - MR, H - 8, { align: 'right' });

  doc.save(`uy-demonlist-roulette-${Date.now()}.pdf`);
  showRlToast('📄 PDF descargado ✓', 'success');
}

// ─── CONFETTI ───
function launchConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  const ctx    = RL.confettiCtx;
  if (!ctx) return;

  canvas.classList.add('active');
  RL.confettiParticles = Array.from({ length: 90 }, () => ({
    x:    Math.random() * canvas.width,
    y:    -10,
    vx:   (Math.random() - .5) * 6,
    vy:   Math.random() * 4 + 2,
    size: Math.random() * 8 + 4,
    rot:  Math.random() * 360,
    vrot: (Math.random() - .5) * 8,
    color: ['#9b59f5','#f43f5e','#22c55e','#f59e0b','#38bdf8','#ff6b35'][Math.floor(Math.random() * 6)],
    opacity: 1,
  }));

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    RL.confettiParticles.forEach(p => {
      if (p.opacity <= 0) return;
      alive = true;
      p.x   += p.vx;
      p.y   += p.vy;
      p.vy  += .06;
      p.rot += p.vrot;
      if (p.y > canvas.height * .7) p.opacity -= .025;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .6);
      ctx.restore();
    });
    if (alive) requestAnimationFrame(draw);
    else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.classList.remove('active');
    }
  }
  requestAnimationFrame(draw);
}

// ─── EMBERS BACKGROUND ───
function buildEmbers() {
  const container = document.getElementById('rlEmbers');
  if (!container) return;
  for (let i = 0; i < 25; i++) {
    const e = document.createElement('div');
    e.className = 'rl-ember';
    e.style.cssText = `
      left: ${Math.random() * 100}%;
      --dur: ${3 + Math.random() * 5}s;
      --delay: ${Math.random() * 4}s;
      --drift: ${(Math.random() - .5) * 80}px;
    `;
    container.appendChild(e);
  }
}

// ─── TOAST ───
let rlToastTimer;
function showRlToast(msg, type = 'info') {
  let toast = document.getElementById('rlToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'rlToast';
    toast.className = 'rl-toast';
    document.body.appendChild(toast);
  }
  clearTimeout(rlToastTimer);
  toast.className = `rl-toast ${type}`;
  toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'fire' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${msg}`;
  setTimeout(() => toast.classList.add('show'), 10);
  rlToastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

// ─── UTILS ───
function extractYoutubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/)([^&\s]{11})/);
  return m ? m[1] : null;
}

function copyLevelId(id) {
  navigator.clipboard.writeText(id);

  showRlToast(
    `ID ${id} copiada al portapapeles`,
    'success'
  );
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
