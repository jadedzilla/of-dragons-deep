// Loading placeholders: shimmering shapes in the layout of the content that's on its way (CSS .sk in styles.css), with
// the loading message kept for screen readers. Each page swaps them for the real content (or an error) when it arrives.

const bar = (w, cls = "sk-line") => `<i class="sk ${cls}" style="width:${w}"></i>`;
const said = label => `<span class="sr-only" role="status">${label}</span>`;
const times = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join("");

const KINDS = {
  /** Fish Timers list: icon, name + place, status on the right. */
  timers: () => times(8, i => `<div class="sk-row"><i class="sk sk-ic"></i><div class="sk-col">${bar(`${38 + (i * 17) % 30}%`)}${bar(`${55 + (i * 23) % 30}%`, "sk-line sm")}</div><i class="sk sk-pill"></i></div>`),
  /** Achievements: a section heading, then rows with icon, name, requirement and progress bar. */
  achievements: () => times(3, s => `<div class="sk-sec">${bar(`${22 + s * 6}%`, "sk-line lg")}${times(s ? 2 : 4, i =>
    `<div class="sk-row tall"><i class="sk sk-ic lg"></i><div class="sk-col">${bar(`${30 + (i * 13) % 25}%`)}${bar(`${60 + (i * 19) % 30}%`, "sk-line sm")}${bar("100%", "sk-line bar")}</div></div>`)}</div>`),
  /** Log Route: steps with a number, where to go, what to bring and a fish or two. */
  route: () => times(3, i => `<div class="sk-step"><i class="sk sk-num"></i><div class="sk-col">${bar("12%", "sk-line sm")}${bar(`${45 + i * 9}%`)}${bar(`${62 - i * 7}%`, "sk-line sm")}
    ${times(i ? 1 : 2, () => `<div class="sk-row inset"><i class="sk sk-ic"></i><div class="sk-col">${bar("28%")}${bar("58%", "sk-line sm")}</div></div>`)}</div></div>`),
  /** Log Route summary tiles. */
  routeStats: () => times(3, () => `<div class="lr-stat sk-tile">${bar("44%", "sk-line lg")}${bar("70%", "sk-line sm")}</div>`),
  /** Share: the card's own 16:9 shape. */
  share: () => `<i class="sk sk-card"></i>`,
  /** Bait view: the "Sold by" heading and a few vendor rows. */
  bait: () => `${bar("26%", "sk-line lg")}${times(4, i => `<div class="sk-vendor">${bar(`${40 + (i * 11) % 25}%`)}${bar(`${55 + (i * 17) % 30}%`, "sk-line sm")}</div>`)}`,
  /** Fish view: the in-game description (a few lines of text). */
  desc: () => `${bar("96%")}${bar("88%")}${bar("62%")}`,
};

/** Placeholder markup for `kind`, announcing `label` to screen readers. */
export const skeleton = (kind, label = "Loading…") => KINDS[kind]() + said(label);
/** A short inline placeholder for a value that's still loading (fish view facts). */
export const skInline = (w = "84px") => `<i class="sk sk-inline" style="width:${w}"></i><span class="sr-only">Loading…</span>`;
