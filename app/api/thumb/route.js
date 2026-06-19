const cache = new Map();
const TTL   = 1000 * 60 * 60 * 6; // 6 horas
const MISS_TTL = 1000 * 60 * 30;  // 30 min para los 404 (evitar re-fetch constante)

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const levelId = searchParams.get('id');
  const ytId    = searchParams.get('yt');

  if (!levelId && !ytId) return new Response(null, { status: 400 });

  // Si viene id de level, intentar levelthumbs primero, luego yt como fallback
  if (levelId) {
    // Chequear cache positivo
    const cached = cache.get(`lt:${levelId}`);
    if (cached && Date.now() - cached.time < TTL) {
      if (cached.miss) return new Response(null, { status: 404 });
      return imageResponse(cached.data, cached.mime);
    }

    // Intentar levelthumbs
    try {
      const res = await fetch(`https://levelthumbs.prevter.me/${levelId}.png`, {
        headers: { 'User-Agent': 'UY-Demonlist/2.0' },
      });
      if (res.ok) {
        const data = Buffer.from(await res.arrayBuffer());
        if (data.length > 1000) { // PNG real, no placeholder vacío
          cache.set(`lt:${levelId}`, { data, mime: 'image/png', time: Date.now() });
          return imageResponse(data, 'image/png');
        }
      }
    } catch (_) {}

    // levelthumbs no tiene este nivel — marcar como miss para no re-intentar seguido
    cache.set(`lt:${levelId}`, { miss: true, time: Date.now() - (TTL - MISS_TTL) });
    return new Response(null, { status: 404 });
  }

  // YouTube fallback
  if (ytId) {
    const cacheKey = `yt:${ytId}`;
    const cached   = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < TTL) {
      if (cached.miss) return new Response(null, { status: 404 });
      return imageResponse(cached.data, cached.mime);
    }

    try {
      // Intentar mqdefault, si falla o es placeholder intentar hqdefault
      for (const quality of ['mqdefault', 'hqdefault', 'sddefault']) {
        const res = await fetch(`https://img.youtube.com/vi/${ytId}/${quality}.jpg`, {
          headers: { 'User-Agent': 'UY-Demonlist/2.0' },
        });
        if (!res.ok) continue;
        const data = Buffer.from(await res.arrayBuffer());
        // 120x90 placeholder pesa ~2-4KB, los reales pesan más
        if (data.length < 3000) continue;
        cache.set(cacheKey, { data, mime: 'image/jpeg', time: Date.now() });
        return imageResponse(data, 'image/jpeg');
      }
    } catch (_) {}

    cache.set(cacheKey, { miss: true, time: Date.now() - (TTL - MISS_TTL) });
    return new Response(null, { status: 404 });
  }
}

function imageResponse(data, mime) {
  return new Response(data, {
    headers: {
      'Content-Type':  mime,
      'Cache-Control': 'public, max-age=21600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}