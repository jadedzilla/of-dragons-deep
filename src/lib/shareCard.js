// The Share card: a 1200×675 PNG of your progress, drawn on a canvas in the app's look (a torn sheet of the page's paper
// in the current mode's colours, on a fully transparent background). Achievement icons come from XIVAPI (CORS *).
import { achievementState, getAchievements } from "./achievements.js";
import { loadMarks, loadProgress, noteObtained } from "./storage.js";

const CARD = { w: 1200, h: 675, rows: 3 };
const SITE = "ofdragonsdeep.jadedzilla.com";
const SERIF = "Neuton, Georgia, serif", NUM = 'Montserrat, "Noto Sans", sans-serif', SANS = '"Rethink Sans", "Noto Sans", system-ui, sans-serif';

/** Colours from the page's CSS variables (fallbacks: light mode). */
function palette() {
  const css = getComputedStyle(document.documentElement), v = (name, d) => css.getPropertyValue(name).trim() || d;
  const dark = document.documentElement.dataset.theme === "dark";
  return {
    paper: v("--card", "#e0ded7"), edge: dark ? "#3a3833" : "#f3f1ea",
    text: v("--text", "#2b2b2b"), strong: v("--accent-hi", "#171717"), muted: v("--muted", "#637185"), line: v("--line", "rgba(0,0,0,.09)"),
    fill: v("--accent", "#333333"), track: dark ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.1)", green: v("--caught", "#2f8f3a"),
    well: dark ? "rgba(0,0,0,.3)" : "rgba(0,0,0,.08)",
  };
}

/** The page's paper texture (the image behind body::before), or null. */
function paperTexture() {
  const m = /url\("?([^")]+)"?\)/.exec(getComputedStyle(document.body, "::before").backgroundImage || "");
  if (!m) return Promise.resolve(null);
  return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = m[1]; });
}

/** A torn edge: points along each side with a ragged jitter, seeded so the card tears the same way every time. */
function tornPath(g, x, y, w, h, amp, seed) {
  let t = seed;
  const rnd = () => (t = (t * 16807) % 2147483647) / 2147483647;
  const side = (x0, y0, x1, y1, nx, ny) => {
    const steps = Math.round(Math.hypot(x1 - x0, y1 - y0) / 11);
    let drift = 0;
    for (let i = 0; i <= steps; i++) {
      drift = drift * .8 + (rnd() - .5) * amp * .7;                              // slow wander
      const d = drift + (rnd() - .5) * amp * .18 + (rnd() < .03 ? amp * .35 : 0); // fine fibre, the odd nick
      const f = i / steps;
      g.lineTo(x0 + (x1 - x0) * f + nx * d, y0 + (y1 - y0) * f + ny * d);
    }
  };
  g.beginPath(); g.moveTo(x, y);
  side(x, y, x + w, y, 0, 1); side(x + w, y, x + w, y + h, -1, 0); side(x + w, y + h, x, y + h, 0, -1); side(x, y + h, x, y, 1, 0);
  g.closePath();
}

/** The card's numbers: { fish, spear, big, ocean, expansions, ach } (ach null if achievements can't load). */
export async function shareStats({ fishList, spearList, allFish, fishById, isCaught, categories, oceanCategory }) {
  const count = list => ({ have: list.filter(f => isCaught(f.id)).length, total: list.length });
  const land = fishList.filter(f => f.cat !== oceanCategory);
  const stats = {
    fish: count(fishList), spear: count(spearList), big: count(fishList.filter(f => f.big && f.cat !== oceanCategory)),
    ocean: count(fishList.filter(f => f.cat === oceanCategory)),
    expansions: categories.map((name, i) => ({ name, ...count(land.filter(f => f.cat === i)) })).filter(e => e.total),
    ach: null,
  };
  try {
    const data = await getAchievements(), progress = loadProgress();
    const s = achievementState(data, { allFish, fishById, isCaught, marks: loadMarks(), progress });
    const done = data.achievements.filter(a => s.isDone(a));
    const seen = noteObtained(done.map(a => a.id));
    const label = a => {
      const r = s.reqs.get(a.id), p = progress.items[a.id], n = x => x.toLocaleString("en-US");
      if (r.kind === "count") return `${n(Math.min(r.need, s.caughtOf(r)))} / ${n(r.need)}`;
      if (r.kind === "set") return `${s.caughtOf(r)} / ${r.fish.length}`;
      if (r.kind === "meta") return `${s.partsDone(r)} / ${r.ids.length}`;
      return p ? `${n(p[0])} / ${n(p[1])}` : "";
    };
    const almost = data.achievements.filter(a => !done.includes(a)).map(a => ({ a, f: s.fraction(a) })).filter(x => x.f > 0)
      .sort((x, y) => y.f - x.f || y.a.points - x.a.points).map(({ a, f }) => ({ name: a.name, icon: a.icon, points: a.points, fraction: f, label: label(a) }));
    const recent = [...done].sort((x, y) => (seen[y.id] ?? 0) - (seen[x.id] ?? 0) || y.points - x.points || y.order - x.order)
      .map(a => ({ name: a.name, icon: a.icon, points: a.points }));
    stats.ach = { have: done.length, total: data.achievements.length, points: done.reduce((n, a) => n + a.points, 0),
      totalPoints: data.achievements.reduce((n, a) => n + a.points, 0), recent, almost };
  } catch { /* offline: the card shows fish only */ }
  return stats;
}

const n = x => x.toLocaleString("en-US");
const pct = (h, t) => { const v = t ? (h / t) * 100 : 0; return v > 0 && v < 10 ? Math.floor(v * 10) / 10 : Math.floor(v); }; // 0.9%, 12%
function loadImage(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    const done = ok => { clearTimeout(timer); resolve(ok ? img : null); };
    const timer = setTimeout(() => done(false), 4000);
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = src;
  });
}

/** Draws the card for these stats; resolves to the canvas. */
export async function drawShareCard(stats, { name = "", date = new Date() } = {}) {
  const { w: W, h: H, rows: ROWS } = CARD;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d"), C = palette();
  try {
    await Promise.all([`400 40px Neuton`, `italic 400 20px Neuton`, `500 20px Montserrat`, `400 20px "Rethink Sans"`, `600 20px "Rethink Sans"`]
      .map(f => document.fonts.load(f)));
  } catch { /* system fonts */ }
  const texture = await paperTexture();

  const font = (size, weight = 400, family = SANS) => { g.font = `${weight} ${size}px ${family}`; };
  const text = (s, x, y, { size = 20, weight = 400, family = SANS, color = C.text, align = "left", max } = {}) => {
    font(size, weight, family); g.fillStyle = color; g.textAlign = align; g.textBaseline = "alphabetic";
    let t = String(s);
    if (max) while (t.length > 1 && g.measureText(t).width > max) t = t.slice(0, -2) + "…";
    g.fillText(t, x, y);
  };
  const rrect = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  const bar = (x, y, w, h, f, done) => {
    rrect(x, y, w, h, h / 2); g.fillStyle = C.track; g.fill();
    if (f > 0) { rrect(x, y, Math.max(h, w * Math.min(1, f)), h, h / 2); g.fillStyle = done ? C.green : C.fill; g.fill(); }
  };
  const heading = (s, x, y) => text(s, x, y, { size: 30, family: SERIF, color: C.strong });

  // the torn sheet (a pale fringe under it), with the page's paper photo laid over it as on the page
  const M = 26;
  tornPath(g, M - 3, M - 3, W - 2 * M + 6, H - 2 * M + 6, 7, 1234567); g.fillStyle = C.edge; g.fill();
  tornPath(g, M, M, W - 2 * M, H - 2 * M, 6, 7654321); g.fillStyle = C.paper; g.fill();
  if (texture) {
    g.save(); g.clip(); g.globalCompositeOperation = "soft-light";
    const s = Math.max(W / texture.width, H / texture.height);
    g.drawImage(texture, (W - texture.width * s) / 2, (H - texture.height * s) / 2, texture.width * s, texture.height * s);
    g.restore();
  }

  // header
  const P = M + 36;
  text("Of Dragons Deep", P, P + 38, { size: 50, family: SERIF, color: C.strong });
  const sub = [name.trim(), date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })].filter(Boolean).join(" · ");
  text(sub, W - P, P + 30, { size: 20, color: C.muted, align: "right", max: W / 2 - P });
  g.fillStyle = C.line; g.fillRect(P, P + 58, W - 2 * P, 1);

  // two columns: fish, achievements
  const top = P + 92, colGap = 48, colW = (W - 2 * P - colGap) / 2;

  { // fish
    const x = P, w = colW; let y = top;
    heading("Fish caught", x, y);
    y += 62;
    text(n(stats.fish.have), x, y, { size: 54, weight: 500, family: NUM, color: C.strong });
    font(54, 500, NUM); const bigW = g.measureText(n(stats.fish.have)).width;
    text(`/ ${n(stats.fish.total)} Fish Guide`, x + bigW + 12, y, { size: 22, color: C.muted });
    text(`${pct(stats.fish.have, stats.fish.total)}%`, x + w, y, { size: 28, weight: 500, family: NUM, color: C.strong, align: "right" });
    y += 18; bar(x, y, w, 14, stats.fish.have / stats.fish.total, stats.fish.have === stats.fish.total);
    y += 40;
    for (const [label, s] of [["Spearfishing", stats.spear], ["Big fish", stats.big], ["Ocean fishing", stats.ocean]]) {
      text(label, x, y, { size: 19 });
      text(`${n(s.have)} / ${n(s.total)}`, x + w, y, { size: 19, color: C.muted, align: "right" });
      bar(x, y + 9, w, 8, s.total ? s.have / s.total : 0, s.total && s.have === s.total);
      y += 44;
    }
    y += 6;
    const cw = (w - 24) / 2;
    stats.expansions.forEach((e, i) => {
      const cx = x + (i % 2) * (cw + 24), cy = y + Math.floor(i / 2) * 40;
      text(e.name, cx, cy, { size: 15, color: C.muted, max: cw - 70 });
      text(`${pct(e.have, e.total)}%`, cx + cw, cy, { size: 15, color: C.text, align: "right" });
      bar(cx, cy + 7, cw, 6, e.have / e.total, e.have === e.total);
    });
  }

  { // achievements
    const x = P + colW + colGap, w = colW; let y = top;
    heading("Achievements", x, y);
    const a = stats.ach;
    if (!a) {
      text("Couldn't load achievements right now.", x, y + 50, { size: 19, color: C.muted });
    } else {
      y += 50;
      text(`${n(a.have)} / ${n(a.total)}`, x, y, { size: 32, weight: 500, family: NUM, color: C.strong });
      text(`${n(a.points)} / ${n(a.totalPoints)} points`, x + w, y, { size: 19, color: C.muted, align: "right" });
      y += 14; bar(x, y, w, 10, a.have / a.total, a.have === a.total);
      const icons = await Promise.all([...a.recent.slice(0, ROWS), ...a.almost.slice(0, ROWS)].map(r => loadImage(r.icon)));
      const row = (r, i, yy, extra) => {
        const icon = icons[i], s = 40;
        rrect(x, yy - 30, s, s, 3); g.fillStyle = C.well; g.fill();
        if (icon) { g.save(); rrect(x, yy - 30, s, s, 3); g.clip(); g.drawImage(icon, x, yy - 30, s, s); g.restore(); }
        text(r.name, x + s + 14, yy - 6, { size: 18, weight: 500, family: NUM, color: C.strong, max: w - s - 14 - 40 });
        text(`${r.points} pts`, x + w, yy - 6, { size: 14, color: C.muted, align: "right" });
        extra?.(x + s + 14, yy + 4, w - s - 14);
      };
      y += 44;
      text("Recently obtained", x, y, { size: 19, family: SERIF, color: C.muted });
      y += 40;
      if (!a.recent.length) { text("None yet. Tick or import some on the Achievements page.", x, y - 10, { size: 16, color: C.muted }); y += 46; }
      a.recent.slice(0, ROWS).forEach((r, i) => { row(r, i, y); y += 46; });
      text("Almost there", x, y, { size: 19, family: SERIF, color: C.muted });
      y += 40;
      const off = Math.min(a.recent.length, ROWS);
      if (!a.almost.length) text("Nothing in progress yet.", x, y - 10, { size: 16, color: C.muted });
      a.almost.slice(0, ROWS).forEach((r, i) => {
        row(r, off + i, y, (bx, by, bw) => { bar(bx, by, bw - 130, 6, r.fraction, false); text(r.label, bx + bw, by + 7, { size: 14, color: C.muted, align: "right" }); });
        y += 46;
      });
    }
  }

  text(`${SITE}  ·  created with 🐟 by jadedzilla`, W / 2, H - M - 22, { size: 16, color: C.muted, align: "center" });
  return c;
}

/** The card's alt text. */
export const shareAlt = s => `Of Dragons Deep: ${n(s.fish.have)} / ${n(s.fish.total)} Fish Guide fish, ${n(s.spear.have)} / ${n(s.spear.total)} spearfish, `
  + `${n(s.big.have)} / ${n(s.big.total)} big fish` + (s.ach ? `, ${n(s.ach.have)} / ${n(s.ach.total)} achievements (${n(s.ach.points)} points)` : "");
