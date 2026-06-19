import { query } from '../../../../../lib/db.js';
import { requireAdmin } from '../../../../../lib/auth.js';

export async function PUT(request, { params }) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { name, points, completions, hardest_level } = await request.json();
    const [old] = await query('SELECT * FROM players WHERE id = ? LIMIT 1', [params.id]);
    if (!old.length) return Response.json({ error: 'No encontrado' }, { status: 404 });

    await query(
      'UPDATE players SET name = ?, points = ?, completions = ?, hardest_level = ?, updated_at = NOW() WHERE id = ?',
      [name || old[0].name, points ?? old[0].points, completions ?? old[0].completions, hardest_level ?? old[0].hardest_level, params.id]
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
    await query('DELETE FROM players WHERE id = ?', [params.id]);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
