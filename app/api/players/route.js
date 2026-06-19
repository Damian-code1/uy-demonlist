import { query } from '../../../lib/db.js';

export async function GET() {
  try {
    const [players] = await query(`
      SELECT
        v.player_name                                    AS name,
        COUNT(v.id)                                      AS completions,
        SUM(COALESCE(l.points, GREATEST(1, 1000 - (l.position - 1) * 5))) AS points,
        (
          SELECT l2.name FROM levels l2
          INNER JOIN victors v2 ON v2.level_id = l2.id
          WHERE v2.player_name = v.player_name
          ORDER BY l2.position ASC LIMIT 1
        ) AS hardest_level,
        (
          SELECT l3.position FROM levels l3
          INNER JOIN victors v3 ON v3.level_id = l3.id
          WHERE v3.player_name = v.player_name
          ORDER BY l3.position ASC LIMIT 1
        ) AS hardest_position,
u.discord_id,
        u.discord_avatar,
        u.gd_username
      FROM victors v
      JOIN levels l ON v.level_id = l.id
      LEFT JOIN users u ON (
        LOWER(u.gd_username)            = LOWER(v.player_name)
        OR LOWER(u.discord_display_name) = LOWER(v.player_name)
        OR LOWER(u.discord_username)     = LOWER(v.player_name)
      )
      GROUP BY v.player_name, u.discord_id, u.discord_avatar, u.gd_username
      ORDER BY points DESC
    `);

    return Response.json({ players }, {
  headers: { 'Cache-Control': 'no-store' }
});
  } catch (error) {
    console.error('[/api/players] Error:', error);
    return Response.json({ players: [], error: error.message }, { status: 500 });
  }
}