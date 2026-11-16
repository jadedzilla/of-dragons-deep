<img src="public/ofdragonsdeep-banner.png" alt="Of Dragons Deep logo, featuring the Nepto Dragon from Final Fantasy III" width="488" height="128"/>

**Of Dragons Deep** is a fishing tracker. Yes, another one.

**Use it:** https://jadedzilla.github.io/of-dragons-deep/

Track the fish you've caught in Final Fantasy XIV and work toward the big fishing achievements. Covers the Fish Guide and, on its own tab, the spearfishing log, plus a Fish Timers page showing which fish are up now and when the rest are next catchable, and an Achievements page listing every fishing achievement with your progress.

## Run it

Requires [Node.js](https://nodejs.org) 18 or newer. No `npm install` needed to run or build — the app has no dependencies. (Only `npm run fetch-icons` uses a dev tool, Playwright.)

```sh
npm run dev          # open http://localhost:5173
npm run fetch-data   # refresh the offline fallback data/fish.json from XIVAPI
npm run fetch-icons  # refresh fish icons (data/icons/) from XIVAPI — needs `npm install` first (Playwright, for WebP)
npm run build        # single-file build at dist/index.html
```

Fish data is loaded live from the game data on XIVAPI each time the app opens; a bundled snapshot is used if it can't be reached.

## Deploy

Every push to `main` builds the app and publishes it to GitHub Pages (`.github/workflows/pages.yml`).
One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Credits

Fish data, icons and weather come from the game data on [XIVAPI](https://v2.xivapi.com/).
Best bait and the Fish Timers' catch windows (times and weather) come from [FFXIV Teamcraft](https://ffxivteamcraft.com/)'s fishing data.
Fish Guide order and fields were checked against the [FFXIV Fish Tracker](https://ff14fish.carbuncleplushy.com/) by Carbuncle Plushy.
FINAL FANTASY XIV © SQUARE ENIX CO., LTD.
