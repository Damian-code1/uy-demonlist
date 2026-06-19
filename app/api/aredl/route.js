let cache = null;
let cacheTime = 0;
const TTL = 1000 * 60 * 5; // 5 minutos

const AREDL_URL = 'https://api.aredl.net/api/aredl/levels';

export async function GET(request) {
  const force = new URL(request.url).searchParams.get('force') === '1';

  try {
    if (!force && cache && Date.now() - cacheTime < TTL) {
      return Response.json({ levels: cache, cached: true });
    }

    const res = await fetch(AREDL_URL, {
      headers: { 'User-Agent': 'UY-Demonlist/2.0', Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      console.error(`[AREDL] HTTP ${res.status}`);
      return Response.json({ levels: cache || [], error: `HTTP ${res.status}` });
    }

    const list = await res.json();
    if (!Array.isArray(list)) {
      console.error('[AREDL] Unexpected shape:', JSON.stringify(list).slice(0, 200));
      return Response.json({ levels: cache || [], error: 'Unexpected response' });
    }

    cache = list.map(e => ({
      name:     e.name,
      position: e.position,
      level_id: e.level_id,
      points:   e.points,
      video_id: e.video_id || null, // ID del video de YouTube del showcase en AREDL
    }));
    cacheTime = Date.now();

    console.log(`[AREDL] Refreshed — ${cache.length} levels`);
    return Response.json({ levels: cache, cached: false });
  } catch (error) {
    console.error('[/api/aredl] Error:', error);
    return Response.json({ levels: cache || [], error: error.message });
  }
}