// Tests for fish-rules.js, plus a privacy scan of the public files.
// Run from anywhere: node fishbowlapp/tests/run.mjs  (no internet, no npm packages)

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from '../fish-rules.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(HERE, '..');
const REPO_DIR = join(APP_DIR, '..');

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
function eq(actual, expected, msg = '') {
  if (actual !== expected) throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function ok(value, msg = 'expected true') {
  if (!value) throw new Error(msg);
}
function throwsCode(fn, code) {
  try { fn(); } catch (e) { eq(e.code, code, 'error code'); return; }
  throw new Error(`expected a "${code}" error`);
}

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const POINT = R.SECONDS_PER_POINT * 1000;
let idCounter = 0;
const nextId = () => `fish${++idCounter}`;
const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function bowlWith(n, now = T0) {
  let room = R.emptyRoom();
  const ids = [];
  for (let i = 0; i < n; i++) {
    const res = R.addFish(room, { id: nextId(), by: 'Sam', now, rand: seeded(i + 1) });
    room = res.room;
    ids.push(res.fish.id);
  }
  return { room, ids };
}
const fishOf = (room, id) => room.fish[id];

console.log('\nRules');

test('constants match the spec', () => {
  eq(R.START_FULLNESS, 50); eq(R.FEED_AMOUNT, 5); eq(R.SECONDS_PER_POINT, 864); eq(R.MAX_FISH, 10);
});

test('a new fish starts at 50', () => {
  const { room, ids } = bowlWith(1);
  eq(R.currentFullness(fishOf(room, ids[0]), T0), 50);
});

test('fullness drops 1 point every 864 seconds', () => {
  const { room, ids } = bowlWith(1);
  const f = fishOf(room, ids[0]);
  eq(R.currentFullness(f, T0 + POINT - 1), 50);
  eq(R.currentFullness(f, T0 + POINT), 49);
  eq(R.currentFullness(f, T0 + 10 * POINT), 40);
});

test('a full fish starves at exactly 24 hours', () => {
  const f = { fullness: 100, fullnessAt: T0, diedAt: null };
  ok(R.isAlive(f, T0 + 24 * HOUR - 1), 'alive just before 24 h');
  eq(R.currentFullness(f, T0 + 24 * HOUR - 1), 1);
  ok(!R.isAlive(f, T0 + 24 * HOUR), 'dead at 24 h');
  eq(R.starvesAt(f), T0 + 24 * HOUR);
});

test('a new fish has 12 hours', () => {
  const { room, ids } = bowlWith(1);
  const f = fishOf(room, ids[0]);
  ok(R.isAlive(f, T0 + 12 * HOUR - 1));
  ok(!R.isAlive(f, T0 + 12 * HOUR));
});

test('each feed adds +5', () => {
  const { room, ids } = bowlWith(1);
  const { room: r2 } = R.feed(room, { by: 'Sam', now: T0 + MIN });
  eq(R.currentFullness(fishOf(r2, ids[0]), T0 + MIN), 55);
});

test('feeding uses the current (hungrier) fullness', () => {
  const { room, ids } = bowlWith(1);
  const later = T0 + 10 * POINT; // 40 by now
  const { room: r2 } = R.feed(room, { by: 'Sam', now: later });
  eq(R.currentFullness(fishOf(r2, ids[0]), later), 45);
});

test('feeding one fish leaves the others unchanged', () => {
  const { room, ids } = bowlWith(3);
  const { room: r2, fed } = R.feed(room, { fishId: ids[1], by: 'Priya', now: T0 });
  eq(fed.length, 1);
  eq(R.currentFullness(fishOf(r2, ids[0]), T0), 50);
  eq(R.currentFullness(fishOf(r2, ids[1]), T0), 55);
  eq(R.currentFullness(fishOf(r2, ids[2]), T0), 50);
});

test('feed all feeds every living fish', () => {
  const { room, ids } = bowlWith(4);
  const { room: r2, fed } = R.feed(room, { by: 'Sam', now: T0 });
  eq(fed.length, 4);
  for (const id of ids) eq(R.currentFullness(fishOf(r2, id), T0), 55);
});

test('an empty fish takes 20 feeds to be full; the 21st kills it', () => {
  // A fish at 0 has already starved, so start from the state after feed #1 (0 + 5).
  let room = { ...R.emptyRoom(), fish: { a: { name: 'Pickle', color: 'gold', addedAt: T0, addedBy: 'Sam', fullness: R.FEED_AMOUNT, fullnessAt: T0, diedAt: null, cause: null } } };
  let feeds = 1;
  while (R.currentFullness(room.fish.a, T0) < 100) {
    room = R.feed(room, { fishId: 'a', by: 'Sam', now: T0 }).room;
    feeds++;
  }
  eq(feeds, 20, 'feeds from empty to full');
  ok(R.isAlive(room.fish.a, T0), 'alive when exactly full');
  room = R.feed(room, { fishId: 'a', by: 'Sam', now: T0 }).room;
  eq(room.fish.a.cause, 'overfed', '21st feed');
});

test('a new fish (50) takes 10 feeds; the 11th kills it', () => {
  let { room, ids } = bowlWith(1);
  for (let i = 0; i < 10; i++) room = R.feed(room, { fishId: ids[0], by: 'Sam', now: T0 }).room;
  eq(R.currentFullness(fishOf(room, ids[0]), T0), 100);
  ok(R.isAlive(fishOf(room, ids[0]), T0), 'still alive at 100');
  const res = R.feed(room, { fishId: ids[0], by: 'Sam', now: T0 });
  eq(res.died.length, 1);
  eq(res.died[0].cause, 'overfed');
  eq(fishOf(res.room, ids[0]).diedAt, T0);
});

test('overfeeding with Feed all kills only the fish that go over 100', () => {
  let { room, ids } = bowlWith(2);
  for (let i = 0; i < 10; i++) room = R.feed(room, { fishId: ids[0], by: 'Sam', now: T0 }).room;
  const res = R.feed(room, { by: 'Sam', now: T0 });
  eq(res.died.map((d) => d.id).join(), ids[0]);
  ok(R.isAlive(fishOf(res.room, ids[1]), T0));
});

test('starvation is recorded by housekeeping with the real time of death', () => {
  const { room, ids } = bowlWith(1);
  const later = T0 + 13 * HOUR;
  ok(R.needsHousekeeping(room, later));
  const res = R.recordDeaths(room, later);
  ok(res.changed);
  const f = fishOf(res.room, ids[0]);
  eq(f.cause, 'starved');
  eq(f.diedAt, T0 + 12 * HOUR);
  const again = R.recordDeaths(res.room, T0 + 12 * HOUR + 30 * 1000);
  eq(again.changed, false, 'nothing new to write');
});

test('dead fish are removed about a minute after dying', () => {
  let { room, ids } = bowlWith(1);
  for (let i = 0; i < 11; i++) room = R.feed(room, { fishId: ids[0], by: 'Sam', now: T0 }).room;
  eq(R.recordDeaths(room, T0 + 30 * 1000).changed, false);
  const res = R.recordDeaths(room, T0 + R.CLEANUP_AFTER_MS);
  ok(res.changed);
  eq(Object.keys(res.room.fish).length, 0);
});

test('feeding a dead fish: "Too late — that fish is gone"', () => {
  const { room, ids } = bowlWith(1);
  throwsCode(() => R.feed(room, { fishId: ids[0], by: 'Sam', now: T0 + 13 * HOUR }), 'gone');
  throwsCode(() => R.feed(room, { fishId: 'nope', by: 'Sam', now: T0 }), 'gone');
});

test('Feed all records starved fish instead of feeding them', () => {
  let { room, ids } = bowlWith(2);
  room = R.feed(room, { fishId: ids[1], by: 'Sam', now: T0 + 11 * HOUR }).room; // keeps fish 2 going
  const res = R.feed(room, { by: 'Sam', now: T0 + 12 * HOUR + MIN });
  eq(fishOf(res.room, ids[0]).cause, 'starved');
  eq(res.fed.length, 1);
});

test('the bowl holds at most 10 living fish', () => {
  const { room } = bowlWith(10);
  throwsCode(() => R.addFish(room, { id: nextId(), by: 'Sam', now: T0 }), 'full');
});

test('dead fish are cleared out when a fish is added, freeing their spot', () => {
  let { room, ids } = bowlWith(10);
  for (let i = 0; i < 11; i++) room = R.feed(room, { fishId: ids[0], by: 'Sam', now: T0 }).room;
  const res = R.addFish(room, { id: nextId(), by: 'Sam', now: T0 + 1000 });
  eq(Object.keys(res.room.fish).length, 10);
  ok(!res.room.fish[ids[0]], 'dead fish removed');
});

test('fish names are unique in the bowl', () => {
  const { room } = bowlWith(10);
  const names = Object.values(room.fish).map((f) => f.name);
  eq(new Set(names).size, 10);
  // Force the random picker to always choose the first free name.
  let r = R.emptyRoom();
  for (let i = 0; i < 10; i++) r = R.addFish(r, { id: nextId(), by: 'Sam', now: T0, rand: () => 0 }).room;
  eq(new Set(Object.values(r.fish).map((f) => f.name)).size, 10);
});

test('a name frees up once its fish is gone', () => {
  let r = R.addFish(R.emptyRoom(), { id: 'x', by: 'Sam', now: T0, rand: () => 0 }).room;
  const first = r.fish.x.name;
  for (let i = 0; i < 11; i++) r = R.feed(r, { fishId: 'x', by: 'Sam', now: T0 }).room;
  r = R.recordDeaths(r, T0 + 2 * MIN).room;
  r = R.addFish(r, { id: 'y', by: 'Sam', now: T0 + 2 * MIN, rand: () => 0 }).room;
  eq(r.fish.y.name, first);
});

test('about 60 original fish names, all 20 characters or fewer', () => {
  ok(R.FISH_NAMES.length >= 55 && R.FISH_NAMES.length <= 65, `have ${R.FISH_NAMES.length}`);
  eq(new Set(R.FISH_NAMES).size, R.FISH_NAMES.length, 'no duplicates');
  for (const n of R.FISH_NAMES) ok(n.length <= R.TEXT_MAX, `${n} too long`);
  for (const famous of ['Nemo', 'Dory', 'Marlin', 'Wanda', 'Flounder', 'Cleo', 'Gill', 'Squirt']) {
    ok(!R.FISH_NAMES.includes(famous), `${famous} is a famous fish`);
  }
});

test('the feed log keeps only the newest 20 entries, newest first', () => {
  let { room, ids } = bowlWith(1);
  for (let i = 0; i < 25; i++) {
    room.fish[ids[0]].fullness = 50; // keep the fish alive through 25 feeds
    room = R.feed(room, { by: `P${i}`, now: T0 + i }).room;
  }
  eq(room.feedLog.length, 20);
  eq(room.feedLog[0].by, 'P24');
  eq(room.feedLog[19].by, 'P5');
});

test('feed log entries name the fish, and "everyone" for Feed all', () => {
  const { room, ids } = bowlWith(2);
  const one = R.feed(room, { fishId: ids[0], by: 'Priya', now: T0 }).room;
  const e = one.feedLog[0];
  eq(e.fishId, ids[0]);
  eq(e.fishName, room.fish[ids[0]].name);
  eq(R.describeFeed(e), `Priya fed ${room.fish[ids[0]].name}`);
  const all = R.feed(one, { by: 'Sam', now: T0 + 1 }).room;
  eq(all.feedLog[0].fishId, null);
  eq(R.describeFeed(all.feedLog[0]), 'Sam fed everyone');
  eq(all.lastFedBy, 'Sam');
});

test('changes never modify the room passed in', () => {
  const { room, ids } = bowlWith(1);
  const before = JSON.stringify(room);
  R.feed(room, { by: 'Sam', now: T0 });
  R.addFish(room, { id: nextId(), by: 'Sam', now: T0 });
  R.recordDeaths(room, T0 + 20 * HOUR);
  eq(JSON.stringify(room), before);
  ok(ids.length === 1);
});

test('room codes: 6 easy-to-read characters', () => {
  const bytes = new Uint8Array(6);
  for (let i = 0; i < 2000; i++) {
    for (let j = 0; j < 6; j++) bytes[j] = Math.floor(Math.random() * 256);
    const code = R.makeRoomCode(bytes);
    ok(R.isRoomCode(code), `bad code ${code}`);
    ok(!/[IO01]/.test(code), `confusing character in ${code}`);
  }
  eq(R.CODE_ALPHABET.length, 32);
  eq(R.makeRoomCode(new Uint8Array([0, 31, 32, 255, 8, 24])), 'A9A9J2');
});

test('room code input ignores case and spaces', () => {
  eq(R.normalizeRoomCode(' k7q m3p '), 'K7QM3P');
  eq(R.normalizeRoomCode('K7QM3'), '');
  eq(R.normalizeRoomCode('K7QM3O'), '', 'O is not allowed');
});

test('nicknames: trimmed, max 20 characters, default "Someone"', () => {
  eq(R.cleanNickname('  Sam  '), 'Sam');
  eq(R.cleanNickname(''), 'Someone');
  eq(R.cleanNickname('x'.repeat(40)).length, 20);
});

test('activity line and time ago', () => {
  eq(R.activityLine(R.emptyRoom(), T0), 'Not fed yet');
  eq(R.activityLine({ lastFedAt: T0, lastFedBy: 'Sam' }, T0 + 3 * MIN), 'Last fed 3 min ago by Sam');
  eq(R.activityLine({ lastFedAt: { seconds: T0 / 1000, nanoseconds: 0 }, lastFedBy: 'Sam' }, T0 + 2 * HOUR), 'Last fed 2 hr ago by Sam');
  eq(R.deathMessage('Noodle', 'overfed'), 'Noodle ate too much 😢');
  eq(R.deathMessage('Biscuit', 'starved'), 'Biscuit starved 😢');
});

// ---------------------------------------------------------------------------
console.log('\nPrivacy scan (everything in the repo is public)');

const KNOWN_FIREBASE_API_KEY = 'AIzaSyAHjjMm2PQjoU3rBcQXdYaWSSmykNz4Bw8';
const TEXT_EXT = new Set(['.js', '.mjs', '.html', '.css', '.json', '.webmanifest', '.md', '.yml', '.yaml', '.rules', '.py', '.txt', '']);
const SKIP_DIRS = new Set(['.git', 'node_modules', '_site']);

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name)) out.push(...listFiles(p));
    } else if (TEXT_EXT.has(extname(name).toLowerCase())) {
      out.push(p);
    }
  }
  return out;
}

const SECRET_PATTERNS = [
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['service-account key', /"private_key(_id)?"\s*:/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/g],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['API secret', /\bsk-[A-Za-z0-9_-]{20,}/]
];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

const files = listFiles(REPO_DIR);
test(`no email addresses in public files (${files.length} files)`, () => {
  const hits = [];
  for (const f of files) {
    const m = readFileSync(f, 'utf8').match(EMAIL);
    if (m) hits.push(`${relative(REPO_DIR, f)}: ${m.join(', ')}`);
  }
  ok(hits.length === 0, `found: ${hits.join('; ')}`);
});

test('no secret-looking keys (other than the public Firebase web config)', () => {
  const hits = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const [label, re] of SECRET_PATTERNS) {
      const matches = text.match(re) || [];
      for (const m of matches) {
        if (label === 'Google API key' && m === KNOWN_FIREBASE_API_KEY) continue;
        hits.push(`${relative(REPO_DIR, f)}: ${label}`);
      }
    }
  }
  ok(hits.length === 0, `found: ${hits.join('; ')}`);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
