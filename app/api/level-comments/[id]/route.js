import { query } from '../../../../lib/db.js';
import { requireAuth } from '../../../../lib/auth.js';

export const dynamic = 'force-dynamic';

// GET replies de un comentario padre
export async function GET(request, { params }) {
  try {
    const [rows] = await query(`
      SELECT
        c.id, c.content, c.created_at, c.parent_id,
        u.discord_id,
        COALESCE(u.discord_display_name, u.discord_username) AS display_name,
        u.discord_username, u.discord_avatar, u.role,
        (SELECT COUNT(*) FROM level_comment_reactions r WHERE r.comment_id = c.id AND r.reaction = 'like') AS likes,
        (SELECT COUNT(*) FROM level_comment_reactions r WHERE r.comment_id = c.id AND r.reaction = 'dislike') AS dislikes,
        (SELECT GROUP_CONCAT(u2.discord_id SEPARATOR ',')
         FROM level_comment_reactions r2 JOIN users u2 ON u2.id = r2.user_id
         WHERE r2.comment_id = c.id AND r2.reaction = 'like') AS liked_by,
        (SELECT GROUP_CONCAT(u3.discord_id SEPARATOR ',')
         FROM level_comment_reactions r3 JOIN users u3 ON u3.id = r3.user_id
         WHERE r3.comment_id = c.id AND r3.reaction = 'dislike') AS disliked_by
      FROM level_comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.parent_id = ?
      ORDER BY c.created_at ASC
    `, [params.id]);

    const replies = rows.map(c => ({
      ...c,
      liked_by:    c.liked_by    ? c.liked_by.split(',')    : [],
      disliked_by: c.disliked_by ? c.disliked_by.split(',') : [],
    }));

    return Response.json({ replies });
  } catch (e) {
    return Response.json({ replies: [], error: e.message }, { status: 500 });
  }
}