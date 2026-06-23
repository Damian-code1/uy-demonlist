import { query } from '../../../../../lib/db.js';
import { requireAdmin } from '../../../../../lib/auth.js';
import { invalidateLevelsCache } from '../../../levels/route.js';
import { invalidatePlayersCache } from '../../../players/route.js';

export async function PUT(request, { params }) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { name, position, youtube_url, points, gd_id, legacy } = await request.json();
    const [old] = await query('SELECT * FROM levels WHERE id = ? LIMIT 1', [params.id]);
    if (!old.length) return Response.json({ error: 'No encontrado' }, { status: 404 });

    // points: null = usar fórmula automática, número = override manual
    const newPoints = points !== undefined ? (points === null || points === '' ? null : parseInt(points)) : old[0].points;
    // gd_id: undefined = no tocar, null/'' = borrar, string = setear
    const newGdId = gd_id !== undefined ? (gd_id === null || gd_id === '' ? null : String(gd_id).trim()) : old[0].gd_id;
    // legacy: si viene en el body lo usamos, si no, mantenemos el valor actual
    const newLegacy = legacy !== undefined ? (legacy ? 1 : 0) : (old[0].legacy || 0);

    await query(
      'UPDATE levels SET name = ?, position = ?, youtube_url = ?, points = ?, gd_id = ?, legacy = ?, updated_at = NOW() WHERE id = ?',
      [name || old[0].name, position || old[0].position, youtube_url || old[0].youtube_url, newPoints, newGdId, newLegacy, params.id]
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
    const [old] = await query('SELECT position FROM levels WHERE id = ? LIMIT 1', [params.id]);
    if (!old.length) return Response.json({ error: 'No encontrado' }, { status: 404 });
    await query('DELETE FROM levels WHERE id = ?', [params.id]);
    await query('UPDATE levels SET position = position - 1 WHERE position > ?', [old[0].position]);

    invalidateLevelsCache();
    invalidatePlayersCache();
    return Response.json({ success: true });
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
