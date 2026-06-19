import { query } from '../../../../lib/db.js';
import { requireAdmin } from '../../../../lib/auth.js';

export async function GET(request) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const levelId = searchParams.get('level_id');

  try {
    const [victors] = levelId
      ? await query('SELECT * FROM victors WHERE level_id = ? ORDER BY id ASC', [levelId])
      : await query('SELECT v.*, l.name as level_name FROM victors v JOIN levels l ON v.level_id = l.id ORDER BY l.position ASC');
    return Response.json({ victors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { level_id, player_name, video_url } = await request.json();
    if (!level_id)            return Response.json({ error: 'level_id requerido' }, { status: 400 });
    if (!player_name?.trim()) return Response.json({ error: 'player_name requerido' }, { status: 400 });

    const [result] = await query(
      'INSERT INTO victors (level_id, player_name, video_url) VALUES (?, ?, ?)',
      [level_id, player_name.trim(), video_url?.trim() || null]
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
