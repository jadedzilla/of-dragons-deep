// XIVAPI v2. The game data is fetched at build time (scripts/update-data.mjs, pinned to this schema revision); the app
// only loads game images from it.
export const XIVAPI = "https://v2.xivapi.com/api";
export const XIVAPI_SCHEMA = "exdschema@2:rev:e773c41a90aed788cf4c1c48469fa85618ef01fb";

/** PNG URL for a game asset path (e.g. "ui/icon/029000/029063_hr1.tex"); null for none. */
export const xivAsset = path => path ? `${XIVAPI}/asset?path=${encodeURIComponent(path)}&format=png` : null;

/** 80px icon URL for a game icon id. */
export function iconUrl(id) {
  const s = String(id).padStart(6, "0");
  return xivAsset(`ui/icon/${s.slice(0, 3)}000/${s}_hr1.tex`);
}
