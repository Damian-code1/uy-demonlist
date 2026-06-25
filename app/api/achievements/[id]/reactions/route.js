import { query } from '../../../../../lib/db.js';
import { requireAuth } from '../../../../../lib/auth.js';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const user = await requireAuth(request);
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });

  const { reaction } = await request.json();
  if (!['like','dislike'].includes(reaction))
    return Response.json({ error: 'Reacción inválida' }, { status: 400 });

  const achId = params.id;

  // Ver si ya hay una reacción
  const [[existing]] = await query(
    'SELECT id, reaction FROM achievement_reactions WHERE achievement_id = ? AND user_id = ?',
    [achId, user.id]
  );

  let action;
  if (!existing) {
    await query('INSERT INTO achievement_reactions (achievement_id, user_id, reaction) VALUES (?, ?, ?)',
      [achId, user.id, reaction]);
    action = 'added';
  } else if (existing.reaction === reaction) {
    await query('DELETE FROM achievement_reactions WHERE id = ?', [existing.id]);
    action = 'removed';
  } else {
    await query('UPDATE achievement_reactions SET reaction = ? WHERE id = ?', [reaction, existing.id]);
    action = 'changed';
  }

  const [[counts]] = await query(
    `SELECT
      SUM(reaction='like') AS likes,
      SUM(reaction='dislike') AS dislikes
     FROM achievement_reactions WHERE achievement_id = ?`,
    [achId]
  );

  return Response.json({ success: true, action, likes: counts.likes || 0, dislikes: counts.dislikes || 0 });
}