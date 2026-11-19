// XIVAPI v2 requests for the build-time data update. Every request pins the schema revision so field names
// (notably Unknown1/Unknown2) can't change under us.
import { XIVAPI, XIVAPI_SCHEMA } from "../../src/lib/xivapi.js";

export { XIVAPI };
export const SCHEMA_PARAM = `schema=${encodeURIComponent(XIVAPI_SCHEMA)}`;
export const PAGE = 500; // XIVAPI's maximum page size

/** JSON from a URL, retried a few times on network errors and 5xx. */
export async function getJson(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      if (r.status < 500 || i >= tries) throw new Error(`HTTP ${r.status} for ${url}`);
    } catch (e) {
      if (i >= tries || /HTTP 4/.test(e.message)) throw e;
    }
    await new Promise(res => setTimeout(res, 500 * 2 ** i));
  }
}

/** Rows of `sheet` with these ids, fetched in chunks so URLs stay short. */
export async function xivRows(sheet, ids, fields) {
  const unique = [...new Set(ids)].filter(id => id > 0).sort((a, b) => a - b), rows = [];
  for (let i = 0; i < unique.length; i += 200) {
    const page = await getJson(`${XIVAPI}/sheet/${sheet}?rows=${unique.slice(i, i + 200).join(",")}&limit=${PAGE}&fields=${fields}&${SCHEMA_PARAM}`);
    rows.push(...page.rows);
  }
  return rows;
}

/** Every row of a sheet, page by page; `stop(page)` ends early. Returns { rows, version }. */
export async function allRows(sheet, fields, stop = () => false) {
  const rows = [];
  let version = null;
  for (let after = -1; ;) {
    const p = await getJson(`${XIVAPI}/sheet/${sheet}?limit=${PAGE}&fields=${fields}&${SCHEMA_PARAM}` + (after >= 0 ? `&after=${after}` : ""));
    version ??= p.version;
    rows.push(...p.rows);
    if (p.rows.length < PAGE || stop(p)) return { rows, version };
    after = p.rows.at(-1).row_id;
  }
}

/** Every result of a search, following the cursor. */
export async function search(sheet, query, fields) {
  let page = await getJson(`${XIVAPI}/search?sheets=${sheet}&query=${encodeURIComponent(query)}&limit=${PAGE}&fields=${fields}&${SCHEMA_PARAM}`);
  const results = [...page.results];
  while (page.next) {
    page = await getJson(`${XIVAPI}/search?cursor=${encodeURIComponent(page.next)}&limit=${PAGE}`);
    results.push(...page.results);
  }
  return results;
}

/** A nested field: field(row, "Item", "Name") → row.fields.Item.fields.Name */
export const field = (node, ...path) => path.reduce((v, k) => v?.fields?.[k], node);
