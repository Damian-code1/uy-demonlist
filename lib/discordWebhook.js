// lib/discordWebhook.js
// Notificaciones de submissions a Discord usando Components V2.

const SUBMISSION_WEBHOOK_URL = process.env.DISCORD_SUBMISSIONS_WEBHOOK_URL
  || 'https://discord.com/api/webhooks/1517717832841039963/Q0j8bFQFp4hqNOVHo1y0RtEJXVRR2jCAoHuy-t17qYRI5xZMKEo8ceCwx2IXpmXwIFm0';

// Flags
const IS_COMPONENTS_V2 = 1 << 15;

// Component types
const T_TEXT_DISPLAY = 10;
const T_SECTION       = 9;
const T_THUMBNAIL     = 11;
const T_SEPARATOR     = 14;
const T_CONTAINER     = 17;

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

  const headerSection = {
    type: T_SECTION,
    components: [
      { type: T_TEXT_DISPLAY, content: `### 🚩 ${username}${discordUser?.id ? ` (<@${discordUser.id}>)` : ''}` },
      { type: T_TEXT_DISPLAY, content: `-# Nueva Submission · #${submissionId}` },
    ],
    accessory: { type: T_THUMBNAIL, media: { url: avatarUrl } },
  };

  const bodyParts = [
    `**Nivel:** ${levelName}`,
    `${posLine}${aredlLine}`,
    `**Video:** [Ver en YouTube](${youtubeLink})`,
  ];
  if (rawLink) bodyParts.push(`**Raw footage:** [Ver raw](${rawLink})`);

  const notesContent = notes
    ? String(notes).slice(0, 800).replace(/\n/g, '\n> ')
    : '_Vacío_';

  const containerComponents = [
    headerSection,
    { type: T_SEPARATOR, divider: true, spacing: 2 },
    { type: T_TEXT_DISPLAY, content: bodyParts.join('\n\n') },
    { type: T_SEPARATOR, divider: true, spacing: 1 },
    { type: T_TEXT_DISPLAY, content: `**📝 Notas del jugador:**\n> ${notesContent}` },
  ];

  if (thumbUrl) {
    containerComponents.push({ type: T_SEPARATOR, divider: true, spacing: 1 });
    containerComponents.push({
      type: 12, // Media Gallery
      items: [{ media: { url: thumbUrl }, description: `Thumbnail de ${levelName}` }],
    });
  }

  containerComponents.push({ type: T_SEPARATOR, divider: false, spacing: 1 });
  containerComponents.push({ type: T_TEXT_DISPLAY, content: `-# Enviado el ${fmtDate(new Date())} · ID #${submissionId}` });

  const payload = {
    username: 'UY Demonlist',
    avatar_url: 'https://uy-demonlist.vercel.app/assets/logo.png',
    flags: IS_COMPONENTS_V2,
    components: [
      {
        type: T_CONTAINER,
        accent_color: VIOLET,
        components: containerComponents,
      },
    ],
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