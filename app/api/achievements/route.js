import { query } from '../../../lib/db.js';
import { requireAuth } from '../../../lib/auth.js';
import { ensureSchema } from '../../../lib/schema.js';
import { hasRole, SANCTIONS_ROLES } from '../../../lib/roles.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await ensureSchema();
    const discordId = request.headers.get('x-discord-id') || null;

    const [rows] = await query(`
      SELECT
        a.id, a.position, a.player_name, a.level_name, a.progress,
        a.type, a.video_url, a.thumbnail_url, a.notes,
        a.created_at, a.updated_at,
        (SELECT COUNT(*) FROM achievement_reactions r WHERE r.achievement_id = a.id AND r.reaction = 'like') AS likes,
        (SELECT COUNT(*) FROM achievement_reactions r WHERE r.achievement_id = a.id AND r.reaction = 'dislike') AS dislikes,
        (SELECT COUNT(*) FROM achievement_comments c WHERE c.achievement_id = a.id AND c.parent_id IS NULL) AS comment_count
        ${discordId ? `, (SELECT r2.reaction FROM achievement_reactions r2
           JOIN users u2 ON r2.user_id = u2.id
           WHERE r2.achievement_id = a.id AND u2.discord_id = ? LIMIT 1) AS my_reaction` : ', NULL AS my_reaction'}
      FROM hardest_achievements a
      ORDER BY a.position ASC
    `, discordId ? [discordId] : []);

    return Response.json({ achievements: rows });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await ensureSchema();
    const user = await requireAuth(request);
    if (!user || !hasRole(user.role, SANCTIONS_ROLES))
      return Response.json({ error: 'Sin permisos' }, { status: 403 });

    const { position, player_name, level_name, progress, type, video_url, thumbnail_url, notes } = await request.json();
    if (!position || !player_name || !level_name || !progress || !type)
      return Response.json({ error: 'Faltan campos requeridos' }, { status: 400 });

    // Shift positions
    await query('UPDATE hardest_achievements SET position = position + 1 WHERE position >= ?', [position]);

    const [result] = await query(
      `INSERT INTO hardest_achievements (position, player_name, level_name, progress, type, video_url, thumbnail_url, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [position, player_name.trim(), level_name.trim(), progress.trim(), type, video_url || null, thumbnail_url || null, notes || null]
    );
    return Response.json({ success: true, id: result.insertId }, { status: 201 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}