import { query } from '../../../../../lib/db.js';
import { requireAdmin } from '../../../../../lib/auth.js';
import { invalidateLevelsCache } from '../../../levels/route.js';

export async function PUT(request) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { levelId, order } = await request.json();
    if (!levelId || !Array.isArray(order)) return Response.json({ error: 'levelId y order requeridos' }, { status: 400 });

    for (let i = 0; i < order.length; i++) {
      await query('UPDATE victors SET sort_order = ? WHERE id = ? AND level_id = ?', [i, order[i], levelId]);
    }

    invalidateLevelsCache();
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,x-discord-id',
    },
  });
}