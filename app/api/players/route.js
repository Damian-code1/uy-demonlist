import { query } from '../../../lib/db.js';

let serverCache = null;
let cacheTime   = 0;
const CACHE_TTL = 1000 * 30;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const bust = searchParams.get('bust');

  if (!bust && serverCache && (Date.now() - cacheTime) < CACHE_TTL) {
    return Response.json({ players: serverCache, cached: true }, {
      headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=30' }
    });
  }

  try {
    // Traer todo en 2 queries planas y joinear en JS para evitar subqueries correlacionadas
    const [victorRows] = await query(`
      SELECT
        v.player_name,
        l.position,
        l.name AS level_name,
        COALESCE(l.points, GREATEST(1, ROUND(1 + 999 * POWER((250 - LEAST(l.position, 250)) / 249, 3)))) AS pts
      FROM victors v
      JOIN levels l ON v.level_id = l.id
      ORDER BY v.player_name, l.position ASC
    `);

    const [userRows] = await query(`
  SELECT
    discord_id,
    discord_avatar,
    gd_username,
    discord_display_name,
    discord_username,
    linked_player_name,
    role
  FROM users
      WHERE gd_username IS NOT NULL
         OR discord_display_name IS NOT NULL
    `);

    // Construir mapa de usuario por posibles nombres en minúsculas
    const userMap = new Map();
    for (const u of userRows) {
      const keys = [
  u.linked_player_name?.toLowerCase(),
  u.gd_username?.toLowerCase(),
  u.discord_display_name?.toLowerCase(),
  u.discord_username?.toLowerCase(),
].filter(Boolean);
      for (const k of keys) {
        if (!userMap.has(k)) userMap.set(k, u);
      }
    }

    // Agregar stats por jugador en JS
    const playerMap = new Map();
    for (const row of victorRows) {
      const key = row.player_name.toLowerCase();
      if (!playerMap.has(key)) {
        playerMap.set(key, {
          name:            row.player_name,
          completions:     0,
          points:          0,
          hardest_level:   row.level_name,
          hardest_position: row.position,
        });
      }
      const p = playerMap.get(key);
      p.completions++;
      p.points += Number(row.pts);
      // hardest = nivel de menor posición (ya viene ORDER BY position ASC)
      if (row.position < p.hardest_position) {
        p.hardest_level    = row.level_name;
        p.hardest_position = row.position;
      }
    }

    const players = Array.from(playerMap.values())
      .map(p => {
        const u = userMap.get(p.name.toLowerCase());
        return {
          ...p,
          discord_id:           u?.discord_id           || null,
          discord_avatar:       u?.discord_avatar       || null,
          discord_display_name: u?.discord_display_name || null,
          discord_username:     u?.discord_username     || null,
          gd_username:          u?.gd_username          || null,
          linked_player_name:   u?.linked_player_name   || null,
          role:                 u?.role                 || 'usuario',
        };
      })
      .sort((a, b) => b.points - a.points);

    serverCache = players;
    cacheTime   = Date.now();

    return Response.json({ players }, {
      headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=30' }
    });
  } catch (error) {
    console.error('[/api/players] Error:', error);
    return Response.json({ players: [], error: error.message }, { status: 500 });
  }
}

export function invalidatePlayersCache() {
  serverCache = null;
  cacheTime = 0;
}