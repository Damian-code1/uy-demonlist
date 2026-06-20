import { query } from './db.js';
import { SANCTIONS_ROLES, STAFF_SANCTIONS_ROLES, POINTS_ROLES, MANAGER_ROLES, OWNER_ROLES, hasRole } from './roles.js';

async function getUserByDiscordId(discordId) {
  if (!discordId) return null;
  try {
    const [rows] = await query(
      'SELECT id, discord_id, discord_username, role FROM users WHERE discord_id = ? LIMIT 1',
      [discordId]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

// Admin panel (niveles, victors, submissions) — list_mod+
export async function requireAdmin(request) {
  const discordId = request.headers.get('x-discord-id');
  const user = await getUserByDiscordId(discordId);
  if (!user || !hasRole(user.role, SANCTIONS_ROLES)) return null;
  return user;
}

// Panel exclusivo del owner
export async function requireOwner(request) {
  const discordId = request.headers.get('x-discord-id');
  const user = await getUserByDiscordId(discordId);
  if (!user || !hasRole(user.role, OWNER_ROLES)) return null;
  return user;
}

// Panel Manager (antes "owner panel" de vinculación/roles) — manager+
export async function requireManager(request) {
  const discordId = request.headers.get('x-discord-id');
  const user = await getUserByDiscordId(discordId);
  if (!user || !hasRole(user.role, MANAGER_ROLES)) return null;
  return user;
}

// Editar puntos — admin+
export async function requirePointsAdmin(request) {
  const discordId = request.headers.get('x-discord-id');
  const user = await getUserByDiscordId(discordId);
  if (!user || !hasRole(user.role, POINTS_ROLES)) return null;
  return user;
}

// Panel de Sanciones — admin+ (admin, manager, owner — NO list_mod)
export async function requireSanctionsAdmin(request) {
  const discordId = request.headers.get('x-discord-id');
  const user = await getUserByDiscordId(discordId);
  if (!user || !hasRole(user.role, STAFF_SANCTIONS_ROLES)) return null;
  return user;
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