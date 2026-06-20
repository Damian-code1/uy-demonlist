import { query } from '../../../lib/db.js';
import { ensureSchema } from '../../../lib/schema.js';

export const dynamic = 'force-dynamic';

// El feed de noticias muestra máximo 50 completions. Se lee de feed_log
// (no de victors directamente) — feed_log se poda sola a 50 entradas
// cada vez que se crea un victor nuevo, sin tocar el historial real
// de records en la tabla victors.
const FEED_HARD_MAX = 50;

export async function GET(request) {
  try {
    await ensureSchema();

    const { searchParams } = new URL(request.url);
    const player = searchParams.get('player') || null;
    const limit  = Math.min(parseInt(searchParams.get('limit') || '50'), FEED_HARD_MAX);
    const limitSafe = parseInt(limit, 10) || FEED_HARD_MAX;

    let sql;
    let params;

    if (player) {
      sql = `
        SELECT f.id, f.player_name, f.video_url,
               f.created_at,
               l.id AS level_id, l.name AS level_name, l.position,
               l.youtube_url, l.thumbnail_url, l.thumbnail_youtube_id
        FROM feed_log f
        JOIN levels l ON f.level_id = l.id
        WHERE LOWER(f.player_name) = LOWER(?)
        ORDER BY f.created_at DESC, f.id DESC
        LIMIT ${limitSafe}
      `;
      params = [player];
    } else {
      sql = `
        SELECT f.id, f.player_name, f.video_url,
               f.created_at,
               l.id AS level_id, l.name AS level_name, l.position,
               l.youtube_url, l.thumbnail_url, l.thumbnail_youtube_id
        FROM feed_log f
        JOIN levels l ON f.level_id = l.id
        ORDER BY f.created_at DESC, f.id DESC
        LIMIT ${limitSafe}
      `;
      params = [];
    }

    const [rows] = await query(sql, params);

    const feed = rows.map(r => {
      // Prioridad: video propio del victor → video del nivel → thumbnail guardada
      const victorYtId = extractYtId(r.video_url);
      const levelYtId  = extractYtId(r.youtube_url);
      const thumbYtId  = r.thumbnail_youtube_id || null;

      const thumbnail = victorYtId
        ? `https://img.youtube.com/vi/${victorYtId}/hqdefault.jpg`
        : levelYtId
          ? `https://img.youtube.com/vi/${levelYtId}/hqdefault.jpg`
          : thumbYtId
            ? `https://img.youtube.com/vi/${thumbYtId}/hqdefault.jpg`
            : r.thumbnail_url || null;

      return {
        id:        r.id,
        player:    r.player_name,
        level:     r.level_name,
        levelId:   r.level_id,
        position:  r.position,
        videoUrl:  r.video_url || r.youtube_url || null,
        thumbnail,
        createdAt: r.created_at || null,
      };
    });

    return Response.json({ feed });
  } catch (error) {
    console.error('[/api/feed] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function extractYtId(url) {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
    },
  });
}