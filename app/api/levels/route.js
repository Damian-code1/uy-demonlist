import { query } from '../../../lib/db.js';

export async function GET() {
  try {
    const [dbLevels] = await query(
  'SELECT id, name, position, points, youtube_id, youtube_url FROM levels ORDER BY position ASC'
);

    for (const level of dbLevels) {
      const ytId = extractYTId(level.youtube_url);

level.thumb_url = ytId
  ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
  : null;

level.thumb_url_fallback = null;


      const [victors] = await query(
        'SELECT id, player_name, video_url FROM victors WHERE level_id = ? ORDER BY id ASC',
        [level.id]
      );

      level.victors = victors.map(v => {
        const videoUrl = v.video_url || level.youtube_url || null;
        return {
          id:       v.id,
          name:     v.player_name,
          videoUrl: videoUrl,
          videoId:  extractYTId(videoUrl),
        };
      });

      level.completionCount = victors.length;
    }

    return Response.json({ levels: dbLevels });
  } catch (error) {
    console.error('[/api/levels] Error:', error);
    return Response.json({ levels: [], error: error.message }, { status: 500 });
  }
}

function extractYTId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/);
  return m ? m[1] : null;
}