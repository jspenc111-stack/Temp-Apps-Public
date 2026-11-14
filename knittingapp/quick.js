// Quick projects: a project you set up in a few taps, with no pattern file.
// Sections, row targets, repeats and "every N rows" reminders. Pure logic, no screen code,
// so the tests can run it in Node. Pattern-file projects use pattern.js instead.

export const MAX_SECTIONS = 40;
export const MAX_REMINDERS = 20;
export const MAX_HISTORY = 30;
export const MAX_ROWS = 100000;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const int = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
};
const text = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

// ---------------------------------------------------------------------------
// Building and cleaning
// ---------------------------------------------------------------------------

/** A reminder is "every N rows: text" or "at row N: text" (within its section). */
export function cleanReminder(r) {
  if (!isObj(r)) return null;
  const label = text(r.text, 120);
  if (!label) return null;
  const every = int(r.every, 1, MAX_ROWS, 0);
  const at = int(r.at, 1, MAX_ROWS, 0);
  if (!every && !at) return null;
  return every ? { text: label, every } : { text: label, at };
}

export function cleanSection(s, index = 0) {
  if (!isObj(s)) s = {};
  const name = text(s.name, 40) || `Part ${index + 1}`;
  const target = int(s.target, 0, MAX_ROWS, 0);      // 0 = open-ended
  const repeat = int(s.repeat, 0, MAX_ROWS, 0);      // 0 = no repeat
  const reminders = (Array.isArray(s.reminders) ? s.reminders : [])
    .map(cleanReminder).filter(Boolean).slice(0, MAX_REMINDERS);
  return { name, target, repeat, reminders };
}

/** Make a quick project. `sections` may be empty: you get one open-ended section. */
export function newQuick({ name = '', craft = 'knit', sections = [] } = {}) {
  const cleaned = (Array.isArray(sections) ? sections : []).slice(0, MAX_SECTIONS).map(cleanSection);
  return {
    kind: 'quick',
    name: text(name, 60) || 'Untitled project',
    craft: craft === 'crochet' ? 'crochet' : 'knit',
    sections: cleaned.length ? cleaned : [cleanSection({ name: 'Rows' })],
    pos: { section: 0, row: 0 },   // row = rows finished in this section
    history: [],
    stitch: 0,
    done: false,
  };
}

/** Repair a saved quick project (saved data is never trusted blindly). */
export function restoreQuick(saved) {
  if (!isObj(saved)) return null;
  const q = newQuick({ name: saved.name, craft: saved.craft, sections: saved.sections });
  const pos = isObj(saved.pos) ? saved.pos : {};
  q.pos.section = int(pos.section, 0, q.sections.length - 1, 0);
  q.pos.row = int(pos.row, 0, MAX_ROWS, 0);
  q.stitch = int(saved.stitch, 0, MAX_ROWS, 0);
  q.done = saved.done === true && q.pos.section === q.sections.length - 1;
  q.history = (Array.isArray(saved.history) ? saved.history : [])
    .filter((h) => isObj(h) && isObj(h.prev))
    .map((h) => ({
      t: int(h.t, 0, Number.MAX_SAFE_INTEGER, 0),
      label: text(h.label, 80),
      prev: { section: int(h.prev.section, 0, q.sections.length - 1, 0), row: int(h.prev.row, 0, MAX_ROWS, 0), done: h.prev.done === true },
    }))
    .slice(-MAX_HISTORY);
  return q;
}

// ---------------------------------------------------------------------------
// Reading the current state
// ---------------------------------------------------------------------------

export function section(q) { return q.sections[q.pos.section]; }

/** The row about to be worked: 1-based within the section. */
export function nextRow(q) { return q.pos.row + 1; }

/** Is the current section's target met? (Open-ended sections never are.) */
export function sectionComplete(q) {
  const s = section(q);
  return s.target > 0 && q.pos.row >= s.target;
}

export function isLastSection(q) { return q.pos.section === q.sections.length - 1; }

/** Where the next row sits in the repeat: { rowInRepeat, repeatNumber, length } or null. */
export function repeatInfo(q, row = nextRow(q)) {
  const s = section(q);
  if (!s.repeat) return null;
  return {
    rowInRepeat: ((row - 1) % s.repeat) + 1,
    repeatNumber: Math.floor((row - 1) / s.repeat) + 1,
    length: s.repeat,
    repeatsPlanned: s.target ? Math.ceil(s.target / s.repeat) : 0,
  };
}

/** Reminders that apply to the row about to be worked, in the order they were set up. */
export function dueReminders(q, row = nextRow(q)) {
  if (q.done) return [];
  return section(q).reminders.filter((r) => (r.every ? row % r.every === 0 : r.at === row));
}

/** The very next reminder after this row, so the screen can say "decrease in 3 rows". */
export function upcomingReminder(q) {
  const s = section(q);
  const row = nextRow(q);
  let best = null;
  for (const r of s.reminders) {
    const next = r.every ? Math.ceil((row + 1) / r.every) * r.every : (r.at > row ? r.at : 0);
    if (!next) continue;
    if (s.target && next > s.target) continue;
    if (!best || next < best.row) best = { row: next, inRows: next - row, text: r.text };
  }
  return best;
}

/** Progress for the list card and the bar: rows done per section, and an overall fraction. */
export function progress(q) {
  const per = q.sections.map((s, i) => {
    const done = i < q.pos.section ? (s.target || 0) : i === q.pos.section ? q.pos.row : 0;
    const planned = s.target || Math.max(done, 1);
    return { name: s.name, done, planned, open: !s.target, complete: i < q.pos.section || (q.done && i === q.pos.section) || (s.target > 0 && done >= s.target) };
  });
  const planned = per.reduce((a, p) => a + p.planned, 0);
  const done = per.reduce((a, p) => a + Math.min(p.done, p.planned), 0);
  const hasOpen = per.some((p) => p.open && !p.complete);
  let fraction = planned ? done / planned : 0;
  if (q.done) fraction = 1; else if (fraction >= 1 || hasOpen) fraction = Math.min(fraction, 0.99);
  return { sections: per, fraction, hasOpen, rowsDone: per.reduce((a, p) => a + p.done, 0) };
}

// ---------------------------------------------------------------------------
// Moving. Every move records what it replaced, so one tap of Undo puts it back.
// ---------------------------------------------------------------------------

function record(q, label, now) {
  q.history.push({ t: now, label, prev: { section: q.pos.section, row: q.pos.row, done: q.done } });
  if (q.history.length > MAX_HISTORY) q.history.splice(0, q.history.length - MAX_HISTORY);
}

/** The main button. Finishes a row, or moves to the next section when the target is met. */
export function rowDone(q, now = Date.now()) {
  if (q.done) return q;
  q.stitch = 0;
  if (sectionComplete(q)) {
    if (isLastSection(q)) { record(q, `${section(q).name} finished`, now); q.done = true; return q; }
    record(q, `${section(q).name} finished`, now);
    q.pos = { section: q.pos.section + 1, row: 0 };
    return q;
  }
  record(q, `${rowWord(q)} ${nextRow(q)} done`, now);
  q.pos.row += 1;
  return q;
}

/** Jump straight to the next section, even if the target isn't met (or there is none). */
export function nextSection(q, now = Date.now()) {
  if (isLastSection(q)) {
    if (!q.done) { record(q, `${section(q).name} finished`, now); q.done = true; }
    return q;
  }
  record(q, `Moved on to ${q.sections[q.pos.section + 1].name}`, now);
  q.pos = { section: q.pos.section + 1, row: 0 };
  q.stitch = 0;
  return q;
}

export function canUndo(q) { return q.history.length > 0; }

export function undo(q) {
  const last = q.history.pop();
  if (!last) return q;
  q.pos = { section: last.prev.section, row: last.prev.row };
  q.done = last.prev.done;
  q.stitch = 0;
  return q;
}

export function jumpToSection(q, index, now = Date.now()) {
  const i = int(index, 0, q.sections.length - 1, -1);
  if (i < 0) return q;
  record(q, `Jumped to ${q.sections[i].name}`, now);
  q.pos = { section: i, row: 0 };
  q.done = false;
  q.stitch = 0;
  return q;
}

/** Set the row by hand (e.g. "I'm actually on row 30"). */
export function setRow(q, row, now = Date.now()) {
  const r = int(row, 0, MAX_ROWS, -1);
  if (r < 0) return q;
  record(q, `Set to ${rowWord(q).toLowerCase()} ${r + 1}`, now);
  q.pos.row = r;
  q.done = false;
  q.stitch = 0;
  return q;
}

export function addStitch(q, by = 1) {
  q.stitch = Math.max(0, Math.min(MAX_ROWS, q.stitch + by));
  return q;
}

export function rowWord(q) { return q.craft === 'crochet' ? 'Round' : 'Row'; }

/** "just now", "4 min ago", "yesterday": for the tap history line. */
export function ago(then, now = Date.now()) {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
