# Fishbowl App — Build Spec (v2: shared with friends)

> This is the source of truth for how the app behaves. If behavior changes, update this file in the same pull request.
> Repo-specific details (folder, live link, rules limits) are at the end under **Notes for this repo**.

## What this is

A small, playful app: a virtual fishbowl that **friends share**. Anyone in the bowl can add fish (up to 10) and feed them. Overfeed a fish and it dies; forget to feed it and it starves. Because friends share one bowl, you have to watch what others have done — if two people feed at once, fish can die.

## Type of app

**Progressive Web App (PWA)** — installable on the home screen, deployed to GitHub Pages.
Plain HTML, CSS, and vanilla JavaScript. No framework, no build step.
Shared data lives in **Firebase Firestore** (Google's free online database). The Firebase SDK is loaded from Google's CDN as ES modules.

## Sharing model

**Level 1 — room code, no sign-in**

- Each bowl has a 6-character **room code** (e.g. `K7QM3P`). Use only easy-to-read characters: `A–Z` and `2–9`, excluding `I`, `O`, `0`, `1`.
- Generate codes with `crypto.getRandomValues` (not `Math.random`). Create the room in a transaction that fails if the code is already taken, then try a new code.
- Anyone with the code can see and change that bowl. The code is the only "password", so it must be random.
- There are no accounts or passwords. The app uses Firebase **Anonymous Authentication** behind the scenes (invisible to the user) so the database can reject traffic that isn't from the app.

**Level 4 — live updates**

- Every phone in the room listens to the bowl in real time (`onSnapshot`). When anyone adds or feeds fish, every open phone updates within about a second.

## Screens and flow

**First open (no saved room):** a welcome screen with two buttons.

- **Create a bowl:** generates a new room code, creates the bowl, and opens it.
- **Join a bowl:** a text box for the code (case-insensitive, spaces ignored). Show "No bowl with that code" if it doesn't exist.
- Optional **nickname** field ("What should friends see you as?"), saved on the phone and editable later. Default: "Someone". Max 20 characters. Hint text: "A nickname, not your full name" (it's visible to everyone in the bowl).

**Opening a share link:** `…/fishbowlapp/?room=K7QM3P` joins that bowl directly, skipping the welcome screen.

**Bowl screen:**

- The fishbowl scene (see Visual style).
- **Add fish** button (disabled with "Bowl is full" at 10 living fish).
- **Feed all** button: feeds every living fish.
- **Feed one fish:** tap a fish to select it.
  - The fish pauses for a moment and gets a soft glow.
  - A small card appears near it with its name and color (e.g. "Bubbles · gold"), a fullness bar, and a **Feed this fish** button.
  - Tapping empty water, or waiting 5 seconds, deselects it.
  - Make each fish's tap area generously larger than the fish itself, since fish are moving and fingers are big.
- Counter: "6 / 10 fish".
- Activity line: "Last fed 3 min ago by Sam". This is how friends avoid overfeeding.
- **Feeding history:** tapping the activity line opens a short list of the most recent feeds (up to 20), e.g. "Sam fed everyone · 2:14 PM", "Priya fed Pickle · 11:02 AM". Name individual fish by their fun name (e.g. "Priya fed Pickle"). Save the name in the log entry, so it still reads correctly after that fish is gone. Anyone in the bowl can feed; this just shows who did.
- Header shows the room code and a **Share** button. Share opens the phone's share menu (Web Share API) with the join link; if that's unavailable, copy the link and show "Link copied".
- Menu: change nickname, **Leave bowl** (forgets the room on this phone only; the bowl keeps existing for friends).

**Remember the room:** the last room code and nickname are saved in local storage, so reopening the app goes straight to that bowl.

## Fish names

- Every new fish gets a random fun name from a built-in list of about 60 (e.g. Bubbles, Captain, Sprinkles, Admiral, Pickle, Noodle, Biscuit, Goldie, Flash, Pebble, Wiggles, Sir Swims-a-Lot). Use original names only — no famous movie or cartoon fish.
- Names are unique among the fish currently in the bowl. A name frees up once its fish is gone.
- Show the name when a fish arrives ("Pickle joined the bowl!") and when it dies ("Noodle ate too much 😢" / "Biscuit starved 😢").
- Names are chosen automatically; no renaming in this version.

## Fish rules (starting defaults — safe to tune)

- Max **10** living fish per bowl.
- A new fish starts at fullness **50** (scale 0–100).
- **Each feed adds +5** to each fish it feeds: either every living fish (**Feed all**) or just the tapped fish (**Feed this fish**). So an empty fish can be fed **20 times** before it's full. One more feed after full kills it. A new fish (at 50) can take 10 feeds.
- **Fullness drops 1 point every 864 seconds (14.4 minutes).** A full fish (100) starves in **24 hours**. A new fish has **12 hours**. Each feed buys about **72 minutes**.
- Above **100** → the fish dies of **overfeeding**. At **0** → it dies of **starvation**.
- Keep these as named constants at the top of `fish-rules.js` (`START_FULLNESS = 50`, `FEED_AMOUNT = 5`, `SECONDS_PER_POINT = 864`, `MAX_FISH = 10`) so they're easy to tune.
- **Overfed fish pop** (as in v1): the fish balloons and wobbles for a moment, then bursts into scales and bubbles with a "POP!", and nearby fish dart away.
- **Starved fish** turn pale, roll belly-up, float to the surface, and fade out after about 3 seconds.
- Either way, the fish's spot then frees up.

**Important — hunger must work without any phone open.** Don't store a fullness value that the app keeps decreasing. Instead, store for each fish:

- `fullness`: the value at the moment it was last changed, and
- `fullnessAt`: when that was.

Current fullness = `fullness − floor((now − fullnessAt) / 864 seconds)`. Every phone calculates it the same way, so a fish can starve overnight even with nobody watching, and everyone sees the same number.

## Data (Firestore)

One document per bowl: `rooms/{ROOMCODE}`. A bowl holds at most 10 fish, so everything fits in one small document.

```
rooms/K7QM3P
  createdAt:   timestamp
  lastFedAt:   timestamp | null
  lastFedBy:   string | null            // nickname
  feedLog:     [ { by: string, at: number (ms), fishId: string | null, fishName: string | null } ]   // null = fed all; newest first, keep only the last 20
  fish: {
    <fishId>: {
      name:        string               // fun auto-name, unique in the bowl
      color:       string               // from the palette
      addedAt:     number (ms)
      addedBy:     string
      fullness:    number
      fullnessAt:  number (ms)
      diedAt:      number (ms) | null
      cause:       "overfed" | "starved" | null
    }
  }
```

- **Add fish** and **Feed** must run as Firestore **transactions**, so two friends tapping at the same moment can't overwrite each other or exceed 10 fish. (A transaction reads the latest bowl, changes it, and saves it as one step. If someone else changed it in between, it automatically retries.)
- On Feed, use each fed fish's *current* calculated fullness, add 5, and mark any fish that goes over 100 as dead (`cause: "overfed"`). **Feed all** changes every living fish; **Feed this fish** changes only that one (if it has died in the meantime, do nothing and show "Too late — that fish is gone"). In the same transaction, add `{by: nickname, at: now, fishId, fishName}` to the front of `feedLog` (`fishId` is null for Feed all) and trim it to 20 entries.
- Starvation happens on its own through the formula. Any open phone that sees a starved fish records `diedAt`/`cause` in a transaction.
- Dead fish are removed from the document after their fade-out (about 1 minute after `diedAt` is fine). Any phone may do this cleanup.
- **Fish swimming positions are NOT synced.** Each phone animates its fish locally. Only the fish list, colors, fullness, and deaths are shared. This keeps database usage tiny.
- Small clock differences between phones are acceptable.

## Security rules (`firestore.rules`)

Write a rules file that:

- only allows reads and writes from signed-in users (Anonymous Auth counts as signed in),
- allows reading **one bowl by its code** but **never listing** the `rooms` collection, so nobody can browse other people's bowls,
- only allows the `rooms/{code}` path, where the code matches the 6-character format,
- rejects a bowl with more than 10 fish or a `feedLog` longer than 20 entries,
- rejects nicknames and fish names longer than 20 characters,
- rejects deleting rooms.

Include the file in the repo. The owner pastes it into the Firebase console (see setup steps below).

## Offline behavior

- The app itself still opens offline (the service worker caches the app files).
- While offline, show "Offline" and disable **Add fish** and **Feed** (transactions need a connection). Keep showing the last known bowl, with fullness still counting down.
- The service worker must not cache Firebase/Google network requests.

## Visual style — realistic 2D

Goal: look like a real fishbowl sitting somewhere, not a flat icon. Everything drawn in 2D (SVG or Canvas), no photos or image files — shapes, gradients, and shading only.

**Outside the bowl (the environment):**

- A simple background behind the bowl, like a soft-lit room, windowsill, or tabletop, so the bowl sits somewhere instead of floating in space.
- A soft shadow under the bowl on that surface.
- A curved highlight/reflection on the glass and a subtle rim, to sell "glass".

**Inside the bowl:**

- Water with a light blue-green tint, slightly darker toward the bottom.
- A visible waterline near the top with a subtle shimmer.
- Gravel or sand on the bottom (small varied pebbles).
- 1–2 plants (wavy seaweed shapes) gently swaying.
- Small bubbles rising from the bottom and popping at the waterline.
- Optional: faint light rays through the water for depth.

**The fish:**

- A proper fish silhouette (body, tail fin, and a small dorsal/side fin), not just an oval.
- Shading on the body (darker top, lighter belly) and a visible eye.
- The tail flicks while swimming, and the body tilts toward its direction of travel.
- Each fish gets a color from a varied palette (orange, gold, silver, red, calico, etc.).

**Fullness should be easy to see (pronounced, not subtle):**

- Body girth scales clearly with fullness: about **0.8×** normal at 0 (thin, sunken belly), **1.0×** at 50, and **1.5×** at 100 (very round, belly bulging). Scale the body's height and belly curve, not the tail or eye.
- Changes animate smoothly (about 0.5 s), never jump.
- When one fish is fed, the flakes drop just above it and it swims up to eat them. When all are fed, flakes are spread across the surface.
- On each feed: a quick "gulp" puff (grow ~10% past the new size, then settle back) and a few food flakes sinking from the waterline.
- Near full (90+): the fish swims noticeably slower and looks stuffed. This is the visual warning that one more feed is dangerous.
- Hungry (below 20): colors fade toward grey and the fish swims a little erratically.

**Fish spread out (no crowding):**

- Each fish keeps a minimum distance from the others (about 1.5 body lengths). When two get too close, they gently steer apart.
- Each fish picks random destination points spread across the whole bowl, at different depths (top, middle, and bottom). Avoid everyone drifting to the same spot or clumping in the middle.
- Fish stay inside the bowl's curved glass, above the gravel and below the waterline. They turn around smoothly at edges instead of bouncing.
- New fish appear in the emptiest part of the bowl.

## PWA requirements

- `manifest.webmanifest`: app name, theme color, icons (192, 512, and a maskable 512), `display: standalone`, `start_url`.
- A service worker that caches the app's own files.
- Icons: a simple fish or bowl, generated by a small script (no hand-drawn assets needed).

## File structure

Inside `fishbowlapp/`:

```
index.html
styles.css
app.js               // UI, scene, animation
fish-rules.js        // pure game logic: constants, fullness math, feeding, deaths, names (no Firebase imports)
bowl.js              // Firebase: sign-in, live listener, transactions (uses fish-rules.js)
firebase-config.js   // the Firebase project's web config (from the owner)
firestore.rules
manifest.webmanifest
sw.js
icons/…
tools/make_icons.py
tests/run.mjs        // tests for fish-rules.js (run with node, no packages)
README.md            // plain-language guide, includes the Firebase setup steps
SPEC.md              // this file
```

At the repo root (shared by all the apps in the repo):

```
CLAUDE.md                           // rules for Claude Code
.claude/settings.json               // pre-approved safe commands
.github/workflows/pages.yml         // deploy to GitHub Pages on push to main (runs tests first)
.github/workflows/test.yml          // run tests on every pull request
.github/pull_request_template.md    // plain-English "do I need to do anything?" checklist
.github/dependabot.yml              // keeps GitHub Actions up to date
```

## Tests

`node fishbowlapp/tests/run.mjs` tests the game logic in `fish-rules.js` with no internet and no npm packages: fullness math over time (full fish starves at exactly 24 h), +5 per feed, feeding one fish leaves the others unchanged, fish names are unique in the bowl, the 20-feed limit (21st feed from empty kills it), overfeed death, starvation, the feed log keeping only 20 entries, the 10-fish limit, and room-code format. Also a privacy test that scans public files for email addresses and secret-looking keys (other than the known Firebase web config). GitHub runs the tests on every pull request and before every deploy.

## Deployment

- Uses the owner's existing public repo `Temp-Apps-Public`, folder `fishbowlapp/`. GitHub Pages via GitHub Actions on every push to `main`. The workflow publishes the **whole repo**, so the other apps in it (Counter, knittingapp) stay live too.
- Live URL: **https://jspenc111-stack.github.io/Temp-Apps-Public/fishbowlapp/**
- `?demo` shows a local-only sample bowl with no Firebase, for previewing.

## Firebase config (provided by the owner)

`firebase-config.js` holds the project's public web config. It's fine to commit it to the public repo. Don't add any other Firebase credentials, such as service-account or admin keys.

## Firebase setup — the owner's manual steps

The step-by-step Firebase setup is in `README.md`. After any change to `firestore.rules`, the new rules must be pasted into Firebase → Firestore Database → Rules → Publish.

## Out of scope (for this version)

- Real accounts, private invites, or removing someone from a bowl.
- Syncing fish swimming positions.
- Multiple bowls at once on one phone.
- Push notifications (e.g. "your fish are hungry"). A possible future idea.
- Sound.

## Notes for this repo

These are details worked out while building, which the original spec left open:

- **The feed log is append-only** in `firestore.rules`: a save may add one new entry at the front (dropping the oldest once there are 20), and older entries can't be changed or erased. This keeps the rules within Firestore's limit of 1000 checks per request even for a completely full bowl (only the new entry needs checking), and it means nobody can rewrite the feeding history.
- Because that rule compares against the saved bowl, a save built on an out-of-date copy (two friends tapping at the same instant) can be refused. `bowl.js` then retries the whole transaction, up to 5 times with a short random pause, so both feeds land.
- The per-fish checks in the rules are deliberately small for the same 1000-check reason.
- **Adding a fish clears out dead fish first**, so the bowl document never holds more than 10 fish in total (the rules count dead fish too).
- A starved fish's `diedAt` is recorded as the moment it actually reached 0 (worked out from the formula), not the moment a phone noticed.
- Overfed fish finish eating their flakes before popping, so you can see which feed did it.
- Tapping empty water also sends a ripple that makes nearby fish dart away (a small extra from v1).
