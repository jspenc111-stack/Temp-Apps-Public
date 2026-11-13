// Row Tracker v3: screens, buttons and saving.
// Quick projects: logic in quick.js. Pattern-file projects: logic in pattern.js.
// Pattern files and saved data are untrusted: every word goes on screen with textContent.

import * as P from './pattern.js';
import * as Q from './quick.js';

const KEY = 'rowtracker.v3';
const OLD_KEYS = ['rowtracker.v2', 'row-tracker-v2'];   // earlier versions; v2 is migrated, v1 removed
const SHARED_CACHE = 'row-tracker-shared';
const SHARED_FILE = './shared-pattern';
const SVG_NS = 'http://www.w3.org/2000/svg';
const YARN = ['var(--y0)', 'var(--y1)', 'var(--y2)', 'var(--y3)', 'var(--y4)'];

const $ = (id) => document.getElementById(id);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ---------------------------------------------------------------------------
// State and saving
// ---------------------------------------------------------------------------
let store = { v: 3, projects: [], activeId: null, settings: { haptics: true, wake: false } };
let active = null;      // the open project (an entry of store.projects)
let res = null;         // for pattern projects: the pattern worked out for the chosen size
let pending = null;     // a pattern file opened but not yet started
let locked = false;
let saveFailed = false;
let screenStack = [];

function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { /* no storage */ }
  if (raw) {
    try { const data = JSON.parse(raw); if (isObj(data) && Array.isArray(data.projects)) store = repair(data); } catch (e) { /* start fresh */ }
  } else {
    migrateV2();
  }
  for (const k of OLD_KEYS) { try { localStorage.removeItem(k); } catch (e) { /* nothing */ } }
}
function repair(data) {
  const projects = data.projects.map(repairProject).filter(Boolean);
  const settings = isObj(data.settings) ? data.settings : {};
  return {
    v: 3, projects,
    activeId: projects.some((p) => p.id === data.activeId) ? data.activeId : null,
    settings: { haptics: settings.haptics !== false, wake: settings.wake === true },
  };
}
function repairProject(p) {
  if (!isObj(p)) return null;
  const base = { id: typeof p.id === 'string' ? p.id : uid(), updated: Number(p.updated) || Date.now(), notes: String(p.notes || '').slice(0, 5000) };
  if (p.kind === 'pattern') {
    const check = P.validate(p.pattern);
    if (!check.ok) return null;
    let r;
    try { r = P.resolve(p.pattern, p.size); } catch (e) { return null; }
    return { ...base, kind: 'pattern', name: String(p.name || p.pattern.title).slice(0, 60), pattern: p.pattern, size: r.size, progress: P.restoreProgress(r, p.progress) };
  }
  const q = Q.restoreQuick(p);
  return q ? { ...base, ...q } : null;
}
function migrateV2() {
  let old = null;
  try { old = JSON.parse(localStorage.getItem('rowtracker.v2') || 'null'); } catch (e) { return; }
  if (!isObj(old)) return;
  if (old.mode === 'pattern' && isObj(old.pattern)) {
    const p = repairProject({ kind: 'pattern', pattern: old.pattern, size: old.size, progress: old.progress, name: old.pattern.title });
    if (p) { store.projects.push(p); store.activeId = p.id; }
  } else if (old.mode === 'counter') {
    const q = { ...Q.newQuick({ name: 'Row count' }), id: uid(), updated: Date.now(), notes: '' };
    q.pos.row = Number(old.row) || 0;
    store.projects.push(q); store.activeId = q.id;
  }
  save();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); saveFailed = false; }
  catch (e) { if (!saveFailed) toast("Couldn't save. Your phone may be out of space."); saveFailed = true; }
}
function touch() { if (active) active.updated = Date.now(); save(); }
function buzz(ms) { if (!store.settings.haptics) return; try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* none */ } }

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
const SCREENS = ['home', 'new', 'setup', 'file', 'size', 'review', 'track'];
function show(id, { push = true } = {}) {
  if (push && screenStack[screenStack.length - 1] !== id) screenStack.push(id);
  for (const s of SCREENS) $(s).hidden = s !== id;
  window.scrollTo(0, 0);
  if (id === 'home') renderHome();
  if (id === 'track') { renderTrack(false); keepAwake(); } else releaseWake();
}
function goBack() {
  screenStack.pop();
  const prev = screenStack.pop() || 'home';
  show(prev);
}
let toastTimer = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------------------------------------------------------------------------
// HOME
// ---------------------------------------------------------------------------
function describe(p) {
  if (p.kind === 'pattern') {
    let r; try { r = P.resolve(p.pattern, p.size); } catch (e) { return { fraction: 0, line: 'Pattern file' }; }
    const prog = P.progressOf(r, p.progress);
    const sec = r.sections[r.entries[p.progress.index].section];
    const line = p.progress.finished ? 'Finished' : `${sec.displayName} · ${prog.rowsWorked} rows worked`;
    return { fraction: prog.percent / 100, line };
  }
  const prog = Q.progress(p);
  const s = Q.section(p);
  const line = p.done ? 'Finished' : `${s.name} · ${Q.rowWord(p).toLowerCase()} ${Q.nextRow(p)}${s.target ? ` of ${s.target}` : ''}`;
  return { fraction: prog.fraction, line };
}
function renderHome() {
  const list = $('projectList'); list.replaceChildren();
  const projects = [...store.projects].sort((a, b) => b.updated - a.updated);
  $('homeEmpty').hidden = projects.length > 0;
  for (const p of projects) {
    const d = describe(p);
    const card = el('button', 'card');
    const name = el('div', 'name'); name.appendChild(el('span', null, p.name));
    name.appendChild(el('span', 'muted small', p.kind === 'pattern' ? 'pattern' : p.craft));
    card.appendChild(name);
    card.appendChild(el('div', 'meta', `${d.line} · ${Q.ago(p.updated)}`));
    const mini = el('div', 'mini'); const fill = el('i'); fill.style.width = `${Math.round(d.fraction * 100)}%`; mini.appendChild(fill); card.appendChild(mini);
    card.addEventListener('click', () => openProject(p.id));
    list.appendChild(card);
  }
}
function openProject(id) {
  const p = store.projects.find((x) => x.id === id);
  if (!p) return;
  active = p; store.activeId = id; res = null;
  if (p.kind === 'pattern') { try { res = P.resolve(p.pattern, p.size); } catch (e) { toast('This pattern could not be opened.'); return; } }
  locked = false; $('lockToggle').checked = false;
  save();
  show('track');
}

// ---------------------------------------------------------------------------
// QUICK SETUP form
// ---------------------------------------------------------------------------
let editing = null; // project being edited, or null for new
function partRow(sec = {}) {
  const part = el('div', 'part');
  const head = el('div', 'head');
  const name = el('input'); name.type = 'text'; name.maxLength = 40; name.placeholder = 'Part name, e.g. Cuff'; name.value = sec.name || ''; name.className = 'p-name';
  const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove this part');
  x.addEventListener('click', () => { if ($('sectionList').children.length > 1) part.remove(); else toast('Keep at least one part.'); });
  head.append(name, x); part.appendChild(head);
  const grid = el('div', 'grid');
  const target = el('label', 'field', 'Rows (blank = until it measures)'); const ti = el('input'); ti.type = 'number'; ti.min = '0'; ti.max = '100000'; ti.inputMode = 'numeric'; ti.className = 'p-target'; ti.value = sec.target || ''; target.appendChild(ti);
  const rep = el('label', 'field', 'Rows in one repeat'); const ri = el('input'); ri.type = 'number'; ri.min = '0'; ri.max = '100000'; ri.inputMode = 'numeric'; ri.className = 'p-repeat'; ri.placeholder = 'none'; ri.value = sec.repeat || ''; rep.appendChild(ri);
  grid.append(target, rep); part.appendChild(grid);
  const rems = el('div', 'rems');
  for (const r of sec.reminders || []) rems.appendChild(reminderRow(r));
  part.appendChild(rems);
  const add = el('button', 'link', '+ Add a reminder (e.g. decrease every 6 rows)'); add.type = 'button';
  add.addEventListener('click', () => { if (rems.children.length >= Q.MAX_REMINDERS) return; rems.appendChild(reminderRow({})); rems.lastChild.querySelector('input').focus(); });
  part.appendChild(add);
  return part;
}
function reminderRow(r = {}) {
  const row = el('div', 'reminder-row');
  const text = el('input'); text.type = 'text'; text.maxLength = 120; text.placeholder = 'What to do'; text.value = r.text || ''; text.className = 'r-text';
  const sel = el('select'); sel.className = 'r-kind';
  sel.append(new Option('every', 'every'), new Option('at row', 'at'));
  sel.value = r.at ? 'at' : 'every';
  const n = el('input'); n.type = 'number'; n.min = '1'; n.max = '100000'; n.inputMode = 'numeric'; n.className = 'r-n'; n.value = r.every || r.at || ''; n.placeholder = 'N';
  const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove reminder'); x.addEventListener('click', () => row.remove());
  row.append(text, sel, n, x);
  return row;
}
function readSetup() {
  const sections = [...$('sectionList').children].map((part) => ({
    name: part.querySelector('.p-name').value,
    target: part.querySelector('.p-target').value,
    repeat: part.querySelector('.p-repeat').value,
    reminders: [...part.querySelectorAll('.reminder-row')].map((row) => {
      const kind = row.querySelector('.r-kind').value;
      const n = row.querySelector('.r-n').value;
      return { text: row.querySelector('.r-text').value, [kind]: n };
    }),
  }));
  return { name: $('setupName').value, craft: $('setupForm').craft.value, sections };
}
function openSetup(project = null, { counterOnly = false } = {}) {
  editing = project;
  $('setupTitle').textContent = project ? 'Edit project' : counterOnly ? 'Just count rows' : 'Quick setup';
  $('setupSave').textContent = project ? 'Save changes' : 'Start knitting';
  $('setupName').value = project ? project.name : '';
  $('setupForm').craft.value = project ? project.craft : 'knit';
  const list = $('sectionList'); list.replaceChildren();
  const secs = project ? project.sections : counterOnly ? [{ name: 'Rows' }] : [{ name: '' }];
  for (const s of secs) list.appendChild(partRow(s));
  show('setup');
  if (!project) $('setupName').focus();
}
function submitSetup(e) {
  e.preventDefault();
  const form = readSetup();
  if (!form.name.trim()) { $('setupName').focus(); return; }
  if (editing) {
    const fresh = Q.newQuick(form);
    editing.name = fresh.name; editing.craft = fresh.craft; editing.sections = fresh.sections;
    const kept = Q.restoreQuick(editing);
    Object.assign(editing, kept);
    touch(); openProject(editing.id); toast('Saved.');
    return;
  }
  const q = { ...Q.newQuick(form), id: uid(), updated: Date.now(), notes: '' };
  store.projects.push(q);
  openProject(q.id);
}

// ---------------------------------------------------------------------------
// PATTERN FILE: open → size → review → project
// ---------------------------------------------------------------------------
function fileStatus(message, problems = []) {
  const box = $('fileStatus'); box.replaceChildren(); box.hidden = false;
  box.appendChild(el('b', null, message));
  if (problems.length) { const ul = el('ul'); for (const p of problems.slice(0, 5)) ul.appendChild(el('li', null, p)); box.appendChild(ul); }
}
function openText(text, file = {}) {
  const r = P.readPatternText(text, file);
  if (!r.ok) { fileStatus(r.message, r.problems); return; }
  $('fileStatus').hidden = true;
  pending = { pattern: r.pattern, size: null, res: null };
  const sizes = Array.isArray(r.pattern.sizes) ? r.pattern.sizes : [];
  if (sizes.length > 1) { renderSize(); show('size'); } else { pickSize(sizes[0] || null); }
}
function renderSize() {
  const p = pending.pattern;
  $('sizeIntro').textContent = `${p.title}${p.designer ? `, by ${p.designer}` : ''}. Which size are you making?`;
  const list = $('sizeList'); list.replaceChildren();
  for (const s of p.sizes) { const b = el('button', 'card'); b.appendChild(el('div', 'name', s)); b.addEventListener('click', () => pickSize(s)); list.appendChild(b); }
}
function pickSize(size) {
  try { pending.res = P.resolve(pending.pattern, size); } catch (e) { fileStatus("This file can't be opened", [e.message]); show('file'); return; }
  pending.size = pending.res.size;
  renderReview(); show('review');
}
function renderReview() {
  const r = pending.res;
  $('reviewTitle').textContent = r.title;
  $('reviewSummary').textContent = `${r.size ? `Size ${r.size}. ` : ''}${r.totals.baseSections} section${r.totals.baseSections === 1 ? '' : 's'}, ${r.totals.rows} rows${r.totals.measures ? `, ${r.totals.measures} "until it measures" step${r.totals.measures === 1 ? '' : 's'}` : ''}. Check it reads right, then start.`;
  const flags = P.flagsFor(pending.pattern, r);
  const fbox = $('reviewFlags'); fbox.replaceChildren(); fbox.hidden = !flags.length;
  if (flags.length) { fbox.appendChild(el('b', null, 'Worth checking against the PDF')); const ul = el('ul'); for (const f of flags) ul.appendChild(el('li', null, f.where ? `${f.where}: ${f.text}` : f.text)); fbox.appendChild(ul); }
  const list = $('reviewList'); list.replaceChildren();
  for (const sec of r.sections) {
    if (sec.copy !== 1) continue;
    const d = el('details', 'sec'); const sum = el('summary');
    const dot = el('span', 'dot'); dot.style.background = YARN[sec.colour];
    sum.append(dot, el('span', null, sec.copies > 1 ? `${sec.name} × ${sec.copies}` : sec.name), el('span', 'count', `${sec.rows} rows`));
    d.appendChild(sum);
    let n = 0;
    for (const step of sec.steps) {
      n += step.type === 'row' ? step.count : 0;
      const row = el('div', 'step');
      row.appendChild(el('span', 'lab', step.label || (step.type === 'row' ? `Row ${n}` : step.type === 'measure' ? 'Until' : 'Step')));
      const body = el('div'); body.appendChild(el('div', null, step.text));
      if (step.stitchesAfter != null) body.appendChild(el('div', 'st', `${step.stitchesAfter} sts`));
      if (step.needle) body.appendChild(el('div', 'st', `Needle: ${step.needle}`));
      if (step.flag) body.appendChild(el('div', 'fl', `⚠ ${step.flag}`));
      row.appendChild(body); d.appendChild(row);
    }
    list.appendChild(d);
  }
}
function startPattern() {
  const p = { id: uid(), updated: Date.now(), notes: '', kind: 'pattern', name: String(pending.pattern.title).slice(0, 60), pattern: pending.pattern, size: pending.size, progress: P.startProgress() };
  store.projects.push(p); pending = null; $('pasteBox').value = '';
  screenStack = ['home'];
  openProject(p.id);
}
async function openShared() {
  const params = new URLSearchParams(location.search);
  if (!params.has('shared')) return false;
  history.replaceState(null, '', location.pathname);
  if (params.get('shared') === 'failed') { show('file'); fileStatus("The shared file couldn't be received. Try opening it from your Downloads instead."); return true; }
  try {
    const cache = await caches.open(SHARED_CACHE);
    const hit = await cache.match(SHARED_FILE);
    await caches.delete(SHARED_CACHE);
    if (!hit) throw new Error('nothing');
    const shared = await hit.json();
    screenStack = ['home', 'file']; show('file', { push: false });
    openText(shared.text, { name: shared.name, type: shared.type, size: shared.size });
  } catch (e) { show('file'); fileStatus("The shared file couldn't be received. Try opening it from your Downloads instead."); }
  return true;
}

// ---------------------------------------------------------------------------
// TRACK screen
// ---------------------------------------------------------------------------
function colourOf() {
  if (active.kind === 'pattern') return YARN[res.sections[res.entries[active.progress.index].section].colour];
  return YARN[active.pos.section % YARN.length];
}
function renderTrack(fresh) {
  if (!active) { show('home'); return; }
  $('trackName').textContent = active.name;
  const colour = colourOf();
  $('track').style.setProperty('--sec', colour);
  $('rowcard').style.borderLeftColor = colour;
  $('reminder').hidden = true;
  $('moveOnBtn').hidden = true; $('nextSectionBtn').hidden = true;
  $('checklist').hidden = true; $('rowNote').hidden = true; $('rowFlag').hidden = true;
  $('pills').replaceChildren();
  if (active.kind === 'pattern') renderPatternCard(); else renderQuickCard();
  const card = $('rowcard');
  if (fresh) { card.classList.remove('fresh'); void card.offsetWidth; card.classList.add('fresh'); }
  renderHistory();
  $('doneBtn').classList.toggle('locked', locked);
  $('wakeToggle').checked = store.settings.wake;
}
function pill(text) { $('pills').appendChild(el('span', 'pill', text)); }

function renderQuickCard() {
  const q = active;
  const s = Q.section(q);
  const sec = $('sectionBtn'); sec.textContent = `${s.name} · ${q.pos.section + 1} of ${q.sections.length}`;
  const word = Q.rowWord(q);
  const row = Q.nextRow(q);
  const complete = Q.sectionComplete(q);
  const stitchBox = $('stitchBox');
  if (q.done) {
    $('rowNum').textContent = 'Finished!';
    $('rowText').textContent = 'Every part is done. Lovely work.';
    $('doneLabel').textContent = 'All done';
    $('doneBtn').classList.add('finish'); $('doneBtn').disabled = true;
    stitchBox.hidden = true;
  } else if (complete) {
    $('rowNum').textContent = `${s.name} done`;
    $('rowText').textContent = Q.isLastSection(q) ? `All ${s.target} ${word.toLowerCase()}s worked. That was the last part.` : `All ${s.target} ${word.toLowerCase()}s worked. Next up: ${q.sections[q.pos.section + 1].name}.`;
    $('doneLabel').textContent = Q.isLastSection(q) ? 'Finish project' : `Start ${q.sections[q.pos.section + 1].name}`;
    $('doneBtn').classList.add('finish'); $('doneBtn').disabled = false;
    stitchBox.hidden = true;
  } else {
    $('rowNum').replaceChildren(); $('rowNum').append(document.createTextNode(`${word} ${row}`));
    if (s.target) $('rowNum').appendChild(el('small', null, `of ${s.target}`));
    const rep = Q.repeatInfo(q);
    if (rep) pill(`Repeat ${rep.repeatNumber}${rep.repeatsPlanned ? ` of ${rep.repeatsPlanned}` : ''} · ${word.toLowerCase()} ${rep.rowInRepeat} of ${rep.length}`);
    const due = Q.dueReminders(q);
    if (due.length) { $('reminder').hidden = false; $('reminderText').textContent = `This ${word.toLowerCase()}: ${due.map((d) => d.text).join(' · ')}`; }
    const up = Q.upcomingReminder(q);
    $('rowText').textContent = s.target ? `${s.target - q.pos.row} to go in ${s.name}.` : `${s.name}: keep going until it's long enough, then move on.`;
    if (up) { $('rowNote').hidden = false; $('rowNote').textContent = `${up.text} in ${up.inRows} ${word.toLowerCase()}${up.inRows === 1 ? '' : 's'} (${word.toLowerCase()} ${up.row})`; }
    $('doneLabel').textContent = `${word} done`;
    $('doneBtn').classList.remove('finish'); $('doneBtn').disabled = false;
    if (!s.target || !Q.isLastSection(q)) { $('nextSectionBtn').hidden = false; $('nextSectionBtn').textContent = Q.isLastSection(q) ? 'Finish project' : `Move on to ${q.sections[q.pos.section + 1].name}`; }
    stitchBox.hidden = false;
    $('stCount').textContent = String(q.stitch);
    $('stLabel').textContent = 'stitches this row (optional, tap per stitch)';
    $('stMinus').disabled = q.stitch === 0;
  }
  drawSwatch(quickSwatch(q));
  const prog = Q.progress(q);
  const left = q.done ? 'All done' : prog.hasOpen ? `Part ${q.pos.section + 1} of ${q.sections.length}` : `${Math.round(prog.fraction * 100)}% of the project`;
  drawBar(prog.sections.map((s2, i) => ({ fraction: s2.complete ? 1 : s2.planned ? Math.min(1, s2.done / s2.planned) : 0, weight: s2.open ? Math.max(s2.planned, 10) : s2.planned, colour: YARN[i % YARN.length] })), left, `${prog.rowsDone} ${word.toLowerCase()}s worked`);
}
function quickSwatch(q) {
  const prog = Q.progress(q);
  const done = [];
  prog.sections.forEach((s, i) => { for (let k = 0; k < s.done; k++) done.push(i % YARN.length); });
  const current = q.done || Q.sectionComplete(q) ? null : { colour: q.pos.section % YARN.length, filled: q.stitch ? ((q.stitch - 1) % 15) + 1 : 0 };
  return { done: done.slice(-6), castOnVisible: done.length <= 6, current, upcoming: current ? [q.pos.section % YARN.length] : [] };
}

function renderPatternCard() {
  const p = active.progress;
  const e = res.entries[p.index];
  const sec = res.sections[e.section];
  $('sectionBtn').textContent = `${sec.displayName} · ${sec.index + 1} of ${res.sections.length}${e.needle ? ` · ${e.needle}` : ''}`;
  const word = sec.worked === 'round' ? 'Round' : 'Row';
  const stitchBox = $('stitchBox');
  $('doneBtn').classList.remove('finish'); $('doneBtn').disabled = false;
  if (p.finished) {
    $('rowNum').textContent = 'Finished!'; $('rowText').textContent = 'Every row of this pattern is done. Lovely work.';
    $('doneLabel').textContent = 'All done'; $('doneBtn').classList.add('finish'); $('doneBtn').disabled = true;
    stitchBox.hidden = true;
  } else {
    const n = P.rowNumberAt(res, p);
    if (e.type === 'row') {
      $('rowNum').replaceChildren(); $('rowNum').append(document.createTextNode(e.label || `${word} ${n}`));
      if (e.side) $('rowNum').appendChild(el('small', null, e.side));
      if (e.of > 1) pill(`${e.part} of ${e.of}`);
      $('doneLabel').textContent = `${word} done`;
    } else if (e.type === 'measure') {
      const count = P.measureCount(res, p);
      $('rowNum').textContent = `Until it measures ${e.length} ${e.units}`;
      pill(`${count} ${word.toLowerCase()}${count === 1 ? '' : 's'} so far`);
      if (e.estimate) pill(`about ${e.estimate} at your gauge`);
      $('doneLabel').textContent = `${word} done`;
      $('moveOnBtn').hidden = false; $('moveOnBtn').textContent = `Reached ${e.length} ${e.units}, move on`;
    } else {
      $('rowNum').textContent = e.label || 'Step';
      $('doneLabel').textContent = 'Step done';
    }
    if (e.group) pill(`${e.group.name} · pass ${e.group.pass}${e.group.of ? ` of ${e.group.of}` : ''}`);
    if (e.needleChange) pill(`Switch to ${e.needleChange}`);
    $('rowText').textContent = e.text;
    if (e.stitchesAfter != null) { $('rowNote').hidden = false; $('rowNote').textContent = `Ends with ${e.stitchesAfter} stitches`; }
    if (e.flag) { $('rowFlag').hidden = false; $('rowFlag').textContent = `⚠ ${e.flag}`; }
    if (e.checklist) {
      const ul = $('checklist'); ul.replaceChildren(); ul.hidden = false;
      const ticks = p.ticks[e.key] || [];
      e.checklist.forEach((item, i) => {
        const li = el('li'); const lab = el('label'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!ticks[i];
        cb.addEventListener('change', () => { active.progress = P.toggleTick(res, active.progress, i); touch(); });
        lab.append(cb, el('span', null, item)); li.appendChild(lab); ul.appendChild(li);
      });
    }
    stitchBox.hidden = e.type === 'action';
    $('stCount').textContent = e.stitchesBefore ? `${p.stitch} / ${e.stitchesBefore}` : String(p.stitch);
    $('stLabel').textContent = e.stitchesBefore && p.stitch >= e.stitchesBefore ? 'all stitches worked' : 'stitches this row (optional)';
    $('stMinus').disabled = p.stitch === 0;
  }
  const prog = P.progressOf(res, p);
  drawSwatch(P.swatchOf(res, p, { maxDone: 6, maxUpcoming: 1 }));
  drawBar(res.sections.map((s) => ({ fraction: prog.sections[s.index].fraction, weight: Math.max(1, s.plannedRows), colour: YARN[s.colour] })), p.finished ? 'All done' : `${prog.percent}% of the pattern`, `${prog.rowsWorked} rows worked`);
}

// ---- swatch and bar ----
const COLS = 15, SW = 320 / COLS, RH = 12;
function vPath(x, y) {
  const w = SW, h = RH;
  return `M${x + w * 0.1} ${y + 1} Q${x + w * 0.24} ${y + h * 0.62} ${x + w * 0.5} ${y + h + 1} M${x + w * 0.9} ${y + 1} Q${x + w * 0.76} ${y + h * 0.62} ${x + w * 0.5} ${y + h + 1}`;
}
function drawRowOfVs(svg, y, colour, { fill = null, faint = false } = {}) {
  const g = document.createElementNS(SVG_NS, 'g');
  for (let c = 0; c < COLS; c++) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', vPath(c * SW, y));
    const filled = fill == null ? true : (COLS - 1 - c) < fill;
    path.setAttribute('stroke', filled ? colour : 'var(--dim)');
    path.setAttribute('stroke-width', filled ? '3.2' : '1.5');
    path.setAttribute('stroke-linecap', 'round'); path.setAttribute('fill', 'none');
    path.setAttribute('opacity', faint ? '0.2' : filled ? '1' : '0.4');
    if (!filled && !faint) path.setAttribute('stroke-dasharray', '2 3');
    g.appendChild(path);
  }
  svg.appendChild(g);
}
function drawSwatch(sw) {
  const svg = $('swatch'); svg.replaceChildren();
  const rows = sw.upcoming.length + (sw.current ? 1 : 0) + sw.done.length;
  const h = Math.max(rows, 1) * RH + 18 + (sw.current ? 6 : 0) + (sw.castOnVisible ? 6 : 0);
  svg.setAttribute('viewBox', `0 0 320 ${h}`);
  let y = 6;
  for (const c of [...sw.upcoming].reverse()) { drawRowOfVs(svg, y, YARN[c], { faint: true }); y += RH; }
  if (sw.current) {
    const band = document.createElementNS(SVG_NS, 'rect');
    band.setAttribute('x', '0'); band.setAttribute('y', String(y - 3)); band.setAttribute('width', '320'); band.setAttribute('height', String(RH + 8)); band.setAttribute('rx', '7');
    band.setAttribute('fill', YARN[sw.current.colour]); band.setAttribute('opacity', '0.14'); svg.appendChild(band);
    drawRowOfVs(svg, y, YARN[sw.current.colour], { fill: sw.current.filled });
    const needle = document.createElementNS(SVG_NS, 'line');
    needle.setAttribute('x1', '4'); needle.setAttribute('x2', '304'); needle.setAttribute('y1', String(y - 1)); needle.setAttribute('y2', String(y - 1));
    needle.setAttribute('stroke', 'var(--text)'); needle.setAttribute('stroke-width', '3'); needle.setAttribute('stroke-linecap', 'round'); needle.setAttribute('opacity', '0.7');
    const knob = document.createElementNS(SVG_NS, 'circle'); knob.setAttribute('cx', '310'); knob.setAttribute('cy', String(y - 1)); knob.setAttribute('r', '5'); knob.setAttribute('fill', 'var(--text)'); knob.setAttribute('opacity', '0.7');
    svg.append(needle, knob);
    y += RH + 6;
  }
  for (const c of [...sw.done].reverse()) { drawRowOfVs(svg, y, YARN[c]); y += RH; }
  if (sw.castOnVisible) {
    const edge = document.createElementNS(SVG_NS, 'path');
    edge.setAttribute('d', `M4 ${y + 3} L316 ${y + 3}`); edge.setAttribute('stroke', 'var(--dim)'); edge.setAttribute('stroke-width', '2'); edge.setAttribute('stroke-dasharray', '1 5'); edge.setAttribute('stroke-linecap', 'round');
    svg.appendChild(edge);
  }
}
function drawBar(segments, left, right) {
  const bar = $('bar'); bar.replaceChildren();
  for (const s of segments) {
    const seg = el('i'); seg.style.flex = `${s.weight} 1 0`; seg.style.setProperty('--sec', s.colour);
    const fill = el('b'); fill.style.width = `${Math.round(s.fraction * 100)}%`; seg.appendChild(fill); bar.appendChild(seg);
  }
  $('barLeft').textContent = left; $('barRight').textContent = right;
}

// ---- history line and undo ----
function renderHistory() {
  const h = $('historyText');
  if (active.kind === 'pattern') {
    const can = P.canGoBack(res, active.progress);
    h.textContent = can ? (active.lastLabel ? `${active.lastLabel} · ${Q.ago(active.updated)}` : 'Tap Back to step back one.') : 'Ready when you are.';
    $('undoBtn').hidden = !can; $('undoBtn').textContent = 'Back';
    return;
  }
  const last = active.history[active.history.length - 1];
  h.textContent = last ? `${last.label} · ${Q.ago(last.t)}` : 'Ready when you are.';
  $('undoBtn').hidden = !Q.canUndo(active); $('undoBtn').textContent = 'Undo';
}

// ---- actions ----
function doneTap() {
  if (locked) { toast('Taps are locked. Turn off "Lock taps" to count.'); return; }
  buzz(25);
  if (active.kind === 'pattern') { active.progress = P.rowDone(res, active.progress); active.lastLabel = 'Row done'; }
  else Q.rowDone(active);
  touch(); renderTrack(true);
}
function undoTap() {
  if (active.kind === 'pattern') { active.progress = P.back(res, active.progress); active.lastLabel = 'Went back one'; }
  else Q.undo(active);
  touch(); renderTrack(false);
}
function stitchTap(by) {
  if (locked && by > 0) { toast('Taps are locked.'); return; }
  if (by > 0) buzz(8);
  if (active.kind === 'pattern') active.progress = P.addStitch(res, active.progress, by); else Q.addStitch(active, by);
  touch(); renderTrack(false);
}

// ---- sheets ----
function openSheet(build) {
  const body = $('sheetBody'); body.replaceChildren(); build(body); $('sheetBg').hidden = false;
}
function closeSheet() { $('sheetBg').hidden = true; }
function sectionsSheet() {
  openSheet((body) => {
    body.appendChild(el('h2', null, 'Parts'));
    body.appendChild(el('p', 'muted small', 'Tap one to jump to its start.'));
    const items = active.kind === 'pattern'
      ? res.sections.map((s, i) => ({ name: s.displayName, colour: YARN[s.colour], fraction: P.progressOf(res, active.progress).sections[i].fraction, here: !active.progress.finished && res.entries[active.progress.index].section === i, go: () => { active.progress = P.jumpToSection(res, active.progress, i); } }))
      : Q.progress(active).sections.map((s, i) => ({ name: s.name, colour: YARN[i % YARN.length], fraction: s.complete ? 1 : s.planned ? Math.min(1, s.done / s.planned) : 0, here: active.pos.section === i && !active.done, go: () => { Q.jumpToSection(active, i); } }));
    items.forEach((it) => {
      const b = el('button', `item${it.here ? ' here' : ''}`);
      const dot = el('span', 'dot'); dot.style.background = it.colour;
      const bar = el('span', 'bar'); const fill = el('i'); fill.style.setProperty('--sec', it.colour); const fb = el('b'); fb.style.width = `${Math.round(it.fraction * 100)}%`; fill.appendChild(fb); bar.appendChild(fill);
      b.append(dot, el('span', 'grow', `${it.name}${it.fraction >= 1 ? ' ✓' : ''}`), bar);
      b.addEventListener('click', () => { it.go(); touch(); closeSheet(); renderTrack(true); });
      body.appendChild(b);
    });
  });
}
function menuSheet() {
  openSheet((body) => {
    body.appendChild(el('h2', null, active.name));
    const add = (label, fn, cls = '') => { const b = el('button', `btn ${cls}`, label); b.addEventListener('click', () => { closeSheet(); fn(); }); body.appendChild(b); };
    if (active.kind === 'quick') {
      add('Set the row by hand', () => {
        const v = window.prompt(`Which ${Q.rowWord(active).toLowerCase()} are you about to work?`, String(Q.nextRow(active)));
        const n = Number(v); if (v === null || !Number.isInteger(n) || n < 1) return;
        Q.setRow(active, n - 1); touch(); renderTrack(true);
      });
      add('Edit parts and reminders', () => openSetup(active));
    } else {
      add('Pattern info', patternInfoSheet);
      if (res.sizes.length > 1) add(`Change size (now ${res.size})`, changeSize);
    }
    add('Notes', notesSheet);
    add('Rename', () => { const v = window.prompt('Project name', active.name); if (v && v.trim()) { active.name = v.trim().slice(0, 60); touch(); renderTrack(false); } });
    add(`Haptic buzz: ${store.settings.haptics ? 'on' : 'off'}`, () => { store.settings.haptics = !store.settings.haptics; save(); toast(`Haptic buzz ${store.settings.haptics ? 'on' : 'off'}.`); });
    add('Start this project over', () => {
      if (!window.confirm('Start over from the first row? Your place in this project is cleared.')) return;
      if (active.kind === 'pattern') { active.progress = P.startProgress(); active.lastLabel = null; } else { active.pos = { section: 0, row: 0 }; active.history = []; active.done = false; active.stitch = 0; }
      touch(); renderTrack(true);
    });
    add('Delete this project', () => {
      if (!window.confirm(`Delete "${active.name}"? This can't be undone.`)) return;
      store.projects = store.projects.filter((p) => p.id !== active.id); active = null; store.activeId = null; save(); screenStack = []; show('home');
    }, 'danger');
  });
}
function notesSheet() {
  openSheet((body) => {
    body.appendChild(el('h2', null, 'Notes'));
    const ta = el('textarea'); ta.value = active.notes || ''; ta.maxLength = 5000; ta.placeholder = 'Needle size, modifications, where you left off…';
    ta.addEventListener('input', () => { active.notes = ta.value; touch(); });
    body.appendChild(ta);
  });
}
function patternInfoSheet() {
  openSheet((body) => {
    const pat = active.pattern;
    body.appendChild(el('h2', null, pat.title));
    if (pat.designer) body.appendChild(el('p', 'muted', `By ${pat.designer}${pat.source ? ` · ${pat.source}` : ''}`));
    const info = isObj(pat.info) ? pat.info : {};
    const block = (title, lines) => { if (!lines || !lines.length) return; body.appendChild(el('h3', null, title)); const ul = el('ul'); for (const l of lines) ul.appendChild(el('li', null, String(l))); body.appendChild(ul); };
    block('Materials', info.materials); block('Needles', info.needles);
    if (isObj(info.gauge)) block('Gauge', [`${info.gauge.stitches} sts and ${info.gauge.rows} rows over ${info.gauge.over} ${res.units}${info.gauge.note ? ` (${info.gauge.note})` : ''}`]);
    block('Notes', info.notes);
    if (res.size) body.appendChild(el('p', 'muted', `Size: ${res.size}`));
  });
}
function changeSize() {
  openSheet((body) => {
    body.appendChild(el('h2', null, 'Change size'));
    body.appendChild(el('p', 'muted small', 'The rows differ by size, so you restart from the beginning of the part you are on.'));
    for (const s of res.sizes) {
      const b = el('button', `item${s === res.size ? ' here' : ''}`, s);
      b.addEventListener('click', () => {
        if (s === res.size) { closeSheet(); return; }
        const out = P.changeSize(active.pattern, res, active.progress, s);
        res = out.resolved; active.size = res.size; active.progress = out.progress; touch(); closeSheet(); renderTrack(true);
      });
      body.appendChild(b);
    }
  });
}
function settingsSheet() {
  openSheet((body) => {
    body.appendChild(el('h2', null, 'Row Tracker'));
    body.appendChild(el('p', 'muted', 'Everything you add stays on this phone. The app makes no requests to other websites.'));
    const add = (label, fn) => { const b = el('button', 'btn', label); b.addEventListener('click', fn); body.appendChild(b); };
    add(`Haptic buzz: ${store.settings.haptics ? 'on' : 'off'}`, (e) => { store.settings.haptics = !store.settings.haptics; save(); e.target.textContent = `Haptic buzz: ${store.settings.haptics ? 'on' : 'off'}`; });
    add('Back up all projects (copy text)', async () => {
      const text = JSON.stringify(store);
      try { await navigator.clipboard.writeText(text); toast('Copied. Paste it somewhere safe, like a note.'); }
      catch (e) { window.prompt('Copy this text and keep it somewhere safe:', text); }
    });
    add('Restore from a backup', () => {
      const v = window.prompt('Paste the backup text:');
      if (!v) return;
      try { const data = JSON.parse(v); if (!isObj(data) || !Array.isArray(data.projects)) throw new Error(); store = repair(data); save(); closeSheet(); renderHome(); toast(`Restored ${store.projects.length} project${store.projects.length === 1 ? '' : 's'}.`); }
      catch (e) { toast("That doesn't look like a Row Tracker backup."); }
    });
  });
}

// ---- keep the screen on ----
let wakeLock = null;
async function keepAwake() {
  if (!store.settings.wake || wakeLock || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
  catch (e) { wakeLock = null; }
}
async function releaseWake() { try { if (wakeLock) await wakeLock.release(); } catch (e) { /* gone */ } wakeLock = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('track').hidden) keepAwake(); });

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
function wire() {
  for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', goBack);
  $('newBtn').addEventListener('click', () => show('new'));
  $('settingsBtn').addEventListener('click', settingsSheet);
  $('chooseQuick').addEventListener('click', () => openSetup(null));
  $('chooseCounter').addEventListener('click', () => openSetup(null, { counterOnly: true }));
  $('choosePattern').addEventListener('click', () => { $('fileStatus').hidden = true; show('file'); });
  $('addSectionBtn').addEventListener('click', () => { const list = $('sectionList'); if (list.children.length >= Q.MAX_SECTIONS) return; list.appendChild(partRow({})); list.lastChild.querySelector('input').focus(); });
  $('setupForm').addEventListener('submit', submitSetup);
  $('pickFileBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    if (file.size > P.MAX_FILE_BYTES) { fileStatus(P.TOO_BIG_MESSAGE); return; }
    openText(await file.text(), { name: file.name, type: file.type, size: file.size });
  });
  $('pasteBtn').addEventListener('click', () => openText($('pasteBox').value, { name: 'pasted' }));
  $('reviewStart').addEventListener('click', startPattern);

  $('trackHome').addEventListener('click', () => { screenStack = []; show('home'); });
  $('trackMenu').addEventListener('click', menuSheet);
  $('sectionBtn').addEventListener('click', sectionsSheet);
  $('bar').addEventListener('click', sectionsSheet);
  $('doneBtn').addEventListener('click', doneTap);
  $('undoBtn').addEventListener('click', undoTap);
  $('stPlus').addEventListener('click', () => stitchTap(1));
  $('stMinus').addEventListener('click', () => stitchTap(-1));
  $('moveOnBtn').addEventListener('click', () => { buzz(25); active.progress = P.reachedIt(res, active.progress); active.lastLabel = 'Moved on'; touch(); renderTrack(true); });
  $('nextSectionBtn').addEventListener('click', () => { if (locked) { toast('Taps are locked.'); return; } buzz(25); Q.nextSection(active); touch(); renderTrack(true); });
  $('reminderOk').addEventListener('click', () => { $('reminder').hidden = true; });
  $('lockToggle').addEventListener('change', (e) => { locked = e.target.checked; renderTrack(false); });
  $('wakeToggle').addEventListener('change', (e) => { store.settings.wake = e.target.checked; save(); if (store.settings.wake) keepAwake(); else releaseWake(); });
  $('sheetClose').addEventListener('click', closeSheet);
  $('sheetBg').addEventListener('click', (e) => { if (e.target === $('sheetBg')) closeSheet(); });
  // Keyboard: space or enter on the tracker = row done (handy with a foot pedal or keyboard).
  document.addEventListener('keydown', (e) => {
    if ($('track').hidden || !$('sheetBg').hidden || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); doneTap(); }
    if (e.key === 'Backspace' || e.key === 'z') { e.preventDefault(); if (!$('undoBtn').hidden) undoTap(); }
  });
  // Refresh "x min ago" now and then.
  setInterval(() => { if (!$('track').hidden && active) renderHistory(); }, 30000);
}

function registerSw() {
  if (!('serviceWorker' in navigator)) return;
  const hadOne = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadOne) toast('Row Tracker updated.'); });
  navigator.serviceWorker.register('./sw.js').catch(() => { /* still works, just not offline */ });
}

async function start() {
  load();
  wire();
  registerSw();
  if (await openShared()) return;
  const last = store.projects.find((p) => p.id === store.activeId);
  if (last && store.projects.length) { screenStack = ['home']; openProject(last.id); }
  else show('home');
}
start();
