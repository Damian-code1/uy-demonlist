import { query } from '../../../../../lib/db.js';
import { requireAdmin } from '../../../../../lib/auth.js';
import { ensureSchema, pushFeedLog } from '../../../../../lib/schema.js';
import { invalidateLevelsCache } from '../../../levels/route.js';
import { invalidatePlayersCache } from '../../../players/route.js';
import { notifyDecision, notifyBotDM } from '../../../../../lib/discordWebhook.js';

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
    await ensureSchema();

    const { status, rejection_reason, approval_note } = await request.json();
    if (!['pending','approved','rejected'].includes(status))
      return Response.json({ error: 'Status inválido' }, { status: 400 });

    const [subRows] = await query('SELECT * FROM submissions WHERE id = ? LIMIT 1', [params.id]);
    if (!subRows.length) return Response.json({ error: 'Submission no encontrada' }, { status: 404 });
    const sub = subRows[0];

    if (
      (status === 'approved' || status === 'rejected') &&
      sub.submitted_by === admin.id &&
      admin.role !== 'owner'
    ) {
      return Response.json({
        error: 'self_review',
        message: 'No podés aprobar o rechazar tu propia submission. Otro miembro del staff tiene que revisarla.',
      }, { status: 403 });
    }

    await query(
      'UPDATE submissions SET status = ?, rejection_reason = ?, approval_note = ?, reviewed_by = ?, updated_at = NOW() WHERE id = ?',
      [
        status,
        status === 'rejected' ? (rejection_reason?.trim() || null) : null,
        status === 'approved' ? (approval_note?.trim()   || null) : null,
        status === 'pending'  ? null : admin.id,
        params.id,
      ]
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
        const [existingVictor] = await query(
          'SELECT player_name FROM victors WHERE LOWER(player_name) = LOWER(?) LIMIT 1',
          [sub.username]
        );
        if (existingVictor.length) {
          victorName = existingVictor[0].player_name; 
        } else {
          const [linkedRows] = await query(
            `SELECT COALESCE(u.linked_player_name, u.gd_username) AS resolved_name
             FROM users u
             WHERE (LOWER(u.gd_username) = LOWER(?)
                OR LOWER(u.discord_username) = LOWER(?)
                OR LOWER(u.discord_display_name) = LOWER(?))
               AND (u.linked_player_name IS NOT NULL OR u.gd_username IS NOT NULL)
             LIMIT 1`,
            [sub.username, sub.username, sub.username]
          );
          if (linkedRows.length && linkedRows[0].resolved_name) {
            victorName = linkedRows[0].resolved_name;
          }
        }
      } catch (e) {
        console.warn('[submissions] link lookup failed', e);
      }
      const [existing] = await query(
        'SELECT id FROM victors WHERE level_id = ? AND LOWER(player_name) = LOWER(?) LIMIT 1',
        [levelId, victorName]
      );

      if (!existing.length) {
        const [victorInsert] = await query(
          'INSERT INTO victors (level_id, player_name, video_url) VALUES (?, ?, ?)',
          [levelId, victorName, sub.youtube_url || null]
        );
        victorAdded = true;
        console.log(`[submissions] Victor creado: ${victorName} en level ${levelId}`);

        await pushFeedLog({
          victorId:   victorInsert.insertId,
          levelId:    levelId,
          playerName: victorName,
          videoUrl:   sub.youtube_url || null,
        });
      }
    }

    let finalLevelPosition = null;
    let finalAredlPosition = null;
    let victorNumber       = null;
    let totalVictors       = null;

    if (status === 'approved' && levelId) {
      try {
        const [levelInfo] = await query('SELECT position FROM levels WHERE id = ? LIMIT 1', [levelId]);
        finalLevelPosition = levelInfo[0]?.position ?? null;

        const [allVictors] = await query(
          'SELECT player_name FROM victors WHERE level_id = ? ORDER BY id ASC',
          [levelId]
        );
        totalVictors = allVictors.length;
        const idx = allVictors.findIndex(v => v.player_name.toLowerCase() === victorName.toLowerCase());
        victorNumber = idx >= 0 ? idx + 1 : totalVictors;

        try {
          const baseUrl = process.env.NEXTAUTH_URL
            || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
          const aredlRes = await fetch(`${baseUrl}/api/aredl`, { headers: { 'User-Agent': 'UY-Demonlist-Internal/2.0' } });
          if (aredlRes.ok) {
            const { levels: aredlLevels = [] } = await aredlRes.json();
            const match = aredlLevels.find(e => e.name?.toLowerCase().trim() === sub.level_name?.toLowerCase().trim());
            finalAredlPosition = match?.position ?? null;
          }
        } catch {}
      } catch (e) {
        console.warn('[submissions] No se pudo armar info final del embed:', e.message);
      }
    }

    invalidateLevelsCache();
    invalidatePlayersCache();
    console.log('[submissions] FINISHED OK');

    const staffName = admin.discord_display_name || admin.discord_username || admin.gd_username || 'Staff';

    let submitterDiscordId = null;
    let submitterDiscordUsername = null;
    let submitterDiscordDisplayName = null;
    try {
      const [submitterRows] = await query(
        `SELECT u.discord_id, u.discord_username, u.discord_display_name FROM submissions s
         LEFT JOIN users u ON s.submitted_by = u.id
         WHERE s.id = ? LIMIT 1`,
        [params.id]
      );
      if (submitterRows[0]) {
        submitterDiscordId           = submitterRows[0]?.discord_id || null;
        submitterDiscordUsername     = submitterRows[0].discord_username || null;
        submitterDiscordDisplayName  = submitterRows[0].discord_display_name || null;
      }
    } catch (e) {
      console.warn('[submissions] No se pudo obtener discord_id del submitter:', e.message);
    }

    const playerDisplayName = submitterDiscordDisplayName || submitterDiscordUsername || sub.username;

    try {
      await notifyDecision({
        decision:        status,
        submissionId:    Number(params.id),
        levelName:       sub.level_name,
        playerName:      playerDisplayName,
        playerDiscordId: submitterDiscordId,
        staffName,
        youtubeLink:     sub.youtube_url || null,
        rejectionReason: status === 'rejected' ? (rejection_reason?.trim() || null) : null,
        approvalNote:    status === 'approved'  ? (approval_note?.trim()   || null) : null,
        isNewLevel:      newLevel,
        levelPosition:   finalLevelPosition,
        aredlPosition:   finalAredlPosition,
        victorNumber,
        totalVictors,
      });
    } catch (e) {
      console.error('[submissions] Error notificando decisión (no crítico):', e.message);
    }

    try {

      if (submitterDiscordId) {
        await notifyBotDM({
          discordId:       submitterDiscordId,
          decision:        status,
          levelName:       sub.level_name,
          staffName,
          youtubeLink:     sub.youtube_url || null,
          rejectionReason: status === 'rejected' ? (rejection_reason?.trim() || null) : null,
          approvalNote:    status === 'approved'  ? (approval_note?.trim()   || null) : null,
          isNewLevel:      newLevel,
          levelPosition:   finalLevelPosition,
          aredlPosition:   finalAredlPosition,
          victorNumber,
          totalVictors,
        });
      }
    } catch (e) {
      console.warn('[submissions] No se pudo enviar DM via bot (no crítico):', e.message);
    }

    return Response.json({ success: true, levelId, newLevel, victorAdded, levelPosition: finalLevelPosition });
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
