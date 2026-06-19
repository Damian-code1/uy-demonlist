import { query } from '../../../lib/db.js';

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 1000 * 60 * 5; // 5 min

export async function GET() {
  if (cache && (Date.now() - cacheTime) < CACHE_TTL) {
    return Response.json({ credits: cache, cached: true }, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' }
    });
  }

  try {
    const [rows] = await query(
      `SELECT discord_id, discord_username, discord_display_name, discord_avatar, role
       FROM users WHERE discord_id = '1407737422732853331' LIMIT 1`
    );
    const u = rows[0] || null;

    const credits = u ? {
      name:       u.discord_display_name || u.discord_username,
      role:       u.role,
      avatar_url: u.discord_avatar
        ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.discord_avatar}.png?size=128`
        : null,
    } : null;

    cache = credits;
    cacheTime = Date.now();

    return Response.json({ credits }, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' }
    });
  } catch (error) {
    console.error('[/api/credits] Error:', error);
    return Response.json({ credits: null, error: error.message }, { status: 500 });
  }
}