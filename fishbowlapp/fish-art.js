// How the fish look: 12 types, their colors, how each one swims, and how
// fullness changes a fish's shape. Drawing only; no game rules in here.
//
// drawFish() draws one fish at (0, 0) facing right. The caller has already
// moved, turned and flipped the canvas (see drawFish in app.js).

// ---------------------------------------------------------------------------
// Colors. Keys match the colors in fish-rules.js.
// ---------------------------------------------------------------------------
export const PALETTES = {
  // The first eight also cover fish saved before types existed.
  orange:    { top: '#c2410c', mid: '#ff8a2a', belly: '#ffe0b8', fin: '#ff9f43' },
  gold:      { top: '#b7791f', mid: '#f6c343', belly: '#fff3c4', fin: '#ffd66b' },
  silver:    { top: '#6b7480', mid: '#d5dade', belly: '#f7f8f9', fin: '#e3e7ea', bars: '#2b2f36' },
  red:       { top: '#9b1c1c', mid: '#e53e3e', belly: '#ffd1d1', fin: '#ff6b6b' },
  calico:    { top: '#1f2937', mid: '#f97316', belly: '#fff7ed', fin: '#fdba74', spots: ['#1f2937', '#ffffff', '#c2410c'] },
  blue:      { top: '#1e3a8a', mid: '#3b82f6', belly: '#dbeafe', fin: '#93c5fd' },
  pearl:     { top: '#a8a29e', mid: '#f5f0e8', belly: '#ffffff', fin: '#fde2cf' },
  lemon:     { top: '#a16207', mid: '#facc15', belly: '#fefce8', fin: '#fde047' },
  // Comet
  sarasa:    { top: '#e9e4df', mid: '#fbf8f5', belly: '#ffffff', fin: '#f5e9e2', spots: ['#e0342b', '#d42a22'] },
  // Betta
  royal:     { top: '#1b1a6b', mid: '#2f45d6', belly: '#8fa3ff', fin: '#3b4cf0', fin2: '#8a2be2' },
  crimson:   { top: '#5e0b17', mid: '#c81e3a', belly: '#ff8fa0', fin: '#d7263d', fin2: '#7a0b1f' },
  violet:    { top: '#35084f', mid: '#8e3fd0', belly: '#dab6ff', fin: '#a24ee8', fin2: '#ff5fa2' },
  // Guppy: plain body, bright tail
  sunset:    { top: '#6d7560', mid: '#c7cdb7', belly: '#f0f2e8', fin: '#ff8a1f', fin2: '#ffd23f', tailSpots: '#1b1b1b' },
  cobalt:    { top: '#5f6b73', mid: '#c3ccd2', belly: '#eef2f4', fin: '#1f6feb', fin2: '#62d0ff', tailSpots: '#0b1f4d' },
  candy:     { top: '#6f6a70', mid: '#d5cfd6', belly: '#f6f2f6', fin: '#ff4f9a', fin2: '#ffb3d9', tailSpots: '#5b1036' },
  // Neon tetra
  neon:      { top: '#46553f', mid: '#a9b8a6', belly: '#eef0e8', fin: '#e9eee6', stripe: '#2ee6ff', lower: '#e0313f', lowerFull: false },
  cardinal:  { top: '#3f4d3a', mid: '#a0b09d', belly: '#ececec', fin: '#e9eee6', stripe: '#2ee6ff', lower: '#e0313f', lowerFull: true },
  // Angelfish
  marble:    { top: '#3a3a3a', mid: '#f2f2f0', belly: '#ffffff', fin: '#e9e9e6', spots: ['#141414', '#2a2a2a'] },
  goldangel: { top: '#b58a1c', mid: '#f7d56a', belly: '#fff6d6', fin: '#f9e29a', bars: '#c99a2e' },
  // Zebra danio
  zebra:     { top: '#4d5b73', mid: '#cfd8e2', belly: '#f1f4f7', fin: '#dfe6ee', stripes: '#27479a' },
  goldzebra: { top: '#8a6d2a', mid: '#f1dc9a', belly: '#fff8e2', fin: '#f4e6bc', stripes: '#c28a1d' },
  // Molly
  black:     { top: '#07070a', mid: '#1e1e23', belly: '#3b3b42', fin: '#16161a' },
  dalmatian: { top: '#c9c9c4', mid: '#f4f4f0', belly: '#ffffff', fin: '#ececea', specks: '#111111' },
  // Platy
  bluefire:  { top: '#1f3d8a', mid: '#3f78e0', belly: '#f7d8b0', fin: '#ff7a1a', rear: '#ff7a1a' },
  // Pufferfish
  puffer:    { top: '#5e6b1f', mid: '#b9c34c', belly: '#fff7d6', fin: '#d9dc8a', spots: ['#3c3a1a'] },
  puffgold:  { top: '#9a6a12', mid: '#f2c14e', belly: '#fff7df', fin: '#f7dc93', spots: ['#6b4a0c'] },
  // Pleco
  pleco:     { top: '#3a2c1e', mid: '#6b5238', belly: '#a58a68', fin: '#57432f', spots: ['#1f170f', '#c9b08a'] },
  plecogold: { top: '#40331a', mid: '#7d6128', belly: '#c3a260', fin: '#5d4a22', spots: ['#f2cf6a', '#e6b93f'] }
};
export const paletteOf = (color) => PALETTES[color] || PALETTES.orange;

// ---------------------------------------------------------------------------
// Types: shape, fins, size, and swimming style.
//   size  – body length compared with a goldfish
//   h     – body height as a fraction of body length (at normal fullness)
//   swim  – speed: how fast; dart: chance of quick bursts; bob: up-and-down;
//           wobble: side-to-side roll; turn: how quickly it changes course;
//           flutter: how fast the fins ripple; bottom: stays near the gravel
// ---------------------------------------------------------------------------
export const TYPE_ART = {
  goldfish:  { size: 1.0,  h: 0.27, shape: 'classic', tail: 'fan',    dorsal: 'normal', swim: { speed: 1.0 } },
  fantail:   { size: 0.95, h: 0.32, shape: 'egg',     tail: 'double', dorsal: 'normal', swim: { speed: 0.7, wobble: 0.14 } },
  comet:     { size: 1.05, h: 0.2,  shape: 'classic', tail: 'fork',   dorsal: 'normal', swim: { speed: 1.45, calm: true } },
  betta:     { size: 0.95, h: 0.22, shape: 'classic', tail: 'veil',   dorsal: 'long',   bottom: 'long', swim: { speed: 0.6, flutter: 1.7 } },
  guppy:     { size: 0.7,  h: 0.2,  shape: 'classic', tail: 'guppy',  dorsal: 'small',  swim: { speed: 1.1, dart: 0.4 } },
  tetra:     { size: 0.6,  h: 0.17, shape: 'slim',    tail: 'small',  dorsal: 'small',  swim: { speed: 1.5, dart: 0.3 } },
  angelfish: { size: 0.95, h: 0.42, shape: 'disc',    tail: 'angel',  dorsal: 'tall',   bottom: 'tall', swim: { speed: 0.7, turn: 0.8 } },
  danio:     { size: 0.7,  h: 0.15, shape: 'slim',    tail: 'small',  dorsal: 'small',  swim: { speed: 1.6, dart: 0.5 } },
  molly:     { size: 0.95, h: 0.28, shape: 'classic', tail: 'round',  dorsal: 'sail',   swim: { speed: 1.0 } },
  platy:     { size: 0.8,  h: 0.32, shape: 'stocky',  tail: 'round',  dorsal: 'normal', swim: { speed: 0.95, bob: 1 } },
  puffer:    { size: 0.8,  h: 0.34, shape: 'ball',    tail: 'tiny',   dorsal: 'tiny',   swim: { speed: 0.5, flutter: 2.6 } },
  pleco:     { size: 1.1,  h: 0.17, shape: 'flat',    tail: 'pleco',  dorsal: 'sail',   swim: { speed: 0.5, bottom: true, turn: 1.2 } }
};
export const artOf = (type) => TYPE_ART[type] || TYPE_ART.goldfish;

// ---------------------------------------------------------------------------
// Fullness → shape (dramatic on purpose: skinny when starving, a ball when full)
// ---------------------------------------------------------------------------
// Height/girth: 0.6× at 0, 1.0× at 50, 2.0× at 100.
export function girthFor(f) {
  return f <= 50 ? 0.6 + 0.4 * (f / 50) : 1 + (f - 50) / 50;
}
// Length: 0.9× at 0, 1.0× at 50, 1.2× at 100.
export function lengthFor(f) {
  return f <= 50 ? 0.9 + 0.1 * (f / 50) : 1 + 0.2 * ((f - 50) / 50);
}
// Gulp: swell ~25% past the new size, then bounce back.
export function gulpAt(ms) {
  const k = ms / 300;
  if (k < 0 || k > 1.8) return 1;
  return k <= 1 ? 1 + 0.25 * Math.sin(Math.PI * k) : 1 - 0.07 * Math.sin(Math.PI * (k - 1) / 0.8);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function seeded(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Nudge a color lighter/darker so no two fish are exactly the same.
function shade(hex, amt) {
  if (!hex || hex[0] !== '#' || !amt) return hex;
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (amt > 0 ? (255 - c) * amt : c * amt))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('')}`;
}

// ---------------------------------------------------------------------------
// Body outlines. All shapes are centred on (0, 0), nose to the right.
// Ht = height above the middle line, Hb = below (the belly).
// ---------------------------------------------------------------------------
function bodyGeometry(art, L, lenScale, girth) {
  const base = L * art.h;
  // The belly bulges a bit more than the back as a fish fills up; when
  // starving, the belly is sunken.
  const Ht = base * (1 + (girth - 1) * 0.75);
  const Hb = base * girth * (girth > 1 ? 1 + (girth - 1) * 0.18 : 0.8 + girth * 0.2);
  const long = { classic: [0.5, -0.3], egg: [0.4, -0.22], slim: [0.5, -0.32], stocky: [0.42, -0.26], disc: [0.34, -0.2], ball: [0.3, -0.24], flat: [0.5, -0.36] }[art.shape];
  return { Ht, Hb, nose: long[0] * L * lenScale, tailX: long[1] * L * lenScale };
}

function bodyPath(ctx, art, g) {
  const { Ht, Hb, nose, tailX } = g;
  ctx.beginPath();
  switch (art.shape) {
    case 'ball': {
      // Puffers swell into a ball: wider as well as taller.
      const ry = (Ht + Hb) / 2;
      const rx = Math.max((nose - tailX) / 2, ry * 0.92);
      ctx.ellipse((nose + tailX) / 2, (Hb - Ht) * 0.3, rx, ry, 0, 0, Math.PI * 2);
      break;
    }
    case 'disc': // angelfish: tall and flat, like a rounded triangle
      ctx.moveTo(nose, 0);
      ctx.quadraticCurveTo(nose * 0.4, -Ht * 1.15, tailX, -Ht * 0.18);
      ctx.lineTo(tailX, Hb * 0.18);
      ctx.quadraticCurveTo(nose * 0.4, Hb * 1.15, nose, 0);
      break;
    case 'flat': // pleco: arched back, flat belly
      ctx.moveTo(nose, Hb * 0.55);
      ctx.bezierCurveTo(nose * 1.02, -Ht * 0.7, nose * 0.1, -Ht * 1.2, tailX, -Ht * 0.25);
      ctx.lineTo(tailX, Hb * 0.35);
      ctx.bezierCurveTo(tailX * 0.4, Hb * 0.95, nose * 0.5, Hb * 1.0, nose, Hb * 0.55);
      break;
    default: { // classic, egg, slim, stocky
      const k = art.shape === 'egg' ? 1.12 : art.shape === 'stocky' ? 1.05 : 1;
      ctx.moveTo(nose, nose * 0.02);
      ctx.bezierCurveTo(nose * 0.92, -Ht * 0.9 * k, nose * 0.1, -Ht * 1.08 * k, tailX + nose * 0.04, -Ht * 0.3);
      ctx.quadraticCurveTo(tailX - nose * 0.08, 0, tailX + nose * 0.04, Hb * 0.28);
      ctx.bezierCurveTo(-nose * 0.04, Hb * 1.12 * k, nose * 0.88, Hb * 0.95 * k, nose, nose * 0.02);
    }
  }
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Tails and fins. Sizes come from L (the fish's normal length), not from
// fullness, so a stuffed fish looks round with small fins.
// ---------------------------------------------------------------------------
function tailPath(ctx, kind, x, L, flick, t) {
  ctx.beginPath();
  switch (kind) {
    case 'double': { // fantail: two big flowing lobes
      const w = Math.sin(t * 3) * L * 0.03;
      ctx.moveTo(x + L * 0.04, 0);
      ctx.bezierCurveTo(x - L * 0.15, -L * 0.05 + flick, x - L * 0.3, -L * 0.34 + flick + w, x - L * 0.46, -L * 0.3 + flick);
      ctx.quadraticCurveTo(x - L * 0.3, -L * 0.06 + flick, x - L * 0.36, flick);
      ctx.quadraticCurveTo(x - L * 0.3, L * 0.06 + flick, x - L * 0.46, L * 0.3 + flick);
      ctx.bezierCurveTo(x - L * 0.3, L * 0.34 + flick - w, x - L * 0.15, L * 0.05 + flick, x + L * 0.04, 0);
      break;
    }
    case 'fork': // comet: long, deeply forked
      ctx.moveTo(x + L * 0.03, 0);
      ctx.quadraticCurveTo(x - L * 0.2, -L * 0.06 + flick * 0.5, x - L * 0.52, -L * 0.26 + flick);
      ctx.quadraticCurveTo(x - L * 0.28, -L * 0.02 + flick * 0.7, x - L * 0.2, flick * 0.6);
      ctx.quadraticCurveTo(x - L * 0.28, L * 0.02 + flick * 0.7, x - L * 0.52, L * 0.26 + flick);
      ctx.quadraticCurveTo(x - L * 0.2, L * 0.06 + flick * 0.5, x + L * 0.03, 0);
      break;
    case 'veil': { // betta: huge, drooping, rippling
      const w1 = Math.sin(t * 4) * L * 0.05, w2 = Math.sin(t * 4 + 1.5) * L * 0.05;
      ctx.moveTo(x + L * 0.05, -L * 0.04);
      ctx.bezierCurveTo(x - L * 0.2, -L * 0.3 + flick, x - L * 0.45, -L * 0.34 + w1 + flick, x - L * 0.58, -L * 0.1 + w2 + flick);
      ctx.bezierCurveTo(x - L * 0.64, L * 0.12 + w1 + flick, x - L * 0.5, L * 0.44 + w2 + flick, x - L * 0.3, L * 0.46 + flick);
      ctx.bezierCurveTo(x - L * 0.18, L * 0.3 + flick, x - L * 0.04, L * 0.12, x + L * 0.05, L * 0.04);
      break;
    }
    case 'guppy': // big fan
      ctx.moveTo(x + L * 0.04, 0);
      ctx.lineTo(x - L * 0.42, -L * 0.3 + flick);
      ctx.quadraticCurveTo(x - L * 0.56, flick, x - L * 0.42, L * 0.3 + flick);
      ctx.closePath();
      break;
    case 'small':
      ctx.moveTo(x + L * 0.03, 0);
      ctx.lineTo(x - L * 0.2, -L * 0.13 + flick);
      ctx.lineTo(x - L * 0.12, flick * 0.8);
      ctx.lineTo(x - L * 0.2, L * 0.13 + flick);
      ctx.closePath();
      break;
    case 'angel': // with little streamers
      ctx.moveTo(x + L * 0.03, 0);
      ctx.quadraticCurveTo(x - L * 0.16, -L * 0.2 + flick, x - L * 0.34, -L * 0.3 + flick);
      ctx.quadraticCurveTo(x - L * 0.22, flick, x - L * 0.34, L * 0.3 + flick);
      ctx.quadraticCurveTo(x - L * 0.16, L * 0.2 + flick, x + L * 0.03, 0);
      break;
    case 'round':
      ctx.moveTo(x + L * 0.03, 0);
      ctx.quadraticCurveTo(x - L * 0.1, -L * 0.22 + flick, x - L * 0.28, -L * 0.14 + flick);
      ctx.quadraticCurveTo(x - L * 0.32, flick, x - L * 0.28, L * 0.14 + flick);
      ctx.quadraticCurveTo(x - L * 0.1, L * 0.22 + flick, x + L * 0.03, 0);
      break;
    case 'tiny':
      ctx.moveTo(x + L * 0.02, 0);
      ctx.quadraticCurveTo(x - L * 0.06, -L * 0.1 + flick, x - L * 0.14, -L * 0.08 + flick);
      ctx.quadraticCurveTo(x - L * 0.12, flick, x - L * 0.14, L * 0.08 + flick);
      ctx.quadraticCurveTo(x - L * 0.06, L * 0.1 + flick, x + L * 0.02, 0);
      break;
    case 'pleco':
      ctx.moveTo(x + L * 0.02, -L * 0.02);
      ctx.lineTo(x - L * 0.22, -L * 0.16 + flick);
      ctx.lineTo(x - L * 0.15, flick * 0.8);
      ctx.lineTo(x - L * 0.24, L * 0.12 + flick);
      ctx.lineTo(x + L * 0.02, L * 0.04);
      ctx.closePath();
      break;
    default: // 'fan': classic goldfish
      ctx.moveTo(x + L * 0.03, 0);
      ctx.quadraticCurveTo(x - L * 0.14, -L * 0.04 + flick * 0.5, x - L * 0.32, -L * 0.22 + flick);
      ctx.quadraticCurveTo(x - L * 0.22, flick * 0.8, x - L * 0.32, L * 0.22 + flick);
      ctx.quadraticCurveTo(x - L * 0.14, L * 0.04 + flick * 0.5, x + L * 0.03, 0);
  }
}

function dorsalPath(ctx, kind, g, L, wave) {
  const { Ht, nose, tailX } = g;
  const top = -Ht * 0.86;
  ctx.beginPath();
  switch (kind) {
    case 'sail': // molly and pleco: long and tall along the back
      ctx.moveTo(nose * 0.3, top);
      ctx.quadraticCurveTo(nose * 0.1 + wave, top - L * 0.2, tailX * 0.7, top - L * 0.14 + wave);
      ctx.lineTo(tailX * 0.8, top * 0.6);
      ctx.closePath();
      break;
    case 'long': // betta: flowing back fin
      ctx.moveTo(nose * 0.05, top);
      ctx.bezierCurveTo(-L * 0.05, top - L * 0.18 + wave, tailX - L * 0.05, top - L * 0.16 - wave, tailX - L * 0.14, top + L * 0.02 + wave);
      ctx.lineTo(tailX * 0.8, top * 0.5);
      ctx.closePath();
      break;
    case 'tall': // angelfish: tall and swept back
      ctx.moveTo(nose * 0.4, -Ht * 0.7);
      ctx.quadraticCurveTo(0, -Ht - L * 0.25, tailX - L * 0.08, -Ht - L * 0.3 + wave);
      ctx.quadraticCurveTo(tailX * 0.6, -Ht * 0.5, tailX * 0.8, -Ht * 0.2);
      ctx.closePath();
      break;
    case 'small':
      ctx.moveTo(-L * 0.02, top);
      ctx.quadraticCurveTo(-L * 0.06 + wave, top - L * 0.1, -L * 0.14, top + L * 0.01);
      ctx.closePath();
      break;
    case 'tiny':
      ctx.moveTo(-L * 0.02, top);
      ctx.quadraticCurveTo(-L * 0.06 + wave, top - L * 0.06, -L * 0.1, top + L * 0.02);
      ctx.closePath();
      break;
    default:
      ctx.moveTo(-L * 0.12, top * 0.95);
      ctx.quadraticCurveTo(-L * 0.02 + wave, top - L * 0.12, L * 0.14, top * 1.05);
      ctx.closePath();
  }
}

function bottomFinPath(ctx, kind, g, L, wave) {
  const { Hb, nose, tailX } = g;
  ctx.beginPath();
  if (kind === 'long') { // betta: long flowing fin under the body
    ctx.moveTo(nose * 0.1, Hb * 0.8);
    ctx.bezierCurveTo(-L * 0.05, Hb + L * 0.2 + wave, tailX - L * 0.05, Hb + L * 0.22 - wave, tailX - L * 0.12, Hb * 0.4 + L * 0.12 + wave);
    ctx.lineTo(tailX * 0.9, Hb * 0.4);
    ctx.closePath();
  } else { // angelfish: tall fin plus two thin streamers
    ctx.moveTo(nose * 0.4, Hb * 0.7);
    ctx.quadraticCurveTo(0, Hb + L * 0.25, tailX - L * 0.08, Hb + L * 0.3 + wave);
    ctx.quadraticCurveTo(tailX * 0.6, Hb * 0.5, tailX * 0.8, Hb * 0.2);
    ctx.closePath();
  }
}

// ---------------------------------------------------------------------------
// Markings, drawn inside the body outline.
// ---------------------------------------------------------------------------
function drawPattern(ctx, type, color, pal, g, L, col, rnd) {
  const { Ht, Hb, nose, tailX } = g;
  const span = nose - tailX;
  const spot = (x, y, rx, ry, c, a = 0) => {
    ctx.fillStyle = col(c);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, a, 0, Math.PI * 2);
    ctx.fill();
  };
  if (pal.bars) { // angelfish: dark vertical bars
    ctx.globalAlpha *= color === 'goldangel' ? 0.45 : 0.8;
    for (const f of [0.28, 0.55, 0.8]) {
      const x = tailX + span * f;
      ctx.fillStyle = col(pal.bars);
      ctx.fillRect(x - L * 0.025, -Ht * 1.3, L * 0.05, (Ht + Hb) * 1.3);
    }
  }
  if (pal.stripes) { // zebra danio: horizontal stripes
    ctx.fillStyle = col(pal.stripes);
    for (const f of [-0.45, -0.05, 0.35, 0.72]) {
      const y = f >= 0 ? Hb * f : Ht * f;
      ctx.fillRect(tailX - L * 0.05, y - L * 0.018, span + L * 0.1, L * 0.036);
    }
  }
  if (pal.stripe) { // neon tetra: red lower half + glowing blue stripe
    ctx.fillStyle = col(pal.lower);
    const from = pal.lowerFull ? nose * 0.55 : tailX + span * 0.45;
    ctx.fillRect(tailX - L * 0.05, Hb * 0.05, from - tailX + L * 0.05, Hb * 1.2);
    ctx.save();
    ctx.shadowColor = pal.stripe;
    ctx.shadowBlur = L * 0.12;
    ctx.fillStyle = col(pal.stripe);
    ctx.beginPath();
    ctx.ellipse((nose + tailX) / 2 + L * 0.03, -Ht * 0.12, span * 0.46, Math.max(L * 0.02, Ht * 0.16), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (pal.rear) { // blue-orange platy: orange back half
    const grad = ctx.createLinearGradient(nose, 0, tailX, 0);
    grad.addColorStop(0.35, 'rgba(0,0,0,0)');
    grad.addColorStop(0.65, col(pal.rear));
    ctx.fillStyle = grad;
    ctx.fillRect(tailX - L * 0.1, -Ht * 1.3, span + L * 0.2, (Ht + Hb) * 1.4);
  }
  if (pal.specks) { // dalmatian molly
    for (let i = 0; i < 16; i++) {
      spot(tailX + span * rnd(), -Ht + (Ht + Hb) * rnd(), L * (0.012 + rnd() * 0.02), L * (0.01 + rnd() * 0.016), pal.specks, rnd() * 3);
    }
  }
  if (pal.spots) {
    const n = type === 'pleco' ? 18 : type === 'puffer' ? 10 : 4;
    for (let i = 0; i < n; i++) {
      const c = pal.spots[i % pal.spots.length];
      if (type === 'puffer') {
        // Spots on the back only; the belly stays pale.
        spot(tailX + span * (0.15 + rnd() * 0.7), -Ht * (0.15 + rnd() * 0.7), L * 0.022, L * 0.022, c);
      } else if (type === 'pleco') {
        spot(tailX + span * rnd(), -Ht + (Ht + Hb * 0.8) * rnd(), L * (0.014 + rnd() * 0.012), L * (0.012 + rnd() * 0.01), c);
      } else { // calico, sarasa, marble: big irregular patches
        spot(tailX + span * (0.15 + rnd() * 0.7), -Ht * 0.8 + (Ht + Hb) * 0.8 * rnd(), L * (0.06 + rnd() * 0.06), (Ht + Hb) * (0.12 + rnd() * 0.12), c, rnd() * 3);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The whole fish
// ---------------------------------------------------------------------------
// o: { type, color, seed, L, girth, lenScale, flick, fin, t, col, alpha,
//      eye: 'normal' | 'x' | 'shock', mouthOpen, full }
export function drawFish(ctx, o) {
  const art = artOf(o.type);
  const base = paletteOf(o.color);
  // Per-fish variety: a slight lighter/darker shade, the same on every phone.
  const vary = ((o.seed % 1000) / 1000 - 0.5) * 0.16;
  const pal = { ...base, top: shade(base.top, vary), mid: shade(base.mid, vary), fin: shade(base.fin, vary * 0.7) };
  const rnd = seeded(o.seed);
  const { L, col, alpha, t } = o;
  const g = bodyGeometry(art, L, o.lenScale, o.girth);
  const finWave = Math.sin(o.fin) * L * 0.015 * (art.swim.flutter || 1);

  ctx.save();
  ctx.globalAlpha = alpha;

  // Tail
  tailPath(ctx, art.tail, g.tailX, L, o.flick, t * (art.swim.flutter || 1));
  const tg = ctx.createLinearGradient(g.tailX, 0, g.tailX - L * 0.5, 0);
  tg.addColorStop(0, col(o.type === 'guppy' ? pal.fin : pal.mid));
  tg.addColorStop(1, col(pal.fin2 || pal.fin));
  ctx.fillStyle = tg;
  ctx.globalAlpha = alpha * (art.tail === 'veil' || art.tail === 'double' ? 0.85 : 0.92);
  ctx.fill();
  if (pal.tailSpots) { // guppy tail pattern
    ctx.save();
    ctx.clip();
    ctx.fillStyle = col(pal.tailSpots);
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(g.tailX - L * (0.12 + rnd() * 0.3), (rnd() - 0.5) * L * 0.4 + o.flick, L * 0.018, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 0.8;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(g.tailX, 0);
    ctx.lineTo(g.tailX - L * 0.26, i * L * 0.07 + o.flick * 0.9);
    ctx.stroke();
  }

  // Back and belly fins
  ctx.fillStyle = col(pal.fin2 && art.dorsal === 'long' ? pal.fin2 : pal.fin);
  ctx.globalAlpha = alpha * 0.88;
  dorsalPath(ctx, art.dorsal, g, L, finWave);
  ctx.fill();
  if (art.bottom) {
    bottomFinPath(ctx, art.bottom, g, L, -finWave);
    ctx.fill();
    if (art.bottom === 'tall') { // angelfish streamers
      ctx.strokeStyle = col(pal.fin);
      ctx.lineWidth = Math.max(1, L * 0.012);
      ctx.beginPath();
      ctx.moveTo(g.nose * 0.3, g.Hb * 0.8);
      ctx.quadraticCurveTo(0, g.Hb + L * 0.3, -L * 0.05 + finWave, g.Hb + L * 0.48);
      ctx.stroke();
    }
  } else if (art.shape !== 'ball') {
    // small fin under the tail end (tucked under a very full belly)
    const fy = Math.min(g.Hb * 0.5, L * 0.12);
    ctx.beginPath();
    ctx.moveTo(g.tailX * 0.55, fy);
    ctx.quadraticCurveTo(g.tailX * 0.8, fy + L * 0.1 + finWave, g.tailX * 0.98, fy * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = alpha;

  // Body, darker on top and lighter underneath
  bodyPath(ctx, art, g);
  const bg = ctx.createLinearGradient(0, -g.Ht, 0, g.Hb);
  bg.addColorStop(0, col(pal.top));
  bg.addColorStop(0.45, col(pal.mid));
  bg.addColorStop(1, col(pal.belly));
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.save();
  ctx.clip();
  drawPattern(ctx, o.type, o.color, pal, g, L, col, rnd);
  ctx.restore();
  ctx.globalAlpha = alpha;

  // Sheen along the back
  ctx.beginPath();
  ctx.moveTo(g.nose * 0.76, -g.Ht * 0.45);
  ctx.quadraticCurveTo(g.nose * 0.1, -g.Ht * 0.9, g.tailX * 0.66, -g.Ht * 0.35);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = Math.max(1, L * 0.025);
  ctx.lineCap = 'round';
  ctx.stroke();

  // Very full: a stretched, shiny belly
  if (o.girth > 1.55) {
    const k = Math.min(1, (o.girth - 1.55) / 0.45);
    ctx.beginPath();
    ctx.ellipse(g.nose * 0.12, g.Hb * 0.55, (g.nose - g.tailX) * 0.3, g.Hb * 0.26, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.12 + 0.2 * k})`;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(g.nose * 0.3, g.Hb * 0.4, (g.nose - g.tailX) * 0.08, g.Hb * 0.07, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.3 * k})`;
    ctx.fill();
  }

  // Gill line
  if (art.shape !== 'ball') {
    ctx.beginPath();
    ctx.arc(g.nose * 0.72, 0, Math.min(g.Ht, g.Hb, L * 0.3) * 0.55, Math.PI * 0.7, Math.PI * 1.3);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = Math.max(0.8, L * 0.012);
    ctx.stroke();
  }

  // Side fin, flapping
  ctx.save();
  ctx.translate(g.nose * 0.28, Math.min(g.Hb, L * 0.3) * 0.3);
  ctx.rotate(0.5 + Math.sin(o.fin * 1.3 * (art.swim.flutter || 1)) * 0.35);
  ctx.beginPath();
  ctx.ellipse(-L * 0.06, 0, L * 0.08, L * 0.032, 0, 0, Math.PI * 2);
  ctx.fillStyle = col(pal.fin);
  ctx.globalAlpha = alpha * 0.85;
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = alpha;

  // Eye (a fixed size, whatever the fullness)
  const bigEye = o.type === 'puffer';
  const er = Math.max(2, L * (bigEye ? 0.085 : o.type === 'tetra' || o.type === 'guppy' ? 0.07 : 0.055));
  const ex = g.nose * (bigEye ? 0.45 : 0.64);
  const ey = o.type === 'pleco' ? -g.Ht * 0.45 : -Math.min(g.Ht, L * 0.3) * 0.25;
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, Math.PI * 2);
  ctx.fillStyle = '#fbfbf7';
  ctx.fill();
  if (o.eye === 'x') {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = Math.max(1, er * 0.35);
    ctx.beginPath();
    ctx.moveTo(ex - er * 0.55, ey - er * 0.55); ctx.lineTo(ex + er * 0.55, ey + er * 0.55);
    ctx.moveTo(ex + er * 0.55, ey - er * 0.55); ctx.lineTo(ex - er * 0.55, ey + er * 0.55);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(ex + er * 0.15, ey, er * (o.eye === 'shock' ? 0.35 : 0.58), 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + er * 0.3, ey - er * 0.3, er * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  // Mouth: opens wide when eating
  const mx = g.nose * 0.97;
  if (o.type === 'pleco') { // sucker mouth underneath
    ctx.beginPath();
    ctx.ellipse(g.nose * 0.85, g.Hb * 0.62, L * 0.035, L * (o.mouthOpen ? 0.03 : 0.018), 0, 0, Math.PI * 2);
    ctx.fillStyle = col('#2a1f15');
    ctx.fill();
  } else if (o.mouthOpen) {
    ctx.beginPath();
    ctx.ellipse(mx, L * 0.02, L * 0.03, L * 0.035, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#3a1410';
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(mx, L * 0.03, L * 0.025, -0.4, 0.9);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(0.8, L * 0.012);
    ctx.stroke();
  }

  // Pufferfish: a cute face (rosy cheeks)
  if (o.type === 'puffer' && o.eye !== 'x') {
    ctx.beginPath();
    ctx.ellipse(ex - er * 0.2, ey + er * 1.6, er * 0.7, er * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,120,120,0.35)';
    ctx.fill();
  }

  ctx.restore();
}
