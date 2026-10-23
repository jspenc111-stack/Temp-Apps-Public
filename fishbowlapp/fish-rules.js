// Pure game logic for the shared fishbowl.
// No Firebase and no DOM in here, so it runs the same in the browser and in
// Node (see tests/run.mjs). Every function takes the current time as `now`
// (milliseconds) instead of reading the clock, which keeps them testable.

// ---------------------------------------------------------------------------
// Tunable rules
// ---------------------------------------------------------------------------
export const START_FULLNESS = 50;
export const FEED_AMOUNT = 5;
export const SECONDS_PER_POINT = 1728;  // -1 fullness every 28.8 minutes: 100 → 0 in 48 hours ((repo) the spec's 864 = 24 hours)
export const MAX_FISH = 15;

export const MAX_FULLNESS = 100;        // above this a fish dies of overfeeding
export const FEED_LOG_MAX = 20;
export const TEXT_MAX = 20;             // nicknames and fish names
export const CLEANUP_AFTER_MS = 60 * 1000;
export const DEFAULT_NICKNAME = 'Someone';
export const PARTY_HAT_HOURS = 12;      // a fish gets a party hat at this age
export const HEARTS_MAX = 10;           // the bowl keeps only the newest hearts
export const HEART_COOLDOWN_MS = 3000;  // one heart per phone every 3 seconds
export const PLAYERS_MAX = 30;          // blame board: players tracked per week
const WEEK_MS = 7 * 24 * 3600 * 1000;

// Old Barnaby the crab: once every 12 hours he saves a fish from starving.
// (repo) The owner asked for 95 instead of the spec's 25, and for 12 hours
// instead of the spec's 24.
export const RESCUE_FULLNESS = 95;
export const RESCUE_COOLDOWN_HOURS = 12;
export const CRAB_NAME = 'Barnaby';
const RESCUE_COOLDOWN_MS = RESCUE_COOLDOWN_HOURS * 3600 * 1000;
export const TIP_RECENT_MS = 30 * 1000;  // how long an arrival, death, birthday or rescue is "news"

const MS_PER_POINT = SECONDS_PER_POINT * 1000;

// Easy-to-read characters only: A–Z and 2–9, without I, O, 0 and 1.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

// Fish types. Each new fish gets one; the colors are the looks that type
// can come in. Fish saved before types existed have no `type`: they count
// as goldfish (see typeOf).
export const FISH_TYPES = [
  { key: 'goldfish', label: 'goldfish', colors: ['orange', 'gold', 'pearl', 'calico'] },
  { key: 'fantail', label: 'fantail', colors: ['orange', 'red', 'calico', 'pearl'] },
  { key: 'comet', label: 'comet', colors: ['orange', 'red', 'sarasa'] },
  { key: 'betta', label: 'betta', colors: ['royal', 'crimson', 'violet'] },
  { key: 'guppy', label: 'guppy', colors: ['sunset', 'cobalt', 'candy'] },
  { key: 'tetra', label: 'neon tetra', colors: ['neon', 'cardinal'] },
  { key: 'angelfish', label: 'angelfish', colors: ['silver', 'marble', 'goldangel'] },
  { key: 'danio', label: 'zebra danio', colors: ['zebra', 'goldzebra'] },
  { key: 'molly', label: 'molly', colors: ['black', 'gold', 'dalmatian'] },
  { key: 'platy', label: 'platy', colors: ['red', 'lemon', 'bluefire'] },
  { key: 'puffer', label: 'pufferfish', colors: ['puffer', 'puffgold'] },
  { key: 'pleco', label: 'pleco', colors: ['pleco', 'plecogold'] }
];
export const DEFAULT_TYPE = 'goldfish';

// Every color any fish can have (older fish may use the first eight).
export const COLORS = [...new Set(['orange', 'gold', 'silver', 'red', 'calico', 'blue', 'pearl', 'lemon', ...FISH_TYPES.flatMap((t) => t.colors)])];

// Original, kind names only: no famous movie or cartoon fish, real people or brands.
export const FISH_NAMES = [
  // Food
  'Pickle', 'Noodle', 'Biscuit', 'Dumpling', 'Waffle', 'Muffin', 'Tater Tot', 'Jellybean', 'Pretzel',
  'Meatball', 'Crumpet', 'Nacho', 'Peanut', 'Mochi', 'Tofu', 'Taco', 'Nugget', 'Pumpkin', 'Gumdrop', 'Cupcake',
  'Pancake', 'Churro', 'Bagel', 'Cookie', 'Brownie', 'Sprinkles', 'Marshmallow', 'Pudding', 'Toffee',
  'Butterscotch', 'Macaroni', 'Ravioli', 'Gnocchi', 'Wonton', 'Bao', 'Kiwi', 'Mango', 'Papaya', 'Clementine',
  'Honeydew', 'Cinnamon', 'Nutmeg', 'Pistachio', 'Cashew', 'Popcorn', 'Snickerdoodle', 'Scone', 'Custard',
  'Fudge', 'Crouton', 'Pierogi', 'Falafel', 'Tamale', 'Fishstick', 'Sushi', 'Flapjack',
  // Soft and silly
  'Bubbles', 'Wiggles', 'Squiggles', 'Nibbles', 'Blip', 'Doodle', 'Pebble', 'Button', 'Marble', 'Sprout',
  'Fizz', 'Bloop', 'Blub', 'Wobble', 'Zippy', 'Puddle', 'Ripple', 'Twinkle', 'Scooter', 'Snoot', 'Boop',
  'Squish', 'Fluff', 'Glimmer', 'Sparkle', 'Flicker', 'Pip-Squeak', 'Dimple', 'Bean', 'Jiggles', 'Giggles',
  'Tumble', 'Waddle', 'Pompom', 'Snuggles', 'Zoom', 'Swish', 'Plop', 'Blorp', 'Sploosh', 'Fidget', 'Wibble',
  'Bumble', 'Doodlebug', 'Flip', 'Flop', 'Squeaky', 'Twiddle', 'Bonbon', 'Noodlebug',
  // Fancy titles
  'Sir Swims-a-Lot', 'Admiral Bubbles', 'Duchess Fins', 'Captain Wiggles', 'Lady Glimmer', 'Professor Blub',
  'Baron Von Splash', 'Admiral', 'Captain', 'Commodore', 'Duke', 'Lady Scales', 'Professor Fin',
  'Sir Bubbleton', 'Lord Flippington', 'Countess Coral', 'Madame Ripple', 'Dame Shimmer', 'Sir Noodle',
  'Lady Pebble', 'Duke of Drizzle', 'Baroness Bloop', 'Captain Crumpet', 'Admiral Pickle', 'General Guppy',
  'Major Minnow', 'Colonel Kelp', 'Sergeant Splash', 'Queen Wiggles', 'King Finley', 'Prince Puddle',
  'Princess Poppet', 'Doctor Drift', 'Judge Jellybean', 'Mayor Muffin', 'Chef Noodle', 'Sir Scalesworth',
  'Lady Lagoon', 'Viscount Vortex', 'Earl of Eddies', 'Marquis de Marble', 'Captain Flapjack',
  'Professor Pebble', 'Archduke Dimple',
  // Fishy puns
  'Finnegan', 'Gill-ian', 'Scaley', 'Bubba Gill', 'Splashley', 'Fintastic', 'Reel Deal', 'Wave-y Davey',
  'Finley', 'Gilbert', 'Gilly', 'Sole Mate', 'Cod Almighty', 'Tunacious', 'Guppy Love', 'Krill Seeker',
  'Scale-y Sue', 'Finny Penny', 'Bass-ically', 'Troutstanding', 'Carpe Diem', 'Swim Jim', 'Fin Tonic',
  'Reef Relief', 'Splish Splash', 'Finbar', 'Aqua Marina', 'Shelly Belly', 'Bubblegill', 'Fishful Thinker',
  'Wishy Fishy', 'Kelp Me', 'Wave Hello', 'Current Events', 'Tide Tickler', 'Fin-derella', 'Gillsworth',
  'Scalebert', 'Finnick', 'Nautical Nick', 'Algae Rhythm', 'Sir Fins-a-Lot', 'Fintervention', 'Fin-ominal',
  'Salty Sam', 'Guppy Gus',
  // Cozy classics
  'Goldie', 'Sunny', 'Pip', 'Ziggy', 'Coco', 'Poppy', 'Maple', 'Olive', 'Sparky', 'Dash', 'Rosie', 'Daisy',
  'Hazel', 'Clover', 'Juniper', 'Willow', 'Ruby', 'Periwinkle', 'Jasper', 'Milo', 'Otis', 'Rufus', 'Toby', 'Benny',
  'Lulu', 'Gigi', 'Penny', 'Rusty', 'Ginger', 'Pepper', 'Cricket', 'Scout', 'Buddy', 'Charlie', 'Frankie',
  'Georgie', 'Harvey', 'Iggy', 'Juno', 'Kiki', 'Lola', 'Mabel', 'Nell', 'Otto', 'Percy', 'Quinn', 'Remy',
  'Sadie', 'Theo', 'Winnie', 'Birdie', 'Honey', 'Minnie', 'Taffy', 'Marigold', 'Nibs', 'Mo', 'Gus', 'Poppet',
  'Sunny Jim'
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

// How many more feeds until this fish pops: 1 means the very next feed
// kills it (fullness 96–100), 2 means the one after that (91–95).
export function feedsUntilPop(fullness) {
  return Math.floor((MAX_FULLNESS - fullness) / FEED_AMOUNT) + 1;
}

// Age in whole hours since the fish was added.
export function ageHours(fish, now) {
  return Math.max(0, Math.floor((now - fish.addedAt) / 3600000));
}

export function hasPartyHat(fish, now) {
  return now - fish.addedAt >= PARTY_HAT_HOURS * 3600000;
}

export function ageLabel(fish, now) {
  const h = ageHours(fish, now);
  return h < 1 ? 'Just arrived' : `${h} hour${h === 1 ? '' : 's'} old`;
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

// A repeatable "random" sequence from some text (a fish id). The phone that
// adds a fish shows it straight away, and the database transaction later
// makes the same fish; using the same sequence gives both the same name.
export function seededRandom(text) {
  let seed = 0;
  for (const ch of String(text)) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function typeOf(fish) {
  const t = fish && fish.type;
  return FISH_TYPES.some((x) => x.key === t) ? t : DEFAULT_TYPE;
}

export function typeLabel(fish) {
  const key = typeOf(fish);
  return FISH_TYPES.find((x) => x.key === key).label;
}

// Prefer a type that isn't in the bowl yet, so the tank looks mixed.
export function pickType(room, now, rand) {
  const used = new Set(livingFish(room, now).map(typeOf));
  const free = FISH_TYPES.filter((t) => !used.has(t.key));
  const pool = free.length ? free : FISH_TYPES;
  return pool[Math.floor(rand() * pool.length)].key;
}

// A color that type comes in, preferring one no fish of that type has yet.
export function pickColor(room, now, rand, type = DEFAULT_TYPE) {
  const colors = FISH_TYPES.find((t) => t.key === type).colors;
  const used = new Set(livingFish(room, now).filter((f) => typeOf(f) === type).map((f) => f.color));
  const free = colors.filter((c) => !used.has(c));
  const pool = free.length ? free : colors;
  return pool[Math.floor(rand() * pool.length)];
}

// ---------------------------------------------------------------------------
// Changes. Each returns a NEW room object and never edits the one passed in.
// ---------------------------------------------------------------------------

function clone(room) {
  return {
    ...room,
    feedLog: [...(room.feedLog || [])],
    fish: Object.fromEntries(Object.entries(room.fish || {}).map(([id, f]) => [id, { ...f }])),
    ...(room.hearts ? { hearts: [...room.hearts] } : {}),
    ...(room.week ? { week: { start: room.week.start, players: (room.week.players || []).map((p) => ({ ...p })) } } : {}),
    ...(room.crab ? { crab: { ...room.crab } } : {})
  };
}

// ---------------------------------------------------------------------------
// Old Barnaby's daily rescue
// ---------------------------------------------------------------------------

// Bowls with no crab data yet start with the snack ready and 0 rescues.
export function crabOf(room) {
  const c = (room && room.crab) || {};
  return { lastRescueAt: c.lastRescueAt ?? null, rescues: c.rescues ?? 0 };
}

// When his emergency snack is (or was) ready again; null = ready already.
export function snackReadyAt(crab) {
  const c = crabOf({ crab });
  return c.lastRescueAt == null ? null : c.lastRescueAt + RESCUE_COOLDOWN_MS;
}

export function snackReady(crab, at) {
  const readyAt = snackReadyAt(crab);
  return readyAt == null || at >= readyAt;
}

export function snackStatus(crab, now) {
  if (snackReady(crab, now)) return 'Emergency snack: ready ✅';
  const h = Math.ceil((snackReadyAt(crab) - now) / 3600000);
  return `Snack recharging — ready in ${h} hour${h === 1 ? '' : 's'}`;
}

// Replay everything since the bowl was last saved, in time order: each
// moment a fish's fullness hits 0, and whether Barnaby's snack was ready
// right then. Ready → he saves it (fullness back to RESCUE_FULLNESS, timed
// at the moment it hit 0) and the snack recharges for 12 hours. Not ready →
// it starved. Every phone gets the same answer from the same saved bowl,
// even if nobody had the app open at the time.
//
// `maxRescues` stops the replay just before a further rescue (the database
// accepts one rescue per save); `more` is then true.
// Returns { room, events: [{ kind: 'rescue' | 'starved', id, name, at }], more }.
export function resolveBowl(bowl, now, { maxRescues = Infinity } = {}) {
  const next = clone(bowl);
  const events = [];
  let rescues = 0;
  for (;;) {
    let first = null;
    for (const [id, f] of Object.entries(next.fish)) {
      if (f.diedAt != null) continue;
      const at = starvesAt(f);
      if (at > now) continue;
      // Same moment: the fish that's been in the bowl longest goes first.
      if (!first || at < first.at || (at === first.at && (f.addedAt < first.f.addedAt || (f.addedAt === first.f.addedAt && id < first.id)))) {
        first = { id, f, at };
      }
    }
    if (!first) return { room: next, events, more: false };
    const { id, f, at } = first;
    const crab = crabOf(next);
    if (snackReady(crab, at)) {
      if (rescues >= maxRescues) return { room: next, events, more: true };
      rescues++;
      Object.assign(f, { fullness: RESCUE_FULLNESS, fullnessAt: at, rescuedAt: at });
      next.crab = { lastRescueAt: at, rescues: crab.rescues + 1 };
      next.feedLog = [{ by: CRAB_NAME, at, fishId: id, fishName: f.name, rescue: true }, ...next.feedLog].slice(0, FEED_LOG_MAX);
      events.push({ kind: 'rescue', id, name: f.name, at });
    } else {
      Object.assign(f, starvedFields(f));
      updateRecord(next, f);
      events.push({ kind: 'starved', id, name: f.name, at });
    }
  }
}

// ---------------------------------------------------------------------------
// Blame board: weekly counts, the Monday reset, and the oldest-fish record
// ---------------------------------------------------------------------------

// Monday 00:00 (on this phone's clock) of the week that `now` is in.
export function weekStart(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const sinceMonday = (d.getDay() + 6) % 7;   // Monday = 0 … Sunday = 6
  d.setDate(d.getDate() - sinceMonday);
  return d.getTime();
}

// Everyone with the top count of `field` (ties are shared), or null if nobody
// has any.
export function winners(players, field) {
  const best = Math.max(0, ...(players || []).map((p) => p[field] || 0));
  if (!best) return null;
  return { names: players.filter((p) => (p[field] || 0) === best).map((p) => p.nick), count: best };
}

export const joinNames = (names) => names.length <= 2 ? names.join(' & ') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;

// Make sure `next.week` is this week. If a new week has started, last week's
// Head Chef and Grim Feeder move into `lastWeek` first. (Changes `next`.)
function ensureWeek(next, now) {
  const start = weekStart(now);
  if (next.week && next.week.start === start) return;
  if (next.week && next.week.start < start && (next.week.players || []).length) {
    const chef = winners(next.week.players, 'feeds');
    const grim = winners(next.week.players, 'overfed');
    next.lastWeek = {
      headChef: chef ? joinNames(chef.names) : null,
      grimFeeder: grim ? joinNames(grim.names) : null
    };
  }
  next.week = { start, players: [] };
}

// This week's board as it should look right now (a new week may have started
// since anyone last saved).
export function currentWeek(room, now) {
  const view = { week: room.week, lastWeek: room.lastWeek ?? null };
  if (room.week) view.week = { start: room.week.start, players: room.week.players || [] };
  ensureWeek(view, now);
  return view;
}

// Add to one player's count for this week. (Changes `next`.)
function bump(next, nick, field, now) {
  ensureWeek(next, now);
  const players = next.week.players;
  let p = players.find((x) => x.nick === nick);
  if (!p) {
    if (players.length >= PLAYERS_MAX) {
      // Full: make room by dropping the least active player.
      const total = (x) => x.feeds + x.added + x.overfed;
      players.sort((a, b) => total(b) - total(a)).pop();
    }
    p = { nick, feeds: 0, added: 0, overfed: 0 };
    players.push(p);
  }
  p[field] += 1;
}

// When a fish dies, it may be the oldest fish this bowl has ever had.
function updateRecord(next, f) {
  const ageHours = Math.max(0, Math.floor((f.diedAt - f.addedAt) / 3600000));
  if (next.record && next.record.ageHours >= ageHours) return;
  next.record = { name: f.name, type: typeOf(f), ageHours, cause: f.cause };
}

// The weekly awards and the hall of fame, for the Blame board screen.
export function blameBoard(room, now) {
  const { week, lastWeek } = currentWeek(room, now);
  const players = week.players.filter((p) => p.feeds + p.added + p.overfed > 0);
  const oldest = livingFish(room, now).sort((a, b) => a.addedAt - b.addedAt)[0];
  return {
    headChef: winners(players, 'feeds'),
    grimFeeder: winners(players, 'overfed'),
    fishDealer: winners(players, 'added'),
    oldestFish: oldest ? { name: oldest.name, hours: ageHours(oldest, now) } : null,
    table: [...players].sort((a, b) => b.feeds - a.feeds || b.added - a.added || a.nick.localeCompare(b.nick)),
    record: room.record ?? null,
    lastWeek: lastWeek ?? null,
    rescues: crabOf(room).rescues
  };
}

// ---------------------------------------------------------------------------
// Hearts
// ---------------------------------------------------------------------------

// Send love to everyone, or to one fish. Keeps the newest 10 hearts.
export function sendHeart(room, { fishId = null, by, now }) {
  const next = resolveBowl(room, now).room;
  let fishName = null;
  if (fishId != null) {
    const f = next.fish[fishId];
    if (!f || !isAlive(f, now)) throw new RuleError('gone', 'Too late — that fish is gone');
    fishName = f.name;
  }
  const heart = { by: cleanNickname(by), at: now, fishId, fishName };
  next.hearts = [heart, ...(next.hearts || [])].slice(0, HEARTS_MAX);
  return { room: next, heart };
}

export function describeHeart(h) {
  return h.fishName ? `${h.by} sent love to ${h.fishName} ❤️` : `${h.by} sent love ❤️`;
}

// Add one fish. Clears out dead fish first so the bowl never holds more than
// MAX_FISH entries in total.
export function addFish(room, { id, by, now, rand = Math.random }) {
  const next = resolveBowl(room, now).room;
  for (const [fid, f] of Object.entries(next.fish)) {
    if (!isAlive(f, now)) delete next.fish[fid];
  }
  if (Object.keys(next.fish).length >= MAX_FISH) throw new RuleError('full', 'Bowl is full');
  if (next.fish[id]) throw new RuleError('duplicate', 'Fish id already used');
  const name = pickName(next, rand);
  const type = pickType(next, now, rand);
  const fish = {
    name,
    type,
    color: pickColor(next, now, rand, type),
    addedAt: now,
    addedBy: cleanNickname(by),
    fullness: START_FULLNESS,
    fullnessAt: now,
    diedAt: null,
    cause: null
  };
  next.fish[id] = fish;
  bump(next, fish.addedBy, 'added', now);
  return { room: next, fish: { id, ...fish } };
}

// Feed every living fish (fishId = null) or just one.
// Returns the new room plus which fish were fed and which died.
// Barnaby's rescues (and starvations) up to now are settled first.
export function feed(room, { fishId = null, by, now }) {
  const settled = resolveBowl(room, now);
  const next = settled.room;
  const nickname = cleanNickname(by);
  const targets = fishId == null ? Object.keys(next.fish) : [fishId];
  const fed = [];
  const died = settled.events.filter((e) => e.kind === 'starved').map((e) => ({ id: e.id, name: e.name, cause: 'starved' }));
  let fishName = null;

  if (fishId != null) {
    const f = next.fish[fishId];
    if (!f || !isAlive(f, now)) throw new RuleError('gone', 'Too late — that fish is gone');
    fishName = f.name;
  }

  for (const id of targets) {
    const f = next.fish[id];
    if (!f || f.diedAt != null) continue;
    f.fullness = currentFullness(f, now) + FEED_AMOUNT;
    f.fullnessAt = now;
    fed.push({ id, name: f.name });
    if (f.fullness > MAX_FULLNESS) {
      f.diedAt = now;
      f.cause = 'overfed';
      f.blame = nickname;           // whoever gave the fatal feed gets the blame
      updateRecord(next, f);
      bump(next, nickname, 'overfed', now);
      died.push({ id, name: f.name, cause: 'overfed', blame: nickname });
    }
  }

  if (fishId == null && fed.length === 0 && died.length === 0) {
    throw new RuleError('empty', 'There are no fish to feed');
  }

  bump(next, nickname, 'feeds', now);
  next.lastFedAt = now;
  next.lastFedBy = nickname;
  next.feedLog = [{ by: nickname, at: now, fishId, fishName }, ...next.feedLog].slice(0, FEED_LOG_MAX);
  return { room: next, fed, died };
}

function starvedFields(f) {
  return { fullness: 0, fullnessAt: starvesAt(f), diedAt: starvesAt(f), cause: 'starved' };
}

// Housekeeping any phone may do: remove fish that died over a minute ago,
// then record Barnaby's rescue (at most one per save, which is all the
// database accepts; `more` says another is waiting) and starvations.
// `changed` is false when there is nothing to write, so phones don't write
// for no reason.
export function recordDeaths(room, now) {
  const tidy = clone(room);
  let changed = false;
  for (const [id, f] of Object.entries(tidy.fish)) {
    if (f.diedAt != null && now - f.diedAt >= CLEANUP_AFTER_MS) {
      delete tidy.fish[id];
      changed = true;
    }
  }
  const settled = resolveBowl(tidy, now, { maxRescues: 1 });
  const next = settled.room;
  if (settled.events.length) changed = true;
  if (changed) ensureWeek(next, now);
  const starved = settled.events.filter((e) => e.kind === 'starved').map(({ id, name }) => ({ id, name }));
  const rescued = settled.events.filter((e) => e.kind === 'rescue').map(({ id, name, at }) => ({ id, name, at }));
  return { room: next, changed, starved, rescued, more: settled.more };
}

// True when recordDeaths would change something.
export function needsHousekeeping(room, now) {
  return Object.values(room.fish || {}).some((f) =>
    f.diedAt != null ? now - f.diedAt >= CLEANUP_AFTER_MS : currentFullness(f, now) <= 0
  );
}

// ---------------------------------------------------------------------------
// What Old Barnaby says
// ---------------------------------------------------------------------------

// Original sayings for when nothing much is going on (and his tap card).
export const CRAB_WISDOM = [
  'A full belly is good. A bursting one, less so.',
  'Swim slow, little ones. The water\'s not going anywhere.',
  'I\'ve seen many fish come and go. Feed \'em kindly.',
  'When in doubt, go sideways.',
  'Every bubble rises in its own time.',
  'A little flake goes a long way.',
  'Nobody ever regretted a gentle swim.',
  'The gravel remembers every footstep. Mostly mine.',
  'Patience, youngsters. Dinner always comes.',
  'Ask before you feed. Somebody might have beaten you to it.',
  'Kindness floats. Grumpiness sinks.',
  'An old shell is still a good shell.',
  'Even the castle was a pebble once. Probably.',
  'Take the long way round. The view\'s better.',
  'If you\'re lost, follow the bubbles up.',
  'Don\'t race the current. Make friends with it.',
  'Two flakes is a snack. Twenty is a mistake.',
  'Sideways is still a way forward.',
  'Feed the fish, not the worry.',
  'A good nap fixes most things.',
  'Every fish deserves a friend nearby.',
  'Listen to your fins. They know things.',
  'Slow and steady fills the belly.',
  'I was young once. Just as handsome, too.',
  'A tidy gravel is a happy gravel.',
  'Share the water. There\'s plenty to go round.',
  'Puffing up won\'t make you bigger. Just rounder.',
  'Good friends check the feeding history.',
  'Hurrying is for currents, not for crabs.',
  'Some days you\'re the bubble, some days the pebble.',
  'Be gentle with the new ones. We all plopped in once.',
  'A wave of the claw costs nothing.',
  'Nobody ever got lost going round in circles. That\'s the trick.',
  'Keep your spectacles clean and your heart open.',
  'Mind the glass. It\'s closer than it looks.',
  'You can\'t rush a good mustache.',
  'Rest when you\'re tired. Swim when you\'re not.',
  'The best seat in the bowl is next to a friend.',
  'Small fins, big hearts.',
  'A bowl is only as happy as its least-fed fish.'
];

// Barnaby's most important thing to say right now, or null when all is
// well (then he may share some wisdom instead). Worked out on every phone
// from the shared fish data, so every phone agrees.
// Priority: rescue > overfeeding warning > welcome or farewell > birthday > hunger.
// `fishList` is every fish in the bowl, each with its `id` (dead ones too).
export function crabTip(fishList, crab, now) {
  return crabTips(fishList, crab, now)[0] ?? null;
}

// Every tip that applies right now, most important first. The app goes down
// this list, skipping tips it said recently.
export function crabTips(fishList, crab, now) {
  const fresh = (at) => at != null && now - at >= 0 && now - at < TIP_RECENT_MS;
  const all = fishList || [];
  const living = all.filter((f) => isAlive(f, now));
  const full = (f) => currentFullness(f, now);
  const tip = (kind, f, text) => ({ kind, fishId: f ? f.id : null, name: f ? f.name : null, text });
  const tips = [];

  // 1. He just saved someone.
  for (const f of living) if (fresh(f.rescuedAt)) tips.push(tip('rescue', f, `Not on my watch, ${f.name}!`));

  // 2. About to pop: 1 feed away is a stop sign, 2 is a gentle warning.
  const stuffed = living
    .map((f) => ({ f, away: feedsUntilPop(full(f)) }))
    .filter((x) => x.away <= 2)
    .sort((a, b) => a.away - b.away || full(b.f) - full(a.f) || a.f.addedAt - b.f.addedAt);
  for (const { f, away } of stuffed) {
    tips.push(away === 1 ? tip('stop', f, `Easy now, ${f.name}'s had plenty!`) : tip('full', f, `${f.name}'s getting full, go gently.`));
  }

  // 3. Hello and goodbye, newest first.
  const news = [
    ...living.filter((f) => fresh(f.addedAt)).map((f) => ({ at: f.addedAt, t: tip('welcome', f, `Welcome to the bowl, ${f.name}!`) })),
    ...all.filter((f) => f.diedAt != null && fresh(f.diedAt)).map((f) => ({ at: f.diedAt, t: tip('farewell', f, `Rest easy, ${f.name}.`) }))
  ].sort((a, b) => b.at - a.at);
  tips.push(...news.map((x) => x.t));

  // 4. Twelve-hour birthdays.
  for (const f of living) {
    if (fresh(f.addedAt + PARTY_HAT_HOURS * 3600000)) tips.push(tip('birthday', f, `Twelve hours! Well done, ${f.name}.`));
  }

  // 5. Hungry fish, hungriest first.
  const hungry = living.filter((f) => full(f) < 20).sort((a, b) => full(a) - full(b) || a.addedAt - b.addedAt);
  if (hungry.length && !snackReady(crab, now)) {
    tips.push(tip('nosnack', hungry[0], `I've no snack left today — someone feed ${hungry[0].name}!`));
  }
  if (living.length >= 2 && living.every((f) => full(f) < 30)) tips.push(tip('allhungry', null, 'Someone feed these youngsters!'));
  if (hungry.length) tips.push(tip('hungry', hungry[0], `${hungry[0].name}'s looking peckish.`));

  return tips;
}

// ---------------------------------------------------------------------------
// Words for the screen
// ---------------------------------------------------------------------------

export function describeFeed(entry) {
  if (entry.rescue) return `🦀 ${CRAB_NAME} saved ${entry.fishName || 'a fish'}`;
  return entry.fishId == null ? `${entry.by} fed everyone` : `${entry.by} fed ${entry.fishName || 'a fish'}`;
}

export function deathMessage(name, cause, blame = null) {
  if (cause !== 'overfed') return `${name} starved 😢`;
  return blame ? `${name} ate too much 😢 — last fed by ${blame}` : `${name} ate too much 😢`;
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
