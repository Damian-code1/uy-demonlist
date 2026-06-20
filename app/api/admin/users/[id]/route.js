import { query } from '../../../../../lib/db.js';
import { requireOwner, requireManager } from '../../../../../lib/auth.js';
import { ensureSchema } from '../../../../../lib/schema.js';

const ALLOWED_ROLES = ['owner', 'manager', 'admin', 'list_mod', 'usuario'];

export async function PUT(request, { params }) {
  const owner = await requireManager(request);
  if (!owner) return Response.json({ error: 'No tenés permiso para modificar usuarios' }, { status: 401 });

  try {
    await ensureSchema();

    const body = await request.json();
    const { linked_player_name, role, gd_username } = body;

    const [rows] = await query('SELECT id, role FROM users WHERE id = ? LIMIT 1', [params.id]);
    if (!rows.length) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });

    const target = rows[0];

    if (target.role === 'owner' && role && role !== 'owner' && target.id !== owner.id) {
      return Response.json({ error: 'No podés quitar el rol owner a otro owner' }, { status: 400 });
    }

    // Un manager no puede degradar a otro manager — solo el owner puede hacerlo.
    if (target.role === 'manager' && role && role !== 'manager' && owner.role !== 'owner') {
      return Response.json({ error: 'No podés modificar el rol de otro manager' }, { status: 403 });
    }

    // Nadie puede cambiar su PROPIO rol — ni el owner ni el manager pueden
    // demotearse (ni "ascenderse") a sí mismos. Solo otro usuario con permisos
    // puede modificar el rol de uno. Esto reemplaza la validación vieja que solo
    // bloqueaba auto-demote cuando target.role === 'owner'.
    if (target.id === owner.id && role !== undefined && role !== target.role) {
      return Response.json({ error: 'No podés cambiar tu propio rol' }, { status: 400 });
    }

    const updates = [];
    const values  = [];

    if (linked_player_name !== undefined) {
      const name = linked_player_name?.trim() || null;
      if (name) {
        const [exists] = await query(
          'SELECT COUNT(*) AS cnt FROM victors WHERE LOWER(player_name) = LOWER(?)',
          [name]
        );
        if (!exists[0]?.cnt) {
          return Response.json({ error: `No hay victors con el nombre "${name}" en el leaderboard` }, { status: 400 });
        }
      }
      updates.push('linked_player_name = ?');
      values.push(name);
    }

    if (gd_username !== undefined) {
      updates.push('gd_username = ?');
      values.push(gd_username?.trim() || null);
    }

    if (role !== undefined) {
      if (!ALLOWED_ROLES.includes(role)) {
        return Response.json({ error: 'Rol inválido' }, { status: 400 });
      }
      // Defensa en profundidad: solo un owner puede otorgar 'owner' o 'manager'.
      if ((role === 'owner' || role === 'manager') && owner.role !== 'owner') {
        return Response.json({ error: 'Solo el owner puede otorgar el rol owner o manager' }, { status: 403 });
      }
      updates.push('role = ?');
      values.push(role);
    }

    if (!updates.length) {
      return Response.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    updates.push('updated_at = NOW()');
    values.push(params.id);

    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

    return Response.json({ success: true });
  } catch (error) {
    console.error('[/api/admin/users/:id] PUT Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
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
