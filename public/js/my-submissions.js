// =============================================
// MY-SUBMISSIONS.JS — Historial de submissions del usuario
// Auto-refresh en tiempo real + modal de detalle de solo lectura
// =============================================
(function () {
  'use strict';

  let mySubsCache = [];
  let pollTimer    = null;
  const POLL_MS    = 8000;

  document.addEventListener('DOMContentLoaded', () => {
    waitForUser(() => {
      renderMySubs();
      startPolling();
    });
  });

  function waitForUser(cb) {
    if (window.currentUser !== undefined) { cb(); return; }
    const iv = setInterval(() => {
      if (window.currentUser !== undefined) { clearInterval(iv); cb(); }
    }, 150);
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (window.currentUser?.id) fetchMySubs();
    }, POLL_MS);
  }

  async function fetchMySubs() {
    if (!window.currentUser?.id) return;
    try {
      const API = typeof API_BASE !== 'undefined' ? API_BASE : (window.location.origin + '/api');
      const res = await fetch(`${API}/submissions?userId=${window.currentUser.id}`);
      const data = await res.json();
      mySubsCache = data.submissions || [];
      renderMySubsList();
    } catch (e) {
      console.warn('[my-submissions] fetch error', e.message);
    }
  }

  async function renderMySubs() {
    const loggedOut = document.getElementById('mySubsLoggedOut');
    const empty     = document.getElementById('mySubsEmpty');
    const list      = document.getElementById('mySubsList');
    if (!list) return;

    if (!window.currentUser) {
      loggedOut.style.display = '';
      empty.style.display     = 'none';
      list.innerHTML          = '';
      return;
    }
    loggedOut.style.display = 'none';
    await fetchMySubs();
  }

  function renderMySubsList() {
    const empty = document.getElementById('mySubsEmpty');
    const list  = document.getElementById('mySubsList');
    if (!list) return;

    if (!mySubsCache.length) {
      empty.style.display = '';
      list.innerHTML = '';
      return;
    }
    empty.style.display = 'none';

    list.innerHTML = mySubsCache.map(sub => {
      const status   = sub.status || 'pending';
      const sm = {
        pending:  ['Pendiente', 'status-pending',  'fa-clock'],
        approved: ['Aprobado',  'status-approved', 'fa-check-circle'],
        rejected: ['Rechazado', 'status-rejected', 'fa-times-circle'],
      };
      const [label, cls, icon] = sm[status] || sm.pending;

      const d = sub.created_at ? new Date(sub.created_at) : null;
      const dateStr = d ? d.toLocaleString('es-UY', { dateStyle: 'medium', timeStyle: 'short' }) : '';

      let noteStr = '';
      if (status === 'approved' && sub.approval_note?.trim()) {
        noteStr = `<i class="fas fa-comment-dots" style="color:#22c55e"></i> ${escHtml(sub.approval_note.trim())}`;
      } else if (status === 'rejected' && sub.rejection_reason?.trim()) {
        noteStr = `<i class="fas fa-comment-dots" style="color:var(--red)"></i> ${escHtml(sub.rejection_reason.trim())}`;
      } else if (status === 'pending') {
        noteStr = `<i class="fas fa-hourglass-half"></i> Esperando revisión`;
      }

      return `
        <div class="my-sub-item" data-id="${sub.id}">
          <span class="status-badge ${cls}" style="flex-shrink:0"><i class="fas ${icon}"></i></span>
          <div class="my-sub-item-info">
            <span class="my-sub-item-level">${escHtml(sub.level_name)}</span>
            <span class="my-sub-item-date">${dateStr}</span>
            ${noteStr ? `<span class="my-sub-item-note">${noteStr}</span>` : ''}
          </div>
          ${sub.status !== 'pending' ? `
          <button class="my-sub-delete-btn" data-id="${sub.id}" title="Quitar del historial"
            style="flex-shrink:0;background:none;border:none;cursor:pointer;padding:.3rem .4rem;border-radius:6px;color:rgba(255,255,255,.25);font-size:.78rem;transition:color .15s,background .15s;"
            onclick="event.stopPropagation()">
            <i class="fas fa-times"></i>
          </button>` : `
          <span title="En revisión por el staff" style="flex-shrink:0;padding:.3rem .4rem;color:rgba(255,193,7,.35);font-size:.72rem">
            <i class="fas fa-clock"></i>
          </span>`}
        </div>`;
    }).join('');

    list.querySelectorAll('.my-sub-item').forEach(item => {
      item.addEventListener('click', () => {
        const id  = Number(item.dataset.id);
        const sub = mySubsCache.find(s => s.id === id);
        if (sub) openMySubDetailModal(sub);
      });
    });

    // Botón eliminar — solo lo quita del historial visual del usuario
    list.querySelectorAll('.my-sub-delete-btn').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        btn.style.color = 'var(--red)';
        btn.style.background = 'rgba(244,63,94,.1)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.color = 'rgba(255,255,255,.25)';
        btn.style.background = 'none';
      });
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        if (!id) return;

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        try {
          const discordId = localStorage.getItem('uy_discord_id') || '';
          const res = await fetch(`/api/submissions?id=${id}`, {
            method: 'DELETE',
            headers: { 'x-discord-id': discordId }
          });
          if (res.ok) {
            // Animación de salida antes de quitar
            const item = btn.closest('.my-sub-item');
            if (item) {
              item.style.transition = 'opacity .2s, transform .2s';
              item.style.opacity = '0';
              item.style.transform = 'translateX(10px)';
              setTimeout(() => {
                mySubsCache = mySubsCache.filter(s => s.id !== id);
                renderMySubsList();
              }, 200);
            }
          } else {
            btn.innerHTML = '<i class="fas fa-times"></i>';
            btn.disabled = false;
            try {
              const data = await res.clone().json();
              if (data.error === 'pending' || res.status === 409) {
                if (typeof uiConfirm === 'function') {
                  uiConfirm({
                    title: 'Submission en revisión',
                    message: data.message || 'Esta submission está siendo revisada por el staff. No podés eliminarla mientras esté pendiente.',
                    type: 'warning',
                    confirmText: 'Entendido',
                    cancelText: null,
                  });
                } else if (typeof showToast === 'function') {
                  showToast('No podés eliminar una submission pendiente', 'warning');
                }
              }
            } catch {}
          }
        } catch {
          btn.innerHTML = '<i class="fas fa-times"></i>';
          btn.disabled = false;
        }
      });
    });
  }

  function openMySubDetailModal(sub) {
    const modal = document.getElementById('mySubDetailModal');
    if (!modal) return;

    document.getElementById('mySubDetailLevel').textContent = sub.level_name || '—';

    const d = sub.created_at ? new Date(sub.created_at) : null;
    document.getElementById('mySubDetailDate').textContent = d
      ? d.toLocaleString('es-UY', { dateStyle: 'medium', timeStyle: 'short' })
      : '';

    const statusEl = document.getElementById('mySubDetailStatus');
    const sm = { pending:['Pendiente','status-pending'], approved:['Aprobado','status-approved'], rejected:['Rechazado','status-rejected'] };
    const [sl, sc] = sm[sub.status] || ['—',''];
    statusEl.textContent = sl;
    statusEl.className = 'status-badge ' + sc;

    const ytUrl  = sub.youtube_url || '';
    const rawUrl = sub.raw_url || '';
    const ytId   = ytUrl.match(/(?:v=|youtu\.be\/)([^&\s]{11})/)?.[1] || null;

    const reviewer = sub.reviewer;

    // Tarjeta del staff responsable — mismo estilo visual que el panel manager
    // (avatar circular, displayname, @username). Se muestra DENTRO del bloque
    // de nota de éxito/rechazo, justo debajo de la nota, para que quede claro
    // quién fue el responsable de esa decisión puntual.
    function reviewerCardHtml() {
      if (!reviewer) return '';
      const avatarHtml = reviewer.avatarUrl
        ? `<img src="${escHtml(reviewer.avatarUrl)}" alt="" class="sub-reviewer-avatar">`
        : `<div class="sub-reviewer-avatar sub-reviewer-avatar-ph">${escHtml((reviewer.displayName || '?')[0].toUpperCase())}</div>`;
      return `
        <div class="sub-reviewer-card">
          ${avatarHtml}
          <div class="sub-reviewer-info">
            <span class="sub-reviewer-label">Responsable</span>
            <span class="sub-reviewer-name">${escHtml(reviewer.displayName)}</span>
            <span class="sub-reviewer-handle">@${escHtml(reviewer.username)}</span>
          </div>
        </div>`;
    }

    document.getElementById('mySubDetailBody').innerHTML = `
      ${ytUrl ? `
      <div class="sub-detail-row">
        <div class="sub-detail-label"><i class="fab fa-youtube" style="color:#ff4444;margin-right:.35rem"></i>Video YouTube</div>
        ${ytId ? `<img class="sub-detail-thumb" src="https://img.youtube.com/vi/${ytId}/mqdefault.jpg" alt="">` : ''}
        <a href="${escHtml(ytUrl)}" target="_blank" class="sub-detail-video-link">
          <i class="fab fa-youtube" style="color:#ff4444"></i> Ver video
        </a>
      </div>` : ''}

      ${rawUrl ? `
      <div class="sub-detail-row">
        <div class="sub-detail-label"><i class="fas fa-film" style="color:var(--violet);margin-right:.35rem"></i>Raw Footage</div>
        <a href="${escHtml(rawUrl)}" target="_blank" class="sub-detail-video-link">
          <i class="fas fa-film" style="color:var(--violet)"></i> Ver raw
        </a>
      </div>` : ''}

      ${sub.notes?.trim() ? `
      <div class="sub-detail-row">
        <div class="sub-detail-label"><i class="fas fa-comment-alt" style="margin-right:.35rem"></i>Tus notas</div>
        <div class="sub-detail-value" style="white-space:pre-wrap;line-height:1.6;color:var(--text-sub)">${escHtml(sub.notes.trim())}</div>
      </div>` : ''}

      ${sub.status === 'pending' ? `
      <div class="sub-detail-row" style="border-left:3px solid var(--warning, #f59e0b);padding-left:.75rem;margin-top:.25rem">
        <div class="sub-detail-label"><i class="fas fa-hourglass-half" style="color:var(--warning, #f59e0b);margin-right:.35rem"></i>Estado</div>
        <div class="sub-detail-value" style="color:var(--text-sub)">Tu submission está esperando revisión del staff.</div>
      </div>` : ''}

      ${sub.status === 'approved' ? `
      <div class="sub-detail-row" style="border-left:3px solid #22c55e;padding-left:.75rem;margin-top:.25rem">
        <div class="sub-detail-label"><i class="fas fa-comment-dots" style="color:#22c55e;margin-right:.35rem"></i>Nota del staff</div>
        <div class="sub-detail-value" style="white-space:pre-wrap;line-height:1.6;color:#86efac">
          ${sub.approval_note?.trim() ? escHtml(sub.approval_note.trim()) : '<span style="opacity:.5;font-style:italic">Sin nota</span>'}
        </div>
        ${reviewerCardHtml()}
      </div>` : ''}

      ${sub.status === 'rejected' ? `
      <div class="sub-detail-row" style="border-left:3px solid var(--red);padding-left:.75rem;margin-top:.25rem">
        <div class="sub-detail-label"><i class="fas fa-times-circle" style="color:var(--red);margin-right:.35rem"></i>Razón del rechazo</div>
        <div class="sub-detail-value" style="white-space:pre-wrap;line-height:1.6;color:#fca5a5">
          ${sub.rejection_reason?.trim() ? escHtml(sub.rejection_reason.trim()) : '<span style="opacity:.5;font-style:italic">Sin razón registrada</span>'}
        </div>
        ${reviewerCardHtml()}
      </div>` : ''}
    `;

    modal.classList.add('open');
  }

  function closeMySubDetailModal() {
    document.getElementById('mySubDetailModal')?.classList.remove('open');
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Re-renderizar cuando cambia la sesión (login/logout)
  document.addEventListener('click', () => {}); // no-op, evita warning de listener vacío en algunos linters

  window.openMySubDetailModal  = openMySubDetailModal;
  window.closeMySubDetailModal = closeMySubDetailModal;
  window.refreshMySubmissions  = renderMySubs;
})();