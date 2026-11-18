// Gacha-style reveal of newly caught fish after an import: a bobber is cast out on a swinging line, a fish's shadow
// swims up and strikes the hook beneath it (a ! / !! / !!! bite mark pops out), the bobber is yanked in as rays burst
// out of it and white floods the screen, big out-of-focus bubbles float up over the cards as the white fades, then the
// new fish flip over as cards (big fish first, gold; collectables blue; others silver). Up to CARDS fish get a card;
// the rest show as a strip of small icons with a "+N more" count. Tap anywhere to jump to the end; Close / Esc / tap
// outside the cards to close. With prefers-reduced-motion the final screen shows straight away.

// Each card starts to flip when the one before is halfway over (edge-on): with the flip's 1.05s cubic-bezier(.3,1.3,.5,1)
// (.gc-inner in styles.css) the rotation passes 90° at 13.5% of the time, so ≈ 140 ms after it started.
const FLIP_MS = 1050, FLIP_HALF = .135;
const CARDS = 10, STRIP = 60, FLIP_GAP = Math.round(FLIP_MS * FLIP_HALF); // ms between cards

/** The explosion, drawn on one screen-sized canvas (.gc-boom), because big CSS/SVG layers scaled past the screen glitch on
 *  phones. Two layers of light rays (freshly randomised wedges at irregular angles, of varying width and length, with
 *  an empty core, fading in at the inner end and out at the tip) spin out from the bobber at (cx, cy) while a soft
 *  white bloom grows from it to cover the screen, holds, then fades to show the cards. */
function burst(dialog, cx, cy) {
  const canvas = dialog.querySelector(".gc-boom"), ctx = canvas.getContext("2d");
  const dpr = Math.min(devicePixelRatio || 1, 2), w = innerWidth, h = innerHeight, vmax = Math.max(w, h);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.display = "";
  const rnd = (a, b) => a + Math.random() * (b - a);
  const layer = (n, rgb, size, spin, alpha, rampIn) => { // ray units: ±1000 = the layer's full size
    const step = Math.PI * 2 / n, start = rnd(0, Math.PI * 2), deg = Math.PI / 180;
    const rays = Array.from({ length: n }, (_, i) => {
      const a = start + i * step + rnd(-.3, .3) * step, r0 = rnd(90, 190), r1 = rnd(520, 1000), w0 = rnd(.8, 2.5) * deg, w1 = w0 + rnd(3, 7.5) * deg;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r1), c = o => `rgba(${rgb},${o})`;
      g.addColorStop(r0 / r1, c(0)); g.addColorStop((r0 + (r1 - r0) * .22) / r1, c(1)); g.addColorStop((r0 + (r1 - r0) * .6) / r1, c(1)); g.addColorStop(1, c(0));
      const pt = (r, t) => [r * Math.cos(t), r * Math.sin(t)];
      return { g, pts: [pt(r0, a - w0), pt(r1, a - w1), pt(r1, a + w1), pt(r0, a + w0)] };
    });
    return { rays, unit: size * vmax / 2000, spin: spin * deg, alpha, rampIn };
  };
  const layers = [layer(13, "255,248,225", 1.7, 40, 1, .12), layer(7, "241,220,160", 1.84, -28, .85, .18)];
  const RAYS = 1100, FLASH_AT = 150, FLASH = 1400, start = performance.now();
  const easeOut = p => 1 - (1 - p) ** 3, easeIn = p => p ** 1.8;
  const frame = now => {
    if (!dialog.open || dialog.classList.contains("done")) return;
    const t = now - start;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const p = Math.min(1, t / RAYS), e = easeOut(p);
    for (const L of layers) {
      const o = p < L.rampIn ? p / L.rampIn : p < .7 ? 1 : (1 - p) / .3;
      if (o <= 0 || e <= 0) continue;
      ctx.save();
      ctx.globalAlpha = o * L.alpha;
      ctx.translate(cx, cy); ctx.rotate(L.spin * e); ctx.scale(L.unit * e, L.unit * e);
      for (const r of L.rays) {
        ctx.beginPath(); r.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
        ctx.fillStyle = r.g; ctx.fill();
      }
      ctx.restore();
    }
    const q = (t - FLASH_AT) / FLASH; // the white bloom: grows (ease-in) to 45%, holds to 62%, fades out
    if (q > 0) {
      const R = 2 * vmax * (q < .45 ? easeIn(q / .45) : 1), o = q < .62 ? 1 : 1 - easeIn(Math.min(1, (q - .62) / .38));
      if (R > 0 && o > 0) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        g.addColorStop(0, "#fff"); g.addColorStop(.42, "#fffaf0"); g.addColorStop(.62, "rgba(255,250,240,0)");
        ctx.globalAlpha = o; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
      }
    }
    if (t < Math.max(RAYS, FLASH_AT + FLASH)) requestAnimationFrame(frame);
    else canvas.style.display = "none"; // (the hidden attribute would lose to the .boom .gc-boom display rule)
  };
  requestAnimationFrame(frame);
}

/** Bubbles that float up the screen as the cards appear: random column, size, sway, speed and start. */
const BUBBLE_DELAY = .3, BUBBLE_RISE = [.55, .95]; // s: latest start, rise time range; the cards flip once they've all gone
function bubbles(n = 46) {
  const rnd = (a, b) => (a + Math.random() * (b - a)).toFixed(2);
  return Array.from({ length: n }, () => `<i style="left:${rnd(0, 100)}%;bottom:${rnd(5, 70)}vh;--s:${rnd(70, 240)}px;--d:${rnd(0, BUBBLE_DELAY)}s;--t:${rnd(...BUBBLE_RISE)}s;--x:${rnd(-30, 30)}px"><b></b></i>`).join("");
}

/** The splash and ripple rings around the bobber, as one half each: the back halves go behind the bobber and the front
 *  halves in front of it, so it sits inside the rings on the water instead of on top of them. */
const rings = side => `<i class="gc-splash ${side}"></i>${[0, 1, 2].map(k => `<i class="gc-ripple ${side}" style="--k:${k}"></i>`).join("")}`;

/** Exclamation marks like the game's tugs, by kind of fish: !!! big fish, !! collectable, ! otherwise. Shown on the bobber at
 *  the bite (for the best fish caught) and on each card's corner. */
const tierOf = f => f.big ? 3 : f.collectable ? 2 : 1;
const KIND = ["", "std", "coll", "big"]; // card colour class by tier: silver, blue, gold
// drawn like the in-game ones: a chunky upright bar (rounded top, narrowing down) over a round dot, with a pale glowing
// core and a glossy highlight; colours per tier come from CSS (--lo edge, --hi core)
const BANG = `<svg viewBox="0 0 40 100" aria-hidden="true">`
  + `<path class="o" d="M20 2C31 2 37.5 9 36.5 20L27.5 61C26.5 68 13.5 68 12.5 61L3.5 20C2.5 9 9 2 20 2Z"/><circle class="o" cx="20" cy="85" r="10"/>`
  + `<path class="i" d="M20 9C27 9 30.5 14 30 21L23.6 56C23 60 17 60 16.4 56L10 21C9.5 14 13 9 20 9Z"/><circle class="i" cx="20" cy="85" r="6"/>`
  + `<ellipse class="g" cx="14.5" cy="17" rx="3.2" ry="7" transform="rotate(-12 14.5 17)"/><circle class="g" cx="16.5" cy="81.5" r="2.4"/></svg>`;
// fanned out along a slight curve, for a bit of whimsy: each mark leans a little further right than the one before
// and the outer ones sit a touch lower (a lone ! just leans a little)
const bangs = n => Array.from({ length: n }, (_, j) => {
  const k = n === 1 ? .5 : j - (n - 1) / 2;
  return `<b style="--j:${j};rotate:${(k * 12 + 3).toFixed(1)}deg;translate:0 ${(k * k * 3).toFixed(1)}px">${BANG}</b>`;
}).join("");

/** Rank for the reveal: big fish, then collectables, then by level (higher first). */
const rank = f => (f.big ? 2 : 0) + (f.collectable ? 1 : 0);

// The fish's shadow (head / body / tail, so CSS can bend it in a wave) and the shadow of the line and hook under the
// bobber; both blurred in CSS.
const FISH_SHADOW = `<svg viewBox="0 0 60 150"><g class="f-head"><path d="M30 2C44 4 50 26 49 50C48.6 60 47 68 45 76H15C13 68 11.4 60 11 50C10 26 16 4 30 2Z"/>`
  + `<path d="M13 46C4 50 0 60 1 68C7 62 11 58 14 56ZM47 46C56 50 60 60 59 68C53 62 49 58 46 56Z"/></g>`
  + `<g class="f-body"><path d="M45.5 70C43.5 86 39.5 98 34.5 110H25.5C20.5 98 16.5 86 14.5 70Z"/>`
  + `<g class="f-tail"><path d="M35 106L45 140C38 138 33 132 30 126C27 132 22 138 15 140L25 106Z"/></g></g></svg>`;
const TACKLE = `<svg class="gc-tackle" viewBox="0 0 24 56"><path class="ln" d="M12 0V40"/><path class="hk" d="M12 38v8c0 6-8 6-8 0M4 46l2.5-3"/></svg>`;

/** The fishing line as a rope (Verlet points with gravity and fixed-length links) from the rod tip, above the top of
 *  the screen, to the bobber's stick, drawn each frame into the dialog's .gc-line SVG until the reveal is done. It
 *  hangs slack (sags and swings) while the bobber flies and floats, and is pulled taut for the bite and reel-in. */
function swingLine(dialog) {
  const svg = dialog.querySelector(".gc-line"), path = svg.querySelector("path"), grad = svg.querySelector("linearGradient");
  const bob = dialog.querySelector(".gc-bob"), stick = dialog.querySelector(".gc-stick");
  const N = 28, GRAVITY = 0.45, DAMP = 0.985, ITER = 24;
  const anchor = () => ({ x: innerWidth * 0.34, y: -30 });
  const tip = () => { const r = stick.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 1 }; };
  const a = anchor(), b = tip();
  const pts = Array.from({ length: N + 1 }, (_, i) => { const x = a.x + (b.x - a.x) * i / N, y = a.y + (b.y - a.y) * i / N; return { x, y, px: x, py: y }; });
  let slack = 1.3; // rope length ÷ straight distance: eases toward the phase's target
  const target = () => dialog.classList.contains("reel") ? 0.97 : dialog.classList.contains("bite") ? 1.0 : 1.12;
  const frame = () => {
    if (!dialog.open || dialog.classList.contains("done")) return;
    const a = anchor(), b = tip();
    slack += (target() - slack) * 0.08;
    const seg = Math.hypot(b.x - a.x, b.y - a.y) * slack / N;
    for (const p of pts) { // Verlet: keep velocity (damped), add gravity
      const vx = (p.x - p.px) * DAMP, vy = (p.y - p.py) * DAMP;
      p.px = p.x; p.py = p.y; p.x += vx; p.y += vy + GRAVITY;
    }
    for (let k = 0; k < ITER; k++) {
      Object.assign(pts[0], a); Object.assign(pts[N], b); // pinned ends
      for (let i = 0; i < N; i++) { // links can't stretch (they can go slack: that's what makes it sag)
        const p = pts[i], q = pts[i + 1], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d <= seg) continue;
        const f = (d - seg) / d / 2;
        p.x += dx * f; p.y += dy * f; q.x -= dx * f; q.y -= dy * f;
      }
    }
    Object.assign(pts[0], a); Object.assign(pts[N], b);
    let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`; // smooth: quadratic curves through the link midpoints
    for (let i = 1; i < N; i++) d += `Q${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${((pts[i].x + pts[i + 1].x) / 2).toFixed(1)} ${((pts[i].y + pts[i + 1].y) / 2).toFixed(1)}`;
    path.setAttribute("d", d + `L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
    svg.setAttribute("viewBox", `0 0 ${innerWidth} ${innerHeight}`);
    grad.setAttribute("y2", Math.max(40, b.y));
    svg.style.opacity = getComputedStyle(bob).opacity; // fades out with the bobber at the end of the reel
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** deps: { fishIcon(f), esc(s) }. Returns { show(fish[]) → Promise (resolves when closed) }. */
export function createGacha({ fishIcon, esc }) {
  const dialog = document.querySelector("#gachaDialog");
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  let finish = null, resolveClose = null, timers = [];

  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const stopTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const isDone = () => dialog.classList.contains("done");
  function close() {
    stopTimers();
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener("close", () => { stopTimers(); resolveClose?.(); resolveClose = null; });
  dialog.addEventListener("click", e => {
    if (e.target.closest("#gcClose")) return close();
    if (!isDone()) finish?.(); // first tap skips to the end
    else if (!e.target.closest(".gc-card, .gc-strip")) close();
  });

  function show(fish) {
    if (!fish.length) return Promise.resolve();
    const sorted = [...fish].sort((a, b) => rank(b) - rank(a) || b.lvl - a.lvl);
    const cards = sorted.slice(0, CARDS), rest = sorted.slice(CARDS);
    // the bite mark that pops out of the bobber, by the best fish caught (like the game's tugs): !!! big fish, !! collectable, ! otherwise
    const tier = Math.max(...fish.map(tierOf));
    const strip = matchMedia("(max-width: 520px)").matches ? STRIP / 2 : STRIP; // small icons shown before "+N more"
    dialog.innerHTML = `
      <div class="gc-stage">
        <svg class="gc-line" aria-hidden="true"><defs><linearGradient id="gcLineFade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e8e2d0" stop-opacity="0"/><stop offset=".35" stop-color="#e8e2d0" stop-opacity=".6"/></linearGradient></defs><path stroke="url(#gcLineFade)"/></svg>
        <div class="gc-bob" aria-hidden="true"><span class="gc-fish">${FISH_SHADOW}</span>${rings("back")}<span class="gc-float"><span class="gc-stick"></span>${TACKLE}</span>${rings("front")}<span class="gc-bang t${tier}">${bangs(tier)}</span></div>
        <canvas class="gc-boom" aria-hidden="true"></canvas>
        <div class="gc-bubbles" aria-hidden="true">${bubbles()}</div>
        <h2 class="gc-title">You caught <b id="gcCount">0</b> new fish!</h2>
        <div class="gc-cards">${cards.map((f, i) => `
          <div class="gc-card ${KIND[tierOf(f)]}" style="--i:${i}" data-id="${f.id}">
            <div class="gc-inner">
              <div class="gc-back" aria-hidden="true"></div>
              <div class="gc-front">
                <span class="gc-mark t${tierOf(f)}" aria-hidden="true">${bangs(tierOf(f))}</span>
                <span class="gc-icon">${fishIcon(f)}</span>
                <span class="gc-name">${f.big ? `<i class="tm-big"></i>` : ""}${esc(f.name)}</span>
                <span class="gc-tag">${f.big ? "Big fish" : f.collectable ? "Collectable" : f.spear ? "Spearfish" : f.lvl > 1 ? `Lv ${f.lvl}` : "Ocean fishing"}</span>
              </div>
            </div>
          </div>`).join("")}
        </div>
        ${rest.length ? `<div class="gc-strip">${rest.slice(0, strip).map(f => `<span class="gc-mini" title="${esc(f.name)}">${fishIcon(f)}</span>`).join("")}
          ${rest.length > strip ? `<span class="gc-more">+${(rest.length - strip).toLocaleString("en-US")} more</span>` : ""}</div>` : ""}
        <div class="gc-actions"><button type="button" class="btn primary" id="gcClose">Close</button><span class="gc-hint">Tap to skip</span></div>
      </div>`;
    dialog.className = "gacha-dialog";
    const count = dialog.querySelector("#gcCount"), total = fish.length;
    const setCount = n => { count.textContent = n.toLocaleString("en-US"); };
    const countTo = ms => { // the counter ticks up to the total over `ms` (skipping to the end shows the total)
      const start = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - start) / ms);
        setCount(isDone() ? total : Math.round(total * t));
        if (t < 1 && !isDone()) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    finish = () => { // jump to the end state
      stopTimers();
      dialog.classList.add("reel", "dealt", "done");
      dialog.querySelectorAll(".gc-card").forEach(c => c.classList.add("flipped"));
      setCount(total);
      finish = null;
    };
    const closed = new Promise(r => { resolveClose = r; });
    dialog.showModal();
    dialog.scrollTop = 0; // showModal focuses Close (at the bottom); start at the top on short screens
    if (reduced()) { finish(); return closed; }
    swingLine(dialog);
    // sequence: the bobber is cast out and lands with a splash → floats → a fish's shadow swims up and strikes the hook
    // twice, pulling the bobber under (! / !! / !!! pops out) → yanked in as rays burst out of it and the screen floods
    // white → the white fades to the cards (dealt face down) under rising bubbles → once they've cleared, the cards flip
    // one by one → strip + count → done
    later(1250, () => dialog.classList.add("rise")); // a fish's shadow swims up from the deep…
    later(2250, () => dialog.classList.add("bite")); // …and strikes the hook
    later(3250, () => { // one swift yank, and the explosion bursts from the bobber at the same moment
      const r = dialog.querySelector(".gc-float").getBoundingClientRect();
      dialog.classList.add("reel", "boom");
      burst(dialog, r.left + r.width / 2, r.top + r.height / 2);
    });
    const BUBBLES_AT = 4250, LAST_BUBBLE = BUBBLES_AT + (BUBBLE_DELAY + BUBBLE_RISE[1]) * 1000;
    later(BUBBLES_AT, () => dialog.classList.add("bubbles")); // as the white fades: big bubbles float up over the cards
    later(4050, () => { dialog.classList.add("dealt"); countTo(2000 + cards.length * FLIP_GAP); }); // under the white
    const flips = () => { // the cards turn over one by one…
      cards.forEach((_, i) => later(i * FLIP_GAP, () => dialog.querySelectorAll(".gc-card")[i]?.classList.add("flipped")));
      later(cards.length * FLIP_GAP + 700, () => finish?.());
    };
    const waitForBubbles = () => { // …once no bubble is left over them (or the last one has finished)
      const box = dialog.querySelector(".gc-cards").getBoundingClientRect();
      const over = [...dialog.querySelectorAll(".gc-bubbles i")].some(b => {
        const r = b.getBoundingClientRect();
        return r.bottom > box.top && r.top < box.bottom && r.right > box.left && r.left < box.right && +getComputedStyle(b).opacity > .05;
      });
      if (over && performance.now() < bubblesDone) later(100, waitForBubbles); else flips();
    };
    const bubblesDone = performance.now() + LAST_BUBBLE;
    later(BUBBLES_AT + 900, waitForBubbles);
    return closed;
  }
  return { show, close };
}
