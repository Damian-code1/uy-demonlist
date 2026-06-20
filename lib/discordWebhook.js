// lib/discordWebhook.js
// Notificaciones de submissions a Discord usando embeds estándar.

const SUBMISSION_WEBHOOK_URL = process.env.DISCORD_SUBMISSIONS_WEBHOOK_URL
  || 'https://discord.com/api/webhooks/1517717832841039963/Q0j8bFQFp4hqNOVHo1y0RtEJXVRR2jCAoHuy-t17qYRI5xZMKEo8ceCwx2IXpmXwIFm0';

const DECISION_WEBHOOK_URL = process.env.DISCORD_DECISIONS_WEBHOOK_URL
  || 'https://discord.com/api/webhooks/1517744945312829522/GcaKPWytm3BmEVN7K7qyEVvarslbDOXdgqYfhNBTrbgWlGGYqB1WRfw8cBmROVf2wgmx';

const SANCTIONS_WEBHOOK_URL = process.env.DISCORD_SANCTIONS_WEBHOOK_URL
  || 'https://discord.com/api/webhooks/1517811567692091424/h_bydTCNT6U27ssgwA9YoqwFbJMoDGmUDRLhPOqHtTBeJKGrKcEXdh7noMHzH-3mnVM7';

const VIOLET  = 0x8b5cf6;
const GREEN   = 0x22c55e;
const RED     = 0xf43f5e;
const ORANGE  = 0xf97316;

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
  if (!SUBMISSION_WEBHOOK_URL) {
    console.warn('[discordWebhook] SUBMISSION_WEBHOOK_URL no configurada, omitiendo notificación');
    return;
  }

  const {
    username, levelName, position, aredlPosition, isNewLevel,
    youtubeLink, rawLink, notes, discordUser, submissionId,
  } = data;

  const ytId = extractYouTubeId(youtubeLink);
  const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null;

  const avatarUrl = discordUser?.id && discordUser?.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
    : 'https://cdn.discordapp.com/embed/avatars/0.png';

  const fields = [
    { name: '🎮 Nivel',    value: levelName, inline: true },
    { name: '📍 Posición', value: isNewLevel ? 'Nuevo (no en lista)' : `#${position ?? '?'}`, inline: true },
  ];
  if (aredlPosition) fields.push({ name: '🌐 AREDL', value: `#${aredlPosition}`, inline: true });
  fields.push({ name: '🎬 Video', value: `[Ver en YouTube](${youtubeLink})`, inline: true });
  if (rawLink) fields.push({ name: 'Raw footage', value: `[Ver raw](${rawLink})`, inline: true });
  fields.push({ name: 'Notas', value: notes ? String(notes).slice(0, 1024) : '_Sin notas_', inline: false });

  const embed = {
    color: VIOLET,
    author: {
      name: `${username}${discordUser?.id ? ` · @${discordUser.id}` : ''}`,
      icon_url: avatarUrl,
    },
    title: '🚩 Nueva Submission',
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

/**
 * Notifica en el canal de decisiones cuando se aprueba o rechaza una submission.
 *
 * @param {object} data
 * @param {'approved'|'rejected'} data.decision
 * @param {number}  data.submissionId
 * @param {string}  data.levelName
 * @param {string}  data.playerName
 * @param {string}  data.staffName       - nombre del staff que tomó la decisión
 * @param {string|null} data.youtubeLink
 * @param {string|null} data.rejectionReason
 * @param {string|null} data.approvalNote
 */
export async function notifyDecision(data) {
  if (!DECISION_WEBHOOK_URL) {
    console.warn('[discordWebhook] DECISION_WEBHOOK_URL no configurada, omitiendo notificación');
    return;
  }

  const {
    decision, submissionId, levelName, playerName, staffName, youtubeLink,
    rejectionReason, approvalNote, isNewLevel, levelPosition, aredlPosition,
    victorNumber, totalVictors,
  } = data;

  const approved = decision === 'approved';
  const color    = approved ? GREEN : RED;
  const label    = approved ? 'Aprobada' : 'Rechazada';

  const ytId     = extractYouTubeId(youtubeLink);
  const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null;

  const fields = [
    { name: '🎮 Nivel',   value: levelName,  inline: true },
    { name: '👤 Jugador', value: playerName, inline: true },
    { name: '🛡️ Staff',   value: staffName,  inline: true },
  ];

  if (approved) {
    fields.push({ name: 'Estado del nivel', value: isNewLevel ? '🆕 Nivel nuevo agregado a la lista' : 'Nivel ya existente', inline: true });
    if (levelPosition) fields.push({ name: 'Puesto en la lista', value: `#${levelPosition}`, inline: true });
    if (aredlPosition) fields.push({ name: '🌐 AREDL', value: `#${aredlPosition}`, inline: true });
    if (victorNumber)  fields.push({ name: '🏁 Número de victor', value: `${victorNumber}${totalVictors ? ` de ${totalVictors}` : ''}`, inline: true });
    if (approvalNote)  fields.push({ name: '💬 Nota del staff', value: approvalNote, inline: false });
  } else if (rejectionReason) {
    fields.push({ name: '📋 Razón del rechazo', value: rejectionReason, inline: false });
  }

  if (youtubeLink) {
    fields.push({ name: '🎬 Video', value: `[Ver en YouTube](${youtubeLink})`, inline: false });
  }

  const embed = {
    color,
    title: `${approved ? '✅' : '❌'} Submission #${submissionId} — ${label}`,
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
    const res = await fetch(DECISION_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[discordWebhook] decisions webhook error:', res.status, errText);
    }
  } catch (e) {
    console.error('[discordWebhook] fallo al enviar decision webhook:', e.message);
  }
}

/**
 * Notifica en el canal de sanciones cuando se aplica o levanta una sanción.
 *
 * @param {object} data
 * @param {'ban'|'lift'} data.action
 * @param {string}  data.targetName        - Nombre del usuario sancionado
 * @param {string}  data.targetDiscordId   - Discord ID del usuario sancionado
 * @param {string|null} data.targetAvatar  - Avatar hash del usuario sancionado
 * @param {string}  data.staffName         - Nombre del staff que sancionó
 * @param {string}  data.staffDiscordId    - Discord ID del staff
 * @param {string|null} data.staffAvatar   - Avatar hash del staff
 * @param {string|null} data.reason        - Motivo de la sanción
 * @param {number|null} data.durationMinutes - Duración en minutos
 * @param {Date|null}   data.expiresAt     - Fecha de expiración
 */
export async function notifySanction(data) {
  if (!SANCTIONS_WEBHOOK_URL) return;

  const {
    action, targetName, targetDiscordId, targetAvatar,
    staffName, staffDiscordId, staffAvatar,
    reason, durationMinutes, expiresAt,
  } = data;

  const isBan   = action === 'ban';
  const color   = isBan ? RED : GREEN;

  const targetAvatarUrl = targetDiscordId && targetAvatar
    ? `https://cdn.discordapp.com/avatars/${targetDiscordId}/${targetAvatar}.png?size=128`
    : 'https://cdn.discordapp.com/embed/avatars/0.png';

  const staffAvatarUrl = staffDiscordId && staffAvatar
    ? `https://cdn.discordapp.com/avatars/${staffDiscordId}/${staffAvatar}.png?size=128`
    : 'https://cdn.discordapp.com/embed/avatars/0.png';

  // Formatear duración legible
  function fmtDuration(mins) {
    if (!mins) return '—';
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    return parts.join(' ') || `${mins}m`;
  }

  const fields = [
    {
      name: '👤 Usuario sancionado',
      value: `**${targetName}**\n<@${targetDiscordId}>`,
      inline: true,
    },
    {
      name: '🛡️ Staff',
      value: `**${staffName}**\n<@${staffDiscordId}>`,
      inline: true,
    },
  ];

  if (isBan) {
    fields.push({
      name: '⏱️ Duración',
      value: fmtDuration(durationMinutes),
      inline: true,
    });
    fields.push({
      name: '📋 Motivo',
      value: reason ? String(reason).slice(0, 1024) : '_Sin motivo_',
      inline: false,
    });
    if (expiresAt) {
      fields.push({
        name: '📅 Expira',
        value: fmtDate(new Date(expiresAt)),
        inline: true,
      });
    }
  } else {
    fields.push({
      name: '✅ Acción',
      value: 'Sanción levantada anticipadamente',
      inline: false,
    });
  }

  const embed = {
    color,
    author: {
      name: isBan ? '🔨 Sanción aplicada' : '🔓 Sanción levantada',
      icon_url: staffAvatarUrl,
    },
    thumbnail: { url: targetAvatarUrl },
    fields,
    footer: { text: `UY Demonlist Sanciones · ${fmtDate(new Date())}` },
  };

  const payload = {
    username: 'UY Demonlist',
    avatar_url: 'https://uy-demonlist.vercel.app/assets/logo.png',
    embeds: [embed],
  };

  try {
    const res = await fetch(SANCTIONS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[discordWebhook] sanctions webhook error:', res.status, errText);
    }
  } catch (e) {
    console.error('[discordWebhook] fallo al enviar sanctions webhook:', e.message);
  }
}