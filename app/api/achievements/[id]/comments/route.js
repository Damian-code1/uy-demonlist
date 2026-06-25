import { query } from '../../../../../lib/db.js';
import { requireAuth } from '../../../../../lib/auth.js';

export const dynamic = 'force-dynamic';

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
        (SELECT COUNT(*) FROM achievement_comments r WHERE r.parent_id = c.id) AS reply_count,
        (SELECT COUNT(*) FROM achievement_comment_reactions r WHERE r.comment_id = c.id AND r.reaction = 'like') AS likes,
        (SELECT COUNT(*) FROM achievement_comment_reactions r WHERE r.comment_id = c.id AND r.reaction = 'dislike') AS dislikes,
        (SELECT GROUP_CONCAT(CONCAT(u2.discord_id,'|',COALESCE(u2.discord_display_name,u2.discord_username,'?'),'|',COALESCE(u2.discord_avatar,'')) SEPARATOR ';;')
         FROM achievement_comment_reactions r2 JOIN users u2 ON u2.id = r2.user_id
         WHERE r2.comment_id = c.id AND r2.reaction = 'like') AS liked_by,
        (SELECT GROUP_CONCAT(CONCAT(u3.discord_id,'|',COALESCE(u3.discord_display_name,u3.discord_username,'?'),'|',COALESCE(u3.discord_avatar,'')) SEPARATOR ';;')
         FROM achievement_comment_reactions r3 JOIN users u3 ON u3.id = r3.user_id
         WHERE r3.comment_id = c.id AND r3.reaction = 'dislike') AS disliked_by
      FROM achievement_comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.achievement_id = ? AND c.parent_id IS NULL
      ORDER BY c.created_at DESC
      LIMIT 100
    `, [params.id]);

    const parseReactors = raw => !raw ? [] : raw.split(';;').map(s => {
      const [id, name, avatar] = s.split('|');
      return { id, name, avatar: avatar || null };
    });

    const comments = rows.map(c => ({
      ...c,
      liked_by:    parseReactors(c.liked_by),
      disliked_by: parseReactors(c.disliked_by),
    }));

    return Response.json({ comments });
  } catch (e) {
    return Response.json({ comments: [], error: e.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const user = await requireAuth(request);
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });

  const { content, parent_id } = await request.json();
  if (!content?.trim()) return Response.json({ error: 'Contenido vacío' }, { status: 400 });

  const [result] = await query(
    'INSERT INTO achievement_comments (achievement_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)',
    [params.id, user.id, content.trim(), parent_id || null]
  );

  return Response.json({
    success: true,
    comment: {
      id: result.insertId,
      content: content.trim(),
      achievement_id: Number(params.id),
      parent_id: parent_id || null,
      display_name: user.discord_display_name || user.discord_username,
      discord_id: user.discord_id,
      discord_avatar: user.discord_avatar,
      role: user.role,
      likes: 0, dislikes: 0,
      liked_by: [], disliked_by: [],
      reply_count: 0,
      created_at: new Date().toISOString(),
    }
  }, { status: 201 });
}