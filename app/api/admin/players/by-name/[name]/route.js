import { query } from '../../../../../../lib/db.js';
import { requireAdmin } from '../../../../../../lib/auth.js';
import { invalidateLevelsCache } from '../../../../levels/route.js';
import { invalidatePlayersCache } from '../../../../players/route.js';

// PUT renames a player across every victor record they have,
// and keeps users.linked_player_name in sync so Discord links don't break
export async function PUT(request, { params }) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const oldName = decodeURIComponent(params.name);
    const { newName } = await request.json();
    if (!newName?.trim()) return Response.json({ error: 'newName requerido' }, { status: 400 });
    const trimmedName = newName.trim();

    await query('UPDATE victors SET player_name = ? WHERE player_name = ?', [trimmedName, oldName]);
    await query('UPDATE users SET linked_player_name = ? WHERE linked_player_name = ?', [trimmedName, oldName]);
    try {
      await query('UPDATE players SET name = ? WHERE name = ?', [trimmedName, oldName]);
    } catch {
      // La tabla players tiene name UNIQUE — si newName ya existe ahí, no es crítico
      // (el sitio público no lee de esta tabla, solo el panel legacy de /admin/players/[id])
    }

    invalidateLevelsCache();
    invalidatePlayersCache();
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// DELETE removes every victor record for that player (effectively deletes the player),
// and clears the Discord link so it doesn't point to a name that no longer exists
export async function DELETE(request, { params }) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const name = decodeURIComponent(params.name);
    await query('DELETE FROM victors WHERE player_name = ?', [name]);
    await query('UPDATE users SET linked_player_name = NULL WHERE linked_player_name = ?', [name]);
    await query('DELETE FROM players WHERE name = ?', [name]);

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
