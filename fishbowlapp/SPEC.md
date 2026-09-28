# Fishbowl App — Build Spec (v2: shared with friends)

> This is the source of truth for how the app behaves. If behavior changes, update this file in the same pull request.
> It's the owner's spec as written, adjusted only for this repo (folder, live link, file layout). Changes made here on the owner's request are marked **(repo)**, and details worked out while building are in **Notes for this repo** at the end.
> 🚧 marks parts of the spec that aren't built yet (the ❤️ and 🏆 social features come in the next pull request).

## What this is

A small, playful app: a virtual fishbowl that **friends share**. Anyone in the bowl can add fish (up to 15) and feed them. Overfeed a fish and it dies; forget to feed it and it starves. Because friends share one bowl, you have to watch what others have done — if two people feed at once, fish can die.

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

- Every phone in the room listens to the bowl in real time (`onSnapshot`). When anyone adds, feeds, or loses a fish, every open phone should show it within **about 1 second**.
- **Speed requirements (a noticeable lag was seen between two phones):**
  - Keep **one** live listener per bowl, attached as soon as the bowl opens. Never re-fetch the bowl on a timer.
  - When the app comes back to the foreground (`visibilitychange`), check the listener is still attached and re-attach if needed.
  - Sign in anonymously and attach the listener in parallel where possible, not one after the other with extra waits.
  - Update the screen from the listener immediately. Don't wait for animations to finish before applying new data; animate *toward* the new state.
  - The phone that makes a change shows it instantly (Firestore's local update), and other phones animate it as soon as their listener fires.
  - Deaths from overfeeding are written in the same transaction as the feed, so other phones see them right away. Starvation deaths are calculated on every phone from the formula, so they appear everywhere at the same moment even before anyone writes them.
  - Measure the delay while testing on two devices, and mention the result in the PR.

## Screens and flow

**First open (no saved room):** a welcome screen with two buttons.

- **Create a bowl:** generates a new room code, creates the bowl, and opens it.
- **Join a bowl:** a text box for the code (case-insensitive, spaces ignored). Show "No bowl with that code" if it doesn't exist.
- Optional **nickname** field ("What should friends see you as?"), saved on the phone and editable later. Default: "Someone". Max 20 characters. Hint text: "A nickname, not your full name" (it's visible to everyone in the bowl).

**Opening a share link:** `…/fishbowlapp/?room=K7QM3P` joins that bowl directly, skipping the welcome screen.

**Bowl screen:**

- The fishbowl scene (see Visual style).
- **Add fish** button (disabled with "Bowl is full" at 15 living fish).
- **Feed all** button: feeds every living fish.
- **Feed one fish:** tap a fish to select it.
  - The fish pauses for a moment and gets a soft glow.
  - A small card appears near it with its name and color (e.g. "Bubbles · gold"), a fullness bar, and a **Feed this fish** button.
  - Tapping empty water, or waiting 5 seconds, deselects it.
  - Make each fish's tap area generously larger than the fish itself, since fish are moving and fingers are big.
- Counter: "6 / 15 fish".
- Activity line: "Last fed 3 min ago by Sam". This is how friends avoid overfeeding.
- **Feeding history:** tapping the activity line opens a short list of the most recent feeds (up to 20), e.g. "Sam fed everyone · 2:14 PM", "Priya fed Pickle · 11:02 AM". Name individual fish by their fun name (e.g. "Priya fed Pickle"). Save the name in the log entry, so it still reads correctly after that fish is gone. Anyone in the bowl can feed; this just shows who did.
- Header shows the room code and a **Share** button. Share opens the phone's share menu (Web Share API) with the join link; if that's unavailable, copy the link and show "Link copied".
- Menu: change nickname, **Leave bowl** (forgets the room on this phone only; the bowl keeps existing for friends).
- 🚧 **❤️ Send love button** (small, next to Feed all): sends a heart to everyone in the bowl.
  - Every open phone sees a burst of hearts floating up through the water, and a toast: "Sam sent love ❤️".
  - Sending from a selected fish's card ("❤️ Pickle") makes the hearts rise from that fish, and the toast reads "Sam sent love to Pickle ❤️".
  - Limit: one heart per phone every 3 seconds (the button briefly greys out), to keep it fun rather than spammy.
  - Hearts are only shown live; they don't appear if you open the app later.
- 🚧 **🏆 Blame board button** in the header: opens the weekly leaderboard (see "Blame board").

## Blame board 🚧

A playful weekly leaderboard, so friends can take credit (or blame). It resets every **Monday at midnight**, based on the phone's clock.

**This week's awards**, each with the winner's nickname and count:

- **👨‍🍳 Head Chef:** the most feeds (Feed all and Feed this fish each count as one).
- **💀 Grim Feeder:** the most fish killed by overfeeding. The person whose feed pushed a fish over the top gets the blame.
- **🐣 Fish Dealer:** the most fish added.
- **🧓 Oldest Fish:** the fish currently alive that has lived longest, e.g. "Pickle · 31 hours".

**Full table:** every player this week, with their feeds, fish added, and fish overfed. Sorted by feeds.

**Hall of fame (all-time):** the oldest fish ever in this bowl (name, type, age, how it died), and last week's Head Chef and Grim Feeder.

**Blame line in death messages:** "Noodle ate too much 😢 — last fed by Sam".

Ties are shared ("Sam & Priya"). A player with zero of everything doesn't appear.

**Remember the room:** the last room code and nickname are saved in local storage, so reopening the app goes straight to that bowl.

## Fish names

- Every new fish gets a random fun name from a built-in list of **at least 200** cute names, mixing a few styles:
  - **Food:** Pickle, Noodle, Biscuit, Dumpling, Waffle, Muffin, Tater Tot, Jellybean, Pretzel, Meatball, Crumpet, Nacho, Peanut, Mochi
  - **Soft and silly:** Bubbles, Wiggles, Squiggles, Nibbles, Blip, Doodle, Pebble, Button, Marble, Sprout, Fizz, Bloop
  - **Fancy titles:** Sir Swims-a-Lot, Admiral Bubbles, Duchess Fins, Captain Wiggles, Lady Glimmer, Professor Blub, Baron Von Splash
  - **Fishy puns:** Finnegan, Gill-ian, Scaley, Bubba Gill, Splashley, Fintastic, Reel Deal, Wave-y Davey
  - **Cozy classics:** Goldie, Sunny, Pip, Ziggy, Coco, Poppy, Maple, Olive, Sparky, Dash
- Use original names only: no famous movie/cartoon fish, real people, or brand names. Keep them kind (nothing mean or rude).
- Names are unique among the fish currently in the bowl. A name frees up once its fish is gone.
- Show the name when a fish arrives ("Pickle joined the bowl!") and when it dies ("Noodle ate too much 😢" / "Biscuit starved 😢").
- Names are chosen automatically; no renaming in this version.

## Fish rules (starting defaults — safe to tune)

- Max **15** living fish per bowl.
- A new fish starts at fullness **50** (scale 0–100).
- **Each feed adds +5** to each fish it feeds: either every living fish (**Feed all**) or just the tapped fish (**Feed this fish**). So an empty fish can be fed **20 times** before it's full. One more feed after full kills it. A new fish (at 50) can take 10 feeds.
- **Fullness drops 1 point every 864 seconds (14.4 minutes).** A full fish (100) starves in **24 hours**. A new fish has **12 hours**. Each feed buys about **72 minutes**.
- Above **100** → the fish dies of **overfeeding**. At **0** → it dies of **starvation**.
- Keep these as named constants at the top of `fish-rules.js` (`START_FULLNESS = 50`, `FEED_AMOUNT = 5`, `SECONDS_PER_POINT = 864`, `MAX_FISH = 15`) so they're easy to tune.
- A dead fish turns pale, rolls belly-up, floats to the surface, and fades out after about 3 seconds. Then its spot frees up.
  - **(repo)** Exception, at the owner's request: an **overfed** fish **pops** instead (as in v1): it balloons and wobbles for a moment, then bursts into scales and bubbles with a "POP!", and nearby fish dart away. Starved fish float belly-up as above.

**Important — hunger must work without any phone open.** Don't store a fullness value that the app keeps decreasing. Instead, store for each fish:

- `fullness`: the value at the moment it was last changed, and
- `fullnessAt`: when that was.

Current fullness = `fullness − floor((now − fullnessAt) / 864 seconds)`. Every phone calculates it the same way, so a fish can starve overnight even with nobody watching, and everyone sees the same number.

## Data (Firestore)

One document per bowl: `rooms/{ROOMCODE}`. A bowl holds at most 15 fish, so everything fits in one small document.

```
rooms/K7QM3P
  createdAt:   timestamp
  lastFedAt:   timestamp | null
  lastFedBy:   string | null            // nickname
  feedLog:     [ { by: string, at: number (ms), fishId: string | null, fishName: string | null } ]   // null = fed all; newest first, keep only the last 20
  hearts:      [ { by: string, at: number (ms), fishId: string | null, fishName: string | null } ]  // 🚧 newest first, keep only the last 10
  week: {                               // 🚧
    start:     number (ms)              // Monday 00:00 of the current week
    players:   [ { nick: string, feeds: number, added: number, overfed: number } ]   // max 30 entries
  }
  lastWeek:    { headChef: string | null, grimFeeder: string | null } | null        // 🚧
  record:      { name, type, ageHours: number, cause } | null     // 🚧 oldest fish ever
  fish: {
    <fishId>: {
      name:        string               // fun auto-name, unique in the bowl
      type:        string               // one of the fish types (missing on older fish = goldfish)
      color:       string               // from the palette
      addedAt:     number (ms)
      addedBy:     string
      fullness:    number
      fullnessAt:  number (ms)
      diedAt:      number (ms) | null
      cause:       "overfed" | "starved" | null
      blame:       string | null        // 🚧 nickname of whoever gave the fatal feed (overfed only)
    }
  }
```

- **Add fish** and **Feed** must run as Firestore **transactions**, so two friends tapping at the same moment can't overwrite each other or exceed 15 fish. (A transaction reads the latest bowl, changes it, and saves it as one step. If someone else changed it in between, it automatically retries.)
- On Feed, use each fed fish's *current* calculated fullness, add 5, and mark any fish that goes over 100 as dead (`cause: "overfed"`). **Feed all** changes every living fish; **Feed this fish** changes only that one (if it has died in the meantime, do nothing and show "Too late — that fish is gone"). In the same transaction, add `{by: nickname, at: now, fishId, fishName}` to the front of `feedLog` (`fishId` is null for Feed all) and trim it to 20 entries. Also in the same transaction (🚧):
- 🚧 Add 1 to the feeder's `feeds` in `week.players`.
- 🚧 For each fish killed by this feed, set its `blame` to the feeder and add 1 to the feeder's `overfed`.
- 🚧 **Add fish** adds 1 to the adder's `added`.
- 🚧 **Weekly reset:** any write that happens after next Monday midnight first saves the winners into `lastWeek`, then clears `week.players` and sets a new `week.start`.
- 🚧 **Oldest-fish record:** when a fish dies, compare its age with `record` and replace the record if this fish lived longer.
- 🚧 **Sending a heart** is its own small transaction: add to the front of `hearts` and trim to 10. Phones animate hearts that arrive through the live listener, if they're less than 10 seconds old.
- Starvation happens on its own through the formula. Any open phone that sees a starved fish records `diedAt`/`cause` in a transaction.
- Dead fish are removed from the document after their fade-out (about 1 minute after `diedAt` is fine). Any phone may do this cleanup.
- **Fish swimming positions are NOT synced.** Each phone animates its fish locally. Only the fish list, colors, fullness, and deaths are shared. This keeps database usage tiny.
- Small clock differences between phones are acceptable.

## Security rules (`firestore.rules`)

Write a rules file that:

- only allows reads and writes from signed-in users (Anonymous Auth counts as signed in),
- allows reading **one bowl by its code** but **never listing** the `rooms` collection, so nobody can browse other people's bowls,
- only allows the `rooms/{code}` path, where the code matches the 6-character format,
- rejects a bowl with more than 15 fish or a `feedLog` longer than 20 entries,
- rejects nicknames, fish names, and fish types longer than 20 characters,
- 🚧 rejects more than 10 `hearts` or more than 30 `week.players` entries,
- rejects deleting rooms.

Include the file in the repo. The owner pastes it into the Firebase console (see setup steps below).

## Offline behavior

- The app itself still opens offline (the service worker caches the app files).
- While offline, show "Offline" and disable **Add fish** and **Feed** (transactions need a connection). Keep showing the last known bowl, with fullness still counting down.
- The service worker must not cache Firebase/Google network requests.

## Visual style — realistic 2D

Goal: look like a real fishbowl sitting somewhere, not a flat icon. Everything drawn in 2D (SVG or Canvas), no photos or image files — shapes, gradients, and shading only.

**Size on screen:** the bowl should be as big as the screen allows.

- On a phone in portrait, the bowl is about **92% of the screen width**, and as tall as fits between the header and buttons.
- On bigger screens, cap it so it doesn't get silly.
- **Fish sizes are relative to the bowl**, so a bigger bowl means bigger fish automatically. On top of that, all fish get an extra **10%** (`FISH_BASE_SCALE = 1.25` total, up from 1.15).

**Outside the bowl (the environment):**

- A simple background behind the bowl, like a soft-lit room, windowsill, or tabletop, so the bowl sits somewhere instead of floating in space.
- A soft shadow under the bowl on that surface.
- A curved highlight/reflection on the glass and a subtle rim, to sell "glass".

**Inside the bowl:**

- Water with a light blue-green tint, slightly darker toward the bottom.
- A visible waterline near the top with a subtle shimmer.
- Gravel or sand on the bottom (small varied pebbles).
- 1–2 plants (wavy seaweed shapes) gently swaying.
- **A small castle** sitting on the gravel, off to one side.
  - Grey-stone look, with a couple of little towers, a flag, and an arched doorway fish can swim through.
  - A stream of bubbles rises from one tower top.
  - Draw it with shading so it looks like it sits *in* the gravel (partly sunk, darker at the base).
  - Fish treat it as an obstacle and swim around it, except through the arch. Fish can sometimes hide behind it (drawn in front of them).
  - The castle takes up roughly 15% of the bowl's width, so it doesn't crowd 15 fish.
- Small bubbles rising from the bottom and popping at the waterline.
- Optional: faint light rays through the water for depth.

**The fish:**

- A proper fish silhouette (body, tail fin, and a small dorsal/side fin), not just an oval.
- Shading on the body (darker top, lighter belly) and a visible eye.
- The tail flicks while swimming, and the body tilts toward its direction of travel.

**Fish types (lots of variety):** each new fish gets a random type. Each type has its own body shape, fins, colors, and swimming style, so the bowl looks like a mixed community tank:

| Type | Look | Swims |
|---|---|---|
| Goldfish | Classic round-ish body; orange, gold, white, or calico | Steady, relaxed |
| Fantail | Egg-shaped body, big double flowing tail | Slow, wobbly |
| Comet | Slim body, very long forked tail; orange/red and white | Fast glides |
| Betta | Long, trailing, silky fins; deep blue, red, or purple | Slow and floaty, fins ripple |
| Guppy | Small body, big fan tail with bright patterns | Quick little darts |
| Neon tetra | Small and slim; glowing blue stripe, red lower half | Quick, zippy |
| Angelfish | Tall, flat, triangle shape with long top/bottom fins; silver with dark stripes | Graceful, slow turns |
| Zebra danio | Slim, horizontal blue-and-silver stripes | Fast, darting |
| Molly | Chunky body, sail-like top fin; black, gold, or speckled | Steady |
| Platy | Short, stocky; red, yellow, or blue-orange | Bobbing |
| Pufferfish (cartoony freshwater puffer) | Round with a cute face and spots | Hovers, slow |
| Pleco | Flat-bottomed, spotted brown, sucker mouth | Stays near the gravel and glass |

- Colors vary within each type, so two goldfish rarely look identical.
- The fullness look (below) applies to every type.

**Data:** add `type` to each fish (one of the types above). Fish created before this change have no `type`; treat them as `goldfish`. The selected-fish card and messages use the type name, e.g. "Pickle · betta".

**Fullness should be easy to see (pronounced, not subtle):**

- **Make it dramatic.** Someone glancing at the bowl should instantly tell a starving fish from a stuffed one.
  - Body **height/girth:** about **0.6×** normal at 0 (skinny, sunken belly), **1.0×** at 50, and **2.0×** at 100 (nearly a ball).
  - Body **length** also grows a little: **0.9×** at 0 up to **1.2×** at 100.
  - The **belly** bulges visibly downward as it fills, with a lighter, stretched-looking belly highlight when very full.
  - Scale the body, not the eye or fins, so a full fish looks comically round with small fins.
- **Base size:** all fish are drawn about **25% bigger** than the original design (before any fullness scaling). Keep this as one constant (`FISH_BASE_SCALE = 1.25`) so it's easy to tweak.
- Size changes animate smoothly (about 0.6 s), with a slight wobble at the end, and never jump.
- When one fish is fed, the flakes drop just above it and it swims up to eat them. When all are fed, flakes are spread across the surface.
- **A fish only grows after it eats.** Tapping Feed saves the new fullness straight away (so the data is correct on every phone), but the fish's *look* stays at its old size until it reaches the food:
  1. Flakes appear and start sinking.
  2. The fish swims to its nearest flake.
  3. When it reaches the flake, the flake disappears into its mouth, the fish does its gulp puff, and **then** it grows to the new size.
  4. If a fish can't reach its food within about 4 seconds (e.g. it's on the far side), it still eats and grows then, so the look never falls far behind.
- Every phone in the bowl plays the same eat-then-grow sequence.
- **An overfed fish eats first, then dies:** it swims up, eats, puffs up huge, and *then* turns belly-up. The death message appears at that moment, not when Feed is tapped. **(repo)** It then pops (see Fish rules).
- On each feed: a big "gulp" puff (grow ~25% past the new size, then bounce back), a few food flakes sinking from the waterline, and the fish's mouth opening as it eats.
- Near full (90+): the fish swims noticeably slower and looks stuffed.

**"About to pop" indicator (fun, but clear):** shows how many feeds a fish can take before it dies. Calculate it in `fish-rules.js` as `feedsUntilPop(fullness)`. With +5 per feed and death above 100:

- **2 feeds away** (fullness 91–95), "Getting full":
  - A small yellow "!" bubble floats above the fish.
  - The fish gives the occasional little burp bubble, and its cheeks look puffed.
- **1 feed away** (fullness 96–100), "Danger — one more bite!":
  - The bubble turns red, pulses, and shows 🤢 or 😵.
  - The fish trembles slightly, and a sweat drop appears.
  - Its belly stretches with a shiny highlight.
- **Selected-fish card:** "Pickle is stuffed — 2 more bites max" / "Pickle will pop if you feed it! 😬". **(repo)** The first message reads "Pickle is stuffed — only 1 more bite is safe", because at 2 feeds away the second bite pops it.
- **Feed all button:** if any fish is 1 feed away, show a small ⚠️ on the button and a hint ("Careful: Pickle is stuffed"). This is just a warning; still allow feeding.
- The indicator updates live as the fish gets hungrier over time (each feed wears off in about 72 minutes), and every phone shows the same thing.
- It appears once the eat-then-grow animation finishes, not the moment Feed is tapped.
- Hungry (below 20): colors fade toward grey and the fish swims a little erratically.

**Fish spread out (no crowding):**

- Each fish keeps a minimum distance from the others (about 1.5 body lengths, shrinking gently toward 1 body length when the bowl is crowded with up to 15 fish). When two get too close, they gently steer apart.
- Each fish picks random destination points spread across the whole bowl, at different depths (top, middle, and bottom). Avoid everyone drifting to the same spot or clumping in the middle.
- Fish stay inside the bowl's curved glass, above the gravel and below the waterline. They turn around smoothly at edges instead of bouncing.
- **New fish plop in from the top:**
  - The fish drops from above the bowl into the water over the emptiest part of the bowl.
  - It makes a small splash at the waterline: a few droplets, and ripple rings spreading across the surface.
  - It sinks a short way with a few bubbles, does a little shake/wiggle, and then starts swimming normally.
  - The whole plop takes about 1.5 seconds.
  - Every phone in the bowl plays the plop, not just the one that added the fish. Only play it for fish added in the last ~10 seconds, so reopening the app doesn't replay old arrivals.

**Age and birthday hats:**

- Each fish's age is counted in **hours** from `addedAt`.
- The selected-fish card shows it, e.g. "Pickle · betta · 7 hours old". Under 1 hour, show "Just arrived".
- At **12 hours**, the fish gets a little **party hat**: a colorful cone with a pom-pom, sitting on its head and tilting as it swims. It keeps the hat for the rest of its life.
- The moment a fish turns 12 hours old, show a toast on any open phone: "🎉 Pickle is 12 hours old!", with a small confetti burst in the water. Everyone sees the same thing because it's calculated from `addedAt`.

## PWA requirements

- `manifest.webmanifest`: app name, theme color, icons (192, 512, and a maskable 512), `display: standalone`, `start_url`.
- A service worker that caches the app's own files.
- Icons: a simple fish or bowl, generated by a small script (no hand-drawn assets needed).

## File structure

Inside `fishbowlapp/`:

```
index.html
styles.css
app.js               // UI, scene, animation (including the castle)
fish-art.js          // (repo) how the 12 fish types look and swim; fullness shapes; party hats
fish-rules.js        // pure game logic: constants, fullness math, feeding, deaths, names, types, age (no Firebase imports)
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

`node fishbowlapp/tests/run.mjs` tests the game logic in `fish-rules.js` with no internet and no npm packages: fullness math over time (full fish starves at exactly 24 h), +5 per feed, feeding one fish leaves the others unchanged, fish names are unique in the bowl, the name list has at least 200 unique names, every new fish gets a valid type, old fish with no type count as goldfish, the 20-feed limit (21st feed from empty kills it), `feedsUntilPop` returns 2 at fullness 91–95 and 1 at 96–100, overfeed death, starvation, the feed log keeping only 20 entries, the 15-fish limit, age in hours, the party hat at exactly 12 hours, 🚧 blame-board counts (feeds, added, overfed blame goes to the fatal feeder), 🚧 the Monday weekly reset moving winners into last week, 🚧 ties, 🚧 the oldest-fish record, 🚧 hearts trimmed to 10, and room-code format. Also a privacy test that scans public files for email addresses and secret-looking keys (other than the known Firebase web config). GitHub runs the tests on every pull request and before every deploy.

## Deployment

- Uses the owner's existing public repo `Temp-Apps-Public`, folder `fishbowlapp/`. GitHub Pages via GitHub Actions on every push to `main`. The workflow publishes the **whole repo**, so the other apps in it (Counter, knittingapp) stay live too.
- Live URL: **https://jspenc111-stack.github.io/Temp-Apps-Public/fishbowlapp/**
- `?demo` shows a local-only sample bowl with no Firebase, for previewing.

## Firebase config (provided by the owner)

`firebase-config.js` holds the project's public web config. It's fine to commit it to the public repo. Don't add any other Firebase credentials, such as service-account or admin keys.

## Firebase setup — the owner's manual steps

The step-by-step Firebase setup is in `README.md` (steps 1–5 are done). After any change to `firestore.rules`, the new rules must be pasted into Firebase → Firestore Database → Rules → Publish.

## Out of scope (for this version)

- Real accounts, private invites, or removing someone from a bowl.
- Syncing fish swimming positions.
- Multiple bowls at once on one phone.
- Push notifications (e.g. "your fish are hungry"). A possible future idea.
- Sound.

The spec's "CLAUDE.md" section lives in `/CLAUDE.md` at the repo root.

## Notes for this repo

These are details worked out while building, which the spec left open:

- **The feed log is append-only** in `firestore.rules`: a save may add one new entry at the front (dropping the oldest once there are 20), and older entries can't be changed or erased. This keeps the rules within Firestore's limit of 1000 checks per request even for a completely full bowl (only the new entry needs checking), and it means nobody can rewrite the feeding history.
- Because that rule compares against the saved bowl, a save built on an out-of-date copy (two friends tapping at the same instant) can be refused. `bowl.js` then retries the whole transaction, up to 5 times with a short random pause, so both feeds land.
- **The per-fish checks in the rules are as cheap as possible** for the same 1000-check reason: a fish's `name`, `addedBy` and `type` are each checked to be 20 characters or fewer, without separate "is it text" checks (those roughly doubled the cost). With 15 fish, a completely full bowl with every field at maximum length still passes with room to spare.
- **Adding a fish clears out dead fish first**, so the bowl document never holds more than 15 fish in total (the rules count dead fish too).
- A starved fish's `diedAt` is recorded as the moment it actually reached 0 (worked out from the formula), not the moment a phone noticed.
- **Data is instant, looks follow the food.** The saved bowl changes the moment someone feeds (and the phone that taps shows it straight away by applying the same game rules locally, then saves it with the same tap time, fish id, name, type and color). What a fish *looks* like follows the eat-then-grow sequence above, capped at 4 seconds. The fullness bar on the card and the "about to pop" warnings follow the look.
- After more than 30 seconds in the background, the app starts a fresh live listener when it comes back, because phones often freeze a backgrounded app's connection.
- **Measuring the delay:** open the app with `?debug` at the end of the link on two phones. When a friend feeds or adds a fish, the message shows how many milliseconds it took to arrive (this depends on the two phones' clocks agreeing).
- **Types:** stored as short keys (`goldfish`, `fantail`, `comet`, `betta`, `guppy`, `tetra`, `angelfish`, `danio`, `molly`, `platy`, `puffer`, `pleco`); the screen shows the full name (e.g. "neon tetra", "zebra danio", "pufferfish"). A new fish prefers a type that isn't in the bowl yet. Each type has 2–4 color looks, and every fish gets a slight shade of its own.
- The arrival message includes the type: "Pickle the betta joined the bowl!".
- Names that belong to famous cartoon or movie characters (for example Coral, Pearl, Oscar) are left out of the name list.
- **The castle** sits left of centre (the left plant moved a little further left to make room). About 1 in 8 times a fish picks somewhere new to go, it takes a castle trip instead: through the arched doorway to the other side, or a short rest hiding behind the castle. Flakes that land on the castle stay on top of it. The pleco (a bottom dweller) doesn't take castle trips.
- The bowl was already about 92% of a phone's width; it's now a named setting (`BOWL_WIDTH_SHARE`) with a larger cap for big screens.
- Tapping empty water also sends a ripple that makes nearby fish dart away (a small extra from v1).
