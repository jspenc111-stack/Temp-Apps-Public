'use strict';

// ---------------------------------------------------------------------------
// Tunable rules
// ---------------------------------------------------------------------------
const CFG = {
  MAX_FISH: 10,
  START_FULLNESS: 50,
  DRAIN_PER_SEC: 1 / 10,        // -1 fullness every 10 seconds
  FEED_AMOUNT: 30,              // +30 per meal
  BINGE_WINDOW_MS: 60 * 1000,   // meals eaten inside this window count toward popping
  MAX_MEALS_PER_MINUTE: 10,     // eating more than 10 meals in one minute = pop
  WARN_AT_MEALS: 8,             // fish start jiggling as a warning at this many
  DEAD_FADE_MS: 3000,           // belly-up fish disappear after ~3s
  MEAL_TIMEOUT_MS: 9000,        // a fish always gets its meal within this time
  SAVE_EVERY_MS: 2000
};
const STORAGE_KEY = 'fishbowl.v1';

const PALETTES = [
  { key: 'orange',  label: 'Orange',   top: '#c2410c', mid: '#ff8a2a', belly: '#ffe0b8', fin: '#ff9f43' },
  { key: 'gold',    label: 'Gold',     top: '#b7791f', mid: '#f6c343', belly: '#fff3c4', fin: '#ffd66b' },
  { key: 'silver',  label: 'Silver',   top: '#5b6b7a', mid: '#b8c4cf', belly: '#f4f7fa', fin: '#d6dee6' },
  { key: 'red',     label: 'Red',      top: '#9b1c1c', mid: '#e53e3e', belly: '#ffd1d1', fin: '#ff6b6b' },
  { key: 'calico',  label: 'Calico',   top: '#1f2937', mid: '#f97316', belly: '#fff7ed', fin: '#fdba74' },
  { key: 'blue',    label: 'Blue',     top: '#1e3a8a', mid: '#3b82f6', belly: '#dbeafe', fin: '#93c5fd' },
  { key: 'white',   label: 'Pearl',    top: '#a8a29e', mid: '#f5f0e8', belly: '#ffffff', fin: '#fde2cf' },
  { key: 'lemon',   label: 'Lemon',    top: '#a16207', mid: '#facc15', belly: '#fefce8', fin: '#fde047' }
];

const NAMES = [
  'Bubbles', 'Finn', 'Nemo', 'Goldie', 'Sushi', 'Captain', 'Blub', 'Noodle', 'Pickles', 'Biscuit',
  'Gill', 'Marlin', 'Wanda', 'Squirt', 'Mango', 'Pebble', 'Ziggy', 'Waffles', 'Dory', 'Sir Swims',
  'Jellybean', 'Mochi', 'Rocket', 'Pip', 'Coral', 'Tofu', 'Sprinkles', 'Olive', 'Chompers', 'Kipper',
  'Minnie', 'Shelly', 'Taco', 'Fishstick', 'Admiral', 'Puddle', 'Gus', 'Poppy', 'Sunny', 'Wiggles'
];

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const countEl = $('count');
const addBtn = $('addBtn');
const feedBtn = $('feedBtn');
const fullMsg = $('fullMsg');
const infoEl = $('info');
const toastsEl = $('toasts');

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

function formatAge(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s old`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min old`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} hr ${m % 60} min old`;
  return `${Math.floor(h / 24)} days old`;
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

  const topSpace = 60, bottomSpace = 120;
  const avail = G.h - topSpace - bottomSpace;
  G.R = Math.max(80, Math.min(G.w * 0.46, avail * 0.56, 380));
  G.cx = G.w / 2;
  G.cy = topSpace + avail * 0.5 + G.R * 0.02;

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
// Food flakes. Each "meal" belongs to one fish; it's a small cluster of flakes
// that sinks until that fish swims over and eats it.
// ---------------------------------------------------------------------------
let meals = [];
function dropMeal(fish, now) {
  const x = clamp(fish.x + rand(-0.5, 0.5), -0.6, 0.6);
  meals.push({
    owner: fish.id,
    x,
    y: BOWL.WATER_Y + 0.01,
    vy: rand(0.05, 0.09),
    born: now,
    flakes: Array.from({ length: 5 }, () => ({
      dx: rand(-0.04, 0.04), dy: rand(-0.025, 0.025), r: rand(0.011, 0.018), rot: rand(0, Math.PI),
      c: pick(['#c0392b', '#e67e22', '#d35400', '#f1c40f', '#8e5a2a'])
    }))
  });
}
function updateMeals(dt, now) {
  for (const m of meals) {
    const floor = BOWL.GRAVEL_Y - 0.03;
    if (m.y < floor) {
      m.y = Math.min(floor, m.y + m.vy * dt);
      m.x += Math.sin(now / 600 + m.born) * 0.01 * dt;
    }
    // uneaten meals of dead fish just dissolve
    if (!fishes.some((f) => f.id === m.owner && f.state === 'alive') && now - m.born > 4000) m.dead = true;
  }
  meals = meals.filter((m) => !m.dead);
}
function drawMeals(now) {
  for (const m of meals) {
    const fadeOut = fishes.some((f) => f.id === m.owner && f.state === 'alive') ? 1 : clamp(1 - (now - m.born - 2000) / 2000, 0, 1);
    for (const f of m.flakes) {
      const [px, py] = toPx(m.x + f.dx, m.y + f.dy);
      ctx.save();
      ctx.globalAlpha = fadeOut;
      ctx.translate(px, py);
      ctx.rotate(f.rot + now / 1500);
      ctx.fillStyle = f.c;
      const s = f.r * G.R;
      ctx.fillRect(-s, -s * 0.5, s * 2, s);
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// Fish
// ---------------------------------------------------------------------------
let fishes = [];
let nextId = 1;
let selectedId = null;

function newFish(now) {
  const usedNames = new Set(fishes.map((f) => f.name));
  const name = pick(NAMES.filter((n) => !usedNames.has(n))) || `Fish #${nextId}`;
  const usedPals = fishes.map((f) => f.pal);
  const pal = pick(PALETTES.filter((p) => !usedPals.includes(p.key))) || pick(PALETTES);
  // New fish plop in at the surface and swim down.
  const x = rand(-0.4, 0.4);
  return makeFish({
    id: nextId++, name, pal: pal.key, size: rand(0.85, 1.12),
    fullness: CFG.START_FULLNESS, x, y: BOWL.WATER_Y + 0.08, born: now, meals: []
  });
}

function makeFish(d) {
  const [tx, ty] = randomSwimPoint();
  return {
    ...d,
    vx: rand(-0.1, 0.1), vy: 0.15,
    tx, ty,
    retarget: rand(2, 5),
    face: Math.random() < 0.5 ? -1 : 1,
    tilt: 0,
    tail: rand(0, 10),
    fin: rand(0, 10),
    speedMul: rand(0.85, 1.15),
    scared: 0,
    state: 'alive',     // alive | starved (belly-up) | popping
    stateAt: 0,
    cause: null,
    gulp: 0             // little squash when eating
  };
}

function palette(f) {
  return PALETTES.find((p) => p.key === f.pal) || PALETTES[0];
}

function recentMeals(f, now) {
  return f.meals.filter((t) => now - t < CFG.BINGE_WINDOW_MS).length;
}

// Visual fatness: grows with each meal in the last minute (fading as meals
// age out of the window) and a little with fullness.
function fatness(f, now) {
  const recent = f.meals
    .filter((t) => now - t < CFG.BINGE_WINDOW_MS)
    .reduce((acc, t) => acc + 0.5 + 0.5 * (1 - (now - t) / CFG.BINGE_WINDOW_MS), 0);
  return 1 + (recent / CFG.MAX_MEALS_PER_MINUTE) * 0.9 + Math.max(0, (f.fullness - 55) / 45) * 0.15;
}

function fishLength(f) {
  // Size shifts slightly with fullness.
  return G.R * 0.24 * f.size * (0.9 + 0.18 * clamp(f.fullness, 0, 100) / 100);
}

function eat(f, now) {
  f.meals.push(now);
  f.meals = f.meals.filter((t) => now - t < CFG.BINGE_WINDOW_MS);
  f.fullness = Math.min(100, f.fullness + CFG.FEED_AMOUNT);
  f.gulp = 1;
  if (f.meals.length > CFG.MAX_MEALS_PER_MINUTE) {
    startPop(f, now, 'binge');
  } else if (f.meals.length >= CFG.WARN_AT_MEALS) {
    particles.push({ kind: 'text', text: 'urp!', x: f.x, y: f.y - 0.12, vx: 0, vy: -0.08, r: 0, rot: 0, vr: 0, age: 0, life: 1.2, buoyant: true });
  }
}

function startPop(f, now, cause) {
  f.state = 'popping';
  f.stateAt = now;
  f.cause = cause;
}

function burst(f) {
  const pal = palette(f);
  for (let i = 0; i < 26; i++) {
    const a = rand(0, Math.PI * 2), s = rand(0.3, 1.1);
    particles.push({
      kind: i % 3 === 0 ? 'bubble' : 'scale',
      color: pick([pal.mid, pal.fin, pal.belly, pal.top]),
      x: f.x, y: f.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      r: rand(0.008, 0.02), rot: rand(0, 6), vr: rand(-8, 8),
      age: 0, life: rand(0.9, 1.8), buoyant: i % 3 === 0
    });
  }
  particles.push({ kind: 'text', text: 'POP!', x: f.x, y: f.y - 0.05, vx: 0, vy: -0.1, r: 0, rot: 0, vr: 0, age: 0, life: 1.3, buoyant: true });
  ripples.push({ x: f.x, y: f.y, age: 0, life: 0.6, size: 0.05, color: 'rgba(255,240,200,0.9)' });
  // Nearby fish get a fright.
  for (const o of fishes) if (o !== f) startle(o, f.x, f.y, 0.7);
}

function die(f, now, cause) {
  f.state = 'starved';
  f.stateAt = now;
  f.cause = cause;
  f.deadX = f.x;
  f.deadY = f.y;
}

function startle(f, x, y, radius) {
  if (f.state !== 'alive') return;
  const dx = f.x - x, dy = f.y - y;
  const d = Math.hypot(dx, dy);
  if (d > radius) return;
  const push = (1 - d / radius) * 1.6 + 0.4;
  const nx = d > 0.001 ? dx / d : rand(-1, 1), ny = d > 0.001 ? dy / d : rand(-1, 1);
  f.vx = nx * push;
  f.vy = ny * push;
  f.scared = 1.2;
  const [tx, ty] = randomSwimPoint();
  f.tx = tx; f.ty = ty;
}

function updateFish(f, dt, now) {
  f.gulp = Math.max(0, f.gulp - dt * 3);

  if (f.state === 'popping') {
    if (now - f.stateAt > 700) {
      burst(f);
      f.remove = true;
      toast(`💥 ${f.name} ate more than ${CFG.MAX_MEALS_PER_MINUTE} meals in a minute and popped!`);
    }
    return;
  }

  if (f.state === 'starved') {
    // Belly-up, float to the surface, then fade.
    const k = clamp((now - f.stateAt) / 2000, 0, 1);
    const ease = 1 - (1 - k) ** 2;
    f.x = f.deadX + Math.sin(now / 700) * 0.01;
    f.y = lerp(f.deadY, BOWL.WATER_Y + 0.06, ease);
    f.tilt = lerp(f.tilt, 0, dt * 2);
    if (now - f.stateAt > CFG.DEAD_FADE_MS) f.remove = true;
    return;
  }

  // Hunger
  if (f.fullness <= 0) {
    f.fullness = 0;
    die(f, now, 'starved');
    toast(`🪦 ${f.name} starved.`);
    return;
  }

  // Pick where to go: my food, or a wander target.
  const meal = meals.find((m) => m.owner === f.id);
  let tx = f.tx, ty = f.ty, speed = 0.18;
  if (meal) {
    tx = meal.x; ty = clamp(meal.y, BOWL.WATER_Y + 0.1, BOWL.GRAVEL_Y - 0.08);
    speed = 0.45;
    const reached = Math.hypot(f.x - meal.x, f.y - meal.y) < 0.07;
    if (reached || now - meal.born > CFG.MEAL_TIMEOUT_MS) {
      meal.dead = true;
      meals = meals.filter((m) => m !== meal);
      eat(f, now);
      if (f.state !== 'alive') return;
    }
  } else {
    f.retarget -= dt;
    if (f.retarget <= 0 || Math.hypot(f.x - tx, f.y - ty) < 0.05) {
      [f.tx, f.ty] = randomSwimPoint();
      f.retarget = rand(3, 7);
    }
  }

  // Fat fish are sluggish.
  const fat = fatness(f, now);
  speed *= f.speedMul / (1 + (fat - 1) * 0.9);
  if (f.scared > 0) { f.scared -= dt; speed *= 2.2; }

  const dx = tx - f.x, dy = ty - f.y;
  const d = Math.hypot(dx, dy) || 1;
  const arrive = clamp(d / 0.15, 0.25, 1);
  const desVx = (dx / d) * speed * arrive;
  const desVy = (dy / d) * speed * arrive * 0.7;
  const turn = f.scared > 0 ? 1.2 : 2.2;
  f.vx = lerp(f.vx, desVx, clamp(dt * turn, 0, 1));
  f.vy = lerp(f.vy, desVy, clamp(dt * turn, 0, 1));

  // Soft walls
  if (!inSwimZone(f.x, f.y)) {
    const nd = Math.hypot(f.x, f.y) || 1;
    f.vx -= (f.x / nd) * dt * 1.5;
    f.vy -= (f.y / nd) * dt * 1.5;
    if (f.y < BOWL.WATER_Y + 0.12) f.vy += dt * 1.2;
    if (f.y > BOWL.GRAVEL_Y - 0.1) f.vy -= dt * 1.2;
  }

  f.x += f.vx * dt;
  f.y += f.vy * dt;
  // Hard clamp so a fish can never leave the water.
  const r = Math.hypot(f.x, f.y);
  if (r > 0.86) { f.x *= 0.86 / r; f.y *= 0.86 / r; }
  f.y = clamp(f.y, BOWL.WATER_Y + 0.07, BOWL.GRAVEL_Y - 0.05);

  // Facing & tilt
  if (Math.abs(f.vx) > 0.02) f.face = lerp(f.face, Math.sign(f.vx), clamp(dt * 5, 0, 1));
  const targetTilt = clamp(Math.atan2(f.vy, Math.abs(f.vx) + 0.05), -0.5, 0.5);
  f.tilt = lerp(f.tilt, targetTilt, clamp(dt * 4, 0, 1));

  const spd = Math.hypot(f.vx, f.vy);
  f.tail += dt * (5 + spd * 35);
  f.fin += dt * (4 + spd * 12);
}

function drawFish(f, now) {
  const pal = palette(f);
  const [px, py] = toPx(f.x, f.y);
  let L = fishLength(f);
  let fat = fatness(f, now);
  let alpha = 1;
  let paleT = 0;
  let bellyUp = false;
  let wobble = 0;

  if (f.state === 'popping') {
    const k = clamp((now - f.stateAt) / 700, 0, 1);
    fat += k * k * 1.6;
    L *= 1 + k * 0.25;
    wobble = Math.sin(now / 25) * 0.08 * k;
  } else if (f.state === 'starved') {
    const k = clamp((now - f.stateAt) / 1000, 0, 1);
    paleT = k;
    bellyUp = true;
    const fadeK = clamp((now - f.stateAt - (CFG.DEAD_FADE_MS - 1000)) / 1000, 0, 1);
    alpha = 1 - fadeK;
  } else if (recentMeals(f, now) >= CFG.WARN_AT_MEALS) {
    // One more meal and... jiggle as a warning.
    wobble = Math.sin(now / 90) * 0.03;
  }

  const H = L * 0.27 * fat;
  const col = (c) => (paleT > 0 ? pale(c, paleT) : c);
  const flick = f.state === 'alive' ? Math.sin(f.tail) * L * 0.07 : f.state === 'popping' ? Math.sin(now / 30) * L * 0.1 : 0;
  const gulpSquash = 1 + f.gulp * 0.12;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(px, py);
  ctx.rotate(f.tilt * Math.sign(f.face) + wobble);
  ctx.scale(f.face, bellyUp ? -1 : 1);
  ctx.scale(1, gulpSquash);

  // Selection glow
  if (f.id === selectedId && f.state === 'alive') {
    ctx.save();
    ctx.scale(1, 0.55);
    ctx.beginPath();
    ctx.arc(0, 0, L * 0.7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 240, 200, 0.55)';
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // Tail fin
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
  // tail rays
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 0.8;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(tailBase, 0);
    ctx.lineTo(tailBase - L * 0.28, i * L * 0.07 + flick * 0.9);
    ctx.stroke();
  }

  // Dorsal fin
  const finWave = Math.sin(f.fin) * L * 0.015;
  ctx.beginPath();
  ctx.moveTo(-L * 0.12, -H * 0.82);
  ctx.quadraticCurveTo(-L * 0.02 + finWave, -H * 1.1 - L * 0.12, L * 0.14, -H * 0.9);
  ctx.closePath();
  ctx.fillStyle = col(pal.fin);
  ctx.globalAlpha = alpha * 0.9;
  ctx.fill();
  ctx.globalAlpha = alpha;

  // Body
  ctx.beginPath();
  ctx.moveTo(L * 0.5, L * 0.01);
  ctx.bezierCurveTo(L * 0.46, -H * 0.9, L * 0.05, -H * 1.08, -L * 0.28, -H * 0.3);
  ctx.quadraticCurveTo(-L * 0.34, 0, -L * 0.28, H * 0.3);
  ctx.bezierCurveTo(L * 0.05, H * 1.08, L * 0.46, H * 0.85, L * 0.5, L * 0.01);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, -H, 0, H);
  bg.addColorStop(0, col(pal.top));
  bg.addColorStop(0.45, col(pal.mid));
  bg.addColorStop(1, col(pal.belly));
  ctx.fillStyle = bg;
  ctx.fill();

  // Calico spots
  if (pal.key === 'calico' && paleT < 1) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = col('#1f2937');
    ctx.globalAlpha = alpha * 0.75;
    ctx.beginPath(); ctx.ellipse(-L * 0.05, -H * 0.35, L * 0.08, H * 0.3, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(L * 0.2, H * 0.1, L * 0.05, H * 0.2, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col('#ffffff');
    ctx.beginPath(); ctx.ellipse(-L * 0.18, H * 0.2, L * 0.07, H * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Sheen along the back
  ctx.beginPath();
  ctx.moveTo(L * 0.38, -H * 0.45);
  ctx.quadraticCurveTo(L * 0.05, -H * 0.9, -L * 0.2, -H * 0.35);
  ctx.strokeStyle = `rgba(255,255,255,${0.35 * (1 - paleT * 0.5)})`;
  ctx.lineWidth = Math.max(1, L * 0.025);
  ctx.lineCap = 'round';
  ctx.stroke();

  // Gill line
  ctx.beginPath();
  ctx.arc(L * 0.36, 0, H * 0.55, Math.PI * 0.7, Math.PI * 1.3);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = Math.max(0.8, L * 0.012);
  ctx.stroke();

  // Pectoral (side) fin, flapping
  ctx.save();
  ctx.translate(L * 0.14, H * 0.3);
  ctx.rotate(0.5 + Math.sin(f.fin * 1.3) * 0.35);
  ctx.beginPath();
  ctx.ellipse(-L * 0.06, 0, L * 0.09, L * 0.035, 0, 0, Math.PI * 2);
  ctx.fillStyle = col(pal.fin);
  ctx.globalAlpha = alpha * 0.85;
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = alpha;

  // Eye
  const ex = L * 0.32, ey = -H * 0.18;
  const er = Math.max(2, L * 0.055);
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, Math.PI * 2);
  ctx.fillStyle = '#fbfbf7';
  ctx.fill();
  if (f.state === 'starved') {
    // X eyes
    ctx.strokeStyle = '#222';
    ctx.lineWidth = Math.max(1, er * 0.35);
    ctx.beginPath();
    ctx.moveTo(ex - er * 0.55, ey - er * 0.55); ctx.lineTo(ex + er * 0.55, ey + er * 0.55);
    ctx.moveTo(ex + er * 0.55, ey - er * 0.55); ctx.lineTo(ex - er * 0.55, ey + er * 0.55);
    ctx.stroke();
  } else {
    const pr = er * (f.state === 'popping' || f.scared > 0 ? 0.35 : 0.58);
    ctx.beginPath();
    ctx.arc(ex + er * 0.15, ey, pr, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + er * 0.3, ey - er * 0.3, er * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  // Mouth
  ctx.beginPath();
  ctx.arc(L * 0.48, L * 0.03, L * 0.025 * (1 + f.gulp), -0.4, 0.9);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(0.8, L * 0.012);
  ctx.stroke();

  ctx.restore();
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
// Frame
// ---------------------------------------------------------------------------
function render(now) {
  const t = now / 1000;
  ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  ctx.clearRect(0, 0, G.w, G.h);
  ctx.drawImage(bgLayer, 0, 0, G.w, G.h);

  // Everything inside the water
  ctx.save();
  waterClipPath(ctx);
  ctx.clip();
  drawWater(t);
  ctx.drawImage(gravelLayer, 0, 0, G.w, G.h);
  if (!prefersReducedMotion) drawLightRays(t);
  drawAirstone();
  drawPlants(t, 0);
  drawMeals(now);
  // Sort so dying fish render on top of the living.
  const order = [...fishes].sort((a, b) => (a.state !== 'alive') - (b.state !== 'alive') || a.id - b.id);
  for (const f of order) drawFish(f, now);
  drawPlants(t, 1);
  drawBubbles();
  drawParticles();
  drawRipples();
  ctx.restore();

  drawSurface(t);
  drawGlass();
}

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

let lastFrame = performance.now();
let lastDrain = Date.now();
let lastSave = 0;

function tick() {
  const perfNow = performance.now();
  const dt = clamp((perfNow - lastFrame) / 1000, 0, 0.1);
  lastFrame = perfNow;
  const now = Date.now();

  // Hunger uses wall-clock time so it keeps counting while the tab is hidden.
  const drainSec = (now - lastDrain) / 1000;
  lastDrain = now;
  for (const f of fishes) if (f.state === 'alive') f.fullness -= drainSec * CFG.DRAIN_PER_SEC;

  for (const f of fishes) updateFish(f, dt, now);
  const removed = fishes.filter((f) => f.remove);
  if (removed.length) {
    fishes = fishes.filter((f) => !f.remove);
    if (removed.some((f) => f.id === selectedId)) hideInfo();
    updateUI();
    save();
  }
  updateMeals(dt, now);
  updateBubbles(dt);
  updateEffects(dt);

  render(now);
  if (selectedId != null) updateInfo(now);

  if (now - lastSave > CFG.SAVE_EVERY_MS) { save(); lastSave = now; }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
function livingCount() {
  return fishes.filter((f) => f.state === 'alive').length;
}
// A dying fish still takes up its spot until it's gone.
function occupiedCount() {
  return fishes.length;
}

function updateUI() {
  const n = occupiedCount();
  countEl.textContent = `${n} / ${CFG.MAX_FISH} fish`;
  const full = n >= CFG.MAX_FISH;
  addBtn.disabled = full;
  fullMsg.hidden = !full;
  feedBtn.disabled = livingCount() === 0;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  toastsEl.appendChild(el);
  while (toastsEl.children.length > 3) toastsEl.firstChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 450);
  }, 3200);
}

function showInfo(f) {
  selectedId = f.id;
  const pal = palette(f);
  $('infoSwatch').style.background = `linear-gradient(180deg, ${pal.top}, ${pal.mid} 50%, ${pal.belly})`;
  $('infoName').textContent = f.name;
  infoEl.hidden = false;
  updateInfo(Date.now());
}
function hideInfo() {
  selectedId = null;
  infoEl.hidden = true;
}
let lastInfoRender = 0;
function updateInfo(now) {
  if (now - lastInfoRender < 200) return;
  lastInfoRender = now;
  const f = fishes.find((x) => x.id === selectedId);
  if (!f) return hideInfo();
  const pal = palette(f);
  const full = clamp(f.fullness, 0, 100);
  $('infoSub').textContent = `${pal.label} · ${formatAge(now - f.born)}`;
  $('infoPct').textContent = `${Math.round(full)} / 100`;
  const bar = $('infoBar');
  bar.style.width = `${full}%`;
  bar.style.background = full < 20 ? '#ff5a4e' : '#3fc1b0';
  const recent = recentMeals(f, now);
  let mood;
  if (f.state === 'popping') mood = '😵 Uh oh…';
  else if (f.state !== 'alive') mood = '🪦 Resting in peace';
  else if (full < 15) mood = '😫 Starving! Feed me!';
  else if (full < 35) mood = '😟 Getting hungry';
  else if (recent >= CFG.MAX_MEALS_PER_MINUTE) mood = '🤢 About to burst. One more bite and it pops!';
  else if (recent >= CFG.WARN_AT_MEALS) mood = '😣 Bloated. Ease off the food.';
  else if (full > 70) mood = '😌 Nicely full';
  else mood = '🙂 Happy and swimming';
  $('infoMood').textContent = mood;
  const mealsEl = $('infoMeals');
  const secsLeft = recent ? Math.ceil((CFG.BINGE_WINDOW_MS - (now - Math.min(...f.meals.filter((t) => now - t < CFG.BINGE_WINDOW_MS)))) / 1000) : 0;
  mealsEl.innerHTML = `Meals this minute: <b>${recent} / ${CFG.MAX_MEALS_PER_MINUTE}</b>` +
    (recent ? ` · oldest clears in ${secsLeft}s` : '');
  mealsEl.classList.toggle('warn', recent >= CFG.WARN_AT_MEALS);
}

addBtn.addEventListener('click', () => {
  if (occupiedCount() >= CFG.MAX_FISH) return;
  const f = newFish(Date.now());
  fishes.push(f);
  ripples.push({ x: f.x, y: BOWL.WATER_Y, age: 0, life: 0.6, size: 0.06, surface: true });
  for (let i = 0; i < 8; i++) {
    particles.push({ kind: 'bubble', x: f.x + rand(-0.05, 0.05), y: f.y + rand(0, 0.08), vx: rand(-0.1, 0.1), vy: rand(-0.2, 0), r: rand(0.006, 0.014), rot: 0, vr: 0, age: 0, life: rand(0.6, 1.2), buoyant: true });
  }
  toast(`🐟 Say hi to ${f.name}!`);
  updateUI();
  save();
});

feedBtn.addEventListener('click', () => {
  const now = Date.now();
  const alive = fishes.filter((f) => f.state === 'alive');
  if (!alive.length) return;
  for (const f of alive) dropMeal(f, now);
  feedBtn.animate?.([{ transform: 'scale(0.94)' }, { transform: 'scale(1)' }], { duration: 180 });
});

$('infoClose').addEventListener('click', hideInfo);

canvas.addEventListener('pointerdown', (e) => {
  const [x, y] = toNorm(e.clientX, e.clientY);
  const now = Date.now();

  // Tap a fish → info card
  let best = null, bestD = Infinity;
  for (const f of fishes) {
    if (f.state !== 'alive') continue;
    const d = Math.hypot((f.x - x) * G.R, (f.y - y) * G.R);
    const hit = fishLength(f) * 0.6 + 10;
    if (d < hit && d < bestD) { best = f; bestD = d; }
  }
  if (best) { showInfo(best); return; }

  const inBowl = x * x + y * y < 1 && y > BOWL.OPEN_Y && y < BOWL.BASE_Y;
  if (!inBowl) { hideInfo(); return; }

  // Tap the glass/water → ripple and startle nearby fish
  const cy = Math.max(y, BOWL.WATER_Y + 0.02);
  ripples.push({ x, y: cy, age: 0, life: 0.7, size: 0.02 });
  for (const f of fishes) startle(f, x, cy, 0.65);
  if (navigator.vibrate) navigator.vibrate(8);
  hideInfo();
  void now;
});

window.addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
function save() {
  try {
    const data = {
      v: 1,
      savedAt: Date.now(),
      nextId,
      fish: fishes
        .filter((f) => f.state === 'alive')
        .map((f) => ({
          id: f.id, name: f.name, pal: f.pal, size: f.size,
          fullness: f.fullness, x: f.x, y: f.y, born: f.born, meals: f.meals
        }))
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (_) { /* storage unavailable: the bowl just won't persist */ }
}

function load() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) { data = null; }
  if (!data || !Array.isArray(data.fish)) return;
  const now = Date.now();
  const awaySec = Math.max(0, (now - (data.savedAt || now)) / 1000);
  nextId = data.nextId || 1;
  const starved = [];
  for (const d of data.fish.slice(0, CFG.MAX_FISH)) {
    const fullness = d.fullness - awaySec * CFG.DRAIN_PER_SEC;
    if (fullness <= 0) { starved.push(d.name); continue; }
    const f = makeFish({ ...d, fullness, meals: (d.meals || []).filter((t) => now - t < CFG.BINGE_WINDOW_MS) });
    if (!inSwimZone(f.x, f.y)) [f.x, f.y] = randomSwimPoint();
    fishes.push(f);
    nextId = Math.max(nextId, f.id + 1);
  }
  if (starved.length) {
    const names = starved.length === 1 ? starved[0] : `${starved.slice(0, -1).join(', ')} and ${starved.at(-1)}`;
    setTimeout(() => toast(`🪦 While you were away, ${names} starved.`), 600);
  }
}

document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
window.addEventListener('pagehide', save);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
resize();
load();
updateUI();
if (!fishes.length) setTimeout(() => toast('Tap “Add fish” to get started. Tap a fish to meet it.'), 400);
requestAnimationFrame(tick);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
