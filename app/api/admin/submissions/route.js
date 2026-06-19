import { query } from '../../../../lib/db.js';
import { requireAdmin } from '../../../../lib/auth.js';

export async function GET(request) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const [submissions] = await query('SELECT * FROM submissions ORDER BY created_at DESC LIMIT 200');
    return Response.json({ submissions });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get('filter'); // 'all' | 'approved' | 'rejected' | 'pending'

  try {
    const allowed = ['all', 'approved', 'rejected', 'pending'];
    if (!allowed.includes(filter)) return Response.json({ error: 'filter inválido' }, { status: 400 });

    const sql = filter === 'all'
      ? 'DELETE FROM submissions'
      : 'DELETE FROM submissions WHERE status = ?';
    const params = filter === 'all' ? [] : [filter];
    const [result] = await query(sql, params);
    return Response.json({ success: true, deleted: result.affectedRows });
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
