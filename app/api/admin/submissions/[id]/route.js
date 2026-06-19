import { query } from '../../../../../lib/db.js';
import { requireAdmin } from '../../../../../lib/auth.js';
import { invalidateLevelsCache } from '../../../levels/route.js';
import { invalidatePlayersCache } from '../../../players/route.js';

function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
  );
  return m ? m[1] : null;
}

export async function PUT(request, { params }) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { status, rejection_reason } = await request.json();
    if (!['pending','approved','rejected'].includes(status))
      return Response.json({ error: 'Status inválido' }, { status: 400 });

    const [subRows] = await query('SELECT * FROM submissions WHERE id = ? LIMIT 1', [params.id]);
    if (!subRows.length) return Response.json({ error: 'Submission no encontrada' }, { status: 404 });
    const sub = subRows[0];

    await query(
      'UPDATE submissions SET status = ?, rejection_reason = ?, updated_at = NOW() WHERE id = ?',
      [status, status === 'rejected' ? (rejection_reason?.trim() || null) : null, params.id]
    );

    let levelId = null;
    let newLevel = false;
    let victorAdded = false;

    if (status === 'approved') {
      console.log('========================');
      console.log('APPROVING SUBMISSION:', params.id, sub.level_name, '→', sub.username);
      console.log('========================');

      const [levelRows] = await query(
        'SELECT id FROM levels WHERE LOWER(name) = LOWER(?) LIMIT 1',
        [sub.level_name]
      );

      if (levelRows.length) {
        levelId = levelRows[0].id;
        console.log(`[submissions] Nivel existente id=${levelId}`);
      } else {
        newLevel = true;
        const [[maxRow]]  = await query('SELECT MAX(position) as maxPos FROM levels');
        const totalLevels = maxRow?.maxPos || 0;

        let targetPos    = totalLevels + 1;
        let ytId         = extractYouTubeId(sub.youtube_url);
        let aredlVideoId = null;

        try {
          const baseUrl = process.env.NEXTAUTH_URL
            || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
          const aredlRes = await fetch(`${baseUrl}/api/aredl`, {
            headers: { 'User-Agent': 'UY-Demonlist-Internal/2.0' },
          });

          if (aredlRes.ok) {
            const { levels: aredlLevels = [] } = await aredlRes.json();
            const nameLower = sub.level_name?.toLowerCase().trim();
            const match     = aredlLevels.find(e => e.name?.toLowerCase().trim() === nameLower);

            if (match?.position) {
              const aredlPosMap = {};
              aredlLevels.forEach(e => {
                if (e.name) aredlPosMap[e.name.toLowerCase().trim()] = e.position;
              });

              const [ourLevels] = await query('SELECT name FROM levels');
              let countAbove = 0;
              ourLevels.forEach(l => {
                const ap = aredlPosMap[l.name?.toLowerCase().trim()];
                if (ap !== undefined && ap < match.position) countAbove++;
              });

              targetPos    = countAbove + 1;
              aredlVideoId = match.video_id || null;
              console.log(`[submissions] AREDL #${match.position} → pos ${targetPos}`);
            }
          }
        } catch (e) {
          console.warn('[submissions] Error consultando AREDL:', e.message);
        }

        if (targetPos <= totalLevels) {
          await query(
            'UPDATE levels SET position = position + 1 WHERE position >= ?',
            [targetPos]
          );
        }

        const thumbId = ytId || aredlVideoId || null;
        const [insertResult] = await query(
          'INSERT INTO levels (name, position, youtube_url, youtube_id, created_from_submission) VALUES (?, ?, ?, ?, ?)',
          [sub.level_name, targetPos, sub.youtube_url || null, thumbId, 1]
        );
        levelId = insertResult.insertId;
        console.log(`[submissions] Nivel "${sub.level_name}" insertado en pos ${targetPos}`);

        const [allLevels] = await query('SELECT id FROM levels ORDER BY position ASC, id ASC');
        for (let i = 0; i < allLevels.length; i++) {
          await query('UPDATE levels SET position = ? WHERE id = ?', [i + 1, allLevels[i].id]);
        }
      }
      let victorName = sub.username;

try {
  const [linkedRows] = await query(
    `
    SELECT
      u.linked_player_name
    FROM users u
    WHERE LOWER(u.discord_username) = LOWER(?)
       OR LOWER(u.discord_display_name) = LOWER(?)
    LIMIT 1
    `,
    [sub.username, sub.username]
  );

  if (
    linkedRows.length &&
    linkedRows[0].linked_player_name
  ) {
    victorName = linkedRows[0].linked_player_name;
  }
} catch (e) {
  console.warn('[submissions] link lookup failed', e);
}
      const [existing] = await query(
  'SELECT id FROM victors WHERE level_id = ? AND LOWER(player_name) = LOWER(?) LIMIT 1',
  [levelId, victorName]
);

      if (!existing.length) {
        await query(
          'INSERT INTO victors (level_id, player_name, video_url) VALUES (?, ?, ?)',
          [levelId, victorName, sub.youtube_url || null]
        );
        victorAdded = true;
        console.log(`[submissions] Victor creado: ${victorName} en level ${levelId}`);
      }
    }

    invalidateLevelsCache();
    invalidatePlayersCache();
    console.log('[submissions] FINISHED OK');
    return Response.json({ success: true, levelId, newLevel, victorAdded });
  } catch (error) {
    console.error('[submissions] ERROR:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    await query('DELETE FROM submissions WHERE id = ?', [params.id]);
    console.log('[submissions] Submission eliminada:', params.id);
    return Response.json({ success: true });
  } catch (error) {
    console.error('[submissions] ERROR:', error);
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,x-discord-id',
    },
  });
}
