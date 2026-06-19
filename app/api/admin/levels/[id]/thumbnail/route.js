import { query } from '../../../../../../lib/db.js';
import { requireAdmin } from '../../../../../../lib/auth.js';

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

  const { youtube_url } = await request.json();

  const youtubeId = extractYTId(youtube_url);

  if (!youtubeId) {
    return Response.json({ error: 'Video inválido' }, { status: 400 });
  }

  await query(
    `
    UPDATE levels
    SET
      custom_thumbnail_url = ?,
      custom_thumbnail_youtube_id = ?
    WHERE id = ?
    `,
    [youtube_url, youtubeId, params.id]
  );

  return Response.json({ success: true });
}

export async function DELETE(request, { params }) {
  const admin = await requireAdmin(request);

  if (!admin) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  await query(
    `
    UPDATE levels
    SET
      custom_thumbnail_url = NULL,
      custom_thumbnail_youtube_id = NULL
    WHERE id = ?
    `,
    [params.id]
  );

  return Response.json({ success: true });
}