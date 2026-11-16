// Fish icons: real game icons from sprite sheets (data/icons/, built by scripts/fetch-icons.mjs from XIVAPI).
// Fish added since the sheets were built load their icon straight from XIVAPI; if that fails too
// (offline, or remote images blocked), main.js swaps in an SVG placeholder.

let ICONS = null; // { cols, icons: { iconId: index } }

/** Load the icon manifest and register one CSS class per sprite sheet. Resolves even if icons are unavailable. */
export async function loadIcons() {
  try {
    const m = window.__ICON_DATA__ ?? await fetch("data/icons.json").then(r => {
      if (!r.ok) throw new Error(`Could not load data/icons.json (${r.status})`);
      return r.json();
    });
    const base = window.__ICON_DATA__ ? "" : "data/icons/";
    const style = document.createElement("style");
    style.textContent = m.sheets.map((s, i) => `.ic.s${i}{background-image:url("${base}${s}")}`).join("\n")
      + `\n.ic{background-size:${m.cols * 100}% ${m.cols * 100}%}`
      + (m.frame ? `\n.tile .shine,.grid:has(.shine) .tile.empty::after{background-image:url("${base}${m.frame}")}` : "");
    document.head.appendChild(style);
    ICONS = m;
  } catch (e) {
    console.warn("Fish icons unavailable, using placeholders:", e.message);
  }
}

const remoteIconUrl = id => {
  const s = String(id).padStart(6, "0");
  return `https://v2.xivapi.com/api/asset?path=${encodeURIComponent(`ui/icon/${s.slice(0, 3)}000/${s}_hr1.tex`)}&format=png`;
};

function hash(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function fishPlaceholder(f) {
  const hue = hash(f.name) % 360, hue2 = (hue + 40) % 360;
  const body = f.big
    ? "M8 32c10-14 30-18 44-6l8-8v28l-8-8c-14 12-34 8-44-6z"
    : "M10 32c8-11 24-14 36-5l8-7v24l-8-7c-12 9-28 6-36-5z";
  return `<svg viewBox="0 0 64 64"><defs><linearGradient id="g${f.id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="hsl(${hue},65%,68%)"/><stop offset="1" stop-color="hsl(${hue2},55%,36%)"/></linearGradient></defs>
    <path d="${body}" fill="url(#g${f.id})" stroke="#000" stroke-opacity=".55" stroke-width="1.5"/>
    <circle cx="${f.big ? 17 : 18}" cy="29" r="2.4" fill="#111"/><circle cx="${f.big ? 16.4 : 17.4}" cy="28.4" r=".8" fill="#fff"/></svg>`;
}

/** The game's icon frame + reflective shine, drawn over the icon (empty if the frame isn't available). */
export const shine = () => ICONS?.frame ? `<i class="shine"></i>` : "";

export function fishIcon(f) {
  const i = ICONS?.icons[f.icon];
  if (i === undefined) return f.icon ? `<img class="ic" alt="" loading="lazy" src="${remoteIconUrl(f.icon)}">` : fishPlaceholder(f);
  const per = ICONS.cols * ICONS.cols, k = i % per, step = 100 / (ICONS.cols - 1);
  return `<span class="ic s${Math.floor(i / per)}" style="background-position:${(k % ICONS.cols) * step}% ${Math.floor(k / ICONS.cols) * step}%"></span>`;
}
