# Row Tracker — Build Spec

Version 3 · November 13, 2026

**Version 3** is a redesign from scratch around how knitters actually use a counter, based on research into the apps they use and complain about (see "What changes in v3"). It keeps v2's pattern-file format and Pattern Converter unchanged. The app lives in the `knittingapp/` folder of the `Temp-Apps-Public` repo, at the same web address.

## How it fits together

```text
IN CLAUDE (uses the owner's Claude account)
  Pattern PDF  ──►  Pattern Converter (Claude skill)  ──►  Pattern file (.json)
                                                              │
                                     download, then open in the app
                                                              ▼
ROW TRACKER APP ON THE PHONE (works offline)
  Open the file  ──►  Pick your size  ──►  Check it  ──►  Knit and tap
```

Only the converter needs AI and the internet. Everything on the phone works offline and never sends the pattern anywhere.

## What changes in v3

**Research.** Reviews and forum threads about row-counter apps (knitCompanion, YarnBuddy, My Row Counter, Knit Row Counter, Knitting Counter, Easy Knitty and others) repeat the same complaints:

- Losing your place mid-row, and not being sure whether you already pressed the button ("did I press that?").
- Accidental taps: swipe-to-subtract gestures, and buttons that are easy to hit while handling needles. Physical counters have a lock switch for this reason.
- Having to unlock the phone every row.
- Only one project at a time, when most knitters have several on the go.
- A pattern is structure, not a number: row 47 overall, row 3 of a 12-row repeat, repeat 4, while decreasing every 6th row. Plain tally counters can't say that, so people run three counters and a sticky note.
- Sounds that interrupt podcasts.

**Design responses, each one a feature:**

| Complaint | v3 answer |
| --- | --- |
| Did I press that? | A history line under the button ("Row 12 done · just now") and one-tap Undo that puts back exactly what the last tap changed |
| Accidental taps | One huge button at the bottom, no gestures, and a "Lock taps" switch |
| Unlocking the phone each row | "Keep screen on" switch, remembered per phone |
| One project at a time | A projects list; each remembers its place; sorted by last worked on |
| Structure, not a number | Quick setup: parts with row targets, rows-per-repeat, and reminders "every N rows" or "at row N". The screen says "Row 6 of 12 · repeat 3 of 6 · row 2 of 2" and "decrease in 3 rows" |
| Sounds | None. Optional haptic buzz only |

**Also new:** rows and reminders can be set by hand ("I'm actually on row 30"), a backup/restore of all projects as text, keyboard shortcuts (space = row done) for a foot pedal, and v2 saved data is migrated into a project on first run.

**Unchanged:** the pattern-file format, the converter skill, `pattern.js`, the yarn colours and swatch, offline support, the share target, and the privacy rules.

## Data model: the pattern file

A pattern file is one JSON file with a fixed shape: a pattern holds sections, and a section holds steps. Claude Code also writes this shape down as `converter/pattern.schema.json`. The app checks every file against it before opening it.

**Pattern (top level)**

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `format` | text, always `"row-tracker-pattern"` | yes | Lets the app recognise the file |
| `version` | number, `1` | yes | Version of this model |
| `title` | text | yes | Pattern name |
| `designer` | text | no | Designer's name |
| `source` | text | no | Publisher, website or book |
| `craft` | `"knit"` or `"crochet"` | no (knit) | Changes wording, e.g. "hook" vs "needle" |
| `units` | `"cm"` or `"in"` | no (cm) | Units for lengths and gauge |
| `sizes` | list of size names in pattern order, e.g. `["S","M","L"]` | no | Leave out for one-size patterns |
| `info` | object (below) | no | Materials, needles, gauge, notes |
| `sections` | list of sections | yes, 1 or more | The pattern in working order |
| `reviewNotes` | list of text | no | Anything Claude was unsure about, in plain words |

**Info:** `materials` (list of text, as written), `needles` (list of text), `gauge` (`stitches`, `rows`, `over`, `note`; e.g. 22 stitches and 30 rows over 10), `notes` (list of construction notes worth keeping).

**Section**

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | short text, unique | yes | e.g. `"yoke"` |
| `name` | text | yes | e.g. "Yoke" |
| `worked` | `"round"` or `"flat"` | no (flat) | The app says "Round" or "Row" |
| `repeat` | number | no (1) | 2 for "work the second sleeve the same way" |
| `steps` | list of steps | yes | In working order |

**Step**

| Field | Type | Used by | Meaning |
| --- | --- | --- | --- |
| `type` | `"row"`, `"measure"` or `"action"` | all, required | See step types below |
| `text` | text or per-size | all, required | The instruction in the pattern's words, with only this size's numbers |
| `label` | text | all | The pattern's own name, e.g. "Round 2", "Rounds 3–5" |
| `count` | number or per-size | row (default 1) | Identical rows in a row: "Rounds 3–5: Knit" is 3 |
| `stitchesAfter` | number or per-size | all | Stitches on the needle after this step. Only when stated or certain |
| `side` | `"RS"` or `"WS"` | row | Right or wrong side |
| `length` | number or per-size | measure, required | Target length in `units`, e.g. 22 |
| `checklist` | list of (text or per-size) | action | The parts of a multi-part step, one per item |
| `needle` | text | all | Needle or hook to use from here on, e.g. "3 mm" |
| `sizes` | list of size names | all | Only these sizes do this step |
| `group` | `name`, `pass`, `of` (`of` may be per-size) | all | Repeat info for display: "Yoke pattern, pass 2 of 3" |
| `page` | number | all | PDF page, for looking things up |
| `flag` | text | all | Why Claude is unsure about this step |

**Step types**

- **row:** one or more identical rows or rounds the knitter taps through.
- **measure:** open-ended, "work until it measures `length`". The app counts rows and shows an estimate from the gauge.
- **action:** a one-off step that isn't a row, such as cast on, change needles, divide for sleeves, bind off or sew. It can carry a checklist.

**Per-size values.** Any field marked "or per-size" can be an object keyed by size name, like `"stitchesAfter": {"S": 108, "M": 117, "L": 126}`. It must include every size the step applies to. Text is fully resolved per size, so the knitter sees "Cast on 96 sts", never "96 (104) 112". Only `info.materials` keeps the pattern's original "100 (100) 150 g" style.

**Repeats.** Identical rows use `count`. A whole section worked again uses `repeat`. Repeats that change each time are written out in full, one pass after another, with `group` saying which pass it is. Writing them out keeps the app simple and avoids guesswork.

**Checked against a real pattern.** The model was checked against a real 5-size top-down yoke top, and every tricky part has a place:

| What the pattern does | How the file holds it |
| --- | --- |
| 5 sizes, numbers like "98 (100) 102 (104) 104" | `sizes` plus per-size values, resolved to plain numbers |
| An 8-round block repeated 8–10 times depending on size, with a different increase round each time | Each pass written out, with `group` pass and per-size `of` |
| Extra increase passes for the larger sizes only | `sizes` on those steps |
| "There are 112 (114) … sts on the needle" | `stitchesAfter` on that increase round |
| Dividing body and sleeves in one long paragraph | An action step with a checklist, one item per move |
| "Continue until the work measures 25 cm", "work 5 cm of twisted rib" | Measure steps with `length` 25 and 5 |
| "Work the second sleeve the same way" | The sleeve section with `repeat` 2 |
| Needle and yarn changes partway through | Action steps with `needle` |
| Typos in the PDF | Fixed in `text`, meaning unchanged |

## Example pattern file

This invented 3-size top uses every feature of the model, and its stitch counts add up in every size. Claude Code saves it as `tests/fixtures/sunny-yoke-tee.json` and uses it as the main test pattern. It is not a real pattern, so it is safe to put in a public repo.

```json
{
  "format": "row-tracker-pattern",
  "version": 1,
  "title": "Sunny Yoke Tee",
  "designer": "Example Designer",
  "source": "Invented example for testing",
  "craft": "knit",
  "units": "cm",
  "sizes": ["S", "M", "L"],
  "info": {
    "materials": ["150 (150) 200 g light fingering yarn"],
    "needles": ["3 mm circular, 80 cm", "4 mm circular, 80 cm"],
    "gauge": { "stitches": 22, "rows": 30, "over": 10, "note": "Stockinette on 4 mm" },
    "notes": ["Worked top down in one piece with short sleeves."]
  },
  "sections": [
    {
      "id": "yoke", "name": "Yoke", "worked": "round",
      "steps": [
        { "type": "action", "text": { "S": "Cast on 96 sts with the 3 mm needle and join in the round.", "M": "Cast on 104 sts with the 3 mm needle and join in the round.", "L": "Cast on 112 sts with the 3 mm needle and join in the round." }, "needle": "3 mm", "stitchesAfter": { "S": 96, "M": 104, "L": 112 }, "page": 2 },
        { "type": "row", "label": "Rib", "text": "*K1 tbl, p1*; repeat from * to end.", "count": 6 },
        { "type": "action", "text": "Change to the 4 mm needle and place a beginning-of-round marker.", "needle": "4 mm" },

        { "type": "row", "label": "Round 1", "text": "Knit.", "group": { "name": "Yoke pattern", "pass": 1, "of": { "S": 2, "M": 3, "L": 3 } } },
        { "type": "row", "label": "Round 2", "text": "*M1, k8*; repeat from * to end.", "stitchesAfter": { "S": 108, "M": 117, "L": 126 }, "group": { "name": "Yoke pattern", "pass": 1, "of": { "S": 2, "M": 3, "L": 3 } } },
        { "type": "row", "label": "Rounds 3–5", "text": "Knit.", "count": 3, "group": { "name": "Yoke pattern", "pass": 1, "of": { "S": 2, "M": 3, "L": 3 } } },
        { "type": "row", "label": "Round 6", "text": "*Yarn over, k2tog*; repeat from * to end.", "group": { "name": "Yoke pattern", "pass": 1, "of": { "S": 2, "M": 3, "L": 3 } } },

        { "type": "row", "label": "Round 1", "text": "Knit.", "group": { "name": "Yoke pattern", "pass": 2, "of": { "S": 2, "M": 3, "L": 3 } } },
        { "type": "row", "label": "Round 2", "text": { "S": "*M1, k6*; repeat from * to end.", "M": "K3, *M1, k6*; repeat from * to end.", "L": "*M1, k7*; repeat from * to end." }, "stitchesAfter": { "S": 126, "M": 136, "L": 144 }, "group": { "name": "Yoke pattern", "pass": 2, "of": { "S": 2, "M": 3, "L": 3 } } },
        { "type": "row", "label": "Rounds 3–5", "text": "Knit.", "count": 3, "group": { "name": "Yoke pattern", "pass": 2, "of": { "S": 2, "M": 3, "L": 3 } } },
        { "type": "row", "label": "Round 6", "text": "*Yarn over, k2tog*; repeat from * to end.", "group": { "name": "Yoke pattern", "pass": 2, "of": { "S": 2, "M": 3, "L": 3 } } },

        { "type": "row", "label": "Round 1", "text": "Knit.", "sizes": ["M", "L"], "group": { "name": "Yoke pattern", "pass": 3, "of": { "M": 3, "L": 3 } } },
        { "type": "row", "label": "Round 2", "text": { "M": "K4, *M1, k6*; repeat from * to end.", "L": "*M1, k8*; repeat from * to end." }, "sizes": ["M", "L"], "stitchesAfter": { "M": 158, "L": 162 }, "group": { "name": "Yoke pattern", "pass": 3, "of": { "M": 3, "L": 3 } } },
        { "type": "row", "label": "Rounds 3–5", "text": "Knit.", "count": 3, "sizes": ["M", "L"], "group": { "name": "Yoke pattern", "pass": 3, "of": { "M": 3, "L": 3 } } },
        { "type": "row", "label": "Round 6", "text": "*Yarn over, k2tog*; repeat from * to end.", "sizes": ["M", "L"], "group": { "name": "Yoke pattern", "pass": 3, "of": { "M": 3, "L": 3 } } },

        { "type": "action", "label": "Divide for body and sleeves", "text": "Divide the stitches for body and sleeves.",
          "checklist": [
            { "S": "Put the first 27 sts on a holder (first sleeve)", "M": "Put the first 35 sts on a holder (first sleeve)", "L": "Put the first 35 sts on a holder (first sleeve)" },
            "Cast on 4 sts under the arm",
            { "S": "Knit 36 sts (front)", "M": "Knit 44 sts (front)", "L": "Knit 46 sts (front)" },
            { "S": "Put the next 27 sts on a holder (second sleeve)", "M": "Put the next 35 sts on a holder (second sleeve)", "L": "Put the next 35 sts on a holder (second sleeve)" },
            "Cast on 4 sts under the arm",
            { "S": "Knit 36 sts (back)", "M": "Knit 44 sts (back)", "L": "Knit 46 sts (back)" }
          ],
          "stitchesAfter": { "S": 80, "M": 96, "L": 100 } }
      ]
    },
    {
      "id": "body", "name": "Body", "worked": "round",
      "steps": [
        { "type": "measure", "text": "Knit every round until the body measures 22 cm from the divide.", "length": 22 },
        { "type": "action", "text": "Change to the 3 mm needle.", "needle": "3 mm" },
        { "type": "measure", "text": "Work *k1 tbl, p1* rib until the rib measures 4 cm.", "length": 4 },
        { "type": "action", "text": "Bind off in pattern." }
      ]
    },
    {
      "id": "sleeve", "name": "Sleeve", "worked": "round", "repeat": 2,
      "steps": [
        { "type": "action", "text": { "S": "Put the 27 held sleeve sts on the 4 mm needle and pick up 4 sts under the arm.", "M": "Put the 35 held sleeve sts on the 4 mm needle and pick up 4 sts under the arm.", "L": "Put the 35 held sleeve sts on the 4 mm needle and pick up 4 sts under the arm." }, "needle": "4 mm", "stitchesAfter": { "S": 31, "M": 39, "L": 39 } },
        { "type": "row", "label": "Rounds 1–3", "text": "Knit.", "count": 3 },
        { "type": "action", "text": "Change to the 3 mm needle.", "needle": "3 mm" },
        { "type": "measure", "text": "Work *k1 tbl, p1* rib until the rib measures 2 cm.", "length": 2 },
        { "type": "action", "text": "Bind off in pattern." }
      ]
    },
    {
      "id": "finishing", "name": "Finishing",
      "steps": [
        { "type": "action", "text": "Finish the top.", "checklist": ["Sew the small gap under each arm", "Weave in all ends"] }
      ]
    }
  ],
  "reviewNotes": ["Round 2 of pass 2 for size M starts with K3; double-check against the PDF."]
}
```

**What it should produce:** size S has 2 yoke passes (108, then 126 sts); M and L have 3 (M: 117, 136, 158; L: 126, 144, 162). After the divide the body has 80, 96 or 100 sts. Each sleeve starts with 31, 39 or 39 sts. At this gauge the 22 cm body is about 66 rounds, the 4 cm rib about 12, and the 2 cm sleeve rib about 6.

## Pattern Converter

The converter is a **Claude skill**: a folder of instructions Claude follows whenever the owner shares a pattern and says "convert this for Row Tracker". It runs in the owner's own Claude account, so there's no API key and no extra cost. It also reads photos and charts.

Claude Code saves the instructions below as `converter/SKILL.md`, next to `converter/pattern.schema.json`. Those two files together are the skill.

```markdown
---
name: pattern-converter
description: Turn a knitting or crochet pattern (PDF, photos or text) into a Row Tracker pattern file (.json). Use when someone shares a pattern and wants it in Row Tracker, or asks to convert a pattern for the row tracker app.
---

# Pattern Converter for Row Tracker

Turn a knitting or crochet pattern into ONE JSON file that the Row Tracker app opens. The knitter follows this file stitch by stitch, so accuracy matters more than speed. The file must match `pattern.schema.json` in this folder exactly.

## 1. Read the whole pattern
- Read every page: text, photos, charts, tables, footnotes. Size-specific parts are often far from where they apply.
- Find the size order, e.g. "S (M) L (XL) XXL". Numbers like "98 (100) 102 (104) 104" follow it. A "-" or "–" means that size skips it.
- Find the gauge, the units (cm or in) and construction notes ("worked top down", "in the round").

## 2. Build the file
1. Sections: the named parts in working order, with short names (Yoke, Body, Sleeve). If none are named, use one section called "Pattern". Set `worked` to "round" or "flat".
2. Every instruction becomes a step:
   - `row`: a row or round that is worked. Identical rows in a row use `count` ("Rounds 3-7: Knit" = count 5).
   - `measure`: "until it measures X" or "work X cm of rib". Set `length` in the pattern's units.
   - `action`: anything done once (cast on, join, change needles, place markers, divide, pick up, bind off, sew, weave in). A paragraph with several moves becomes a `checklist`, one item per move.
3. Sizes: `text` shows ONE size's numbers only, never "96 (104) 112". Use a per-size object wherever a value differs by size, covering every size the step applies to. Steps for only some sizes get `sizes`.
4. Repeats:
   - Identical rows: `count`.
   - A section worked again ("work the second sleeve the same way"): section `repeat`.
   - A block repeated with changes each time ("repeat rounds 1-8, but work round 2 as follows: 1st time ..., 2nd time ..."): write every pass out in full, in order, each step with `group` {name, pass, of}. `of` is per-size when the number of passes depends on size.
5. Stitch counts: set `stitchesAfter` when the pattern states a count, and on cast-on, pick-up and divide steps. Check the arithmetic (98 sts worked *M1, k7* = 14 increases = 112). If the pattern's number disagrees with your check, keep the pattern's number and add a `flag`. Never invent a count the pattern doesn't support.
6. `label`: the pattern's own name for the step ("Round 2", "Rounds 3-7", "1st time"), so the knitter can find it in the PDF. `page`: the PDF page number.
7. `needle`: set it on the step where the needle or hook changes.
8. `text`: keep the pattern's wording and abbreviations. Fix obvious typos. Leave out the "Round 5:" prefix (that's the label). Replace "repeat round 3" with round 3's actual instruction.
9. Charts: if legible, write each chart row as a row step (label "Chart A row 1"). If not, add one action step like "Work Chart A, rows 1-12 (page 3)" with a `flag`.
10. Put materials, needles, gauge and useful construction notes in `info`. Leave out marketing text, photo captions, copyright lines and abbreviation lists.
11. When unsure, still make the file: add a `flag` on the step and a plain-language line in `reviewNotes`. Only stop and ask if the pattern can't be read at all.

## 3. Check before handing it over
- It is valid JSON and matches the schema.
- For EACH size, walk the steps start to finish: stitch counts follow on, passes run 1 to `of`, the pass total matches the pattern ("repeated 8 (9) 9 (10) 10 times"), and no text still holds a size list.
- Fix what you find; flag what you can't.

## 4. Deliver
- Name the file after the pattern in lowercase-with-hyphens, e.g. `sunny-yoke-tee.json`.
- Give it as a downloadable file. If you can't attach files, put the whole JSON in one code block so it can be copied.
- Then write 3-5 short lines: sections, sizes, and any flags to check. Nothing else.
- The file holds pattern content only, never anything about the person.
```

## Tech constraints and files

The app is a static, offline-capable PWA in `knittingapp/` of the public repo `jspenc111-stack/Temp-Apps-Public`, next to Fishbowl and Counter. GitHub Pages publishes the whole repo, so the live address stays **https://jspenc111-stack.github.io/Temp-Apps-Public/knittingapp/**.

```text
knittingapp/
├─ index.html                all screens, one page
├─ styles.css
├─ app.js                    screens, buttons, saving, migration from v2
├─ quick.js                  quick projects: parts, repeats, reminders, undo (no screen code)
├─ pattern.js                pattern files: validate, resolve, movement (no screen code)
├─ sw.js                     offline helper (service worker), cache row-tracker-v3
├─ manifest.webmanifest
├─ icon-192.png, icon-512.png, icon-512-maskable.png
├─ converter/SKILL.md, converter/pattern.schema.json
├─ tests/run.mjs, tests/fixtures/
├─ SPEC.md, CLAUDE.md, README.md
```

- **Code:** plain HTML, CSS and JavaScript modules. No frameworks, libraries, CDN or web fonts. Paths are relative.
- **Logic files have no screen code**, so Node tests run them: `quick.js` for quick projects, `pattern.js` for pattern files.
- **Storage:** one `localStorage` key, `rowtracker.v3`: `{ v: 3, projects: [...], activeId, settings: { haptics, wake } }`. On first run, `rowtracker.v2` is read once and turned into a project, then both old keys are removed. Every read and write is in try/catch; unreadable data means "start fresh"; every saved project is repaired on load and dropped if it can't be.
- **A project** is either `kind: "quick"` (name, craft, sections, pos, history, stitch, done) or `kind: "pattern"` (name, pattern, size, progress), plus `id`, `updated` and `notes`.
- **Service worker:** pre-caches the app files, serves from cache first, refreshes in the background, and deletes only caches named `row-tracker-*`.
- **Limits:** pattern files up to 2 MB, 40 parts and 20 reminders per quick project, 30 history entries, notes up to 5,000 characters.

## Screens and user flow

The app opens on the project you last worked on, or the projects list if there is none.

1. **Projects** (home): one card per project, most recently worked first, with its name, where you are ("Cuff · row 6 of 12"), when you last touched it, and a thin progress bar. "New project" and a settings button (haptics, backup, restore).
2. **New project:** three choices. *Quick setup*, *Open a pattern file*, *Just count rows* (a quick project with one open-ended part).
3. **Quick setup:** project name, knit or crochet, and the parts in working order. Each part has a name, a row count (blank means "until it measures"), rows in one repeat, and reminders: text plus "every N" or "at row N". The same form edits an existing project later.
4. **Pattern file:** open a `.json` file or paste its text, then pick a size (if the file has several) and check the parts and rows before starting. Unchanged from v2.
5. **Tracking:** the knitting screen, below.
6. **Sheets** (slide up from the bottom): Parts (jump to one), the project menu (set the row by hand, edit parts, pattern info, change size, notes, rename, haptics, start over, delete), notes, and settings.

Replacing nothing: adding a project never touches another one. Deleting asks first.

## Tracker behaviour

**Layout, top to bottom:** back to projects · project name and a part pill ("Cuff · 1 of 2", tap for the parts sheet) · menu · the knitted swatch and a progress bar split by part · a reminder banner when one is due · the row card · the optional stitch counter · the history line with Undo · "Move on" buttons when they apply · the big "Row done" button · the Lock taps and Keep screen on switches.

**Quick projects** (`quick.js`):

- The row card shows "Row 6 of 12" (or "Round" for crochet), a repeat pill ("Repeat 3 of 6 · row 2 of 2") when the part has a repeat, "7 to go in Cuff", and the next reminder ("decrease in 3 rows (row 12)").
- **Reminders** fire for the row about to be worked: "every 6" fires on rows 6, 12, 18…; "at row 25" fires once. They show as a banner with "Got it" and are listed in the card.
- **Row done** finishes the row. When a part's row count is reached, the card says "Cuff done" and the button becomes "Start Leg" (or "Finish project"). Open-ended parts show "Move on to Leg" at all times.
- **Undo** puts back exactly what the last tap changed, including a move to the next part or finishing. The last 30 taps are kept.
- **Set the row by hand** and **Edit parts** are in the menu. Editing parts keeps your place where it still fits.
- The progress bar shows a percentage only when every part has a row count; otherwise "Part 2 of 2". Open-ended parts never show 100%.

**Pattern projects** (`pattern.js`): as in v2. Row, measure and action steps; "Reached 22 cm, move on" on measure steps; checklists; Back instead of Undo; Change size restarts the current part.

**Both:** a short buzz on each row (25 ms) and stitch (8 ms) when haptics are on; Lock taps makes the big button and the stitch button do nothing (a toast says why); Keep screen on uses the Screen Wake Lock API and is remembered; space or enter on a keyboard counts a row, backspace undoes. Every tap saves.

## Progress visual

Progress shows as a small knitted swatch (the same design as v1) that grows one row with every finished row or round. It is an SVG in a rounded card, filling the width.

- **Stitches:** each row is 15 knit stitches side by side, each a V of two slightly curved strokes about 3.4 px thick with rounded ends.
- **Colours:** each section gets its own yarn colour, cycling rose, sage, mustard, slate and plum, so finished work reads as stripes. Both copies of a repeated section share a colour.
- **Stacking:** newest row on top. Show up to the last 9 finished rows, the current row, and up to 3 upcoming rows as faint outlines.
- **Current row:** on a faint colour band, with a knitting needle (a line with a round knob) along its top edge. Its stitches fill in right to left as the stitch counter rises, in proportion to the target.
- **What adds a row:** each finished row entry and each "Round done" on a measure step. Action steps add none.
- **Cast-on edge:** a dotted line under the first row while it's still in view.
- **Motion:** the new row and the step card fade in and slide slightly (about 0.45 s). No motion when the phone's "reduce motion" setting is on.

**Progress bar** (under the swatch): one segment per section copy, sized by its planned rows and filled in its colour. Tapping it opens the Sections sheet. A measure step counts as its gauge estimate (or 1 row with no gauge) toward the plan. Labels: "34% of the pattern" on the left, "12 of 40 rows in this section" on the right. Percentages stay at 99% or below until "Finished!".

## Design

The look is warm and yarn-like: oatmeal background, rose accent, rounded cards, large easy tap targets for use mid-knit.

| Colour | Light mode | Dark mode |
| --- | --- | --- |
| Background | #DCD3C3 | #211C18 |
| Card | #F1EAD9 | #2E2823 |
| Text | #2E2A24 | #EDE6DA |
| Faded text | #6F6759 | #A89E8F |
| Accent (buttons) | #9C3F5D | #E08AA4 |
| Section 1–5 yarns | #9C3F5D, #56735E, #B07F2E, #4F6788, #7A5476 | #E08AA4, #9FC2A5, #E0B869, #94AED3, #C79BC0 |

- **Fonts:** a serif (Georgia) for the title and the big row number; the phone's normal font for everything else. Instruction text around 19px.
- **Layout:** one column, max 440px wide, centred. Main buttons at least 48px tall.
- **Dark mode:** follows the phone's setting automatically.
- **Phone edges:** respect notches and gesture bars with safe-area padding (`viewport-fit=cover`).
- **Accessibility:** visible focus outlines, labelled icon-only buttons (the "−" button), a screen-reader description on the swatch ("14 rows finished"), and status messages announced when they change.
- **Icon:** rose rounded square with three cream rows of knit Vs and a needle across the top. The maskable version keeps the artwork in the centre 60%.
- **Wording:** friendly and plain. No jargon in any message the user sees.

## Privacy and safety

The owner's patterns and progress never leave the phone. The only time a pattern goes anywhere is when the owner chooses to share it with Claude to convert it.

| Where | What's there | Who can see it |
| --- | --- | --- |
| The phone (the app) | The pattern file, chosen size, progress | Only the owner |
| The owner's Claude account | The PDF and file, when converting one | The owner, under their Claude privacy settings |
| GitHub (public repo) | App code, the converter instructions, invented test patterns | Anyone |
| The live website | The same app code | Anyone, but it holds no data |

**Rules for the build**

1. **No outside requests.** The app loads only its own files: no analytics, cookies, CDN, web fonts, accounts or tracking. A Content Security Policy enforces this. (That's a small rule in `index.html` telling the browser to refuse anything not from the app's own site.) Use `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'`.
2. **No secrets.** There are no API keys or passwords anywhere, so nothing can leak.
3. **No real patterns in the repo.** Patterns are copyrighted by their designers, and the repo is public. Never commit PDFs or real pattern files. Test fixtures are invented. A test scans `knittingapp/` and fails if it finds a `.pdf`, or a pattern file outside `tests/fixtures/`.
4. **Treat opened files as untrusted.** A pattern file could come from anywhere, so the app validates every file before use. It puts pattern words on screen with `textContent`, never `innerHTML`, so a booby-trapped file can't run code. Files over 2 MB are refused.
5. **Nothing personal in pattern files.** The converter writes pattern content only.
6. **Be a good neighbour on the shared web address.** Every app on `jspenc111-stack.github.io` shares browser storage, so Row Tracker uses only its own `rowtracker.` storage key and only deletes its own `row-tracker-` caches.

## CLAUDE.md

Claude Code reads the repo's root `CLAUDE.md` first, then this one whenever it works in `knittingapp/`. Save it as `knittingapp/CLAUDE.md` exactly as below, and add this line to the root `CLAUDE.md`, right after its first paragraph: "Row Tracker (`knittingapp/`) has its own rules in `knittingapp/CLAUDE.md`."

```markdown
# CLAUDE.md — Row Tracker (knittingapp/)

A knitting and crochet row tracker with many projects, quick setup (parts, repeats, reminders) and pattern files. The Pattern Converter (a Claude skill in `converter/`) turns a pattern PDF into a pattern file (JSON). The app opens that file and tracks the knitter's place, offline. **`knittingapp/SPEC.md` is the source of truth for behaviour.** The root CLAUDE.md's rules 1 (public repo), 2 (branch + PR) and 9 (small PRs) apply here too.

Live app: https://jspenc111-stack.github.io/Temp-Apps-Public/knittingapp/

## About the owner
- Not a developer. Explain changes in plain language, and define any technical term the first time you use it.
- Uses an Android phone (Pixel, Chrome), often from the GitHub mobile app. Keep PR descriptions short and skimmable.

## Layout (all in `knittingapp/`)
- `index.html`, `styles.css`, `app.js`: the app (plain HTML/CSS/JS modules, no build step, no npm packages).
- `quick.js`: quick projects (parts, repeats, reminders, undo). No DOM code, so Node tests can run it.
- `pattern.js`: validate, resolve and expand pattern files, plus the movement rules. No DOM code either.
- `converter/SKILL.md` + `converter/pattern.schema.json`: the converter skill and the data model.
- `tests/run.mjs`: tests. `tests/fixtures/`: invented patterns only.

## Commands
- Test: `node knittingapp/tests/run.mjs` (must pass with no failures)
- Preview: `cd knittingapp && python3 -m http.server 8000`, then open http://localhost:8000

## Rules
1. **No real patterns.** Never commit PDFs or converted real patterns; they're copyrighted and this repo is public. Use invented patterns in tests and demos.
2. **No outside requests.** The app loads only its own files: no CDN, web fonts, analytics or tracking. Keep the Content Security Policy in `index.html` strict.
3. **Untrusted files.** Validate every opened pattern file. Show pattern text with `textContent`, never `innerHTML`.
4. **Shared web address.** Every app in this repo shares one browser origin. Only use the `rowtracker.` storage key, and only delete caches named `row-tracker-*`.
5. **Tests first.** Add or adjust a test for any behaviour change, and run the tests before committing.
6. **Keep the data model in step.** If the pattern file format changes, update `converter/pattern.schema.json`, `converter/SKILL.md`, `validate()` in `pattern.js`, the fixtures and SPEC.md in the same PR. A breaking change bumps `version` in the format.
7. **Keep SPEC.md in sync.** Behaviour changes update the matching SPEC section in the same PR.
8. **App changes:** bump the cache name in `sw.js` (e.g. `row-tracker-v2` → `row-tracker-v3`) so installed apps pick up new files.
9. **Mobile first.** Check every screen at 390 px wide, in light and dark mode.
```

## Tests, deployment and acceptance checklist

**Automated** (`node knittingapp/tests/run.mjs`, 57 tests): everything from v2 for `pattern.js`, plus `quick.js`: cleaning messy setup input, row counting and repeat maths, reminders firing on the right rows and the next one announced, undo across a part change and across finishing, open-ended parts, repairing saved data, and the "x min ago" wording. The scans still check: no outside addresses, strict CSP, only the `rowtracker.` key, `sw.js` deletes only `row-tracker-*` caches, no PDFs, no pattern files outside fixtures, no `innerHTML`.

**Checked in a phone-sized headless browser before the PR:** quick setup with two parts and a reminder; counting, undo, part change, reminder banner, lock, reload keeps the place; a pattern file through size and review; two projects on the home screen; the app opens offline; light and dark mode; no requests to other websites.

**To check on the Pixel after merging:** open Row Tracker once online (it updates itself and your v2 pattern appears as a project), try Keep screen on, and convert one of your own patterns in Claude.

**Deployment:** branch `claude/row-tracker-v3` → PR into `main` → the owner merges in the GitHub app. Pages is already on.

**Out of scope:** AI inside the app, syncing between devices, voice control, and the same cache issue in Fishbowl and Counter.

