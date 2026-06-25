import { query } from '../../../../../../lib/db.js';
import { requireAuth } from '../../../../../../lib/auth.js';

export const dynamic = 'force-dynamic';

// GET replies de un comentario
export async function GET(request, { params }) {
  try {
    const [rows] = await query(`
      SELECT
        c.id, c.content, c.created_at, c.achievement_id, c.parent_id,
        u.discord_id,
        COALESCE(u.discord_display_name, u.discord_username) AS display_name,
        u.discord_username,
        u.discord_avatar,
        u.role,
        (SELECT COUNT(*) FROM achievement_comment_reactions r WHERE r.comment_id = c.id AND r.reaction = 'like') AS likes,
        (SELECT COUNT(*) FROM achievement_comment_reactions r WHERE r.comment_id = c.id AND r.reaction = 'dislike') AS dislikes
      FROM achievement_comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.parent_id = ?
      ORDER BY c.created_at ASC
    `, [params.cid]);
    return Response.json({ replies: rows });
  } catch (e) {
    return Response.json({ replies: [], error: e.message }, { status: 500 });
  }
}

// POST reacción a un comentario
export async function POST(request, { params }) {
  const user = await requireAuth(request);
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });

  const { reaction } = await request.json();
  if (!['like','dislike'].includes(reaction))
    return Response.json({ error: 'Reacción inválida' }, { status: 400 });

  const [[existing]] = await query(
    'SELECT id, reaction FROM achievement_comment_reactions WHERE comment_id = ? AND user_id = ?',
    [params.cid, user.id]
  );

  let action;
  if (!existing) {
    await query('INSERT INTO achievement_comment_reactions (comment_id, user_id, reaction) VALUES (?, ?, ?)',
      [params.cid, user.id, reaction]);
    action = 'added';
  } else if (existing.reaction === reaction) {
    await query('DELETE FROM achievement_comment_reactions WHERE id = ?', [existing.id]);
    action = 'removed';
  } else {
    await query('UPDATE achievement_comment_reactions SET reaction = ? WHERE id = ?', [reaction, existing.id]);
    action = 'changed';
  }

  const [[counts]] = await query(
    `SELECT SUM(reaction='like') AS likes, SUM(reaction='dislike') AS dislikes
     FROM achievement_comment_reactions WHERE comment_id = ?`,
    [params.cid]
  );

  return Response.json({ success: true, action, likes: counts.likes || 0, dislikes: counts.dislikes || 0 });
}

// DELETE comentario (autor o staff)
export async function DELETE(request, { params }) {
  const user = await requireAuth(request);
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });

  const [[comment]] = await query(
    'SELECT c.id, u.discord_id FROM achievement_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?',
    [params.cid]
  );
  if (!comment) return Response.json({ error: 'No encontrado' }, { status: 404 });

  const isOwn   = comment.discord_id === user.discord_id;
  const isStaff = ['list_mod','admin','manager','owner'].includes(user.role);
  if (!isOwn && !isStaff) return Response.json({ error: 'Sin permisos' }, { status: 403 });

  await query('DELETE FROM achievement_comments WHERE id = ? OR parent_id = ?', [params.cid, params.cid]);
  return Response.json({ success: true });
}