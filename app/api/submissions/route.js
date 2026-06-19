// app/api/submissions/route.js
import { query } from '../../../lib/db.js';

export async function GET() {
  try {
    const [submissions] = await query(
      `SELECT s.*, u.discord_username as submitted_by_name
       FROM submissions s
       LEFT JOIN users u ON s.submitted_by = u.id
       ORDER BY s.created_at DESC`
    );
    return Response.json({ submissions });
  } catch (error) {
    console.error('[/api/submissions GET] Error:', error);
    return Response.json({ submissions: [], error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { levelName, youtubeLink, rawLink, notes, userId } = body;

    if (!levelName?.trim())   return Response.json({ error: 'levelName requerido' }, { status: 400 });
    if (!youtubeLink?.trim()) return Response.json({ error: 'youtubeLink requerido' }, { status: 400 });
    if (!userId)              return Response.json({ error: 'Debes iniciar sesión' }, { status: 401 });

    // Obtener el gd_username del user autenticado
    const [userRows] = await query(
      `SELECT gd_username, discord_display_name, discord_username FROM users WHERE id = ?`,
      [userId]
    );
    if (!userRows.length) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });

    const u = userRows[0];
    const username = u.gd_username || u.discord_display_name || u.discord_username;

    const [result] = await query(
      `INSERT INTO submissions (username, level_name, youtube_url, raw_url, percentage, is_100, notes, status, submitted_by)
       VALUES (?, ?, ?, ?, 100, 1, ?, 'pending', ?)`,
      [
        username,
        levelName.trim(),
        youtubeLink.trim(),
        rawLink?.trim() || null,
        notes?.trim() || null,
        userId
      ]
    );

    return Response.json({ id: result.insertId, success: true }, { status: 201 });
  } catch (error) {
    console.error('[/api/submissions POST] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}