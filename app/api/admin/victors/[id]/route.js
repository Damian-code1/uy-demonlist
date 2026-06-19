import { query } from '../../../../../lib/db.js';
import { requireAdmin } from '../../../../../lib/auth.js';

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
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const [old] = await query('SELECT id FROM victors WHERE id = ? LIMIT 1', [params.id]);
    if (!old.length) return Response.json({ error: 'No encontrado' }, { status: 404 });
    await query('DELETE FROM victors WHERE id = ?', [params.id]);
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
