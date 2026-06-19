import { query } from '../../../../lib/db.js';
import { getUserFromRequest } from '../../../../lib/auth.js';

export async function GET(req) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ favorites: [] });
  const [rows] = await query('SELECT favorite_levels FROM users WHERE id = ?', [user.id]);
  const favs = rows[0]?.favorite_levels || '[]';
  return Response.json({ favorites: JSON.parse(favs) });
}

export async function POST(req) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
  const { levelId, action } = await req.json();
  const [rows] = await query('SELECT favorite_levels FROM users WHERE id = ?', [user.id]);
  let favs = JSON.parse(rows[0]?.favorite_levels || '[]');
  if (action === 'add') { if (!favs.includes(levelId)) favs.push(levelId); }
  else { favs = favs.filter(id => id !== levelId); }
  await query('UPDATE users SET favorite_levels = ? WHERE id = ?', [JSON.stringify(favs), user.id]);
  return Response.json({ favorites: favs });
}