import { query } from '../../../../lib/db.js';
import { requireAuth } from '../../../../lib/auth.js';

export const dynamic = 'force-dynamic';

// GET replies de un post padre
export async function GET(request, { params }) {
  try {
    const [rows] = await query(`
      SELECT
        p.id, p.content, p.created_at, p.parent_id,
        u.discord_id,
        COALESCE(u.discord_display_name, u.discord_username, u.gd_username) AS display_name,
        u.discord_username,
        u.gd_username,
        u.discord_avatar,
        u.role,
        pp.player_rank
      FROM mural_posts p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN (
        SELECT
          v.player_name,
          RANK() OVER (ORDER BY SUM(COALESCE(l.points, 1)) DESC) AS player_rank
        FROM victors v
        JOIN levels l ON l.id = v.level_id
        GROUP BY v.player_name
      ) pp ON pp.player_name = u.linked_player_name
      WHERE p.parent_id = ?
      ORDER BY p.created_at DESC
    `, [params.id]);
    const allDiscordIds = new Set();
    rows.forEach(p => {
      const lb = Array.isArray(p.liked_by)    ? p.liked_by    : (p.liked_by    ? JSON.parse(p.liked_by)    : []);
      const db = Array.isArray(p.disliked_by) ? p.disliked_by : (p.disliked_by ? JSON.parse(p.disliked_by) : []);
      lb.forEach(id => allDiscordIds.add(id));
      db.forEach(id => allDiscordIds.add(id));
    });

    let userMap = {};
    if (allDiscordIds.size > 0) {
      const ids = [...allDiscordIds];
      const placeholders = ids.map(() => '?').join(',');
      const [userRows] = await query(
        `SELECT discord_id, discord_avatar,
                COALESCE(discord_display_name, discord_username, gd_username) AS name
         FROM users WHERE discord_id IN (${placeholders})`,
        ids
      );
      userRows.forEach(u => { userMap[u.discord_id] = u; });
    }

    const enriched = rows.map(p => {
      const lb = Array.isArray(p.liked_by)    ? p.liked_by    : (p.liked_by    ? JSON.parse(p.liked_by)    : []);
      const db = Array.isArray(p.disliked_by) ? p.disliked_by : (p.disliked_by ? JSON.parse(p.disliked_by) : []);
      return {
        ...p,
        liked_by:          lb,
        disliked_by:       db,
        liked_by_users:    lb.map(id => ({ discord_id: id, discord_avatar: userMap[id]?.discord_avatar || null, name: userMap[id]?.name || id })),
        disliked_by_users: db.map(id => ({ discord_id: id, discord_avatar: userMap[id]?.discord_avatar || null, name: userMap[id]?.name || id })),
      };
    });

    return Response.json({ replies: enriched });
  } catch (e) {
    return Response.json({ replies: [], error: e.message }, { status: 500 });
  }
}

// DELETE — el propio autor o admin+
export async function DELETE(request, { params }) {
  const user = await requireAuth(request);
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });

  const [[post]] = await query(
    'SELECT p.id, u.discord_id FROM mural_posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?',
    [params.id]
  );
  if (!post) return Response.json({ error: 'No encontrado' }, { status: 404 });

  const isOwn  = post.discord_id === user.id;
  const isStaff = ['admin','manager','owner'].includes(user.role);
  if (!isOwn && !isStaff) return Response.json({ error: 'Sin permisos' }, { status: 403 });

  // Borrar post y sus replies
  await query('DELETE FROM mural_posts WHERE id = ? OR parent_id = ?', [params.id, params.id]);
  return Response.json({ success: true });
}