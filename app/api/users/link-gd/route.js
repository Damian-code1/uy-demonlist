import { query } from '../../../../lib/db.js';
import { requireAuth } from '../../../../lib/auth.js';

export async function DELETE(request) {
  const user = await requireAuth(request);
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });

  await query(
    'UPDATE users SET gd_username = NULL WHERE discord_id = ?',
    [user.discord_id]
  );

  return Response.json({ ok: true });
}

export async function POST(request) {
  const user = await requireAuth(request);
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const { gd_username } = await request.json();
  const nick = gd_username?.trim();
  if (!nick) return Response.json({ error: 'Nick inválido' }, { status: 400 });

  // Validar que la cuenta existe de verdad en Geometry Dash via GDBrowser
  try {
    const gdRes = await fetch(`https://gdbrowser.com/api/profile/${encodeURIComponent(nick)}`, {
      headers: { 'User-Agent': 'UY-Demonlist/2.0' }
    });
    const gdData = await gdRes.json();

    if (!gdRes.ok || gdData.error || !gdData.username) {
      return Response.json({ error: 'Esa cuenta de Geometry Dash no existe' }, { status: 404 });
    }
  } catch (e) {
    return Response.json({ error: 'No se pudo verificar la cuenta con GDBrowser, intentá de nuevo' }, { status: 503 });
  }

  // Verificar que nadie más lo tiene vinculado (case-insensitive)
  const [[taken]] = await query(
    'SELECT id FROM users WHERE LOWER(gd_username) = LOWER(?) AND discord_id != ?',
    [nick, user.discord_id]
  );
  if (taken) return Response.json({ error: 'Ese nick ya está vinculado a otra cuenta' }, { status: 409 });

  await query(
    'UPDATE users SET gd_username = ? WHERE discord_id = ?',
    [nick, user.discord_id]
  );

  return Response.json({ ok: true });
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