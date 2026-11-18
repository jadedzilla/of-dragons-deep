<img src="docs/banner.png" alt="Of Dragons Deep logo, featuring the Nepto Dragon from Final Fantasy III" width="488" height="128"/>

**Of Dragons Deep** is a fishing tracker. Yes, another one.

**Use it:** https://ofdragonsdeep.jadedzilla.com/

Track the fish you've caught in Final Fantasy XIV and work toward the big fishing achievements. Includes the Fish Guide, a Fish Timers page showing which fish are up now and when the rest are next catchable, an Achievements page listing every fishing achievement with your progress (import it straight from the game with the [Of Dragons Deep plugin](https://github.com/jadedzilla/of-dragons-deep-plugin)'s achievement export), and a Log Route page that plans the order to catch every fish you still need, grouping fish by fishing spot and slotting in time-limited fish when their windows open.

## Run it

Requires [Node.js](https://nodejs.org) 20 or newer. Built with React and Vite.

```sh
npm install
npm run dev          # open http://localhost:5173
npm run build        # production build in dist/ (npm run preview serves it)
npm test             # unit and component tests
npm run lint         # ESLint
npm run test:e2e     # end-to-end tests in Chromium (no network needed)
npm run fetch:fish   # refresh the offline fallback src/data/fish.json from XIVAPI
npm run fetch:icons  # refresh the fish icon sheets from XIVAPI
npm run fetch:baits  # refresh where to get each bait
```

Fish data is loaded live from the game data on XIVAPI each time the app opens; a bundled snapshot is used if it can't be reached.

## Credits

Fish data, icons and weather come from the game data on [XIVAPI](https://v2.xivapi.com/).
Best bait and the Fish Timers' catch windows (times and weather) come from [FFXIV Teamcraft](https://ffxivteamcraft.com/)'s fishing data.
FINAL FANTASY XIV © SQUARE ENIX CO., LTD.
