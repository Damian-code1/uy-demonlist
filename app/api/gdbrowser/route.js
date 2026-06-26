const levelCache   = new Map();
const profileCache = new Map();
const TTL = 1000 * 60 * 60;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const name     = searchParams.get('name');
  const player   = searchParams.get('player');
  const levelId  = searchParams.get('id');

  if (player) {
    const key    = player.toLowerCase().trim();
    const cached = profileCache.get(key);
    if (cached && Date.now() - cached.time < TTL) return Response.json(cached.data);
    try {
      const res = await fetch(
        `https://gdbrowser.com/api/profile/${encodeURIComponent(player)}`,
        { headers: { 'User-Agent': 'UY-Demonlist/2.0' } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const p = await res.json();
      if (!p || p.error) {
        const data = { found: false };
        profileCache.set(key, { data, time: Date.now() });
        return Response.json(data);
      }
      const data = {
      found:      true,
      username:   p.username,
      playerID:   p.playerID,
      accountID:  p.accountID,
      rank:       p.globalRank,
      stars:      p.stars,
      moons:      p.moons,
      demons:     p.demons,
      diamonds:   p.diamonds,
      coins:      p.coins,
      userCoins:  p.userCoins,
      cp:         p.cp,

      iconType:   p.iconType,
      icon:       p.icon,
      ship:       p.ship,
      ball:       p.ball,
      ufo:        p.ufo,
      wave:       p.wave,
      robot:      p.robot,
      spider:     p.spider,
      swing:      p.swing,
      jetpack:    p.jetpack,

      col1RGB:    p.col1RGB,
      col2RGB:    p.col2RGB,
      colGRGB:    p.colGRGB,
      glow:       p.glow,

      gdIconUrl: `/api/gd-icon/${encodeURIComponent(p.username)}`
    };
      profileCache.set(key, { data, time: Date.now() });
      return Response.json(data);
    } catch (e) {
      console.warn('[gdbrowser/profile]', e.message);
      return Response.json({ found: false });
    }
  }

  if (levelId) {
    const key    = `id:${levelId}`;
    const cached = levelCache.get(key);
    if (cached && Date.now() - cached.time < TTL) return Response.json(cached.data);
    try {
      const res = await fetch(
        `https://gdbrowser.com/api/level/${encodeURIComponent(levelId)}`,
        { headers: { 'User-Agent': 'UY-Demonlist/2.0' } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const lvl = await res.json();
      if (!lvl || lvl.error) {
        const data = { found: false };
        levelCache.set(key, { data, time: Date.now() });
        return Response.json(data);
      }
      const data = buildLevelData(lvl);
      levelCache.set(key, { data, time: Date.now() });
      return Response.json(data);
    } catch (e) {
      console.warn('[gdbrowser/level-by-id]', e.message);
      return Response.json({ found: false });
    }
  }

  if (!name) return Response.json({ found: false });
  const key    = `name:${name.toLowerCase().trim()}`;
  const cached = levelCache.get(key);
  if (cached && Date.now() - cached.time < TTL) return Response.json(cached.data);

  try {
    const searchRes = await fetch(
      `https://gdbrowser.com/api/search/${encodeURIComponent(name)}`,
      { headers: { 'User-Agent': 'UY-Demonlist/2.0' } }
    );
    if (!searchRes.ok) throw new Error('search failed');
    const results = await searchRes.json();
    if (!Array.isArray(results) || !results.length) {
      const data = { found: false };
      levelCache.set(key, { data, time: Date.now() });
      return Response.json(data);
    }
    const exact = results.find(r => r.name?.toLowerCase() === name.toLowerCase().trim());
    const best  = exact || results[0];
    const data  = buildLevelData(best);
    levelCache.set(key, { data, time: Date.now() });
    return Response.json(data);
  } catch (error) {
    console.warn('[gdbrowser/level-by-name]', error.message);
    return Response.json({ found: false });
  }
}

function buildLevelData(lvl) {
  return {
    found:      true,
    id:         lvl.id,
    name:       lvl.name,
    author:     lvl.author,
    difficulty: lvl.difficulty,
    stars:      lvl.stars,
    length:     lvl.length,
    downloads:  lvl.downloads,
    likes:      lvl.likes,
    song:       lvl.song?.name || lvl.songName || null,
  };
}