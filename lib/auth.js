import { query } from './db.js';

const ADMIN_ROLES = ['owner', 'admin', 'list_mod'];

export async function requireAdmin(request) {
  // Get discord ID from header (sent by frontend)
  const discordId = request.headers.get('x-discord-id');
  if (!discordId) return null;

  try {
    const [rows] = await query(
      'SELECT id, discord_username, role FROM users WHERE discord_id = ? LIMIT 1',
      [discordId]
    );
    const user = rows[0];
    if (!user || !ADMIN_ROLES.includes(user.role)) return null;
    return user;
  } catch {
    return null;
  }
}

const POINTS_ROLES = ['owner', 'admin'];

export async function requirePointsAdmin(request) {
  const discordId = request.headers.get('x-discord-id');
  if (!discordId) return null;
  try {
    const [rows] = await query(
      'SELECT id, discord_username, role FROM users WHERE discord_id = ? LIMIT 1',
      [discordId]
    );
    const user = rows[0];
    if (!user || !POINTS_ROLES.includes(user.role)) return null;
    return user;
  } catch {
    return null;
  }
}

export async function requireAuth(request) {
  const discordId = request.headers.get('x-discord-id');
  if (!discordId) return null;

  try {
    const [rows] = await query(
      'SELECT id, discord_id, discord_username, discord_display_name, gd_username, role FROM users WHERE discord_id = ? LIMIT 1',
      [discordId]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}
