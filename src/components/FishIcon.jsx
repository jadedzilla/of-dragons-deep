import { useEffect, useState, useSyncExternalStore } from "react";
import { iconSpot, requestSheet, sheetState, subscribeSheets } from "../lib/icons.js";
import { iconUrl } from "../lib/xivapi.js";

/** A fish's icon: from the sprite sheets, else straight from XIVAPI, else a drawn placeholder. */
export function FishIcon({ fish }) {
  const spot = iconSpot(fish);
  if (spot) return <SheetIcon spot={spot} />;
  return fish.icon ? <RemoteIcon fish={fish} /> : <FishPlaceholder fish={fish} />;
}

function SheetIcon({ spot }) {
  const state = useSyncExternalStore(subscribeSheets, () => sheetState(spot.sheet));
  useEffect(() => { requestSheet(spot.sheet); }, [spot.sheet]);
  const cls = state === "instant" ? " ready instant" : state === "ready" ? " ready" : "";
  return <span className={`ic s${spot.sheet}${cls}`}
    style={{ backgroundImage: `url("${spot.url}")`, backgroundSize: spot.size, backgroundPosition: spot.position }} />;
}

function RemoteIcon({ fish }) {
  const [state, setState] = useState("loading");
  if (state === "failed") return <FishPlaceholder fish={fish} />;
  return <img className={`ic${state === "ready" ? " ready" : ""}`} alt="" loading="lazy" src={iconUrl(fish.icon)}
    onLoad={() => setState("ready")} onError={() => setState("failed")} />;
}

function hash(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** A fish silhouette tinted from its name. */
function FishPlaceholder({ fish: f }) {
  const hue = hash(f.name) % 360, hue2 = (hue + 40) % 360;
  const body = f.big ? "M8 32c10-14 30-18 44-6l8-8v28l-8-8c-14 12-34 8-44-6z" : "M10 32c8-11 24-14 36-5l8-7v24l-8-7c-12 9-28 6-36-5z";
  return (
    <svg viewBox="0 0 64 64">
      <defs><linearGradient id={`g${f.id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={`hsl(${hue},65%,68%)`} /><stop offset="1" stopColor={`hsl(${hue2},55%,36%)`} /></linearGradient></defs>
      <path d={body} fill={`url(#g${f.id})`} stroke="#000" strokeOpacity=".55" strokeWidth="1.5" />
      <circle cx={f.big ? 17 : 18} cy="29" r="2.4" fill="#111" /><circle cx={f.big ? 16.4 : 17.4} cy="28.4" r=".8" fill="#fff" />
    </svg>
  );
}
