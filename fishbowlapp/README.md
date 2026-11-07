# Fishbowl

A fishbowl you share with friends. Anyone in the bowl can add fish (up to 15) and feed them. Feed a fish too much and it dies; forget to feed it and it starves. Everyone sees the same bowl, live, so check who fed the fish last before you feed them again. Old Barnaby, a wise old crab, lives on the gravel and looks out for the fish.

**Live app:** https://jspenc111-stack.github.io/Temp-Apps-Public/fishbowlapp/
**Demo (nothing is saved or shared):** https://jspenc111-stack.github.io/Temp-Apps-Public/fishbowlapp/?demo

## How to play

- **Create a bowl** and you get a 6-character code, like `K7QM3P`. Tap **Share** to send friends a link that opens your bowl.
- **Add fish:** up to 15. Each plops in from the top and gets a random name (like Pickle or Sir Swims-a-Lot) and one of 12 fish types: goldfish, fantail, comet, betta, guppy, neon tetra, angelfish, zebra danio, molly, platy, pufferfish or pleco. Each type looks and swims differently.
- **Feed all** feeds every fish. To feed just one, tap it and use **Feed this fish**.
- Each feed adds 5 to a fish's fullness (out of 100). A new fish starts at 50.
- Fish get hungry slowly: they lose 1 point every 28.8 minutes, even when nobody has the app open. A full fish lasts 48 hours, a new fish 24 hours, and each feed adds about 2.4 hours.
- **You can see how full a fish is:** a hungry fish is skinny, and a full one is nearly a ball. A fed fish grows once it has eaten its flakes.
- **Watch for warnings:** a yellow **!** over a fish means it's getting full, and a red 🤢 means the next bite will pop it. The fish card and the Feed all button warn you too.
- **Birthdays:** tap a fish to see how old it is. At 12 hours old it gets a party hat 🎉.
- **Over 100, a fish pops from overeating.** Near full it gets very round and slow. That's your warning.
- **At 0, a fish starves.** Hungry fish turn grey and swim a bit erratically.
- **🦀 Old Barnaby** is the crab with the spectacles and white mustache. He's in every bowl, never eats or dies, and isn't one of the 15 fish. He welcomes new fish, warns you before a fish pops, speaks up for hungry ones, tidies up flakes that sink to the gravel, celebrates birthdays, and comforts the bowl when a fish dies.
- **Barnaby's rescue:** once every 12 hours he saves a fish from starving. He feeds it his emergency snack, which fills it back up to 95. It works even when nobody has the app open. The glowing snack pellet next to him means his rescue is ready; when it's gone, it's recharging. A rescued fish is nearly full, so go easy with the next feeds.
- **Tap Barnaby** to see whether his snack is ready, and for a bit of crab wisdom. To turn his speech bubbles off on your phone, use **Quiet Barnaby** in the menu (⋯).
- **❤️ Send love:** tap ❤️ (next to Feed all) to send hearts floating up on everyone's phone, or use "❤️ Pickle" on a fish's card to send them from that fish. One heart every 3 seconds.
- **🏆 Blame board:** this week's Head Chef (most feeds), Grim Feeder (most fish overfed), Fish Dealer (most fish added) and Oldest Fish, plus a hall of fame. It resets every Monday at midnight. If a fish is overfed, the message says who gave it the last bite.
- The line under the fish count ("Last fed 3 min ago by Sam") shows who fed them last. Tap it to see the last 20 feeds, including any fish a feed popped 💥.
- **Menu (⋯):** change your nickname, **Quiet Barnaby**, or **Leave bowl**. Leaving only forgets the bowl on your phone; it stays there for your friends.

## Install it on your phone (Android)

Open the live link in Chrome, tap the menu (⋮), then **Add to Home screen** (or **Install app**). It opens like a normal app, and it still opens without internet. You can't add or feed fish while offline, though.

## Firebase setup (one time)

Firebase is Google's free online database. It stores each bowl so friends see the same fish. Steps 1–5 are already done. **Step 6 has to be done after the pull request that adds this app is merged,** and again any time `firestore.rules` changes.

1. Go to **console.firebase.google.com** → **Create a project** → name it `fishbowl`. Google Analytics: **off**.
2. **Add a web app:** on the project home, tap the **`</>`** (Web) icon → nickname `fishbowl` → don't tick Firebase Hosting → **Register app**. Copy the `firebaseConfig` block it shows. (It's in `firebase-config.js`.)
3. **Turn on Anonymous sign-in:** Build → **Authentication** → **Get started** → **Sign-in method** → **Anonymous** → **Enable** → Save.
4. **Allow the app's web address:** Authentication → **Settings** → **Authorized domains** → **Add domain** → `jspenc111-stack.github.io`.
5. **Create the database:** Build → **Firestore Database** → **Create database** → pick a US location (e.g. `nam5`) → **Start in production mode**.
6. **Paste the rules:** Firestore Database → **Rules** tab → delete everything there → paste the whole contents of [`firestore.rules`](firestore.rules) → **Publish**.
7. Stay on the free **Spark** plan. No billing needed.

"Anonymous sign-in" means the app quietly signs each phone in without an account, so the database can turn away anything that isn't the app. The **rules** decide what the app is allowed to do: read one bowl by its code (never a list of all bowls), at most 15 fish, at most 20 feeds in the history, at most 10 hearts, at most 30 players on the weekly board, names of 20 characters or fewer, Barnaby's rescue at most once every 12 hours, and no deleting bowls.

## Privacy

Everything in this repo is public. Your nickname is visible to anyone in your bowl, so use a nickname, not your full name. Anyone who has a bowl's code can see and change that bowl. The Firebase settings in `firebase-config.js` are public by design; they identify the project but aren't passwords.

## For whoever changes the code

- Plain HTML, CSS and JavaScript. No build step and no npm packages.
- `fish-rules.js` has the game rules and the numbers to tune (`START_FULLNESS`, `FEED_AMOUNT`, `SECONDS_PER_POINT`, `MAX_FISH`, `RESCUE_FULLNESS`, `RESCUE_COOLDOWN_HOURS`), plus Barnaby's rescue (`resolveBowl`) and what he says (`crabTip`). `bowl.js` talks to Firebase. `app.js` draws the bowl, Barnaby, and the screens.
- **Tests:** `node fishbowlapp/tests/run.mjs` (from the repo root). They also scan the repo for email addresses and secret keys.
- **Preview:** `cd fishbowlapp && python3 -m http.server 8000`, then open http://localhost:8000/?demo (about 25 seconds in, Barnaby rescues a fish).
- **Icons:** `python3 tools/make_icons.py` (needs Pillow: `pip install pillow`).
- **Measuring the delay between phones:** add `?debug` to the end of the link on two phones (for example `…/fishbowlapp/?debug`). When the other phone feeds or adds a fish, the message shows how many milliseconds it took to arrive. It's only accurate if both phones' clocks are right.
- After changing app files, bump `CACHE` in `sw.js` (for example `fishbowl-v3` → `fishbowl-v4`) so installed apps pick up the new version.
- `SPEC.md` describes exactly how the app should behave. Keep it up to date.
