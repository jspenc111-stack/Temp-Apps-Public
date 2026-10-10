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
