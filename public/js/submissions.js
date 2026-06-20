// =============================================
// SUBMISSIONS.JS — UY Demonlist v2
// =============================================
(function () {
  'use strict';

  let selectedLevel = null; // { name, position, aredl_position, youtube_id }
  let rawRequired   = false;

  document.addEventListener('DOMContentLoaded', () => {
    const form          = document.getElementById('submissionsForm');
    const notLoggedIn   = document.getElementById('subNotLoggedIn');
    const noGd          = document.getElementById('subNoGd');
    const levelInput    = document.getElementById('levelName');
    const suggestions   = document.getElementById('levelSuggestions');
    const levelClear    = document.getElementById('subLevelClear');
    const levelSelected = document.getElementById('subLevelSelected');
    const levelField    = document.getElementById('subLevelSearchWrap');
    const selChange     = document.getElementById('subSelChange');
    const ytInput       = document.getElementById('youtubeLink');
    const rawInput      = document.getElementById('rawLink');
    const preview       = document.getElementById('videoPreview');
    const previewThumb  = document.getElementById('previewThumbnail');
    const submitBtn     = document.getElementById('subSubmitBtn');
    const rawHint       = document.getElementById('rawRequiredHint');
    const rawReqLabel   = document.getElementById('rawReqLabel');
    const rawOptLabel   = document.getElementById('rawOptLabel');

    if (!form) return;

    // ─── Decidir qué mostrar según sesión ───
    function applySession() {
  const user = window.currentUser;

  if (!user) {
    notLoggedIn.style.display = '';
    noGd.style.display        = 'none';
    form.style.display        = 'none';

    const loginBtn =
      notLoggedIn.querySelector('button') ||
      notLoggedIn.querySelector('a');

    if (loginBtn) {
      loginBtn.onclick = () => {
        window.location.href = '/api/auth/callback/discord';
      };
    }

    return;
  }
      if (!user.gdUsername) {
        notLoggedIn.style.display = 'none';
        noGd.style.display        = '';
        form.style.display        = 'none';
        return;
      }
      notLoggedIn.style.display = 'none';
      noGd.style.display        = 'none';
      form.style.display        = '';

      // Mostrar quién está enviando
      const avatar    = document.getElementById('subPlayerAvatar');
      const nameEl    = document.getElementById('subPlayerName');
      const gdEl      = document.getElementById('subPlayerGd');
      nameEl.textContent = user.name || user.gdUsername;
      gdEl.textContent   = user.gdUsername ? `GD: ${user.gdUsername}` : '';
      if (user.image) {
        avatar.innerHTML = `<img src="${user.image}" alt="">`;
      } else {
        const initials = (user.name || '?').slice(0, 2).toUpperCase();
        avatar.innerHTML = `<span>${initials}</span>`;
        avatar.style.setProperty('--av-color', playerColorFromName(user.name || ''));
      }
    }

    // Esperar a que currentUser esté disponible
    if (window.currentUser !== undefined) {
      applySession();
    } else {
      const interval = setInterval(() => {
        if (window.currentUser !== undefined) {
          clearInterval(interval);
          applySession();
        }
      }, 100);
    }

    // ─── Autocomplete de niveles ───
    let debounce;
    levelInput?.addEventListener('input', () => {
      const q = levelInput.value.trim();
      levelClear.style.display = q ? '' : 'none';
      clearTimeout(debounce);
      debounce = setTimeout(() => renderLevelSuggestions(q), 120);
    });

    // QOL: si el usuario clickea afuera por error y vuelve a enfocar el input
    // con texto ya escrito, reaparecen las sugerencias sin tener que reescribir.
    levelInput?.addEventListener('focus', () => {
      const q = levelInput.value.trim();
      if (q.length >= 1 && !selectedLevel) renderLevelSuggestions(q);
    });

    levelClear?.addEventListener('click', () => {
      levelInput.value = '';
      levelClear.style.display = 'none';
      hideSuggestions();
      selectedLevel = null;
    });

    selChange?.addEventListener('click', () => {
      selectedLevel = null;
      levelSelected.style.display = 'none';
      levelField.style.display    = '';
      levelInput.value            = '';
      levelClear.style.display    = 'none';
      levelInput.focus();
      updateRawRequirement(null);
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('#subLevelSearchWrap') && !e.target.closest('#levelSuggestions')) hideSuggestions();
    });

    // Cerrar con Escape (sin tocar el scroll: el dropdown ahora tiene su propio
    // scroll interno y debe permanecer visible mientras el usuario scrollea la página).
    levelInput?.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        hideSuggestions();
        return;
      }
      const items = Array.from(suggestions.querySelectorAll('.sub-sug-item'));
      if (!items.length || !suggestions.classList.contains('open')) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        let idx = items.findIndex(it => it.classList.contains('active'));
        idx = e.key === 'ArrowDown'
          ? Math.min(idx + 1, items.length - 1)
          : Math.max(idx - 1, 0);
        items.forEach(it => it.classList.remove('active'));
        const target = items[idx];
        target.classList.add('active');
        target.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        const active = items.find(it => it.classList.contains('active')) || items[0];
        if (active) {
          e.preventDefault();
          active.dispatchEvent(new Event('click'));
        }
      }
    });

    function scoreMatch(name, ql) {
      if (name === ql) return 1000;
      if (name.startsWith(ql)) return 900;
      if (name.includes(ql)) return 700;
      const words = name.split(/\s+/);
      if (words.some(w => w === ql)) return 600;
      if (words.some(w => w.startsWith(ql))) return 500;
      if (words.some(w => w.includes(ql))) return 300;
      // fuzzy: todos los caracteres de ql aparecen en orden en name
      let qi = 0;
      for (let i = 0; i < name.length && qi < ql.length; i++) {
        if (name[i] === ql[qi]) qi++;
      }
      if (qi === ql.length) return 100;
      return 0;
    }

    function renderLevelSuggestions(q) {
      if (!q || q.length < 1) { hideSuggestions(); return; }
      const levels = typeof getLevelsData === 'function' ? getLevelsData() : [];
      const ql = q.toLowerCase().trim();

      // Niveles que YA están en nuestra lista
      const listHits = levels
        .map(level => ({ ...level, score: scoreMatch((level.name || '').toLowerCase(), ql) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 25);

      // Niveles de AREDL que NO están en nuestra lista todavía (sugerencia para agregar nuevo)
      const aredlMapData = window.aredlMap || {};
      const listNames    = new Set(levels.map(l => l.name?.toLowerCase()));
      const aredlHits = Object.entries(aredlMapData)
        .map(([name, info]) => ({ score: scoreMatch(name, ql), name, info }))
        .filter(x => x.score > 0 && !listNames.has(x.name))
        .sort((a, b) => b.score - a.score)
        .slice(0, 25)
        .map(x => ({ name: x.info.originalName || x.name, ...x.info }));

      if (!listHits.length && !aredlHits.length) {
        suggestions.innerHTML = `<div class="sub-sug-empty"><i class="fas fa-search"></i> Sin resultados</div>`;
        suggestions.classList.add('open');
        return;
      }

      const listHtml = listHits.map(l => {
        const aredlPos = l.aredl_position ? `<span class="sub-sug-aredl"><i class="fas fa-globe"></i> AREDL #${l.aredl_position}</span>` : '';
        const thumb    = l.youtube_id
          ? `<img class="sub-sug-thumb" src="https://img.youtube.com/vi/${l.youtube_id}/default.jpg" alt="">`
          : `<div class="sub-sug-thumb sub-sug-thumb-ph"><i class="fas fa-skull"></i></div>`;
        return `
          <div class="sub-sug-item" data-name="${escHtml(l.name)}" data-pos="${l.position}" data-aredl="${l.aredl_position || ''}" data-ytid="${l.youtube_id || ''}" data-new="0">
            ${thumb}
            <div class="sub-sug-info">
              <span class="sub-sug-name">${highlightMatch(escHtml(l.name), q)}</span>
              <div class="sub-sug-meta">
                <span class="sub-sug-pos"><i class="fas fa-trophy"></i> #${l.position} en la lista</span>
                ${aredlPos}
              </div>
            </div>
          </div>`;
      }).join('');

      const aredlHtml = aredlHits.map(a => `
        <div class="sub-sug-item sub-sug-new" data-name="${escHtml(a.name)}" data-pos="" data-aredl="${a.position || ''}" data-ytid="" data-new="1">
          <div class="sub-sug-thumb sub-sug-thumb-ph"><i class="fas fa-plus"></i></div>
          <div class="sub-sug-info">
            <span class="sub-sug-name">${highlightMatch(escHtml(a.name), q)}</span>
            <div class="sub-sug-meta">
              <span class="sub-sug-pos sub-sug-pos-new"><i class="fas fa-globe"></i> AREDL #${a.position || '?'} — no está en la lista UY</span>
            </div>
          </div>
        </div>`).join('');

      suggestions.innerHTML = listHtml + aredlHtml;
      suggestions.classList.add('open');
      suggestions.scrollTop = 0;
      suggestions.querySelector('.sub-sug-item')?.classList.add('active');

      suggestions.querySelectorAll('.sub-sug-item').forEach(item => {
        item.addEventListener('mousedown', e => { e.preventDefault(); }); // evita que el blur cierre antes del click
        item.addEventListener('mouseenter', () => {
          suggestions.querySelectorAll('.sub-sug-item.active').forEach(it => it.classList.remove('active'));
          item.classList.add('active');
        });
        item.addEventListener('click', () => selectLevel({
          name:           item.dataset.name,
          position:       item.dataset.pos ? parseInt(item.dataset.pos) : null,
          aredl_position: parseInt(item.dataset.aredl) || null,
          youtube_id:     item.dataset.ytid || null,
          isNew:          item.dataset.new === '1',
        }));
      });
    }

    function selectLevel(level) {
      selectedLevel = level;
      hideSuggestions();
      levelField.style.display    = 'none';
      levelSelected.style.display = '';

      document.getElementById('subSelName').textContent = level.name;
      document.getElementById('subSelPos').textContent  = level.isNew
        ? 'Nivel nuevo — se agregará a la lista al aprobarse'
        : `#${level.position} en la lista`;

      const aredlEl = document.getElementById('subSelAredl');
      if (level.aredl_position) {
        aredlEl.textContent    = `AREDL #${level.aredl_position}`;
        aredlEl.style.display  = '';
      } else {
        aredlEl.style.display  = 'none';
      }

      const thumb = document.getElementById('subSelThumb');
      if (level.youtube_id) {
        thumb.src = `https://img.youtube.com/vi/${level.youtube_id}/mqdefault.jpg`;
        thumb.style.display = '';
      } else {
        thumb.style.display = 'none';
      }

      updateRawRequirement(level);
      document.getElementById('errLevelName').textContent = '';
    }

    function updateRawRequirement(level) {
      rawRequired = level?.aredl_position && level.aredl_position <= 400;
      rawHint.style.display   = rawRequired ? '' : 'none';
      rawReqLabel.style.display = rawRequired ? '' : 'none';
      rawOptLabel.style.display = rawRequired ? 'none' : '';
      if (rawRequired) rawInput?.setAttribute('required', '');
      else             rawInput?.removeAttribute('required');
    }

    function hideSuggestions() {
      suggestions.classList.remove('open');
      suggestions.innerHTML = '';
    }

    function highlightMatch(text, q) {
      const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      return text.replace(re, '<mark>$1</mark>');
    }

    // ─── YouTube preview ───
    ytInput?.addEventListener('input', () => {
      const id = extractYouTubeId(ytInput.value.trim());
      if (id && preview && previewThumb) {
        previewThumb.src      = `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
        preview.style.display = 'flex';
      } else if (preview) {
        preview.style.display = 'none';
      }
    });

    // ─── Submit ───
    form.addEventListener('submit', async e => {
      e.preventDefault();
      clearErrors();
      let valid = true;

      if (!selectedLevel) {
        document.getElementById('errLevelName').textContent = 'Seleccioná un nivel de la lista o uno nuevo de AREDL';
        levelInput?.focus();
        valid = false;
      }

      const ytUrl = ytInput?.value.trim();
      if (!ytUrl || !extractYouTubeId(ytUrl)) {
        document.getElementById('errYoutube').textContent = 'Ingresá un link de YouTube válido';
        valid = false;
      }

      if (rawRequired) {
        const raw = rawInput?.value.trim();
        if (!raw || !raw.startsWith('http')) {
          document.getElementById('errRaw').textContent = 'El raw footage es obligatorio para este nivel';
          rawInput?.focus();
          valid = false;
        }
      }

      if (!valid) return;

      const user = window.currentUser;
      if (!user?.id) {
        if (typeof showToast === 'function') showToast('Debes iniciar sesión', 'error');
        return;
      }

      submitBtn.disabled   = true;
      submitBtn.innerHTML  = '<i class="fas fa-spinner fa-spin"></i> Enviando…';

      try {
        const API = typeof API_BASE !== 'undefined' ? API_BASE : 'http://localhost:3001/api';
        const res = await fetch(`${API}/submissions`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            userId:        user.id,
            levelName:     selectedLevel.name,
            youtubeLink:   ytUrl,
            rawLink:       rawInput?.value.trim() || null,
            notes:         document.getElementById('notes')?.value.trim() || null,
            levelPosition: selectedLevel.isNew ? null : selectedLevel.position,
            aredlPosition: selectedLevel.aredl_position || null,
            isNewLevel:    !!selectedLevel.isNew,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (err.error === 'duplicate_pending') {
            await uiAlert({
              title: '¡Ya enviaste este nivel!',
              message: err.message,
              type: 'warning',
              confirmText: 'Entendido',
            });
            return;
          }
          throw new Error(err.error || 'Error del servidor');
        }

        form.reset();
        selectedLevel = null;
        if (preview) preview.style.display = 'none';
        levelSelected.style.display = 'none';
        levelField.style.display    = '';
        rawHint.style.display       = 'none';
        rawReqLabel.style.display   = 'none';
        rawOptLabel.style.display   = '';
        if (typeof showToast === 'function')
          showToast('¡Submission enviada! Los mods la revisarán pronto.', 'success');

      } catch (err) {
        if (typeof showToast === 'function') showToast('Error: ' + err.message, 'error');
      } finally {
        submitBtn.disabled  = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Submission';
      }
    });

    function clearErrors() {
      ['errLevelName', 'errYoutube', 'errRaw'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
      });
    }

    function extractYouTubeId(url) {
      if (!url) return null;
      const m = url.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/);
      return m ? m[1] : null;
    }

    function escHtml(s) {
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function playerColorFromName(name) {
      let hash = 0;
      for (let c of (name || '')) hash = c.charCodeAt(0) + ((hash << 5) - hash);
      return `hsl(${Math.abs(hash) % 360}, 55%, 35%)`;
    }
  });
})();