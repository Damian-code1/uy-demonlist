import { query } from '../../../../lib/db.js';
import { requireAdmin } from '../../../../lib/auth.js';

export async function GET(request) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const [levels] = await query('SELECT * FROM levels ORDER BY position ASC');
    for (const level of levels) {
      const [v] = await query('SELECT COUNT(*) as count FROM victors WHERE level_id = ?', [level.id]);
      level.victorCount = v[0]?.count || 0;
    }
    return Response.json({ levels });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { name, position } = await request.json();
    if (!name?.trim()) return Response.json({ error: 'name requerido' }, { status: 400 });
    if (!position)     return Response.json({ error: 'position requerido' }, { status: 400 });

    await query('UPDATE levels SET position = position + 1 WHERE position >= ?', [position]);
    const [result] = await query(
      'INSERT INTO levels (name, position) VALUES (?, ?)',
      [name.trim(), position]
    );
    return Response.json({ id: result.insertId, success: true }, { status: 201 });
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
