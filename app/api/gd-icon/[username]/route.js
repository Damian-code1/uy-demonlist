import { createCanvas, loadImage } from '@napi-rs/canvas';

const iconCache   = new Map();
const CACHE_TTL   = 1000 * 60 * 5;
let   animData    = null;   // cache de /api/icons de GDB

const ICON_FORMS = ['cube', 'ship', 'ball', 'ufo', 'wave', 'robot', 'spider', 'swing', 'jetpack'];
const PROFILE_ICON_FIELD = {
  cube: 'icon', ship: 'ship', ball: 'ball', ufo: 'ufo',
  wave: 'wave', robot: 'robot', spider: 'spider', swing: 'swing', jetpack: 'jetpack',
};
const PIXI_FORM = {
  cube: 'player', ship: 'ship', ball: 'player_ball', ufo: 'bird',
  wave: 'dart', robot: 'robot', spider: 'spider', swing: 'swing', jetpack: 'jetpack',
};

async function getAnimData() {
  if (animData) return animData;
  const r = await fetch('https://gdbrowser.com/api/icons', { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const d = await r.json();
  animData = d.robotAnimations;
  return animData;
}

export async function GET(request, { params }) {
  const { username } = params;
  const { searchParams } = new URL(request.url);
  const allForms     = searchParams.get('all') === '1';
  const specificForm = searchParams.get('form');
  const key = `${username.toLowerCase().trim()}:${allForms ? 'all' : specificForm || 'active'}`;

  const cached = iconCache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return allForms
      ? Response.json(cached.data, { headers: { 'Cache-Control': 'public, max-age=300' } })
      : new Response(cached.buffer, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' } });
  }

  try {
    const profile = await fetch(
      `https://gdbrowser.com/api/profile/${encodeURIComponent(username)}`,
      { headers: { 'User-Agent': 'UY-Demonlist/2.0' } }
    ).then(r => r.json());

    if (!profile || profile.error) {
      return allForms
        ? Response.json({ found: false }, { status: 404 })
        : new Response('Profile not found', { status: 404 });
    }

    const col1 = profile.col1RGB;
    const col2 = profile.col2RGB;
    const col3 = profile.colGRGB;

    if (allForms) {
      const forms      = ['cube', 'ship', 'ball', 'ufo', 'wave', 'robot', 'spider', 'swing'];
      const activeForm = ICON_FORMS[profile.iconType] || 'cube';
      const icons      = {};
      for (const f of forms) {
        const num = profile[PROFILE_ICON_FIELD[f]] ?? 1;
        icons[f]  = {
          form: f, num,
          url: `/api/gd-icon/${encodeURIComponent(username)}?form=${f}`,
          active: f === activeForm,
        };
      }
      const data = { found: true, icons, activeForm, col1, col2 };
      iconCache.set(key, { data, time: Date.now() });
      return Response.json(data, { headers: { 'Cache-Control': 'public, max-age=300' } });
    }

    const form    = specificForm || ICON_FORMS[profile.iconType] || 'cube';
    const iconNum = profile[PROFILE_ICON_FIELD[form]] ?? 1;
    const iconStr = `${PIXI_FORM[form]}_${String(iconNum).padStart(2, '0')}`;

    const [plistRes, atlasRes] = await Promise.all([
      fetch(`https://gdbrowser.com/iconkit/icons/${iconStr}-uhd.plist`),
      fetch(`https://gdbrowser.com/iconkit/icons/${iconStr}-uhd.png`),
    ]);

    if (!plistRes.ok || !atlasRes.ok) {
      return Response.redirect(`https://gdbrowser.com/icon/${username}?form=${form}&icon=${iconNum}`, 307);
    }

    const frames      = parsePlist(await plistRes.text());
    const atlasBuffer = Buffer.from(await atlasRes.arrayBuffer());
    const atlas       = await loadImage(atlasBuffer);

    const SIZE      = 128;
    const canvas    = createCanvas(SIZE, SIZE);
    const ctx       = canvas.getContext('2d');
    const WHITE     = { r: 255, g: 255, b: 255 };
    const dark      = c => !c || (c.r < 8 && c.g < 8 && c.b < 8);
    const glowColor = col3 || (dark(col2) ? col1 : col2);

    // Offset vertical (px de display) para centrar cada forma visualmente — igual que GDBrowser
    const FORM_Y_OFFSET = { ball: -10, ufo: 30, spider: 7, swing: -15 };

    if (form === 'robot' || form === 'spider') {
      await drawMultiPart(ctx, atlas, frames, iconStr, form, SIZE, col1, col2, glowColor, WHITE, FORM_Y_OFFSET[form] || 0);
    } else {
      const scale = (SIZE * 0.74) / 160;
      const cx    = SIZE / 2;
      const cy    = SIZE / 2 + (FORM_Y_OFFSET[form] || 0) * scale;
      for (const [suffix, color] of [
        [`_glow_001.png`,  glowColor],
        [`_3_001.png`,     WHITE],
        [`_2_001.png`,     col2],
        [`_001.png`,       col1],
        [`_extra_001.png`, WHITE],
      ]) {
        const fr = frames[iconStr + suffix];
        if (!fr || !color) continue;
        drawTinted(ctx, atlas, fr, color, cx, cy, scale);
      }
    }

    const buffer = canvas.toBuffer('image/png');
    iconCache.set(key, { buffer, time: Date.now() });

    return new Response(buffer, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (error) {
    console.error('[gd-icon]', error.message);
    if (allForms) return Response.json({ found: false }, { status: 500 });
    return Response.redirect(`https://gdbrowser.com/icon/${encodeURIComponent(username)}`, 307);
  }
}

async function drawMultiPart(ctx, atlas, frames, iconStr, form, SIZE, col1, col2, glowColor, WHITE, formYOffset) {
  const anim = await getAnimData();
  if (!anim) {
    for (const [suffix, color] of [
      [`_glow_001.png`, glowColor], [`_2_001.png`, col2], [`_001.png`, col1],
    ]) {
      const fr = frames[`${iconStr}_01${suffix}`];
      if (fr && color) drawTinted(ctx, atlas, fr, SIZE, color);
    }
    return;
  }

  const pixiForm  = form; // already correct
  const idleFrames = anim.animations[form]?.idle?.frames?.[0] ?? [];
  const byZ        = [...idleFrames].sort((a, b) => a.z - b.z);

  // pxScale dinámico: basado en el glow de la parte 01 (igual que el bot)
  const glowKey01 = `${iconStr}_01_glow_001.png`;
  const glow01    = frames[glowKey01];
  const refSize   = glow01 ? Math.max(glow01.w, glow01.h) : 120;
  const pxScale   = (SIZE * 0.55) / refSize;

  const cx = SIZE / 2;
  const cy = SIZE / 2 + formYOffset * pxScale;

  // Pasada 1: glows (detrás de todo)
  for (const part of byZ) {
    const pn = String(part.part).padStart(2, '0');
    const fr = frames[`${iconStr}_${pn}_glow_001.png`];
    if (!fr || !glowColor) continue;
    const fx = part.flipped[0] ? -1 : 1;
    const fy = part.flipped[1] ? -1 : 1;
    drawLayer(ctx, atlas, fr, glowColor,
      cx + (fr.ox + part.pos[0] * 4) * pxScale,
      cy - (fr.oy + part.pos[1] * 4) * pxScale,
      part.rotation, fx * part.scale[0], fy * part.scale[1], pxScale);
  }

  // Pasada 2: col2 → col1 → extra, en orden z
  for (const part of byZ) {
    const pn = String(part.part).padStart(2, '0');
    const fx = part.flipped[0] ? -1 : 1;
    const fy = part.flipped[1] ? -1 : 1;
    for (const [suffix, color] of [
      [`_2_001.png`,     col2],
      [`_001.png`,       col1],
      [`_extra_001.png`, WHITE],
    ]) {
      const fr = frames[`${iconStr}_${pn}${suffix}`];
      if (!fr || !color) continue;
      drawLayer(ctx, atlas, fr, color,
        cx + (fr.ox + part.pos[0] * 4) * pxScale,
        cy - (fr.oy + part.pos[1] * 4) * pxScale,
        part.rotation, fx * part.scale[0], fy * part.scale[1], pxScale);
    }
  }
}

function drawLayer(ctx, atlas, fr, color, posX, posY, angle, sx, sy, pxScale) {
  const tmp    = createCanvas(fr.w, fr.h);
  const tmpCtx = tmp.getContext('2d');
  tmpCtx.drawImage(atlas, fr.x, fr.y, fr.w, fr.h, 0, 0, fr.w, fr.h);

  if (color) {
    const id = tmpCtx.getImageData(0, 0, fr.w, fr.h);
    const d  = id.data;
    const { r, g, b } = color;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 10) continue;
      d[i]     = Math.round(d[i]     * r / 255);
      d[i + 1] = Math.round(d[i + 1] * g / 255);
      d[i + 2] = Math.round(d[i + 2] * b / 255);
    }
    tmpCtx.putImageData(id, 0, 0);
  }

  ctx.save();
  ctx.translate(posX, posY);
  if (angle) ctx.rotate(angle * Math.PI / 180);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  if (fr.rotated) ctx.rotate(-Math.PI / 2);
  ctx.drawImage(tmp, -fr.w * pxScale / 2, -fr.h * pxScale / 2, fr.w * pxScale, fr.h * pxScale);
  ctx.restore();
}

function parsePlist(xml) {
  const frames = {};
  const block  = xml.match(/<key>frames<\/key>\s*<dict>([\s\S]*?)<\/dict>\s*<key>metadata/)?.[1];
  if (!block) return frames;
  const re = /<key>([^<]+)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const body    = m[2];
    const rect    = body.match(/<key>textureRect<\/key>\s*<string>\{\{(\d+),(\d+)\},\{(\d+),(\d+)\}\}<\/string>/);
    if (!rect) continue;
    const rotated = /<key>textureRotated<\/key>\s*<true\/>/.test(body);
    const offset  = body.match(/<key>spriteOffset<\/key>\s*<string>\{(-?[\d.]+),(-?[\d.]+)\}<\/string>/);
    const dw = +rect[3], dh = +rect[4];
    frames[m[1]] = {
      x: +rect[1], y: +rect[2],
      w: rotated ? dh : dw,
      h: rotated ? dw : dh,
      rotated,
      ox: offset ? +offset[1] : 0,
      oy: offset ? +offset[2] : 0,
    };
  }
  return frames;
}

function drawTinted(ctx, atlas, fr, color, cx, cy, scale) {
  const tmp    = createCanvas(fr.w, fr.h);
  const tmpCtx = tmp.getContext('2d');
  tmpCtx.drawImage(atlas, fr.x, fr.y, fr.w, fr.h, 0, 0, fr.w, fr.h);

  const id  = tmpCtx.getImageData(0, 0, fr.w, fr.h);
  const d   = id.data;
  const { r, g, b } = color;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 10) continue;
    d[i]     = Math.round(d[i]     * r / 255);
    d[i + 1] = Math.round(d[i + 1] * g / 255);
    d[i + 2] = Math.round(d[i + 2] * b / 255);
  }
  tmpCtx.putImageData(id, 0, 0);

  ctx.save();
  ctx.translate(cx + fr.ox * scale, cy - fr.oy * scale);
  if (fr.rotated) ctx.rotate(-Math.PI / 2);
  ctx.drawImage(tmp, -fr.w * scale / 2, -fr.h * scale / 2, fr.w * scale, fr.h * scale);
  ctx.restore();
}
