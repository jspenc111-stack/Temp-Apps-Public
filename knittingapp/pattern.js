// Pattern logic for Row Tracker: check a pattern file, turn it into a flat list of
// steps for one size, and work out where "Row done" and "Back" take you.
// There is no screen code here, so the tests can run this file in plain Node.
// The file shape is described in SPEC.md and converter/pattern.schema.json;
// validate() below follows the same rules. Keep the three in step.

export const FORMAT = 'row-tracker-pattern';
export const FORMAT_VERSION = 1;
export const MAX_FILE_BYTES = 2 * 1024 * 1024; // pattern files up to 2 MB

// Upper limits, so a strange or hostile file can't make the phone crawl.
export const LIMITS = {
  sizes: 30, sections: 100, stepsPerSection: 2000, count: 1000, repeat: 20,
  entries: 20000, text: 4000, name: 200, listItems: 200, checklist: 50,
};

export const YARN_COUNT = 5; // section colours cycle through five yarns

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isText = (v, max = LIMITS.text) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isWhole = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const isAmount = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 100000;

const PATTERN_KEYS = ['format', 'version', 'title', 'designer', 'source', 'craft', 'units', 'sizes', 'info', 'sections', 'reviewNotes'];
const INFO_KEYS = ['materials', 'needles', 'gauge', 'notes'];
const GAUGE_KEYS = ['stitches', 'rows', 'over', 'note'];
const SECTION_KEYS = ['id', 'name', 'worked', 'repeat', 'steps'];
const STEP_KEYS = ['type', 'text', 'label', 'count', 'stitchesAfter', 'side', 'length', 'checklist', 'needle', 'sizes', 'group', 'page', 'flag'];
const GROUP_KEYS = ['name', 'pass', 'of'];
const STEP_TYPES = ['row', 'measure', 'action'];
// Fields that only make sense on one kind of step.
const ONLY_ON = { count: 'row', side: 'row', length: 'measure', checklist: 'action' };

// ---------------------------------------------------------------------------
// validate(data): is this a pattern file the app can safely open?
// Returns { ok: true, problems: [] } or { ok: false, problems: ['plain words', ...] }.
// ---------------------------------------------------------------------------
export function validate(data) {
  const problems = [];
  const add = (msg) => { if (problems.length < 100 && !problems.includes(msg)) problems.push(msg); };
  const done = () => ({ ok: problems.length === 0, problems });

  if (!isObj(data) || data.format !== FORMAT) {
    add('This is not a Row Tracker pattern file. Convert the pattern in Claude first, then open the file it gives you.');
    return done();
  }
  if (data.version !== FORMAT_VERSION) {
    if (typeof data.version === 'number' && data.version > FORMAT_VERSION) add('This file was made for a newer Row Tracker. Open the app once while online so it updates, then try again.');
    else add('The file should say "version": 1.');
    return done();
  }
  const unknown = (obj, allowed, where) => {
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) add(`${where} has a part the app doesn't know: "${String(k).slice(0, 40)}"`);
  };
  const textList = (v, what, maxItems = LIMITS.listItems) => {
    if (v === undefined) return;
    if (!Array.isArray(v) || v.length > maxItems || !v.every((t) => isText(t))) add(`${what} should be a list of short pieces of text`);
  };

  unknown(data, PATTERN_KEYS, 'The pattern');
  if (!isText(data.title, LIMITS.name)) add('The pattern has no title');
  for (const k of ['designer', 'source']) if (data[k] !== undefined && !isText(data[k], LIMITS.name)) add(`The pattern's ${k} should be a short piece of text`);
  if (data.craft !== undefined && data.craft !== 'knit' && data.craft !== 'crochet') add('The craft should be "knit" or "crochet"');
  if (data.units !== undefined && data.units !== 'cm' && data.units !== 'in') add('The units should be "cm" or "in"');

  // Sizes
  let sizes = [];
  if (data.sizes !== undefined) {
    const s = data.sizes;
    if (!Array.isArray(s) || s.length < 1 || s.length > LIMITS.sizes || !s.every((n) => isText(n, 40)) || new Set(s).size !== s.length) {
      add('The sizes should be a list of different size names, like "S", "M", "L"');
    } else sizes = s;
  }

  // Info
  if (data.info !== undefined) {
    if (!isObj(data.info)) add('The pattern info is not in the right shape');
    else {
      unknown(data.info, INFO_KEYS, 'The pattern info');
      textList(data.info.materials, 'The materials');
      textList(data.info.needles, 'The needles');
      textList(data.info.notes, 'The notes');
      const g = data.info.gauge;
      if (g !== undefined) {
        if (!isObj(g)) add('The gauge is not in the right shape');
        else {
          unknown(g, GAUGE_KEYS, 'The gauge');
          for (const k of ['stitches', 'rows', 'over']) if (g[k] !== undefined && !isAmount(g[k])) add(`The gauge's "${k}" should be a number above 0`);
          if (g.note !== undefined && !isText(g.note)) add('The gauge note should be a short piece of text');
        }
      }
    }
  }
  textList(data.reviewNotes, 'The review notes');

  // A value that may be one thing for every size, or an object with one entry per size.
  const perSize = (value, test, where, what, applies) => {
    if (!isObj(value)) {
      if (!test(value)) add(`${where}: ${what} is not right`);
      return;
    }
    if (!sizes.length) { add(`${where}: ${what} is different per size, but the pattern lists no sizes`); return; }
    for (const k of Object.keys(value)) {
      if (!sizes.includes(k)) add(`${where}: ${what} mentions a size the pattern doesn't list ("${String(k).slice(0, 40)}")`);
      else if (!test(value[k])) add(`${where}: ${what} for size ${k} is not right`);
    }
    for (const s of applies) if (!own(value, s)) add(`${where}: ${what} is missing size ${s}`);
  };

  // Sections and steps
  if (!Array.isArray(data.sections) || data.sections.length < 1) {
    add('The pattern has no sections');
    return done();
  }
  if (data.sections.length > LIMITS.sections) { add('The pattern has too many sections for the app'); return done(); }

  const ids = new Set();
  data.sections.forEach((sec, si) => {
    const secNo = `Section ${si + 1}`;
    if (!isObj(sec)) { add(`${secNo} is not in the right shape`); return; }
    const secName = isText(sec.name, LIMITS.name) ? sec.name : secNo;
    unknown(sec, SECTION_KEYS, secName);
    if (!isText(sec.name, LIMITS.name)) add(`${secNo} has no name`);
    if (!isText(sec.id, 60)) add(`${secName} has no id`);
    else if (ids.has(sec.id)) add(`Two sections share the id "${sec.id.slice(0, 40)}"`);
    else ids.add(sec.id);
    if (sec.worked !== undefined && sec.worked !== 'round' && sec.worked !== 'flat') add(`${secName}: "worked" should be "round" or "flat"`);
    if (sec.repeat !== undefined && !isWhole(sec.repeat, 1, LIMITS.repeat)) add(`${secName}: "repeat" should be a whole number from 1 to ${LIMITS.repeat}`);
    if (!Array.isArray(sec.steps) || sec.steps.length < 1) { add(`${secName} has no steps`); return; }
    if (sec.steps.length > LIMITS.stepsPerSection) { add(`${secName} has too many steps for the app`); return; }

    sec.steps.forEach((step, ti) => {
      const where = `Step ${ti + 1} in ${secName}`;
      if (!isObj(step)) { add(`${where} is not in the right shape`); return; }
      unknown(step, STEP_KEYS, where);
      if (!STEP_TYPES.includes(step.type)) {
        add(`${where} has a type the app doesn't know (it should be "row", "measure" or "action")`);
        return;
      }
      // Which sizes work this step?
      let applies = sizes;
      if (step.sizes !== undefined) {
        const ok = Array.isArray(step.sizes) && step.sizes.length >= 1 && new Set(step.sizes).size === step.sizes.length;
        if (!ok || !sizes.length) add(`${where}: "sizes" should list some of the pattern's sizes`);
        else if (!step.sizes.every((s) => sizes.includes(s))) add(`${where} mentions a size the pattern doesn't list`);
        else applies = step.sizes;
      }
      for (const [field, type] of Object.entries(ONLY_ON)) {
        if (step[field] !== undefined && step.type !== type) add(`${where}: "${field}" only belongs on ${type === 'action' ? 'an' : 'a'} ${type} step`);
      }

      if (step.text === undefined || step.text === '' || step.text === null) add(`${where} has no text`);
      else perSize(step.text, (t) => isText(t), where, 'the text', applies);
      if (step.label !== undefined && !isText(step.label, LIMITS.name)) add(`${where}: the label should be a short piece of text`);
      if (step.count !== undefined && step.type === 'row') perSize(step.count, (n) => isWhole(n, 1, LIMITS.count), where, 'the count', applies);
      if (step.stitchesAfter !== undefined) perSize(step.stitchesAfter, (n) => isWhole(n, 0, 100000), where, 'the stitch count', applies);
      if (step.side !== undefined && step.side !== 'RS' && step.side !== 'WS') add(`${where}: the side should be "RS" or "WS"`);
      if (step.type === 'measure') {
        if (step.length === undefined) add(`${where} is a measure step with no length`);
        else perSize(step.length, isAmount, where, 'the length', applies);
      }
      if (step.checklist !== undefined && step.type === 'action') {
        if (!Array.isArray(step.checklist) || step.checklist.length < 1 || step.checklist.length > LIMITS.checklist) add(`${where}: the checklist should be a list of 1 to ${LIMITS.checklist} items`);
        else step.checklist.forEach((item, ci) => perSize(item, (t) => isText(t), where, `checklist item ${ci + 1}`, applies));
      }
      if (step.needle !== undefined && !isText(step.needle, 60)) add(`${where}: the needle should be a short piece of text, like "3 mm"`);
      if (step.page !== undefined && !isWhole(step.page, 1, 100000)) add(`${where}: the page should be a whole number`);
      if (step.flag !== undefined && !isText(step.flag)) add(`${where}: the flag should be a short piece of text`);
      if (step.group !== undefined) {
        const g = step.group;
        if (!isObj(g)) add(`${where}: the repeat info is not in the right shape`);
        else {
          unknown(g, GROUP_KEYS, `${where}'s repeat info`);
          if (!isText(g.name, LIMITS.name)) add(`${where}: the repeat info has no name`);
          if (!isWhole(g.pass, 1, 10000)) add(`${where}: the repeat info needs a pass number`);
          if (g.of === undefined) add(`${where}: the repeat info doesn't say how many passes there are`);
          else {
            perSize(g.of, (n) => isWhole(n, 1, 10000), where, 'the number of passes', applies);
            if (isWhole(g.pass, 1, 10000)) {
              const totals = isObj(g.of) ? applies.filter((s) => own(g.of, s)).map((s) => g.of[s]) : [g.of];
              if (totals.some((n) => Number.isInteger(n) && g.pass > n)) add(`${where} says pass ${g.pass}, which is more passes than there are`);
            }
          }
        }
      }
    });
  });

  // Every size needs something to knit, and the whole thing has to be a sensible length.
  if (problems.length === 0) {
    for (const size of sizes.length ? sizes : [null]) {
      const n = countEntries(data, size);
      if (n === 0) add(size === null ? 'The pattern has no steps' : `Size ${size} has no steps`);
      if (n > LIMITS.entries) { add('The pattern is too long for the app'); break; }
    }
  }
  return done();
}

function countEntries(pattern, size) {
  let n = 0;
  for (const sec of pattern.sections) {
    let per = 0;
    for (const step of sec.steps) {
      if (step.sizes && !step.sizes.includes(size)) continue;
      const count = step.type === 'row' ? (isObj(step.count) ? step.count[size] : step.count) : 1;
      per += count || 1;
    }
    n += per * (sec.repeat || 1);
  }
  return n;
}

// ---------------------------------------------------------------------------
// Reading a file the knitter picked or pasted.
// ---------------------------------------------------------------------------
export function looksLikePdf({ name = '', type = '', text = '' } = {}) {
  return /\.pdf$/i.test(name) || /pdf/i.test(type) || text.slice(0, 1024).trimStart().startsWith('%PDF');
}

export const PDF_MESSAGE = 'This is a PDF. Convert it with the Pattern Converter in Claude first, then open the file it gives you.';
export const TOO_BIG_MESSAGE = 'This file is too big for Row Tracker (the limit is 2 MB). Pattern files are normally much smaller, so check you picked the right one.';

// The UTF-8 size of a piece of text, without needing any browser or Node helper.
export function byteLength(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

// Returns { ok: true, pattern } or { ok: false, message, problems }.
export function readPatternText(text, file = {}) {
  const fail = (message, problems = []) => ({ ok: false, message, problems });
  if (typeof text !== 'string') return fail("This file can't be opened", ['The file could not be read.']);
  const size = typeof file.size === 'number' ? file.size : byteLength(text);
  if (looksLikePdf({ name: file.name, type: file.type, text })) return fail(PDF_MESSAGE);
  if (size > MAX_FILE_BYTES) return fail(TOO_BIG_MESSAGE);
  if (!text.trim()) return fail("This file can't be opened", ['The file is empty.']);
  let data;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    return fail("This file can't be opened", ['It is not a complete pattern file. If you copied it, make sure you copied all of it, from the first { to the last }.']);
  }
  const check = validate(data);
  if (!check.ok) return fail("This file can't be opened", check.problems);
  return { ok: true, pattern: data };
}

// ---------------------------------------------------------------------------
// estimateRows(length, gauge): how many rows a length takes at this gauge.
// ---------------------------------------------------------------------------
export function estimateRows(length, gauge) {
  if (!isAmount(length) || !isObj(gauge) || !isAmount(gauge.rows) || !isAmount(gauge.over)) return null;
  return Math.max(1, Math.round((length * gauge.rows) / gauge.over));
}

// ---------------------------------------------------------------------------
// resolve(pattern, size): the flat list of steps for one size.
// Call it only with a pattern that passed validate().
// ---------------------------------------------------------------------------
export function resolve(pattern, size) {
  const sizes = Array.isArray(pattern.sizes) ? pattern.sizes : [];
  let chosen = null;
  if (sizes.length) {
    chosen = sizes.includes(size) ? size : sizes.length === 1 ? sizes[0] : null;
    if (chosen === null) throw new Error('Pick a size first.');
  }
  const pick = (v) => (isObj(v) ? v[chosen] : v);                // 2. per-size values
  const gauge = pattern.info && isObj(pattern.info.gauge) ? pattern.info.gauge : null;
  const units = pattern.units === 'in' ? 'in' : 'cm';

  const entries = [];
  const sections = [];
  let stitches = null;   // stitches on the needle, carried from the last stitchesAfter
  let needle = null;     // needle in use, carried from the last needle
  let colour = 0;

  pattern.sections.forEach((sec, si) => {
    const steps = [];
    sec.steps.forEach((step, ti) => {
      if (step.sizes && !step.sizes.includes(chosen)) return;    // 1. steps for other sizes
      const length = step.type === 'measure' ? pick(step.length) : null;
      steps.push({
        stepIndex: ti,
        type: step.type,
        text: pick(step.text),
        label: step.label || null,
        count: step.type === 'row' ? pick(step.count) || 1 : 1,
        stitchesAfter: step.stitchesAfter === undefined ? null : pick(step.stitchesAfter),
        side: step.type === 'row' && step.side ? step.side : null,
        length,
        estimate: step.type === 'measure' ? estimateRows(length, gauge) : null,
        checklist: step.type === 'action' && step.checklist ? step.checklist.map(pick) : null,
        needle: step.needle || null,
        group: step.group ? { name: step.group.name, pass: step.group.pass, of: pick(step.group.of) } : null,
        page: step.page || null,
        flag: step.flag || null,
      });
    });
    if (!steps.length) return;
    const worked = sec.worked === 'round' ? 'round' : 'flat';
    const copies = sec.repeat || 1;
    const myColour = colour++ % YARN_COUNT;

    for (let copy = 1; copy <= copies; copy++) {                 // 3. repeated sections
      const section = {
        index: sections.length, id: sec.id, baseIndex: si, name: sec.name,
        displayName: copies > 1 ? `${sec.name} (${copy} of ${copies})` : sec.name,
        copy, copies, worked, colour: myColour, steps,
        first: entries.length, last: entries.length, rows: 0, measures: 0, plannedRows: 0,
      };
      let rowNumber = 0;
      for (const step of steps) {
        if (step.needle) needle = step.needle;                   // 5. needle carried forward
        for (let part = 1; part <= step.count; part++) {         // 4. split identical rows
          const before = stitches;
          let after = null;
          if (step.stitchesAfter !== null) {
            if (part === step.count || step.stitchesAfter === before) after = step.stitchesAfter;
            stitches = after;                                    // unknown in the middle of a changing run
          }
          const entry = {
            index: entries.length,
            key: `${si}.${copy}.${step.stepIndex}`,
            section: section.index,
            type: step.type, text: step.text, label: step.label, side: step.side,
            part, of: step.count,
            length: step.length, estimate: step.estimate, units,
            checklist: step.checklist, group: step.group, page: step.page, flag: step.flag,
            needleChange: part === 1 ? step.needle : null,
            needle,
            stitchesBefore: before,                              // 5. stitches carried forward
            stitchesAfter: after,
            rowNumber: null,
          };
          if (step.type === 'row') { entry.rowNumber = ++rowNumber; section.rows++; section.plannedRows++; } // 6.
          if (step.type === 'measure') { section.measures++; section.plannedRows += step.estimate || 1; }
          entries.push(entry);
        }
      }
      section.last = entries.length - 1;
      sections.push(section);
    }
  });

  return {
    title: pattern.title, size: chosen, sizes, units, gauge,
    craft: pattern.craft === 'crochet' ? 'crochet' : 'knit',
    sections, entries,
    totals: {
      baseSections: new Set(sections.map((s) => s.baseIndex)).size,
      rows: sections.reduce((n, s) => n + s.rows, 0),
      measures: sections.reduce((n, s) => n + s.measures, 0),
      plannedRows: sections.reduce((n, s) => n + s.plannedRows, 0),
    },
  };
}

// Review notes plus every flagged step for this size, for the "Check it" screen.
export function flagsFor(pattern, resolved) {
  const out = [];
  for (const note of pattern.reviewNotes || []) out.push({ where: null, text: note });
  for (const sec of resolved.sections) {
    if (sec.copy !== 1) continue;
    sec.steps.forEach((step) => {
      if (step.flag) out.push({ where: `${sec.name}, ${step.label || `step ${step.stepIndex + 1}`}`, text: step.flag });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Movement. "progress" is the knitter's place:
//   { index, finished, stitch, counts: { entryKey: rounds worked on a measure step },
//     ticks: { entryKey: [true, false, ...] } }
// Every function returns a new progress object and leaves the old one alone.
// ---------------------------------------------------------------------------
export function startProgress() {
  return { index: 0, finished: false, stitch: 0, counts: {}, ticks: {} };
}

const copyOf = (p) => ({ index: p.index, finished: p.finished, stitch: p.stitch, counts: { ...p.counts }, ticks: { ...p.ticks } });
const lastIndex = (res) => res.entries.length - 1;

export function measureCount(res, p, index = p.index) {
  const e = res.entries[index];
  return (e && p.counts[e.key]) || 0;
}

// "Row done", "Round done" or "Step done".
export function rowDone(res, p) {
  if (p.finished) return p;
  const n = copyOf(p);
  const e = res.entries[n.index];
  n.stitch = 0;
  if (e.type === 'measure') { n.counts[e.key] = (n.counts[e.key] || 0) + 1; return n; }
  if (n.index < lastIndex(res)) n.index++;
  else n.finished = true;
  return n;
}

// "Reached 22 cm, move on" on a measure step.
export function reachedIt(res, p) {
  if (p.finished || res.entries[p.index].type !== 'measure') return p;
  const n = copyOf(p);
  n.stitch = 0;
  if (n.index < lastIndex(res)) n.index++;
  else n.finished = true;
  return n;
}

export function canGoBack(res, p) {
  return p.finished || p.index > 0 || measureCount(res, p) > 0;
}

export function back(res, p) {
  if (!canGoBack(res, p)) return p;
  const n = copyOf(p);
  n.stitch = 0;
  const e = res.entries[n.index];
  if (n.finished) n.finished = false;
  else if (e.type === 'measure' && n.counts[e.key] > 0) n.counts[e.key]--;
  else n.index--;
  return n;
}

export function jumpToSection(res, p, sectionIndex) {
  const sec = res.sections[sectionIndex];
  if (!sec) return p;
  const n = copyOf(p);
  n.index = sec.first; n.finished = false; n.stitch = 0;
  return n;
}

export function addStitch(res, p, by) {
  if (p.finished || res.entries[p.index].type === 'action') return p;
  const n = copyOf(p);
  n.stitch = Math.max(0, Math.min(99999, n.stitch + by));
  return n;
}

export function toggleTick(res, p, itemIndex) {
  const e = res.entries[p.index];
  if (p.finished || !e.checklist || itemIndex < 0 || itemIndex >= e.checklist.length) return p;
  const n = copyOf(p);
  const ticks = e.checklist.map((_, i) => !!(n.ticks[e.key] && n.ticks[e.key][i]));
  ticks[itemIndex] = !ticks[itemIndex];
  n.ticks[e.key] = ticks;
  return n;
}

// Tidy up a saved place so it always fits this pattern (saved data is never trusted blindly).
export function restoreProgress(res, saved) {
  const p = startProgress();
  if (!isObj(saved)) return p;
  const keys = new Map(res.entries.map((e) => [e.key, e]));
  if (isWhole(saved.index, 0, lastIndex(res))) p.index = saved.index;
  p.finished = saved.finished === true;
  if (p.finished) p.index = lastIndex(res);
  if (isWhole(saved.stitch, 0, 99999) && !p.finished) p.stitch = saved.stitch;
  if (isObj(saved.counts)) {
    for (const [k, v] of Object.entries(saved.counts)) {
      if (keys.has(k) && keys.get(k).type === 'measure' && isWhole(v, 1, 100000)) p.counts[k] = v;
    }
  }
  if (isObj(saved.ticks)) {
    for (const [k, v] of Object.entries(saved.ticks)) {
      const e = keys.get(k);
      if (e && e.checklist && Array.isArray(v)) p.ticks[k] = e.checklist.map((_, i) => v[i] === true);
    }
  }
  return p;
}

// Changing size: the steps differ, so restart from the beginning of the current section.
// Rounds counted and boxes ticked in earlier sections are kept.
export function changeSize(pattern, res, p, newSize) {
  const next = resolve(pattern, newSize);
  const cur = res.sections[res.entries[p.index].section];
  const target = next.sections.find((s) => s.baseIndex === cur.baseIndex && s.copy === cur.copy)
    || next.sections.find((s) => s.baseIndex > cur.baseIndex)
    || next.sections[0];
  const n = startProgress();
  n.index = target.first;
  for (const e of next.entries) {
    if (e.index >= target.first) break;
    if (p.counts[e.key]) n.counts[e.key] = p.counts[e.key];
    if (p.ticks[e.key] && e.checklist) n.ticks[e.key] = e.checklist.map((_, i) => p.ticks[e.key][i] === true);
  }
  return { resolved: next, progress: n };
}

// The row number to show on a row with no label: its number in this section,
// counting any rounds already worked on measure steps earlier in the section.
export function rowNumberAt(res, p, index = p.index) {
  const e = res.entries[index];
  if (!e || e.rowNumber === null) return null;
  let extra = 0;
  for (let i = res.sections[e.section].first; i < index; i++) {
    if (res.entries[i].type === 'measure') extra += p.counts[res.entries[i].key] || 0;
  }
  return e.rowNumber + extra;
}

// ---------------------------------------------------------------------------
// Progress, for the bar and the knitted swatch.
// ---------------------------------------------------------------------------
export function progressOf(res, p) {
  const sections = res.sections.map((sec) => {
    let done = 0;      // rows toward the plan (a measure step counts as its estimate)
    let worked = 0;    // rows actually knitted, for the swatch
    for (let i = sec.first; i <= sec.last; i++) {
      const e = res.entries[i];
      const passed = p.finished || i < p.index;
      if (e.type === 'row' && passed) { done++; worked++; }
      if (e.type === 'measure') {
        const planned = e.estimate || 1;
        const count = p.counts[e.key] || 0;
        if (passed) { done += planned; worked += count; }
        else if (i === p.index) { done += Math.min(count, planned); worked += count; }
      }
    }
    const complete = p.finished || p.index > sec.last;
    const stepsDone = p.finished ? sec.last - sec.first + 1 : Math.max(0, Math.min(p.index, sec.last + 1) - sec.first);
    const steps = sec.last - sec.first + 1;
    const fraction = complete ? 1 : sec.plannedRows > 0 ? Math.min(1, done / sec.plannedRows) : stepsDone / steps;
    return { planned: sec.plannedRows, done: Math.min(done, sec.plannedRows), worked, complete, fraction, steps, stepsDone };
  });
  const planned = sections.reduce((n, s) => n + s.planned, 0);
  const done = sections.reduce((n, s) => n + s.done, 0);
  let percent;
  if (p.finished) percent = 100;
  else if (planned > 0) percent = Math.min(99, Math.round((done / planned) * 100));
  else percent = Math.min(99, Math.round((p.index / res.entries.length) * 100));
  return { sections, planned, done, percent, rowsWorked: sections.reduce((n, s) => n + s.worked, 0) };
}

// What the swatch draws: finished rows (oldest first, as colour numbers), the row
// being worked, and a few upcoming rows.
export function swatchOf(res, p, { maxDone = 9, maxUpcoming = 3, columns = 15 } = {}) {
  const done = [];
  const limit = p.finished ? res.entries.length : p.index + 1;
  for (let i = 0; i < limit; i++) {
    const e = res.entries[i];
    const colour = res.sections[e.section].colour;
    if (e.type === 'row' && (p.finished || i < p.index)) done.push(colour);
    if (e.type === 'measure') for (let k = 0; k < (p.counts[e.key] || 0); k++) done.push(colour);
  }
  let current = null;
  const upcoming = [];
  if (!p.finished) {
    const e = res.entries[p.index];
    if (e.type !== 'action') {
      const target = e.stitchesBefore > 0 ? e.stitchesBefore : null;
      const filled = target
        ? Math.round(columns * Math.min(1, p.stitch / target))
        : p.stitch ? ((p.stitch - 1) % columns) + 1 : 0;
      current = { colour: res.sections[e.section].colour, filled, target };
    }
    for (let i = p.index + 1; i < res.entries.length && upcoming.length < maxUpcoming; i++) {
      if (res.entries[i].type !== 'action') upcoming.push(res.sections[res.entries[i].section].colour);
    }
  }
  return { total: done.length, done: done.slice(-maxDone), castOnVisible: done.length <= maxDone, current, upcoming };
}
