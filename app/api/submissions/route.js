// app/api/submissions/route.js
import { query } from '../../../lib/db.js';
import { notifySubmission } from '../../../lib/discordWebhook.js';
import { requireAuth } from '../../../lib/auth.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    const baseQuery = `
      SELECT
        s.*,
        u.discord_username as submitted_by_name,
        r.id               as reviewer_id,
        r.discord_id        as reviewer_discord_id,
        r.discord_username  as reviewer_username,
        r.discord_display_name as reviewer_display_name,
        r.discord_avatar    as reviewer_avatar
      FROM submissions s
      LEFT JOIN users u ON s.submitted_by = u.id
      LEFT JOIN users r ON s.reviewed_by  = r.id
      ${userId ? 'WHERE s.submitted_by = ?' : ''}
      ORDER BY s.created_at DESC
    `;

    const [rows] = userId
      ? await query(baseQuery, [userId])
      : await query(baseQuery);

    const submissions = rows.map(s => ({
      ...s,
      reviewer: s.reviewer_id ? {
        id:           s.reviewer_id,
        discordId:    s.reviewer_discord_id,
        username:     s.reviewer_username,
        displayName:  s.reviewer_display_name || s.reviewer_username,
        avatarUrl:    s.reviewer_avatar
          ? `https://cdn.discordapp.com/avatars/${s.reviewer_discord_id}/${s.reviewer_avatar}.png`
          : null,
      } : null,
    }));

    return Response.json({ submissions });
  } catch (error) {
    console.error('[/api/submissions GET] Error:', error);
    return Response.json({ submissions: [], error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { levelName, youtubeLink, rawLink, notes, userId, levelPosition, aredlPosition, isNewLevel } = body;

    if (!levelName?.trim())   return Response.json({ error: 'levelName requerido' }, { status: 400 });
    if (!youtubeLink?.trim()) return Response.json({ error: 'youtubeLink requerido' }, { status: 400 });
    if (!userId)              return Response.json({ error: 'Debes iniciar sesión' }, { status: 401 });

    // Obtener el gd_username del user autenticado
    const [userRows] = await query(
      `SELECT gd_username, discord_display_name, discord_username, discord_id, discord_avatar, banned_until, ban_reason FROM users WHERE id = ?`,
      [userId]
    );
    if (!userRows.length) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });

    const u = userRows[0];

    if (u.banned_until && new Date(u.banned_until) > new Date()) {
      return Response.json({
        error: 'sanctioned',
        message: 'No podés enviar submissions mientras estás sancionado.',
        bannedUntil: u.banned_until,
        reason: u.ban_reason || null,
      }, { status: 403 });
    }
    const username = u.gd_username || u.discord_display_name || u.discord_username;

    // Verificar que no exista ya una submission pendiente del mismo user para el mismo nivel
    const [dupRows] = await query(
      `SELECT id FROM submissions WHERE submitted_by = ? AND level_name = ? AND status = 'pending' LIMIT 1`,
      [userId, levelName.trim()]
    );
    if (dupRows.length) {
      return Response.json({
        error: 'duplicate_pending',
        message: `Ya tenés una submission pendiente para "${levelName.trim()}". Esperá a que sea revisada antes de enviar otra.`,
      }, { status: 409 });
    }

    // Verificar que el usuario NO sea ya victor de este nivel (no se puede volver
    // a enviar un nivel que ya está completado y aprobado en su nombre).
    const possibleNames = [u.gd_username, u.discord_display_name, u.discord_username].filter(Boolean);
    if (possibleNames.length) {
      const placeholders = possibleNames.map(() => 'LOWER(?)').join(',');
      const [victorRows] = await query(
        `SELECT v.id FROM victors v
         JOIN levels l ON v.level_id = l.id
         WHERE LOWER(l.name) = LOWER(?) AND LOWER(v.player_name) IN (${placeholders})
         LIMIT 1`,
        [levelName.trim(), ...possibleNames]
      );
      if (victorRows.length) {
        return Response.json({
          error: 'already_victor',
          message: `Ya estás registrado como victor de "${levelName.trim()}". No podés volver a enviar este nivel.`,
        }, { status: 409 });
      }
    }

    const [result] = await query(
      `INSERT INTO submissions (username, level_name, youtube_url, raw_url, percentage, is_100, notes, status, submitted_by)
       VALUES (?, ?, ?, ?, 100, 1, ?, 'pending', ?)`,
      [
        username,
        levelName.trim(),
        youtubeLink.trim(),
        rawLink?.trim() || null,
        notes?.trim() || null,
        userId
      ]
    );

    // Si el frontend no mandó la posición (llamada vieja / directa a la API),
    // buscamos al menos la posición en nuestra lista como fallback.
    let fallbackPosition = null;
    if (levelPosition == null && !isNewLevel) {
      try {
        const [levelRows] = await query(
          `SELECT position FROM levels WHERE name = ? LIMIT 1`,
          [levelName.trim()]
        );
        fallbackPosition = levelRows[0]?.position ?? null;
      } catch (e) {
        console.warn('[/api/submissions POST] No se pudo buscar el nivel para el webhook:', e.message);
      }
    }

    // Avisar en Discord — no bloquea la respuesta al usuario si falla
    notifySubmission({
      submissionId:  result.insertId,
      username,
      levelName:     levelName.trim(),
      position:      levelPosition ?? fallbackPosition,
      aredlPosition: aredlPosition ?? null,
      isNewLevel:    !!isNewLevel,
      youtubeLink:   youtubeLink.trim(),
      rawLink:       rawLink?.trim() || null,
      notes:         notes?.trim() || null,
      discordUser: {
        id:          u.discord_id || null,
        avatar:      u.discord_avatar || null,
        username:    u.discord_username || null,
        displayName: u.discord_display_name || null,
      },
    }).catch(e => console.error('[/api/submissions POST] Error notificando a Discord:', e.message));

    return Response.json({ id: result.insertId, success: true }, { status: 201 });
  } catch (error) {
    console.error('[/api/submissions POST] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/submissions?id=X — el usuario elimina su propia submission del historial
// Solo funciona si la submission le pertenece y NO está pendiente.
export async function DELETE(request) {
  const user = await requireAuth(request);
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get('id'));
    if (!id) return Response.json({ error: 'ID requerido' }, { status: 400 });

    // Buscar la submission junto con el id interno del usuario autenticado
    const [[dbUser]] = await query(
      'SELECT id FROM users WHERE discord_id = ? LIMIT 1',
      [user.discord_id]
    );
    if (!dbUser) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });

    const [[sub]] = await query(
      'SELECT id, submitted_by, status FROM submissions WHERE id = ? LIMIT 1',
      [id]
    );
    if (!sub) return Response.json({ error: 'No encontrada' }, { status: 404 });

    // Verificar pertenencia (submitted_by es el id interno del usuario)
    if (sub.submitted_by !== dbUser.id)
      return Response.json({ error: 'No autorizado' }, { status: 403 });

    // No se puede eliminar una submission que está esperando revisión
    if (sub.status === 'pending')
      return Response.json({ error: 'pending', message: 'Esta submission está siendo revisada por el staff. No podés eliminarla mientras esté pendiente.' }, { status: 409 });

    await query('DELETE FROM submissions WHERE id = ?', [id]);
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}