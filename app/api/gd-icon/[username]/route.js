import { createCanvas, loadImage } from 'canvas';

const iconCache = new Map();
const CACHE_TTL = 1000 * 60 * 5;

const ICON_FORMS = ['cube', 'ship', 'ball', 'ufo', 'wave', 'robot', 'spider', 'swing', 'jetpack'];
const PROFILE_ICON_FIELD = {
  cube: 'icon',
  ship: 'ship',
  ball: 'ball',
  ufo: 'ufo',
  wave: 'wave',
  robot: 'robot',
  spider: 'spider',
  swing: 'swing',
  jetpack: 'jetpack'
};
const PIXI_FORM = {
  cube: 'player',
  ship: 'ship',
  ball: 'ball',
  ufo: 'ufo',
  wave: 'wave',
  robot: 'robot',
  spider: 'spider',
  swing: 'swing',
  jetpack: 'jetpack'
};

export async function GET(request, { params }) {
  const { username } = params;
  const { searchParams } = new URL(request.url);
  const allForms = searchParams.get('all') === '1';
  const specificForm = searchParams.get('form'); 
  const key = `${username.toLowerCase().trim()}:${allForms ? 'all' : specificForm || 'active'}`;

  const cached = iconCache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    if (allForms) {
      return Response.json(cached.data, {
        headers: { 'Cache-Control': 'public, max-age=300' }
      });
    }
    return new Response(cached.buffer, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' }
    });
  }

  try {
    const profile = await fetch(`https://gdbrowser.com/api/profile/${encodeURIComponent(username)}`, {
      headers: { 'User-Agent': 'UY-Demonlist/2.0' }
    }).then(r => r.json());

    if (!profile || profile.error) {
      return allForms
        ? Response.json({ found: false }, { status: 404 })
        : new Response('Profile not found', { status: 404 });
    }

    const col1 = profile.col1RGB;
    const col2 = profile.col2RGB;
    const col3 = profile.colGRGB;

    // Si piden todos los forms, devolver JSON con las URLs de cada ícono
    if (allForms) {
      const forms = ['cube', 'ship', 'ball', 'ufo', 'wave', 'robot', 'spider', 'swing'];
      const activeForm = ICON_FORMS[profile.iconType] || 'cube';
      const icons = {};
      for (const f of forms) {
        const num = profile[PROFILE_ICON_FIELD[f]] ?? 1;
        icons[f] = {
          form: f,
          num,
          url: `/api/gd-icon/${encodeURIComponent(username)}?form=${f}`,
          active: f === activeForm,
        };
      }
      const data = { found: true, icons, activeForm, col1, col2 };
      iconCache.set(key, { data, time: Date.now() });
      return Response.json(data, {
        headers: { 'Cache-Control': 'public, max-age=300' }
      });
    }

    const form = specificForm || ICON_FORMS[profile.iconType] || 'cube';
    const iconNum = profile[PROFILE_ICON_FIELD[form]] ?? 1;

    console.log('[gd-icon] Profile data:', { col1, col2, col3, form, iconNum });

    const iconStr = `${PIXI_FORM[form]}_${String(iconNum).padStart(2, '0')}`;
    console.log('[gd-icon] Icon string:', iconStr);
    
    // te odio canvas
    const [plistRes, atlasRes] = await Promise.all([
      fetch(`https://gdbrowser.com/iconkit/icons/${iconStr}-uhd.plist`),
      fetch(`https://gdbrowser.com/iconkit/icons/${iconStr}-uhd.png`)
    ]);

    if (!plistRes.ok || !atlasRes.ok) {
      console.log('[gd-icon] Assets not found for:', iconStr, '- using GDBrowser fallback');
      return Response.redirect(`https://gdbrowser.com/icon/${username}?form=${form}&icon=${iconNum}`, 307);
    }

    const plistText = await plistRes.text();
    const frames = parsePlist(plistText);
    console.log('[gd-icon] Parsed frames:', Object.keys(frames).length);
    
    const atlasBuffer = await atlasRes.arrayBuffer();
    const atlas = await loadImage(Buffer.from(atlasBuffer));
    console.log('[gd-icon] Atlas loaded');

    const canvas = createCanvas(128, 128);
    const ctx = canvas.getContext('2d');

    const glowColor = col3 || (col2 && (col2.r > 0 || col2.g > 0 || col2.b > 0) ? col2 : col1);
    const glowFrame = frames[`${iconStr}_glow_001.png`];
    if (glowFrame) {
      drawFrame(ctx, atlas, glowFrame, 0, 0, 128, 128, glowColor);
    }

    if (form === 'ufo') {
      const domeFrame = frames[`${iconStr}_dome_001.png`];
      if (domeFrame) {
        drawFrame(ctx, atlas, domeFrame, 0, 0, 128, 128, { r: 255, g: 255, b: 255 });
      }
    }

    const col2Frame = frames[`${iconStr}_2_001.png`];
    if (col2Frame) {
      drawFrame(ctx, atlas, col2Frame, 0, 0, 128, 128, col2);
    }

    const col1Frame = frames[`${iconStr}_001.png`];
    if (col1Frame) {
      drawFrame(ctx, atlas, col1Frame, 0, 0, 128, 128, col1);
    }

    const extraFrame = frames[`${iconStr}_extra_001.png`];
    if (extraFrame) {
      drawFrame(ctx, atlas, extraFrame, 0, 0, 128, 128, { r: 255, g: 255, b: 255 });
    }

    const buffer = await canvas.toBuffer('image/png');
    iconCache.set(key, { buffer, time: Date.now() });

    return new Response(buffer, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' }
    });
  } catch (error) {
    console.error('[gd-icon] Error:', error.message);
    if (allForms) return Response.json({ found: false }, { status: 500 });
    return Response.redirect(`https://gdbrowser.com/icon/${encodeURIComponent(username)}`, 307);
  }
}

function parsePlist(plistText) {
  const frames = {};
  const frameRegex = /<key>([^<]+)<\/key>\s*<dict>\s*<key>frame<\/key>\s*<string>\{\{([^}]+)\}\}<\/string>/g;
  let match;
  while ((match = frameRegex.exec(plistText)) !== null) {
    const name = match[1];
    const coords = match[2].split(',').map(n => parseFloat(n.trim()));
    frames[name] = { x: coords[0], y: coords[1], w: coords[2], h: coords[3] };
  }
  return frames;
}

function drawFrame(ctx, atlas, frame, x, y, w, h, color) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(atlas, frame.x, frame.y, frame.w, frame.h, x, y, w, h);
  
  const imageData = ctx.getImageData(x, y, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i] * color.r / 255;
    data[i + 1] = data[i + 1] * color.g / 255;
    data[i + 2] = data[i + 2] * color.b / 255;
  }
  ctx.putImageData(imageData, x, y);
  
  ctx.restore();
}
