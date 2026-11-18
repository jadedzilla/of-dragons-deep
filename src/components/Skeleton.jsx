// Loading placeholders: shimmering shapes in the layout of what's on its way (CSS .sk), with the message kept for screen readers.
const times = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const Bar = ({ w, cls = "sk-line" }) => <i className={`sk ${cls}`} style={{ width: w }} />;
const Row = ({ a, b, cls = "sk-row" }) => (
  <div className={cls}><i className="sk sk-ic" /><div className="sk-col"><Bar w={a} /><Bar w={b} cls="sk-line sm" /></div></div>
);

const KINDS = {
  /** Fish Timers rows: icon, name + place, status. */
  timers: () => times(8, i => (
    <div className="sk-row" key={i}><i className="sk sk-ic" />
      <div className="sk-col"><Bar w={`${38 + (i * 17) % 30}%`} /><Bar w={`${55 + (i * 23) % 30}%`} cls="sk-line sm" /></div>
      <i className="sk sk-pill" /></div>)),
  /** Achievements: section headings with rows (icon, name, requirement, bar). */
  achievements: () => times(3, s => (
    <div className="sk-sec" key={s}><Bar w={`${22 + s * 6}%`} cls="sk-line lg" />{times(s ? 2 : 4, i => (
      <div className="sk-row tall" key={i}><i className="sk sk-ic lg" />
        <div className="sk-col"><Bar w={`${30 + (i * 13) % 25}%`} /><Bar w={`${60 + (i * 19) % 30}%`} cls="sk-line sm" /><Bar w="100%" cls="sk-line bar" /></div></div>))}
    </div>)),
  /** Log Route steps: number, where, what to bring, a fish or two. */
  route: () => times(3, i => (
    <div className="sk-step" key={i}><i className="sk sk-num" />
      <div className="sk-col"><Bar w="12%" cls="sk-line sm" /><Bar w={`${45 + i * 9}%`} /><Bar w={`${62 - i * 7}%`} cls="sk-line sm" />
        {times(i ? 1 : 2, k => <Row key={k} a="28%" b="58%" cls="sk-row inset" />)}</div></div>)),
  /** Log Route summary tiles. */
  routeStats: () => times(3, i => <div className="lr-stat sk-tile" key={i}><Bar w="44%" cls="sk-line lg" /><Bar w="70%" cls="sk-line sm" /></div>),
  /** Share: the card's 16:9 shape. */
  share: () => <i className="sk sk-card" />,
  /** Bait view: "Sold by" and vendor rows. */
  bait: () => <><Bar w="26%" cls="sk-line lg" />{times(4, i => (
    <div className="sk-vendor" key={i}><Bar w={`${40 + (i * 11) % 25}%`} /><Bar w={`${55 + (i * 17) % 30}%`} cls="sk-line sm" /></div>))}</>,
  /** Fish view description. */
  desc: () => <><Bar w="96%" /><Bar w="88%" /><Bar w="62%" /></>,
  /** A page opened directly while the fish list loads. */
  page: () => <><Bar w="35%" cls="sk-line lg" />{times(6, i => <Row key={i} a="40%" b="65%" />)}</>,
};

export function Skeleton({ kind, label = "Loading…" }) {
  const Kind = KINDS[kind];
  return <><Kind /><span className="sr-only" role="status">{label}</span></>;
}

/** A short inline placeholder for a value still loading. */
export const SkInline = ({ w = "84px" }) => <><i className="sk sk-inline" style={{ width: w }} /><span className="sr-only">Loading…</span></>;
