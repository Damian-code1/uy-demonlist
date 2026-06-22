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

async function ensureTable(table, createSql) {
  try {
    const [tables] = await query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table]
    );
    if (!tables.length) {
      await query(createSql);
      console.log(`[schema] Created table ${table}`);
    }
  } catch (e) {
    console.warn(`[schema] ensureTable(${table}) warning:`, e.message);
  }
}

export async function ensureSchema() {
  if (schemaReady) return;

  await ensureColumn('users', 'linked_player_name', `VARCHAR(255) NULL DEFAULT NULL AFTER gd_username`);
  await ensureColumn('levels', 'thumbnail_url', `VARCHAR(500) NULL DEFAULT NULL`);
  await ensureColumn('levels', 'thumbnail_youtube_id', `VARCHAR(20) NULL DEFAULT NULL`);
  await ensureColumn('levels', 'became_top1_at', `DATETIME NULL DEFAULT NULL`);

  // Sistema de sanciones
  await ensureColumn('users', 'banned_until',          `DATETIME NULL DEFAULT NULL`);
  await ensureColumn('users', 'ban_reason',            `VARCHAR(255) NULL DEFAULT NULL`);
  await ensureColumn('users', 'banned_by',             `VARCHAR(64) NULL DEFAULT NULL`);
  await ensureColumn('users', 'discord_access_token',  `VARCHAR(512) NULL DEFAULT NULL`);

  await ensureTable('sanctions_log', `
    CREATE TABLE sanctions_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      discord_id VARCHAR(64) NOT NULL,
      target_discord_id VARCHAR(64) NOT NULL,
      display_label VARCHAR(255) NULL,
      reason VARCHAR(255) NULL,
      duration_minutes INT NOT NULL,
      banned_by VARCHAR(64) NULL,
      banned_by_discord_id VARCHAR(64) NULL,
      banned_by_label VARCHAR(255) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      lifted_early TINYINT(1) DEFAULT 0,
      INDEX idx_target_discord_id (target_discord_id),
      INDEX idx_banned_by_discord_id (banned_by_discord_id),
      INDEX idx_created_at (created_at)
    )
  `);

  await ensureColumn('sanctions_log', 'target_discord_id',    `VARCHAR(64) NOT NULL DEFAULT '' AFTER discord_id`);
  await ensureColumn('sanctions_log', 'banned_by_discord_id', `VARCHAR(64) NULL DEFAULT NULL AFTER banned_by`);

  // Historial de submissions: quién (staff) revisó y con qué nota
  await ensureColumn('submissions', 'approval_note', `TEXT NULL DEFAULT NULL AFTER rejection_reason`);
  await ensureColumn('submissions', 'reviewed_by',   `INT NULL DEFAULT NULL AFTER submitted_by`);

  // Feed de completions: campo created_at en victors para ordenar por fecha
  await ensureColumn('victors', 'created_at', `DATETIME DEFAULT CURRENT_TIMESTAMP`);

  // Feed de noticias: tabla separada que solo guarda las últimas 50 entradas
  // mostradas en el feed. No reemplaza ni borra nada de victors — victors
  // sigue siendo el historial real de records, intacto.
  await ensureTable('feed_log', `
    CREATE TABLE feed_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      victor_id INT NOT NULL,
      level_id INT NOT NULL,
      player_name VARCHAR(255) NOT NULL,
      video_url TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created_at (created_at)
    )
  `);

  schemaReady = true;
}

// Máximo de entradas que se muestran en el feed de noticias.
// Al insertar una nueva, si se supera este número se borra la más vieja
// de feed_log (la fila de victors original NO se toca).
const FEED_MAX = 50;

export async function pushFeedLog({ victorId, levelId, playerName, videoUrl }) {
  try {
    await ensureSchema();
    await query(
      'INSERT INTO feed_log (victor_id, level_id, player_name, video_url) VALUES (?, ?, ?, ?)',
      [victorId, levelId, playerName, videoUrl || null]
    );
    const [[{ total }]] = await query('SELECT COUNT(*) AS total FROM feed_log');
    if (total > FEED_MAX) {
      await query(
        `DELETE FROM feed_log ORDER BY created_at ASC, id ASC LIMIT ${total - FEED_MAX}`
      );
    }
  } catch (e) {
    console.warn('[schema] pushFeedLog warning:', e.message);
  }
}
