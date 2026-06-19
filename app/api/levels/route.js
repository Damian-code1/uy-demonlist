import { query } from '../../../lib/db.js';

export const dynamic   = 'force-dynamic';
export const revalidate = 0;

// Cache en memoria del servidor — se invalida solo cuando el admin modifica datos
let serverCache = null;
let cacheTime   = 0;
const CACHE_TTL = 1000 * 30; // 30 segundos — balance entre frescura y velocidad

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const bust = searchParams.get('bust'); // ?bust=1 fuerza revalidación

  if (!bust && serverCache && (Date.now() - cacheTime) < CACHE_TTL) {
    return Response.json({ levels: serverCache, cached: true }, {
      headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=30' }
    });
  }

  try {
    // 1 sola query trae levels + victors en una sola roundtrip con JOIN
    const [rows] = await query(`
      SELECT
        l.id,
        l.name,
        l.position,
        l.points,
        l.youtube_id,
        l.youtube_url,
l.custom_thumbnail_url,
l.custom_thumbnail_youtube_id,
l.created_at,
        l.created_from_submission,
        v.id         AS victor_id,
        v.player_name,
        v.video_url
      FROM levels l
      LEFT JOIN victors v ON v.level_id = l.id
      ORDER BY l.position ASC, v.id ASC
    `);

    // Agrupar los victors dentro de cada nivel en JS (mucho más rápido que N+1 queries)
    const levelMap = new Map();

    for (const row of rows) {
      if (!levelMap.has(row.id)) {
        levelMap.set(row.id, {
          id:          row.id,
          name:        row.name,
          position:    row.position,
          points:      row.points,
          youtube_id:  row.youtube_id,
          youtube_url: row.youtube_url,
          custom_thumbnail_url: row.custom_thumbnail_url,
          custom_thumbnail_youtube_id: row.custom_thumbnail_youtube_id,
          created_from_submission: row.created_from_submission,
          created_at:  row.created_at,
          victors:     [],
        });
      }

      if (row.victor_id) {
        const videoUrl = row.video_url || null;
        levelMap.get(row.id).victors.push({
          id:       row.victor_id,
          name:     row.player_name,
          videoUrl: videoUrl,
          videoId:  extractYTId(videoUrl),
        });
      }
    }

    const levels = Array.from(levelMap.values()).map(level => {
      // Thumbnail: primer victor con video de YouTube. Sin YouTube = null (correcto para Twitch etc.)
      let thumb_url = null;
let thumb_url_fallback = null;

// thumbnail manual tiene prioridad
if (level.custom_thumbnail_youtube_id) {
  thumb_url =
    `https://img.youtube.com/vi/${level.custom_thumbnail_youtube_id}/hqdefault.jpg`;

  thumb_url_fallback =
    `https://img.youtube.com/vi/${level.custom_thumbnail_youtube_id}/mqdefault.jpg`;
}

// si no hay thumbnail manual, usar victors
if (!thumb_url) {
  for (const v of level.victors) {
    const ytId = extractYTId(v.videoUrl);

    if (ytId) {
      thumb_url =
        `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;

      thumb_url_fallback =
        `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;

      break;
    }
  }
}

// fallback final
if (!thumb_url) {
  const ytId = extractYTId(level.youtube_url);

  if (ytId) {
    thumb_url =
      `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;

    thumb_url_fallback =
      `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
  }
}

      return {
  ...level,
  thumb_url,
  thumb_url_fallback,
  completionCount: level.victors.length,

  isNew:
    level.created_from_submission &&
    (
      Date.now() -
      new Date(level.created_at).getTime()
    ) <
    (3 * 24 * 60 * 60 * 1000)
};
    });

    serverCache = levels;
    cacheTime   = Date.now();

    return Response.json({ levels }, {
      headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=30' }
    });
  } catch (error) {
    console.error('[/api/levels] Error:', error);
    return Response.json({ levels: [], error: error.message }, { status: 500 });
  }
}

export function invalidateLevelsCache() {
  serverCache = null;
  cacheTime   = 0;
}

function extractYTId(url) {
  if (!url) return null;

  const m = url.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([^"&?/\s]{11})/
  );

  return m ? m[1] : null;
}