import { useApp } from "../context.js";
import { Img } from "./Img.jsx";

/** A bait (icon + name). A real bait opens the bait view; a fish used as bait (mooch) is plain text. */
export function BaitChip({ id, name, icon, className }) {
  const { fishById, openBait } = useApp();
  const img = icon ? <Img src={icon} /> : null;
  if (fishById.has(id)) return <span className={className}>{img}{name}</span>;
  return <button type="button" className={`${className} bait-link`} data-bait={id} title={`Where to get ${name}`}
    onClick={e => { e.stopPropagation(); openBait(id); }}>{img}{name}</button>;
}
