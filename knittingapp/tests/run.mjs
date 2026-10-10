// Tests for pattern.js, plus a privacy and good-neighbour scan of the app files.
// Run from anywhere: node knittingapp/tests/run.mjs  (no internet, no npm packages)

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as P from '../pattern.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(HERE, '..');
const FIXTURES = join(HERE, 'fixtures');

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} expected ${b}, got ${a}`);
}
function ok(value, msg = 'expected true') {
  if (!value) throw new Error(msg);
}

const read = (...parts) => readFileSync(join(...parts), 'utf8');
const load = (name) => JSON.parse(read(FIXTURES, name));
const GOOD = ['sunny-yoke-tee.json', 'garter-scarf.json', 'crochet-ball.json'];
const BROKEN = {
  'wrong-format.json': /not a Row Tracker pattern file/,
  'no-title.json': /no title/,
  'missing-size.json': /Step 1 in Pattern: the text is missing size M/,
  'unknown-step-type.json': /Step 2 in Pattern has a type the app doesn't know/,
  'measure-no-length.json': /Step 2 in Pattern is a measure step with no length/,
};
const tee = load('sunny-yoke-tee.json');
const scarf = load('garter-scarf.json');
const ball = load('crochet-ball.json');
const clone = (v) => JSON.parse(JSON.stringify(v));

// A small JSON Schema checker: just the parts pattern.schema.json uses.
function schemaErrors(schema, data) {
  const root = schema;
  const deref = (s) => (s && s.$ref ? s.$ref.slice(2).split('/').reduce((o, k) => o[k], root) : s);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const typeOk = (t, v) => ({
    object: v !== null && typeof v === 'object' && !Array.isArray(v), array: Array.isArray(v), string: typeof v === 'string',
    number: typeof v === 'number', integer: Number.isInteger(v), boolean: typeof v === 'boolean',
  })[t];
  function check(s, v, path) {
    if (s === false) return [`${path}: not allowed`];
    if (s === true) return [];
    s = { ...s, ...(s.$ref ? deref(s) : {}) };
    const errs = [];
    if (s.type && !typeOk(s.type, v)) return [`${path}: should be ${s.type}`];
    if ('const' in s && !same(s.const, v)) errs.push(`${path}: should be ${JSON.stringify(s.const)}`);
    if (s.enum && !s.enum.some((x) => same(x, v))) errs.push(`${path}: not one of the allowed values`);
    if (typeof v === 'string') {
      if (s.minLength !== undefined && v.length < s.minLength) errs.push(`${path}: too short`);
      if (s.maxLength !== undefined && v.length > s.maxLength) errs.push(`${path}: too long`);
      if (s.pattern && !new RegExp(s.pattern).test(v)) errs.push(`${path}: wrong pattern`);
    }
    if (typeof v === 'number') {
      if (s.minimum !== undefined && v < s.minimum) errs.push(`${path}: too small`);
      if (s.maximum !== undefined && v > s.maximum) errs.push(`${path}: too big`);
      if (s.exclusiveMinimum !== undefined && v <= s.exclusiveMinimum) errs.push(`${path}: too small`);
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) errs.push(`${path}: too few items`);
      if (s.maxItems !== undefined && v.length > s.maxItems) errs.push(`${path}: too many items`);
      if (s.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) errs.push(`${path}: repeated items`);
      if (s.items) v.forEach((x, i) => errs.push(...check(s.items, x, `${path}[${i}]`)));
    }
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const k of s.required || []) if (!(k in v)) errs.push(`${path}: missing ${k}`);
      if (s.minProperties !== undefined && Object.keys(v).length < s.minProperties) errs.push(`${path}: too few entries`);
      for (const [k, x] of Object.entries(v)) {
        if (s.properties && k in s.properties) errs.push(...check(s.properties[k], x, `${path}.${k}`));
        else if (s.additionalProperties === false) errs.push(`${path}: unknown part ${k}`);
        else if (s.additionalProperties && typeof s.additionalProperties === 'object') errs.push(...check(s.additionalProperties, x, `${path}.${k}`));
      }
    }
    if (s.anyOf && !s.anyOf.some((sub) => check(sub, v, path).length === 0)) errs.push(`${path}: matches none of the allowed shapes`);
    for (const sub of s.allOf || []) errs.push(...check(sub, v, path));
    if (s.if) {
      const branch = check(s.if, v, path).length === 0 ? s.then : s.else;
      if (branch !== undefined) errs.push(...check(branch, v, path));
    }
    return errs;
  }
  return check(schema, data, 'pattern');
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
const rel = (file) => relative(APP_DIR, file).split(sep).join('/');

// Tap "done" (or "reached it" on measure steps) until the entry index is reached.
function goTo(res, index) {
  let p = P.startProgress();
  let guard = 0;
  while (p.index < index && !p.finished && guard++ < 100000) {
    p = res.entries[p.index].type === 'measure' ? P.reachedIt(res, p) : P.rowDone(res, p);
  }
  return p;
}

// ---------------------------------------------------------------------------
console.log('\nFixtures and validate()');

await test('accepts the three good fixtures', () => {
  for (const name of GOOD) {
    const result = P.validate(load(name));
    eq(result, { ok: true, problems: [] }, name);
  }
});

await test('rejects each broken fixture with a plain-English reason', () => {
  for (const [name, reason] of Object.entries(BROKEN)) {
    const result = P.validate(load(join('broken', name)));
    eq(result.ok, false, name);
    ok(result.problems.length >= 1 && result.problems.some((p) => reason.test(p)), `${name}: got ${JSON.stringify(result.problems)}`);
  }
});

await test('every broken fixture has a test, and every fixture is a known invented one', () => {
  eq(readdirSync(join(FIXTURES, 'broken')).sort(), Object.keys(BROKEN).sort(), 'broken fixtures');
  // If this fails because you added a fixture: add it to the lists above, and only if it is invented.
  eq(readdirSync(FIXTURES).filter((f) => f.endsWith('.json')).sort(), [...GOOD].sort(), 'fixtures');
});

await test('refuses a file over 2 MB with a friendly message', () => {
  const big = clone(scarf);
  big.info.notes = Array.from({ length: 150 }, (_, i) => `Note ${i}: ${'knit '.repeat(3000)}`);
  const text = JSON.stringify(big);
  ok(P.byteLength(text) > P.MAX_FILE_BYTES, 'test file should be over 2 MB');
  const result = P.readPatternText(text);
  eq(result.ok, false);
  ok(/too big/.test(result.message) && /2 MB/.test(result.message), result.message);
  // The size the phone reports for the file counts too, before the text is even looked at.
  eq(P.readPatternText(JSON.stringify(scarf), { size: P.MAX_FILE_BYTES + 1 }).ok, false);
  eq(P.readPatternText(JSON.stringify(scarf), { size: 5000 }).ok, true);
});

await test('a PDF gets the "convert it in Claude first" message', () => {
  for (const file of [{ name: 'My Pattern.PDF' }, { type: 'application/pdf' }, {}]) {
    const result = P.readPatternText('%PDF-1.7 not really a pdf', file);
    eq(result.ok, false);
    eq(result.message, 'This is a PDF. Convert it with the Pattern Converter in Claude first, then open the file it gives you.');
  }
});

await test('text that is not a pattern file is refused, not crashed on', () => {
  for (const text of ['', '   ', 'hello', '{"format":', '[]', 'null', '42', '"row-tracker-pattern"']) {
    const result = P.readPatternText(text);
    eq(result.ok, false, JSON.stringify(text));
    ok(result.problems.length >= 1, 'has a reason');
  }
  eq(P.readPatternText(JSON.stringify(tee)).ok, true);
  eq(P.readPatternText('﻿' + JSON.stringify(tee)).ok, true, 'a file with a byte-order mark');
});

await test('names the step and section in each problem', () => {
  const bad = clone(tee);
  delete bad.sections[0].steps[3].text;
  const result = P.validate(bad);
  eq(result.problems, ['Step 4 in Yoke has no text']);
});

await test('catches the other ways a file can be wrong', () => {
  const cases = [
    [(p) => { p.version = 2; }, /newer Row Tracker/],
    [(p) => { p.craft = 'weave'; }, /craft/],
    [(p) => { p.units = 'm'; }, /units/],
    [(p) => { p.sizes = ['S', 'S']; }, /sizes/],
    [(p) => { p.sections = []; }, /no sections/],
    [(p) => { p.sections[1].id = 'yoke'; }, /share the id "yoke"/],
    [(p) => { p.sections[0].steps = []; }, /Yoke has no steps/],
    [(p) => { p.sections[0].worked = 'sideways'; }, /worked/],
    [(p) => { p.sections[2].repeat = 0; }, /repeat/],
    [(p) => { p.sections[2].repeat = 1e9; }, /repeat/],
    [(p) => { p.sections[0].steps[1].count = 0; }, /Step 2 in Yoke: the count is not right/],
    [(p) => { p.sections[0].steps[1].count = 1e9; }, /count/],
    [(p) => { p.sections[0].steps[1].count = 2.5; }, /count/],
    [(p) => { p.sections[0].steps[0].stitchesAfter = { S: 96, M: 104 }; }, /the stitch count is missing size L/],
    [(p) => { p.sections[0].steps[0].stitchesAfter = { S: 96, M: 104, L: 112, XL: 120 }; }, /a size the pattern doesn't list/],
    [(p) => { p.sections[0].steps[0].stitchesAfter = -4; }, /stitch count/],
    [(p) => { p.sections[0].steps[1].side = 'LS'; }, /side/],
    [(p) => { p.sections[0].steps[1].length = 5; }, /"length" only belongs on a measure step/],
    [(p) => { p.sections[1].steps[0].length = 0; }, /length/],
    [(p) => { p.sections[1].steps[0].count = 3; }, /"count" only belongs on a row step/],
    [(p) => { p.sections[0].steps[1].checklist = ['One']; }, /"checklist" only belongs on an action step/],
    [(p) => { p.sections[3].steps[0].checklist = []; }, /checklist/],
    [(p) => { p.sections[3].steps[0].checklist = ['Fine', 7]; }, /checklist item 2/],
    [(p) => { p.sections[0].steps[11].sizes = ['M', 'XXL']; }, /a size the pattern doesn't list/],
    [(p) => { p.sections[0].steps[3].group.pass = 4; }, /more passes than there are/],
    [(p) => { delete p.sections[0].steps[3].group.of; }, /how many passes/],
    [(p) => { p.sections[0].steps[3].group.of = { S: 2, M: 3 }; }, /the number of passes is missing size L/],
    [(p) => { p.sections[0].steps[0].page = 'two'; }, /page/],
    [(p) => { p.sections[0].steps[0].flag = ''; }, /flag/],
    [(p) => { p.sections[0].steps[0].needle = 3; }, /needle/],
    [(p) => { p.sections[0].steps[0].nickname = 'x'; }, /Step 1 in Yoke has a part the app doesn't know: "nickname"/],
    [(p) => { p.owner = 'someone'; }, /The pattern has a part the app doesn't know: "owner"/],
    [(p) => { p.info.gauge.rows = 0; }, /gauge/],
    [(p) => { p.info.materials = 'wool'; }, /materials/],
    [(p) => { p.reviewNotes = [1, 2]; }, /review notes/],
    [(p) => { p.title = '   '; }, /no title/],
    [(p) => { p.sections[0].steps[0].text = { S: 'a', M: 'b', L: '' }; }, /the text for size L is not right/],
    [(p) => { for (const s of p.sections) for (const t of s.steps) t.sizes = ['M', 'L']; }, /Size S has no steps/],
  ];
  cases.forEach(([breakIt, reason], i) => {
    const bad = clone(tee);
    breakIt(bad);
    const result = P.validate(bad);
    ok(!result.ok && result.problems.some((p) => reason.test(p)), `case ${i + 1} (${reason}): got ${JSON.stringify(result.problems)}`);
  });
  const oneSize = clone(scarf);
  oneSize.sections[0].steps[0].text = { S: 'Cast on.' };
  ok(P.validate(oneSize).problems.some((p) => /lists no sizes/.test(p)), 'per-size value without sizes');
  const tooLong = clone(scarf);
  tooLong.sections[0].repeat = 20;
  tooLong.sections[0].steps = Array.from({ length: 1500 }, () => ({ type: 'row', text: 'Knit.' }));
  ok(P.validate(tooLong).problems.some((p) => /too long/.test(p)), 'too many steps in total');
});

await test('strange inputs never throw', () => {
  for (const data of [null, undefined, 0, 'x', [], {}, { format: P.FORMAT }, { format: P.FORMAT, version: 1 },
    { format: P.FORMAT, version: 1, title: 'T', sections: [null] },
    { format: P.FORMAT, version: 1, title: 'T', sections: [{ id: 'a', name: 'A', steps: [null, 3, 'x', []] }] },
    { format: P.FORMAT, version: 1, title: 'T', sizes: ['__proto__'], sections: [{ id: 'a', name: 'A', steps: [{ type: 'row', text: {} }] }] },
  ]) {
    eq(P.validate(data).ok, false, JSON.stringify(data));
  }
});

await test('the schema file agrees with validate()', () => {
  const schema = JSON.parse(read(APP_DIR, 'converter', 'pattern.schema.json'));
  for (const name of GOOD) eq(schemaErrors(schema, load(name)), [], name);
  // "missing-size" is the one rule a schema can't express; validate() checks it on its own.
  for (const name of Object.keys(BROKEN).filter((n) => n !== 'missing-size.json')) {
    ok(schemaErrors(schema, load(join('broken', name))).length > 0, `${name} should fail the schema`);
  }
  const breaks = [
    (p) => { p.sections[0].steps[1].count = 0; }, (p) => { p.sections[1].steps[0].count = 3; },
    (p) => { p.sections[0].steps[1].length = 5; }, (p) => { p.sections[0].steps[1].checklist = ['One']; },
    (p) => { p.sections[0].steps[1].side = 'LS'; }, (p) => { p.sections[2].repeat = 0; },
    (p) => { p.sections[0].steps[0].nickname = 'x'; }, (p) => { p.owner = 'someone'; },
    (p) => { p.info.gauge.rows = 0; }, (p) => { p.sizes = ['S', 'S']; }, (p) => { p.version = 2; },
    (p) => { delete p.sections[0].steps[3].group.of; }, (p) => { p.sections[3].steps[0].checklist = []; },
    (p) => { p.title = '   '; }, (p) => { p.sections = []; }, (p) => { p.sections[0].steps[0].stitchesAfter = -4; },
  ];
  breaks.forEach((breakIt, i) => {
    const bad = clone(tee);
    breakIt(bad);
    ok(schemaErrors(schema, bad).length > 0, `schema should reject case ${i + 1}`);
    ok(!P.validate(bad).ok, `validate() should reject case ${i + 1}`);
  });
});

await test('the converter skill is in place and matches the spec', () => {
  const skill = read(APP_DIR, 'converter', 'SKILL.md');
  ok(skill.startsWith('---\nname: pattern-converter\n'), 'SKILL.md starts with its name');
  ok(read(APP_DIR, 'SPEC.md').includes(skill.trim()), 'SKILL.md is the text in SPEC.md');
  ok(read(APP_DIR, 'SPEC.md').includes(read(APP_DIR, 'CLAUDE.md').trim()), 'CLAUDE.md is the text in SPEC.md');
  eq(tee, JSON.parse(read(APP_DIR, 'SPEC.md').split('```json\n')[1].split('\n```')[0]), 'the tee fixture is the example in SPEC.md');
});

// ---------------------------------------------------------------------------
console.log('\nresolve()');

const yokeRound2 = (res) => res.entries.filter((e) => res.sections[e.section].id === 'yoke' && e.label === 'Round 2');
const firstRowOf = (res, name) => res.entries.find((e) => res.sections[e.section].displayName === name && e.type !== 'action');

await test('Sunny Yoke Tee: S has 2 yoke passes, M and L have 3', () => {
  eq(yokeRound2(P.resolve(tee, 'S')).map((e) => e.group.pass), [1, 2]);
  eq(yokeRound2(P.resolve(tee, 'M')).map((e) => e.group.pass), [1, 2, 3]);
  eq(yokeRound2(P.resolve(tee, 'L')).map((e) => e.group.pass), [1, 2, 3]);
  eq(yokeRound2(P.resolve(tee, 'S')).map((e) => e.group.of), [2, 2]);
  eq(yokeRound2(P.resolve(tee, 'M')).map((e) => e.group.of), [3, 3, 3]);
});

await test('Sunny Yoke Tee: Round 2 stitch counts for each size', () => {
  eq(yokeRound2(P.resolve(tee, 'S')).map((e) => e.stitchesAfter), [108, 126]);
  eq(yokeRound2(P.resolve(tee, 'M')).map((e) => e.stitchesAfter), [117, 136, 158]);
  eq(yokeRound2(P.resolve(tee, 'L')).map((e) => e.stitchesAfter), [126, 144, 162]);
  eq(yokeRound2(P.resolve(tee, 'S')).map((e) => e.stitchesBefore), [96, 108], 'each row starts with the count before it');
});

await test('Sunny Yoke Tee: text shows only the chosen size', () => {
  eq(P.resolve(tee, 'S').entries[0].text, 'Cast on 96 sts with the 3 mm needle and join in the round.');
  eq(P.resolve(tee, 'L').entries[0].text, 'Cast on 112 sts with the 3 mm needle and join in the round.');
  eq(yokeRound2(P.resolve(tee, 'M'))[1].text, 'K3, *M1, k6*; repeat from * to end.');
  const divide = P.resolve(tee, 'M').entries.find((e) => e.label === 'Divide for body and sleeves');
  eq(divide.checklist[0], 'Put the first 35 sts on a holder (first sleeve)');
  eq(divide.checklist.length, 6);
  for (const size of tee.sizes) {
    for (const e of P.resolve(tee, size).entries) {
      ok(typeof e.text === 'string', `text is plain for size ${size}`);
      ok((e.checklist || []).every((c) => typeof c === 'string'), 'checklist is plain');
    }
  }
});

await test('Sunny Yoke Tee: the body starts at 80, 96 or 100 sts', () => {
  eq(['S', 'M', 'L'].map((s) => firstRowOf(P.resolve(tee, s), 'Body').stitchesBefore), [80, 96, 100]);
});

await test('Sunny Yoke Tee: both sleeves start at 31, 39 or 39 sts', () => {
  for (const [size, sts] of [['S', 31], ['M', 39], ['L', 39]]) {
    const res = P.resolve(tee, size);
    eq(res.sections.map((s) => s.displayName), ['Yoke', 'Body', 'Sleeve (1 of 2)', 'Sleeve (2 of 2)', 'Finishing']);
    for (const name of ['Sleeve (1 of 2)', 'Sleeve (2 of 2)']) {
      const sec = res.sections.find((s) => s.displayName === name);
      eq(res.entries[sec.first].stitchesAfter, sts, `${name} pick-up, size ${size}`);
      eq(firstRowOf(res, name).stitchesBefore, sts, `${name} first round, size ${size}`);
    }
  }
});

await test('Sunny Yoke Tee: "Rounds 3–5" becomes 3 entries', () => {
  const res = P.resolve(tee, 'S');
  const rounds = res.entries.filter((e) => e.label === 'Rounds 3–5' && e.group && e.group.pass === 1);
  eq(rounds.map((e) => [e.part, e.of]), [[1, 3], [2, 3], [3, 3]]);
  eq(res.entries.filter((e) => e.label === 'Rib').length, 6);
});

await test('Sunny Yoke Tee: the body rib carries the 3 mm needle', () => {
  const res = P.resolve(tee, 'M');
  const body = res.sections.find((s) => s.id === 'body');
  const [knit, change, rib] = res.entries.slice(body.first, body.first + 3);
  eq(knit.needle, '4 mm');
  eq(change.needleChange, '3 mm');
  eq(rib.type, 'measure');
  eq(rib.needle, '3 mm');
  eq(rib.needleChange, null);
  eq(res.entries[0].needle, '3 mm');
});

await test('Sunny Yoke Tee: rows are numbered within each section copy', () => {
  const res = P.resolve(tee, 'S');
  const yoke = res.sections[0];
  eq(res.entries.slice(yoke.first, yoke.last + 1).filter((e) => e.type === 'row').map((e) => e.rowNumber), Array.from({ length: 18 }, (_, i) => i + 1));
  for (const name of ['Sleeve (1 of 2)', 'Sleeve (2 of 2)']) {
    const sec = res.sections.find((s) => s.displayName === name);
    eq(res.entries.slice(sec.first, sec.last + 1).map((e) => e.rowNumber), [null, 1, 2, 3, null, null, null], name);
  }
  eq(res.entries.map((e) => e.index), res.entries.map((_, i) => i));
});

await test('Sunny Yoke Tee: totals for the "Check it" summary', () => {
  eq(P.resolve(tee, 'S').totals, { baseSections: 4, rows: 24, measures: 4, plannedRows: 24 + 66 + 12 + 6 + 6 });
  eq(P.resolve(tee, 'M').totals.rows, 30);
  eq(P.flagsFor(tee, P.resolve(tee, 'S')), [{ where: null, text: 'Round 2 of pass 2 for size M starts with K3; double-check against the PDF.' }]);
  const flagged = clone(tee);
  flagged.sections[2].steps[1].flag = 'Check this against the PDF';
  eq(P.flagsFor(flagged, P.resolve(flagged, 'S'))[1], { where: 'Sleeve, Rounds 1–3', text: 'Check this against the PDF' }, 'a flag in a repeated section is listed once');
  eq(P.flagsFor(flagged, P.resolve(flagged, 'S')).length, 2);
});

await test('a size must be picked when there is more than one', () => {
  let threw = false;
  try { P.resolve(tee, 'XL'); } catch (e) { threw = true; }
  ok(threw, 'unknown size is refused');
});

await test('Garter Scarf: flat, one size, RS/WS and count', () => {
  const res = P.resolve(scarf, null);
  eq(res.size, null);
  eq(res.sections.map((s) => [s.displayName, s.worked, s.rows]), [['Scarf', 'flat', 11], ['Finishing', 'flat', 0]]);
  eq(res.entries.slice(1, 4).map((e) => e.side), ['RS', 'WS', null]);
  eq(res.entries.filter((e) => e.label === 'Rows 3–10').length, 8);
  const measure = res.entries.find((e) => e.type === 'measure');
  eq([measure.length, measure.estimate, measure.stitchesBefore, measure.units], [150, 420, 28, 'cm']);
  eq(res.entries[res.entries.length - 1].checklist, ['Weave in both ends', 'Wash and dry flat']);
});

await test('Crochet Ball: crochet rounds with a stitch count on every round', () => {
  ok(ball.sections[0].steps.filter((s) => s.type === 'row').every((s) => typeof s.stitchesAfter === 'number'), 'fixture has a count on every round');
  const res = P.resolve(ball);
  eq(res.craft, 'crochet');
  const rows = res.entries.filter((e) => e.type === 'row');
  eq(rows.map((e) => e.stitchesAfter), [6, 12, 18, 24, 24, 24, 24, 24, 18, 12, 6]);
  eq(rows.map((e) => e.stitchesBefore), [null, 6, 12, 18, 24, 24, 24, 24, 24, 18, 12]);
  eq(rows[0].needle, '3.5 mm');
});

await test('a run of rows that changes the stitch count is only certain at its end', () => {
  const p = clone(scarf);
  p.sections[0].steps[3] = { type: 'row', label: 'Rows 3–6', text: 'K1, m1, knit to end.', count: 4, stitchesAfter: 32 };
  const rows = P.resolve(p).entries.filter((e) => e.label === 'Rows 3–6');
  eq(rows.map((e) => e.stitchesBefore), [28, null, null, null]);
  eq(rows.map((e) => e.stitchesAfter), [null, null, null, 32]);
});

// ---------------------------------------------------------------------------
console.log('\nestimateRows()');

await test('22 cm → 66, 4 cm → 12, 2 cm → 6 at 30 rows per 10 cm', () => {
  const gauge = tee.info.gauge;
  eq([22, 4, 2].map((cm) => P.estimateRows(cm, gauge)), [66, 12, 6]);
  const res = P.resolve(tee, 'S');
  eq(res.entries.filter((e) => e.type === 'measure').map((e) => e.estimate), [66, 12, 6, 6]);
});

await test('rounds to a whole number, and gives nothing without a gauge', () => {
  eq(P.estimateRows(5, { rows: 31, over: 10 }), 16);
  eq(P.estimateRows(1, { rows: 30, over: 4 }), 8);
  eq(P.estimateRows(22, null), null);
  eq(P.estimateRows(22, { stitches: 22 }), null);
  eq(P.estimateRows(0, tee.info.gauge), null);
  eq(P.resolve(ball).entries.every((e) => e.estimate === null), true);
});

// ---------------------------------------------------------------------------
console.log('\nMovement');

await test('Row done moves on one entry at a time and clears the stitch counter', () => {
  const res = P.resolve(tee, 'S');
  let p = P.startProgress();
  eq([p.index, p.finished, p.stitch], [0, false, 0]);
  p = P.rowDone(res, p);            // cast on done
  p = P.addStitch(res, p, 1); p = P.addStitch(res, p, 1); p = P.addStitch(res, p, -1);
  eq(p.stitch, 1);
  eq(P.addStitch(res, P.startProgress(), 1).stitch, 0, 'no stitch counter on an action step');
  eq(P.addStitch(res, p, -5).stitch, 0, 'never below zero');
  p = P.rowDone(res, p);
  eq([p.index, p.stitch], [2, 0]);
});

await test('Back goes to the previous entry and stops at the start', () => {
  const res = P.resolve(tee, 'S');
  let p = P.startProgress();
  eq(P.canGoBack(res, p), false);
  eq(P.back(res, p).index, 0);
  p = P.rowDone(res, P.rowDone(res, p));
  eq(P.canGoBack(res, p), true);
  p = P.back(res, p);
  eq(p.index, 1);
});

await test('measure steps: Round done counts and stays, Reached it moves on', () => {
  const res = P.resolve(tee, 'S');
  const body = res.sections.find((s) => s.id === 'body');
  let p = goTo(res, body.first);
  eq(res.entries[p.index].type, 'measure');
  for (let i = 0; i < 18; i++) p = P.rowDone(res, p);
  eq([p.index, P.measureCount(res, p)], [body.first, 18]);
  p = P.addStitch(res, p, 1);
  p = P.reachedIt(res, p);
  eq([p.index, p.stitch], [body.first + 1, 0]);
  eq(P.reachedIt(res, p).index, body.first + 1, 'Reached it does nothing on other steps');
});

await test('Back on a measure step takes a round off first, then leaves', () => {
  const res = P.resolve(tee, 'S');
  const body = res.sections.find((s) => s.id === 'body');
  let p = goTo(res, body.first);
  p = P.rowDone(res, P.rowDone(res, p));
  p = P.back(res, p);
  eq([p.index, P.measureCount(res, p)], [body.first, 1]);
  p = P.back(res, p);
  eq([p.index, P.measureCount(res, p)], [body.first, 0]);
  p = P.back(res, p);
  eq(p.index, body.first - 1);
});

await test('Back into a measure step keeps the rounds it already had', () => {
  const res = P.resolve(tee, 'S');
  const body = res.sections.find((s) => s.id === 'body');
  let p = goTo(res, body.first);
  for (let i = 0; i < 5; i++) p = P.rowDone(res, p);
  p = P.reachedIt(res, p);
  p = P.back(res, p);
  eq([p.index, P.measureCount(res, p)], [body.first, 5]);
});

await test('checklist ticks are kept, and Step done works with boxes unticked', () => {
  const res = P.resolve(tee, 'S');
  const divide = res.entries.find((e) => e.label === 'Divide for body and sleeves');
  let p = goTo(res, divide.index);
  p = P.toggleTick(res, p, 0);
  p = P.toggleTick(res, p, 2);
  p = P.toggleTick(res, p, 2);
  p = P.toggleTick(res, p, 5);
  eq(p.ticks[divide.key], [true, false, false, false, false, true]);
  eq(P.toggleTick(res, p, 9), p, 'a tick outside the list changes nothing');
  p = P.rowDone(res, p);
  eq(p.index, divide.index + 1, 'moved on with boxes unticked');
  p = P.back(res, p);
  eq(p.ticks[divide.key], [true, false, false, false, false, true], 'ticks still there after coming back');
});

await test('Finished after the last entry, and Back returns to it', () => {
  const res = P.resolve(tee, 'S');
  const last = res.entries.length - 1;
  let p = goTo(res, last);
  eq([p.index, p.finished], [last, false]);
  p = P.rowDone(res, p);
  eq([p.index, p.finished], [last, true]);
  eq(P.rowDone(res, p), p, 'Row done does nothing once finished');
  eq(P.progressOf(res, p).percent, 100);
  p = P.back(res, p);
  eq([p.index, p.finished], [last, false]);
  // A pattern that ends on a measure step finishes with "Reached it".
  const endsOnMeasure = clone(scarf);
  endsOnMeasure.sections = [{ id: 'a', name: 'A', steps: [{ type: 'measure', text: 'Knit until 10 cm.', length: 10 }] }];
  const r2 = P.resolve(endsOnMeasure);
  eq(P.reachedIt(r2, P.rowDone(r2, P.startProgress())).finished, true);
});

await test('the Sections sheet jumps to a section copy\'s first entry', () => {
  const res = P.resolve(tee, 'S');
  const sleeve2 = res.sections.find((s) => s.displayName === 'Sleeve (2 of 2)');
  let p = P.addStitch(res, P.rowDone(res, P.startProgress()), 1);
  p = P.jumpToSection(res, p, sleeve2.index);
  eq([p.index, p.stitch, p.finished], [sleeve2.first, 0, false]);
  eq(P.jumpToSection(res, p, 99), p);
  const done = P.rowDone(res, goTo(res, res.entries.length - 1));
  eq(P.jumpToSection(res, done, 0).finished, false, 'jumping back from Finished');
});

await test('saved state restores to the same entry, counts and ticks', () => {
  const res = P.resolve(tee, 'M');
  const divide = res.entries.find((e) => e.label === 'Divide for body and sleeves');
  let p = goTo(res, divide.index);
  p = P.toggleTick(res, p, 1);
  p = P.rowDone(res, p);
  for (let i = 0; i < 7; i++) p = P.rowDone(res, p);
  p = P.addStitch(res, P.addStitch(res, p, 1), 1);
  // What the app keeps on the phone, written out and read back in.
  const stored = JSON.parse(JSON.stringify({ v: 2, mode: 'pattern', pattern: tee, size: 'M', progress: p }));
  eq(P.validate(stored.pattern).ok, true);
  const res2 = P.resolve(stored.pattern, stored.size);
  const p2 = P.restoreProgress(res2, stored.progress);
  eq(p2, p);
  eq([P.measureCount(res2, p2), p2.stitch, res2.entries[p2.index].text], [7, 2, 'Knit every round until the body measures 22 cm from the divide.']);
  const finished = P.rowDone(res, goTo(res, res.entries.length - 1));
  eq(P.restoreProgress(res, JSON.parse(JSON.stringify(finished))), finished, 'a finished pattern stays finished');
});

await test('damaged saved state falls back to something safe', () => {
  const res = P.resolve(tee, 'S');
  const fresh = P.startProgress();
  for (const bad of [null, 'x', 7, [], {}, { index: -1 }, { index: 1e9 }, { index: 1.5 }, { index: '3' }]) eq(P.restoreProgress(res, bad), fresh, JSON.stringify(bad));
  const odd = P.restoreProgress(res, { index: 2, stitch: -4, finished: 'yes', counts: { '0.1.0': 5, nope: 3, '1.1.0': 'many' }, ticks: { '0.1.14': 'x', '0.1.1': [true] } });
  eq(odd, { index: 2, finished: false, stitch: 0, counts: {}, ticks: {} });
});

await test('changing size restarts the current section and keeps earlier sections', () => {
  const res = P.resolve(tee, 'S');
  const divide = res.entries.find((e) => e.label === 'Divide for body and sleeves');
  const body = res.sections.find((s) => s.id === 'body');
  const sleeve2 = res.sections.find((s) => s.displayName === 'Sleeve (2 of 2)');
  let p = goTo(res, divide.index);
  p = P.toggleTick(res, p, 0);
  p = P.rowDone(res, p);
  for (let i = 0; i < 9; i++) p = P.rowDone(res, p);       // 9 body rounds
  p = goToFrom(res, p, sleeve2.first + 2);
  const { resolved, progress } = P.changeSize(tee, res, p, 'L');
  const newSleeve2 = resolved.sections.find((s) => s.displayName === 'Sleeve (2 of 2)');
  eq(resolved.size, 'L');
  eq([progress.index, progress.stitch, progress.finished], [newSleeve2.first, 0, false]);
  eq(progress.counts[res.entries[body.first].key], 9, 'body rounds kept');
  eq(progress.ticks[divide.key], [true, false, false, false, false, false], 'ticks kept');
  eq(resolved.entries[progress.index].text, 'Put the 35 held sleeve sts on the 4 mm needle and pick up 4 sts under the arm.');
});
function goToFrom(res, p, index) {
  while (p.index < index && !p.finished) p = res.entries[p.index].type === 'measure' ? P.reachedIt(res, p) : P.rowDone(res, p);
  return p;
}

await test('progress: percent stays at 99 or below until Finished', () => {
  const res = P.resolve(tee, 'S');
  eq(P.progressOf(res, P.startProgress()).percent, 0);
  const last = goTo(res, res.entries.length - 1);
  const pr = P.progressOf(res, last);
  ok(pr.percent <= 99, `percent before finishing was ${pr.percent}`);
  eq(pr.sections.map((s) => s.complete), [true, true, true, true, false]);
  eq(P.progressOf(res, P.rowDone(res, last)).percent, 100);
});

await test('progress: a measure step counts as its gauge estimate toward the plan', () => {
  const res = P.resolve(tee, 'S');
  const body = res.sections.find((s) => s.id === 'body');
  eq(res.sections.map((s) => s.plannedRows), [18, 78, 9, 9, 0]);
  let p = goTo(res, body.first);
  for (let i = 0; i < 33; i++) p = P.rowDone(res, p);
  let pr = P.progressOf(res, p);
  eq([pr.sections[1].done, pr.sections[1].planned, pr.rowsWorked], [33, 78, 18 + 33]);
  for (let i = 0; i < 60; i++) p = P.rowDone(res, p);      // 93 rounds: more than the estimate
  eq(P.progressOf(res, p).sections[1].done, 66, 'never counts more than the plan');
  p = P.reachedIt(res, p);
  pr = P.progressOf(res, p);
  eq([pr.sections[1].done, pr.rowsWorked], [66, 18 + 93]);
  // Moving on early still counts the step as done.
  const early = P.progressOf(res, P.reachedIt(res, P.rowDone(res, goTo(res, body.first))));
  eq(early.sections[1].done, 66);
  // With no gauge a measure step counts as one row.
  eq(P.resolve(clone({ ...scarf, info: {} })).sections[0].plannedRows, 12);
});

await test('row numbers count rounds already worked on measure steps', () => {
  const res = P.resolve(scarf);
  const lastRow = res.entries.find((e) => e.label === 'Last row');
  const measure = res.entries.find((e) => e.type === 'measure');
  let p = goTo(res, measure.index);
  for (let i = 0; i < 40; i++) p = P.rowDone(res, p);
  p = P.reachedIt(res, p);
  eq([lastRow.rowNumber, P.rowNumberAt(res, p)], [11, 51]);
  eq(P.rowNumberAt(res, P.startProgress()), null, 'action steps have no row number');
});

await test('swatch: finished rows, the current row and what is coming', () => {
  const res = P.resolve(tee, 'S');
  let sw = P.swatchOf(res, P.startProgress());
  eq(sw, { total: 0, done: [], castOnVisible: true, current: null, upcoming: [0, 0, 0] });
  let p = goTo(res, 4);                                      // cast on + 3 rib rounds done
  p = P.addStitch(res, p, 48);
  sw = P.swatchOf(res, p);
  eq([sw.total, sw.done, sw.current], [3, [0, 0, 0], { colour: 0, filled: 8, target: 96 }]);
  // Action steps add no rows; measure rounds do. Both sleeves share a colour.
  const body = res.sections.find((s) => s.id === 'body');
  p = goTo(res, body.first);
  eq(P.swatchOf(res, p).total, 18);
  p = P.rowDone(res, P.rowDone(res, p));
  sw = P.swatchOf(res, p);
  eq([sw.total, sw.done.length, sw.castOnVisible, sw.done.slice(-3)], [20, 9, false, [0, 1, 1]]);
  eq(res.sections.map((s) => s.colour), [0, 1, 2, 2, 3]);
  const end = P.swatchOf(res, P.rowDone(res, goTo(res, res.entries.length - 1)));
  eq([end.current, end.upcoming, end.total], [null, [], 24]);
});

// ---------------------------------------------------------------------------
console.log('\nGood neighbour and privacy scan');

const APP_FILES = ['index.html', 'styles.css', 'app.js', 'pattern.js', 'sw.js', 'manifest.webmanifest'];

// Run sw.js with pretend browser parts, so we can see what it really does.
function loadServiceWorker(cacheNames) {
  const handlers = {};
  const deleted = [];
  const precached = {};
  const caches = {
    keys: async () => [...cacheNames],
    delete: async (name) => { deleted.push(name); return true; },
    open: async (name) => ({ addAll: async (files) => { precached[name] = files; }, put: async () => {}, match: async () => undefined }),
    match: async () => undefined,
  };
  const self = { addEventListener: (type, fn) => { handlers[type] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} }, location: { href: 'https://example.invalid/Temp-Apps-Public/knittingapp/sw.js' }, registration: { scope: 'https://example.invalid/Temp-Apps-Public/knittingapp/' } };
  class Request { constructor(url, init = {}) { this.url = url; this.cache = init.cache; } }
  vm.runInNewContext(read(APP_DIR, 'sw.js'), { self, caches, URL, Response: globalThis.Response, Request, fetch: async () => { throw new Error('offline'); }, console });
  const fire = async (type) => { let waiting; handlers[type]({ waitUntil: (p) => { waiting = p; } }); await waiting; };
  return { fire, deleted, precached };
}

await test('sw.js only deletes caches starting with row-tracker-', async () => {
  const sw = loadServiceWorker(['fishbowl-v7', 'tally-counter-v1', 'counter', 'row-tracker-v1', 'row-tracker-v2', 'row-tracker-shared', 'my-row-tracker-v1', 'workbox-precache']);
  await sw.fire('activate');
  eq(sw.deleted, ['row-tracker-v1']);
  const src = read(APP_DIR, 'sw.js');
  ok(/const VERSION = 'row-tracker-v\d+';/.test(src), 'cache name looks like row-tracker-vN');
});

await test('sw.js saves every app file for offline use', async () => {
  const sw = loadServiceWorker([]);
  await sw.fire('install');
  const [name] = Object.keys(sw.precached);
  ok(name.startsWith('row-tracker-v'), `cache name ${name}`);
  ok(sw.precached[name].every((r) => r.cache === 'reload'), 'files are fetched fresh, not from the browser cache');
  const files = sw.precached[name].map((r) => r.url);
  for (const f of [...APP_FILES.filter((n) => n !== 'sw.js'), 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png']) {
    ok(files.includes(`./${f}`), `${f} is saved for offline use`);
  }
  for (const f of files) {
    ok(f.startsWith('./'), `${f} is a relative path`);
    ok(f === './' || existsSync(join(APP_DIR, f)), `${f} exists`);
  }
});

await test('no .pdf anywhere in knittingapp/', () => {
  const pdfs = walk(APP_DIR).filter((f) => extname(f).toLowerCase() === '.pdf' || readFileSync(f).subarray(0, 5).toString('latin1') === '%PDF-');
  eq(pdfs.map(rel), []);
});

await test('no pattern file outside tests/fixtures/', () => {
  const strays = walk(APP_DIR).filter((f) => !rel(f).startsWith('tests/fixtures/')).filter((f) => {
    if (!['.json', '.txt', '.webmanifest'].includes(extname(f).toLowerCase())) return false;
    try { const data = JSON.parse(readFileSync(f, 'utf8')); return data && data.format === P.FORMAT; } catch (e) { return false; }
  });
  eq(strays.map(rel), []);
});

await test('no innerHTML (or similar) in app.js', () => {
  const src = read(APP_DIR, 'app.js');
  for (const word of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) {
    ok(!src.includes(word), `app.js uses ${word}`);
  }
});

await test('no http URLs to other sites in the app files', () => {
  // The one allowed address is the fixed name browsers need for drawing SVG pictures. It is never loaded.
  const ALLOWED = ['http://www.w3.org/2000/svg'];
  for (const name of APP_FILES) {
    const urls = (read(APP_DIR, name).match(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)<>]*/gi) || []).filter((u) => !ALLOWED.includes(u));
    eq(urls, [], name);
  }
});

await test('index.html keeps the strict Content Security Policy and has no inline script', () => {
  const html = read(APP_DIR, 'index.html');
  ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'">`), 'CSP is the one in the spec');
  const scripts = html.match(/<script\b[^>]*>/g) || [];
  eq(scripts, ['<script type="module" src="./app.js">'], 'only the app script');
  ok(!/\son[a-z]+\s*=/i.test(html), 'no inline event handlers');
  ok(html.includes('viewport-fit=cover'), 'safe-area support');
});

await test('storage: only the rowtracker. key, plus removing v1\'s old key', () => {
  const src = read(APP_DIR, 'app.js');
  const keys = [...src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*'([^']+)';/g)].filter((m) => /KEY$/.test(m[1])).map((m) => m[2]);
  eq(keys.sort(), ['row-tracker-v2', 'rowtracker.v2']);
  ok(!/localStorage\.clear|sessionStorage|indexedDB|document\.cookie/.test(src), 'no other storage');
  const uses = [...src.matchAll(/localStorage\.(\w+)\(([^,)]*)/g)].map((m) => `${m[1]}(${m[2].trim()})`);
  eq([...new Set(uses)].sort(), ['getItem(KEY)', 'removeItem(OLD_V1_KEY)', 'setItem(KEY)']);
});

await test('manifest: name, colours, relative paths and the three icons', () => {
  const m = JSON.parse(read(APP_DIR, 'manifest.webmanifest'));
  eq([m.name, m.display, m.start_url, m.scope, m.theme_color, m.background_color], ['Row Tracker', 'standalone', './', './', '#9C3F5D', '#DCD3C3']);
  eq(m.icons.map((i) => i.src), ['icon-192.png', 'icon-512.png', 'icon-512-maskable.png']);
  for (const icon of m.icons) ok(existsSync(join(APP_DIR, icon.src)), `${icon.src} exists`);
  eq(m.icons[2].purpose, 'maskable');
});

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('Failed:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
