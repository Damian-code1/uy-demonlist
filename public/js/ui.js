// =============================================
// UI.JS — Modales estilizados
// =============================================

function uiAlert({ title, message, type = 'info', confirmText = 'Aceptar' }) {
  return new Promise(resolve => {
    const icons = {
      success: '<i class="fas fa-check-circle" style="color:var(--success)"></i>',
      error:   '<i class="fas fa-times-circle" style="color:var(--danger)"></i>',
      warning: '<i class="fas fa-exclamation-triangle" style="color:var(--warning)"></i>',
      info:    '<i class="fas fa-info-circle" style="color:var(--violet)"></i>',
    };
    const el = document.createElement('div');
    el.className = 'ui-modal-overlay';
    el.innerHTML = `
      <div class="ui-modal-box">
        <div class="ui-modal-icon">${icons[type] || icons.info}</div>
        ${title   ? `<h3 class="ui-modal-title">${title}</h3>`     : ''}
        ${message ? `<p  class="ui-modal-msg">${message}</p>`      : ''}
        <div class="ui-modal-actions">
          <button class="ui-btn-confirm ui-btn-${type}">${confirmText}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('active'));
    el.querySelector('.ui-btn-confirm').onclick = () => {
      el.classList.remove('active');
      setTimeout(() => el.remove(), 220);
      resolve(true);
    };
  });
}

function uiConfirm({ title, message, type = 'warning', confirmText = 'Confirmar', cancelText = 'Cancelar' }) {
  return new Promise(resolve => {
    const icons = {
      success: '<i class="fas fa-check-circle" style="color:var(--success)"></i>',
      error:   '<i class="fas fa-times-circle" style="color:var(--danger)"></i>',
      warning: '<i class="fas fa-exclamation-triangle" style="color:var(--warning)"></i>',
      info:    '<i class="fas fa-info-circle" style="color:var(--violet)"></i>',
    };
    const el = document.createElement('div');
    el.className = 'ui-modal-overlay';
    el.innerHTML = `
      <div class="ui-modal-box">
        <div class="ui-modal-icon">${icons[type] || icons.warning}</div>
        ${title   ? `<h3 class="ui-modal-title">${title}</h3>`  : ''}
        ${message ? `<p  class="ui-modal-msg">${message}</p>`   : ''}
        <div class="ui-modal-actions">
          <button class="ui-btn-cancel">${cancelText}</button>
          <button class="ui-btn-confirm ui-btn-${type}">${confirmText}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('active'));
    const close = val => {
      el.classList.remove('active');
      setTimeout(() => el.remove(), 220);
      resolve(val);
    };
    el.querySelector('.ui-btn-confirm').onclick = () => close(true);
    el.querySelector('.ui-btn-cancel').onclick  = () => close(false);
    el.addEventListener('click', e => { if (e.target === el) close(false); });
  });
}

function uiPrompt({ title, message, placeholder = '', value = '', confirmText = 'Confirmar', cancelText = 'Cancelar', suggestions = [] }) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'ui-modal-overlay';
    el.innerHTML = `
      <div class="ui-modal-box">
        <div class="ui-modal-icon"><i class="fas fa-keyboard" style="color:var(--violet)"></i></div>
        ${title   ? `<h3 class="ui-modal-title">${title}</h3>` : ''}
        ${message ? `<p  class="ui-modal-msg">${message}</p>`  : ''}
        <div class="ui-input-wrap">
          <input class="ui-input" type="text" placeholder="${placeholder}" value="${value}" autocomplete="off">
          <div class="ui-suggestions" style="display:none"></div>
        </div>
        <div class="ui-modal-actions">
          <button class="ui-btn-cancel">${cancelText}</button>
          <button class="ui-btn-confirm ui-btn-info">${confirmText}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('active'));

    const input  = el.querySelector('.ui-input');
    const sugBox = el.querySelector('.ui-suggestions');
    input.focus();

    if (suggestions.length) {
      input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        if (!q || q.length < 2) { sugBox.style.display = 'none'; return; }
        const matches = suggestions.filter(s => s.toLowerCase().includes(q)).slice(0, 6);
        if (!matches.length) { sugBox.style.display = 'none'; return; }
        sugBox.innerHTML = matches.map(s => `<div class="ui-sug-item">${s}</div>`).join('');
        sugBox.style.display = 'block';
        sugBox.querySelectorAll('.ui-sug-item').forEach(item => {
          item.onclick = () => { input.value = item.textContent; sugBox.style.display = 'none'; };
        });
      });
    }

    const close = val => {
      el.classList.remove('active');
      setTimeout(() => el.remove(), 220);
      resolve(val);
    };
    el.querySelector('.ui-btn-confirm').onclick = () => close(input.value.trim() || null);
    el.querySelector('.ui-btn-cancel').onclick  = () => close(null);
    el.addEventListener('click', e => { if (e.target === el) close(null); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  close(input.value.trim() || null);
      if (e.key === 'Escape') close(null);
    });
  });
}

window.uiAlert   = uiAlert;
window.uiConfirm = uiConfirm;
window.uiPrompt  = uiPrompt;

// =============================================
// TOAST NOTIFICATIONS
// =============================================
function showToast(message, type = 'info') {
  const colors = {
    success: 'linear-gradient(135deg, #16a34a, #22c55e)',
    error:   'linear-gradient(135deg, #dc2626, #f43f5e)',
    warning: 'linear-gradient(135deg, #d97706, #f59e0b)',
    info:    'linear-gradient(135deg, #7c3aed, #8b5cf6)',
  };
  const icons = {
    success: '✓',
    error:   '✕',
    warning: '⚠',
    info:    'ℹ',
  };
  Toastify({
    text: `${icons[type] || icons.info} ${message}`,
    duration: type === 'error' ? 5000 : 3500,
    gravity: 'top',
    position: 'right',
    stopOnFocus: true,
    style: {
      background: colors[type] || colors.info,
      borderRadius: '10px',
      padding: '12px 20px',
      fontWeight: '600',
      fontSize: '.88rem',
      boxShadow: '0 8px 32px rgba(0,0,0,.4)',
      maxWidth: '360px',
    },
  }).showToast();
}

window.showToast = showToast;