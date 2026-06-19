import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306'),
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'uy_demonlist',
  waitForConnections: true,
  connectionLimit:    20,       // más conexiones paralelas
  queueLimit:         0,
  enableKeepAlive:    true,     // mantiene conexiones vivas, evita reconexión
  keepAliveInitialDelay: 0,
  namedPlaceholders:  false,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  // Optimizaciones de velocidad
  timezone:           'Z',
  supportBigNumbers:  true,
  bigNumberStrings:   false,
  dateStrings:        false,
  multipleStatements: false,
});

// Crear índices críticos al arrancar (solo si no existen — es idempotente)
// Índices creados manualmente via phpMyAdmin — no se necesita código aquí

// Returns [rows, fields] — use destructuring: const [rows] = await query(...)
export async function query(sql, params = []) {
  const [rows, fields] = await pool.execute(sql, params);
  return [rows, fields];
}

export default pool;