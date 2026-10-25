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
// Barnaby used his snack 13 hours in, so nobody gets rescued until 25 hours in
// (his snack recharges for 12 hours). A new fish starves at 24 hours.
const noSnack = (room, at = T0 + 13 * HOUR) => ({ ...room, crab: { lastRescueAt: at, rescues: 1 } });

console.log('\nRules');

test('constants match the spec', () => {
  eq(R.START_FULLNESS, 50); eq(R.FEED_AMOUNT, 5); eq(R.SECONDS_PER_POINT, 1728); eq(R.MAX_FISH, 15);
});

test('a new fish starts at 50', () => {
  const { room, ids } = bowlWith(1);
  eq(R.currentFullness(fishOf(room, ids[0]), T0), 50);
});

test('fullness drops 1 point every 1728 seconds (28.8 minutes)', () => {
  const { room, ids } = bowlWith(1);
  const f = fishOf(room, ids[0]);
  eq(R.currentFullness(f, T0 + POINT - 1), 50);
  eq(R.currentFullness(f, T0 + POINT), 49);
  eq(R.currentFullness(f, T0 + 10 * POINT), 40);
});

test('a full fish starves at exactly 48 hours', () => {
  const f = { fullness: 100, fullnessAt: T0, diedAt: null };
  ok(R.isAlive(f, T0 + 48 * HOUR - 1), 'alive just before 48 h');
  eq(R.currentFullness(f, T0 + 48 * HOUR - 1), 1);
  ok(!R.isAlive(f, T0 + 48 * HOUR), 'dead at 48 h');
  eq(R.starvesAt(f), T0 + 48 * HOUR);
});

test('a new fish has 24 hours; each feed buys 2.4 hours', () => {
  const { room, ids } = bowlWith(1);
  const f = fishOf(room, ids[0]);
  ok(R.isAlive(f, T0 + 24 * HOUR - 1));
  ok(!R.isAlive(f, T0 + 24 * HOUR));
  eq(R.FEED_AMOUNT * POINT, 2.4 * HOUR);
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
  const { room: r0, ids } = bowlWith(1);
  const room = noSnack(r0);
  const later = T0 + 25 * HOUR;
  ok(R.needsHousekeeping(room, later));
  const res = R.recordDeaths(room, later);
  ok(res.changed);
  const f = fishOf(res.room, ids[0]);
  eq(f.cause, 'starved');
  eq(f.diedAt, T0 + 24 * HOUR);
  const again = R.recordDeaths(res.room, T0 + 24 * HOUR + 30 * 1000);
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
  const { room: r0, ids } = bowlWith(1);
  const room = noSnack(r0);
  throwsCode(() => R.feed(room, { fishId: ids[0], by: 'Sam', now: T0 + 25 * HOUR }), 'gone');
  throwsCode(() => R.feed(room, { fishId: 'nope', by: 'Sam', now: T0 }), 'gone');
});

test('Feed all records starved fish instead of feeding them', () => {
  let { room, ids } = bowlWith(2);
  room = noSnack(room);
  room = R.feed(room, { fishId: ids[1], by: 'Sam', now: T0 + 23 * HOUR }).room; // keeps fish 2 going
  const res = R.feed(room, { by: 'Sam', now: T0 + 24 * HOUR + MIN });
  eq(fishOf(res.room, ids[0]).cause, 'starved');
  eq(res.fed.length, 1);
});

test('the bowl holds at most 15 living fish', () => {
  const { room } = bowlWith(15);
  throwsCode(() => R.addFish(room, { id: nextId(), by: 'Sam', now: T0 }), 'full');
});

test('dead fish are cleared out when a fish is added, freeing their spot', () => {
  let { room, ids } = bowlWith(15);
  for (let i = 0; i < 11; i++) room = R.feed(room, { fishId: ids[0], by: 'Sam', now: T0 }).room;
  const res = R.addFish(room, { id: nextId(), by: 'Sam', now: T0 + 1000 });
  eq(Object.keys(res.room.fish).length, 15);
  ok(!res.room.fish[ids[0]], 'dead fish removed');
});

test('fish names are unique in the bowl', () => {
  const { room } = bowlWith(15);
  const names = Object.values(room.fish).map((f) => f.name);
  eq(new Set(names).size, 15);
  // Force the random picker to always choose the first free name.
  let r = R.emptyRoom();
  for (let i = 0; i < 15; i++) r = R.addFish(r, { id: nextId(), by: 'Sam', now: T0, rand: () => 0 }).room;
  eq(new Set(Object.values(r.fish).map((f) => f.name)).size, 15);
});

test('a name frees up once its fish is gone', () => {
  let r = R.addFish(R.emptyRoom(), { id: 'x', by: 'Sam', now: T0, rand: () => 0 }).room;
  const first = r.fish.x.name;
  for (let i = 0; i < 11; i++) r = R.feed(r, { fishId: 'x', by: 'Sam', now: T0 }).room;
  r = R.recordDeaths(r, T0 + 2 * MIN).room;
  r = R.addFish(r, { id: 'y', by: 'Sam', now: T0 + 2 * MIN, rand: () => 0 }).room;
  eq(r.fish.y.name, first);
});

test('the same fish id always gives the same new fish (phone and database agree)', () => {
  const { room } = bowlWith(4);
  const make = () => R.addFish(room, { id: 'abc123', by: 'Sam', now: T0, rand: R.seededRandom('abc123') }).fish;
  eq(JSON.stringify(make()), JSON.stringify(make()));
  const other = R.addFish(room, { id: 'zzz999', by: 'Sam', now: T0, rand: R.seededRandom('zzz999') }).fish;
  ok(other.name !== make().name || other.color !== make().color, 'different ids should usually differ');
  const r = R.seededRandom('x');
  for (let i = 0; i < 1000; i++) { const v = r(); ok(v >= 0 && v < 1, 'in range'); }
});

test('at least 200 original fish names, unique, 20 characters or fewer', () => {
  ok(R.FISH_NAMES.length >= 200, `only ${R.FISH_NAMES.length} names`);
  eq(new Set(R.FISH_NAMES).size, R.FISH_NAMES.length, 'no duplicates');
  for (const n of R.FISH_NAMES) ok(n.length > 0 && n.length <= R.TEXT_MAX, `${n} too long`);
  const famous = ['Nemo', 'Dory', 'Marlin', 'Wanda', 'Flounder', 'Cleo', 'Gill', 'Squirt', 'Coral', 'Pearl', 'Oscar', 'Crush',
    'Nigel', 'Peach', 'Jacques', 'Deb', 'Gurgle', 'Bloat', 'Sebastian', 'Ponyo', 'Lenny', 'Angie', 'Kipper'];
  for (const f of famous) ok(!R.FISH_NAMES.includes(f), `${f} is a famous character`);
});

test('12 fish types, each with at least two colors', () => {
  eq(R.FISH_TYPES.length, 12);
  eq(new Set(R.FISH_TYPES.map((t) => t.key)).size, 12, 'unique types');
  for (const t of R.FISH_TYPES) {
    ok(t.key.length <= R.TEXT_MAX && t.label.length <= R.TEXT_MAX, `${t.key} too long`);
    ok(t.colors.length >= 2, `${t.key} needs color variety`);
    for (const c of t.colors) ok(R.COLORS.includes(c) && c.length <= R.TEXT_MAX, `${c}`);
  }
});

test('every new fish gets a valid type and a color that type comes in', () => {
  let room = R.emptyRoom();
  for (let i = 0; i < 12; i++) {
    const { room: next, fish } = R.addFish(room, { id: `t${i}`, by: 'Sam', now: T0, rand: R.seededRandom(`t${i}`) });
    const type = R.FISH_TYPES.find((t) => t.key === fish.type);
    ok(type, `bad type ${fish.type}`);
    ok(type.colors.includes(fish.color), `${fish.color} isn't a ${fish.type} color`);
    room = next;
  }
  const types = new Set(Object.values(room.fish).map((f) => f.type));
  eq(types.size, 12, 'the first 12 fish get 12 different types');
});

test('feedsUntilPop: 2 at fullness 91–95, 1 at 96–100', () => {
  for (let f = 91; f <= 95; f++) eq(R.feedsUntilPop(f), 2, `at ${f}`);
  for (let f = 96; f <= 100; f++) eq(R.feedsUntilPop(f), 1, `at ${f}`);
  eq(R.feedsUntilPop(90), 3);
  eq(R.feedsUntilPop(50), 11);
  // It matches what really happens: at 96, the next feed kills.
  let room = { ...R.emptyRoom(), fish: { a: { name: 'Pickle', color: 'gold', addedAt: T0, addedBy: 'Sam', fullness: 96, fullnessAt: T0, diedAt: null, cause: null } } };
  eq(R.feed(room, { fishId: 'a', by: 'Sam', now: T0 }).died.length, 1);
  room.fish.a.fullness = 95;
  room = R.feed(room, { fishId: 'a', by: 'Sam', now: T0 }).room;
  ok(R.isAlive(room.fish.a, T0), 'survives one feed at 95');
  eq(R.feed(room, { fishId: 'a', by: 'Sam', now: T0 }).died.length, 1, 'second feed from 95 kills');
});

test('age in hours, and the party hat at exactly 12 hours', () => {
  const f = { addedAt: T0 };
  eq(R.ageHours(f, T0 + 59 * MIN), 0);
  eq(R.ageLabel(f, T0 + 59 * MIN), 'Just arrived');
  eq(R.ageLabel(f, T0 + HOUR), '1 hour old');
  eq(R.ageLabel(f, T0 + 7 * HOUR + 30 * MIN), '7 hours old');
  ok(!R.hasPartyHat(f, T0 + 12 * HOUR - 1), 'no hat just before 12 h');
  ok(R.hasPartyHat(f, T0 + 12 * HOUR), 'hat at exactly 12 h');
  ok(R.hasPartyHat(f, T0 + 40 * HOUR), 'keeps the hat');
});

test('fish saved before types existed count as goldfish', () => {
  eq(R.typeOf({ name: 'Old', color: 'blue' }), 'goldfish');
  eq(R.typeOf({ type: 'not-a-type' }), 'goldfish');
  eq(R.typeOf({ type: 'betta' }), 'betta');
  eq(R.typeLabel({}), 'goldfish');
  eq(R.typeLabel({ type: 'tetra' }), 'neon tetra');
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
  eq(all.feedLog[0].popped, undefined, 'nothing popped: no popped field');
  eq(R.historyLine(all.feedLog[0]), 'Sam fed everyone');
});

test('pops are in the feeding history, kept with the feed that caused them', () => {
  // Three fish: two stuffed to 100, one at 50.
  let { room, ids } = bowlWith(3);
  for (let i = 0; i < 10; i++) room = R.feed(room, { fishId: ids[0], by: 'Sam', now: T0 }).room;
  for (let i = 0; i < 10; i++) room = R.feed(room, { fishId: ids[1], by: 'Sam', now: T0 }).room;
  const [a, b] = [room.fish[ids[0]].name, room.fish[ids[1]].name];
  // Feeding one stuffed fish pops it.
  const one = R.feed(room, { fishId: ids[0], by: 'Priya', now: T0 + 1 }).room;
  eq(one.feedLog[0].popped, a);
  eq(R.historyLine(one.feedLog[0]), `Priya fed ${a} — 💥 it popped`);
  // Feed all pops the other stuffed fish; the 50 one survives.
  const all = R.feed(one, { by: 'Alex', now: T0 + 2 }).room;
  eq(all.feedLog[0].popped, b);
  eq(R.historyLine(all.feedLog[0]), `Alex fed everyone — 💥 ${b} popped`);
  // The live toast on other phones doesn't give it away before the fish pops.
  eq(R.describeFeed(all.feedLog[0]), 'Alex fed everyone');
  // Still reads right after the dead fish are cleared away.
  const tidy = R.recordDeaths(all, T0 + 2 * MIN).room;
  ok(!tidy.fish[ids[1]], 'cleared');
  eq(R.historyLine(tidy.feedLog[0]), `Alex fed everyone — 💥 ${b} popped`);
});

test('a feed that pops several fish names them all', () => {
  let { room, ids } = bowlWith(3);
  for (let i = 0; i < 10; i++) room = R.feed(room, { by: 'Sam', now: T0 }).room;
  const names = ids.map((id) => room.fish[id].name);
  const res = R.feed(room, { by: 'Priya', now: T0 + 1 }).room;
  eq(res.feedLog[0].popped, `${names[0]}, ${names[1]} & ${names[2]}`);
  eq(R.historyLine(res.feedLog[0]), `Priya fed everyone — 💥 ${names[0]}, ${names[1]} & ${names[2]} popped`);
  // A full bowl of 15 popping at once still fits the database's length limit.
  let big = bowlWith(15).room;
  for (let i = 0; i < 10; i++) big = R.feed(big, { by: 'Sam', now: T0 }).room;
  ok(R.feed(big, { by: 'Sam', now: T0 + 1 }).room.feedLog[0].popped.length <= R.POPPED_MAX);
});

// Blame board -------------------------------------------------------------
// Local-time dates, so these work in any time zone: 2026-09-28 is a Monday.
const MON = new Date(2026, 8, 28, 0, 0, 0).getTime();
const WED = new Date(2026, 8, 30, 15, 30).getTime();
const NEXT_MON = new Date(2026, 9, 5, 0, 0, 0).getTime();
const playerOf = (room, nick) => room.week.players.find((p) => p.nick === nick);

test('weeks start on Monday at midnight (phone time)', () => {
  eq(R.weekStart(WED), MON);
  eq(R.weekStart(MON), MON);
  eq(R.weekStart(NEXT_MON - 1), MON, 'Sunday 23:59:59');
  eq(R.weekStart(NEXT_MON), NEXT_MON);
});

test('blame board counts feeds and fish added', () => {
  let room = R.emptyRoom();
  room = R.addFish(room, { id: 'a', by: 'Sam', now: WED }).room;
  room = R.addFish(room, { id: 'b', by: 'Priya', now: WED }).room;
  room = R.addFish(room, { id: 'c', by: 'Priya', now: WED }).room;
  room = R.feed(room, { by: 'Sam', now: WED }).room;             // Feed all counts as one
  room = R.feed(room, { fishId: 'a', by: 'Sam', now: WED }).room; // Feed this fish counts as one
  room = R.feed(room, { fishId: 'b', by: 'Priya', now: WED }).room;
  eq(JSON.stringify(playerOf(room, 'Sam')), JSON.stringify({ nick: 'Sam', feeds: 2, added: 1, overfed: 0 }));
  eq(JSON.stringify(playerOf(room, 'Priya')), JSON.stringify({ nick: 'Priya', feeds: 1, added: 2, overfed: 0 }));
  eq(room.week.start, MON);
});

test('overfeed blame goes to whoever gave the fatal feed', () => {
  let room = R.addFish(R.emptyRoom(), { id: 'a', by: 'Sam', now: WED }).room;
  for (let i = 0; i < 10; i++) room = R.feed(room, { fishId: 'a', by: 'Sam', now: WED }).room;  // up to 100
  const res = R.feed(room, { fishId: 'a', by: 'Priya', now: WED });                            // the fatal bite
  eq(res.room.fish.a.blame, 'Priya');
  eq(playerOf(res.room, 'Priya').overfed, 1);
  eq(playerOf(res.room, 'Sam').overfed, 0);
  eq(R.deathMessage('Pickle', 'overfed', 'Priya'), 'Pickle ate too much 😢 — last fed by Priya');
  eq(R.deathMessage('Pickle', 'starved', null), 'Pickle starved 😢');
});

test('the Monday reset moves the winners into last week', () => {
  let room = R.addFish(R.emptyRoom(), { id: 'a', by: 'Sam', now: WED }).room;
  room = R.feed(room, { by: 'Sam', now: WED }).room;
  room = R.feed(room, { by: 'Sam', now: WED }).room;
  room = R.feed(room, { by: 'Priya', now: WED }).room;
  // Before anyone saves next week, the board already shows an empty new week.
  const board = R.blameBoard(room, NEXT_MON + 1000);
  eq(board.headChef, null, 'new week starts empty');
  eq(board.lastWeek.headChef, 'Sam');
  // The first save of the new week stores it.
  room = R.feed(room, { by: 'Priya', now: NEXT_MON + 1000 }).room;
  eq(room.week.start, NEXT_MON);
  eq(room.week.players.length, 1);
  eq(playerOf(room, 'Priya').feeds, 1);
  eq(room.lastWeek.headChef, 'Sam');
  eq(room.lastWeek.grimFeeder, null, 'nobody overfed last week');
});

test('ties are shared, and players with nothing don\'t appear', () => {
  let room = R.emptyRoom();
  room = R.addFish(room, { id: 'a', by: 'Sam', now: WED }).room;
  room = R.addFish(room, { id: 'b', by: 'Priya', now: WED }).room;
  room = R.feed(room, { by: 'Sam', now: WED }).room;
  room = R.feed(room, { by: 'Priya', now: WED }).room;
  const board = R.blameBoard(room, WED);
  eq(R.joinNames(board.headChef.names), 'Sam & Priya');
  eq(board.headChef.count, 1);
  eq(board.grimFeeder, null);
  eq(R.joinNames(['A', 'B', 'C']), 'A, B & C');
  room.week.players.push({ nick: 'Lurker', feeds: 0, added: 0, overfed: 0 });
  ok(!R.blameBoard(room, WED).table.some((p) => p.nick === 'Lurker'), 'zero-everything player hidden');
});

test('oldest fish award and the all-time oldest-fish record', () => {
  let room = R.addFish(R.emptyRoom(), { id: 'old', by: 'Sam', now: WED - 30 * HOUR, rand: () => 0 }).room;
  room.fish.old.fullness = 100; room.fish.old.fullnessAt = WED;   // keep it alive
  room = R.addFish(room, { id: 'new', by: 'Sam', now: WED, rand: () => 0.5 }).room;
  const board = R.blameBoard(room, WED + HOUR);
  eq(board.oldestFish.name, room.fish.old.name);
  eq(board.oldestFish.hours, 31);
  // It dies of overfeeding at 31 hours: that's the record.
  for (let i = 0; i < 1; i++) room = R.feed(room, { fishId: 'old', by: 'Sam', now: WED + HOUR }).room;
  eq(room.record.ageHours, 31);
  eq(room.record.cause, 'overfed');
  eq(room.record.name, room.fish.old.name);
  // A younger fish dying later doesn't replace it ('new' starves at 24 h old;
  // Barnaby's snack is used up so he can't save it).
  const hungry = noSnack(room, WED + 20 * HOUR);
  const later = R.recordDeaths(hungry, WED + 30 * HOUR).room;
  eq(later.fish.new.cause, 'starved');
  eq(later.record.ageHours, 31);
  // An older one does.
  const r2 = { ...hungry, record: { name: 'Tiny', type: 'guppy', ageHours: 2, cause: 'starved' } };
  const rec = R.recordDeaths(r2, WED + 30 * HOUR).room.record;
  eq(rec.name, room.fish.new.name); eq(rec.ageHours, 24); eq(rec.cause, 'starved');
});

test('hearts: newest first, only the last 10 kept', () => {
  let room = R.addFish(R.emptyRoom(), { id: 'a', by: 'Sam', now: T0 }).room;
  for (let i = 0; i < 13; i++) room = R.sendHeart(room, { by: `P${i}`, now: T0 + i }).room;
  eq(room.hearts.length, 10);
  eq(room.hearts[0].by, 'P12');
  const one = R.sendHeart(room, { fishId: 'a', by: 'Sam', now: T0 + 99 });
  eq(one.heart.fishName, room.fish.a.name);
  eq(R.describeHeart(one.heart), `Sam sent love to ${room.fish.a.name} ❤️`);
  eq(R.describeHeart({ by: 'Sam', fishName: null }), 'Sam sent love ❤️');
  throwsCode(() => R.sendHeart(room, { fishId: 'nope', by: 'Sam', now: T0 }), 'gone');
});

test('the week keeps at most 30 players', () => {
  let room = R.addFish(R.emptyRoom(), { id: 'a', by: 'Sam', now: WED }).room;
  for (let i = 0; i < 40; i++) {
    room.fish.a.fullness = 50; // keep the fish alive
    room = R.feed(room, { by: `Player${i}`, now: WED }).room;
  }
  ok(room.week.players.length <= R.PLAYERS_MAX, `${room.week.players.length} players`);
});

// Old Barnaby ---------------------------------------------------------------
console.log('\nOld Barnaby');

// A fish built by hand: `full` fullness at time `at`, added at `added`.
const mk = (id, name, full, at = T0, added = T0 - HOUR) => ({ id, name, type: 'goldfish', color: 'gold', addedAt: added, addedBy: 'Sam', fullness: full, fullnessAt: at, diedAt: null, cause: null });
const bowlOf = (...fish) => ({ ...R.emptyRoom(), fish: Object.fromEntries(fish.map(({ id, ...f }) => [id, f])) });
const list = (room) => Object.entries(room.fish).map(([id, f]) => ({ id, ...f }));
const hitsZero = (full, at = T0) => at + full * POINT;     // when a fish at `full` reaches 0

test('rescue constants', () => {
  eq(R.RESCUE_FULLNESS, 95); eq(R.RESCUE_COOLDOWN_HOURS, 12);
});

test('resolveBowl: the first starving fish is saved, timed at the moment it hit 0', () => {
  const room = bowlOf(mk('a', 'Noodle', 10));
  const zero = hitsZero(10);
  const res = R.resolveBowl(room, zero + 3 * HOUR);
  eq(res.events.length, 1);
  eq(res.events[0].kind, 'rescue'); eq(res.events[0].name, 'Noodle'); eq(res.events[0].at, zero);
  const f = res.room.fish.a;
  eq(f.diedAt, null); eq(f.fullness, R.RESCUE_FULLNESS); eq(f.fullnessAt, zero); eq(f.rescuedAt, zero);
  eq(R.currentFullness(f, zero + 3 * HOUR), R.RESCUE_FULLNESS - Math.floor(3 * HOUR / POINT));
  eq(res.room.crab.lastRescueAt, zero); eq(res.room.crab.rescues, 1);
  eq(res.room.feedLog[0].rescue, true); eq(res.room.feedLog[0].by, 'Barnaby'); eq(res.room.feedLog[0].fishName, 'Noodle');
  eq(R.describeFeed(res.room.feedLog[0]), '🦀 Barnaby saved Noodle');
  eq(room.fish.a.diedAt, null, 'input untouched'); eq(room.crab, undefined, 'input untouched');
});

test('resolveBowl: nothing to do before any fish hits 0', () => {
  const room = bowlOf(mk('a', 'Noodle', 10));
  const res = R.resolveBowl(room, hitsZero(10) - 1);
  eq(res.events.length, 0); eq(res.room.crab, undefined);
});

test('resolveBowl: a second fish starving within 12 hours dies', () => {
  const room = bowlOf(mk('a', 'Noodle', 10), mk('b', 'Pickle', 30));
  const res = R.resolveBowl(room, hitsZero(30) + HOUR);
  eq(res.events.map((e) => `${e.kind} ${e.name}`).join(', '), 'rescue Noodle, starved Pickle');
  eq(res.room.fish.b.cause, 'starved'); eq(res.room.fish.b.diedAt, hitsZero(30));
  eq(res.room.fish.a.diedAt, null);
});

test('resolveBowl: the snack is ready again after exactly 12 hours', () => {
  const zero = hitsZero(10);
  // Pickle hits 0 exactly 12 hours after Noodle was saved: saved too.
  const exactly = bowlOf(mk('a', 'Noodle', 10), mk('b', 'Pickle', 10, T0 + 12 * HOUR));
  const r1 = R.resolveBowl(exactly, zero + 12 * HOUR);
  const pickle = (r) => r.events.filter((e) => e.name === 'Pickle').map((e) => e.kind).join();
  eq(pickle(r1), 'rescue');
  eq(r1.room.crab.rescues, 2); eq(r1.room.crab.lastRescueAt, zero + 12 * HOUR);
  // One millisecond sooner: Pickle starves.
  const sooner = bowlOf(mk('a', 'Noodle', 10), mk('b', 'Pickle', 10, T0 + 12 * HOUR - 1));
  eq(pickle(R.resolveBowl(sooner, zero + 13 * HOUR)), 'starved');
  eq(R.snackReady({ lastRescueAt: zero }, zero + 12 * HOUR - 1), false);
  eq(R.snackReady({ lastRescueAt: zero }, zero + 12 * HOUR), true);
});

test('resolveBowl: a rescued fish is saved again once the snack has recharged', () => {
  // A saved fish lasts about 23 hours, longer than the 12-hour recharge.
  const room = bowlOf(mk('a', 'Noodle', 10));
  const zero = hitsZero(10);
  const again = zero + R.RESCUE_FULLNESS * POINT;          // about 23 hours later
  ok(again - zero >= R.RESCUE_COOLDOWN_HOURS * HOUR);
  const res = R.resolveBowl(room, again + HOUR);
  eq(res.events.map((e) => e.kind).join(), 'rescue,rescue');
  eq(res.room.fish.a.diedAt, null); eq(res.room.fish.a.rescuedAt, again); eq(res.room.crab.rescues, 2);
});

test('resolveBowl: ...but not if the snack went to another fish in the last 12 hours', () => {
  // Noodle is saved at 4.8 h; Pickle at 43.2 h; Noodle runs out again at
  // 50.4 h, while the snack is still recharging from Pickle's rescue.
  const room = bowlOf(mk('a', 'Noodle', 10), mk('b', 'Pickle', 90));
  const res = R.resolveBowl(room, T0 + 52 * HOUR);
  const story = res.events.map((e) => `${e.kind} ${e.name} @${Math.round((e.at - T0) / 60000)}m`).join(', ');
  eq(story, 'rescue Noodle @288m, rescue Pickle @2592m, starved Noodle @3024m');
  eq(res.room.fish.a.cause, 'starved');
});

test('resolveBowl: a long gap with no phones open replays rescues and deaths in order', () => {
  // Nobody opens the app for 3 days.
  const room = bowlOf(mk('a', 'Noodle', 5), mk('b', 'Pickle', 40), mk('c', 'Biscuit', 100), mk('d', 'Waffle', 60, T0 + 30 * HOUR));
  const res = R.resolveBowl(room, T0 + 72 * HOUR);
  const story = res.events.map((e) => `${e.kind} ${e.name} @${Math.round((e.at - T0) / 60000)}m`).join(', ');
  // Each point lasts 28.8 min; a saved fish (95) lasts 45.6 h; the snack
  // recharges for 12 hours after each rescue.
  // Noodle 0 at 2.4 h (saved; ready again at 14.4 h); Pickle 0 at 19.2 h (saved;
  // ready at 31.2 h); Noodle again at 48 h (saved; ready at 60 h); Biscuit 0 at
  // 48 h too (same moment, Noodle is first by id; starves); Waffle (fed at 30 h)
  // hits 0 at 58.8 h (starves); Pickle again at 64.8 h (saved).
  eq(story, 'rescue Noodle @144m, rescue Pickle @1152m, rescue Noodle @2880m, starved Biscuit @2880m, starved Waffle @3528m, rescue Pickle @3888m');
  eq(res.room.crab.rescues, 4);
  eq(res.room.feedLog.filter((e) => e.rescue).map((e) => e.fishName).join(), 'Pickle,Noodle,Pickle,Noodle', 'newest first');
});

test('resolveBowl: ties go to the fish that has been in the bowl longest', () => {
  const room = bowlOf(mk('young', 'Pickle', 10, T0, T0 - HOUR), mk('old', 'Noodle', 10, T0, T0 - 5 * HOUR));
  const res = R.resolveBowl(room, hitsZero(10) + MIN);
  eq(res.events.map((e) => `${e.kind} ${e.name}`).join(', '), 'rescue Noodle, starved Pickle');
});

test('resolveBowl: overfed fish are never rescued', () => {
  let { room, ids } = bowlWith(1);
  for (let i = 0; i < 11; i++) room = R.feed(room, { fishId: ids[0], by: 'Sam', now: T0 }).room;
  eq(room.fish[ids[0]].cause, 'overfed');
  const res = R.resolveBowl(room, T0 + 48 * HOUR);
  eq(res.events.length, 0); eq(res.room.fish[ids[0]].cause, 'overfed'); eq(res.room.crab, undefined);
});

test('bowls with no crab data start with the snack ready', () => {
  eq(R.crabOf({}).lastRescueAt, null); eq(R.crabOf({}).rescues, 0);
  ok(R.snackReady(undefined, T0)); ok(R.snackReady(null, T0));
  eq(R.snackStatus(null, T0), 'Emergency snack: ready ✅');
  eq(R.snackStatus({ lastRescueAt: T0, rescues: 1 }, T0 + 5 * HOUR), 'Snack recharging — ready in 7 hours');
  eq(R.snackStatus({ lastRescueAt: T0, rescues: 1 }, T0 + 11 * HOUR + 30 * MIN), 'Snack recharging — ready in 1 hour');
  eq(R.snackStatus({ lastRescueAt: T0, rescues: 1 }, T0 + 12 * HOUR), 'Emergency snack: ready ✅');
});

test('rescues don\'t count on the blame board; the hall of fame counts them', () => {
  const { room, ids } = bowlWith(2, MON);
  const res = R.resolveBowl(room, MON + 25 * HOUR);     // both started at 50: one saved, one starved
  eq(res.events.map((e) => e.kind).join(), 'rescue,starved');
  const b = R.blameBoard(res.room, MON + 25 * HOUR);
  eq(b.headChef, null, 'no Head Chef from a rescue');
  eq(b.table.length, 1); eq(b.table[0].nick, 'Sam'); eq(b.table[0].feeds, 0); eq(b.table[0].added, 2);
  eq(b.rescues, 1);
  eq(res.room.lastFedBy, null, 'a rescue isn\'t a feed');
  eq(ids.filter((id) => fishOf(res.room, id).rescuedAt === MON + 24 * HOUR).length, 1);
});

test('the database gets one rescue per save: recordDeaths stops before the next one', () => {
  // Same 3-day gap as above, minus Pickle and Biscuit: Noodle saved twice
  // (2.4 h and 48 h), Waffle starves at 58.8 h (snack recharging).
  let room = bowlOf(mk('a', 'Noodle', 5), mk('d', 'Waffle', 60, T0 + 30 * HOUR));
  const rescued = [], starved = [];
  for (let save = 1; ; save++) {
    const res = R.recordDeaths(room, T0 + 72 * HOUR);
    ok(res.changed);
    eq(res.rescued.length, 1, `save ${save}: one rescue`);
    eq(res.room.crab.rescues, save); eq(res.room.feedLog.length, save);
    rescued.push(...res.rescued.map((e) => e.name));
    starved.push(...res.starved.map((e) => e.name));
    room = res.room;
    if (!res.more) break;
    ok(save < 10, 'stops');
  }
  eq(rescued.join(), 'Noodle,Noodle');
  eq(starved.join(), 'Waffle');
  // Next time round there are no rescues left, just the starved fish to clear away.
  const tidy = R.recordDeaths(room, T0 + 72 * HOUR);
  eq(tidy.rescued.length, 0); eq(tidy.more, false); ok(!tidy.room.fish.d, 'starved fish cleared away');
  eq(R.recordDeaths(tidy.room, T0 + 72 * HOUR).changed, false, 'nothing left to save');
});

test('feeding settles a rescue first, then feeds', () => {
  const room = bowlOf(mk('a', 'Noodle', 10));
  const at = hitsZero(10) + 10 * MIN;
  const res = R.feed(room, { fishId: 'a', by: 'Priya', now: at });
  eq(res.room.fish.a.fullness, R.RESCUE_FULLNESS + R.FEED_AMOUNT);
  eq(res.room.feedLog.map((e) => R.describeFeed(e)).join(' / '), 'Priya fed Noodle / 🦀 Barnaby saved Noodle');
  eq(res.died.length, 0);
});

test('Barnaby never counts toward the 15-fish limit', () => {
  const { room } = bowlWith(15);
  const withCrab = { ...room, crab: { lastRescueAt: T0, rescues: 3 } };
  eq(R.livingFish(withCrab, T0).length, 15);
  throwsCode(() => R.addFish(withCrab, { id: nextId(), by: 'Sam', now: T0 }), 'full');
  const { room: fourteen } = bowlWith(14);
  ok(R.addFish({ ...fourteen, crab: { lastRescueAt: T0, rescues: 3 } }, { id: nextId(), by: 'Sam', now: T0 }).room);
});

test('crabTip: overfeeding warning beats everything except a rescue', () => {
  const fish = [
    mk('stuffed', 'Pickle', 98),
    mk('new', 'Bubbles', 50, T0, T0 - 5000),                       // just arrived
    { ...mk('gone', 'Noodle', 0, T0), diedAt: T0 - 5000, cause: 'starved' },
    mk('bday', 'Mochi', 50, T0, T0 - 12 * HOUR - 5000),             // just turned 12
    mk('hungry', 'Biscuit', 8)
  ];
  const t = R.crabTip(fish, null, T0);
  eq(t.kind, 'stop'); eq(t.fishId, 'stuffed'); eq(t.text, 'Easy now, Pickle\'s had plenty!');
  const saved = [...fish, { ...mk('lucky', 'Waffle', R.RESCUE_FULLNESS, T0 - 2000), rescuedAt: T0 - 2000 }];
  eq(R.crabTip(saved, { lastRescueAt: T0 - 2000, rescues: 1 }, T0).text, 'Not on my watch, Waffle!');
  // The rest, in order.
  eq(R.crabTips(fish, null, T0).map((x) => x.kind).join(), 'stop,welcome,farewell,birthday,hungry');
});

test('crabTip: warns at 1 and 2 feeds away', () => {
  eq(R.crabTip([mk('a', 'Pickle', 96)], null, T0).text, 'Easy now, Pickle\'s had plenty!');
  eq(R.crabTip([mk('a', 'Pickle', 100)], null, T0).kind, 'stop');
  eq(R.crabTip([mk('a', 'Pickle', 91)], null, T0).text, 'Pickle\'s getting full, go gently.');
  eq(R.crabTip([mk('a', 'Pickle', 95)], null, T0).kind, 'full');
  eq(R.crabTip([mk('a', 'Pickle', 90)], null, T0), null);
  // The fish closest to popping wins.
  eq(R.crabTip([mk('a', 'Pickle', 93), mk('b', 'Noodle', 97)], null, T0).name, 'Noodle');
});

test('crabTip: flags fish below 20, and the hungriest first', () => {
  eq(R.crabTip([mk('a', 'Noodle', 19), mk('b', 'Pickle', 60)], null, T0).text, 'Noodle\'s looking peckish.');
  eq(R.crabTip([mk('a', 'Noodle', 20), mk('b', 'Pickle', 60)], null, T0), null);
  eq(R.crabTip([mk('a', 'Noodle', 15), mk('b', 'Pickle', 6), mk('c', 'Mochi', 60)], null, T0).name, 'Pickle');
  // Everyone below 30.
  eq(R.crabTip([mk('a', 'Noodle', 25), mk('b', 'Pickle', 29)], null, T0).text, 'Someone feed these youngsters!');
  // Snack used up and a fish below 20.
  eq(R.crabTip([mk('a', 'Noodle', 12), mk('b', 'Pickle', 60)], { lastRescueAt: T0 - HOUR, rescues: 1 }, T0).text,
    'I\'ve no snack left today — someone feed Noodle!');
});

test('crabTip: says nothing urgent when all fish are fine', () => {
  eq(R.crabTip([mk('a', 'Noodle', 50), mk('b', 'Pickle', 75, T0, T0 - 3 * HOUR)], null, T0), null);
  eq(R.crabTip([], null, T0), null);
  // News is only news for 30 seconds.
  eq(R.crabTip([mk('a', 'Noodle', 50, T0, T0 - 31 * 1000)], null, T0), null);
  eq(R.crabTip([mk('a', 'Noodle', 50, T0, T0 - 29 * 1000)], null, T0).text, 'Welcome to the bowl, Noodle!');
});

test('crabTip: birthdays and farewells', () => {
  eq(R.crabTip([mk('a', 'Mochi', 50, T0, T0 - 12 * HOUR)], null, T0).text, 'Twelve hours! Well done, Mochi.');
  eq(R.crabTip([{ ...mk('a', 'Noodle', 0), diedAt: T0 - 1000, cause: 'starved' }], null, T0).text, 'Rest easy, Noodle.');
});

test('about 40 original crab sayings, all different', () => {
  ok(R.CRAB_WISDOM.length >= 40, `only ${R.CRAB_WISDOM.length}`);
  eq(new Set(R.CRAB_WISDOM).size, R.CRAB_WISDOM.length, 'duplicates');
  ok(R.CRAB_WISDOM.includes('When in doubt, go sideways.'));
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

test('index.html preloads the same Firebase version that bowl.js uses', () => {
  const version = (text) => [...new Set([...text.matchAll(/firebasejs\/([\d.]+)\//g)].map((m) => m[1]))];
  const inBowl = version(readFileSync(join(APP_DIR, 'bowl.js'), 'utf8'));
  const inHtml = version(readFileSync(join(APP_DIR, 'index.html'), 'utf8'));
  eq(inBowl.length, 1, 'one Firebase version in bowl.js');
  eq(inHtml.join(), inBowl.join(), 'index.html preload version');
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
