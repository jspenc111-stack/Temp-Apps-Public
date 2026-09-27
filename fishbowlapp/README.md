# Fishbowl

A small virtual fishbowl PWA. Add up to 10 fish, feed them, and try not to kill them. Plain HTML/CSS/vanilla JS, no build step, works offline.

## Rules

- Every fish starts at 50 fullness and loses 1 point every 10 seconds, even while the app is closed.
- **Feed** drops food flakes. Each fish swims to its own flakes and gains +30 when it eats them.
- Fullness tops out at 100, so feeding a full fish is harmless.
- **Overfeeding pops them.** A fish swells with every meal it eats. If it eats **more than 10 meals within one minute**, it pops. From 8 meals on it jiggles, says "urp!", and its info card warns you.
- **Starving:** at 0 fullness a fish turns pale, goes belly-up, floats to the top, and disappears after about 3 seconds.
- Tap a fish to see its name, age, fullness and meals this minute. Tap the water to startle nearby fish.

All the numbers are in `CFG` at the top of `app.js`.

## Files

`index.html`, `style.css`, `app.js`, `manifest.json`, `service-worker.js`, `icons/`

## Run locally

```
npx http-server fishbowlapp
```

State is saved in `localStorage` under `fishbowl.v1`.
