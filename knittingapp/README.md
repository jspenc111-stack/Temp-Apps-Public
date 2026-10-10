# Row Tracker

A knitting and crochet row tracker in two parts:

1. **Pattern Converter** (runs in Claude): turns a pattern PDF into a small pattern file.
2. **Row Tracker** (this app, on your phone): opens that file and keeps your place, row by row.

Live app: https://jspenc111-stack.github.io/Temp-Apps-Public/knittingapp/

## Everyday use

1. **In Claude:** share your pattern PDF and say "convert this for Row Tracker". Download the `.json` file it gives you. (A `.json` file is just a text file laid out in a fixed shape that apps can read.)
2. **In Row Tracker:** tap "Open pattern file" and pick the file from Downloads. You can also share the file to Row Tracker from Android's share menu, or paste its text into the box.
3. Pick your size, look over the "Check it" screen, then tap "Start knitting".
4. Tap "Row done" at the end of each row. Your place is saved after every tap.

No pattern? "Just count rows" gives you a plain row and stitch counter.

The app works offline once it has been opened. To install it on Android, open the site in Chrome, then choose menu → "Add to Home screen" (or "Install app").

## Setting up the converter in Claude (once)

The folder `converter/` is a Claude skill: a set of instructions Claude follows when you ask it to convert a pattern. It holds two files, `SKILL.md` (the instructions) and `pattern.schema.json` (the exact shape of a pattern file). Add both to Claude as a skill named `pattern-converter`. After that, any chat can convert a pattern.

## Privacy

- Your pattern and your place stay on your phone. The app never sends them anywhere, and it loads nothing from other websites.
- The only time a pattern goes anywhere is when you share it with Claude to convert it.
- **Never put real patterns or PDFs in this repo.** It is public, and patterns are copyrighted by their designers. The test patterns in `tests/fixtures/` are invented.

## Files

- `index.html`, `styles.css`, `app.js`: the app's screens and buttons
- `pattern.js`: the pattern logic (checking a file, working out the steps for your size, moving through them)
- `sw.js`: the service worker, which saves a copy of the app so it opens without internet
- `manifest.webmanifest`, `icon-*.png`: the app's name, colours and home screen icons
- `converter/`: the Pattern Converter skill
- `tests/`: automated tests and invented test patterns
- `SPEC.md`: how the app is meant to behave. `CLAUDE.md`: rules for Claude Code

## For whoever changes the app

- Run the tests: `node knittingapp/tests/run.mjs`
- Preview: `cd knittingapp && python3 -m http.server 8000`, then open http://localhost:8000
- After changing any app file, bump `VERSION` in `sw.js` (for example `row-tracker-v2` → `row-tracker-v3`). Otherwise phones keep showing the old saved copy.
