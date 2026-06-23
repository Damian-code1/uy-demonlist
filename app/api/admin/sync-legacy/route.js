import { query } from '../../../../lib/db.js';
import { requireAdmin } from '../../../../lib/auth.js';
import { invalidateLevelsCache } from '../../levels/route.js';

export const dynamic = 'force-dynamic';

// Dificultades de GDBrowser que significan que el nivel YA NO ES extreme demon
// (extreme = "Extreme Demon"). Todo lo demás que sea demon = insane o menor.
const NON_EXTREME_DEMON_DIFFICULTIES = [
  'Easy Demon', 'Medium Demon', 'Hard Demon', 'Insane Demon'
];

export async function POST(request) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));

    // ── Modo single: checkear + marcar un nivel específico ──
    // El cliente llama esto por cada nivel individualmente para
    // evitar el timeout serverless que ocurría con el loop completo.
    if (body.levelId) {
      const [[level]] = await query('SELECT id, name, gd_id FROM levels WHERE id = ?', [body.levelId]);
      if (!level) return Response.json({ error: 'Nivel no encontrado' }, { status: 404 });

      const url = level.gd_id
        ? `https://gdbrowser.com/api/level/${encodeURIComponent(level.gd_id)}`
        : `https://gdbrowser.com/api/search/${encodeURIComponent(level.name)}`;

      const res = await fetch(url, { headers: { 'User-Agent': 'UY-Demonlist/2.0' } });
      if (!res.ok) return Response.json({ checked: true, marked: false, skipped: true });

      const raw = await res.json();
      const lvl = level.gd_id ? raw : (Array.isArray(raw) ? raw.find(r => r.name?.toLowerCase() === level.name.toLowerCase()) || raw[0] : null);
      if (!lvl || lvl.error) return Response.json({ checked: true, marked: false, skipped: true });

      const isLegacy = NON_EXTREME_DEMON_DIFFICULTIES.includes(lvl.difficulty);
      if (isLegacy) {
        await query('UPDATE levels SET legacy = 1, updated_at = NOW() WHERE id = ?', [level.id]);
        invalidateLevelsCache();
      }

      return Response.json({ checked: true, marked: isLegacy, skipped: !isLegacy, name: level.name, difficulty: lvl.difficulty });
    }

    // ── Modo list: solo devuelve la lista de niveles a chequear ──
    // (no hace el loop, eso lo hace el cliente)
    const [levels] = await query('SELECT id, name, gd_id FROM levels WHERE legacy = 0 ORDER BY position ASC');
    return Response.json({ success: true, levels });

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}