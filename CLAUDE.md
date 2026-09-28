# CLAUDE.md — Fishbowl

This repo holds several small apps, each in its own folder: `fishbowlapp/` (Fishbowl), `Counter/` (Tally Counter) and `knittingapp/` (Row Tracker). GitHub Pages publishes the whole repo. The rules below are for Fishbowl, but rules 1, 2 and 9 apply to every app here.

A shared virtual fishbowl PWA. Friends join a bowl with a room code, add fish (max 15), and feed them. Overfeeding or starving kills fish. Static site on GitHub Pages; shared data in Firebase Firestore with Anonymous Auth. **`fishbowlapp/SPEC.md` is the source of truth for behavior.**

## About the owner
- Not a developer. Explain changes in plain language, and define any technical term the first time you use it.
- Uses an Android phone (Pixel), often from the GitHub mobile app. Keep PR descriptions short and skimmable.

## Layout (all in `fishbowlapp/`)
- `index.html`, `styles.css`, `app.js`: the app (plain HTML/CSS/JS, no build step, no npm packages).
- `fish-rules.js`: pure game logic with no Firebase imports, so it can be tested in Node.
- `fish-art.js`: how the 12 fish types look and swim, and how fullness changes their shape (drawing only).
- `bowl.js`: everything that talks to Firebase.
- `firebase-config.js`: the public Firebase web config. Don't change it unless the owner gives a new one.
- `firestore.rules`: database security rules. The owner pastes these into the Firebase console by hand.
- `tests/run.mjs`: tests. `tools/make_icons.py`: regenerates icons (needs Pillow).

Live app: https://jspenc111-stack.github.io/Temp-Apps-Public/fishbowlapp/

## Commands
- Test: `node fishbowlapp/tests/run.mjs` (must pass with no failures)
- Preview: `cd fishbowlapp && python3 -m http.server 8000`, then open `http://localhost:8000/?demo`

## Rules
1. **This repo is public.** Never commit personal details (real names, emails, room codes people use), or secrets such as Firebase service-account/admin keys. The Firebase web config in `firebase-config.js` is public by design and is fine. Use made-up nicknames and fish in demos and tests.
2. **Work on a branch and open a PR.** Never push straight to `main`: pushing to `main` deploys the live app. Fill in the PR template.
3. **Tests first.** Add or adjust a test for any change to game rules, then run the tests before committing.
4. **Keep SPEC.md in sync.** If behavior changes, update SPEC.md in the same PR. Update the README if setup or everyday use changes.
5. **Rules changes need a manual step.** If `firestore.rules` changes, start the PR description with: "⚠️ After merging, copy the new firestore.rules into Firebase → Firestore Database → Rules → Publish."
6. **Web changes:** bump the cache name in `sw.js` (e.g. `fishbowl-v3` → `fishbowl-v4`) so installed apps pick up new files.
7. **Least privilege.** Don't loosen `firestore.rules`, add Firebase products, or add third-party services without explaining why in the PR. Never allow listing all rooms.
8. **Keep database use small.** Don't sync fish swimming positions or write on a timer; only write when someone adds, feeds, or a death/cleanup is recorded.
9. **Small PRs.** One feature or fix per PR, with a clear title.
10. **Firestore rules have a budget.** Firestore stops after 1000 checks per request, so keep per-fish and per-log-entry checks small, and test a completely full bowl (15 fish, 20 log entries, max-length names) against the Firestore emulator after changing `firestore.rules`.
