# Of Dragons Deep

Web app that tracks fish caught in Final Fantasy XIV to help players complete the big fishing achievements. The UI should feel like it belongs in the game: dark translucent windows, gold trim, Cinzel headings.

Currently a proof of concept: plain HTML/CSS/ES modules, **no dependencies and no framework**. Keep it that way unless a change clearly needs one (ask first).

## Commands

- `npm run dev` — serve at http://localhost:5173 (ES modules + `fetch` need a server; opening index.html from disk won't work)
- `npm run fetch-data` — download fresh fish data into `data/fish.json` (needs network access to ff14fish.carbuncleplushy.com)
- `npm run build` — single self-contained file at `dist/index.html`

There are no tests yet. After changes, run the dev server and check the page in a browser.

## Layout

- `index.html` — page shell and markup
- `src/main.js` — app: filtering, paging, rendering, events
- `src/data.js` — loads and decodes `data/fish.json`; defines categories
- `src/icons.js` — placeholder SVG fish icons
- `src/storage.js` — caught set in localStorage (key `odd-caught-v2`, game fish ids)
- `src/styles.css` — all styles; theme colours are CSS variables in `:root`
- `scripts/fetch-fish-data.mjs` — data downloader (parses the source JS as text, never executes it)
- `scripts/build.mjs`, `scripts/serve.mjs` — build and dev server
- `data/fish.json` — committed data snapshot, so the app works without fetching

## Data

Source: the FFXIV Fish Tracker by Carbuncle Plushy — `js/app/fish_info_data.js` (`FISH_INFO`: names, icon ids, levels, zones, rarity, collectable) and `js/app/data.js` (`DATA.FISH`: `bigFish` flag, `patch`, weather/time windows). Only ~1,110 of the ~1,517 fish appear in `DATA.FISH`; ocean fishing fish don't.

`data/fish.json` is compact: string `tables` (`rec` water type, `reg` region, `zone`) plus `rows` of
`[id, name, icon, level, expansion, water, region, zone, bigFish, collectable, rarity]`.

Decoding rules in `src/data.js`:
- Category = expansion (from patch, else level band), except region "The High Seas" → Ocean Fishing.
- Big fish = `bigFish` flag OR `rarity >= 2` (the rarity rule picks up ocean-fishing rares).
- Ocean fishing fish have level 1 in the source; don't show it.

## UI requirements (from the project owner)

- Fish shown in a paged **10×10 grid** (100 per page), each icon a square with slightly rounded corners.
- **Page numbers top-left above the grid, search box immediately after them, filter button top-right.**
- Click a fish to toggle caught.

## Known gaps / next steps

- Icons are placeholders. Real icons: `fish.icon` is the game icon id (e.g. 29063 → `029063`); they'd need to be downloaded and bundled, or served from an icon CDN once the app is hosted somewhere that allows remote images.
- Progress lives in one browser's localStorage only — no accounts, sync, or import/export yet.
- No achievement mapping yet (which fish count toward which achievement).
