// app/api/submissions/route.js
import { query } from '../../../lib/db.js';
import { notifySubmission } from '../../../lib/discordWebhook.js';

export async function GET() {
  try {
    const [submissions] = await query(
      `SELECT s.*, u.discord_username as submitted_by_name
       FROM submissions s
       LEFT JOIN users u ON s.submitted_by = u.id
       ORDER BY s.created_at DESC`
    );
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
        id:     u.discord_id || null,
        avatar: u.discord_avatar || null,
      },
    }).catch(e => console.error('[/api/submissions POST] Error notificando a Discord:', e.message));

    return Response.json({ id: result.insertId, success: true }, { status: 201 });
  } catch (error) {
    console.error('[/api/submissions POST] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}