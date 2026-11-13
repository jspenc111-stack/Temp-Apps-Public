# Row Tracker

A knitting and crochet row counter that understands structure: many projects, parts with row counts and repeats, "every 6 rows: decrease" reminders, one big button, undo, and a lock switch. Pattern PDFs can be turned into pattern files by the Pattern Converter (a Claude skill in `converter/`) and opened here, row by row.

Everything stays on the phone. The app makes no requests to other websites.

Live: https://jspenc111-stack.github.io/Temp-Apps-Public/knittingapp/ — on Android, open it in Chrome and choose menu → "Install app" (or "Add to Home screen").

## Files
- `index.html`, `styles.css`, `app.js`: the app
- `quick.js`: quick projects (parts, repeats, reminders, undo)
- `pattern.js`: pattern files (checking, sizes, movement)
- `sw.js`: offline helper. Bump the cache name when files change.
- `converter/`: the Pattern Converter skill and the pattern-file schema
- `tests/run.mjs`: `node knittingapp/tests/run.mjs`
- `SPEC.md`: how it all behaves, and why
