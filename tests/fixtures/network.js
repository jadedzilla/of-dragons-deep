// The recorded network (fixtures/network.json.gz, made by `npm run fixtures`), so tests never touch the internet:
//   exact:  { canonical URL → JSON body }  every request the app's loaders make
//   tables: { sheet → [rows] }             rows the pages look up with ?rows= depending on what's on screen
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

export const NET = JSON.parse(gunzipSync(readFileSync(fileURLToPath(import.meta.resolve("./network.json.gz")))));
export const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

/** A URL with its query decoded and sorted, so browser and Node spellings of a request match. */
export function canonical(url) {
  const u = new URL(url);
  const params = [...u.searchParams].sort(([a, x], [b, y]) => a.localeCompare(b) || x.localeCompare(y));
  return `${u.origin}${u.pathname}?${params.map(([k, v]) => `${k}=${v}`).join("&")}`;
}

/** The recorded body for a URL (exact, or the matching rows of a ?rows= lookup), or undefined. */
export function recorded(url) {
  const exact = NET.exact[canonical(url)];
  if (exact) return exact;
  const u = new URL(url), sheet = /^\/api\/sheet\/(\w+)$/.exec(u.pathname)?.[1], rows = u.searchParams.get("rows");
  if (!sheet || !rows || !NET.tables[sheet]) return undefined;
  const want = new Set(rows.split(",").map(Number));
  return { rows: NET.tables[sheet].filter(r => want.has(r.row_id)) };
}

/** fetch() answered from the recording (404 for anything not recorded). */
export async function recordedFetch(url) {
  const body = recorded(String(url));
  return body ? new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }) : new Response("{}", { status: 404 });
}
