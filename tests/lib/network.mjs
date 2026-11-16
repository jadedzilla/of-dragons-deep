// Serves the recorded network (tests/fixtures/network.json.gz) to test pages, so nothing goes to the internet:
//   XIVAPI requests the app makes → the recorded response (exact URL) or, for `?rows=` lookups, the matching rows;
//   XIVAPI images → a 1×1 transparent PNG; Teamcraft files → recorded; anything else off-site (fonts…) → aborted;
//   unknown XIVAPI/Teamcraft URLs → 404, which the app handles like an outage.
// A test can still override any URL with page.route() — page routes win over these context routes.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { canonical } from "./canonical.mjs";

export const NET = JSON.parse(gunzipSync(readFileSync(new URL("../fixtures/network.json.gz", import.meta.url))));
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const CORS = { "access-control-allow-origin": "*" };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });

/** A fetch() for Node that answers from the recording (for computing expected values with the app's own modules). */
export async function recordedFetch(url) {
  const body = NET.exact[canonical(url)] ?? rowsFor(url);
  return body ? new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }) : new Response("{}", { status: 404 });
}

function rowsFor(url) {
  const u = new URL(url), sheet = /^\/api\/sheet\/(\w+)$/.exec(u.pathname)?.[1], rows = u.searchParams.get("rows");
  if (!sheet || !rows || !NET.tables[sheet]) return null;
  const want = new Set(rows.split(",").map(Number));
  return { rows: NET.tables[sheet].filter(r => want.has(r.row_id)) };
}

export async function mockNetwork(context, origin) {
  await context.route(url => url.origin !== origin && url.protocol !== "file:" && url.protocol !== "data:", route => {
    const url = route.request().url(), host = new URL(url).hostname;
    if (host === "v2.xivapi.com") {
      if (new URL(url).pathname === "/api/asset") return route.fulfill({ status: 200, contentType: "image/png", headers: CORS, body: PNG });
      const body = NET.exact[canonical(url)] ?? rowsFor(url);
      return body ? json(route, body) : json(route, { code: 404, message: "not recorded" }, 404);
    }
    if (host === "raw.githubusercontent.com") {
      const body = NET.exact[canonical(url)];
      return body ? json(route, body) : route.fulfill({ status: 404, headers: CORS, body: "not recorded" });
    }
    return route.abort("blockedbyclient");
  });
}
