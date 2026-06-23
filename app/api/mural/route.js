import { query } from '../../../lib/db.js';
import { requireAuth } from '../../../lib/auth.js';

export const dynamic = 'force-dynamic';

export async function GET() {
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
        (SELECT COUNT(*) FROM mural_posts r WHERE r.parent_id = p.id) AS reply_count,
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
      WHERE p.parent_id IS NULL
      ORDER BY p.created_at DESC
      LIMIT 200
    `);
    return Response.json({ posts: rows });
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