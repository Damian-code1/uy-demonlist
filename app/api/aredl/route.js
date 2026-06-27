let cache = null;
let cacheTime = 0;
const TTL = 1000 * 60 * 5; // 5 minutos

const AREDL_URLS = [
  'https://api.aredl.net/v2/api/aredl/levels',
  'https://api.aredl.net/api/aredl/levels',
];

export async function GET(request) {
  const force = new URL(request.url).searchParams.get('force') === '1';

  try {
    if (!force && cache && Date.now() - cacheTime < TTL) {
      return Response.json({ levels: cache, cached: true });
    }

    let res = null;
    for (const url of AREDL_URLS) {
      try {
        res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://aredl.net/',
            'Origin': 'https://aredl.net',
            'sec-ch-ua': '"Google Chrome";v="125"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
          },
          cache: 'no-store',
        });
        if (res.ok) break;
        console.warn(`[AREDL] ${url} → HTTP ${res.status}`);
        res = null;
      } catch (e) {
        console.warn(`[AREDL] ${url} → ${e.message}`);
      }
    }

    if (!res) {
      console.error('[AREDL] Todos los endpoints fallaron');
      return Response.json({ levels: cache || [], error: 'All endpoints failed' });
    }

    const raw = await res.json();
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)    ? raw.data
      : Array.isArray(raw?.levels)  ? raw.levels
      : Array.isArray(raw?.results) ? raw.results
      : null;

    if (!list) {
      console.error('[AREDL] Unexpected shape:', JSON.stringify(raw).slice(0, 300));
      return Response.json({ levels: cache || [], error: 'Unexpected response shape' });
    }

    cache = list.map(e => ({
      name:     e.name,
      position: e.position,
      level_id: e.level_id,
      points:   e.points,
      video_id: e.video_id || null, 
    }));
    cacheTime = Date.now();

    console.log(`[AREDL] Refreshed — ${cache.length} levels`);
    return Response.json({ levels: cache, cached: false });
  } catch (error) {
    console.error('[/api/aredl] Error:', error);
    return Response.json({ levels: cache || [], error: error.message });
  }
}