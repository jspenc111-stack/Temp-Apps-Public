// Row Tracker: screens, buttons and saving. All the pattern logic lives in pattern.js.
// Pattern files are untrusted: every word from one goes on screen with textContent,
// so a booby-trapped file can't run code.

import * as P from './pattern.js';

const KEY = 'rowtracker.v2';          // the only storage key this app uses
const OLD_V1_KEY = 'row-tracker-v2';  // what version 1 saved under; removed on start-up
const SHARED_CACHE = 'row-tracker-shared';
const SHARED_FILE = './shared-pattern';
const SVG_NS = 'http://www.w3.org/2000/svg';

const $ = (id) => document.getElementById(id);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

let saved = null;     // what is kept on the phone: a pattern with your place, or a plain row count
let res = null;       // the saved pattern, worked out for your size
let pending = null;   // a file you've opened but not started yet: { pattern, size, res }
let sizeMode = 'new'; // is the size screen for a new file ('new') or for changing size ('change')?
let saveFailed = false;

// ---------------------------------------------------------------------------
// Saving. Every read and write is wrapped, and unreadable data means "start fresh".
// ---------------------------------------------------------------------------
function loadSaved() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
    saveFailed = false;
  } catch (e) { saveFailed = true; }
}
function removeVersion1Data() {
  try { localStorage.removeItem(OLD_V1_KEY); } catch (e) { /* nothing to clear */ }
}

function restore() {
  const data = loadSaved();
  if (!isObj(data) || data.v !== 2) return;
  if (data.mode === 'counter') {
    const c = isObj(data.counter) ? data.counter : {};
    const whole = (n) => (Number.isInteger(n) && n >= 0 && n <= 999999 ? n : 0);
    saved = { v: 2, mode: 'counter', counter: { row: whole(c.row), stitch: whole(c.stitch) } };
    return;
  }
  if (data.mode === 'pattern' && P.validate(data.pattern).ok) {
    try {
      res = P.resolve(data.pattern, data.size);
      saved = { v: 2, mode: 'pattern', pattern: data.pattern, size: res.size, progress: P.restoreProgress(res, data.progress) };
    } catch (e) { saved = null; res = null; }
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}
function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  return e;
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const yarn = (i) => `var(--y${i % P.YARN_COUNT})`;
const rowWords = (worked) => (worked === 'round'
  ? { Row: 'Round', row: 'round', rows: 'rounds' }
  : { Row: 'Row', row: 'row', rows: 'rows' });
const amount = (n) => String(Math.round(n * 100) / 100);
const toolWord = (r) => (r.craft === 'crochet' ? 'hook' : 'needle');
const needleText = (needle, r) => (/needle|hook/i.test(needle) ? needle : `${needle} ${toolWord(r)}`);
function buzz(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* no vibration on this phone */ }
}
function say(text) { $('announce').textContent = text; }

const SCREENS = ['add', 'size', 'check', 'tracker'];
function show(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// 1. Add a pattern
// ---------------------------------------------------------------------------
function showAdd() {
  $('backToKnittingBtn').classList.toggle('hidden', !saved);
  $('backToKnittingBtn').textContent = saved && saved.mode === 'counter' ? 'Back to my row count' : 'Back to my knitting';
  $('counterBtn').classList.toggle('hidden', !!saved && saved.mode === 'counter');
  show('add');
}
function clearProblem() {
  $('addStatus').classList.add('hidden');
  $('addStatusTitle').textContent = '';
  $('addStatusList').replaceChildren();
}
function showProblem(message, problems = []) {
  $('addStatusTitle').textContent = message;
  const list = $('addStatusList');
  list.replaceChildren();
  problems.slice(0, 5).forEach((p) => list.appendChild(el('li', null, p)));
  if (problems.length > 5) list.appendChild(el('li', null, `…and ${problems.length - 5} more.`));
  $('addStatus').classList.remove('hidden');
  showAdd();
  $('addStatus').scrollIntoView({ block: 'nearest' });
}

function openText(text, file) {
  clearProblem();
  const result = P.readPatternText(text, file);
  if (!result.ok) { showProblem(result.message, result.problems); return; }
  pending = { pattern: result.pattern, size: null, res: null };
  $('pasteInput').value = '';
  const sizes = result.pattern.sizes || [];
  if (sizes.length > 1) { showSizes('new'); return; }
  pending.size = sizes.length ? sizes[0] : null;
  showCheck();
}

async function openFile(file) {
  if (!file) return;
  clearProblem();
  if (P.looksLikePdf({ name: file.name, type: file.type })) { showProblem(P.PDF_MESSAGE); return; }
  if (file.size > P.MAX_FILE_BYTES) { showProblem(P.TOO_BIG_MESSAGE); return; }
  let text;
  try { text = await file.text(); } catch (e) {
    showProblem("This file can't be opened", ['Your phone could not read the file. Try picking it again.']);
    return;
  }
  openText(text, { name: file.name, type: file.type, size: file.size });
}

// A file shared into the app from Android's share menu. The offline helper (sw.js)
// keeps it on the phone for a moment; here we pick it up and check it like any other file.
async function takeSharedFile() {
  let flag = null;
  try { flag = new URLSearchParams(window.location.search).get('shared'); } catch (e) { return; }
  if (!flag) return;
  try { window.history.replaceState(null, '', './'); } catch (e) { /* the address just keeps its ending */ }
  const failed = () => showProblem("The shared file couldn't be opened", ['Save the file to your phone, then use "Open pattern file".']);
  if (flag !== '1' || !('caches' in window)) { failed(); return; }
  try {
    const cache = await caches.open(SHARED_CACHE);
    const hit = await cache.match(SHARED_FILE);
    if (!hit) { await caches.delete(SHARED_CACHE); failed(); return; }
    const shared = await hit.json();
    await caches.delete(SHARED_CACHE);
    if (!isObj(shared)) { failed(); return; }
    if (shared.size > P.MAX_FILE_BYTES) { showProblem(P.TOO_BIG_MESSAGE); return; }
    openText(typeof shared.text === 'string' ? shared.text : '', { name: String(shared.name || ''), type: String(shared.type || ''), size: shared.size > 0 ? shared.size : undefined });
  } catch (e) { failed(); }
}

function showHelp() {
  const body = [];
  const steps = el('ol');
  [
    'Share your pattern PDF with Claude.',
    'Ask it to convert the pattern for Row Tracker.',
    'Download the file it gives you.',
    'Come back here and tap "Open pattern file".',
  ].forEach((t) => steps.appendChild(el('li', null, t)));
  body.push(steps);
  body.push(el('p', 'muted', 'Only the converting step uses the internet. Once the file is open here, your pattern and your place stay on this phone and are never sent anywhere.'));
  openSheet('How do I make a pattern file?', body);
}

// ---------------------------------------------------------------------------
// 2. Pick your size (also used for "Change size")
// ---------------------------------------------------------------------------
function showSizes(mode) {
  sizeMode = mode;
  const pattern = mode === 'new' ? pending.pattern : saved.pattern;
  $('sizeTitle').textContent = pattern.title;
  $('sizeDesigner').textContent = pattern.designer ? `by ${pattern.designer}` : '';
  $('sizeDesigner').classList.toggle('hidden', !pattern.designer);
  $('sizeHeading').textContent = mode === 'new' ? 'Pick your size' : 'Change size';
  $('sizeNote').textContent = mode === 'change' ? 'The steps differ by size, so you will go back to the start of the section you are on.' : '';
  $('sizeNote').classList.toggle('hidden', mode !== 'change');
  $('sizeCancelBtn').textContent = mode === 'new' ? 'Choose a different file' : 'Keep my size';
  const list = $('sizeList');
  list.replaceChildren();
  pattern.sizes.forEach((size) => {
    const b = el('button', 'btn btn-primary', size);
    b.type = 'button';
    if (mode === 'change' && size === saved.size) {
      b.disabled = true;
      b.appendChild(el('small', null, 'Your size now'));
    }
    b.addEventListener('click', () => pickSize(size));
    list.appendChild(b);
  });
  show('size');
}

function pickSize(size) {
  if (sizeMode === 'new') {
    pending.size = size;
    showCheck();
    return;
  }
  const section = res.sections[res.entries[saved.progress.index].section].displayName;
  if (!window.confirm(`Change to size ${size}? You will go back to the start of ${section}, because the steps differ by size.`)) return;
  const changed = P.changeSize(saved.pattern, res, saved.progress, size);
  res = changed.resolved;
  saved.size = res.size;
  saved.progress = changed.progress;
  save();
  showTracker(true);
}

// ---------------------------------------------------------------------------
// 3. Check it
// ---------------------------------------------------------------------------
function showCheck() {
  const pattern = pending.pattern;
  const r = pending.res = P.resolve(pattern, pending.size);
  $('checkTitle').textContent = pattern.title;
  const parts = [
    plural(r.totals.baseSections, 'section', 'sections'),
    plural(r.totals.rows, 'row', 'rows'),
    plural(r.totals.measures, 'measure step', 'measure steps'),
  ].join(', ');
  $('checkSummary').textContent = (r.size !== null ? `Size ${r.size} · ` : '') + parts;

  const flags = P.flagsFor(pattern, r);
  const notes = $('checkNotesList');
  notes.replaceChildren();
  flags.forEach((f) => notes.appendChild(el('li', null, f.where ? `${f.where}: ${f.text}` : f.text)));
  $('checkNotes').classList.toggle('hidden', flags.length === 0);

  const list = $('checkList');
  list.replaceChildren();
  r.sections.filter((sec) => sec.copy === 1).forEach((sec, i) => {
    const w = rowWords(sec.worked);
    const card = el('details', 'sec');
    if (i === 0) card.open = true;
    const summary = el('summary');
    const dot = el('span', 'swatchdot');
    dot.style.background = yarn(sec.colour);
    summary.appendChild(dot);
    summary.appendChild(el('span', 'sec-name', sec.copies > 1 ? `${sec.name} × ${sec.copies}` : sec.name));
    summary.appendChild(el('span', 'sec-count', sec.rows > 0 ? plural(sec.rows, w.row, w.rows) : plural(sec.steps.length, 'step', 'steps')));
    card.appendChild(summary);

    const blk = el('div', 'blk');
    let rowNo = 0;
    sec.steps.forEach((step) => {
      const row = el('div', 'blk-row');
      let label = step.label;
      if (step.type === 'row') {
        const from = rowNo + 1;
        rowNo += step.count;
        if (!label) label = step.count > 1 ? `${w.Row}s ${from}–${rowNo}` : `${w.Row} ${from}`;
      } else if (!label) label = step.type === 'measure' ? `To ${amount(step.length)} ${r.units}` : 'Step';
      row.appendChild(el('span', 'lab', label));
      const body = el('span', 'body');
      body.appendChild(el('span', null, step.text));
      if (step.checklist) {
        const ul = el('ul');
        step.checklist.forEach((item) => ul.appendChild(el('li', null, item)));
        body.appendChild(ul);
      }
      const plain = [];
      if (step.count > 1) plain.push(`${step.count} ${w.rows}`);
      if (step.side) plain.push(step.side === 'RS' ? 'Right side' : 'Wrong side');
      if (step.group) plain.push(`${step.group.name}, pass ${step.group.pass} of ${step.group.of}`);
      if (step.estimate) plain.push(`About ${plural(step.estimate, w.row, w.rows)} at your gauge`);
      if (plain.length) body.appendChild(el('span', 'meta plain', plain.join(' · ')));
      const facts = [];
      if (step.stitchesAfter !== null) facts.push(`Ends with ${step.stitchesAfter} sts`);
      if (step.needle) facts.push(`Change to ${needleText(step.needle, r)}`);
      if (facts.length) body.appendChild(el('span', 'meta', facts.join(' · ')));
      if (step.flag) body.appendChild(el('span', 'warn', `⚠ ${step.flag}`));
      row.appendChild(body);
      blk.appendChild(row);
    });
    card.appendChild(blk);
    list.appendChild(card);
  });

  $('startBtn').textContent = r.craft === 'crochet' ? 'Start crocheting' : 'Start knitting';
  show('check');
}

function startPending() {
  if (!pending || !pending.res) return;
  if (saved && saved.mode === 'pattern' && !window.confirm('This replaces your current pattern and its progress.')) return;
  if (saved && saved.mode === 'counter' && saved.counter.row > 0 && !window.confirm('This replaces your row count.')) return;
  res = pending.res;
  saved = { v: 2, mode: 'pattern', pattern: pending.pattern, size: res.size, progress: P.startProgress() };
  pending = null;
  save();
  showTracker(false);
}

// ---------------------------------------------------------------------------
// 4. Tracker
// ---------------------------------------------------------------------------
function showTracker(fresh) {
  pending = null;
  show('tracker');
  renderTracker(fresh);
}

function renderTracker(fresh) {
  $('trackerStatus').textContent = saveFailed ? "Your phone couldn't save your place just now. It may be lost when the app closes." : '';
  $('trackerStatus').classList.toggle('hidden', !saveFailed);
  if (saved.mode === 'counter') { renderCounter(fresh); return; }

  const p = saved.progress;
  const e = res.entries[p.index];
  const sec = res.sections[e.section];
  const w = rowWords(sec.worked);
  const colour = yarn(sec.colour);
  const count = P.measureCount(res, p);
  const doneLabel = e.type === 'action' ? 'Step done' : `${w.Row} done`;

  $('trTitle').textContent = res.title;
  $('sectionsBtn').classList.remove('hidden');
  $('infoBtn').textContent = 'Pattern info';

  // Section line: colour dot, name, where it sits, needle and stitches.
  const line = $('secLine');
  line.replaceChildren();
  const dot = el('span', 'swatchdot');
  dot.style.background = colour;
  line.appendChild(dot);
  line.appendChild(el('strong', null, sec.displayName));
  line.appendChild(el('span', null, `Section ${sec.index + 1} of ${res.sections.length}`));
  if (!p.finished) {
    if (e.needle) line.appendChild(el('span', 'chip', needleText(e.needle, res)));
    const onNeedle = e.type === 'action' ? e.stitchesAfter : e.stitchesBefore;
    if (onNeedle !== null) line.appendChild(el('span', 'chip', `${onNeedle} sts`));
  }

  // The step card
  const card = $('rowcard');
  card.style.borderLeftColor = colour;
  const pills = [];
  let big = '';
  let text = '';
  if (p.finished) {
    big = 'Finished!';
    text = 'Every step of this pattern is done. Lovely work.';
  } else {
    text = e.text;
    if (e.type === 'row') {
      big = e.label || `${w.Row} ${P.rowNumberAt(res, p)}`;
      if (e.of > 1) pills.push([`${e.part} of ${e.of}`]);
    } else if (e.type === 'measure') {
      big = `Until it measures ${amount(e.length)} ${e.units}`;
    } else {
      big = e.label || 'Step';
    }
    if (e.group) pills.push([`${e.group.name} · pass ${e.group.pass} of ${e.group.of}`]);
    if (e.side) pills.push([e.side, e.side === 'RS' ? 'Right side' : 'Wrong side']);
    if (e.page) pills.push([`PDF page ${e.page}`]);
  }
  $('rowNum').textContent = big;
  $('rowText').textContent = text;
  const pillBox = $('pills');
  pillBox.replaceChildren();
  pills.forEach(([label, spoken]) => {
    const pill = el('span', 'pill', label);
    if (spoken) { pill.setAttribute('aria-label', spoken); pill.title = spoken; }
    pillBox.appendChild(pill);
  });
  pillBox.classList.toggle('hidden', pills.length === 0);

  const isMeasure = !p.finished && e.type === 'measure';
  $('measureBox').classList.toggle('hidden', !isMeasure);
  if (isMeasure) {
    $('measureCount').textContent = `${plural(count, w.row, w.rows)} so far`;
    $('measureEstimate').textContent = e.estimate ? `About ${plural(e.estimate, w.row, w.rows)} at your gauge` : '';
  }
  renderChecklist(p.finished ? null : e);
  const ends = !p.finished && e.stitchesAfter !== null;
  $('rowEnd').textContent = ends ? `Ends with ${e.stitchesAfter} sts` : '';
  $('rowEnd').classList.toggle('hidden', !ends);
  const flagged = !p.finished && !!e.flag;
  $('flagLine').textContent = flagged ? `⚠ ${e.flag}` : '';
  $('flagLine').classList.toggle('hidden', !flagged);
  if (fresh) replay(card);

  // Stitch counter (rows and measure steps)
  const counting = !p.finished && e.type !== 'action';
  const target = counting && e.stitchesBefore > 0 ? e.stitchesBefore : null;
  $('stitchBox').classList.toggle('hidden', !counting);
  if (counting) {
    $('stCount').textContent = target ? `${p.stitch} / ${target}` : String(p.stitch);
    $('stLabel').textContent = target
      ? (p.stitch >= target ? `All stitches worked, tap ${doneLabel}` : 'Tap for each stitch (optional)')
      : `Stitches this ${w.row}. Tap for each one (optional)`;
    $('stPlus').setAttribute('aria-label', target ? `Add one stitch. ${p.stitch} of ${target} worked.` : `Add one stitch. ${p.stitch} worked.`);
    $('stMinus').disabled = p.stitch <= 0;
  }

  // Buttons
  $('backBtn').disabled = !P.canGoBack(res, p);
  $('nextBtn').disabled = p.finished;
  $('nextBtn').textContent = p.finished ? 'All done' : doneLabel;
  $('moveOnBtn').classList.toggle('hidden', !isMeasure);
  if (isMeasure) $('moveOnBtn').textContent = `Reached ${amount(e.length)} ${e.units}, move on`;

  // Up next
  const up = $('upNext');
  up.replaceChildren();
  if (!p.finished) {
    const next = res.entries[p.index + 1];
    if (!next) up.appendChild(el('b', null, 'This is the last step.'));
    else {
      const nextSec = res.sections[next.section];
      up.appendChild(el('b', null, next.section !== e.section ? `Next section, ${nextSec.displayName}: ` : 'Up next: '));
      up.appendChild(document.createTextNode(next.text));
    }
  }

  drawSwatch(P.swatchOf(res, p), fresh);
  drawProgress(p, e, sec, w);
  if (fresh) say(p.finished ? 'Finished! Every step of this pattern is done.' : `${sec.displayName}. ${big}. ${text}`);
}

function renderChecklist(entry) {
  const list = $('checklist');
  list.replaceChildren();
  const items = entry && entry.checklist;
  list.classList.toggle('hidden', !items);
  if (!items) return;
  const ticks = saved.progress.ticks[entry.key] || [];
  items.forEach((item, i) => {
    const li = el('li');
    const label = el('label');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = ticks[i] === true;
    // Ticks are saved straight away. The list isn't redrawn, so the box you tapped keeps focus.
    box.addEventListener('change', () => {
      saved.progress = P.toggleTick(res, saved.progress, i);
      save();
    });
    label.appendChild(box);
    label.appendChild(el('span', null, item));
    li.appendChild(label);
    list.appendChild(li);
  });
}

function replay(node) {
  node.classList.remove('fresh');
  void node.offsetWidth; // lets the fade-in play again
  node.classList.add('fresh');
}

// ---------- The knitted swatch: finished rows stack up like real fabric ----------
const COLS = 15;
const SW = 320 / COLS;
const RH = 13;

function stitchPath(x, y) { // one knit stitch is a little V: two slightly curved strokes
  const r = (n) => Math.round(n * 100) / 100;
  return `M${r(x + SW * 0.1)} ${y + 1} Q${r(x + SW * 0.24)} ${r(y + RH * 0.62)} ${r(x + SW * 0.5)} ${y + RH + 1}`
       + ` M${r(x + SW * 0.9)} ${y + 1} Q${r(x + SW * 0.76)} ${r(y + RH * 0.62)} ${r(x + SW * 0.5)} ${y + RH + 1}`;
}
function drawRow(svg, y, colour, { filled = COLS, faint = false, fresh = false } = {}) {
  const g = svgEl('g', fresh ? { class: 'fresh' } : {});
  for (let c = 0; c < COLS; c++) {
    const on = COLS - 1 - c < filled; // fills right to left, like working across the row
    const stitch = svgEl('path', {
      d: stitchPath(c * SW, y), fill: 'none', 'stroke-linecap': 'round',
      stroke: on || faint ? colour : 'var(--text-dim)',
      'stroke-width': on && !faint ? 3.4 : 1.6,
      opacity: faint ? 0.3 : on ? 1 : 0.5,
    });
    if (!on && !faint) stitch.setAttribute('stroke-dasharray', '2 3');
    g.appendChild(stitch);
  }
  svg.appendChild(g);
}
function drawSwatch(sw, fresh) {
  const svg = $('swatch');
  svg.replaceChildren();
  const rows = sw.done.length + (sw.current ? 1 : 0) + sw.upcoming.length;
  const height = Math.max(rows, 1) * RH + 22 + (sw.current ? 8 : 0) + (sw.castOnVisible ? 8 : 0);
  svg.setAttribute('viewBox', `0 0 320 ${height}`);
  let y = 8;
  // Newest on top: rows still to come (faint), then the row on the needle, then finished rows.
  [...sw.upcoming].reverse().forEach((c) => { drawRow(svg, y, yarn(c), { faint: true }); y += RH; });
  if (sw.current) {
    const colour = yarn(sw.current.colour);
    svg.appendChild(svgEl('rect', { x: 0, y: y - 3, width: 320, height: RH + 8, rx: 7, fill: colour, opacity: 0.14 }));
    drawRow(svg, y, colour, { filled: sw.current.filled });
    // the needle, holding the row you're working
    svg.appendChild(svgEl('line', { x1: 4, y1: y - 1, x2: 304, y2: y - 1, stroke: 'var(--text)', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.75 }));
    svg.appendChild(svgEl('circle', { cx: 310, cy: y - 1, r: 6, fill: 'var(--text)', opacity: 0.75 }));
    y += RH + 8;
  }
  [...sw.done].reverse().forEach((c, k) => { drawRow(svg, y, yarn(c), { fresh: fresh && k === 0 }); y += RH; });
  if (sw.castOnVisible) { // the cast-on edge, a dotted line under the first row
    svg.appendChild(svgEl('path', { d: `M4 ${y + 4} L316 ${y + 4}`, stroke: 'var(--text-dim)', 'stroke-width': 2, 'stroke-dasharray': '1 5', 'stroke-linecap': 'round' }));
  }
  svg.setAttribute('aria-label', sw.total === 0 ? 'No rows finished yet' : `${plural(sw.total, 'row', 'rows')} finished`);
}

// ---------- Progress bar: one segment per section, sized by its planned rows ----------
function drawProgress(p, e, sec, w) {
  const pr = P.progressOf(res, p);
  const bar = $('overall');
  bar.replaceChildren();
  bar.classList.remove('hidden');
  res.sections.forEach((s, i) => {
    const seg = el('span', 'seg');
    seg.style.flex = `${Math.max(1, s.plannedRows)} 1 0`;
    const fill = el('i');
    fill.style.width = `${pr.sections[i].fraction * 100}%`;
    fill.style.background = yarn(s.colour);
    seg.appendChild(fill);
    bar.appendChild(seg);
  });
  bar.setAttribute('aria-label', `${pr.percent}% of the pattern done. Open the list of sections.`);
  $('overallLeft').textContent = `${pr.percent}% of the pattern`;
  const mine = pr.sections[sec.index];
  $('overallRight').textContent = p.finished ? 'All done'
    : mine.planned > 0 ? `${mine.done} of ${mine.planned} ${mine.planned === 1 ? w.row : w.rows} in this section`
    : `Step ${Math.min(mine.stepsDone + 1, mine.steps)} of ${mine.steps} in this section`;
}

// ---------- Plain counter mode (no pattern) ----------
function renderCounter(fresh) {
  const c = saved.counter;
  $('trTitle').textContent = 'Row counter';
  $('sectionsBtn').classList.add('hidden');
  $('infoBtn').textContent = 'Add a pattern';
  $('secLine').replaceChildren();
  $('rowcard').style.borderLeftColor = yarn(0);
  $('rowNum').textContent = `Row ${c.row + 1}`;
  $('rowText').textContent = c.row === 0 ? 'Tap "Row done" at the end of each row.' : `${plural(c.row, 'row', 'rows')} finished so far.`;
  for (const id of ['pills', 'measureBox', 'checklist', 'rowEnd', 'flagLine', 'moveOnBtn']) $(id).classList.add('hidden');
  if (fresh) replay($('rowcard'));
  $('stitchBox').classList.remove('hidden');
  $('stCount').textContent = String(c.stitch);
  $('stLabel').textContent = 'Stitches this row. Tap for each one (optional)';
  $('stPlus').setAttribute('aria-label', `Add one stitch. ${c.stitch} worked.`);
  $('stMinus').disabled = c.stitch <= 0;
  $('backBtn').disabled = c.row === 0;
  $('nextBtn').disabled = false;
  $('nextBtn').textContent = 'Row done';
  $('upNext').replaceChildren();
  const done = Array.from({ length: Math.min(c.row, 9) }, () => 0);
  drawSwatch({ total: c.row, done, castOnVisible: c.row <= 9, current: { colour: 0, filled: c.stitch ? ((c.stitch - 1) % COLS) + 1 : 0 }, upcoming: [] }, fresh);
  $('overall').replaceChildren();
  $('overall').classList.add('hidden');
  $('overallLeft').textContent = `${plural(c.row, 'row', 'rows')} done`;
  $('overallRight').textContent = '';
  if (fresh) say(`Row ${c.row + 1}`);
}

// ---------- Moving ----------
function move(change, { fresh = true, vibrate = 0 } = {}) {
  if (vibrate) buzz(vibrate);
  if (saved.mode === 'pattern') saved.progress = change(res, saved.progress);
  save();
  renderTracker(fresh);
}
function onDone() {
  if (saved.mode === 'counter') {
    buzz(25);
    saved.counter = { row: Math.min(saved.counter.row + 1, 999999), stitch: 0 };
    save();
    renderTracker(true);
    return;
  }
  move(P.rowDone, { vibrate: 25 });
}
function onBack() {
  if (saved.mode === 'counter') {
    saved.counter = { row: Math.max(0, saved.counter.row - 1), stitch: 0 };
    save();
    renderTracker(false);
    return;
  }
  move(P.back, { fresh: false });
}
function onStitch(by) {
  if (by > 0) buzz(8);
  if (saved.mode === 'counter') {
    saved.counter.stitch = Math.max(0, Math.min(99999, saved.counter.stitch + by));
    save();
    renderTracker(false);
    return;
  }
  move((r, p) => P.addStitch(r, p, by), { fresh: false });
}
function onStartOver() {
  if (saved.mode === 'counter') {
    if (!window.confirm('Set the row count back to zero?')) return;
    saved.counter = { row: 0, stitch: 0 };
  } else {
    if (!window.confirm('Start this pattern again from the first step? Your place in it will be cleared.')) return;
    saved.progress = P.startProgress();
  }
  save();
  renderTracker(true);
}
function startCounter() {
  clearProblem();
  if (saved && saved.mode === 'pattern' && !window.confirm('This replaces your current pattern and its progress.')) return;
  saved = { v: 2, mode: 'counter', counter: { row: 0, stitch: 0 } };
  res = null;
  save();
  showTracker(false);
}

// ---------------------------------------------------------------------------
// Pop-up sheets: Sections, Pattern info and help
// ---------------------------------------------------------------------------
let sheetOpener = null;
function openSheet(title, nodes) {
  sheetOpener = document.activeElement;
  $('sheetTitle').textContent = title;
  $('sheetBody').replaceChildren(...nodes);
  $('sheetBg').classList.remove('hidden');
  $('sheet').scrollTop = 0;
  $('sheet').focus();
}
function closeSheet() {
  if ($('sheetBg').classList.contains('hidden')) return;
  $('sheetBg').classList.add('hidden');
  $('sheetBody').replaceChildren();
  if (sheetOpener && document.contains(sheetOpener) && sheetOpener.focus) sheetOpener.focus();
  sheetOpener = null;
}

function showSections() {
  if (!saved || saved.mode !== 'pattern') return;
  const p = saved.progress;
  const pr = P.progressOf(res, p);
  const here = res.entries[p.index].section;
  const nodes = [el('p', 'muted', 'Tap a section to jump to its first step.')];
  res.sections.forEach((sec, i) => {
    const state = pr.sections[i];
    const b = el('button', `sec-item${i === here && !p.finished ? ' here' : ''}`);
    b.type = 'button';
    const dot = el('span', 'swatchdot');
    dot.style.background = yarn(sec.colour);
    b.appendChild(dot);
    b.appendChild(el('span', 'sec-name', sec.displayName));
    const tick = el('span', 'tick', state.complete ? '✓' : '');
    tick.setAttribute('aria-hidden', 'true');
    b.appendChild(tick);
    const bar = el('span', 'bar');
    const fill = el('i');
    fill.style.width = `${state.fraction * 100}%`;
    fill.style.background = yarn(sec.colour);
    bar.appendChild(fill);
    b.appendChild(bar);
    b.setAttribute('aria-label', `${sec.displayName}, ${state.complete ? 'done' : `${Math.round(state.fraction * 100)}% done`}${i === here && !p.finished ? ', you are here' : ''}`);
    b.addEventListener('click', () => {
      closeSheet();
      move((r, q) => P.jumpToSection(r, q, i));
    });
    nodes.push(b);
  });
  openSheet('Sections', nodes);
}

function showInfo() {
  if (!saved || saved.mode !== 'pattern') return;
  const pattern = saved.pattern;
  const info = isObj(pattern.info) ? pattern.info : {};
  const nodes = [];
  const listBlock = (title, items) => {
    if (!Array.isArray(items) || !items.length) return;
    nodes.push(el('h3', null, title));
    const ul = el('ul');
    items.forEach((t) => ul.appendChild(el('li', null, t)));
    nodes.push(ul);
  };
  if (res.size !== null) {
    nodes.push(el('h3', null, 'Your size'));
    const row = el('div', 'size-row');
    row.appendChild(el('strong', null, res.size));
    if (res.sizes.length > 1) {
      const change = el('button', 'btn-text', 'Change size');
      change.type = 'button';
      change.addEventListener('click', () => { closeSheet(); showSizes('change'); });
      row.appendChild(change);
    }
    nodes.push(row);
  }
  listBlock('Materials', info.materials);
  listBlock(res.craft === 'crochet' ? 'Hooks' : 'Needles', info.needles);
  const g = info.gauge;
  if (isObj(g)) {
    const bits = [];
    if (g.stitches) bits.push(plural(g.stitches, 'stitch', 'stitches'));
    if (g.rows) bits.push(plural(g.rows, 'row', 'rows'));
    let line = bits.join(' and ');
    if (line && g.over) line += ` over ${amount(g.over)} ${res.units}`;
    if (g.note) line += line ? `. ${g.note}` : g.note;
    if (line) { nodes.push(el('h3', null, 'Gauge')); nodes.push(el('p', null, line)); }
  }
  listBlock('Notes', info.notes);
  if (pattern.designer || pattern.source) {
    nodes.push(el('h3', null, 'Pattern'));
    if (pattern.designer) nodes.push(el('p', null, `Designer: ${pattern.designer}`));
    if (pattern.source) nodes.push(el('p', null, `From: ${pattern.source}`));
  }
  const other = el('button', 'btn btn-secondary', 'Open a different pattern');
  other.type = 'button';
  other.addEventListener('click', () => { closeSheet(); clearProblem(); showAdd(); });
  nodes.push(other);
  openSheet(pattern.title, nodes);
}

// ---------------------------------------------------------------------------
// Keep the screen awake while knitting
// ---------------------------------------------------------------------------
let wakeLock = null;
let wakeWanted = false;
function showWake(text, on) {
  $('wakeBtn').textContent = text;
  $('wakeBtn').setAttribute('aria-pressed', on ? 'true' : 'false');
  say(text);
}
async function requestWake() {
  wakeLock = await navigator.wakeLock.request('screen');
  wakeLock.addEventListener('release', () => {
    wakeLock = null;
    if (!wakeWanted) showWake('Keep screen on', false);
  });
}
async function toggleWake() {
  if (wakeWanted) {
    wakeWanted = false;
    try { if (wakeLock) await wakeLock.release(); } catch (e) { /* already let go */ }
    wakeLock = null;
    showWake('Keep screen on', false);
    return;
  }
  if (!('wakeLock' in navigator)) { showWake("This phone can't keep the screen on", false); return; }
  try {
    await requestWake();
    wakeWanted = true;
    showWake('Screen stays on ✓', true);
  } catch (e) {
    showWake("The screen can't be kept on right now", false);
  }
}
// The phone lets go of the screen when you switch apps; ask again when you come back.
document.addEventListener('visibilitychange', () => {
  if (wakeWanted && !wakeLock && document.visibilityState === 'visible') {
    requestWake().catch(() => { wakeWanted = false; showWake('Keep screen on', false); });
  }
});

// ---------------------------------------------------------------------------
// Wiring and start-up
// ---------------------------------------------------------------------------
function wire() {
  $('openFileBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    openFile(file);
  });
  $('pasteOpenBtn').addEventListener('click', () => {
    const text = $('pasteInput').value;
    if (!text.trim()) { showProblem('Nothing to open yet', ['Paste the copied pattern file into the box first.']); return; }
    openText(text);
  });
  $('helpBtn').addEventListener('click', showHelp);
  $('counterBtn').addEventListener('click', startCounter);
  $('backToKnittingBtn').addEventListener('click', () => { clearProblem(); showTracker(false); });

  $('sizeCancelBtn').addEventListener('click', () => {
    if (sizeMode === 'change') showTracker(false);
    else { pending = null; showAdd(); }
  });
  $('startBtn').addEventListener('click', startPending);
  $('differentFileBtn').addEventListener('click', () => { pending = null; showAdd(); });

  $('nextBtn').addEventListener('click', onDone);
  $('backBtn').addEventListener('click', onBack);
  $('moveOnBtn').addEventListener('click', () => move(P.reachedIt, { vibrate: 25 }));
  $('stPlus').addEventListener('click', () => onStitch(1));
  $('stMinus').addEventListener('click', () => onStitch(-1));
  $('sectionsBtn').addEventListener('click', showSections);
  $('overall').addEventListener('click', showSections);
  $('wakeBtn').addEventListener('click', toggleWake);
  $('infoBtn').addEventListener('click', () => {
    if (saved.mode === 'counter') { clearProblem(); showAdd(); } else showInfo();
  });
  $('resetBtn').addEventListener('click', onStartOver);

  $('sheetClose').addEventListener('click', closeSheet);
  $('sheetBg').addEventListener('click', (event) => { if (event.target === $('sheetBg')) closeSheet(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSheet(); });
}

function registerOfflineHelper() {
  if (!('serviceWorker' in navigator)) return;
  const hadOne = !!navigator.serviceWorker.controller;
  let reloaded = false;
  // When a new version of the app takes over, show it straight away (your place is already saved).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadOne || reloaded || pending || $('pasteInput').value) return;
    reloaded = true;
    window.location.reload();
  });
  navigator.serviceWorker.register('./sw.js').catch(() => { /* the app still works, just not offline */ });
}

function start() {
  removeVersion1Data();
  restore();
  wire();
  if (saved) showTracker(false);
  else showAdd();
  takeSharedFile();
  registerOfflineHelper();
}

start();
