import { query } from '../../../../../lib/db.js';
import { requireAdmin } from '../../../../../lib/auth.js';
import { invalidateLevelsCache } from '../../../levels/route.js';
import { invalidatePlayersCache } from '../../../players/route.js';

export async function PUT(request, { params }) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { player_name, video_url } = await request.json();
    const [old] = await query('SELECT * FROM victors WHERE id = ? LIMIT 1', [params.id]);
    if (!old.length) return Response.json({ error: 'No encontrado' }, { status: 404 });

    await query(
      'UPDATE victors SET player_name = ?, video_url = ? WHERE id = ?',
      [player_name || old[0].player_name, video_url ?? null, params.id]
    );

    invalidateLevelsCache();
    invalidatePlayersCache();
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const [old] = await query('SELECT level_id FROM victors WHERE id = ? LIMIT 1', [params.id]);
    if (!old.length) return Response.json({ error: 'No encontrado' }, { status: 404 });
    const levelId = old[0].level_id;

    // Limpiar la entrada del feed de noticias correspondiente a este victor,
    // si no se hace queda fantasma mostrando un completion que ya no existe
    await query('DELETE FROM feed_log WHERE victor_id = ?', [params.id]);

    await query('DELETE FROM victors WHERE id = ?', [params.id]);

    // Si el nivel se quedó sin victors, se autoelimina y se reordenan posiciones
    let levelDeleted = false;
    const [remaining] = await query('SELECT COUNT(*) as count FROM victors WHERE level_id = ?', [levelId]);
    if ((remaining[0]?.count || 0) === 0) {
      const [lvl] = await query('SELECT position FROM levels WHERE id = ? LIMIT 1', [levelId]);
      if (lvl.length) {
        await query('DELETE FROM levels WHERE id = ?', [levelId]);
        await query('UPDATE levels SET position = position - 1 WHERE position > ?', [lvl[0].position]);
        levelDeleted = true;
      }
    }

    invalidateLevelsCache();
    invalidatePlayersCache();
    return Response.json({ success: true, levelDeleted, levelId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,x-discord-id',
    },
  });
}
