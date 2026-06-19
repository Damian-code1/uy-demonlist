import { query } from '../../../../lib/db.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const discordId = searchParams.get('uid');

    if (!discordId) return Response.json({ user: null });

    const [rows] = await query(
      `SELECT u.id, u.discord_username as name, u.discord_display_name as display_name,
              u.discord_avatar as avatar, u.discord_id, u.role, u.gd_username
       FROM users u WHERE u.discord_id = ? LIMIT 1`,
      [discordId]
    );

    if (!rows.length) return Response.json({ user: null });

    const u = rows[0];
    const avatarUrl = u.avatar
      ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png`
      : null;

    // Si el usuario vinculó su nick de GD, usamos ESE para calcular stats.
    // Si no, intentamos matchear por nombre de Discord como fallback.
// Buscar por display_name primero (es el nombre en la lista), luego por gd_username como fallback
const nameInList = u.display_name || u.name;
const gdName     = u.gd_username || null;

const [statsRows] = await query(
  `SELECT
    COUNT(v.id) AS completions,
    COALESCE(SUM(COALESCE(l.points, GREATEST(1, 1000 - (l.position - 1) * 5))), 0) AS points,
    (SELECT l2.name FROM levels l2 JOIN victors v2 ON v2.level_id = l2.id
     WHERE LOWER(v2.player_name) IN (LOWER(?), LOWER(COALESCE(?,'')))
     ORDER BY l2.position ASC LIMIT 1) AS hardest_level
   FROM victors v
   JOIN levels l ON v.level_id = l.id
   WHERE LOWER(v.player_name) IN (LOWER(?), LOWER(COALESCE(?,'')))`,
  [nameInList, gdName, nameInList, gdName]
);
    const stats = statsRows[0] || { completions: 0, points: 0, hardest_level: null };

    return Response.json({
      user: {
        id:          u.id,
        name:        u.display_name || u.name,
        gdUsername:  u.gd_username || null,
        discordId:   u.discord_id,
        image:       avatarUrl,
        role:        u.role,
        points:      stats.points || 0,
        completions: stats.completions || 0,
        hardest:     stats.hardest_level || null,
      }
    });
  } catch (error) {
    console.error('[/api/auth/session] Error:', error);
    return Response.json({ user: null });
  }
}