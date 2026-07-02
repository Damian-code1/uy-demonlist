


const RL = {
  levels:       [],
  aredlLevels:  [],
  pool:         [],
  session:      [],
  current:      null,
  sessionActive:false,
  totalGoal:    50,
  spinDuration: 1200,
  revealHidden: false,
  filterRange: [1, 1],
  filterAredlOnly: false,
  filterAllAredl:  false, 
  spinning:     false,
  surrendered:  false,
  confettiCtx:  null,
  confettiParticles: [],
  pctModalMode: 'complete',
};

const RL_STORAGE_KEY = 'uydl_roulette_session_v1';


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
checkAutoFinishModal();

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

      const listNames = new Set(RL.levels.map(l => l.name?.toLowerCase().trim()));
      RL.aredlLevels = (d.levels || [])
        .filter(e => e.name && !listNames.has(e.name.toLowerCase().trim()))
        .map(e => ({
          id:             `aredl_${e.level_id || e.position}`,
          name:           e.name,
          position:       null,         
          aredl_position: e.position,
          aredl_level_id: e.level_id || null,
          victors:        [],
          points:         null,
          thumb_url: e.level_id
            ? `https://gd-level-api.liamt.xyz/thumbnail/${e.level_id}`
            : null,
          _fromAredlOnly: true,
        }));
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

  if (RL.filterAllAredl) {
    const totalAredl = RL.aredlLevels.length + RL.levels.filter(l => l.aredl_position).length;
    RL.filterRange = [1, totalAredl || total];
    const allAredlCb = document.getElementById('rlAllAredl');
    if (allAredlCb) allAredlCb.checked = true;
    const rangeEl = document.getElementById('rlRangeMax');
    if (rangeEl) { rangeEl.max = RL.filterRange[1]; rangeEl.value = RL.filterRange[1]; }
  } else {
    RL.filterRange[1] = total;
    const rangeEl = document.getElementById('rlRangeMax');
    if (rangeEl) { rangeEl.max = total; rangeEl.value = total; }
  }

  updateRangeDisplay();
  rebuildPool();
}


function rebuildPool() {
  const doneIds = new Set(
    RL.session
      .filter(s => s.status === 'completed' || s.status === 'failed' || s.status === 'skipped')
      .map(s => s.level.id)
  );

  if (RL.filterAllAredl) {
    const [minAredl, maxAredl] = RL.filterRange;
    const fromList = RL.levels.filter(l => {
      if (!l.aredl_position) return false;
      if (l.aredl_position < minAredl || l.aredl_position > maxAredl) return false;
      if (doneIds.has(l.id)) return false;
      return true;
    });
    const fromAredl = RL.aredlLevels.filter(l => {
      if (!l.aredl_position) return false;
      if (l.aredl_position < minAredl || l.aredl_position > maxAredl) return false;
      if (doneIds.has(l.id)) return false;
      return true;
    });
    RL.pool = [...fromList, ...fromAredl];
    RL.pool.sort((a, b) => (a.aredl_position || 9999) - (b.aredl_position || 9999));

    document.getElementById('rlStatPool').textContent = RL.pool.length;
    const el = document.getElementById('rlPoolCount');
    if (el) el.textContent = `${RL.pool.length} niveles disponibles`;
    return;
  }

  const [minPos, maxPos] = RL.filterRange;
  RL.pool = RL.levels.filter(l => {
    const pos = l.position || 999;
    if (pos < minPos || pos > maxPos) return false;
    if (RL.filterAredlOnly && !l.aredl_position) return false;
    if (doneIds.has(l.id)) return false;
    return true;
  });
  document.getElementById('rlStatPool').textContent = RL.pool.length;
  updatePoolStats();
}

function updatePoolStats() {
  const el = document.getElementById('rlPoolInfo');
  if (!el) return;
  const count = RL.pool.length;
  if (count === 0) {
    el.innerHTML = `<span style="color:var(--red)"><i class="fas fa-exclamation-circle"></i> Sin niveles disponibles con estos filtros</span>`;
  } else if (count < 5) {
    el.innerHTML = `<span style="color:var(--gold)"><i class="fas fa-exclamation-triangle"></i> Solo ${count} nivel${count > 1 ? 'es' : ''} disponible${count > 1 ? 's' : ''}</span>`;
  } else {
    el.textContent = `${count} niveles disponibles`;
  }
}


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
  if (mode === 'complete' && num === 0) {
    return { ok: false, msg: 'Para completar un nivel necesitás al menos 1%.' };
  }
  return { ok: true, value: num };
}


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

  if (hint) {
    if (mode === 'fail') {
      hint.textContent = 'Podés ingresar cualquier porcentaje del 0 al 100.';
    } else {
      hint.textContent = 'Ingresá el porcentaje hasta el que llegaste (1–100).';
    }
  }

  if (input) {
    input.value = '';
    input.min = 0;
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



function initControls() {
  const goalSlider = document.getElementById('rlGoalSlider');

  RL.totalGoal = 100;

  const rangeMax = document.getElementById('rlRangeMax');
  if (rangeMax) {
    rangeMax.addEventListener('input', () => {
      RL.filterRange[1] = parseInt(rangeMax.value, 10);
      updateRangeDisplay();
      rebuildPool();
      updatePoolStats();
    });
  }

  initManualRange();

  document.getElementById('rlAllAredl')?.addEventListener('change', e => {
    RL.filterAllAredl = e.target.checked;
    const rangeEl = document.getElementById('rlRangeMax');
    if (RL.filterAllAredl) {
      RL.filterAredlOnly = false;
      const aredlOnlyCb = document.getElementById('rlAredlOnly');
      if (aredlOnlyCb) aredlOnlyCb.checked = false;
      const totalAredl = RL.aredlLevels.length + RL.levels.filter(l => l.aredl_position).length;
      RL.filterRange = [1, totalAredl || RL.filterRange[1]];
      if (rangeEl) { rangeEl.max = RL.filterRange[1]; rangeEl.value = RL.filterRange[1]; }
      showRlToast(`✓ AREDL activado — ${totalAredl} niveles disponibles`, 'success');
    } else {
      const totalUY = RL.levels.length || 1;
      RL.filterRange = [1, totalUY];
      if (rangeEl) { rangeEl.max = totalUY; rangeEl.value = totalUY; }
      showRlToast(`Lista UY — ${totalUY} niveles disponibles`, 'info');
    }
    syncManualFromSlider();
    updateRangeDisplay();
    rebuildPool();
    updatePoolStats();
    saveSession();
  });

  document.getElementById('rlAredlOnly')?.addEventListener('change', e => {
    RL.filterAredlOnly = e.target.checked;
    if (RL.filterAredlOnly) {
      RL.filterAllAredl = false;
      const allAredlCb = document.getElementById('rlAllAredl');
      if (allAredlCb) allAredlCb.checked = false;
    }
    rebuildPool();
    updatePoolStats();
    updateRangeDisplay();
    const count = RL.pool.length;
    showRlToast(
      RL.filterAredlOnly
        ? `Solo niveles en AREDL — ${count} disponibles`
        : `Filtro AREDL desactivado — ${count} disponibles`,
      'info'
    );
    saveSession();
  });

  document.getElementById('rlHideLevel')?.addEventListener('change', e => {
    RL.hideMode = e.target.checked;
    const pdfBtn = document.getElementById('rlBtnDownloadPdf');
    if (pdfBtn) pdfBtn.style.display = RL.hideMode ? 'none' : '';
    
    renderHistory();
    updateSessionStats(); 
    if (RL.current) renderCurrentLevel(RL.current);
    saveSession();
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
  document.getElementById('rlHistoryClear')?.addEventListener('click', async () => {
    if (!RL.session.length) return;
    const ok = await uiConfirm({
      title: '¿Limpiar el historial de esta sesión?',
      message: 'Se va a borrar todo el progreso de la ruleta actual. Esta acción no se puede deshacer.',
      type: 'warning',
      confirmText: 'Limpiar',
      cancelText: 'Cancelar'
    });
    if (!ok) return;
    resetSession();
    showRlToast('Historial de la sesión limpiado', 'success');
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

  
  document.addEventListener('keydown', e => {
    if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
    if (document.querySelector('.rl-pct-modal.open, .rl-finish-modal.open')) return;

    switch (e.key) {
      case ' ':
      case 'Enter':
        e.preventDefault();
        if (!RL.current && !RL.spinning && !isSessionEnded()) {
          document.getElementById('rlBtnSpin')?.click();
        }
        break;
      case 'c':
      case 'C':
        if (RL.current && !isSessionEnded()) document.getElementById('rlBtnComplete')?.click();
        break;
      case 'f':
      case 'F':
        if (RL.current && !isSessionEnded()) document.getElementById('rlBtnFail')?.click();
        break;
      case 's':
      case 'S':
        if (RL.current && !isSessionEnded()) document.getElementById('rlBtnSkip')?.click();
        break;
    }
  });

  updateProgressUI();
  updateButtons();
}

function isSessionEnded() {
  const completed = RL.session.filter(s => s.status === 'completed').length;
  return RL.surrendered
    || RL.session.some(s => s.status === 'failed')
    || completed >= RL.totalGoal;
}

function showSurrenderBanner() {
  let banner = document.getElementById('rlSurrenderBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'rlSurrenderBanner';
    banner.className = 'rl-surrender-banner';
    document.getElementById('rlSlotSection')?.prepend(banner);
  }
  banner.innerHTML = `
    <div class="rl-surrender-banner-left">
      <i class="fas fa-skull-crossbones"></i>
      <div>
        <div class="rl-surrender-title">Sesión terminada</div>
        <div class="rl-surrender-sub">Te rendiste. Para continuar necesitás limpiar e iniciar de nuevo.</div>
      </div>
    </div>
    <button class="rl-surrender-clear-btn" onclick="document.getElementById('rlHistoryClear')?.click()">
      <i class="fas fa-trash-alt"></i> Limpiar y empezar de nuevo
    </button>`;
  banner.style.display = '';
}

function hideSurrenderBanner() {
  const banner = document.getElementById('rlSurrenderBanner');
  if (banner) banner.style.display = 'none';
}

function _getSliderTotal() {
  if (RL.filterAllAredl) {
    const uyAredlPositions = new Set(
      RL.levels.filter(l => l.aredl_position).map(l => l.aredl_position)
    );
    const uniqueAredlCount = RL.aredlLevels.filter(
      l => l.aredl_position && !uyAredlPositions.has(l.aredl_position)
    ).length;
    const total = RL.levels.filter(l => l.aredl_position).length + uniqueAredlCount;
    return total || RL.levels.length || 1;
  }
  return RL.levels.length || parseInt(document.getElementById('rlRangeMax')?.max, 10) || 1;
}

function updateRangeDisplay() {
  const maxEl   = document.getElementById('rlRangeMaxVal');
  const total   = _getSliderTotal();
  const current = RL.filterRange[1];
  if (maxEl) {
    maxEl.textContent = current >= total
      ? `Full lista (${total} niveles)`
      : `#1 – #${current} de ${total}`;
  }
}


function syncManualFromSlider() {
  const manualMin = document.getElementById('rlManualMin');
  const manualMax = document.getElementById('rlManualMax');
  const total     = _getSliderTotal();
  const current   = RL.filterRange[1];
  if (manualMin) manualMin.value = RL.filterRange[0] || 1;
  if (manualMax) {
    manualMax.value       = current;
    manualMax.max         = total;
    manualMax.placeholder = String(total);
  }
}

function saveSession() {
  localStorage.setItem(RL_STORAGE_KEY, JSON.stringify({
    session:       RL.session,
    current:       RL.current,
    sessionActive: RL.sessionActive,
    surrendered:   RL.surrendered,
    totalGoal:     RL.totalGoal,
    hideMode:      RL.hideMode,
  }));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(RL_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);

    RL.session       = data.session || [];
    RL.current       = data.current || null;
    RL.sessionActive = !!data.sessionActive;
    RL.surrendered   = !!data.surrendered || RL.session.some(s => s.status === 'failed');

    const total = RL.levels.length || RL.filterRange[1];
    RL.totalGoal = 100;
    RL.filterRange     = [1, total];
    RL.filterAredlOnly = false;
    RL.filterAllAredl  = false;
    RL.hideMode = !!data.hideMode;
    const hideEl = document.getElementById('rlHideLevel');
    if (hideEl) hideEl.checked = RL.hideMode;
    const pdfBtn = document.getElementById('rlBtnDownloadPdf');
    if (pdfBtn) pdfBtn.style.display = RL.hideMode ? 'none' : '';

    const slider = document.getElementById('rlGoalSlider');
    const valEl  = document.getElementById('rlGoalVal');
    const range  = document.getElementById('rlRangeMax');
    if (slider) slider.value      = RL.totalGoal;
    if (valEl)  valEl.textContent = RL.totalGoal;
    if (range)  range.value       = RL.filterRange[1];

    const allAredlEl  = document.getElementById('rlAllAredl');
    const aredlOnlyEl = document.getElementById('rlAredlOnly');
    if (allAredlEl)  allAredlEl.checked  = false;
    if (aredlOnlyEl) aredlOnlyEl.checked = false;

    syncManualFromSlider();

    if (RL.surrendered) showSurrenderBanner();
  } catch (err) {
    console.error('Roulette save corrupted', err);
  }
}

function initManualRange() {
  const manualMin = document.getElementById('rlManualMin');
  const manualMax = document.getElementById('rlManualMax');
  const resetBtn  = document.getElementById('rlManualReset');
  const range     = document.getElementById('rlRangeMax');

  function applyManualRange() {
    const total  = _getSliderTotal();
    const rawMin = parseInt(manualMin?.value || '1', 10);
    const rawMax = parseInt(manualMax?.value || String(total), 10);
    const minVal = Math.max(1, isNaN(rawMin) ? 1 : rawMin);
    const maxVal = Math.min(total, isNaN(rawMax) ? total : rawMax);
    if (minVal > maxVal) {
      showRlToast('El mínimo no puede ser mayor al máximo', 'error');
      return;
    }
    RL.filterRange = [minVal, maxVal];
    if (range) { range.min = minVal; range.value = maxVal; }
    updateRangeDisplay();
    rebuildPool();
    updatePoolStats();
    saveSession();
    showRlToast(`Rango: #${minVal} – #${maxVal} (${RL.pool.length} niveles)`, 'success');
  }

  resetBtn?.addEventListener('click', () => {
    const total = _getSliderTotal();
    RL.filterRange = [1, total];
    if (range)     { range.min = 1; range.value = total; }
    if (manualMin)   manualMin.value = 1;
    if (manualMax) { manualMax.value = total; manualMax.max = total; }
    updateRangeDisplay();
    rebuildPool();
    updatePoolStats();
    saveSession();
    showRlToast('Rango restablecido a full lista', 'info');
  });

  [manualMin, manualMax].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') applyManualRange(); });
    inp.addEventListener('input', () => {
      const total  = _getSliderTotal();
      let rawMin   = parseInt(manualMin?.value || '1', 10);
      let rawMax   = parseInt(manualMax?.value || String(total), 10);
      if (!isNaN(rawMax) && rawMax > total) { manualMax.value = total; rawMax = total; }
      if (!isNaN(rawMin) && rawMin < 1)     { manualMin.value = 1;     rawMin = 1;     }
      const validMin = isNaN(rawMin) ? 1     : Math.max(1, Math.min(rawMin, total));
      const validMax = isNaN(rawMax) ? total : Math.max(validMin, Math.min(rawMax, total));
      if (range) { range.min = validMin; range.value = validMax; }
      RL.filterRange = [validMin, validMax];
      updateRangeDisplay();
      rebuildPool();
      updatePoolStats();
    });
  });

  range?.addEventListener('input', syncManualFromSlider);
  syncManualFromSlider();
}


function startSession() {
  RL.session = [];
  RL.sessionActive = true;
  RL._sessionWasHidden = RL.hideMode;
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
  RL.session       = [];
  RL.sessionActive = false;
  RL.surrendered   = false;
  RL.current       = null;
  hideSurrenderBanner();
  resetSlotDisplay();
  updateButtons();
  rebuildPool();
  renderHistory();
  updateProgressUI();
  updateSessionStats();
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

function checkAutoFinishModal() {
  if (isSessionEnded()) {
    const completed = RL.session.filter(s => s.status === 'completed').length;
    if (completed >= RL.totalGoal && !RL.surrendered) {
      RL.sessionActive = false;
      saveSession();
      setTimeout(showFinishModal, 600);
    }
  }
}


async function handleSpin() {
  if (isSessionEnded()) {
    const completed = RL.session.filter(s => s.status === 'completed').length;
    if (completed >= RL.totalGoal) {
      showRlToast('¡Ya completaste la ruleta! Iniciá una nueva sesión para seguir jugando.', 'success');
    } else if (RL.surrendered) {
      showRlToast('Te rendiste. Limpiá el historial para empezar de nuevo.', 'error');
      showSurrenderBanner();
    } else {
      showRlToast('La sesión terminó. Iniciá una nueva para jugar.', 'info');
    }
    return;
  }

  if (RL.spinning) return;

if (RL.current) {
  showRlToast(
    'Debés completar, rendirte o saltear el nivel actual antes de volver a elegir nivel.',
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

  const index = RL.session.findIndex(l => l.status === 'pending');
  if (index !== -1) RL.session.splice(index, 1);

  const chosen = RL.pool[Math.floor(Math.random() * RL.pool.length)];
  RL.current = chosen;
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
  const machine = document.getElementById('rlSlotMachine');
  if (machine) {
    machine.style.transition = 'opacity .15s ease';
    machine.style.opacity = '0.3';
  }
  return new Promise(r => setTimeout(() => {
    if (machine) {
      machine.style.opacity = '1';
    }
    r();
  }, 420));
}

function renderCurrentLevel(level) {
  const thumb    = level.thumb_url || null;
  const pos      = level.position || null;
  const aredlPos = level.aredl_position || null;
  const inList   = pos !== null;
  const pts      = !inList ? null
    : level.points != null ? level.points
    : (typeof computeAutoPoints === 'function' ? computeAutoPoints(pos) : null);
  const ytId     = level.youtube_id || extractYoutubeId(level.youtube_url);

  const thumbEl = document.getElementById('rlSlotThumb');
  if (thumbEl) {
    thumbEl.src = thumb || '';
    thumbEl.style.display = thumb ? '' : 'none';
    if (RL.hideMode) {
      thumbEl.style.display = 'none';
      let blindEl = document.getElementById('rlBlindOverlay');
      if (!blindEl) {
        blindEl = document.createElement('div');
        blindEl.id = 'rlBlindOverlay';
        blindEl.className = 'rl-blind-overlay';
        thumbEl.parentElement.appendChild(blindEl);
      }
      const levelId = level.aredl_level_id || level.gd_level_id;
      blindEl.innerHTML = `
        <div class="rl-blind-content">
          <i class="fas fa-eye-slash"></i>
          <span>BLIND MODE</span>
          <span class="rl-blind-sub">Pegá la ID en GD para descubrir el nivel</span>
          ${levelId ? `
            <button class="rl-slot-chip rl-copy-id-btn rl-blind-chip" onclick="copyLevelId('${levelId}')" style="margin-top:.75rem">
              <i class="fas fa-copy"></i> Copiar ID ${levelId}
            </button>
          ` : '<span class="rl-blind-sub" style="margin-top:.5rem"><i class="fas fa-exclamation-triangle"></i> Sin ID disponible</span>'}
        </div>`;
      blindEl.style.display = 'flex';
    } else {
      thumbEl.className = 'rl-slot-thumb';
      thumbEl.style.display = '';
      const blindEl = document.getElementById('rlBlindOverlay');
      if (blindEl) blindEl.style.display = 'none';
    }
  }

  const infoEl = document.getElementById('rlSlotInfo');
  if (infoEl) {
    infoEl.innerHTML = RL.hideMode ? `
      <div class="rl-slot-pos-badge rl-blind-badge">
        <i class="fas fa-eye-slash"></i> Modo ciego activo
      </div>
      <div class="rl-slot-name rl-blind-name-pulse">??? NIVEL OCULTO ???</div>
      <div class="rl-slot-meta">
        <span class="rl-slot-chip rl-blind-chip"><i class="fas fa-lock"></i> Completá el nivel para revelar</span>
        ${level.aredl_level_id || level.gd_level_id
          ? `<button class="rl-slot-chip rl-copy-id-btn rl-blind-chip" onclick="copyLevelId('${level.aredl_level_id || level.gd_level_id}')">
               <i class="fas fa-copy"></i> Copiar ID ${level.aredl_level_id || level.gd_level_id}
             </button>`
          : '<span class="rl-slot-chip rl-blind-chip" style="opacity:.5"><i class="fas fa-exclamation-triangle"></i> Sin ID disponible</span>'
        }
      </div>` : `
      <div class="rl-slot-pos-badge${!inList ? ' rl-slot-pos-badge-notlisted' : ''}">
        ${inList ? `<i class="fas fa-list"></i> #${pos} en la lista` : `<i class="fas fa-globe"></i> No está en la lista UY`}
        ${aredlPos ? `<span class="rl-slot-aredl-sub">· AREDL #${aredlPos}</span>` : ''}
      </div>
      <div class="rl-slot-name">${esc(level.name)}</div>
      <div class="rl-slot-meta">
        ${pts !== null
          ? `<span class="rl-slot-chip"><i class="fas fa-star" style="color:var(--gold)"></i>${pts.toLocaleString()} pts</span>`
          : `<span class="rl-slot-chip rl-slot-chip-nopts"><i class="fas fa-minus-circle"></i> Sin puntos</span>`
        }
        ${level.victors?.length ? `
          <button class="rl-slot-chip rl-victors-chip" onclick="openRlVictorsPopup()" style="cursor:pointer;border-color:rgba(124,58,237,.4);color:var(--violet)">
            <i class="fas fa-users"></i> ${level.victors.length} victor${level.victors.length !== 1 ? 's' : ''}
            <i class="fas fa-chevron-right" style="font-size:.55rem;opacity:.6"></i>
          </button>` : ''}
        ${level.aredl_level_id || level.gd_level_id ? `
          <button class="rl-slot-chip rl-copy-id-btn" onclick="copyLevelId('${level.aredl_level_id || level.gd_level_id}')">
            <i class="fas fa-copy"></i> ID ${level.aredl_level_id || level.gd_level_id}
          </button>` : ''}
        ${ytId ? `<a href="https://youtube.com/watch?v=${ytId}" target="_blank" class="rl-slot-chip" style="color:var(--red);text-decoration:none;border-color:rgba(244,63,94,.3)"><i class="fab fa-youtube"></i> Ver showcase</a>` : ''}
      </div>`;
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
  saveSession();
}

function resetSlotDisplay() {
  const machine = document.getElementById('rlSlotMachine');
  machine?.classList.remove('spinning', 'revealed');
  const infoEl = document.getElementById('rlSlotInfo');
  if (infoEl) infoEl.innerHTML = `
    <div class="rl-slot-pos-badge"><i class="fas fa-dice"></i> ¿Qué nivel te toca?</div>
    <div class="rl-slot-name">Presioná ELEGIR NIVEL</div>
    <div class="rl-slot-meta"></div>
  `;
  const thumbEl = document.getElementById('rlSlotThumb');
  if (thumbEl) { thumbEl.src = ''; thumbEl.style.display = 'none'; }
}


function _getEffectiveCompletedCount() {
  return RL.session.filter(s => s.status === 'completed').length;
}

function finalizeComplete(percentage) {
  if (isSessionEnded()) return;
  if (!RL.current) return;

  const entry = RL.session.find(s => s.level.id === RL.current.id);
  if (!entry) {
    showRlToast('Error: no se encontró el nivel en la sesión', 'error');
    return;
  }

  entry.status     = 'completed';
  entry.percentage = percentage;
  entry.timestamp  = Date.now();

  const completedCount = _getEffectiveCompletedCount();
  const isFull  = percentage >= 100;

  let toastMsg = isFull
    ? `¡${RL.current.name} completado al 100%! 🔥`
    : `${RL.current.name} — ${percentage}% registrado ✓`;

  if (completedCount < RL.totalGoal) {
    toastMsg += ` (${completedCount}/${RL.totalGoal})`;
  }

  showRlToast(toastMsg, 'success');
  if (isFull) launchConfetti();

  RL.current = null;

  rebuildPool();
  renderHistory();
  updateProgressUI();
  updateSessionStats();
  resetSlotDisplay();
  updateButtons();
  saveSession();

  if (completedCount >= RL.totalGoal) {
    RL.sessionActive = false;
    RL.surrendered = false;
    saveSession();
    setTimeout(showFinishModal, 800);
    return;
  }
}

function finalizeFail(percentage) {
  if (!RL.current || isSessionEnded()) return;

  const entry = RL.session.find(s => s.level.id === RL.current.id);
  if (entry) {
    entry.status = 'failed';
    entry.percentage = percentage;
    entry.timestamp = Date.now();
  }

  RL.surrendered   = true;
  RL.sessionActive = false;

  if (RL.revealHidden) {
    RL.revealHidden = false;
    const hideEl = document.getElementById('rlHideLevel');
    if (hideEl) hideEl.checked = false;
  }

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
  saveSession();
  resetSlotDisplay();
  updateButtons();
}


function updateProgressUI() {
  const completed = _getEffectiveCompletedCount();
  const skipped   = RL.session.filter(s => s.status === 'skipped').length;
  const failed    = RL.session.filter(s => s.status === 'failed').length;
  const total     = RL.totalGoal;
  const pct       = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

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
  if (pdfBtn) pdfBtn.disabled = false;
  if (pdfBtn) pdfBtn.style.display = '';

  const detail = document.getElementById('rlStatsDetail');
  if (!detail) return;

  if (!RL.session.length) {
    detail.innerHTML = '<p class="rl-stats-empty">Girá la ruleta para empezar a registrar estadísticas.</p>';
    return;
  }

  detail.innerHTML = RL.session.map((entry, i) => {
    const num      = RL.session.length - i;
    const level    = entry.level;
    const pos      = level.position || '?';
    const status   = statusLabel(entry);
    const pctStr   = entry.percentage != null ? ` · ${entry.percentage}%` : '';
    const isDone   = entry.status === 'completed' || entry.status === 'failed' || entry.status === 'skipped';
    
    const blind    = RL.hideMode && !isDone;
    
    return `<div class="rl-stats-row">
      <span class="rl-stats-row-num">${num}</span>
      <span class="rl-stats-row-name">${blind ? '<i class="fas fa-eye-slash" style="opacity:.4;margin-right:.25rem"></i>???' : esc(level.name)}</span>
      <span class="rl-stats-row-pos">${blind ? '—' : '#' + pos}</span>
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
    const level   = entry.level;
    const thumb   = level.thumb_url || null;
    const ytId    = level.youtube_id || extractYoutubeId(level.youtube_url);
    const inList  = level.position != null && !isNaN(level.position);
    const pos     = inList ? level.position : null;
    const pts     = inList
      ? (level.points != null ? level.points : (typeof computeAutoPoints === 'function' ? computeAutoPoints(pos) : null))
      : null;
    const num     = RL.session.length - i;
    const posLabel = inList ? `#${pos} en la lista` : 'No está en la lista UY';
    const ptsLabel = pts != null ? `${pts.toLocaleString()} pts` : 'Sin puntos';

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

    const isCompleted = entry.status === 'completed' || entry.status === 'failed' || entry.status === 'skipped';
    
    const blind = RL.hideMode && !isCompleted;
    
    return `
      <div class="rl-history-item${blind ? ' rl-history-blind' : ''}">
        <span class="rl-history-num">${num}</span>
        ${blind
          ? `<div class="rl-history-thumb rl-history-thumb-blind"><i class="fas fa-eye-slash"></i></div>`
          : thumb
            ? `<img class="rl-history-thumb" src="${thumb}" alt="" onerror="this.className='rl-history-thumb rl-history-thumb-ph';this.src='';">`
            : `<div class="rl-history-thumb rl-history-thumb-ph"></div>`
        }
        <div class="rl-history-info">
          <div class="rl-history-name">${blind ? '<i class="fas fa-eye-slash" style="opacity:.4;margin-right:.3rem"></i> ???' : esc(level.name)}</div>
          ${!blind ? `<div class="rl-history-meta">
            <span>${posLabel}</span>
            <span>·</span>
            <span>${ptsLabel}</span>
            ${level.aredl_position ? `<span>· AREDL #${level.aredl_position}</span>` : ''}
          </div>` : '<div class="rl-history-meta" style="color:var(--text-dim);font-style:italic">Nivel oculto — completá para revelar</div>'}
        </div>
        ${statusHtml}
        ${!blind && ytId && entry.status !== 'pending'
          ? `<a href="https://youtube.com/watch?v=${ytId}" target="_blank" class="rl-history-yt-btn">
               <i class="fab fa-youtube"></i> Ver
             </a>`
          : ''
        }
      </div>`;
  }).join('');
}


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
    spinBtn.querySelector('.spin-text').textContent = ended ? 'Sesión terminada' : (RL.spinning ? 'Seleccionando...' : 'Elegir nivel');
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


function showFinishModal() {
  const modal = document.getElementById('rlFinishModal');
  if (!modal) return;

  const completed = RL.session.filter(s => s.status === 'completed').length;
  const failed    = RL.session.filter(s => s.status === 'failed').length;
  const skipped   = RL.session.filter(s => s.status === 'skipped').length;
  const total     = RL.session.filter(s => s.status !== 'pending').length;
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0;

  const titleEl = modal.querySelector('.rl-finish-title');
  const subEl   = modal.querySelector('.rl-finish-sub');
  const trophy  = modal.querySelector('.rl-finish-trophy');

  if (completed >= RL.totalGoal) {
    if (titleEl) titleEl.textContent = '🏆 ¡RULETA COMPLETADA! 🏆';
    if (subEl) subEl.textContent = `Completaste ${completed} niveles — ¡desafío superado!`;
    if (trophy) trophy.textContent = '🏆';
  } else {
    if (titleEl) titleEl.textContent = '😵 SESIÓN TERMINADA';
    if (subEl) subEl.textContent = `Completaste ${completed} de ${RL.totalGoal} niveles`;
    if (trophy) trophy.textContent = '💀';
  }

  document.getElementById('rlFinishCompleted').textContent = completed;
  document.getElementById('rlFinishFailed').textContent    = failed;
  document.getElementById('rlFinishSkipped').textContent   = skipped;
  document.getElementById('rlFinishPct').textContent       = pct + '%';

  modal.classList.add('open');
  launchConfetti();
}

  async function downloadSessionPdf() {
  if (!RL.session.length) {
    showRlToast('No hay datos de sesión para exportar', 'error');
    return;
  }
  if (RL.revealHidden) {
    const ok = await uiConfirm({
      title: 'Modo ciego activo',
      message: 'Tenés el modo ciego activado. Si descargás el PDF vas a ver los niveles ocultos. ¿Desactivar modo ciego y continuar?',
      type: 'warning',
      confirmText: 'Desactivar y descargar',
      cancelText: 'Cancelar',
    });
    if (!ok) return;
    RL.revealHidden = false;
    const hideEl = document.getElementById('rlHideLevel');
    if (hideEl) hideEl.checked = false;
    renderHistory();
  }
  if (RL.hideMode) {
    showRlToast('Desactivá "Ocultar nivel" para poder descargar el PDF', 'error');
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
  const ML   = 14;   
  const MR   = 14;   
  const CW   = W - ML - MR;

  
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

  
  setFill(...C.bg);
  rect(0, 0, W, H);

  
  setFill(...C.violet);
  rect(0, 0, W * .6, 32);
  setFill(...C.red);
  rect(W * .4, 0, W * .6, 32);
  
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

  
  setFill(...C.violet);
  rect(0, 32, W, 1);

  let y = 44;

  
  if (RL._sessionWasHidden) {
    setFill(124, 58, 237);
    roundRect(W - MR - 52, 5, 52, 12, 2);
    setFont('bold', 7);
    setTxt(...C.white);
    doc.text('MODO OCULTO', W - MR - 26, 13, { align: 'center' });
  }

  
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

  
  setFill(...C.bg2);
  roundRect(ML, y, CW, 8, 2);
  setFont('normal', 7);
  setTxt(...C.textDim);
  const configStr = `Rango: ${document.getElementById('rlRangeMaxVal')?.textContent || '—'}  ·  Solo AREDL: ${RL.filterAredlOnly ? 'Sí' : 'No'}  ·  Pool disponible: ${RL.pool.length} niveles`;
  doc.text(configStr, W / 2, y + 5, { align: 'center' });
  y += 14;

  
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

  
  const visibleEntries = RL.session.filter(s => s.status !== 'pending');

  visibleEntries.forEach((entry, idx) => {
    if (y > H - 20) {
      
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

    
    setFill(...(isEven ? C.bg2 : C.bg3));
    rect(ML, y, CW, rowH);

    
    let statusColor = C.textDim;
    let statusStr   = '—';
    if (entry.status === 'completed') { statusColor = C.green;  statusStr = 'Completado'; }
    if (entry.status === 'failed')    { statusColor = C.red;    statusStr = 'Rendido';    }
    if (entry.status === 'skipped')   { statusColor = C.amber;  statusStr = 'Salteado';   }

    setFill(...statusColor);
    rect(ML, y, 1.5, rowH);

    const level  = entry.level;
    const pos    = level.position || '?';
    const pts    = level.points != null ? level.points : (typeof computeAutoPoints === 'function' ? computeAutoPoints(pos) : 1);
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

  
  y += 8;
  if (y > H - 22) {
    doc.addPage();
    setFill(...C.bg);
    rect(0, 0, W, H);
    y = 15;
  }

  
  setFill(...C.border);
  rect(ML, y, CW, 0.5);
  y += 5;

  setFont('bold', 8);
  setTxt(...C.violet);
  doc.text('Uruguay Demonlist', W / 2, y, { align: 'center' });

  
  setFont('normal', 7);
  setTxt(...C.textDim);
  doc.text(`Página ${doc.internal.getCurrentPageInfo().pageNumber}`, W - MR, H - 8, { align: 'right' });

  doc.save(`uy-demonlist-roulette-${Date.now()}.pdf`);
  showRlToast('📄 PDF descargado ✓', 'success');
}


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


function extractYoutubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/)([^&\s]{11})/);
  return m ? m[1] : null;
}

function copyLevelId(id) {
  navigator.clipboard.writeText(id).then(() => {
    showRlToast(
      `ID ${id} copiada al portapapeles`,
      'success'
    );
    
    
    const buttons = document.querySelectorAll('.rl-copy-id-btn');
    buttons.forEach(btn => {
      if (btn.textContent.includes(id)) {
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 500);
      }
    });
  }).catch(err => {
    console.error('Error al copiar ID:', err);
    showRlToast('Error al copiar ID', 'error');
  });
}


function openRlVictorsPopup() {
  const level = RL.current;
  if (!level?.victors?.length) return;

  document.getElementById('rlVictorsPopup')?.remove();

  const victors = level.victors;
  const pos     = level.position;
  const pts     = level.points != null ? level.points
    : (typeof computeAutoPoints === 'function' ? computeAutoPoints(pos) : null);

  
  const levelShowcaseId = level.youtube_id || extractYoutubeId(level.youtube_url);

  const popup = document.createElement('div');
  popup.id = 'rlVictorsPopup';
  popup.className = 'rl-victors-popup-overlay';
  popup.innerHTML = `
    <div class="rl-victors-popup" role="dialog" aria-modal="true">
      <div class="rl-victors-popup-header">
        <div class="rl-victors-popup-title-wrap">
          <div class="rl-victors-popup-icon"><i class="fas fa-users"></i></div>
          <div class="rl-victors-popup-title-info">
            <div class="rl-victors-popup-level">${esc(level.name)}</div>
            <div class="rl-victors-popup-sub">
              ${pos ? `<span><i class="fas fa-list-ol"></i> #${pos}</span>` : ''}
              ${pts ? `<span><i class="fas fa-star"></i> ${pts.toLocaleString()} pts</span>` : ''}
              <span><i class="fas fa-flag-checkered"></i> ${victors.length} completion${victors.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
        <button class="rl-victors-popup-close" onclick="closeRlVictorsPopup()" aria-label="Cerrar">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div class="rl-victors-popup-list">
        ${victors.map((v, i) => {
          const ownYtId = v.videoId || extractYoutubeId(v.videoUrl);
          const ytId    = ownYtId || levelShowcaseId;
          const isFirst = i === 0;
          const avatarUrl = v.avatarUrl || null;
          const initials  = (v.name || '?')[0].toUpperCase();

          return `
            <div class="rl-victors-popup-item${isFirst ? ' rl-victor-first' : ''}">
              <div class="rl-victor-rank ${isFirst ? 'rl-victor-rank-gold' : ''}">
                ${isFirst ? '<i class="fas fa-crown"></i>' : `<span>${i + 1}</span>`}
              </div>
              <div class="rl-victor-avatar-wrap">
                ${avatarUrl
                  ? `<img class="rl-victor-avatar" src="${esc(avatarUrl)}" alt="${esc(v.name)}"
                       onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                  : ''
                }
                <div class="rl-victor-avatar-ph" style="${avatarUrl ? 'display:none' : ''}">${initials}</div>
              </div>
              <div class="rl-victor-name-wrap">
                <span class="rl-victor-name">${esc(v.name)}</span>
                ${isFirst ? `<span class="rl-victor-first-badge"><i class="fas fa-trophy"></i> Primer completion</span>` : ''}
              </div>
              ${ytId
                ? `<a href="https://youtube.com/watch?v=${ytId}" target="_blank" rel="noopener"
                     class="rl-victor-video-btn" onclick="event.stopPropagation()">
                     <i class="fab fa-youtube"></i> Ver
                   </a>`
                : `<span class="rl-victor-novideo"><i class="fas fa-video-slash"></i></span>`
              }
            </div>`;
        }).join('')}
      </div>

      <div class="rl-victors-popup-footer">
        <button class="rl-victors-popup-close-btn" onclick="closeRlVictorsPopup()">
          <i class="fas fa-times"></i> Cerrar
        </button>
      </div>
    </div>`;

  document.body.appendChild(popup);
  requestAnimationFrame(() => popup.classList.add('open'));

  popup.addEventListener('pointerdown', e => {
    if (e.target === popup) closeRlVictorsPopup();
  });
  document.addEventListener('keydown', _rlVictorsEsc);
}

function _rlVictorsEsc(e) {
  if (e.key === 'Escape') { closeRlVictorsPopup(); document.removeEventListener('keydown', _rlVictorsEsc); }
}

function closeRlVictorsPopup() {
  const popup = document.getElementById('rlVictorsPopup');
  if (!popup) return;
  popup.classList.remove('open');
  setTimeout(() => popup.remove(), 280);
  document.removeEventListener('keydown', _rlVictorsEsc);
}
window.openRlVictorsPopup  = openRlVictorsPopup;
window.closeRlVictorsPopup = closeRlVictorsPopup;

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
