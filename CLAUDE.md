# Of Dragons Deep

Web app that tracks fish caught in Final Fantasy XIV to help players complete the big fishing achievements. The UI should feel like it belongs in the game: dark translucent windows, gold trim, Cinzel headings.

Currently a proof of concept: plain HTML/CSS/ES modules, **no dependencies and no framework**. Keep it that way unless a change clearly needs one (ask first).

## Commands

- `npm run dev` — serve at http://localhost:5173 (ES modules + `fetch` need a server; opening index.html from disk won't work)
- `npm run fetch-data` — refresh the fallback snapshot `data/fish.json` from XIVAPI (needs network access to v2.xivapi.com; behind a proxy on Node ≥ 22.21 run with `NODE_USE_ENV_PROXY=1`)
- `npm run fetch-icons` — download fish icons from XIVAPI into `data/icons/` sprite sheets, then convert them to WebP (needs network access to v2.xivapi.com; behind a proxy on Node ≥ 22.21 run with `NODE_USE_ENV_PROXY=1`). The WebP step needs the dev-only Playwright dependency: `npm install && npx playwright install chromium` once. The app itself still has no dependencies.
- `npm run build` — single self-contained file at `dist/index.html` (~11 MB, icons inlined); `node scripts/build.mjs --external-icons` keeps the sheets as `dist/icons/*.png` instead

Deploy: `.github/workflows/pages.yml` runs `node scripts/build.mjs --external-icons` on every push to `main` and publishes `dist/` to GitHub Pages at https://jadedzilla.github.io/of-dragons-deep/ (a sub-path, so keep every URL in the app relative — no leading `/`).

**Workflow rule (from the project owner): never commit, push or deploy without explicit confirmation.** After making a change, show the owner the new version first (publish a preview, plus screenshots/summary), then ask and wait for their OK. Pushing to `main` deploys to GitHub Pages, so it needs the same confirmation.

There are no tests yet. After changes, run the dev server and check the page in a browser.

## Layout

- `index.html` — page shell and markup
- `src/main.js` — app: filtering, paging, rendering, events
- `src/data.js` — loads fish (live, else snapshot) and decodes rows; defines categories
- `src/fishsource.js` — loads the Fish Guide from XIVAPI and builds the compact dataset; shared by the browser and `fetch-fish-data.mjs`
- `src/icons.js` — loads the icon manifest and renders sprite-sheet icons (SVG placeholder if an icon is missing)
- `src/storage.js` — per-browser localStorage: caught set (key `odd-caught-v2`, game item ids) and the last tab (`odd-tab`)
- `src/styles.css` — all styles; theme colours are CSS variables in `:root`
- `scripts/fetch-fish-data.mjs` — refreshes the fallback snapshot using `src/fishsource.js`
- `scripts/fetch-icons.mjs` — icon downloader (writes PNG sheets); `scripts/webp-sheets.mjs` — converts them to WebP via headless Chromium; `scripts/png.mjs` — tiny PNG decode/encode used to pack sheets
- `scripts/build.mjs`, `scripts/serve.mjs` — build and dev server
- `data/fish.json` — committed fallback snapshot (`rows` = Fish Guide, `spear` = spearfishing log), used when the live fetch fails
- `data/icons.json` + `data/icons/sheet-NN.webp` — committed icon snapshot (1,243 unique icons — fishing first, then spearfishing — 80×80, 10×10 per sheet; WebP q0.82, ≈1.7 MB for all 13)

## Data

**Live:** on every load the browser loads the Fish Guide from XIVAPI's game data (`src/fishsource.js`): the `FishParameter` sheet, rows with `IsInLog` (exactly the Fish Guide), fetched as 4 parallel 500-row pages plus further pages only while they still contain guide rows (today 5 requests, ~25 KB each gzipped, ~1–2 s). Fields: `Item.Name/Icon/IsCollectable/Rarity`, `GatheringItemLevel.GatheringItemLevel`, `FishingRecordType.Addon.Text` (water), `FishingSpot.TerritoryType.PlaceNameRegion/PlaceName` (region/zone), `Unknown1` (ocean-fishing guide number). Every request pins the XIVAPI schema revision (`XIVAPI_SCHEMA`) so field names, notably the unnamed `Unknown1`, can't change. XIVAPI sends `Access-Control-Allow-Origin: *`. The footer shows the game patch (from `/api/version`).
**Order:** the game's log order (`logOrder` in `src/fishsource.js`): sort by the game's sort key, then row. FishParameter `Unknown1` / SpearfishingItem `Unknown2` = 2000 A Realm Reborn, 3000 Heavensward … 7000 Dawntrail, with ocean-fishing fish numbered after their expansion (5001…, 6001…, 7001…). So a fish added to an older expansion in a later patch lands with that expansion. Today this is identical to the FFXIV Fish Tracker's Fish Guide order.
**Verified:** when switching from the FFXIV Fish Tracker (Carbuncle Plushy) to XIVAPI (patch 7.58), all 1,517 fish matched the tracker exactly — same order and identical id, name, icon, level, water, region, zone, collectable, rarity and category.
**Spearfishing:** the `SpearfishingItem` sheet (rows with `IsInLog`, 289 today) loads in parallel, in the game's log order (sort key `Unknown2`; there's no tracker list to check it against). Size class (Small/Average/Big, `FishingRecordType.Addon.Text`) is stored in the "water" column; region/zone come from `SpearfishingNotebook.TerritoryType`; expansion = `Unknown2` / 1000 − 2 (4000 = Stormblood; agrees with the level/region rule for every spearfish). No spearfish has rarity ≥ 2, so none are big fish. They're the dataset's `spear` rows (same columns as `rows`).
**Fallback:** if XIVAPI fails, errors or takes over 15 s, the app uses `data/fish.json` (inlined in the single-file build) and the footer says so in amber.

`data/fish.json` (and the live load) is compact: string `tables` (`rec` water type, `reg` region, `zone`) plus `rows` of
`[id, name, icon, level, expansion, water, region, zone, bigFish, collectable, rarity]`.

Rules in `src/fishsource.js` / `src/data.js`:
- Expansion = level band (≤50 ARR … >90 Dawntrail), raised to the region's own expansion when later (`REGION_EXPANSION`). The game data has no patch numbers per fish; this rule matches patch-based expansions for all but 2 fish (level-50 La Noscea fish added in 4.x, shown as ARR).
- Category = expansion, except region "The High Seas" → Ocean Fishing.
- Big fish = `rarity >= 2` (`Item.Rarity`; covers big fish and ocean-fishing rares).
- Ocean fishing fish have level 1 in the source; don't show it.

## Icons

From XIVAPI v2: `https://v2.xivapi.com/api/asset?path=ui/icon/029000/029063_hr1.tex&format=png` (`_hr1` = 80px; plain = 40px fallback).
Icons are packed into 800×800 sheets (bundling ~1,000 files individually is impractical); `icons.json` maps game icon id → index, sheet = index / 100.
In the Pages build (`--external-icons`) each sheet URL carries a content hash (`icons/sheet-NN.webp?v=…`): sheet files keep their names when their content changes (e.g. sheet 10 gaining spearfish icons), and without the hash browsers would reuse a stale cached copy for up to 10 minutes after a deploy, showing blank tiles. Sheets are ordered by first appearance in `fish.json`, so the first grid page needs only one. Each sheet gets a CSS class (`.ic.sN`) injected at load; tiles set `background-position`.
Game icons include their own square backdrop, so they fill the tile.
**Loading:** `.ic` starts at opacity 0 and gets `.ready` when its sheet has loaded (`requestSheet` in `src/icons.js`; XIVAPI fallback `<img>`s on their load event). Sheets that load in under 100 ms (or were already loaded) show at once (`.instant`); slower ones fade in. After a page's own sheets load, the next/previous pages' sheets are prefetched (`prefetchSheets`, urgent), and once the first page is up all remaining sheets load in the background one at a time (skipped when `navigator.connection.saveData`), so page switches are instant.

## UI requirements (from the project owner)

- Fish shown in a paged **10×10 grid** (100 per page), each icon a square with slightly rounded corners.
- **Order = the game's log order** (Fish Guide and spearfishing log; today identical to the FFXIV Fish Tracker's Fish Guide), left to right, top to bottom, so app page N holds the same fish as the tracker's guide page N. Never sort; filters keep this order.
- **Page numbers top-left above the grid, search immediately after them, filter button top-right.** Search shows as a round magnifier icon while empty and unfocused (pure CSS: `:not(:focus):placeholder-shown`); clicking it expands it into the box, and it stays open while it has text.
- **Edit mode:** an Edit toggle (left of Import) must be on for clicking a fish to change it (Import is not locked). It's off on every page load; while off, clicking a fish only shows its details. While on, the button is gold, the grid gets a gold outline, and clicking a fish toggles caught. Keyboard accessibility is not a requirement (owner's call) — don't flag or add it.
- **Fishing / Spearfishing tabs** hang from the bottom-left of the window (in-game style; the active tab merges with the window). Switching resets to page 1 and keeps search and filters; header count, footer and Category counts are per list (categories a list doesn't use are hidden, and "Big fish only" + its legend are hidden on Spearfishing without losing the setting). The chosen tab is remembered per browser (localStorage `odd-tab`). Caught state, Import and import links cover both lists.
- **Edit, Import and Filter are icon-only buttons** on every device; on mouse hover (`@media (hover:hover)`) or keyboard focus the label slides out (animated `max-width`). The Filter count badge always shows.
- **Import** button (between Edit and Filter) opens a dialog to paste or load (.txt/.csv) game item ids, comma-separated (spaces/semicolons/new lines also accepted). "Add" marks them caught; "Replace" makes the caught set exactly the list and needs a second click when it would unmark fish (no `confirm()` — it's silently blocked in sandboxed iframes). Ids that aren't fish or aren't numbers are skipped and listed. A successful import closes the dialog and shows the summary as a notice at the bottom (5 s, 9 s if anything was skipped); the dialog stays open only for "nothing valid"/empty input and the Replace confirmation.
- **Import link**: opening the page with `?import=…` (made by the Of Dragons Deep Dalamud plugin) opens the Import dialog, fills it with the decoded ids (mode "Add") and waits for the owner to press Import — never import automatically; the parameter is then removed from the address bar. Format: `1.` + base64url (no padding) of raw-DEFLATE'd LEB128 varint deltas of the sorted item ids; a plain comma list is accepted too.

## Known gaps / next steps

- New fish from the live data whose icons aren't in the sheets load from XIVAPI directly (placeholder if that fails); re-run `npm run fetch-data` and `npm run fetch-icons` to bundle them.
- Progress lives in one browser's localStorage only — no accounts or sync; import exists but no export yet.
- No achievement mapping yet (which fish count toward which achievement).
