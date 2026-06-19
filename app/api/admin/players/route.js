import { query } from '../../../../lib/db.js';
import { requireAdmin } from '../../../../lib/auth.js';

export async function GET(request) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const [players] = await query(`
      SELECT
        v.player_name AS name,
        COUNT(v.id)   AS completions,
        SUM(GREATEST(1, 1000 - (l.position - 1) * 5)) AS points,
        (SELECT l2.name FROM levels l2 JOIN victors v2 ON v2.level_id = l2.id
         WHERE v2.player_name = v.player_name ORDER BY l2.position ASC LIMIT 1) AS hardest_level
      FROM victors v
      JOIN levels l ON v.level_id = l.id
      GROUP BY v.player_name
      ORDER BY points DESC
    `);
    return Response.json({ players });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,x-discord-id',
    },
  });
}
