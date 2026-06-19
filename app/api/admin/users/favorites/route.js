import { query } from '../../../../../lib/db.js';
import { requireAuth } from '../../../../../lib/auth.js';

export async function GET(req) {
  const user = await requireAuth(req);
  if (!user) return Response.json({ favorites: [] });
  const [rows] = await query('SELECT favorite_levels FROM users WHERE id = ?', [user.id]);
  const raw = rows[0]?.favorite_levels;
  const favs = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
  return Response.json({ favorites: favs });
}

export async function POST(req) {
  const user = await requireAuth(req);
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
  const { levelId, action } = await req.json();
  const [rows] = await query('SELECT favorite_levels FROM users WHERE id = ?', [user.id]);
  const raw = rows[0]?.favorite_levels;
  let favs = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
  if (action === 'add') { if (!favs.includes(levelId)) favs.push(levelId); }
  else { favs = favs.filter(id => id !== levelId); }
  await query('UPDATE users SET favorite_levels = ? WHERE id = ?', [JSON.stringify(favs), user.id]);
  return Response.json({ favorites: favs });
}