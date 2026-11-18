// XIVAPI v2 (game data). Every request pins the schema revision so field names (notably Unknown1/Unknown2) can't change.
export const XIVAPI = "https://v2.xivapi.com/api";
export const XIVAPI_SCHEMA = "exdschema@2:rev:e773c41a90aed788cf4c1c48469fa85618ef01fb";
export const SCHEMA_PARAM = `schema=${encodeURIComponent(XIVAPI_SCHEMA)}`;

export async function getJson(url, { fetchFn = fetch, signal } = {}) {
  const r = await fetchFn(url, { signal });
  if (!r.ok) throw new Error(`XIVAPI HTTP ${r.status}`);
  return r.json();
}

/** PNG URL for a game asset path (e.g. "ui/icon/029000/029063_hr1.tex"). */
export const xivAsset = path => `${XIVAPI}/asset?path=${encodeURIComponent(path)}&format=png`;

/** 80px icon URL for a game icon id. */
export function iconUrl(id) {
  const s = String(id).padStart(6, "0");
  return xivAsset(`ui/icon/${s.slice(0, 3)}000/${s}_hr1.tex`);
}

/** Rows of `sheet` with these ids, fetched in chunks so URLs stay short. */
export async function xivRows(sheet, ids, fields, { fetchFn = fetch, signal } = {}) {
  const unique = [...new Set(ids)], rows = [];
  for (let i = 0; i < unique.length; i += 200) {
    const page = await getJson(`${XIVAPI}/sheet/${sheet}?rows=${unique.slice(i, i + 200).join(",")}&limit=500`
      + `&fields=${fields}&${SCHEMA_PARAM}`, { fetchFn, signal });
    rows.push(...page.rows);
  }
  return rows;
}

/** A nested field: field(row, "Item", "Name") → row.fields.Item.fields.Name */
export const field = (node, ...path) => path.reduce((v, k) => v?.fields?.[k], node);
