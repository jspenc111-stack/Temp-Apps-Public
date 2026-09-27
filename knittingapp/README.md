# Row Tracker

A knitting and crochet row tracker. Paste a pattern or upload a PDF, and the app splits it into sections and rows. You tap through them as you knit, and it saves your place automatically.

It works offline once it has been opened. To install it on Android, open the site in Chrome, then choose menu → "Add to Home screen" (or "Install app").

## Files
- `index.html`: the app itself
- `manifest.webmanifest`: tells your phone the app's name, colours and icon
- `sw.js`: the service worker, which saves a copy so the app opens without internet
- `icon-*.png`: home screen icons

## Updating
After changing `index.html`, bump `VERSION` in `sw.js` (for example to `row-tracker-v2`). Otherwise phones will keep showing the old saved copy.
