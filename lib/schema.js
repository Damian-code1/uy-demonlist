import { query } from './db.js';

let schemaReady = false;

async function ensureColumn(table, column, definition) {
  try {
    const [cols] = await query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (!cols.length) {
      await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`[schema] Added ${table}.${column}`);
    }
  } catch (e) {
    console.warn(`[schema] ensureColumn(${table}.${column}) warning:`, e.message);
  }
}

export async function ensureSchema() {
  if (schemaReady) return;

  await ensureColumn('users', 'linked_player_name', `VARCHAR(255) NULL DEFAULT NULL AFTER gd_username`);
  await ensureColumn('levels', 'thumbnail_url', `VARCHAR(500) NULL DEFAULT NULL`);
  await ensureColumn('levels', 'thumbnail_youtube_id', `VARCHAR(20) NULL DEFAULT NULL`);

  schemaReady = true;
}
