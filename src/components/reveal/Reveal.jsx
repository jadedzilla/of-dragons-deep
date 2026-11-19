// Gacha-style reveal of newly caught fish after an import: a bobber is cast out, a fish's shadow strikes the hook (a
// ! / !! / !!! bite mark by the best fish), it's yanked in as rays burst out and white floods the screen, bubbles rise
// through the fading white, then up to 10 new fish flip over as cards (the rest as a strip of icons). A tap skips to the
// end; once the cards show only Close closes. Cards tilt toward a mouse pointer; a tapped card turns over to its details
// (a tap beside it puts it back).
// The phases are classes on the dialog (rise, bite, reel, boom, bubbles, dealt, done), set from timers.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { basicFacts } from "../../lib/fishFacts.js";
import { FishIcon } from "../FishIcon.jsx";
import { FLASH, FLASH_AT, FLASH_FADES, burst, motes, swingLine } from "./effects.js";

// Each card starts to flip when the one before is edge-on: the flip (1.05 s, cubic-bezier(.3,1.3,.5,1)) passes 90° at 13.5%.
const FLIP_GAP = Math.round(1050 * .135);
const CARDS = 10, STRIP = 60, ZOOM_MS = 700;
const BUBBLE_DELAY = .35, BUBBLE_RISE = [.75, 1.2]; // s: latest start, rise time range

const tierOf = f => f.big ? 3 : f.collectable ? 2 : 1; // !!! big fish, !! collectable, ! otherwise
const KIND = ["", "std", "coll", "big"];               // card colour by tier: silver, blue, gold
const rank = f => (f.big ? 2 : 0) + (f.collectable ? 1 : 0);
const tagOf = f => f.big ? "Big fish" : f.collectable ? "Collectable" : f.spear ? "Spearfish" : f.lvl > 1 ? `Lv ${f.lvl}` : "Ocean fishing";
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Turns the zoomed card over (toDetails) or back. The faces swap exactly when it's edge-on, instead of relying on
 *  backface-visibility, which Safari gets wrong for the turned-over face (it showed a blank card). */
function turn(big, toDetails, timing) {
  const [a, b] = toDetails ? [0, 180] : [180, 0];
  big.querySelector(".gc-big-inner").animate([
    { transform: `rotateY(${a}deg)`, easing: "cubic-bezier(.5,0,1,1)" },     // speeds up to edge-on…
    { transform: "rotateY(90deg)", offset: .5, easing: "cubic-bezier(0,0,.3,1)" }, // …then settles
    { transform: `rotateY(${b}deg)` },
  ], timing);
  const swap = shownFirst => [{ visibility: shownFirst ? "visible" : "hidden" }, { visibility: shownFirst ? "visible" : "hidden", offset: .5 },
    { visibility: shownFirst ? "hidden" : "visible", offset: .5 }, { visibility: shownFirst ? "hidden" : "visible" }];
  big.querySelector(".gc-face").animate(swap(toDetails), timing);
  big.querySelector(".gc-info").animate(swap(!toDetails), timing);
  // while turning, the details face is the card's back; once over it lies flat (.over in reveal.css)
  if (toDetails) big.querySelector(".gc-info").animate([{ transform: "rotateY(180deg) translateZ(1px)" }, { transform: "rotateY(180deg) translateZ(1px)" }], timing);
}

/** One exclamation mark like the game's: a chunky bar over a dot, with a glowing core and a highlight. */
const Bang = () => (
  <svg viewBox="0 0 40 100" aria-hidden="true">
    <path className="o" d="M20 2C31 2 37.5 9 36.5 20L27.5 61C26.5 68 13.5 68 12.5 61L3.5 20C2.5 9 9 2 20 2Z" /><circle className="o" cx="20" cy="85" r="10" />
    <path className="i" d="M20 9C27 9 30.5 14 30 21L23.6 56C23 60 17 60 16.4 56L10 21C9.5 14 13 9 20 9Z" /><circle className="i" cx="20" cy="85" r="6" />
    <ellipse className="g" cx="14.5" cy="17" rx="3.2" ry="7" transform="rotate(-12 14.5 17)" /><circle className="g" cx="16.5" cy="81.5" r="2.4" />
  </svg>
);
/** n marks fanned along a slight curve. */
const Bangs = ({ n }) => Array.from({ length: n }, (_, j) => {
  const k = n === 1 ? .5 : j - (n - 1) / 2;
  return <b key={j} style={{ "--j": j, rotate: `${(k * 12 + 3).toFixed(1)}deg`, translate: `0 ${(k * k * 3).toFixed(1)}px` }}><Bang /></b>;
});

/** Splash and ripples, as back or front halves (the bobber sits inside the rings). */
const Rings = ({ side }) => <><i className={`gc-splash ${side}`} />{[0, 1, 2].map(k => <i key={k} className={`gc-ripple ${side}`} style={{ "--k": k }} />)}</>;

const FishShadow = () => (
  <svg viewBox="0 0 60 150">
    <g className="f-head"><path d="M30 2C44 4 50 26 49 50C48.6 60 47 68 45 76H15C13 68 11.4 60 11 50C10 26 16 4 30 2Z" />
      <path d="M13 46C4 50 0 60 1 68C7 62 11 58 14 56ZM47 46C56 50 60 60 59 68C53 62 49 58 46 56Z" /></g>
    <g className="f-body"><path d="M45.5 70C43.5 86 39.5 98 34.5 110H25.5C20.5 98 16.5 86 14.5 70Z" />
      <g className="f-tail"><path d="M35 106L45 140C38 138 33 132 30 126C27 132 22 138 15 140L25 106Z" /></g></g>
  </svg>
);
const Tackle = () => <svg className="gc-tackle" viewBox="0 0 24 56"><path className="ln" d="M12 0V40" /><path className="hk" d="M12 38v8c0 6-8 6-8 0M4 46l2.5-3" /></svg>;

/** Random column, size, sway, speed and start for each bubble (new ones for each reveal). */
function makeBubbles(n) {
  const rnd = (a, b) => (a + Math.random() * (b - a)).toFixed(2);
  return Array.from({ length: n }, () => ({ left: `${rnd(0, 100)}%`, bottom: `${rnd(5, 70)}vh`, "--s": `${rnd(70, 240)}px`,
    "--d": `${rnd(0, BUBBLE_DELAY)}s`, "--t": `${rnd(...BUBBLE_RISE)}s`, "--x": `${rnd(-30, 30)}px` }));
}
function Bubbles({ n = 46 }) {
  const [list] = useState(() => makeBubbles(n));
  return <div className="gc-bubbles" aria-hidden="true">{list.map((style, i) => <i key={i} style={style}><b /></i>)}</div>;
}

/** fish: the newly caught fish (null when not showing). onClose when closed; onOpenFish opens the full fish view. */
export function Reveal({ fish, onClose, onOpenFish }) {
  const ref = useRef(null), countRef = useRef(null), ctl = useRef({});
  const [zoom, setZoom] = useState(null); // { fish, kind, card }
  const zoomRef = useRef(null), leaving = useRef(false);

  const sorted = useMemo(() => [...(fish ?? [])].sort((a, b) => rank(b) - rank(a) || b.lvl - a.lvl), [fish]);
  const cards = sorted.slice(0, CARDS), rest = sorted.slice(CARDS);
  const strip = matchMedia("(max-width: 520px)").matches ? STRIP / 2 : STRIP;

  useEffect(() => {
    if (!fish?.length) return;
    const dialog = ref.current, total = fish.length, timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const isDone = () => dialog.classList.contains("done");
    const setCount = n => { countRef.current.textContent = n.toLocaleString("en-US"); };
    const countTo = ms => {
      const start = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - start) / ms);
        setCount(isDone() ? total : Math.round(total * t));
        if (t < 1 && !isDone()) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const finish = () => { // jump to the end
      timers.forEach(clearTimeout);
      dialog.classList.add("reel", "dealt", "done");
      motes(dialog, reduced());
      dialog.querySelectorAll(".gc-card").forEach(c => c.classList.add("flipped"));
      setCount(total);
    };
    ctl.current = { finish, isDone, stop: () => timers.forEach(clearTimeout) };
    dialog.className = "gacha-dialog";
    setCount(0);
    dialog.showModal();
    dialog.scrollTop = 0; // showModal focuses Close (at the bottom); start at the top on short screens
    if (reduced()) { finish(); return ctl.current.stop; }
    swingLine(dialog);
    later(1250, () => dialog.classList.add("rise")); // a fish's shadow swims up…
    later(2250, () => dialog.classList.add("bite")); // …and strikes
    later(3250, () => { // one swift yank, and the burst
      const r = dialog.querySelector(".gc-float").getBoundingClientRect();
      dialog.classList.add("reel", "boom");
      burst(dialog, r.left + r.width / 2, r.top + r.height / 2);
    });
    const BUBBLES_AT = 3250 + FLASH_FADES - 250, LAST_BUBBLE = BUBBLES_AT + (BUBBLE_DELAY + BUBBLE_RISE[1]) * 1000;
    later(BUBBLES_AT, () => dialog.classList.add("bubbles"));
    later(3250 + FLASH_AT + FLASH * .29, () => { dialog.classList.add("dealt"); motes(dialog); countTo(2000 + Math.min(fish.length, CARDS) * FLIP_GAP); });
    const flips = () => {
      const els = dialog.querySelectorAll(".gc-card");
      els.forEach((c, i) => later(i * FLIP_GAP, () => c.classList.add("flipped")));
      later(els.length * FLIP_GAP + 700, finish);
    };
    const bubblesDone = performance.now() + LAST_BUBBLE;
    const waitForBubbles = () => { // flip once no bubble is over the cards (or the last has finished)
      const box = dialog.querySelector(".gc-cards").getBoundingClientRect();
      const over = [...dialog.querySelectorAll(".gc-bubbles i")].some(b => {
        const r = b.getBoundingClientRect();
        return r.bottom > box.top && r.top < box.bottom && r.right > box.left && r.left < box.right && +getComputedStyle(b).opacity > .05;
      });
      if (over && performance.now() < bubblesDone) later(100, waitForBubbles); else flips();
    };
    later(Math.max(BUBBLES_AT + 900, 3250 + FLASH_AT + FLASH), waitForBubbles); // and once the flash has fully gone, so no white veil fades off the turned cards
    return ctl.current.stop;
  }, [fish]);

  // zoom in: from the card's place to the middle, turning over
  useLayoutEffect(() => {
    if (!zoom) return;
    const layer = ref.current.querySelector(".gc-zoom"), big = layer.querySelector(".gc-big");
    // an exact enlargement of the clicked card: its shape, and its front's layout scaled up
    const cw = zoom.card.offsetWidth, ch = zoom.card.offsetHeight;
    big.style.aspectRatio = `${cw} / ${ch}`;
    const from = zoom.card.getBoundingClientRect(), to = big.getBoundingClientRect();
    big.style.setProperty("--cw", `${cw}px`);
    big.style.setProperty("--ch", `${ch}px`);
    big.style.setProperty("--k", to.width / cw);
    zoomRef.current = `translate(${from.left + from.width / 2 - (to.left + to.width / 2)}px, ${from.top + from.height / 2 - (to.top + to.height / 2)}px) scale(${from.width / to.width})`;
    zoom.card.classList.add("lifted"); // its place stays empty while it's in the middle
    big.classList.remove("fade");
    big.classList.toggle("shining", !!zoom.shine);
    if (zoom.shine) { big.style.setProperty("--mx", zoom.shine.mx); big.style.setProperty("--my", zoom.shine.my); }
    getComputedStyle(big.querySelector(".gc-face"), "::after").opacity; // start from that, then fade it out
    big.classList.add("fade");
    layer.classList.add("on");
    if (!reduced()) {
      big.animate([{ transform: zoomRef.current }, { transform: "none" }], { duration: ZOOM_MS, easing: "cubic-bezier(.2,.8,.25,1)" });
      turn(big, true, { duration: ZOOM_MS, delay: 120, fill: "backwards" });
    }
    big.classList.add("over");
  }, [zoom]);

  function unzoom() {
    const z = zoom;
    if (!z || leaving.current) return;
    const layer = ref.current.querySelector(".gc-zoom"), big = layer.querySelector(".gc-big");
    const done = () => { layer.hidden = true; leaving.current = false; big.classList.remove("over", "shining", "fade"); z.card.classList.remove("lifted"); setZoom(null); }; // hidden before the animations are cancelled, so it never pops back to full size
    layer.classList.remove("on");
    big.classList.remove("fade", "shining"); // the foil fades back in as it returns, matching the card in the row
    if (reduced()) return done();
    leaving.current = true;
    turn(big, false, { duration: ZOOM_MS * .8 });
    big.classList.remove("over");
    big.animate([{ transform: "none" }, { transform: zoomRef.current }], { duration: ZOOM_MS * .8, delay: 80, easing: "cubic-bezier(.5,0,.75,.2)", fill: "forwards" })
      .finished.then(() => { done(); big.getAnimations().forEach(a => a.cancel()); }, () => {});
  }

  // mouse hover: the card pivots toward the pointer and a foil shine follows it
  const hovered = useRef(null);
  const untilt = card => { card.classList.remove("tilting"); for (const v of ["--rx", "--ry"]) card.style.removeProperty(v); };
  function onPointerMove(e) {
    const card = ctl.current.isDone?.() && !zoom && e.pointerType === "mouse" ? e.target.closest(".gc-card") : null;
    if (hovered.current && hovered.current !== card) untilt(hovered.current);
    hovered.current = card;
    if (!card) return;
    const box = card.getBoundingClientRect(), x = (e.clientX - box.left) / box.width, y = (e.clientY - box.top) / box.height;
    card.classList.add("tilting");
    card.style.setProperty("--ry", `${((x - .5) * 18).toFixed(2)}deg`); // up to ±9°
    card.style.setProperty("--rx", `${((.5 - y) * 18).toFixed(2)}deg`);
    card.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    card.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
  }

  function onClick(e) {
    if (e.target.closest("#gcClose")) return ref.current.close();
    if (!ctl.current.isDone?.()) return ctl.current.finish?.();
    if (zoom) return e.target.closest(".gc-big") ? undefined : unzoom(); // a click beside the card puts it back
    const card = e.target.closest(".gc-card");
    if (!card) return;
    // the zoomed card starts with the card's foil (a hovered card's bright one, where the pointer had it), then it fades
    const shine = hovered.current === card ? { mx: card.style.getPropertyValue("--mx"), my: card.style.getPropertyValue("--my") } : null;
    if (hovered.current) { untilt(hovered.current); hovered.current = null; }
    const f = cards.find(x => x.id === +card.dataset.id);
    if (f) setZoom({ fish: f, kind: card.classList.contains("big") ? "big" : card.classList.contains("coll") ? "coll" : "plain", card, shine });
  }

  const tier = fish?.length ? Math.max(...fish.map(tierOf)) : 1;
  return (
    <dialog ref={ref} className="gacha-dialog" id="gachaDialog" aria-label="New fish caught"
      onClick={onClick} onPointerMove={onPointerMove}
      onPointerLeave={() => { if (hovered.current) untilt(hovered.current); hovered.current = null; }}
      onCancel={e => { if (!ctl.current.isDone?.()) return; e.preventDefault(); if (zoom) unzoom(); }}
      onClose={() => { ctl.current.stop?.(); leaving.current = false; setZoom(null); onClose(); }}>
      {fish?.length > 0 && <div className="gc-stage" key={fish.map(f => f.id).join()}>
        <svg className="gc-line" aria-hidden="true"><defs><linearGradient id="gcLineFade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8e2d0" stopOpacity="0" /><stop offset=".35" stopColor="#e8e2d0" stopOpacity=".6" /></linearGradient></defs><path stroke="url(#gcLineFade)" /></svg>
        <div className="gc-bob" aria-hidden="true">
          <span className="gc-fish"><FishShadow /></span><Rings side="back" />
          <span className="gc-float"><span className="gc-stick" /><Tackle /></span><Rings side="front" />
          <span className={`gc-bang t${tier}`}><Bangs n={tier} /></span>
        </div>
        <canvas className="gc-motes" aria-hidden="true" />
        <canvas className="gc-boom" aria-hidden="true" />
        <Bubbles />
        <h2 className="gc-title">You caught <b id="gcCount" ref={countRef}>0</b> new fish!</h2>
        <div className="gc-cards">{cards.map((f, i) => (
          <div className={`gc-card ${KIND[tierOf(f)]}`} style={{ "--i": i }} data-id={f.id} key={f.id}>
            <div className="gc-tilt"><div className="gc-inner">
              <div className="gc-back" aria-hidden="true" />
              <div className="gc-front"><CardFace f={f} /></div>
            </div></div>
          </div>))}
        </div>
        {rest.length > 0 && <div className="gc-strip">
          {rest.slice(0, strip).map(f => <span className="gc-mini" title={f.name} key={f.id}><FishIcon fish={f} /></span>)}
          {rest.length > strip && <span className="gc-more">+{(rest.length - strip).toLocaleString("en-US")} more</span>}
        </div>}
        <div className="gc-actions"><button type="button" className="btn primary" id="gcClose">Close</button><span className="gc-hint">Tap to skip</span></div>
        <div className="gc-zoom" hidden={!zoom}>
          <div className={`gc-big ${zoom?.kind ?? "plain"}`}><div className="gc-big-inner">
            <div className="gc-face" aria-hidden="true">{zoom && <div className="gc-face-in"><CardFace f={zoom.fish} /></div>}</div>
            <div className="gc-info">{zoom && <CardInfo f={zoom.fish} onDetails={() => onOpenFish(zoom.fish)} />}</div>
          </div></div>
        </div>
      </div>}
    </dialog>
  );
}

const CardFace = ({ f }) => <>
  <span className={`gc-mark t${tierOf(f)}`} aria-hidden="true"><Bangs n={tierOf(f)} /></span>
  <span className="gc-icon"><FishIcon fish={f} /></span>
  <span className="gc-name">{f.big && <i className="tm-big" />}{f.name}</span>
  <span className="gc-tag">{tagOf(f)}</span>
</>;

/** The back of a zoomed card: the fish, its kind, the basic facts and a link to the full fish view. */
const CardInfo = ({ f, onDetails }) => <>
  <div className="gc-info-head"><span className="gc-icon"><FishIcon fish={f} /></span>
    <div><div className="gc-name">{f.name}</div><div className="gc-tag">{tagOf(f)}</div></div></div>
  <dl className="gc-facts">{basicFacts(f).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
  <button type="button" className="btn small gc-details-btn" onClick={e => { e.stopPropagation(); onDetails(); }}>More details</button>
</>;
