import { query } from '../../../lib/db.js';
import { requireAuth } from '../../../lib/auth.js';
import { ensureSchema } from '../../../lib/schema.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ensureSchema();
    const [rows] = await query(`
      SELECT
        p.id, p.content, p.created_at, p.parent_id,
        u.discord_id,
        COALESCE(u.discord_display_name, u.discord_username, u.gd_username) AS display_name,
        u.discord_username,
        u.gd_username,
        u.discord_avatar,
        u.role,
        (SELECT COUNT(*) FROM mural_posts r WHERE r.parent_id = p.id) AS reply_count,
        (SELECT COUNT(*) FROM mural_reactions mr WHERE mr.post_id = p.id AND mr.reaction = 'like') AS likes,
        (SELECT COUNT(*) FROM mural_reactions mr WHERE mr.post_id = p.id AND mr.reaction = 'dislike') AS dislikes,
        (SELECT GROUP_CONCAT(u2.discord_id ORDER BY mr2.created_at SEPARATOR ',')
         FROM mural_reactions mr2 JOIN users u2 ON u2.id = mr2.user_id
         WHERE mr2.post_id = p.id AND mr2.reaction = 'like') AS liked_by,
        (SELECT GROUP_CONCAT(u3.discord_id ORDER BY mr3.created_at SEPARATOR ',')
         FROM mural_reactions mr3 JOIN users u3 ON u3.id = mr3.user_id
         WHERE mr3.post_id = p.id AND mr3.reaction = 'dislike') AS disliked_by
      FROM mural_posts p
      JOIN users u ON u.id = p.user_id
      WHERE p.parent_id IS NULL
      ORDER BY p.created_at DESC
      LIMIT 200
    `);

    const allIds = new Set();
    rows.forEach(p => {
      (p.liked_by    ? p.liked_by.split(',')    : []).forEach(id => allIds.add(id));
      (p.disliked_by ? p.disliked_by.split(',') : []).forEach(id => allIds.add(id));
    });

    let userMap = {};
    if (allIds.size > 0) {
      const ids = [...allIds];
      const placeholders = ids.map(() => '?').join(',');
      const [userRows] = await query(
        `SELECT discord_id, discord_avatar,
                discord_username,
                COALESCE(discord_display_name, discord_username, gd_username) AS display_name
         FROM users WHERE discord_id IN (${placeholders})`,
        ids
      );
      userRows.forEach(u => { userMap[u.discord_id] = u; });
    }

    const posts = rows.map(p => {
      const lb = p.liked_by    ? p.liked_by.split(',')    : [];
      const db = p.disliked_by ? p.disliked_by.split(',') : [];
      return {
        ...p,
        liked_by:          lb,
        disliked_by:       db,
        liked_by_users:    lb.map(id => ({
          discord_id:     id,
          discord_avatar: userMap[id]?.discord_avatar || null,
          name:           userMap[id]?.display_name   || id,
          username:       userMap[id]?.discord_username || null,
        })),
        disliked_by_users: db.map(id => ({
          discord_id:     id,
          discord_avatar: userMap[id]?.discord_avatar || null,
          name:           userMap[id]?.display_name   || id,
          username:       userMap[id]?.discord_username || null,
        })),
      };
    });

    return Response.json({ posts });
    // return Response.json({ posts: rows });
  } catch (e) {
    return Response.json({ posts: [], error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await requireAuth(request);
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });

  // Verificar ban activo
  const [[dbUserFull]] = await query(
    'SELECT id, banned_until FROM users WHERE discord_id = ? LIMIT 1',
    [user.discord_id]
  );
  if (dbUserFull?.banned_until && new Date(dbUserFull.banned_until) > new Date()) {
    return Response.json({ error: 'Estás baneado temporalmente' }, { status: 403 });
  }

  const { content, parent_id } = await request.json();
  if (!content?.trim() || content.trim().length > 500)
    return Response.json({ error: 'Contenido inválido (máx. 500 chars)' }, { status: 400 });

  // Si es reply, verificar que el post padre existe y no es ya una reply
  if (parent_id) {
    const [[parent]] = await query('SELECT id, parent_id FROM mural_posts WHERE id = ?', [parent_id]);
    if (!parent || parent.parent_id !== null)
      return Response.json({ error: 'Post padre inválido' }, { status: 400 });
  }

  if (!dbUserFull) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });

  await query(
    'INSERT INTO mural_posts (user_id, content, parent_id) VALUES (?, ?, ?)',
    [dbUserFull.id, content.trim(), parent_id || null]
  );
  return Response.json({ success: true }, { status: 201 });
}

// PUT /api/mural — toggle like/dislike en un post
export async function PUT(request) {
  const user = await requireAuth(request);
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });

  try {
    const { post_id, reaction } = await request.json();
    if (!post_id || !['like','dislike'].includes(reaction))
      return Response.json({ error: 'Parámetros inválidos' }, { status: 400 });

    const [[dbUser]] = await query('SELECT id FROM users WHERE discord_id = ? LIMIT 1', [user.discord_id]);
    if (!dbUser) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });

    // Verificar reacción actual
    const [[existing]] = await query(
      'SELECT id, reaction FROM mural_reactions WHERE post_id = ? AND user_id = ? LIMIT 1',
      [post_id, dbUser.id]
    );

    if (existing) {
      if (existing.reaction === reaction) {
        // Mismo botón → quitar reacción (toggle off)
        await query('DELETE FROM mural_reactions WHERE id = ?', [existing.id]);
      } else {
        // Cambiar de like a dislike o viceversa
        await query('UPDATE mural_reactions SET reaction = ? WHERE id = ?', [reaction, existing.id]);
      }
    } else {
      await query(
        'INSERT INTO mural_reactions (post_id, user_id, reaction) VALUES (?, ?, ?)',
        [post_id, dbUser.id, reaction]
      );
    }

    // Devolver conteos actualizados
    const [[counts]] = await query(
      `SELECT
        (SELECT COUNT(*) FROM mural_reactions WHERE post_id = ? AND reaction = 'like') AS likes,
        (SELECT COUNT(*) FROM mural_reactions WHERE post_id = ? AND reaction = 'dislike') AS dislikes,
        (SELECT GROUP_CONCAT(u.discord_id SEPARATOR ',') FROM mural_reactions mr JOIN users u ON u.id = mr.user_id WHERE mr.post_id = ? AND mr.reaction = 'like') AS liked_by,
        (SELECT GROUP_CONCAT(u.discord_id SEPARATOR ',') FROM mural_reactions mr JOIN users u ON u.id = mr.user_id WHERE mr.post_id = ? AND mr.reaction = 'dislike') AS disliked_by`,
      [post_id, post_id, post_id, post_id]
    );

    const lbIds = counts.liked_by    ? counts.liked_by.split(',')    : [];
    const dbIds = counts.disliked_by ? counts.disliked_by.split(',') : [];

    const allReactorIds = [...new Set([...lbIds, ...dbIds])];
    let reactorMap = {};
    if (allReactorIds.length > 0) {
      const ph = allReactorIds.map(() => '?').join(',');
      const [reactorRows] = await query(
        `SELECT discord_id, discord_avatar, discord_username,
                COALESCE(discord_display_name, discord_username, gd_username) AS display_name
         FROM users WHERE discord_id IN (${ph})`,
        allReactorIds
      );
      reactorRows.forEach(u => { reactorMap[u.discord_id] = u; });
    }

    return Response.json({
      likes:       counts.likes || 0,
      dislikes:    counts.dislikes || 0,
      liked_by:    lbIds,
      disliked_by: dbIds,
      liked_by_users:    lbIds.map(id => ({
        discord_id:     id,
        discord_avatar: reactorMap[id]?.discord_avatar || null,
        name:           reactorMap[id]?.display_name   || id,
        username:       reactorMap[id]?.discord_username || null,
      })),
      disliked_by_users: dbIds.map(id => ({
        discord_id:     id,
        discord_avatar: reactorMap[id]?.discord_avatar || null,
        name:           reactorMap[id]?.display_name   || id,
        username:       reactorMap[id]?.discord_username || null,
      })),
    });
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