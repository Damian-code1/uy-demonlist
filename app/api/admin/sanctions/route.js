import { query } from '../../../../lib/db.js';
import { requireSanctionsAdmin, requireOwner } from '../../../../lib/auth.js';
import { ensureSchema } from '../../../../lib/schema.js';
import { notifySanction } from '../../../../lib/discordWebhook.js';

export async function GET(request) {
  const admin = await requireSanctionsAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    await ensureSchema();

    const [users] = await query(`
      SELECT id, discord_id, discord_username, discord_display_name, discord_avatar,
             gd_username, linked_player_name, role, banned_until, ban_reason, banned_by
      FROM users
      ORDER BY (banned_until IS NOT NULL AND banned_until > NOW()) DESC, updated_at DESC
    `);

    // Conteo histórico de sanciones por usuario (incluye levantadas y vencidas,
    // no solo la activa) — se usa para mostrar "N sanciones" en vez de
    // "Sin sanciones" cuando el usuario tiene historial aunque hoy esté limpio.
    const [sanctionCounts] = await query(`
      SELECT target_discord_id, COUNT(*) AS total
      FROM sanctions_log
      GROUP BY target_discord_id
    `);
    const countsMap = {};
    sanctionCounts.forEach(row => { countsMap[row.target_discord_id] = row.total; });

    const enriched = users.map(u => ({
      ...u,
      avatar_url: u.discord_avatar
        ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.discord_avatar}.png`
        : null,
      display_label: u.discord_display_name || u.discord_username,
      is_banned: !!(u.banned_until && new Date(u.banned_until) > new Date()),
      sanctions_count: countsMap[u.discord_id] || 0,
    }));

    const [log] = await query(`
      SELECT sl.*, u.discord_avatar AS staff_avatar, u.discord_username AS staff_username,
             u.discord_display_name AS staff_display_name
      FROM sanctions_log sl
      LEFT JOIN users u ON u.discord_id = sl.banned_by_discord_id
      ORDER BY sl.created_at DESC LIMIT 200
    `);

    const enrichedLog = log.map(l => ({
      ...l,
      staff_avatar_url: l.staff_avatar
        ? `https://cdn.discordapp.com/avatars/${l.banned_by_discord_id}/${l.staff_avatar}.png`
        : null,
      staff_label: l.staff_display_name || l.staff_username || l.banned_by_label || l.banned_by,
    }));

    return Response.json({ users: enriched, log: enrichedLog });
  } catch (error) {
    console.error('[/api/admin/sanctions] GET Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const admin = await requireSanctionsAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { discordId, durationMinutes, reason } = await request.json();
    if (!discordId)        return Response.json({ error: 'discordId requerido' }, { status: 400 });
    if (!durationMinutes || durationMinutes <= 0)
      return Response.json({ error: 'Duración inválida' }, { status: 400 });

    const [targetRows] = await query(
      'SELECT id, discord_id, discord_username, discord_display_name, role FROM users WHERE discord_id = ? LIMIT 1',
      [discordId]
    );
    if (!targetRows.length) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
    const target = targetRows[0];

    if (target.discord_id === admin.discord_id && admin.role !== 'owner') {
      return Response.json({ error: 'No podés sancionarte a vos mismo' }, { status: 400 });
    }

    if (target.role === 'owner') {
      return Response.json({ error: 'No se puede sancionar al owner' }, { status: 403 });
    }

    // Jerarquía: no podés sancionar a alguien con rango igual o mayor al tuyo.
    // Usamos el mismo orden de roles que el resto del sistema (usuario < list_mod < admin < manager < owner).
    const ROLE_LEVELS = { usuario: 0, list_mod: 1, admin: 2, manager: 3, owner: 4 };
    const adminLevel  = ROLE_LEVELS[admin.role]  ?? 0;
    const targetLevel = ROLE_LEVELS[target.role] ?? 0;
    if (targetLevel >= adminLevel) {
      return Response.json({
        error: 'No podés sancionar a alguien con tu mismo rango o uno mayor',
      }, { status: 403 });
    }

    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

    await query(
      'UPDATE users SET banned_until = ?, ban_reason = ?, banned_by = ? WHERE discord_id = ?',
      [expiresAt, reason?.trim() || null, admin.discord_username, discordId]
    );

    await query(
      `INSERT INTO sanctions_log
       (discord_id, target_discord_id, display_label, reason, duration_minutes, banned_by, banned_by_discord_id, banned_by_label, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        discordId,
        discordId,
        target.discord_display_name || target.discord_username,
        reason?.trim() || null,
        durationMinutes,
        admin.id,
        admin.discord_id,
        admin.discord_username,
        expiresAt,
      ]
    );

    // Webhook de Discord
    notifySanction({
      action:           'ban',
      targetName:       target.discord_display_name || target.discord_username,
      targetUsername:   target.discord_username,
      targetDiscordId:  target.discord_id,
      targetAvatar:     target.discord_avatar || null,
      staffName:        admin.discord_display_name || admin.discord_username,
      staffUsername:    admin.discord_username,
      staffDiscordId:   admin.discord_id,
      staffAvatar:      admin.discord_avatar || null,
      reason:          reason?.trim() || null,
      durationMinutes: durationMinutes,
      expiresAt:       expiresAt,
    }).catch(() => {});

    return Response.json({ success: true, expiresAt });
  } catch (error) {
    console.error('[/api/admin/sanctions] POST Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const admin = await requireSanctionsAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const discordId = searchParams.get('discordId');
    const logId     = searchParams.get('logId');
    const clearAll  = searchParams.get('clearAll');

    // ─── Borrar UNA entrada del log (owner-only) ───
    if (logId) {
      const owner = await requireOwner(request);
      if (!owner) return Response.json({ error: 'Solo el owner puede eliminar entradas del log' }, { status: 403 });

      await query('DELETE FROM sanctions_log WHERE id = ?', [logId]);
      return Response.json({ success: true });
    }

    // ─── Limpiar TODO el log (owner-only) ───
    if (clearAll) {
      const owner = await requireOwner(request);
      if (!owner) return Response.json({ error: 'Solo el owner puede limpiar el log' }, { status: 403 });

      await query('DELETE FROM sanctions_log', []);
      return Response.json({ success: true });
    }

    // ─── Levantar sanción activa de un usuario (list_mod+, comportamiento original) ───
    if (!discordId) return Response.json({ error: 'discordId requerido' }, { status: 400 });

    // Obtener datos del usuario para el webhook antes de limpiar
    const [targetRows2] = await query(
      'SELECT discord_id, discord_username, discord_display_name, discord_avatar FROM users WHERE discord_id = ? LIMIT 1',
      [discordId]
    );
    const target2 = targetRows2[0] || null;

    await query(
      'UPDATE users SET banned_until = NULL, ban_reason = NULL, banned_by = NULL WHERE discord_id = ?',
      [discordId]
    );
    await query(
      'UPDATE sanctions_log SET lifted_early = 1 WHERE discord_id = ? AND expires_at > NOW()',
      [discordId]
    );

    // Webhook de Discord
    if (target2) {
      notifySanction({
        action:           'lift',
        targetName:       target2.discord_display_name || target2.discord_username,
        targetUsername:   target2.discord_username,
        targetDiscordId:  target2.discord_id,
        targetAvatar:     target2.discord_avatar || null,
        staffName:        admin.discord_display_name || admin.discord_username,
        staffUsername:    admin.discord_username,
        staffDiscordId:   admin.discord_id,
        staffAvatar:      admin.discord_avatar || null,
        reason:          null,
        durationMinutes: null,
        expiresAt:       null,
      }).catch(() => {});
    }

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
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,x-discord-id',
    },
  });
}