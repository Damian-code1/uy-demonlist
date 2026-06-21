// =============================================
// FEED.JS — Completions en vivo
// =============================================

let _feedData = [];
let _feedInterval = null;

function ytThumb(url) {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null;
}

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return 'ahora mismo';
  if (m < 60) return `hace ${m}m`;
  if (h < 24) return `hace ${h}h`;
  return `hace ${d}d`;
}

function posLabel(pos) {
  if (pos === 1) return '#1 🔥';
  if (pos <= 5)  return `#${pos} 💀`;
  if (pos <= 10) return `#${pos} ⚡`;
  return `#${pos}`;
}

function buildFeedCard(item, mini = false, isFirst = false) {
  const thumb = item.thumbnail || (item.videoUrl ? ytThumb(item.videoUrl) : null);
  const thumbHtml = thumb
    ? `<div class="fc-thumb"><img src="${esc(thumb)}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'"><div class="fc-thumb-overlay"><i class="fas fa-play"></i></div></div>`
    : `<div class="fc-thumb fc-thumb-empty"><i class="fas fa-flag-checkered"></i></div>`;

  const videoAttr = item.videoUrl ? `onclick="window.open('${esc(item.videoUrl)}','_blank')" style="cursor:pointer" title="Ver video"` : '';

  // Fuego solo para el primer elemento del feed (lo más reciente) — anillo realista
  const fireHtml = isFirst ? `
    <div class="fc-fire-border">
      <div class="fc-flame-row">
        <span class="fc-flame"></span>
        <span class="fc-flame"></span>
        <span class="fc-flame"></span>
        <span class="fc-flame"></span>
      </div>
      <span class="fc-fire-spark"></span>
      <span class="fc-fire-spark"></span>
      <span class="fc-fire-spark"></span>
      <span class="fc-fire-spark"></span>
    </div>` : '';

  return `
    <div class="feed-card${mini ? ' feed-card-mini' : ''}${isFirst ? ' feed-card-latest' : ''}" ${videoAttr} data-player="${esc(item.player)}">
      ${fireHtml}
      ${thumbHtml}
      <div class="fc-body">
        <div class="fc-level">${esc(item.level)}</div>
        <div class="fc-meta">
          <span class="fc-player"><i class="fas fa-user"></i> ${esc(item.player)}</span>
          <span class="fc-pos">${posLabel(item.position)}</span>
        </div>
        <div class="fc-time"><i class="fas fa-clock"></i> ${relativeTime(item.createdAt)}</div>
      </div>
      ${item.videoUrl ? `<div class="fc-video-badge"><i class="fas fa-video"></i></div>` : ''}
    </div>
  `;
}

async function loadFeed() {
  try {
    const res  = await fetch('/api/feed?limit=50');
    const data = await res.json();
    _feedData = data.feed || [];

    const count = document.getElementById('feedLiveCount');
    if (count) count.textContent = `${_feedData.length} completions`;

    renderFeedScroll();
    renderFeedModal(document.getElementById('feedPlayerFilter')?.value || '');
  } catch {}
}

function renderFeedScroll() {
  const inner = document.getElementById('feedScrollInner');
  if (!inner) return;
  if (!_feedData.length) {
    inner.innerHTML = `<div class="feed-empty"><i class="fas fa-flag-checkered"></i> Aún no hay completions registradas</div>`;
    return;
  }
  inner.innerHTML = _feedData.slice(0, 20).map((item, i) => buildFeedCard(item, true, i === 0)).join('');
}

function renderFeedModal(filter = '') {
  const list = document.getElementById('feedModalList');
  if (!list) return;
  const f = filter.trim().toLowerCase();
  const items = f ? _feedData.filter(i => i.player.toLowerCase().includes(f)) : _feedData;
  if (!items.length) {
    list.innerHTML = `<div class="feed-empty"><i class="fas fa-search"></i> Sin resultados para "${esc(filter)}"</div>`;
    return;
  }
  // El fuego solo aplica al primero cuando no hay filtro activo (es el más reciente real)
  list.innerHTML = items.map((item, i) => buildFeedCard(item, false, !filter.trim() && i === 0)).join('');
}

function filterFeedModal(val) {
  renderFeedModal(val);
}

function openFeedModal() {
  document.getElementById('feedModal')?.classList.add('open');
  renderFeedModal(document.getElementById('feedPlayerFilter')?.value || '');
  document.body.style.overflow = 'hidden';
}

function closeFeedModal() {
  document.getElementById('feedModal')?.classList.remove('open');
  document.body.style.overflow = '';
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  loadFeed();
  _feedInterval = setInterval(loadFeed, 60000); // refresh cada minuto
});

window.openFeedModal   = openFeedModal;
window.closeFeedModal  = closeFeedModal;
window.filterFeedModal = filterFeedModal;