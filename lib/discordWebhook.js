// lib/discordWebhook.js
// Notificaciones de submissions a Discord usando embeds estándar.

const SUBMISSION_WEBHOOK_URL = process.env.DISCORD_SUBMISSIONS_WEBHOOK_URL
  || 'https://discord.com/api/webhooks/1517717832841039963/Q0j8bFQFp4hqNOVHo1y0RtEJXVRR2jCAoHuy-t17qYRI5xZMKEo8ceCwx2IXpmXwIFm0';

const VIOLET = 0x8b5cf6;

function extractYouTubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/);
  return m ? m[1] : null;
}

function fmtDate(d) {
  try {
    return new Intl.DateTimeFormat('es-UY', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Montevideo',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/**
 * Envía a Discord el aviso de una nueva submission usando Components V2.
 *
 * @param {object} data
 * @param {string} data.username        - Nombre del jugador (gd_username o display name)
 * @param {string} data.levelName       - Nombre del nivel
 * @param {number|null} data.position   - Posición actual del nivel en la lista (null si es nivel nuevo)
 * @param {number|null} data.aredlPosition - Posición en AREDL (si aplica)
 * @param {boolean} data.isNewLevel     - Si el nivel todavía no está en la lista
 * @param {string} data.youtubeLink     - Link del video
 * @param {string|null} data.rawLink    - Link del raw footage
 * @param {string|null} data.notes      - Notas del usuario
 * @param {object|null} data.discordUser - { id, username, displayName, avatar }
 * @param {number} data.submissionId    - id insertado en la DB
 */
export async function notifySubmission(data) {
  if (!SUBMISSION_WEBHOOK_URL) return;

  const {
    username, levelName, position, aredlPosition, isNewLevel,
    youtubeLink, rawLink, notes, discordUser, submissionId,
  } = data;

  const ytId = extractYouTubeId(youtubeLink);
  const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null;

  const avatarUrl = discordUser?.id && discordUser?.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
    : 'https://cdn.discordapp.com/embed/avatars/0.png';

  const posLine = isNewLevel
    ? '🆕 **Nivel nuevo** — no está en la lista todavía'
    : `🏆 **Puesto #${position ?? '?'}** en la lista`;

  const aredlLine = aredlPosition ? `\n🌐 AREDL #${aredlPosition}` : '';

  const fields = [
    { name: '🏆 Posición', value: isNewLevel ? '🆕 Nivel nuevo (no en lista)' : `#${position ?? '?'} en la lista`, inline: true },
  ];
  if (aredlPosition) fields.push({ name: '🌐 AREDL', value: `#${aredlPosition}`, inline: true });
  fields.push({ name: '🎬 Video', value: `[Ver en YouTube](${youtubeLink})`, inline: false });
  if (rawLink) fields.push({ name: '📹 Raw footage', value: `[Ver raw](${rawLink})`, inline: false });
  fields.push({ name: '📝 Notas', value: notes ? String(notes).slice(0, 1024) : '_Vacío_', inline: false });

  const embed = {
    color: VIOLET,
    author: {
      name: `${username}${discordUser?.id ? ` (@${discordUser.id})` : ''}`,
      icon_url: avatarUrl,
    },
    title: `🚩 Nueva Submission — ${levelName}`,
    fields,
    footer: { text: `Submission #${submissionId} · ${fmtDate(new Date())}` },
  };
  if (thumbUrl) embed.thumbnail = { url: thumbUrl };

  const payload = {
    username: 'UY Demonlist',
    avatar_url: 'https://uy-demonlist.vercel.app/assets/logo.png',
    embeds: [embed],
  };

  try {
    const res = await fetch(SUBMISSION_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[discordWebhook] webhook respondió error:', res.status, errText);
    }
  } catch (e) {
    console.error('[discordWebhook] fallo al enviar webhook:', e.message);
  }
}