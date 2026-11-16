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
- `src/teamcraft.js` — FFXIV Teamcraft fishing data (bait, catch windows), XIVAPI row helper, bait chain grouping
- `src/achievements.js` — Achievements page: loads Fisher achievements + ocean spots from XIVAPI, works out progress from caught fish, manual marks for the rest
- `src/logroute.js` — Log Route page: plans the order to catch every uncaught Fish Guide fish (`planLogRoute`, pure) and renders it
- `src/timers.js` — Fish Timers page: loads catch windows + zone weather, forecasts weather, computes each fish's current/next window, renders the list
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
**Aquarium:** the `AquariumFish` sheet (one page, 263 of our fish today, 55 of them spearfish) loads alongside, as dataset `aquarium: { itemId: [size, water] }` — size 1–4 = S/M/L/XL, which is also the minimum tank tier; water Freshwater/Saltwater. Verified against the item descriptions' "[Suitable for display in aquariums tier N and higher.]" notes: 0 mismatches. Optional: if it fails, fish just show no aquarium info.
**Best bait:** from FFXIV Teamcraft's `fishing-sources.json` (see `src/teamcraft.js`; one entry per fishing spot with `bait`; when the bait is itself a fish, its own entry at the same spot gives the next step, so mooch chains are followed back to the real bait). `baitChains()` groups spots that share the same bait(s); several baits at one spot are alternatives ("A or B", typical for ocean fishing). One group → just the bait; several → one line each with spot names (XIVAPI `FishingSpot.PlaceName`), the most common bait last as "at other spots" when it covers more than 3 spots. Bait/mooch names and icons come from XIVAPI `Item?rows=…&fields=Name,Icon`. Fetched on the first fish view (not on page load) and cached; the Teamcraft file is shared with Fish Timers. Covers all 1,517 Fish Guide fish (ocean fishing included); spearfish have no bait line.
**Hookset / tug:** from the same Teamcraft entries (`hookset` 1 Powerful, 2 Precision; `tug` 0 Medium (!!), 1 Heavy (!!!), 2 Light (!) — codes checked against the FFXIV Fish Tracker's labels on 900+ fish; 0 / −1 = unknown, shown "Unknown"). If they differ between spots (6 fish), the values are joined with "or". `hooksetAndTug()` in `src/teamcraft.js`.

**Canvas (fish prints):** there's no canvas table in the game data; the size comes only from the item description note "[Suitable for printing on small|medium|large|extra large canvases.]" (1,804 of 1,806 fish; the other two, Sunray Ray and Junior Jinbei, are minion items). The detail view reads it from the description it fetches.
**Fallback:** if XIVAPI fails, errors or takes over 15 s, the app uses `data/fish.json` (inlined in the single-file build) and the footer says so in amber.

`data/fish.json` (and the live load) is compact: string `tables` (`rec` water type, `reg` region, `zone`) plus `rows` of
`[id, name, icon, level, expansion, water, region, zone, bigFish, collectable, rarity]`.

Rules in `src/fishsource.js` / `src/data.js`:
- Expansion = level band (≤50 ARR … >90 Dawntrail), raised to the region's own expansion when later (`REGION_EXPANSION`). The game data has no patch numbers per fish; this rule matches patch-based expansions for all but 2 fish (level-50 La Noscea fish added in 4.x, shown as ARR).
- Category = expansion, except region "The High Seas" → Ocean Fishing.
- Big fish = `rarity >= 2` (`Item.Rarity`; covers big fish and ocean-fishing rares).
- Ocean fishing fish have level 1 in the source; don't show it.

## Achievements

**Page:** third nav link (`#achievements`). Lists every Fisher achievement (XIVAPI `search?sheets=Achievement&query=AchievementCategory=34`, 133 today) in sections: Fish log, Big fish, Ocean fishing log, Fishing milestones, Ocean fishing voyages, Other; each with icon, points, the game's requirement text and progress. Loaded when the page is first opened (error + Try again like Timers). Summary: obtained count and points; "Hide obtained" filter. Each section is a `<details>`: click its heading (chevron, name, count) to collapse/expand; all collapsed by default, expanded ones remembered in localStorage `odd-achievements-open`.
**Requirements** come from the row: `Type` 1 = counter `Key` reaches `Data[0]`; 2 = all of `Key` + `Data[]` achievements; 27 = every fish at an ocean stop.
**Worked out from caught fish:** counter 202 = unique fish (Fish Guide + spearfishing log); big-fish counters 267 = ARR+HW+SB (204), 826 = ShB (45), 1000 = EW (40), 1145 = DT (46) — `f.big` by category, and the top tiers equal those totals exactly. Type 27 (Denizens/Specters): the stop is the `IKDSpot` row whose name appears in the description (longest match; all 26 map to distinct stop/current pairs); "spectral current is present" → `SpotSub` fish, else `SpotMain` (10 fish each, all in the guide), shown as clickable icons. Meta (Type 2) achievements are obtained when all their parts are.
**Manual:** everything else (casts, large fish, points, voyages, bonuses, Ishgard, cosmic) has an "Obtained" checkbox, saved in localStorage `odd-achievements-v1`.

## Log Route

**Page:** fourth nav link (`#route`). The order to catch every uncaught Fish Guide fish (spearfish aren't planned: separate log, no spot data), planned from now by `planLogRoute()` (pure; ≈100 ms for all 1,517):
1. **Spot stops** for fish with no time/weather limit: greedy set cover over Teamcraft spots (take the spot holding the most unplanned fish; ties → earliest in log order). Stops are grouped by the spot's own zone (`fishing-spots.json` `zoneId` — a fish's chosen spot can be outside its guide zone), zones in log order.
2. **Timed fish** by simulating the clock: a fish is **rare** if the chance after its next window starts over 3 h later. Rare fish are done as soon as their window is open (≥ 3 min left, soonest-closing first); frequent ones are picked up right after a stop in the same zone if their window is open then; when stops run out, everything left is done window by window (waiting for the soonest). Durations are rough: 2 min/fish (+1 per mooch step), 6 min per timed fish, 1.5 min travel per stop.
3. **Ocean fishing** last, one step per voyage stop (port: Limsa/Indigo for IKDSpot 1–7, Kugane/Ruby for 8+), normal and "during a spectral current" fish split, time-of-day tags with an example `IKDRoute` voyage reaching the stop then (Teamcraft `oceanFishingTime` 1 Sunset, 2 Day, 3 Night → IKDTimeDefine 2/1/3; checked on Sothis, Stonescale, Elasmosaurus…), plus weather.
Then fish with no window in ~5 weeks, and any without Teamcraft data.
**Each fish line:** bait → mooch chain with each step's hookset + tug at that spot ("or …" alternatives), intuition predators, Snagging, lures, minimum Gathering. Stops list the baits to bring; timed steps show ET hours, weather (previous → current) and the window countdown. Spot/zone names (`FishingSpot` PlaceName + TerritoryType.PlaceName), item names/icons and ocean weathers come from XIVAPI for the steps on screen.
**UI:** summary (fish left, steps, ≈ hours of land fishing), 15 steps at a time ("Show more"), **↻ Re-plan from now**, a ✓ per fish marks it caught and removes it without re-planning (order stays stable), icon opens the fish view.

## Fish Timers

**Pages:** a navigation bar above the window switches between **Fish Guide** (default), **Fish Timers** (`#timers` in the URL, so Back/Forward and bookmarks work) **Achievements** (`#achievements`) and **Log Route** (`#route`). Timers hides the guide toolbar/grid/footer, the Fishing/Spearfishing tabs and the caught count. Its data loads only when the page is first opened.
**Catch windows** come from FFXIV Teamcraft (`fishing-sources.json` / `spearfishing-sources.json` from raw.githubusercontent.com, `staging` branch; CORS `*`, ~30 KB gzipped): the first spot entry with `spawn` (Eorzea hour) + `duration`, `weathers` and/or `weathersFrom` (previous weather). The end hour is snapped to the ET minute (Teamcraft rounds durations to 2 decimals). Ocean-fishing entries (`oceanFishingTime`) are skipped. 443 fish today (442 fishing + 1 spearfish), all in our lists. Compared with the FFXIV Fish Tracker it replaced: 433 identical; 7 differ in hours (e.g. 12742 ET 16–19 vs the tracker's 16–18:15); 3 the tracker had are untimed in Teamcraft (23055, 23056, 24203) and 2 are new (8775, 40549). Credited on the page.
**Weather** odds come from XIVAPI (`FishingSpot?rows=…` / a `search` of `SpearfishingItem` by item → `SpearfishingNotebook`, then `TerritoryType.WeatherRate.Weather[]`/`Rate`; identical to the tracker's tables when checked); weather names/icons from the same response (icon falls back to the name if it can't load). Forecast: the game's formula (`forecastTarget`, as in SaintCoinach): weather periods are 8 Eorzea hours = 1400 s; 1 Eorzea hour = 175 s.
**Windows:** `nextWindow(fish, from)` walks weather periods (previous + current weather must match), intersects the fish's Eorzea hours (which may wrap midnight or be fractional), merges across period boundaries, and looks ≈39 Earth days ahead. Verified against an independent per-5-second brute force: 2,587 windows, 0 mismatches.
**List:** up-now fish first (soonest end), then upcoming (soonest start); countdowns tick every second and the list re-sorts when a window opens/closes. Filters: Hide caught (default on), Big fish only, search. Clicking a fish opens the detail view.

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
- **Edit mode:** an Edit toggle (left of Import) must be on for clicking a fish to change it (Import is not locked). It's off on every page load; while off, clicking/tapping a fish opens the **fish detail view** (dialog `#fishDialog`: large icon, name, tags, location, water/size, level, expansion/category, best bait, hookset, tug, aquarium, canvas, status, item id, and the in-game item description (its canvas/aquarium notes are shown as their own lines instead) fetched from XIVAPI `Item/{id}.Description` on first open and cached; everything else works offline). Hovering with a mouse still shows the quick tooltip. While on, the button is gold, the grid gets a gold outline, clicking a fish toggles caught, and two buttons appear under the grid: **Mark all caught** / **Mark all uncaught**. They act on the whole list of the current tab (Fishing or Spearfishing, ignoring search/filters) after a confirmation dialog (`#bulkDialog`, Cancel focused; it says when there's nothing to change and hides the confirm button; "Unmark all" is red). Keyboard accessibility is not a requirement (owner's call) — don't flag or add it.
- **Fishing / Spearfishing tabs** hang from the bottom-left of the window (in-game style; the active tab merges with the window). Switching resets to page 1 and keeps search and filters; header count, footer and Category counts are per list (categories a list doesn't use are hidden, and "Big fish only" + its legend entry are hidden on Spearfishing without losing the setting; the legend entry only goes invisible so nothing in the footer moves). The chosen tab is remembered per browser (localStorage `odd-tab`). Caught state, Import and import links cover both lists.
- **Edit, Import and Filter are icon-only buttons** on every device; on mouse hover (`@media (hover:hover)`) or keyboard focus the label slides out (animated `max-width`). The Filter count badge always shows.
- **Import** button (between Edit and Filter) opens a dialog to paste or load (.txt/.csv) game item ids, comma-separated (spaces/semicolons/new lines also accepted). "Add" marks them caught; "Replace" makes the caught set exactly the list and needs a second click when it would unmark fish (no `confirm()` — it's silently blocked in sandboxed iframes). Ids that aren't fish or aren't numbers are skipped and listed. A successful import closes the dialog and shows the summary as a notice at the bottom (5 s, 9 s if anything was skipped); the dialog stays open only for "nothing valid"/empty input and the Replace confirmation.
- **Import link**: opening the page with `?import=…` (made by the Of Dragons Deep Dalamud plugin) opens the Import dialog, fills it with the decoded ids (mode "Add") and waits for the owner to press Import — never import automatically; the parameter is then removed from the address bar. Format: `1.` + base64url (no padding) of raw-DEFLATE'd LEB128 varint deltas of the sorted item ids; a plain comma list is accepted too.

## Known gaps / next steps

- New fish from the live data whose icons aren't in the sheets load from XIVAPI directly (placeholder if that fails); re-run `npm run fetch-data` and `npm run fetch-icons` to bundle them.
- Progress lives in one browser's localStorage only — no accounts or sync; import exists but no export yet.
- No achievement mapping yet (which fish count toward which achievement).
