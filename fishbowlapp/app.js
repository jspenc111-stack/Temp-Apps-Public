// Fishbowl: the UI, the scene, and the fish animation.
// Game rules live in fish-rules.js; Firebase lives in bowl.js, which is
// loaded on demand so the app still opens offline and in ?demo mode.

import * as R from './fish-rules.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const ctx = canvas.getContext('2d');

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Deterministic PRNG so the gravel/wood grain look the same every resize.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// Blend a color toward pale grey (used for dead fish).
function pale(hex, t) {
  const [r, g, b] = hexToRgb(hex);
  const grey = 0.3 * r + 0.59 * g + 0.11 * b;
  const m = (c) => Math.round(lerp(c, lerp(grey, 225, 0.55), t));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

// ---------------------------------------------------------------------------
// Geometry. Everything inside the bowl uses normalized units: (0,0) is the
// bowl's center and 1 is its radius.
// ---------------------------------------------------------------------------
const BOWL = {
  OPEN_Y: -0.8,     // top opening
  WATER_Y: -0.6,    // waterline
  GRAVEL_Y: 0.6,    // top of the gravel
  BASE_Y: 0.94,     // flat base sitting on the table
  SWIM_R: 0.8       // fish stay inside this radius
};

const G = { w: 0, h: 0, dpr: 1, cx: 0, cy: 0, R: 0 };
const toPx = (x, y) => [G.cx + x * G.R, G.cy + y * G.R];
const toNorm = (px, py) => [(px - G.cx) / G.R, (py - G.cy) / G.R];
const halfWidthAt = (y) => Math.sqrt(Math.max(0, 1 - y * y));

function inSwimZone(x, y, margin = 0) {
  return y > BOWL.WATER_Y + 0.12 + margin &&
    y < BOWL.GRAVEL_Y - 0.1 - margin &&
    x * x + y * y < (BOWL.SWIM_R - margin) ** 2;
}
function randomSwimPoint() {
  for (let i = 0; i < 50; i++) {
    const x = rand(-0.8, 0.8), y = rand(-0.5, 0.5);
    if (inSwimZone(x, y, 0.04)) return [x, y];
  }
  return [0, 0];
}

// Static layers rendered once per resize.
let bgLayer = null;      // room, table, shadow
let gravelLayer = null;  // gravel inside the bowl

function makeLayer() {
  const c = document.createElement('canvas');
  c.width = Math.round(G.w * G.dpr);
  c.height = Math.round(G.h * G.dpr);
  const l = c.getContext('2d');
  l.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  return [c, l];
}

function resize() {
  G.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  G.w = window.innerWidth;
  G.h = window.innerHeight;
  canvas.width = Math.round(G.w * G.dpr);
  canvas.height = Math.round(G.h * G.dpr);

  const topSpace = 132, bottomSpace = 130;
  const avail = G.h - topSpace - bottomSpace;
  G.R = Math.max(80, Math.min(G.w * 0.46, avail * 0.56, 380));
  G.cx = G.w / 2;
  G.cy = topSpace + avail * 0.56;

  buildBackground();
  buildGravel();
  buildPlants();
}

function buildBackground() {
  const [c, l] = makeLayer();
  const { w, h, R, cx, cy } = G;
  const tableY = cy + R * 0.55;

  // Warm wall
  const wall = l.createLinearGradient(0, 0, 0, tableY);
  wall.addColorStop(0, '#2b1d15');
  wall.addColorStop(1, '#5a3d2a');
  l.fillStyle = wall;
  l.fillRect(0, 0, w, tableY);

  // Subtle wallpaper stripes
  l.save();
  l.globalAlpha = 0.05;
  l.fillStyle = '#ffdcb0';
  const stripe = Math.max(18, R * 0.12);
  for (let x = (w / 2) % (stripe * 2) - stripe; x < w; x += stripe * 2) l.fillRect(x, 0, stripe * 0.35, tableY);
  l.restore();

  // Lamp glow from the upper left
  const glow = l.createRadialGradient(w * 0.12, h * 0.05, 0, w * 0.12, h * 0.05, Math.max(w, h) * 0.8);
  glow.addColorStop(0, 'rgba(255, 196, 120, 0.45)');
  glow.addColorStop(0.4, 'rgba(255, 170, 90, 0.14)');
  glow.addColorStop(1, 'rgba(255, 150, 80, 0)');
  l.fillStyle = glow;
  l.fillRect(0, 0, w, h);

  // Table top (seen at a slight angle)
  const wood = l.createLinearGradient(0, tableY, 0, h);
  wood.addColorStop(0, '#6e4428');
  wood.addColorStop(0.5, '#8a5733');
  wood.addColorStop(1, '#5c381f');
  l.fillStyle = wood;
  l.fillRect(0, tableY, w, h - tableY);

  // Wood grain
  const rnd = mulberry32(7);
  l.save();
  l.beginPath();
  l.rect(0, tableY, w, h - tableY);
  l.clip();
  for (let i = 0; i < 26; i++) {
    const y0 = tableY + rnd() * (h - tableY);
    const amp = 1 + rnd() * 4;
    const freq = 0.004 + rnd() * 0.01;
    const ph = rnd() * 10;
    l.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = y0 + Math.sin(x * freq + ph) * amp + (x / w) * (rnd() * 0.6);
      x === 0 ? l.moveTo(x, y) : l.lineTo(x, y);
    }
    l.strokeStyle = rnd() > 0.5 ? 'rgba(40, 20, 8, 0.22)' : 'rgba(255, 210, 160, 0.08)';
    l.lineWidth = 0.6 + rnd() * 1.6;
    l.stroke();
  }
  l.restore();

  // Back edge of the table
  l.fillStyle = 'rgba(255, 215, 170, 0.18)';
  l.fillRect(0, tableY, w, 2);
  const edgeShade = l.createLinearGradient(0, tableY, 0, tableY + 18);
  edgeShade.addColorStop(0, 'rgba(0,0,0,0.25)');
  edgeShade.addColorStop(1, 'rgba(0,0,0,0)');
  l.fillStyle = edgeShade;
  l.fillRect(0, tableY, w, 18);

  // Lamp light pooled on the table
  const pool = l.createRadialGradient(w * 0.3, tableY + (h - tableY) * 0.3, 0, w * 0.3, tableY + (h - tableY) * 0.3, w * 0.7);
  pool.addColorStop(0, 'rgba(255, 200, 130, 0.2)');
  pool.addColorStop(1, 'rgba(255, 200, 130, 0)');
  l.fillStyle = pool;
  l.fillRect(0, tableY, w, h - tableY);

  // Bowl shadow, cast down and to the right (away from the lamp)
  const [, baseY] = toPx(0, BOWL.BASE_Y);
  l.save();
  l.translate(cx + R * 0.22, baseY + R * 0.02);
  l.scale(1, 0.16);
  const sh = l.createRadialGradient(0, 0, 0, 0, 0, R * 1.05);
  sh.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  sh.addColorStop(0.6, 'rgba(0, 0, 0, 0.25)');
  sh.addColorStop(1, 'rgba(0, 0, 0, 0)');
  l.fillStyle = sh;
  l.beginPath();
  l.arc(0, 0, R * 1.05, 0, Math.PI * 2);
  l.fill();
  l.restore();

  // Teal caustic glow: light focused through the water onto the table
  l.save();
  l.translate(cx + R * 0.35, baseY + R * 0.04);
  l.scale(1, 0.14);
  const caustic = l.createRadialGradient(0, 0, 0, 0, 0, R * 0.5);
  caustic.addColorStop(0, 'rgba(140, 240, 220, 0.22)');
  caustic.addColorStop(1, 'rgba(140, 240, 220, 0)');
  l.fillStyle = caustic;
  l.beginPath();
  l.arc(0, 0, R * 0.5, 0, Math.PI * 2);
  l.fill();
  l.restore();

  // Vignette
  const vig = l.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.8);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.45)');
  l.fillStyle = vig;
  l.fillRect(0, 0, w, h);

  bgLayer = c;
}

function waterClipPath(l) {
  // Circle, cut at the waterline (top) and the flat base (bottom).
  const { cx, cy, R } = G;
  const aTopR = Math.asin(BOWL.WATER_Y);         // right side, negative angle
  const aTopL = Math.PI - aTopR;                 // left side
  const aBaseR = Math.asin(BOWL.BASE_Y);
  const aBaseL = Math.PI - aBaseR;
  l.beginPath();
  l.arc(cx, cy, R, aTopR, aBaseR);
  l.arc(cx, cy, R, aBaseL, aTopL);
  l.closePath();
}

function buildGravel() {
  const [c, l] = makeLayer();
  const { R } = G;
  const rnd = mulberry32(42);
  l.save();
  waterClipPath(l);
  l.clip();

  const [, gy] = toPx(0, BOWL.GRAVEL_Y);
  const [, by] = toPx(0, BOWL.BASE_Y);
  // Bed color
  const bed = l.createLinearGradient(0, gy, 0, by);
  bed.addColorStop(0, '#9c8466');
  bed.addColorStop(1, '#4d3f30');
  l.fillStyle = bed;
  l.beginPath();
  l.moveTo(G.cx - R, gy + R * 0.02);
  for (let x = -1; x <= 1.001; x += 0.05) {
    const [px, py] = toPx(x, BOWL.GRAVEL_Y + Math.sin(x * 7) * 0.012 + Math.sin(x * 17) * 0.006);
    l.lineTo(px, py);
  }
  l.lineTo(G.cx + R, by + 4);
  l.lineTo(G.cx - R, by + 4);
  l.closePath();
  l.fill();

  // Pebbles, back to front so near ones overlap far ones
  const colors = ['#c9b18a', '#a88d6b', '#7a6450', '#e4d4b4', '#8c7a6b', '#b5651d', '#6b7b8c', '#d9c7a3', '#5e4b3c', '#cfa77a'];
  const count = Math.round(R * 2.2);
  const pebbles = [];
  for (let i = 0; i < count; i++) {
    const y = BOWL.GRAVEL_Y - 0.01 + rnd() * (BOWL.BASE_Y - BOWL.GRAVEL_Y + 0.02);
    const hw = halfWidthAt(y);
    const x = (rnd() * 2 - 1) * hw;
    pebbles.push({ x, y, r: (0.012 + rnd() * 0.022) * R, rot: rnd() * Math.PI, c: colors[Math.floor(rnd() * colors.length)], sq: 0.6 + rnd() * 0.3 });
  }
  pebbles.sort((a, b) => a.y - b.y);
  for (const p of pebbles) {
    const [px, py] = toPx(p.x, p.y);
    l.save();
    l.translate(px, py);
    l.rotate(p.rot);
    l.scale(1, p.sq);
    const g = l.createRadialGradient(-p.r * 0.35, -p.r * 0.4, p.r * 0.1, 0, 0, p.r);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(0.35, p.c);
    g.addColorStop(1, 'rgba(30,20,10,0.9)');
    l.fillStyle = g;
    l.beginPath();
    l.arc(0, 0, p.r, 0, Math.PI * 2);
    l.fill();
    l.restore();
  }
  // Water tint over the gravel for depth
  l.fillStyle = 'rgba(20, 90, 90, 0.28)';
  l.fillRect(G.cx - R, gy - 4, R * 2, by - gy + 8);
  l.restore();
  gravelLayer = c;
}

// ---------------------------------------------------------------------------
// Plants, bubbles, light rays, ripples, particles
// ---------------------------------------------------------------------------
let plants = [];
function buildPlants() {
  const rnd = mulberry32(99);
  const spots = [{ x: -0.5, n: 5, h: 0.95, hue: 130 }, { x: 0.46, n: 4, h: 0.75, hue: 105 }];
  plants = spots.map((s) => ({
    x: s.x,
    blades: Array.from({ length: s.n }, (_, i) => ({
      dx: (rnd() - 0.5) * 0.12,
      h: s.h * (0.6 + rnd() * 0.45),
      w: 0.03 + rnd() * 0.02,
      phase: rnd() * Math.PI * 2,
      speed: 0.7 + rnd() * 0.5,
      lean: (rnd() - 0.5) * 0.15,
      color: `hsl(${s.hue + (rnd() - 0.5) * 30}, ${45 + rnd() * 20}%, ${28 + rnd() * 14}%)`
    }))
  }));
}

function drawPlants(t, layer) {
  for (const plant of plants) {
    plant.blades.forEach((b, i) => {
      if ((i % 2) !== layer) return; // split blades into behind/in-front-of-fish layers
      const segs = 14;
      const left = [], right = [];
      for (let s = 0; s <= segs; s++) {
        const f = s / segs;
        const sway = Math.sin(t * b.speed + b.phase + f * 2.4) * 0.07 * f * f + b.lean * f;
        const x = plant.x + b.dx + sway;
        const y = BOWL.GRAVEL_Y + 0.02 - f * b.h;
        const width = b.w * (1 - f * 0.85) * (0.7 + 0.3 * Math.sin(f * 9 + b.phase));
        left.push(toPx(x - width, y));
        right.push(toPx(x + width, y));
      }
      ctx.beginPath();
      ctx.moveTo(...left[0]);
      for (const p of left) ctx.lineTo(...p);
      for (let k = right.length - 1; k >= 0; k--) ctx.lineTo(...right[k]);
      ctx.closePath();
      ctx.fillStyle = b.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(180, 255, 180, 0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }
}

let bubbles = [];
let bubbleTimer = 0;
const AIRSTONE_X = 0.16;
function updateBubbles(dt) {
  bubbleTimer -= dt;
  if (bubbleTimer <= 0) {
    bubbleTimer = rand(0.08, 0.35);
    const fromStone = Math.random() < 0.8;
    bubbles.push({
      x: fromStone ? AIRSTONE_X + rand(-0.015, 0.015) : rand(-0.6, 0.6),
      y: BOWL.GRAVEL_Y - 0.02,
      r: rand(0.006, fromStone ? 0.02 : 0.012),
      vy: rand(0.18, 0.3),
      ph: rand(0, Math.PI * 2)
    });
  }
  for (const b of bubbles) {
    b.y -= b.vy * dt * (1 + b.r * 20);
    b.ph += dt * 5;
    b.x += Math.sin(b.ph) * 0.02 * dt;
  }
  bubbles = bubbles.filter((b) => {
    if (b.y <= BOWL.WATER_Y + 0.01) {
      ripples.push({ x: b.x, y: BOWL.WATER_Y, age: 0, life: 0.35, size: b.r * 3, surface: true });
      return false;
    }
    return true;
  });
}
function drawBubbles() {
  for (const b of bubbles) {
    const [px, py] = toPx(b.x, b.y);
    const r = b.r * G.R;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220, 255, 255, 0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(230, 255, 255, 0.6)';
    ctx.lineWidth = Math.max(0.8, r * 0.18);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px - r * 0.35, py - r * 0.35, r * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
  }
}

function drawLightRays(t) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const x0 = -0.55 + i * 0.32 + Math.sin(t * 0.2 + i) * 0.05;
    const alpha = 0.035 + 0.03 * Math.sin(t * 0.6 + i * 1.7);
    const [ax, ay] = toPx(x0, BOWL.WATER_Y);
    const [bx] = toPx(x0 + 0.1, BOWL.WATER_Y);
    const [cx2, cy2] = toPx(x0 + 0.42, BOWL.GRAVEL_Y);
    const [dx] = toPx(x0 + 0.22, BOWL.GRAVEL_Y);
    const g = ctx.createLinearGradient(0, ay, 0, cy2);
    g.addColorStop(0, `rgba(255, 250, 210, ${alpha * 2})`);
    g.addColorStop(1, 'rgba(255, 250, 210, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, ay);
    ctx.lineTo(cx2, cy2);
    ctx.lineTo(dx, cy2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

let ripples = [];
let particles = [];
function updateEffects(dt) {
  for (const r of ripples) r.age += dt;
  ripples = ripples.filter((r) => r.age < r.life);
  for (const p of particles) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 2.2 * dt;
    p.vy = p.vy * (1 - 2.2 * dt) + (p.buoyant ? -0.15 : 0.05) * dt;
    p.rot += p.vr * dt;
  }
  particles = particles.filter((p) => p.age < p.life && p.y > BOWL.WATER_Y);
}
function drawRipples() {
  for (const r of ripples) {
    const k = r.age / r.life;
    const [px, py] = toPx(r.x, r.y);
    const rad = (r.size + k * (r.surface ? 0.05 : 0.35)) * G.R;
    ctx.save();
    ctx.translate(px, py);
    if (r.surface) ctx.scale(1, 0.3);
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    ctx.strokeStyle = r.color || `rgba(230, 255, 255, ${0.6 * (1 - k)})`;
    if (r.color) ctx.globalAlpha = 1 - k;
    ctx.lineWidth = r.surface ? 1 : 2.5 * (1 - k) + 0.5;
    ctx.stroke();
    if (!r.surface && !r.color) {
      ctx.beginPath();
      ctx.arc(0, 0, rad * 0.6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(230, 255, 255, ${0.35 * (1 - k)})`;
      ctx.stroke();
    }
    ctx.restore();
  }
}
function drawParticles() {
  for (const p of particles) {
    const [px, py] = toPx(p.x, p.y);
    const k = p.age / p.life;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.translate(px, py);
    ctx.rotate(p.rot);
    if (p.kind === 'bubble') {
      ctx.beginPath();
      ctx.arc(0, 0, p.r * G.R, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(230,255,255,0.8)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else if (p.kind === 'text') {
      ctx.rotate(-p.rot);
      ctx.font = `800 ${Math.round(G.R * 0.13 * (1 + k * 0.4))}px -apple-system, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(40, 10, 0, 0.8)';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = '#fff3d6';
      ctx.fillText(p.text, 0, 0);
    } else {
      // scale / confetti chunk
      const s = p.r * G.R;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, s, s * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}


// ---------------------------------------------------------------------------
// Water, surface, glass
// ---------------------------------------------------------------------------
function drawWater(t) {
  const { cx, cy, R } = G;
  const [, wy] = toPx(0, BOWL.WATER_Y);
  const [, by] = toPx(0, BOWL.BASE_Y);
  const g = ctx.createLinearGradient(0, wy, 0, by);
  g.addColorStop(0, 'rgba(120, 210, 205, 0.55)');
  g.addColorStop(0.5, 'rgba(50, 150, 155, 0.7)');
  g.addColorStop(1, 'rgba(18, 80, 90, 0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - R, wy, R * 2, by - wy);

  // Soft caustic blobs drifting through the water
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const x = Math.sin(t * 0.13 + i * 2.1) * 0.55;
    const y = -0.2 + Math.cos(t * 0.11 + i * 1.3) * 0.35;
    const [px, py] = toPx(x, y);
    const rr = R * (0.18 + 0.05 * Math.sin(t * 0.5 + i));
    const cg = ctx.createRadialGradient(px, py, 0, px, py, rr);
    cg.addColorStop(0, 'rgba(160, 255, 235, 0.06)');
    cg.addColorStop(1, 'rgba(160, 255, 235, 0)');
    ctx.fillStyle = cg;
    ctx.fillRect(px - rr, py - rr, rr * 2, rr * 2);
  }
  ctx.restore();
}

function drawSurface(t) {
  const { R } = G;
  const hw = halfWidthAt(BOWL.WATER_Y);
  const [sx, sy] = toPx(0, BOWL.WATER_Y);
  const rx = hw * R, ry = R * 0.06;

  // The surface seen slightly from above
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2);
  const sg = ctx.createLinearGradient(0, sy - ry, 0, sy + ry);
  sg.addColorStop(0, 'rgba(200, 250, 245, 0.55)');
  sg.addColorStop(1, 'rgba(120, 210, 205, 0.35)');
  ctx.fillStyle = sg;
  ctx.fill();
  ctx.clip();
  // Shimmer glints sliding across the surface
  for (let i = 0; i < 7; i++) {
    const k = ((t * 0.07 + i / 7) % 1);
    const gx = sx - rx + k * rx * 2;
    const gy = sy + Math.sin(i * 3 + t) * ry * 0.5;
    ctx.beginPath();
    ctx.ellipse(gx, gy, rx * 0.12 * Math.sin(k * Math.PI), ry * 0.12, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.45 * Math.sin(k * Math.PI)})`;
    ctx.fill();
  }
  ctx.restore();

  // Waterline (the meniscus on the front of the glass)
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI);
  ctx.strokeStyle = 'rgba(220, 255, 250, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx, ry, 0, Math.PI, Math.PI * 2);
  ctx.strokeStyle = 'rgba(220, 255, 250, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawGlass() {
  const { cx, cy, R } = G;
  const aOpenR = Math.asin(BOWL.OPEN_Y);
  const aOpenL = Math.PI - aOpenR;
  const aBaseR = Math.asin(BOWL.BASE_Y);
  const aBaseL = Math.PI - aBaseR;
  const [, oy] = toPx(0, BOWL.OPEN_Y);
  const [, by] = toPx(0, BOWL.BASE_Y);
  const openHW = halfWidthAt(BOWL.OPEN_Y) * R;
  const baseHW = halfWidthAt(BOWL.BASE_Y) * R;

  // Glass body path
  const glassPath = () => {
    ctx.beginPath();
    ctx.arc(cx, cy, R, aOpenR, aBaseR);
    ctx.arc(cx, cy, R, aBaseL, aOpenL);
    ctx.closePath();
  };

  // Fresnel: glass looks brighter/thicker at its edges
  ctx.save();
  glassPath();
  const fres = ctx.createRadialGradient(cx - R * 0.15, cy - R * 0.1, R * 0.55, cx, cy, R);
  fres.addColorStop(0, 'rgba(255,255,255,0)');
  fres.addColorStop(0.85, 'rgba(210,240,255,0.05)');
  fres.addColorStop(1, 'rgba(210,240,255,0.22)');
  ctx.fillStyle = fres;
  ctx.fill();
  ctx.restore();

  // Outline
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, aOpenR, aBaseR);
  ctx.moveTo(cx - baseHW, by);
  ctx.arc(cx, cy, R, aBaseL, aOpenL);
  ctx.strokeStyle = 'rgba(200, 235, 245, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Base (a thicker glass foot)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, by, baseHW, R * 0.035, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(180, 230, 230, 0.18)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(220, 250, 255, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Rim
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, oy, openHW, R * 0.045, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(225, 250, 255, 0.75)';
  ctx.lineWidth = Math.max(2.5, R * 0.018);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, oy + 1.5, openHW * 0.985, R * 0.04, 0, 0, Math.PI);
  ctx.strokeStyle = 'rgba(40, 80, 90, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Main reflection arc on the upper-left (toward the lamp)
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.9, Math.PI * 1.08, Math.PI * 1.36);
  ctx.strokeStyle = 'rgba(255, 252, 240, 0.55)';
  ctx.lineWidth = R * 0.045;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.83, Math.PI * 1.12, Math.PI * 1.22);
  ctx.strokeStyle = 'rgba(255, 252, 240, 0.3)';
  ctx.lineWidth = R * 0.02;
  ctx.stroke();
  // Small glint on the lower right
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.92, Math.PI * 0.12, Math.PI * 0.22);
  ctx.strokeStyle = 'rgba(255, 252, 240, 0.25)';
  ctx.lineWidth = R * 0.025;
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------

function drawAirstone() {
  const [px, py] = toPx(AIRSTONE_X, BOWL.GRAVEL_Y + 0.01);
  const r = G.R * 0.05;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(1, 0.55);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#9aa7b0');
  g.addColorStop(1, '#3d4a52');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}


// ---------------------------------------------------------------------------
// Fish colors (keys match R.COLORS)
// ---------------------------------------------------------------------------
const PALETTES = {
  orange: { top: '#c2410c', mid: '#ff8a2a', belly: '#ffe0b8', fin: '#ff9f43' },
  gold:   { top: '#b7791f', mid: '#f6c343', belly: '#fff3c4', fin: '#ffd66b' },
  silver: { top: '#5b6b7a', mid: '#b8c4cf', belly: '#f4f7fa', fin: '#d6dee6' },
  red:    { top: '#9b1c1c', mid: '#e53e3e', belly: '#ffd1d1', fin: '#ff6b6b' },
  calico: { top: '#1f2937', mid: '#f97316', belly: '#fff7ed', fin: '#fdba74' },
  blue:   { top: '#1e3a8a', mid: '#3b82f6', belly: '#dbeafe', fin: '#93c5fd' },
  pearl:  { top: '#a8a29e', mid: '#f5f0e8', belly: '#ffffff', fin: '#fde2cf' },
  lemon:  { top: '#a16207', mid: '#facc15', belly: '#fefce8', fin: '#fde047' }
};
const paletteOf = (color) => PALETTES[color] || PALETTES.orange;

// Blend a color toward grey (hungry fish fade).
function greyed(hex, t) {
  if (t <= 0) return hex;
  const [r, g, b] = hexToRgb(hex);
  const grey = 0.3 * r + 0.59 * g + 0.11 * b;
  const m = (c) => Math.round(lerp(c, grey * 0.9 + 20, t));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

// Girth: 0.8× when empty, 1.0× at 50, 1.5× when full.
function girthFor(f) {
  const v = clamp(f, 0, 100);
  return v <= 50 ? 0.8 + 0.2 * (v / 50) : 1 + 0.5 * ((v - 50) / 50);
}

// Same size for a fish on every phone, derived from its id.
function sizeFor(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 0.9 + (h % 1000) / 1000 * 0.2;
}

// ---------------------------------------------------------------------------
// Local fish animation. Positions are never synced; each phone animates its
// own copy of the fish list.
// ---------------------------------------------------------------------------
const sims = new Map();  // fish id → animation state
let meals = [];          // sinking flakes, each for one fish

const BODY = 0.2;        // body length in bowl radii (before sizeFor)
const fishLenN = (s) => BODY * s.size;
const fishLenPx = (s) => fishLenN(s) * G.R;

function emptiestPoint() {
  let best = randomSwimPoint(), bestScore = -1;
  for (let i = 0; i < 40; i++) {
    const [x, y] = randomSwimPoint();
    let score = Infinity;
    for (const s of sims.values()) if (s.state === 'alive') score = Math.min(score, Math.hypot(s.x - x, s.y - y));
    if (score > bestScore) { bestScore = score; best = [x, y]; }
  }
  return best;
}

// Destinations spread over the whole bowl, at different depths, away from
// where the other fish are heading.
const BANDS = [[BOWL.WATER_Y + 0.14, -0.22], [-0.22, 0.18], [0.18, BOWL.GRAVEL_Y - 0.12]];
function pickDestination(sim) {
  let best = null, bestScore = -1;
  for (let i = 0; i < 8; i++) {
    const [y0, y1] = BANDS[Math.floor(Math.random() * BANDS.length)];
    const y = rand(y0, y1);
    const hw = Math.sqrt(Math.max(0, BOWL.SWIM_R ** 2 - y * y)) * 0.9;
    const x = rand(-hw, hw);
    if (!inSwimZone(x, y, 0.03)) continue;
    let score = Math.hypot(x - sim.x, y - sim.y) * 0.3;
    let nearest = Infinity;
    for (const o of sims.values()) {
      if (o === sim || o.state !== 'alive') continue;
      nearest = Math.min(nearest, Math.hypot(o.tx - x, o.ty - y), Math.hypot(o.x - x, o.y - y));
    }
    score += Math.min(nearest, 1);
    if (score > bestScore) { bestScore = score; best = [x, y]; }
  }
  return best || randomSwimPoint();
}

function makeSim(id, data, now, spawned) {
  const [x, y] = spawned ? emptiestPoint() : randomSwimPoint();
  const sim = {
    id, data, x, y,
    vx: rand(-0.05, 0.05), vy: 0, tx: x, ty: y, retarget: 0,
    face: Math.random() < 0.5 ? -1 : 1, tilt: 0,
    tail: rand(0, 10), fin: rand(0, 10), phase: rand(0, 10),
    size: sizeFor(id),
    girth: girthFor(R.currentFullness(data, now)),
    held: null, pending: 0, pendingDeath: null,
    puffAt: -1e9, pauseUntil: 0, scared: 0,
    state: 'alive', deathAt: 0, deathY: 0, cause: null,
    bornAt: spawned ? performance.now() : -1e9
  };
  [sim.tx, sim.ty] = pickDestination(sim);
  return sim;
}

const shownFullness = (sim, now) => clamp(sim.held ?? R.currentFullness(sim.data, now), 0, 100);

function startDeath(sim, cause, announce) {
  if (sim.state !== 'alive') return;
  sim.state = 'dying';
  sim.cause = cause;
  sim.deathAt = performance.now();
  sim.deathY = sim.y;
  sim.held = null;
  meals = meals.filter((m) => m.fishId !== sim.id);
  if (selectedId === sim.id) deselect();
  if (announce) toast(R.deathMessage(sim.data.name, cause));
}

// Flakes: just above one fish, or spread across the surface for everyone.
function dropFlakes(targets, spread) {
  const sorted = [...targets].sort((a, b) => a.x - b.x);
  const hw = halfWidthAt(BOWL.WATER_Y) * 0.8;
  sorted.forEach((sim, i) => {
    const x = spread
      ? -hw + (2 * hw) * ((i + 0.5) / sorted.length) + rand(-0.04, 0.04)
      : clamp(sim.x + rand(-0.04, 0.04), -hw, hw);
    meals.push({
      fishId: sim.id, x, y: BOWL.WATER_Y + 0.02, vy: rand(0.05, 0.08), born: performance.now(),
      flakes: Array.from({ length: 5 }, () => ({
        dx: rand(-0.035, 0.035), dy: rand(-0.02, 0.02), r: rand(0.01, 0.016), rot: rand(0, Math.PI),
        c: pick(['#c0392b', '#e67e22', '#d35400', '#f1c40f', '#8e5a2a'])
      }))
    });
    ripples.push({ x, y: BOWL.WATER_Y, age: 0, life: 0.5, size: 0.03, surface: true });
  });
}

function eatMeal(sim, meal) {
  meals = meals.filter((m) => m !== meal);
  sim.pending = Math.max(0, sim.pending - 1);
  sim.held = sim.pending > 0 && sim.held != null ? sim.held + R.FEED_AMOUNT : null;
  sim.puffAt = performance.now();
  if (sim.pending === 0 && sim.pendingDeath) startDeath(sim, sim.pendingDeath, true);
}

// Overfed fish swell up for a moment, then pop (starved fish float belly-up).
const POP_MS = 700;
const isPopping = (sim) => sim.state === 'dying' && sim.cause === 'overfed';

function burst(sim) {
  const pal = paletteOf(sim.data.color);
  for (let i = 0; i < 26; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(0.3, 1.1);
    particles.push({
      kind: i % 3 === 0 ? 'bubble' : 'scale',
      color: pick([pal.mid, pal.fin, pal.belly, pal.top]),
      x: sim.x, y: sim.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: rand(0.008, 0.02), rot: rand(0, 6), vr: rand(-8, 8),
      age: 0, life: rand(0.9, 1.8), buoyant: i % 3 === 0
    });
  }
  particles.push({ kind: 'text', text: 'POP!', x: sim.x, y: Math.max(sim.y - 0.05, BOWL.WATER_Y + 0.2), vx: 0, vy: -0.1, r: 0, rot: 0, vr: 0, age: 0, life: 1.3, buoyant: true });
  ripples.push({ x: sim.x, y: sim.y, age: 0, life: 0.6, size: 0.05, color: 'rgba(255,240,200,0.9)' });
  for (const o of sims.values()) if (o !== sim) startle(o, sim.x, sim.y, 0.6);
}

function startle(sim, x, y, radius) {
  if (sim.state !== 'alive') return;
  const dx = sim.x - x, dy = sim.y - y;
  const d = Math.hypot(dx, dy);
  if (d > radius) return;
  const push = (1 - d / radius) * 1.2 + 0.3;
  sim.vx = (d > 0.001 ? dx / d : rand(-1, 1)) * push;
  sim.vy = (d > 0.001 ? dy / d : rand(-1, 1)) * push;
  sim.scared = 1;
  [sim.tx, sim.ty] = pickDestination(sim);
}

function updateSim(sim, dt, now, perf) {
  if (isPopping(sim)) {
    sim.x += Math.sin(perf / 30) * 0.02 * dt;
    if (perf - sim.deathAt > POP_MS) {
      burst(sim);
      sim.state = 'gone';
    }
    return;
  }
  if (sim.state === 'dying') {
    const t = perf - sim.deathAt;
    const k = clamp(t / 2000, 0, 1);
    sim.y = lerp(sim.deathY, BOWL.WATER_Y + 0.06, 1 - (1 - k) ** 2);
    sim.x += Math.sin(perf / 700) * 0.004 * dt;
    sim.tilt = lerp(sim.tilt, 0, clamp(dt * 3, 0, 1));
    if (t > 3000) sim.state = 'gone';
    return;
  }

  const full = shownFullness(sim, now);
  const stuffed = full >= 90;
  const hungry = full < 20;
  let speed = 0.15 * (stuffed ? 0.45 : 1);
  let tx = sim.tx, ty = sim.ty;

  const meal = meals.find((m) => m.fishId === sim.id);
  if (meal) {
    tx = meal.x;
    ty = clamp(meal.y, BOWL.WATER_Y + 0.1, BOWL.GRAVEL_Y - 0.08);
    speed = stuffed ? 0.2 : 0.38;
    if (Math.hypot(sim.x - meal.x, sim.y - meal.y) < 0.07 || perf - meal.born > 3500) eatMeal(sim, meal);
  } else {
    sim.retarget -= dt;
    if (sim.retarget <= 0 || Math.hypot(sim.x - tx, sim.y - ty) < 0.06) {
      [sim.tx, sim.ty] = pickDestination(sim);
      sim.retarget = hungry ? rand(1.5, 3) : rand(4, 9);
    }
  }
  if (sim.scared > 0) { sim.scared -= dt; speed *= 2; }

  let dx = tx - sim.x, dy = ty - sim.y;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d; dy /= d;
  if (hungry) {
    // A little erratic: wobble the heading.
    const a = Math.sin(perf / 260 + sim.phase) * 0.9 + Math.sin(perf / 610 + sim.phase * 2) * 0.6;
    const c = Math.cos(a), s = Math.sin(a);
    [dx, dy] = [dx * c - dy * s, dx * s + dy * c];
  }
  const arrive = meal ? 1 : clamp(d / 0.15, 0.3, 1);
  let desVx = dx * speed * arrive;
  let desVy = dy * speed * arrive * 0.75;

  // Keep about 1.5 body lengths from every other fish.
  for (const o of sims.values()) {
    if (o === sim || o.state !== 'alive') continue;
    const ox = sim.x - o.x, oy = sim.y - o.y;
    const od = Math.hypot(ox, oy) || 0.001;
    const minD = 1.5 * (fishLenN(sim) + fishLenN(o)) / 2;
    if (od < minD) {
      const push = ((minD - od) / minD) * 0.35;
      desVx += (ox / od) * push;
      desVy += (oy / od) * push;
    }
  }

  // Turn back smoothly near the glass, the waterline and the gravel.
  const r = Math.hypot(sim.x, sim.y);
  if (r > BOWL.SWIM_R - 0.1) {
    const k = (r - (BOWL.SWIM_R - 0.1)) / 0.1;
    desVx -= (sim.x / r) * 0.3 * k;
    desVy -= (sim.y / r) * 0.3 * k;
  }
  if (sim.y < BOWL.WATER_Y + 0.16) desVy += 0.25 * (BOWL.WATER_Y + 0.16 - sim.y) / 0.08;
  if (sim.y > BOWL.GRAVEL_Y - 0.14) desVy -= 0.25 * (sim.y - (BOWL.GRAVEL_Y - 0.14)) / 0.08;

  if (perf < sim.pauseUntil) { desVx = 0; desVy = 0; }

  const turn = sim.scared > 0 ? 1.2 : perf < sim.pauseUntil ? 5 : 2;
  sim.vx = lerp(sim.vx, desVx, clamp(dt * turn, 0, 1));
  sim.vy = lerp(sim.vy, desVy, clamp(dt * turn, 0, 1));
  sim.x += sim.vx * dt;
  sim.y += sim.vy * dt;
  const rr = Math.hypot(sim.x, sim.y);
  if (rr > 0.86) { sim.x *= 0.86 / rr; sim.y *= 0.86 / rr; }
  sim.y = clamp(sim.y, BOWL.WATER_Y + 0.07, BOWL.GRAVEL_Y - 0.05);

  if (Math.abs(sim.vx) > 0.015) sim.face = lerp(sim.face, Math.sign(sim.vx), clamp(dt * 4, 0, 1));
  const targetTilt = clamp(Math.atan2(sim.vy, Math.abs(sim.vx) + 0.05), -0.45, 0.45);
  sim.tilt = lerp(sim.tilt, targetTilt, clamp(dt * 4, 0, 1));
  const spd = Math.hypot(sim.vx, sim.vy);
  sim.tail += dt * (4 + spd * 35);
  sim.fin += dt * (3 + spd * 12);

  // Girth follows fullness smoothly (~0.5 s).
  sim.girth = lerp(sim.girth, girthFor(full), 1 - Math.exp(-dt * 7));
}

function updateMeals(dt, perf) {
  for (const m of meals) {
    const floor = BOWL.GRAVEL_Y - 0.03;
    if (m.y < floor) m.y = Math.min(floor, m.y + m.vy * dt);
    m.x += Math.sin(perf / 600 + m.born) * 0.01 * dt;
  }
}

function drawMeals(perf) {
  for (const m of meals) {
    for (const f of m.flakes) {
      const [px, py] = toPx(m.x + f.dx, m.y + f.dy);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(f.rot + perf / 1500);
      ctx.fillStyle = f.c;
      const s = f.r * G.R;
      ctx.fillRect(-s, -s * 0.5, s * 2, s);
      ctx.restore();
    }
  }
}

function drawFish(sim, now, perf) {
  const pal = paletteOf(sim.data.color);
  const [px, py] = toPx(sim.x, sim.y);
  let L = fishLenPx(sim);
  const full = shownFullness(sim, now);
  let alpha = clamp((perf - sim.bornAt) / 600, 0, 1);
  let paleT = 0, roll = 1, swell = 0, wobble = 0;
  let greyT = sim.state === 'alive' ? clamp((20 - full) / 20, 0, 1) * 0.75 : 0;
  const popping = isPopping(sim);

  if (popping) {
    const k = clamp((perf - sim.deathAt) / POP_MS, 0, 1);
    swell = k * k * 1.6;
    L *= 1 + k * 0.25;
    wobble = Math.sin(perf / 25) * 0.08 * k;
  } else if (sim.state === 'dying') {
    const t = perf - sim.deathAt;
    paleT = clamp(t / 800, 0, 1);
    roll = Math.cos(clamp(t / 700, 0, 1) * Math.PI); // 1 → -1: rolls belly-up
    alpha = 1 - clamp((t - 2000) / 1000, 0, 1);
  }

  // Quick "gulp" puff: ~10% bigger, then settle.
  const pk = (perf - sim.puffAt) / 380;
  const puff = pk >= 0 && pk <= 1 ? 1 + 0.1 * Math.sin(Math.PI * pk) : 1;
  const g = sim.girth * puff + swell;
  const Ht = L * 0.27 * (1 + (g - 1) * 0.55);             // back
  const Hb = L * 0.27 * g * (g > 1 ? 1 + (g - 1) * 0.35 : 1); // belly bulges more
  const col = (c) => (paleT > 0 ? pale(c, paleT) : greyed(c, greyT));
  const flick = sim.state === 'alive' ? Math.sin(sim.tail) * L * 0.07 : popping ? Math.sin(perf / 30) * L * 0.1 : 0;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(px, py);
  ctx.rotate(sim.tilt * Math.sign(sim.face) + wobble);

  // Soft glow when selected
  if (sim.id === selectedId && sim.state === 'alive') {
    const glow = ctx.createRadialGradient(0, 0, L * 0.2, 0, 0, L * 0.95);
    glow.addColorStop(0, 'rgba(255, 244, 200, 0.45)');
    glow.addColorStop(1, 'rgba(255, 244, 200, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, L * 0.95, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.scale(sim.face, roll);

  // Tail fin (not scaled by girth)
  const tailBase = -L * 0.3;
  ctx.beginPath();
  ctx.moveTo(tailBase + L * 0.03, 0);
  ctx.quadraticCurveTo(tailBase - L * 0.14, -L * 0.04 + flick * 0.5, tailBase - L * 0.32, -L * 0.22 + flick);
  ctx.quadraticCurveTo(tailBase - L * 0.22, flick * 0.8, tailBase - L * 0.32, L * 0.22 + flick);
  ctx.quadraticCurveTo(tailBase - L * 0.14, L * 0.04 + flick * 0.5, tailBase + L * 0.03, 0);
  const tg = ctx.createLinearGradient(tailBase, 0, tailBase - L * 0.32, 0);
  tg.addColorStop(0, col(pal.mid));
  tg.addColorStop(1, col(pal.fin));
  ctx.fillStyle = tg;
  ctx.globalAlpha = alpha * 0.92;
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 0.8;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(tailBase, 0);
    ctx.lineTo(tailBase - L * 0.28, i * L * 0.07 + flick * 0.9);
    ctx.stroke();
  }

  // Dorsal fin
  const finWave = Math.sin(sim.fin) * L * 0.015;
  ctx.beginPath();
  ctx.moveTo(-L * 0.12, -Ht * 0.82);
  ctx.quadraticCurveTo(-L * 0.02 + finWave, -Ht * 1.1 - L * 0.12, L * 0.14, -Ht * 0.9);
  ctx.closePath();
  ctx.fillStyle = col(pal.fin);
  ctx.globalAlpha = alpha * 0.9;
  ctx.fill();
  ctx.globalAlpha = alpha;

  // Body: height and belly curve follow girth
  ctx.beginPath();
  ctx.moveTo(L * 0.5, L * 0.01);
  ctx.bezierCurveTo(L * 0.46, -Ht * 0.9, L * 0.05, -Ht * 1.08, -L * 0.28, -Ht * 0.3);
  ctx.quadraticCurveTo(-L * 0.34, 0, -L * 0.28, Hb * 0.28);
  ctx.bezierCurveTo(-L * 0.02, Hb * 1.12, L * 0.44, Hb * 0.95, L * 0.5, L * 0.01);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, -Ht, 0, Hb);
  bg.addColorStop(0, col(pal.top));
  bg.addColorStop(0.45, col(pal.mid));
  bg.addColorStop(1, col(pal.belly));
  ctx.fillStyle = bg;
  ctx.fill();

  if (sim.data.color === 'calico' && paleT < 1) {
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = alpha * 0.75;
    ctx.fillStyle = col('#1f2937');
    ctx.beginPath(); ctx.ellipse(-L * 0.05, -Ht * 0.35, L * 0.08, Ht * 0.3, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(L * 0.2, Hb * 0.1, L * 0.05, Hb * 0.2, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col('#ffffff');
    ctx.beginPath(); ctx.ellipse(-L * 0.18, Hb * 0.2, L * 0.07, Hb * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Sheen along the back
  ctx.beginPath();
  ctx.moveTo(L * 0.38, -Ht * 0.45);
  ctx.quadraticCurveTo(L * 0.05, -Ht * 0.9, -L * 0.2, -Ht * 0.35);
  ctx.strokeStyle = `rgba(255,255,255,${0.35 * (1 - paleT * 0.5) * (1 - greyT * 0.5)})`;
  ctx.lineWidth = Math.max(1, L * 0.025);
  ctx.lineCap = 'round';
  ctx.stroke();

  // Stuffed: a stretched-belly highlight
  if (g > 1.35 && sim.state === 'alive') {
    ctx.beginPath();
    ctx.ellipse(L * 0.08, Hb * 0.55, L * 0.16, Hb * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
  }

  // Gill line
  ctx.beginPath();
  ctx.arc(L * 0.36, 0, Math.min(Ht, Hb) * 0.55, Math.PI * 0.7, Math.PI * 1.3);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = Math.max(0.8, L * 0.012);
  ctx.stroke();

  // Pectoral fin
  ctx.save();
  ctx.translate(L * 0.14, Hb * 0.3);
  ctx.rotate(0.5 + Math.sin(sim.fin * 1.3) * 0.35);
  ctx.beginPath();
  ctx.ellipse(-L * 0.06, 0, L * 0.09, L * 0.035, 0, 0, Math.PI * 2);
  ctx.fillStyle = col(pal.fin);
  ctx.globalAlpha = alpha * 0.85;
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = alpha;

  // Eye (fixed size)
  const ex = L * 0.32, ey = -L * 0.27 * 0.2;
  const er = Math.max(2, L * 0.055);
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, Math.PI * 2);
  ctx.fillStyle = '#fbfbf7';
  ctx.fill();
  if (sim.state === 'dying' && !popping) {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = Math.max(1, er * 0.35);
    ctx.beginPath();
    ctx.moveTo(ex - er * 0.55, ey - er * 0.55); ctx.lineTo(ex + er * 0.55, ey + er * 0.55);
    ctx.moveTo(ex + er * 0.55, ey - er * 0.55); ctx.lineTo(ex - er * 0.55, ey + er * 0.55);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(ex + er * 0.15, ey, er * (sim.scared > 0 || popping ? 0.35 : 0.58), 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + er * 0.3, ey - er * 0.3, er * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  // Mouth
  ctx.beginPath();
  ctx.arc(L * 0.48, L * 0.03, L * 0.025 * (puff > 1.02 ? 1.8 : 1), -0.4, 0.9);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(0.8, L * 0.012);
  ctx.stroke();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------
function render(now, perf) {
  const t = perf / 1000;
  ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  ctx.clearRect(0, 0, G.w, G.h);
  ctx.drawImage(bgLayer, 0, 0, G.w, G.h);

  ctx.save();
  waterClipPath(ctx);
  ctx.clip();
  drawWater(t);
  ctx.drawImage(gravelLayer, 0, 0, G.w, G.h);
  if (!prefersReducedMotion) drawLightRays(t);
  drawAirstone();
  drawPlants(t, 0);
  drawMeals(perf);
  const order = [...sims.values()].sort((a, b) => (a.state !== 'alive') - (b.state !== 'alive') || (a.id === selectedId) - (b.id === selectedId));
  for (const s of order) drawFish(s, now, perf);
  drawPlants(t, 1);
  drawBubbles();
  drawParticles();
  drawRipples();
  ctx.restore();

  drawSurface(t);
  drawGlass();
}

let lastPerf = performance.now();
let lastSecond = 0;
function tick() {
  const perf = performance.now();
  const dt = clamp((perf - lastPerf) / 1000, 0, 0.1);
  lastPerf = perf;
  const now = Date.now();

  for (const s of sims.values()) updateSim(s, dt, now, perf);
  for (const [id, s] of sims) if (s.state === 'gone') sims.delete(id);
  updateMeals(dt, perf);
  updateBubbles(dt);
  updateEffects(dt);
  render(now, perf);
  updateCard(now, perf);

  if (perf - lastSecond > 1000) {
    lastSecond = perf;
    everySecond(now);
  }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------
const KEYS = { room: 'fishbowl.room', nick: 'fishbowl.nickname', cache: 'fishbowl.cache' };
function stored(key) { try { return localStorage.getItem(key); } catch { return null; } }
function store(key, value) {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* private mode */ }
}

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');

let nickname = R.cleanNickname(stored(KEYS.nick));
let roomCode = null;
let room = null;
let api = null;          // bowl.js (or the demo stand-in) once loaded
let apiLoading = null;
let apiFailed = false;
let stopWatching = null;
let online = navigator.onLine;
let selectedId = null;
let lastTouch = 0;       // for the 5-second card timeout
const seenLog = new Set();
let housekeepingAt = 0;

const logKey = (e) => `${e.at}|${e.by}|${e.fishId}`;

function loadApi() {
  if (DEMO) return Promise.resolve(api);
  if (api) return Promise.resolve(api);
  if (!apiLoading) {
    apiLoading = import('./bowl.js').then((m) => {
      api = m;
      apiFailed = false;
      refreshControls();
      return m;
    }, (e) => {
      apiLoading = null;
      apiFailed = true;
      refreshControls();
      throw e;
    });
  }
  return apiLoading;
}

const canWrite = () => DEMO || (online && !!api && !!room);

// Bring the local fish in line with the latest bowl.
function applyRoom(next) {
  const now = Date.now();
  room = next;
  const fishMap = next.fish || {};

  // 1. New feed-log entries → flakes (and "held" fullness until eaten).
  const fresh = [];
  for (const e of next.feedLog || []) {
    const k = logKey(e);
    if (seenLog.has(k)) continue;
    seenLog.add(k);
    if (now - e.at < 30000) fresh.push(e);
  }
  fresh.sort((a, b) => a.at - b.at);
  const drops = [];
  for (const e of fresh) {
    const targets = e.fishId == null
      ? [...sims.values()].filter((s) => s.state === 'alive' && fishMap[s.id])
      : [sims.get(e.fishId)].filter((s) => s && s.state === 'alive');
    for (const s of targets) {
      if (s.held == null) s.held = clamp(R.currentFullness(s.data, now), 0, 100);
      s.pending += 1;
    }
    if (targets.length) drops.push([targets, e.fishId == null]);
    if (e.by !== nickname) toast(R.describeFeed(e));
  }

  // 2. Fish that arrived, changed, or died.
  for (const [id, data] of Object.entries(fishMap)) {
    let sim = sims.get(id);
    if (!sim) {
      if (!R.isAlive(data, now)) continue;
      sim = makeSim(id, data, now, true);
      sims.set(id, sim);
      if (now - data.addedAt < 60000) {
        toast(`${data.name} joined the bowl!`);
        for (let i = 0; i < 8; i++) {
          particles.push({ kind: 'bubble', x: sim.x + rand(-0.05, 0.05), y: sim.y + rand(0, 0.06), vx: rand(-0.1, 0.1), vy: rand(-0.2, 0), r: rand(0.006, 0.013), rot: 0, vr: 0, age: 0, life: rand(0.6, 1.2), buoyant: true });
        }
      } else {
        sim.bornAt = -1e9;
      }
      continue;
    }
    sim.data = data;
    if (sim.state === 'alive' && data.diedAt != null) {
      const cause = data.cause || 'starved';
      const recent = now - data.diedAt < 60000;
      if (sim.pending > 0 && cause === 'overfed') sim.pendingDeath = cause;
      else startDeath(sim, cause, recent);
    }
  }
  for (const sim of sims.values()) {
    if (!fishMap[sim.id] && sim.state === 'alive') {
      startDeath(sim, R.currentFullness(sim.data, now) <= 0 ? 'starved' : 'overfed', false);
    }
  }
  for (const [targets, spread] of drops) dropFlakes(targets.filter((s) => s.state === 'alive'), spread);

  refreshControls();
  refreshActivity(now);
  if (!$('sheet').hidden && sheetKind === 'history') showHistory();
}

function everySecond(now) {
  if (!room) return;
  // Starvation happens by the formula, even with nobody feeding.
  for (const s of sims.values()) {
    if (s.state === 'alive' && s.data.diedAt == null && R.currentFullness(s.data, now) <= 0) startDeath(s, 'starved', true);
  }
  if (R.needsHousekeeping(room, now) && canWrite() && now - housekeepingAt > 15000) {
    housekeepingAt = now;
    api.housekeeping(roomCode).catch(() => {});
  }
  refreshControls();
  refreshActivity(now);
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
function show(screen) {
  $('welcome').hidden = screen !== 'welcome';
  $('bowlUi').hidden = screen !== 'bowl';
}

function showWelcome(message = '') {
  if (stopWatching) { stopWatching(); stopWatching = null; }
  roomCode = null;
  room = null;
  sims.clear();
  meals = [];
  deselect();
  show('welcome');
  $('nickInput').value = nickname === R.DEFAULT_NICKNAME ? '' : nickname;
  $('welcomeMsg').textContent = message;
  setWelcomeBusy(false);
}

function setWelcomeBusy(busy, label) {
  for (const id of ['createBtn', 'joinBtn']) $(id).disabled = busy;
  $('createBtn').textContent = busy && label === 'create' ? 'Creating…' : 'Create a bowl';
  $('joinBtn').textContent = busy && label === 'join' ? 'Joining…' : 'Join a bowl';
}

function saveNicknameFrom(input) {
  nickname = R.cleanNickname(input.value);
  store(KEYS.nick, nickname === R.DEFAULT_NICKNAME ? null : nickname);
}

function openBowl(code) {
  roomCode = code;
  store(KEYS.room, code);
  show('bowl');
  $('roomCode').textContent = code;
  sims.clear();
  meals = [];
  seenLog.clear();
  room = null;

  // Show the last known bowl straight away (works offline too).
  try {
    const cached = JSON.parse(stored(KEYS.cache) || 'null');
    if (cached && cached.code === code) applyRoom(cached.room);
  } catch { /* ignore a broken cache */ }
  refreshControls();
  connect();
}

function connect() {
  if (DEMO || !roomCode || stopWatching) return;
  const code = roomCode;
  loadApi().then((m) => {
    if (roomCode !== code || stopWatching) return;
    stopWatching = m.watchRoom(code, (data) => {
      if (data === null) {
        store(KEYS.room, null);
        showWelcome('No bowl with that code');
        return;
      }
      store(KEYS.cache, JSON.stringify({ code, room: data }));
      applyRoom(data);
    }, () => {
      if (stopWatching) { stopWatching(); stopWatching = null; }
      refreshControls();
      setTimeout(connect, 5000);
    });
  }, () => { /* offline: the 'online' event retries */ });
}

function refreshControls() {
  const now = Date.now();
  const living = room ? R.livingFish(room, now).length : 0;
  const offline = !DEMO && (!online || apiFailed);
  $('count').textContent = `${living} / ${R.MAX_FISH} fish`;
  $('offline').hidden = !offline;
  const full = living >= R.MAX_FISH;
  $('addBtn').disabled = !canWrite() || full;
  $('fullMsg').hidden = !full;
  $('feedBtn').disabled = !canWrite() || living === 0;
  $('fcFeed').disabled = !canWrite();
}

function refreshActivity(now) {
  if (room) $('activity').textContent = R.activityLine(room, now);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
// Firebase refuses everything until the rules are published and Anonymous
// sign-in is on (README, Firebase setup steps 3 and 6).
function setupProblem(e) {
  const code = (e && e.code) || '';
  if (code === 'permission-denied') return 'The bowl database isn’t set up yet: the Firestore rules need to be published.';
  if (/auth\/(operation-not-allowed|admin-restricted-operation|configuration-not-found)/.test(code)) return 'Sign-in isn’t set up yet: Anonymous sign-in needs to be turned on in Firebase.';
  if (code === 'auth/unauthorized-domain') return 'This web address isn’t allowed yet: add it to Firebase’s authorized domains.';
  return '';
}

function explain(e) {
  if (setupProblem(e)) return setupProblem(e);
  if (e && e.code === 'full') return 'Bowl is full';
  if (e && e.code === 'gone') return 'Too late — that fish is gone';
  if (e && e.code === 'empty') return 'There are no fish to feed';
  if (e && e.code === 'missing') return 'This bowl no longer exists';
  return navigator.onLine ? 'Something went wrong. Please try again.' : 'Offline — try again when you’re connected';
}

async function addFish() {
  if (!canWrite()) return;
  try { await api.addFish(roomCode, nickname); } catch (e) { toast(explain(e)); }
}

async function feed(fishId = null) {
  if (!canWrite()) return;
  try { await api.feed(roomCode, nickname, fishId); } catch (e) { toast(explain(e)); }
}

async function share() {
  if (DEMO) { toast('This is a demo bowl. Create a real one to share it.'); return; }
  const url = `${location.origin}${location.pathname}?room=${roomCode}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Fishbowl', text: `Join my fishbowl! Code: ${roomCode}`, url });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied');
  } catch {
    openSheet('Share this link', `<p class="sheet-note">Send this link to friends:</p><input class="field-input" readonly value="${url}">`);
  }
}

// ---------------------------------------------------------------------------
// Selecting one fish
// ---------------------------------------------------------------------------
function select(sim) {
  selectedId = sim.id;
  lastTouch = performance.now();
  sim.pauseUntil = lastTouch + 1200;
  $('fcSwatch').style.background = `linear-gradient(180deg, ${paletteOf(sim.data.color).top}, ${paletteOf(sim.data.color).mid} 50%, ${paletteOf(sim.data.color).belly})`;
  $('fcName').textContent = `${sim.data.name} · ${sim.data.color}`;
  $('fishCard').hidden = false;
  cardValuesAt = 0;
  updateCard(Date.now(), lastTouch);
}

function deselect() {
  selectedId = null;
  $('fishCard').hidden = true;
}

let cardValuesAt = 0;
function updateCard(now, perf) {
  if (selectedId == null) return;
  const sim = sims.get(selectedId);
  if (!sim || sim.state !== 'alive' || perf - lastTouch > 5000) { deselect(); return; }
  const card = $('fishCard');
  const [px, py] = toPx(sim.x, sim.y);
  const w = card.offsetWidth, h = card.offsetHeight;
  const L = fishLenPx(sim);
  let top = py - L * 0.7 - h - 8;
  if (top < 120) top = py + L * 0.7 + 8;
  const left = clamp(px - w / 2, 12, G.w - w - 12);
  card.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  if (perf - cardValuesAt > 250) {
    cardValuesAt = perf;
    const full = clamp(R.currentFullness(sim.data, now), 0, 100);
    $('fcBar').style.width = `${full}%`;
    $('fcBar').style.background = full < 20 ? 'var(--danger)' : full >= 90 ? 'var(--warn)' : 'var(--accent-2)';
    $('fcPct').textContent = `${full} / 100 full`;
    $('fcMood').textContent = full >= 90 ? 'Stuffed! Careful' : full < 20 ? 'Hungry!' : full < 40 ? 'Peckish' : 'Happy';
  }
}

// ---------------------------------------------------------------------------
// Sheets: feeding history and the menu
// ---------------------------------------------------------------------------
let sheetKind = null;
function openSheet(title, html, kind = null) {
  sheetKind = kind;
  $('sheetTitle').textContent = title;
  $('sheetBody').innerHTML = html;
  $('sheet').hidden = false;
}
function closeSheet() {
  $('sheet').hidden = true;
  sheetKind = null;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function formatWhen(ms) {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return time;
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

function showHistory() {
  const log = (room && room.feedLog) || [];
  const items = log.length
    ? log.map((e) => `<li><span>${escapeHtml(R.describeFeed(e))}</span><time>${escapeHtml(formatWhen(e.at))}</time></li>`).join('')
    : '<li class="empty">Nobody has fed the fish yet.</li>';
  openSheet('Feeding history', `<ul class="history">${items}</ul>`, 'history');
}

function showMenu() {
  openSheet('Menu', `
    <label class="field">
      <span>What should friends see you as?</span>
      <input id="menuNick" class="field-input" maxlength="20" autocomplete="nickname" placeholder="Someone" value="${escapeHtml(nickname === R.DEFAULT_NICKNAME ? '' : nickname)}">
      <small>A nickname, not your full name</small>
    </label>
    <button id="menuSave" class="btn">Save nickname</button>
    <p class="sheet-note">Bowl code: <b>${escapeHtml(roomCode || '')}</b></p>
    <button id="menuLeave" class="btn btn-quiet">${DEMO ? 'Leave the demo' : 'Leave bowl'}</button>
    <p class="sheet-note small">Leaving only forgets the bowl on this phone. It keeps existing for your friends.</p>
  `, 'menu');
  $('menuSave').addEventListener('click', () => {
    saveNicknameFrom($('menuNick'));
    closeSheet();
    toast(`You’re “${nickname}”`);
  });
  $('menuLeave').addEventListener('click', () => {
    closeSheet();
    if (DEMO) { location.href = location.pathname; return; }
    store(KEYS.room, null);
    store(KEYS.cache, null);
    showWelcome();
  });
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
function toast(msg) {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 450);
  }, 3200);
}

// ---------------------------------------------------------------------------
// Demo bowl (?demo): local only, no Firebase, made-up people and fish.
// ---------------------------------------------------------------------------
function startDemo() {
  const now = Date.now();
  const ids = ['demoa1', 'demob2', 'democ3', 'demod4', 'demoe5'];
  const spec = [['Pickle', 'gold', 94], ['Captain', 'orange', 70], ['Mochi', 'calico', 50], ['Biscuit', 'silver', 32], ['Noodle', 'red', 12]];
  const fish = {};
  ids.forEach((id, i) => {
    const [name, color, full] = spec[i];
    fish[id] = { name, color, addedAt: now - (i + 1) * 3600e3, addedBy: ['Sam', 'Priya', 'Alex'][i % 3], fullness: full, fullnessAt: now, diedAt: null, cause: null };
  });
  const demoRoom = {
    lastFedAt: now - 3 * 60e3, lastFedBy: 'Alex',
    feedLog: [
      { by: 'Alex', at: now - 3 * 60e3, fishId: 'demoa1', fishName: 'Pickle' },
      { by: 'Priya', at: now - 47 * 60e3, fishId: null, fishName: null },
      { by: 'Sam', at: now - 5 * 3600e3, fishId: null, fishName: null }
    ],
    fish
  };
  const later = (fn) => new Promise((resolve, reject) => setTimeout(() => {
    try { const res = fn(); applyRoom(res.room); resolve(res); } catch (e) { reject(e); }
  }, 150));
  api = {
    addFish: () => later(() => R.addFish(room, { id: R.makeFishId(crypto.getRandomValues(new Uint8Array(10))), by: nickname, now: Date.now() })),
    feed: (_code, _nick, fishId) => later(() => R.feed(room, { fishId, by: nickname, now: Date.now() })),
    housekeeping: () => later(() => R.recordDeaths(room, Date.now()))
  };
  roomCode = 'DEMO';
  show('bowl');
  $('roomCode').textContent = 'DEMO';
  applyRoom(demoRoom);
  toast('Demo bowl: nothing here is shared or saved.');
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
$('createBtn').addEventListener('click', async () => {
  saveNicknameFrom($('nickInput'));
  $('welcomeMsg').textContent = '';
  setWelcomeBusy(true, 'create');
  try {
    const m = await loadApi();
    const code = await m.createRoom();
    openBowl(code);
  } catch (e) {
    setWelcomeBusy(false);
    $('welcomeMsg').textContent = setupProblem(e) || 'Couldn’t create a bowl. Check your connection and try again.';
  }
});

$('joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  saveNicknameFrom($('nickInput'));
  const code = R.normalizeRoomCode($('codeInput').value);
  if (!code) { $('welcomeMsg').textContent = 'Room codes are 6 letters and numbers, like K7QM3P.'; return; }
  $('welcomeMsg').textContent = '';
  setWelcomeBusy(true, 'join');
  try {
    const m = await loadApi();
    if (await m.roomExists(code)) { openBowl(code); return; }
    $('welcomeMsg').textContent = 'No bowl with that code';
  } catch (e) {
    $('welcomeMsg').textContent = setupProblem(e) || 'Couldn’t reach the bowl. Check your connection and try again.';
  }
  setWelcomeBusy(false);
});

$('nickInput').addEventListener('change', () => saveNicknameFrom($('nickInput')));
$('addBtn').addEventListener('click', addFish);
$('feedBtn').addEventListener('click', () => feed(null));
$('fcFeed').addEventListener('click', () => {
  lastTouch = performance.now();
  if (selectedId) feed(selectedId);
});
$('shareBtn').addEventListener('click', share);
$('menuBtn').addEventListener('click', showMenu);
$('activity').addEventListener('click', showHistory);
$('sheetClose').addEventListener('click', closeSheet);
$('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSheet(); deselect(); } });

canvas.addEventListener('pointerdown', (e) => {
  if ($('bowlUi').hidden) return;
  const [x, y] = toNorm(e.clientX, e.clientY);
  // Generous tap area: fish move and fingers are big.
  let best = null, bestD = Infinity;
  for (const s of sims.values()) {
    if (s.state !== 'alive') continue;
    const d = Math.hypot((s.x - x) * G.R, (s.y - y) * G.R);
    if (d < Math.max(44, fishLenPx(s) * 0.9) && d < bestD) { best = s; bestD = d; }
  }
  if (best) { select(best); return; }
  deselect();
  if (x * x + y * y < 1 && y > BOWL.WATER_Y && y < BOWL.BASE_Y) {
    ripples.push({ x, y, age: 0, life: 0.7, size: 0.02 });
    for (const s of sims.values()) startle(s, x, y, 0.5);
  }
});

window.addEventListener('resize', resize);
window.addEventListener('online', () => { online = true; refreshControls(); connect(); });
window.addEventListener('offline', () => { online = false; refreshControls(); });

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
resize();
requestAnimationFrame(tick);

if (DEMO) {
  startDemo();
} else {
  const linked = R.normalizeRoomCode(params.get('room'));
  if (params.has('room')) history.replaceState(null, '', location.pathname);
  const saved = R.normalizeRoomCode(stored(KEYS.room));
  if (linked) {
    // A share link: go straight to that bowl.
    openBowl(linked);
  } else if (saved) {
    openBowl(saved);
  } else {
    showWelcome(params.has('room') ? 'That link has an invalid room code.' : '');
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
