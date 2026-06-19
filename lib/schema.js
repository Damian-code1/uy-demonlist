import { query } from './db.js';

let schemaReady = false;

export async function ensureSchema() {
  if (schemaReady) return;

  try {
    const [cols] = await query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'linked_player_name'`
    );
    if (!cols.length) {
      await query(
        `ALTER TABLE users ADD COLUMN linked_player_name VARCHAR(255) NULL DEFAULT NULL AFTER gd_username`
      );
      console.log('[schema] Added users.linked_player_name');
    }
  } catch (e) {
    console.warn('[schema] ensureSchema warning:', e.message);
  }

  schemaReady = true;
}
