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
    const [levels] = await query('SELECT id, name, gd_id FROM levels WHERE legacy = 0');
    const results = { updated: 0, skipped: 0, errors: 0 };

    for (const level of levels) {
      try {
        const gdId = level.gd_id;
        const url  = gdId
          ? `/api/gdbrowser?id=${encodeURIComponent(gdId)}`
          : `/api/gdbrowser?name=${encodeURIComponent(level.name)}`;

        // Llamar al propio API (server-side self-call)
        const origin = request.headers.get('origin') || 'https://uy-demonlist.vercel.app';
        const res  = await fetch(`${origin}${url}`, {
          headers: { 'User-Agent': 'UY-Demonlist-Internal/2.0' }
        });
        if (!res.ok) { results.skipped++; continue; }

        const gd = await res.json();
        if (!gd?.found || !gd.difficulty) { results.skipped++; continue; }

        if (NON_EXTREME_DEMON_DIFFICULTIES.includes(gd.difficulty)) {
          await query('UPDATE levels SET legacy = 1, updated_at = NOW() WHERE id = ?', [level.id]);
          results.updated++;
          console.log(`[sync-legacy] Marcado legacy: ${level.name} (${gd.difficulty})`);
        } else {
          results.skipped++;
        }

        // Rate limit gentil: esperar 300ms entre requests a GDBrowser
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.warn(`[sync-legacy] Error en ${level.name}:`, e.message);
        results.errors++;
      }
    }

    invalidateLevelsCache();
    return Response.json({ success: true, ...results });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}