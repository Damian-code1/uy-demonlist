import { query } from '../../../../lib/db.js';
import { requireAuth } from '../../../../lib/auth.js';
import { hasRole, SANCTIONS_ROLES } from '../../../../lib/roles.js';

export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
  const user = await requireAuth(request);
  if (!user || !hasRole(user.role, SANCTIONS_ROLES))
    return Response.json({ error: 'Sin permisos' }, { status: 403 });

  try {
    const { position, player_name, level_name, progress, type, video_url, thumbnail_url, notes } = await request.json();
    const [[current]] = await query('SELECT position FROM hardest_achievements WHERE id = ?', [params.id]);
    if (!current) return Response.json({ error: 'No encontrado' }, { status: 404 });

    // Si cambia la posición, hacer shift
    if (position && position !== current.position) {
      if (position < current.position) {
        await query('UPDATE hardest_achievements SET position = position + 1 WHERE position >= ? AND position < ? AND id != ?',
          [position, current.position, params.id]);
      } else {
        await query('UPDATE hardest_achievements SET position = position - 1 WHERE position > ? AND position <= ? AND id != ?',
          [current.position, position, params.id]);
      }
    }

    await query(
      `UPDATE hardest_achievements SET
        position = COALESCE(?, position),
        player_name = COALESCE(?, player_name),
        level_name = COALESCE(?, level_name),
        progress = COALESCE(?, progress),
        type = COALESCE(?, type),
        video_url = ?,
        thumbnail_url = ?,
        notes = ?
       WHERE id = ?`,
      [position || null, player_name?.trim() || null, level_name?.trim() || null,
       progress?.trim() || null, type || null, video_url || null, thumbnail_url || null, notes || null, params.id]
    );
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const user = await requireAuth(request);
  if (!user || !hasRole(user.role, SANCTIONS_ROLES))
    return Response.json({ error: 'Sin permisos' }, { status: 403 });

  try {
    const [[ach]] = await query('SELECT position FROM hardest_achievements WHERE id = ?', [params.id]);
    if (!ach) return Response.json({ error: 'No encontrado' }, { status: 404 });

    await query('DELETE FROM hardest_achievements WHERE id = ?', [params.id]);
    // Reordenar posiciones
    await query('UPDATE hardest_achievements SET position = position - 1 WHERE position > ?', [ach.position]);

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}