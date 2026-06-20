// app/api/feed/route.js
import { query } from '../../../lib/db.js';
import { ensureSchema } from '../../../lib/schema.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await ensureSchema();
    const { searchParams } = new URL(request.url);
    const player  = searchParams.get('player') || null;
    const limit   = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

    let sql = `
      SELECT v.id, v.player_name, v.video_url, v.created_at,
             l.id AS level_id, l.name AS level_name, l.position, l.youtube_url,
             l.thumbnail_url, l.thumbnail_youtube_id
      FROM victors v
      JOIN levels l ON v.level_id = l.id
    `;
    const params = [];
    if (player) {
      sql += ` WHERE LOWER(v.player_name) = LOWER(?)`;
      params.push(player);
    }
    sql += ` ORDER BY v.created_at DESC, v.id DESC LIMIT ?`;
    params.push(limit);

    const [rows] = await query(sql, params);

    const feed = rows.map(r => ({
      id:          r.id,
      player:      r.player_name,
      level:       r.level_name,
      levelId:     r.level_id,
      position:    r.position,
      videoUrl:    r.video_url || r.youtube_url || null,
      thumbnail:   r.thumbnail_url
                    || (r.thumbnail_youtube_id ? `https://img.youtube.com/vi/${r.thumbnail_youtube_id}/hqdefault.jpg` : null)
                    || (r.youtube_url ? `https://img.youtube.com/vi/${extractYtId(r.youtube_url)}/hqdefault.jpg` : null),
      createdAt:   r.created_at,
    }));

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
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
    },
  });
}