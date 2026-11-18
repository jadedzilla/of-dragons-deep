import { useEffect, useRef, useState } from "react";
import { useApp } from "../context.js";
import { CATEGORIES, OCEAN_FISHING } from "../lib/fishData.js";
import { drawShareCard, shareAlt, shareStats } from "../lib/shareCard.js";
import { KEYS, readRaw, writeRaw } from "../lib/storage.js";
import { Skeleton } from "../components/Skeleton.jsx";

const fileName = () => `of-dragons-deep-${new Date().toISOString().slice(0, 10)}.png`;

/** Share: a PNG card of your progress to download, share (phones) or copy. Redrawn each time the page is shown. */
export function Share({ active }) {
  const { fish, spear, allFish, fishById, isCaught } = useApp();
  const [name, setName] = useState(() => readRaw(KEYS.shareName) ?? "");
  const [card, setCard] = useState(null); // { url, blob, alt, w, h, canShare }
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState("");
  const token = useRef(0);

  async function draw(who) {
    const my = ++token.current;
    const stats = await shareStats({ fishList: fish, spearList: spear, allFish, fishById, isCaught, categories: CATEGORIES, oceanCategory: OCEAN_FISHING });
    const canvas = await drawShareCard(stats, { name: who });
    const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
    if (my !== token.current) return;
    setCard(old => {
      if (old) URL.revokeObjectURL(old.url);
      return { url: URL.createObjectURL(blob), blob, alt: shareAlt(stats), w: canvas.width, h: canvas.height,
        canShare: !!navigator.canShare?.({ files: [new File([blob], fileName(), { type: "image/png" })] }) };
    });
    setBusy(false);
  }

  const [wasActive, setWasActive] = useState(false);
  if (active !== wasActive) { setWasActive(active); setStatus(""); if (active) setBusy(true); }
  useEffect(() => { if (active) draw(name); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps -- redrawn each time the page is shown
  const typing = useRef(null);
  const rename = v => {
    setName(v);
    setBusy(true);
    writeRaw(KEYS.shareName, v);
    clearTimeout(typing.current);
    typing.current = setTimeout(() => draw(v), 300);
  };

  function download() {
    const a = document.createElement("a");
    a.href = card.url; a.download = fileName();
    document.body.appendChild(a); a.click(); a.remove();
    setStatus("Saved.");
  }
  async function share() {
    try { await navigator.share({ files: [new File([card.blob], fileName(), { type: "image/png" })], title: "Of Dragons Deep" }); setStatus(""); }
    catch (e) { if (e.name !== "AbortError") setStatus("Couldn't open the share sheet."); }
  }
  async function copy() {
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": card.blob })]); setStatus("Copied. Paste it anywhere."); }
    catch { setStatus("Couldn't copy the image here; use Download instead."); }
  }

  return <>
    <div className="sh-head">
      <p className="ns-intro">A card of your progress to post anywhere, made from the fish you've marked caught and your achievements.</p>
      <div className="sh-controls">
        <input className="sh-name" id="shName" type="text" maxLength="40" placeholder="Character name (optional)" autoComplete="off" aria-label="Name on the card"
          value={name} onChange={e => rename(e.target.value)} />
      </div>
    </div>
    <div className="sh-preview" id="shPreview">
      {card ? <img id="shImg" alt={card.alt} width={card.w} height={card.h} src={card.url} /> : <Skeleton kind="share" label="Drawing your card…" />}
    </div>
    <div className="sh-actions">
      <button type="button" className="btn primary" id="shDownload" disabled={busy} onClick={download}>Download PNG</button>
      {" "}<button type="button" className="btn" id="shShare" hidden={!card?.canShare} disabled={busy} onClick={share}>Share…</button>
      {" "}<button type="button" className="btn" id="shCopy" hidden={!(window.ClipboardItem && navigator.clipboard?.write)} disabled={busy} onClick={copy}>Copy image</button>
      {" "}<span className="sh-status" id="shStatus" role="status">{status}</span>
    </div>
  </>;
}
