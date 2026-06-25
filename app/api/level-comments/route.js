import { query } from '../../../lib/db.js';
import { requireAuth } from '../../../lib/auth.js';
import { ensureSchema } from '../../../lib/schema.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await ensureSchema();
    const { searchParams } = new URL(request.url);
    const levelId = searchParams.get('level_id');
    if (!levelId) return Response.json({ comments: [] });

    const [rows] = await query(`
      SELECT
        c.id, c.content, c.created_at, c.level_id, c.parent_id,
        u.discord_id,
        COALESCE(u.discord_display_name, u.discord_username) AS display_name,
        u.discord_username,
        u.discord_avatar,
        u.role,
        (SELECT COUNT(*) FROM level_comments r WHERE r.parent_id = c.id) AS reply_count,
        (SELECT COUNT(*) FROM victors v
         JOIN users uv ON LOWER(uv.discord_username) = LOWER(v.player_name)
              OR LOWER(uv.discord_display_name) = LOWER(v.player_name)
         WHERE v.level_id = c.level_id AND uv.discord_id = u.discord_id LIMIT 1) AS is_victor,
        (SELECT COUNT(*) FROM level_comment_reactions r WHERE r.comment_id = c.id AND r.reaction = 'like') AS likes,
        (SELECT COUNT(*) FROM level_comment_reactions r WHERE r.comment_id = c.id AND r.reaction = 'dislike') AS dislikes,
        (SELECT GROUP_CONCAT(CONCAT(u2.discord_id,'|',COALESCE(u2.discord_display_name,u2.discord_username,'?'),'|',COALESCE(u2.discord_avatar,'')) SEPARATOR ';;')
         FROM level_comment_reactions r2 JOIN users u2 ON u2.id = r2.user_id
         WHERE r2.comment_id = c.id AND r2.reaction = 'like') AS liked_by,
        (SELECT GROUP_CONCAT(CONCAT(u3.discord_id,'|',COALESCE(u3.discord_display_name,u3.discord_username,'?'),'|',COALESCE(u3.discord_avatar,'')) SEPARATOR ';;')
         FROM level_comment_reactions r3 JOIN users u3 ON u3.id = r3.user_id
         WHERE r3.comment_id = c.id AND r3.reaction = 'dislike') AS disliked_by
      FROM level_comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.level_id = ? AND c.parent_id IS NULL
      ORDER BY c.created_at DESC
      LIMIT 100
    `, [levelId]);

    const parseReactors = raw => !raw ? [] : raw.split(';;').map(s => {
      const [id, name, avatar] = s.split('|');
      return { id, name, avatar: avatar || null };
    });
    const comments = rows.map(c => ({
      ...c,
      liked_by:    parseReactors(c.liked_by),
      disliked_by: parseReactors(c.disliked_by),
      is_victor:   Number(c.is_victor) > 0,
    }));

    return Response.json({ comments });
  } catch (e) {
    return Response.json({ comments: [], error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await requireAuth(request);
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });

  try {
    const { level_id, content, parent_id } = await request.json();
    if (!level_id || !content?.trim() || content.trim().length > 500)
      return Response.json({ error: 'Contenido inválido (máx. 500 chars)' }, { status: 400 });

    // Si es reply, verificar que el padre existe y es un comentario raíz
    if (parent_id) {
      const [[parent]] = await query(
        'SELECT id, parent_id FROM level_comments WHERE id = ? LIMIT 1', [parent_id]
      );
      if (!parent || parent.parent_id !== null)
        return Response.json({ error: 'Comentario padre inválido' }, { status: 400 });
    }

    const [[dbUser]] = await query(
      'SELECT id, banned_until FROM users WHERE discord_id = ? LIMIT 1',
      [user.discord_id]
    );
    if (!dbUser) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
    if (dbUser.banned_until && new Date(dbUser.banned_until) > new Date())
      return Response.json({ error: 'Estás baneado temporalmente' }, { status: 403 });

    const [[level]] = await query('SELECT id FROM levels WHERE id = ? LIMIT 1', [level_id]);
    if (!level) return Response.json({ error: 'Nivel no encontrado' }, { status: 404 });

    await query(
      'INSERT INTO level_comments (level_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)',
      [level_id, dbUser.id, content.trim(), parent_id || null]
    );
    return Response.json({ success: true }, { status: 201 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// PUT — toggle like/dislike en un comentario
export async function PUT(request) {
  const user = await requireAuth(request);
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });

  try {
    const { comment_id, reaction } = await request.json();
    if (!comment_id || !['like','dislike'].includes(reaction))
      return Response.json({ error: 'Parámetros inválidos' }, { status: 400 });

    const [[dbUser]] = await query('SELECT id FROM users WHERE discord_id = ? LIMIT 1', [user.discord_id]);
    if (!dbUser) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });

    const [[existing]] = await query(
      'SELECT id, reaction FROM level_comment_reactions WHERE comment_id = ? AND user_id = ? LIMIT 1',
      [comment_id, dbUser.id]
    );

    if (existing) {
      if (existing.reaction === reaction) {
        await query('DELETE FROM level_comment_reactions WHERE id = ?', [existing.id]);
      } else {
        await query('UPDATE level_comment_reactions SET reaction = ? WHERE id = ?', [reaction, existing.id]);
      }
    } else {
      await query(
        'INSERT INTO level_comment_reactions (comment_id, user_id, reaction) VALUES (?, ?, ?)',
        [comment_id, dbUser.id, reaction]
      );
    }

    const [[counts]] = await query(
      `SELECT
        (SELECT COUNT(*) FROM level_comment_reactions WHERE comment_id = ? AND reaction = 'like') AS likes,
        (SELECT COUNT(*) FROM level_comment_reactions WHERE comment_id = ? AND reaction = 'dislike') AS dislikes,
        (SELECT GROUP_CONCAT(CONCAT(u.discord_id,'|',COALESCE(u.discord_display_name,u.discord_username,'?'),'|',COALESCE(u.discord_avatar,'')) SEPARATOR ';;')
         FROM level_comment_reactions r JOIN users u ON u.id = r.user_id WHERE r.comment_id = ? AND r.reaction = 'like') AS liked_by,
        (SELECT GROUP_CONCAT(CONCAT(u.discord_id,'|',COALESCE(u.discord_display_name,u.discord_username,'?'),'|',COALESCE(u.discord_avatar,'')) SEPARATOR ';;')
         FROM level_comment_reactions r JOIN users u ON u.id = r.user_id WHERE r.comment_id = ? AND r.reaction = 'dislike') AS disliked_by`,
      [comment_id, comment_id, comment_id, comment_id]
    );

    const parseR = raw => !raw ? [] : raw.split(';;').map(s => {
      const [id, name, avatar] = s.split('|');
      return { id, name, avatar: avatar || null };
    });

    return Response.json({
      likes:       counts.likes || 0,
      dislikes:    counts.dislikes || 0,
      liked_by:    parseR(counts.liked_by),
      disliked_by: parseR(counts.disliked_by),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/level-comments?id=X
export async function DELETE(request) {
  const user = await requireAuth(request);
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get('id'));
    if (!id) return Response.json({ error: 'ID requerido' }, { status: 400 });

    const [[dbUser]] = await query('SELECT id, role FROM users WHERE discord_id = ? LIMIT 1', [user.discord_id]);
    if (!dbUser) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });

    const [[comment]] = await query('SELECT id, user_id FROM level_comments WHERE id = ? LIMIT 1', [id]);
    if (!comment) return Response.json({ error: 'No encontrado' }, { status: 404 });

    const isAdmin = ['admin','manager','owner'].includes(dbUser.role);
    if (comment.user_id !== dbUser.id && !isAdmin)
      return Response.json({ error: 'No autorizado' }, { status: 403 });

    await query('DELETE FROM level_comments WHERE id = ?', [id]);
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,x-discord-id',
  }});
}