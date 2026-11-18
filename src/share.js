// Share page: draws a card (PNG) of your progress in the app's look: caught fish totals (Fish Guide, spearfishing,
// big fish, ocean fishing, per expansion) and achievements (obtained / points, recently obtained, closest to done),
// to download, share (phone share sheet) or copy. Drawn on a <canvas>; achievement icons come from XIVAPI (CORS *).

import { skeleton } from "./skeleton.js";
import { achievementDone, achievementRequirement, getAchievements } from "./achievements.js";
import { loadMarks, loadAchievementProgress, noteObtained } from "./storage.js";

export const CARD = { w: 1200, h: 675, rows: 3 }; // 16:9, fits Discord, X and phones
const SITE = "ofdragonsdeep.jadedzilla.com";
// The card follows the app's light or dark mode: its colours are read from the page's CSS variables when it's drawn
// (fallbacks: light mode). A sheet of paper with torn edges on a transparent background, in the app's three fonts.
const SERIF = 'Neuton, Georgia, serif', NUM = 'Montserrat, "Noto Sans", sans-serif', SANS = '"Rethink Sans", "Noto Sans", system-ui, sans-serif';
function palette() {
  const css = getComputedStyle(document.documentElement), v = (name, d) => css.getPropertyValue(name).trim() || d;
  const dark = document.documentElement.dataset.theme === "dark";
  return {
    dark, paper: v("--card", "#e0ded7"), edge: dark ? "#3a3833" : "#f3f1ea",
    text: v("--text", "#2b2b2b"), strong: v("--accent-hi", "#171717"), muted: v("--muted", "#637185"), line: v("--line", "rgba(0,0,0,.09)"),
    fill: v("--accent", "#333333"), track: dark ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.1)", green: v("--caught", "#2f8f3a"),
    well: dark ? "rgba(0,0,0,.3)" : "rgba(0,0,0,.08)",
  };
}
let C = palette();

/** The page's paper texture (the image behind body::before: public/bg.jpg, or a data: URI in the single file), as an
 *  image; null if there's none. */
function paperTexture() {
  const m = /url\("?([^")]+)"?\)/.exec(getComputedStyle(document.body, "::before").backgroundImage || "");
  if (!m) return Promise.resolve(null);
  return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = m[1]; });
}

/** A torn edge: points along a side with a small, ragged jitter (seeded, so the same card tears the same way). */
function tornPath(g, x, y, w, h, amp, seed) {
  let t = seed;
  const rnd = () => (t = (t * 16807) % 2147483647) / 2147483647;
  const side = (x0, y0, x1, y1, nx, ny) => {
    const len = Math.hypot(x1 - x0, y1 - y0), steps = Math.round(len / 11);
    let drift = 0;
    for (let i = 0; i <= steps; i++) {
      drift = drift * .8 + (rnd() - .5) * amp * .7;              // slow wander of the tear
      const d = drift + (rnd() - .5) * amp * .18 + (rnd() < .03 ? amp * .35 : 0); // a little fine fibre, now and then a shallow nick
      const f = i / steps;
      g.lineTo(x0 + (x1 - x0) * f + nx * d, y0 + (y1 - y0) * f + ny * d);
    }
  };
  g.beginPath(); g.moveTo(x, y);
  side(x, y, x + w, y, 0, 1); side(x + w, y, x + w, y + h, -1, 0); side(x + w, y + h, x, y + h, 0, -1); side(x, y + h, x, y, 1, 0);
  g.closePath();
}
const NAME_KEY = "odd-share-name";

/** The numbers on the card: { fish, spear, big, ocean, expansions: [{ name, have, total }], ach } (ach null if unavailable). */
export async function shareStats({ fishList, spearList, allFish, byId, isCaught, categories, oceanCategory }) {
  const count = list => ({ have: list.filter(f => isCaught(f.id)).length, total: list.length });
  const land = fishList.filter(f => f.cat !== oceanCategory);
  const stats = {
    fish: count(fishList), spear: count(spearList), big: count(fishList.filter(f => f.big && f.cat !== oceanCategory)),
    ocean: count(fishList.filter(f => f.cat === oceanCategory)),
    expansions: categories.map((name, i) => ({ name, ...count(land.filter(f => f.cat === i)) })).filter(e => e.total),
    ach: null,
  };
  try {
    const data = await getAchievements(), marks = loadMarks(), progress = loadAchievementProgress();
    const reqs = new Map(data.achievements.map(a => [a.id, achievementRequirement(a, data, allFish, byId)]));
    const ctx = { reqs, byAch: new Map(data.achievements.map(a => [a.id, a])), isCaught, marks };
    const done = data.achievements.filter(a => achievementDone(a, ctx));
    const seen = noteObtained(done.map(a => a.id));
    // how far along an unobtained achievement is (0–1), from caught fish, its parts, or the game's progress
    const fraction = a => {
      const r = reqs.get(a.id);
      if (r.kind === "count") return Math.min(1, r.fish.filter(f => isCaught(f.id)).length / r.need);
      if (r.kind === "set") return r.fish.filter(f => isCaught(f.id)).length / r.fish.length;
      if (r.kind === "meta") return r.ids.filter(id => ctx.byAch.has(id) ? achievementDone(ctx.byAch.get(id), ctx) : marks.has(id)).length / r.ids.length;
      const p = progress.items[a.id];
      return p && p[1] ? Math.min(1, p[0] / p[1]) : 0;
    };
    const label = a => {
      const r = reqs.get(a.id), p = progress.items[a.id];
      if (r.kind === "count") return `${Math.min(r.need, r.fish.filter(f => isCaught(f.id)).length).toLocaleString("en-US")} / ${r.need.toLocaleString("en-US")}`;
      if (r.kind === "set") return `${r.fish.filter(f => isCaught(f.id)).length} / ${r.fish.length}`;
      if (r.kind === "meta") return `${Math.round(fraction(a) * r.ids.length)} / ${r.ids.length}`;
      return p ? `${p[0].toLocaleString("en-US")} / ${p[1].toLocaleString("en-US")}` : "";
    };
    const almost = data.achievements.filter(a => !done.includes(a)).map(a => ({ a, f: fraction(a) })).filter(x => x.f > 0)
      .sort((x, y) => y.f - x.f || y.a.points - x.a.points).map(({ a, f }) => ({ name: a.name, icon: a.icon, points: a.points, fraction: f, label: label(a) }));
    const recent = [...done].sort((x, y) => (seen[y.id] ?? 0) - (seen[x.id] ?? 0) || y.points - x.points || y.order - x.order)
      .map(a => ({ name: a.name, icon: a.icon, points: a.points }));
    stats.ach = { have: done.length, total: data.achievements.length, points: done.reduce((n, a) => n + a.points, 0),
      totalPoints: data.achievements.reduce((n, a) => n + a.points, 0), recent, almost };
  } catch { /* achievements unavailable (offline): the card shows fish only */ }
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

/** Draw the card for these stats; resolves to the canvas. */
export async function drawShareCard(stats, { name = "", date = new Date() } = {}) {
  const L = CARD, { w: W, h: H } = L;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  C = palette();
  try { await Promise.all([document.fonts.load(`400 40px Neuton`), document.fonts.load(`italic 400 20px Neuton`), document.fonts.load(`500 20px Montserrat`),
    document.fonts.load(`400 20px "Rethink Sans"`), document.fonts.load(`600 20px "Rethink Sans"`)]); } catch { /* system fonts */ }
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
    if (f > 0) {
      rrect(x, y, Math.max(h, w * Math.min(1, f)), h, h / 2);
      g.fillStyle = done ? C.green : C.fill; g.fill();
    }
  };
  const heading = (s, x, y) => {
    text(s, x, y, { size: 30, family: SERIF, color: C.strong });
  };

  // a sheet of paper with torn edges (a pale torn fringe peeking out under the sheet) on a fully transparent
  // background (no shadow), so the card sits cleanly on whatever it's posted on
  const grain = alpha => { // the page's paper photo, unaltered, laid over the sheet with soft-light as on the page
    if (!texture) return;
    g.save(); g.globalCompositeOperation = "soft-light"; g.globalAlpha = alpha;
    const s = Math.max(W / texture.width, H / texture.height);
    g.drawImage(texture, (W - texture.width * s) / 2, (H - texture.height * s) / 2, texture.width * s, texture.height * s);
    g.restore();
  };
  const M = 26;
  tornPath(g, M - 3, M - 3, W - 2 * M + 6, H - 2 * M + 6, 7, 1234567); g.fillStyle = C.edge; g.fill();
  tornPath(g, M, M, W - 2 * M, H - 2 * M, 6, 7654321); g.fillStyle = C.paper; g.fill();
  g.save(); g.clip(); grain(1); g.restore();

  // header
  const P = M + 36;
  text("Of Dragons Deep", P, P + 38, { size: 50, family: SERIF, color: C.strong });
  const sub = [name.trim(), date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })].filter(Boolean).join(" · ");
  text(sub, W - P, P + 30, { size: 20, color: C.muted, align: "right", max: W / 2 - P });
  g.fillStyle = C.line; g.fillRect(P, P + 58, W - 2 * P, 1);

  // two columns: fish on the left, achievements on the right
  const top = P + 92, colGap = 48;
  const fishBox = { x: P, y: top, w: (W - 2 * P - colGap) / 2 };
  const achBox = { x: P + fishBox.w + colGap, y: top, w: fishBox.w };

  // fish
  {
    const { x, w } = fishBox; let y = fishBox.y;
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
    const cols = 2, cw = (w - 24) / cols;
    stats.expansions.forEach((e, i) => {
      const cx = x + (i % cols) * (cw + 24), cy = y + Math.floor(i / cols) * 40;
      text(e.name, cx, cy, { size: 15, color: C.muted, max: cw - 70 });
      text(`${pct(e.have, e.total)}%`, cx + cw, cy, { size: 15, color: C.text, align: "right" });
      bar(cx, cy + 7, cw, 6, e.have / e.total, e.have === e.total);
    });
  }

  // achievements
  {
    const { x, w } = achBox; let y = achBox.y;
    heading("Achievements", x, y);
    const a = stats.ach;
    if (!a) {
      text("Couldn't load achievements right now.", x, y + 50, { size: 19, color: C.muted });
    } else {
      y += 50;
      text(`${n(a.have)} / ${n(a.total)}`, x, y, { size: 32, weight: 500, family: NUM, color: C.strong });
      text(`${n(a.points)} / ${n(a.totalPoints)} points`, x + w, y, { size: 19, color: C.muted, align: "right" });
      y += 14; bar(x, y, w, 10, a.have / a.total, a.have === a.total);
      const icons = await Promise.all([...a.recent.slice(0, L.rows), ...a.almost.slice(0, L.rows)].map(r => loadImage(r.icon)));
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
      a.recent.slice(0, L.rows).forEach((r, i) => { row(r, i, y); y += 46; });
      text("Almost there", x, y, { size: 19, family: SERIF, color: C.muted });
      y += 40;
      const off = Math.min(a.recent.length, L.rows);
      if (!a.almost.length) text("Nothing in progress yet.", x, y - 10, { size: 16, color: C.muted });
      a.almost.slice(0, L.rows).forEach((r, i) => {
        row(r, off + i, y, (bx, by, bw) => { bar(bx, by, bw - 130, 6, r.fraction, false); text(r.label, bx + bw, by + 7, { size: 14, color: C.muted, align: "right" }); });
        y += 46;
      });
    }
  }

  // footer
  text(`${SITE}  ·  created with 🐟 by jadedzilla`, W / 2, H - M - 22, { size: 16, color: C.muted, align: "center" });
  return c;
}

/** One-line description of the card (the image's alt text). */
export const shareAlt = s => `Of Dragons Deep: ${n(s.fish.have)} / ${n(s.fish.total)} Fish Guide fish, ${n(s.spear.have)} / ${n(s.spear.total)} spearfish, `
  + `${n(s.big.have)} / ${n(s.big.total)} big fish` + (s.ach ? `, ${n(s.ach.have)} / ${n(s.ach.total)} achievements (${n(s.ach.points)} points)` : "");

/**
 * The Share page, rendered into `root`. deps: the inputs of shareStats(). Returns { show(), hide() }.
 */
export function createShare(root, deps) {
  root.innerHTML = `
    <div class="sh-head">
      <p class="ns-intro">A card of your progress to post anywhere, made from the fish you've marked caught and your achievements.</p>
      <div class="sh-controls">
        <input class="sh-name" id="shName" type="text" maxlength="40" placeholder="Character name (optional)" autocomplete="off" aria-label="Name on the card">
      </div>
    </div>
    <div class="sh-preview" id="shPreview">${skeleton("share", "Drawing your card…")}</div>
    <div class="sh-actions">
      <button type="button" class="btn primary" id="shDownload" disabled>Download PNG</button>
      <button type="button" class="btn" id="shShare" hidden disabled>Share…</button>
      <button type="button" class="btn" id="shCopy" hidden disabled>Copy image</button>
      <span class="sh-status" id="shStatus" role="status"></span>
    </div>`;
  const $s = sel => root.querySelector(sel), status = $s("#shStatus");
  const get = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };
  $s("#shName").value = get(NAME_KEY, "");

  let blob = null, url = null, token = 0, typingTimer = null;
  const fileName = () => `of-dragons-deep-${new Date().toISOString().slice(0, 10)}.png`;
  async function draw() {
    const my = ++token;
    for (const b of ["#shDownload", "#shShare", "#shCopy"]) $s(b).disabled = true;
    const stats = await shareStats(deps);
    const canvas = await drawShareCard(stats, { name: $s("#shName").value });
    const b = await new Promise(r => canvas.toBlob(r, "image/png"));
    if (my !== token) return;
    blob = b;
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(b);
    $s("#shPreview").innerHTML = `<img id="shImg" alt="" width="${canvas.width}" height="${canvas.height}">`;
    const img = $s("#shImg");
    img.alt = shareAlt(stats);
    img.src = url;
    const file = new File([b], fileName(), { type: "image/png" });
    $s("#shShare").hidden = !(navigator.canShare?.({ files: [file] }));
    $s("#shCopy").hidden = !(window.ClipboardItem && navigator.clipboard?.write);
    for (const id of ["#shDownload", "#shShare", "#shCopy"]) $s(id).disabled = false;
  }

  $s("#shName").addEventListener("input", () => {
    set(NAME_KEY, $s("#shName").value);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(draw, 300);
  });
  $s("#shDownload").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = url; a.download = fileName();
    document.body.appendChild(a); a.click(); a.remove();
    status.textContent = "Saved.";
  });
  $s("#shShare").addEventListener("click", async () => {
    try { await navigator.share({ files: [new File([blob], fileName(), { type: "image/png" })], title: "Of Dragons Deep" }); status.textContent = ""; }
    catch (e) { if (e.name !== "AbortError") status.textContent = "Couldn't open the share sheet."; }
  });
  $s("#shCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); status.textContent = "Copied. Paste it anywhere."; }
    catch { status.textContent = "Couldn't copy the image here; use Download instead."; }
  });

  return { show() { status.textContent = ""; draw(); }, hide() {} };
}
