import { query } from '../../../../lib/db.js';
import { ensureSchema } from '../../../../lib/schema.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await ensureSchema();

    const { searchParams } = new URL(request.url);
    const discordId = searchParams.get('uid');

    if (!discordId) return Response.json({ user: null });

    const [rows] = await query(
      `SELECT u.id, u.discord_username as name, u.discord_display_name as display_name,
              u.discord_avatar as avatar, u.discord_id, u.role, u.gd_username, u.linked_player_name,
              u.banned_until, u.ban_reason, u.discord_access_token
       FROM users u WHERE u.discord_id = ? LIMIT 1`,
      [discordId]
    );

    if (!rows.length) return Response.json({ user: null });

    const u = rows[0];

    // Refrescar avatar/displayname desde Discord sin obligar al usuario a re-loguearse.
    // Si el token expiró o falla, se usa lo que ya está en la DB — nunca rompe la sesión.
    if (u.discord_access_token) {
      try {
        const discordRes = await fetch('https://discord.com/api/v10/users/@me', {
          headers: { Authorization: `Bearer ${u.discord_access_token}` },
          signal: AbortSignal.timeout(3000),
        });
        if (discordRes.ok) {
          const fresh = await discordRes.json();
          const newAvatar      = fresh.avatar      || null;
          const newUsername    = fresh.username     || u.name;
          const newDisplayName = fresh.global_name || fresh.username || u.display_name;
          if (newAvatar !== u.avatar || newUsername !== u.name || newDisplayName !== u.display_name) {
            await query(
              `UPDATE users SET discord_avatar = ?, discord_username = ?, discord_display_name = ?, updated_at = NOW()
               WHERE discord_id = ?`,
              [newAvatar, newUsername, newDisplayName, discordId]
            );
            u.avatar       = newAvatar;
            u.name         = newUsername;
            u.display_name = newDisplayName;
          }
        }
      } catch {}
    }

    const avatarUrl = u.avatar
      ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png`
      : null;

    const linkedName = u.linked_player_name || null;
    const nameInList = linkedName || u.display_name || u.name;
    const gdName     = u.gd_username || null;

    const [statsRows] = await query(
      `SELECT
        COUNT(v.id) AS completions,
        COALESCE(SUM(COALESCE(l.points, GREATEST(1, ROUND(1 + 999 * POWER((250 - LEAST(l.position, 250)) / 249, 3))))), 0) AS points,
        (SELECT l2.name FROM levels l2 JOIN victors v2 ON v2.level_id = l2.id
         WHERE LOWER(v2.player_name) IN (LOWER(?), LOWER(COALESCE(?,'')), LOWER(COALESCE(?,'')))
         ORDER BY l2.position ASC LIMIT 1) AS hardest_level
       FROM victors v
       JOIN levels l ON v.level_id = l.id
       WHERE LOWER(v.player_name) IN (LOWER(?), LOWER(COALESCE(?,'')), LOWER(COALESCE(?,'')))`,
      [nameInList, gdName, linkedName, nameInList, gdName, linkedName]
    );
    const stats = statsRows[0] || { completions: 0, points: 0, hardest_level: null };

    const isBanned = !!(u.banned_until && new Date(u.banned_until) > new Date());

    return Response.json({
      user: {
        id:           u.id,
        name:         u.display_name || u.name,
        gdUsername:   u.gd_username || null,
        linkedPlayer: linkedName,
        discordId:    u.discord_id,
        image:        avatarUrl,
        role:         u.role,
        points:       stats.points || 0,
        completions:  stats.completions || 0,
        hardest:      stats.hardest_level || null,
        isBanned:     isBanned,
        bannedUntil:  isBanned ? u.banned_until : null,
        banReason:    isBanned ? (u.ban_reason || null) : null,
      }
    });
  } catch (error) {
    console.error('[/api/auth/session] Error:', error);
    return Response.json({ user: null });
  }
}