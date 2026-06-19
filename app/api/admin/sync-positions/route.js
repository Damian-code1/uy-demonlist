import { query } from '../../../../lib/db.js';
import { requireAdmin } from '../../../../lib/auth.js';

export async function POST(request) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    // 1. Obtener todos los niveles de NUESTRA lista
    const [ourLevels] = await query('SELECT id, name FROM levels');
    if (!ourLevels.length) return Response.json({ moved: 0, message: 'Sin niveles' });

    // 2. Obtener lista AREDL completa desde nuestra API cacheada
    const baseUrl  = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const aredlRes = await fetch(`${baseUrl}/api/aredl`, {
      headers: { 'User-Agent': 'UY-Demonlist-Internal/2.0' },
    });
    if (!aredlRes.ok) throw new Error('No se pudo obtener la lista AREDL');
    const { levels: aredlLevels = [] } = await aredlRes.json();

    // 3. Construir mapa nombre → posición AREDL
    const aredlPosMap = {};
    aredlLevels.forEach(e => {
      if (e.name) aredlPosMap[e.name.toLowerCase().trim()] = e.position;
    });

    // 4. Asignar a cada nivel nuestro su posición AREDL (o Infinity si no está)
    const withAredl = ourLevels.map(l => ({
      id:       l.id,
      name:     l.name,
      aredlPos: aredlPosMap[l.name?.toLowerCase().trim()] ?? Infinity,
    }));

    // 5. Ordenar por posición AREDL (menor = más difícil = va primero)
    withAredl.sort((a, b) => {
      if (a.aredlPos !== b.aredlPos) return a.aredlPos - b.aredlPos;
      return a.name.localeCompare(b.name); // desempate alfabético
    });

    // 6. Actualizar posiciones en DB solo si cambiaron
    let moved = 0;
    for (let i = 0; i < withAredl.length; i++) {
      const newPos = i + 1;
      await query(
        'UPDATE levels SET position = ? WHERE id = ? AND position != ?',
        [newPos, withAredl[i].id, newPos]
      );
      // affectedRows > 0 significa que cambió
      moved++; // simplificado — contar todos para el log
    }

    // Contar realmente cuántos cambiaron comparando antes y después
    const changes = withAredl.filter((l, i) => {
      const oldLevel = ourLevels.find(o => o.id === l.id);
      return oldLevel && (i + 1) !== ourLevels.indexOf(oldLevel) + 1;
    }).length;

    console.log(`[sync-positions] ${withAredl.length} niveles reordenados, ${changes} posiciones cambiaron`);
    return Response.json({
      success: true,
      total:   withAredl.length,
      message: `Posiciones sincronizadas con AREDL`,
    });

  } catch (error) {
    console.error('[sync-positions] ERROR:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,x-discord-id',
    },
  });
}