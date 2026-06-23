import { query } from '../../../lib/db.js';
import { ensureSchema } from '../../../lib/schema.js';

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
    await ensureSchema();

    // ─── Detectar cambio de TOP 1 ───
    // Si el nivel en posición 1 cambió respecto al que tiene el became_top1_at más
    // reciente, le asignamos el timestamp ahora. Cubre TODOS los caminos por los que
    // un nivel puede llegar a la cima (edición manual, sync con AREDL, aprobar
    // submission, borrado de otro nivel que recorre posiciones) sin tener que tocar
    // cada endpoint de escritura — se deriva acá, igual que `isNew`.
    try {
      const [[currentTop1]] = await query(
        'SELECT id, became_top1_at FROM levels WHERE position = 1 LIMIT 1'
      );
      if (currentTop1) {
        const [[lastKnownTop1]] = await query(
          'SELECT id FROM levels WHERE became_top1_at IS NOT NULL ORDER BY became_top1_at DESC LIMIT 1'
        );
        if (!lastKnownTop1 || lastKnownTop1.id !== currentTop1.id) {
          await query('UPDATE levels SET became_top1_at = NOW() WHERE id = ?', [currentTop1.id]);
        }
      }
    } catch (e) {
      console.warn('[/api/levels] No se pudo actualizar became_top1_at:', e.message);
    }

    // 1 sola query trae levels + victors en una sola roundtrip con JOIN
    const [rows] = await query(`
      SELECT
        l.id,
        l.name,
        l.position,
        l.points,
        l.youtube_id,
        l.youtube_url,
        l.thumbnail_url,
        l.thumbnail_youtube_id,
        l.gd_id,
        l.created_at,
        l.created_from_submission,
        l.became_top1_at,
        v.id         AS victor_id,
        v.player_name,
        v.video_url
      FROM levels l
      LEFT JOIN victors v ON v.level_id = l.id
      ORDER BY l.legacy ASC, l.position ASC, v.id ASC
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
          thumbnail_url: row.thumbnail_url,
          thumbnail_youtube_id: row.thumbnail_youtube_id,
          gd_id:       row.gd_id || null,
          legacy:      !!row.legacy,
          created_from_submission: row.created_from_submission,
          created_at:  row.created_at,
          became_top1_at: row.became_top1_at,
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
if (level.thumbnail_youtube_id) {
  thumb_url =
    `https://img.youtube.com/vi/${level.thumbnail_youtube_id}/hqdefault.jpg`;

  thumb_url_fallback =
    `https://img.youtube.com/vi/${level.thumbnail_youtube_id}/mqdefault.jpg`;
}

// Si no hay thumbnail manual: usar el video del PRIMER victor (menor id,
// ya viene ordenado así desde el SQL). Si el primer victor no tiene video
// propio cargado, usar el Showcase del nivel (level.youtube_url) — NO saltar
// al segundo victor. El campo showcase guarda justamente el video del primer
// completion de cada nivel, así que es el fallback correcto antes de mirar
// a otros victors que ni siquiera son el primero en completar el nivel.
if (!thumb_url) {
  const firstVictor   = level.victors[0] || null;
  const firstVictorYt = firstVictor ? extractYTId(firstVictor.videoUrl) : null;

  if (firstVictorYt) {
    thumb_url = `https://img.youtube.com/vi/${firstVictorYt}/hqdefault.jpg`;
    thumb_url_fallback = `https://img.youtube.com/vi/${firstVictorYt}/mqdefault.jpg`;
  } else {
    const showcaseYt = extractYTId(level.youtube_url);
    if (showcaseYt) {
      thumb_url = `https://img.youtube.com/vi/${showcaseYt}/hqdefault.jpg`;
      thumb_url_fallback = `https://img.youtube.com/vi/${showcaseYt}/mqdefault.jpg`;
    }
  }
}

// Último fallback: si el primer victor no tiene video Y el showcase del nivel
// tampoco, recién ahí buscar en el resto de los victors (2do, 3ro, etc.) por
// si alguno sí tiene video propio cargado — mejor mostrar algo que nada.
if (!thumb_url) {
  for (const v of level.victors) {
    const ytId = extractYTId(v.videoUrl);
    if (ytId) {
      thumb_url = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
      thumb_url_fallback = `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
      break;
    }
  }
}

      return {
        ...level,
        thumb_url,
        thumb_url_fallback,
        completionCount: level.victors.length,
        isNew:
          !!level.created_from_submission &&
          !!level.created_at &&
          (Date.now() - new Date(level.created_at).getTime()) < (3 * 24 * 60 * 60 * 1000),
        isNewTop1:
          level.position === 1 &&
          !!level.became_top1_at &&
          (Date.now() - new Date(level.became_top1_at).getTime()) < (30 * 24 * 60 * 60 * 1000),
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

export let lastDataChange = Date.now();

export function invalidateLevelsCache() {
  serverCache = null;
  cacheTime   = 0;
  lastDataChange = Date.now();
}

function extractYTId(url) {
  if (!url) return null;

  const m = url.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([^"&?/\s]{11})/
  );

  return m ? m[1] : null;
}