// The reveal's two hand-drawn animations, run on the dialog element; both stop once it is done or closed.

// The white flash (ms after the burst): start, length, and the share spent growing to cover the screen. It starts
// dissolving the moment it covers it, while the bubbles rise underneath.
export const FLASH_AT = 150, FLASH = 2000, FLASH_HOLD = .32, FLASH_FADES = FLASH_AT + FLASH * FLASH_HOLD;
/** Light rays spinning out from the bobber at (cx, cy) and the white bloom, on one screen-sized canvas (.gc-boom):
 *  big scaled CSS/SVG layers glitched on phones. */
export function burst(dialog, cx, cy) {
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
  const RAYS = 1100, start = performance.now();
  const easeOut = p => 1 - (1 - p) ** 3, easeIn = p => p ** 1.8, smooth = p => p ** 3 * (p * (6 * p - 15) + 10); // smootherstep: eases in and out gently
  const frame = now => {
    if (!dialog.open || dialog.classList.contains("done")) return;
    const t = now - start;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const p = Math.min(1, t / RAYS), e = easeOut(p);
    for (const L of layers) {
      if (t >= FLASH_FADES) break; // the rays end while the screen is white, so only the bubbles come out of it
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
    const q = (t - FLASH_AT) / FLASH; // the white bloom: grows (ease-in) to full, then dissolves evenly (smootherstep) over
    if (q > 0) {                       // the bubbles rising underneath it, so the flash turns into the bubbles
      const R = 2 * vmax * (q < FLASH_HOLD ? easeIn(q / FLASH_HOLD) : 1), o = q < FLASH_HOLD ? 1 : 1 - smooth(Math.min(1, (q - FLASH_HOLD) / (1 - FLASH_HOLD)));
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

/** Soft glowing motes drifting up behind the cards (on the dialog's .gc-motes canvas): paper white with a little of the
 *  tiers' gold and blue, swaying and twinkling, thickest around the middle of the screen. Still with reduced motion. */
export function motes(dialog, still = false) {
  const canvas = dialog.querySelector(".gc-motes");
  if (!canvas || canvas.dataset.on) return;
  canvas.dataset.on = "1";
  const ctx = canvas.getContext("2d"), dpr = Math.min(devicePixelRatio || 1, 2);
  let w = 0, h = 0;
  const size = () => { w = innerWidth; h = innerHeight; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); };
  size();
  const COLORS = ["244,242,236", "244,242,236", "244,242,236", "226,194,122", "143,184,234"];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const middle = () => .5 + (Math.random() + Math.random() + Math.random() - 1.5) / 3; // 0–1, mostly near .5
  const make = y => ({ x: middle(), y: y ?? Math.random(), r: rnd(.8, 2.6), vy: rnd(.006, .02), sway: rnd(6, 22), phase: rnd(0, 6.3),
    tw: rnd(.6, 1.6), a: rnd(.25, .8), c: COLORS[Math.floor(Math.random() * COLORS.length)] });
  const dots = Array.from({ length: Math.round(Math.min(110, w * h / 9000)) }, () => make());
  const draw = t => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const d of dots) {
      const x = d.x * w + Math.sin(t * .0004 + d.phase) * d.sway, y = d.y * h;
      const a = d.a * (.55 + .45 * Math.sin(t * .001 * d.tw + d.phase)); // twinkle
      const g = ctx.createRadialGradient(x, y, 0, x, y, d.r * 4);
      g.addColorStop(0, `rgba(${d.c},${a})`); g.addColorStop(.25, `rgba(${d.c},${a * .6})`); g.addColorStop(1, `rgba(${d.c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - d.r * 4, y - d.r * 4, d.r * 8, d.r * 8);
    }
  };
  if (still) return draw(0);
  let last = performance.now();
  const frame = now => {
    if (!dialog.open) { delete canvas.dataset.on; return; }
    if (innerWidth !== w || innerHeight !== h) size();
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    for (const d of dots) { d.y -= d.vy * dt * 3; if (d.y < -.03) Object.assign(d, make(1.03)); }
    draw(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** The fishing line as a rope (Verlet points with gravity and fixed-length links) from the rod tip, above the top of
 *  the screen, to the bobber's stick, drawn each frame into the dialog's .gc-line SVG until the reveal is done. It
 *  hangs slack (sags and swings) while the bobber flies and floats, and is pulled taut for the bite and reel-in. */
export function swingLine(dialog) {
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
