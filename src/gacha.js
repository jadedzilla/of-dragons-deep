// Gacha-style reveal of newly caught fish after an import: a fishing bobber is cast out, gets a bite and is reeled
// in, rays burst out of it and white floods the screen, then fades to the cards; then the new fish flip in as
// cards (big fish first, gold; collectables blue; others silver). Up to CARDS fish get a card; the rest show as a
// strip of small icons with a "+N more" count. Tap anywhere to jump to the end; Close / Esc / tap to
// close. With prefers-reduced-motion the final screen shows straight away.

const CARDS = 10, STRIP = 60, FLIP_GAP = 300; // ms between cards

/** The explosion, drawn on one screen-sized canvas (.gc-boom) — big CSS/SVG layers scaled past the screen glitch on
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

/** Rank for the reveal: big fish, then collectables, then by level (higher first). */
const rank = f => (f.big ? 2 : 0) + (f.collectable ? 1 : 0);

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
  function close() {
    timers.forEach(clearTimeout); timers = [];
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener("close", () => { timers.forEach(clearTimeout); timers = []; resolveClose?.(); resolveClose = null; });
  dialog.addEventListener("click", e => {
    if (e.target.closest("#gcClose")) return close();
    if (!dialog.classList.contains("done")) finish?.(); // first tap skips to the end
    else if (!e.target.closest(".gc-card, .gc-strip")) close();
  });

  function show(fish) {
    if (!fish.length) return Promise.resolve();
    const sorted = [...fish].sort((a, b) => rank(b) - rank(a) || b.lvl - a.lvl);
    const cards = sorted.slice(0, CARDS), rest = sorted.slice(CARDS);
    const kind = f => f.big ? "big" : f.collectable ? "coll" : "std";
    const strip = matchMedia("(max-width: 520px)").matches ? STRIP / 2 : STRIP; // small icons shown before "+N more"
    dialog.innerHTML = `
      <div class="gc-stage">
        <svg class="gc-line" aria-hidden="true"><defs><linearGradient id="gcLineFade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e8e2d0" stop-opacity="0"/><stop offset=".35" stop-color="#e8e2d0" stop-opacity=".6"/></linearGradient></defs><path stroke="url(#gcLineFade)"/></svg>
        <div class="gc-bob" aria-hidden="true"><i class="gc-ripple"></i><i class="gc-ripple"></i><i class="gc-ripple"></i><span class="gc-float"><span class="gc-stick"></span></span></div>
        <canvas class="gc-boom" aria-hidden="true"></canvas>
        <h2 class="gc-title">You caught <b id="gcCount">0</b> new fish!</h2>
        <div class="gc-cards">${cards.map((f, i) => `
          <div class="gc-card ${kind(f)}" style="--i:${i}" data-id="${f.id}">
            <div class="gc-inner">
              <div class="gc-back" aria-hidden="true"></div>
              <div class="gc-front">
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
    const countTo = (ms) => { // counter ticks up to the total over `ms`
      const start = performance.now();
      const step = () => { const t = Math.min(1, (performance.now() - start) / ms); count.textContent = Math.round(total * t).toLocaleString("en-US");
        if (t < 1 && !dialog.classList.contains("done")) requestAnimationFrame(step); else if (dialog.classList.contains("done")) count.textContent = total.toLocaleString("en-US"); };
      requestAnimationFrame(step);
    };
    finish = () => { // jump to the end state
      timers.forEach(clearTimeout); timers = [];
      dialog.classList.add("reel", "dealt", "done");
      dialog.querySelectorAll(".gc-card").forEach(c => c.classList.add("flipped"));
      count.textContent = total.toLocaleString("en-US");
      finish = null;
    };
    const closed = new Promise(r => { resolveClose = r; });
    dialog.showModal();
    dialog.scrollTop = 0; // showModal focuses Close (at the bottom); start at the top on short screens
    if (reduced()) { finish(); return closed; }
    swingLine(dialog);
    // sequence: the bobber is cast out and lands with a splash → floats → a bite (dips twice) → yanked in as rays burst
    // out of it and the screen floods white → the white fades to the cards (dealt face down) → they flip one by one →
    // strip + count → done
    later(1900, () => dialog.classList.add("bite"));
    later(2900, () => { // one swift yank, and the explosion bursts from the bobber at the same moment
      const r = dialog.querySelector(".gc-float").getBoundingClientRect();
      dialog.classList.add("reel", "boom");
      burst(dialog, r.left + r.width / 2, r.top + r.height / 2);
    });
    later(3700, () => { dialog.classList.add("dealt"); countTo(cards.length * FLIP_GAP + 1200); }); // under the white
    cards.forEach((_, i) => later(4500 + i * FLIP_GAP, () => dialog.querySelectorAll(".gc-card")[i]?.classList.add("flipped")));
    later(4500 + cards.length * FLIP_GAP + 700, () => finish?.());
    return closed;
  }
  return { show, close };
}
