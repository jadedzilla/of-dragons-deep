# Of Dragons Deep

Web app that tracks fish caught in Final Fantasy XIV to help players complete the big fishing achievements. The UI should feel like it belongs in the game: dark translucent windows, gold trim, Cinzel headings.

Currently a proof of concept: plain HTML/CSS/ES modules, **no dependencies and no framework**. Keep it that way unless a change clearly needs one (ask first).

## Commands

- `npm run dev` — serve at http://localhost:5173 (ES modules + `fetch` need a server; opening index.html from disk won't work)
- `npm run fetch-data` — download fresh fish data into `data/fish.json` (needs network access to ff14fish.carbuncleplushy.com)
- `npm run fetch-icons` — download fish icons from XIVAPI into `data/icons/` sprite sheets (needs network access to v2.xivapi.com; behind a proxy on Node ≥ 22.21 run with `NODE_USE_ENV_PROXY=1`)
- `npm run build` — single self-contained file at `dist/index.html` (~11 MB, icons inlined); `node scripts/build.mjs --external-icons` keeps the sheets as `dist/icons/*.png` instead

There are no tests yet. After changes, run the dev server and check the page in a browser.

## Layout

- `index.html` — page shell and markup
- `src/main.js` — app: filtering, paging, rendering, events
- `src/data.js` — loads and decodes `data/fish.json`; defines categories
- `src/icons.js` — loads the icon manifest and renders sprite-sheet icons (SVG placeholder if an icon is missing)
- `src/storage.js` — caught set in localStorage (key `odd-caught-v2`, game fish ids)
- `src/styles.css` — all styles; theme colours are CSS variables in `:root`
- `scripts/fetch-fish-data.mjs` — data downloader (parses the source JS as text, never executes it)
- `scripts/fetch-icons.mjs` — icon downloader; `scripts/png.mjs` — tiny PNG decode/encode used to pack sheets
- `scripts/build.mjs`, `scripts/serve.mjs` — build and dev server
- `data/fish.json` — committed data snapshot, so the app works without fetching
- `data/icons.json` + `data/icons/sheet-NN.png` — committed icon snapshot (1,078 unique icons, 80×80, 10×10 per sheet)

## Data

Source: the FFXIV Fish Tracker by Carbuncle Plushy — `js/app/fish_info_data.js` (`FISH_INFO`: names, icon ids, levels, zones, rarity, collectable) and `js/app/data.js` (`DATA.FISH`: `bigFish` flag, `patch`, weather/time windows). Only ~1,110 of the ~1,517 fish appear in `DATA.FISH`; ocean fishing fish don't.

`data/fish.json` is compact: string `tables` (`rec` water type, `reg` region, `zone`) plus `rows` of
`[id, name, icon, level, expansion, water, region, zone, bigFish, collectable, rarity]`.

Decoding rules in `src/data.js`:
- Category = expansion (from patch, else level band), except region "The High Seas" → Ocean Fishing.
- Big fish = `bigFish` flag OR `rarity >= 2` (the rarity rule picks up ocean-fishing rares).
- Ocean fishing fish have level 1 in the source; don't show it.

## Icons

From XIVAPI v2: `https://v2.xivapi.com/api/asset?path=ui/icon/029000/029063_hr1.tex&format=png` (`_hr1` = 80px; plain = 40px fallback).
Icons are packed into 800×800 sheets (bundling ~1,000 files individually is impractical); `icons.json` maps game icon id → index, sheet = index / 100.
Sheets are ordered by first appearance in `fish.json`, so the first grid page needs only one. Each sheet gets a CSS class (`.ic.sN`) injected at load; tiles set `background-position`.
Game icons include their own square backdrop, so they fill the tile.

## UI requirements (from the project owner)

- Fish shown in a paged **10×10 grid** (100 per page), each icon a square with slightly rounded corners.
- **Page numbers top-left above the grid, search box immediately after them, filter button top-right.**
- Click a fish to toggle caught.

## Known gaps / next steps

- Re-run `npm run fetch-icons` after `npm run fetch-data` if new fish (new icon ids) appear; missing icons fall back to the SVG placeholder.
- Tiles aren't keyboard-accessible yet (they're divs with no tabindex/key handler).
- Progress lives in one browser's localStorage only — no accounts, sync, or import/export yet.
- No achievement mapping yet (which fish count toward which achievement).
