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
  const key = username.toLowerCase().trim();
  
  const cached = iconCache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return new Response(cached.buffer, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' }
    });
  }

  try {
    const profile = await fetch(`https://gdbrowser.com/api/profile/${encodeURIComponent(username)}`, {
      headers: { 'User-Agent': 'UY-Demonlist/2.0' }
    }).then(r => r.json());

    if (!profile || profile.error) {
      return new Response('Profile not found', { status: 404 });
    }

    const col1 = profile.col1RGB;
    const col2 = profile.col2RGB;
    const col3 = profile.colGRGB;
    const form = ICON_FORMS[profile.iconType] || 'cube';
    const iconNum = profile[PROFILE_ICON_FIELD[form]] ?? 1;

    const iconStr = `${PIXI_FORM[form]}_${String(iconNum).padStart(2, '0')}`;
    
    const [plistRes, atlasRes] = await Promise.all([
      fetch(`https://gdbrowser.com/iconkit/icons/${iconStr}-uhd.plist`),
      fetch(`https://gdbrowser.com/iconkit/icons/${iconStr}-uhd.png`)
    ]);

    if (!plistRes.ok || !atlasRes.ok) {
      return new Response('Icon assets not found', { status: 404 });
    }

    const plistText = await plistRes.text();
    const frames = parsePlist(plistText);
    const atlas = await loadImage(Buffer.from(await atlasRes.arrayBuffer()));

    const canvas = createCanvas(128, 128);
    const ctx = canvas.getContext('2d');

    const glowColor = col3 || (col2.r > 0 || col2.g > 0 || col2.b > 0 ? col2 : col1);
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
    console.error('[gd-icon]', error.message);
    return new Response('Error rendering icon', { status: 500 });
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
