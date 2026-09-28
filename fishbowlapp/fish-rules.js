// Pure game logic for the shared fishbowl.
// No Firebase and no DOM in here, so it runs the same in the browser and in
// Node (see tests/run.mjs). Every function takes the current time as `now`
// (milliseconds) instead of reading the clock, which keeps them testable.

// ---------------------------------------------------------------------------
// Tunable rules
// ---------------------------------------------------------------------------
export const START_FULLNESS = 50;
export const FEED_AMOUNT = 5;
export const SECONDS_PER_POINT = 864;   // -1 fullness every 14.4 minutes: 100 → 0 in 24 hours
export const MAX_FISH = 10;

export const MAX_FULLNESS = 100;        // above this a fish dies of overfeeding
export const FEED_LOG_MAX = 20;
export const TEXT_MAX = 20;             // nicknames and fish names
export const CLEANUP_AFTER_MS = 60 * 1000;
export const DEFAULT_NICKNAME = 'Someone';

const MS_PER_POINT = SECONDS_PER_POINT * 1000;

// Easy-to-read characters only: A–Z and 2–9, without I, O, 0 and 1.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export const COLORS = ['orange', 'gold', 'silver', 'red', 'calico', 'blue', 'pearl', 'lemon'];

// Original names only: no famous movie or cartoon fish.
export const FISH_NAMES = [
  'Bubbles', 'Captain', 'Sprinkles', 'Admiral', 'Pickle', 'Noodle', 'Biscuit', 'Goldie',
  'Flash', 'Pebble', 'Wiggles', 'Sir Swims-a-Lot', 'Mochi', 'Tofu', 'Waffles', 'Jellybean',
  'Pip', 'Coral', 'Olive', 'Chompers', 'Kipper', 'Shelly', 'Taco', 'Fishstick',
  'Puddle', 'Gus', 'Poppy', 'Sunny', 'Mango', 'Ziggy', 'Rocket', 'Blub',
  'Sushi', 'Nugget', 'Doodle', 'Muffin', 'Peanut', 'Button', 'Zippy', 'Splash',
  'Tater', 'Nacho', 'Pumpkin', 'Marbles', 'Twinkle', 'Scooter', 'Dumpling', 'Pretzel',
  'Bean', 'Fizz', 'Gumdrop', 'Ripple', 'Finnegan', 'Barnacle', 'Commodore', 'Professor Fin',
  'Lady Scales', 'Duke', 'Bloop', 'Captain Crunchy'
];

export class RuleError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Fullness
// ---------------------------------------------------------------------------

// Fullness right now, worked out from the last stored value and how long ago
// it was stored. Every phone does the same sum, so everyone sees the same
// number and fish starve even when no phone is open.
export function currentFullness(fish, now) {
  if (fish.diedAt != null) return fish.fullness;
  const elapsed = Math.max(0, now - fish.fullnessAt);
  return fish.fullness - Math.floor(elapsed / MS_PER_POINT);
}

// The moment a fish's fullness reaches 0 if nobody feeds it.
export function starvesAt(fish) {
  return fish.fullnessAt + Math.max(0, fish.fullness) * MS_PER_POINT;
}

// Alive = no death recorded and not yet starved by the formula.
export function isAlive(fish, now) {
  return fish.diedAt == null && currentFullness(fish, now) > 0;
}

export function livingFish(room, now) {
  return Object.entries(room.fish || {})
    .filter(([, f]) => isAlive(f, now))
    .map(([id, f]) => ({ id, ...f }));
}

// ---------------------------------------------------------------------------
// Rooms, names, colors
// ---------------------------------------------------------------------------

export function emptyRoom() {
  return { lastFedAt: null, lastFedBy: null, feedLog: [], fish: {} };
}

// `bytes` is a Uint8Array from crypto.getRandomValues. The alphabet has 32
// characters, so byte % 32 is perfectly even (256 / 32 = 8).
export function makeRoomCode(bytes) {
  if (!bytes || bytes.length < ROOM_CODE_LENGTH) throw new Error('need 6 random bytes');
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

// Fish ids use the same alphabet, lowercased.
export function makeFishId(bytes) {
  let id = '';
  for (let i = 0; i < 10; i++) id += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length].toLowerCase();
  return id;
}

// "k7q m3p" → "K7QM3P". Returns '' if it can't be a room code.
export function normalizeRoomCode(input) {
  const code = String(input || '').replace(/[\s-]+/g, '').toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : '';
}

export function isRoomCode(code) {
  return ROOM_CODE_PATTERN.test(code);
}

export function cleanNickname(input) {
  const s = String(input || '').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX).trim();
  return s || DEFAULT_NICKNAME;
}

// Names are unique among fish still in the bowl. `rand` returns [0, 1).
export function pickName(room, rand) {
  const taken = new Set(Object.values(room.fish || {}).map((f) => f.name));
  const free = FISH_NAMES.filter((n) => !taken.has(n));
  if (free.length) return free[Math.floor(rand() * free.length)];
  for (let i = 2; ; i++) {
    const n = `${FISH_NAMES[Math.floor(rand() * FISH_NAMES.length)]} ${i}`.slice(0, TEXT_MAX);
    if (!taken.has(n)) return n;
  }
}

export function pickColor(room, now, rand) {
  const used = new Set(livingFish(room, now).map((f) => f.color));
  const free = COLORS.filter((c) => !used.has(c));
  const pool = free.length ? free : COLORS;
  return pool[Math.floor(rand() * pool.length)];
}

// ---------------------------------------------------------------------------
// Changes. Each returns a NEW room object and never edits the one passed in.
// ---------------------------------------------------------------------------

function clone(room) {
  return {
    ...room,
    feedLog: [...(room.feedLog || [])],
    fish: Object.fromEntries(Object.entries(room.fish || {}).map(([id, f]) => [id, { ...f }]))
  };
}

// Add one fish. Clears out dead fish first so the bowl never holds more than
// MAX_FISH entries in total.
export function addFish(room, { id, by, now, rand = Math.random }) {
  const next = clone(room);
  for (const [fid, f] of Object.entries(next.fish)) {
    if (!isAlive(f, now)) delete next.fish[fid];
  }
  if (Object.keys(next.fish).length >= MAX_FISH) throw new RuleError('full', 'Bowl is full');
  if (next.fish[id]) throw new RuleError('duplicate', 'Fish id already used');
  const fish = {
    name: pickName(next, rand),
    color: pickColor(next, now, rand),
    addedAt: now,
    addedBy: cleanNickname(by),
    fullness: START_FULLNESS,
    fullnessAt: now,
    diedAt: null,
    cause: null
  };
  next.fish[id] = fish;
  return { room: next, fish: { id, ...fish } };
}

// Feed every living fish (fishId = null) or just one.
// Returns the new room plus which fish were fed and which died.
export function feed(room, { fishId = null, by, now }) {
  const next = clone(room);
  const nickname = cleanNickname(by);
  const targets = fishId == null ? Object.keys(next.fish) : [fishId];
  const fed = [];
  const died = [];
  let fishName = null;

  if (fishId != null) {
    const f = next.fish[fishId];
    if (!f || !isAlive(f, now)) throw new RuleError('gone', 'Too late — that fish is gone');
    fishName = f.name;
  }

  for (const id of targets) {
    const f = next.fish[id];
    if (!f || f.diedAt != null) continue;
    const cur = currentFullness(f, now);
    if (cur <= 0) {
      // Already starved; nobody had recorded it yet.
      Object.assign(f, starvedFields(f));
      died.push({ id, name: f.name, cause: 'starved' });
      continue;
    }
    f.fullness = cur + FEED_AMOUNT;
    f.fullnessAt = now;
    fed.push({ id, name: f.name });
    if (f.fullness > MAX_FULLNESS) {
      f.diedAt = now;
      f.cause = 'overfed';
      died.push({ id, name: f.name, cause: 'overfed' });
    }
  }

  if (fishId == null && fed.length === 0 && died.length === 0) {
    throw new RuleError('empty', 'There are no fish to feed');
  }

  next.lastFedAt = now;
  next.lastFedBy = nickname;
  next.feedLog = [{ by: nickname, at: now, fishId, fishName }, ...next.feedLog].slice(0, FEED_LOG_MAX);
  return { room: next, fed, died };
}

function starvedFields(f) {
  return { fullness: 0, fullnessAt: starvesAt(f), diedAt: starvesAt(f), cause: 'starved' };
}

// Housekeeping any phone may do: remove fish that died over a minute ago,
// then record fish that have starved. `changed` is false when there is
// nothing to write, so phones don't write for no reason.
export function recordDeaths(room, now) {
  const next = clone(room);
  const starved = [];
  let changed = false;
  for (const [id, f] of Object.entries(next.fish)) {
    if (f.diedAt != null && now - f.diedAt >= CLEANUP_AFTER_MS) {
      delete next.fish[id];
      changed = true;
    }
  }
  for (const [id, f] of Object.entries(next.fish)) {
    if (f.diedAt == null && currentFullness(f, now) <= 0) {
      Object.assign(f, starvedFields(f));
      starved.push({ id, name: f.name });
      changed = true;
    }
  }
  return { room: next, changed, starved };
}

// True when recordDeaths would change something.
export function needsHousekeeping(room, now) {
  return Object.values(room.fish || {}).some((f) =>
    f.diedAt != null ? now - f.diedAt >= CLEANUP_AFTER_MS : currentFullness(f, now) <= 0
  );
}

// ---------------------------------------------------------------------------
// Words for the screen
// ---------------------------------------------------------------------------

export function describeFeed(entry) {
  return entry.fishId == null ? `${entry.by} fed everyone` : `${entry.by} fed ${entry.fishName || 'a fish'}`;
}

export function deathMessage(name, cause) {
  return cause === 'overfed' ? `${name} ate too much 😢` : `${name} starved 😢`;
}

export function timeAgo(then, now) {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function activityLine(room, now) {
  const at = toMillis(room.lastFedAt);
  if (at == null) return 'Not fed yet';
  return `Last fed ${timeAgo(at, now)} by ${room.lastFedBy || DEFAULT_NICKNAME}`;
}

// Firestore timestamps arrive as objects; cached copies as {seconds, nanoseconds}.
export function toMillis(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  return null;
}
