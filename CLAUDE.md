# Of Dragons Deep

Web app that tracks fish caught in Final Fantasy XIV to help players complete the big fishing achievements. The UI should feel like it belongs in the game: dark translucent windows, gold trim, Cinzel headings.

Currently a proof of concept: plain HTML/CSS/ES modules, **no dependencies and no framework**. Keep it that way unless a change clearly needs one (ask first).

## Commands

- `npm run dev` — serve at http://localhost:5173 (ES modules + `fetch` need a server; opening index.html from disk won't work)
- `npm run fetch-data` — refresh the fallback snapshot `data/fish.json` (needs network access to ff14fish.carbuncleplushy.com)
- `npm run fetch-icons` — download fish icons from XIVAPI into `data/icons/` sprite sheets (needs network access to v2.xivapi.com; behind a proxy on Node ≥ 22.21 run with `NODE_USE_ENV_PROXY=1`)
- `npm run build` — single self-contained file at `dist/index.html` (~11 MB, icons inlined); `node scripts/build.mjs --external-icons` keeps the sheets as `dist/icons/*.png` instead

Deploy: `.github/workflows/pages.yml` runs `node scripts/build.mjs --external-icons` on every push to `main` and publishes `dist/` to GitHub Pages at https://jadedzilla.github.io/of-dragons-deep/ (a sub-path, so keep every URL in the app relative — no leading `/`).

There are no tests yet. After changes, run the dev server and check the page in a browser.

## Layout

- `index.html` — page shell and markup
- `src/main.js` — app: filtering, paging, rendering, events
- `src/data.js` — loads fish (live, else snapshot) and decodes rows; defines categories
- `src/fishsource.js` — parses `fish_info_data.js` into the compact dataset; shared by the browser and `fetch-fish-data.mjs`
- `src/icons.js` — loads the icon manifest and renders sprite-sheet icons (SVG placeholder if an icon is missing)
- `src/storage.js` — caught set in localStorage (key `odd-caught-v2`, game fish ids)
- `src/styles.css` — all styles; theme colours are CSS variables in `:root`
- `scripts/fetch-fish-data.mjs` — refreshes the fallback snapshot using `src/fishsource.js`
- `scripts/fetch-icons.mjs` — icon downloader; `scripts/png.mjs` — tiny PNG decode/encode used to pack sheets
- `scripts/build.mjs`, `scripts/serve.mjs` — build and dev server
- `data/fish.json` — committed fallback snapshot, used when the live fetch fails
- `data/icons.json` + `data/icons/sheet-NN.png` — committed icon snapshot (1,078 unique icons, 80×80, 10×10 per sheet)

## Data

**Live:** on every load the browser fetches `https://ff14fish.carbuncleplushy.com/js/app/fish_info_data.js` (the FFXIV Fish Tracker by Carbuncle Plushy; it sends `Access-Control-Allow-Origin: *`, ~950 KB gzipped, cached 10 min) and parses it as text — the JSON array after `const FISH_INFO = [` is extracted and `JSON.parse`d; the tracker's code is never executed. "Updated" in the footer is the file's `Last-Modified` date.
**Fallback:** if the fetch fails, errors or takes over 15 s, the app uses `data/fish.json` (inlined in the single-file build) and the footer says so in amber.

`data/fish.json` (and the live parse) is compact: string `tables` (`rec` water type, `reg` region, `zone`) plus `rows` of
`[id, name, icon, level, expansion, water, region, zone, bigFish, collectable, rarity]`.

Rules in `src/fishsource.js` / `src/data.js`:
- Expansion = level band (≤50 ARR … >90 Dawntrail), raised to the region's own expansion when later (`REGION_EXPANSION`). `fish_info_data.js` has no patch numbers; the tracker's `data.js` does, but isn't fetched — this rule matches it for all but 2 fish (level-50 La Noscea fish added in 4.x, shown as ARR).
- Category = expansion, except region "The High Seas" → Ocean Fishing.
- Big fish = `rarity >= 2` (a superset of the tracker's `bigFish` flag; also covers ocean-fishing rares).
- Ocean fishing fish have level 1 in the source; don't show it.

## Icons

From XIVAPI v2: `https://v2.xivapi.com/api/asset?path=ui/icon/029000/029063_hr1.tex&format=png` (`_hr1` = 80px; plain = 40px fallback).
Icons are packed into 800×800 sheets (bundling ~1,000 files individually is impractical); `icons.json` maps game icon id → index, sheet = index / 100.
Sheets are ordered by first appearance in `fish.json`, so the first grid page needs only one. Each sheet gets a CSS class (`.ic.sN`) injected at load; tiles set `background-position`.
Game icons include their own square backdrop, so they fill the tile.

## UI requirements (from the project owner)

- Fish shown in a paged **10×10 grid** (100 per page), each icon a square with slightly rounded corners.
- **Order = the tracker's order** (`FISH_INFO` array order, as in its Fish Guide), left to right, top to bottom, so app page N holds the same fish as the tracker's guide page N. Never sort; filters keep this order.
- **Page numbers top-left above the grid, search box immediately after them, filter button top-right.**
- Click a fish to toggle caught. Keyboard accessibility is not a requirement (owner's call) — don't flag or add it.
- **Import** button (left of Filter; icon-only on phones) opens a dialog to paste or load (.txt/.csv) game item ids, comma-separated (spaces/semicolons/new lines also accepted). "Add" marks them caught; "Replace" makes the caught set exactly the list and needs a second click when it would unmark fish (no `confirm()` — it's silently blocked in sandboxed iframes). Ids that aren't fish or aren't numbers are skipped and listed.

## Known gaps / next steps

- New fish from the live data whose icons aren't in the sheets load from XIVAPI directly (placeholder if that fails); re-run `npm run fetch-data` and `npm run fetch-icons` to bundle them.
- Progress lives in one browser's localStorage only — no accounts or sync; import exists but no export yet.
- No achievement mapping yet (which fish count toward which achievement).
