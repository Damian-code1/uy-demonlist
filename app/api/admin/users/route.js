import { query } from '../../../../lib/db.js';
import { requireOwner } from '../../../../lib/auth.js';
import { ensureSchema } from '../../../../lib/schema.js';

export async function GET(request) {
  const owner = await requireOwner(request);
  if (!owner) return Response.json({ error: 'Solo el owner puede acceder' }, { status: 401 });

  try {
    await ensureSchema();

    const [users] = await query(`
      SELECT
        u.id, u.discord_id, u.discord_username, u.discord_display_name,
        u.discord_avatar, u.gd_username, u.linked_player_name, u.role, u.updated_at
      FROM users u
      ORDER BY u.updated_at DESC
    `);

    const [leaderboardNames] = await query(`
      SELECT DISTINCT player_name AS name
      FROM victors
      ORDER BY player_name ASC
    `);

    const enriched = users.map(u => ({
      ...u,
      avatar_url: u.discord_avatar
        ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.discord_avatar}.png`
        : null,
      display_label: u.discord_display_name || u.discord_username,
    }));

    return Response.json({
      users: enriched,
      leaderboardNames: leaderboardNames.map(r => r.name),
    });
  } catch (error) {
    console.error('[/api/admin/users] GET Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,x-discord-id',
    },
  });
}
