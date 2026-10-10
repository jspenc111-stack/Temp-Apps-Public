# CLAUDE.md — Row Tracker (knittingapp/)

A knitting and crochet row tracker. The Pattern Converter (a Claude skill in `converter/`) turns a pattern PDF into a pattern file (JSON). The app opens that file and tracks the knitter's place, offline. **`knittingapp/SPEC.md` is the source of truth for behaviour.** The root CLAUDE.md's rules 1 (public repo), 2 (branch + PR) and 9 (small PRs) apply here too.

Live app: https://jspenc111-stack.github.io/Temp-Apps-Public/knittingapp/

## About the owner
- Not a developer. Explain changes in plain language, and define any technical term the first time you use it.
- Uses an Android phone (Pixel, Chrome), often from the GitHub mobile app. Keep PR descriptions short and skimmable.

## Layout (all in `knittingapp/`)
- `index.html`, `styles.css`, `app.js`: the app (plain HTML/CSS/JS modules, no build step, no npm packages).
- `pattern.js`: validate, resolve and expand pattern files, plus the movement rules. No DOM code, so Node tests can run it.
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
