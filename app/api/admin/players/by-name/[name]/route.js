import { query } from '../../../../../../lib/db.js';
import { requireAdmin } from '../../../../../../lib/auth.js';

// PUT renames a player across every victor record they have
export async function PUT(request, { params }) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const oldName = decodeURIComponent(params.name);
    const { newName } = await request.json();
    if (!newName?.trim()) return Response.json({ error: 'newName requerido' }, { status: 400 });

    await query('UPDATE victors SET player_name = ? WHERE player_name = ?', [newName.trim(), oldName]);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// DELETE removes every victor record for that player (effectively deletes the player)
export async function DELETE(request, { params }) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const name = decodeURIComponent(params.name);
    await query('DELETE FROM victors WHERE player_name = ?', [name]);
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
