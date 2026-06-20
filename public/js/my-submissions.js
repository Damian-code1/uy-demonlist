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
          <i class="fas fa-chevron-right" style="opacity:.4;font-size:.75rem"></i>
        </div>`;
    }).join('');

    list.querySelectorAll('.my-sub-item').forEach(item => {
      item.addEventListener('click', () => {
        const id  = Number(item.dataset.id);
        const sub = mySubsCache.find(s => s.id === id);
        if (sub) openMySubDetailModal(sub);
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
    const reviewerHtml = reviewer ? `
      <div class="sub-detail-row" style="display:flex;align-items:center;gap:.65rem;border-left:3px solid var(--violet);padding-left:.75rem;margin-top:.25rem">
        ${reviewer.avatarUrl
          ? `<img src="${escHtml(reviewer.avatarUrl)}" alt="" style="width:38px;height:38px;border-radius:50%;flex-shrink:0">`
          : `<div style="width:38px;height:38px;border-radius:50%;background:var(--violet);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0">${escHtml((reviewer.displayName||'?')[0].toUpperCase())}</div>`}
        <div style="min-width:0">
          <div style="font-size:.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.04em">Revisado por</div>
          <div style="font-weight:700;font-size:.9rem">${escHtml(reviewer.displayName)}</div>
          <div style="font-size:.78rem;color:var(--text-sub)">@${escHtml(reviewer.username)}</div>
        </div>
      </div>` : '';

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
      </div>` : ''}

      ${sub.status === 'rejected' ? `
      <div class="sub-detail-row" style="border-left:3px solid var(--red);padding-left:.75rem;margin-top:.25rem">
        <div class="sub-detail-label"><i class="fas fa-times-circle" style="color:var(--red);margin-right:.35rem"></i>Razón del rechazo</div>
        <div class="sub-detail-value" style="white-space:pre-wrap;line-height:1.6;color:#fca5a5">
          ${sub.rejection_reason?.trim() ? escHtml(sub.rejection_reason.trim()) : '<span style="opacity:.5;font-style:italic">Sin razón registrada</span>'}
        </div>
      </div>` : ''}

      ${reviewerHtml}
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