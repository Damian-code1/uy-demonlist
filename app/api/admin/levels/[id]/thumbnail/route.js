import { query } from '../../../../../../lib/db.js';
import { requireAdmin } from '../../../../../../lib/auth.js';
import { ensureSchema } from '../../../../../../lib/schema.js';

function extractYTId(url) {
  if (!url) return null;

  const m = url.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
  );

  return m ? m[1] : null;
}

export async function PUT(request, { params }) {
  const admin = await requireAdmin(request);

  if (!admin) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  await ensureSchema();

  const { youtube_url } = await request.json();

  const youtubeId = extractYTId(youtube_url);

  if (!youtubeId) {
    return Response.json({ error: 'Link inválido: no es una URL de YouTube' }, { status: 400 });
  }

  try {
    await query(
      `
      UPDATE levels
      SET
        thumbnail_url = ?,
        thumbnail_youtube_id = ?
      WHERE id = ?
      `,
      [youtube_url, youtubeId, params.id]
    );
  } catch (error) {
    console.error('[thumbnail PUT] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}

export async function DELETE(request, { params }) {
  const admin = await requireAdmin(request);

  if (!admin) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  await ensureSchema();

  try {
    await query(
      `
      UPDATE levels
      SET
        thumbnail_url = NULL,
        thumbnail_youtube_id = NULL
      WHERE id = ?
      `,
      [params.id]
    );
  } catch (error) {
    console.error('[thumbnail DELETE] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}