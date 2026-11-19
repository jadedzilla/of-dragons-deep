import { describe, expect, it } from "vitest";
import { duration, eorzeaTime, etHour, forecastTarget, loadTimerData, nextWindow, weatherAt } from "../../src/lib/timers.js";

const { fish, weather } = await loadTimerData();
const T0 = 1794850000;

/** Whether a fish can be caught at time t, checked directly: its hours, this period's weather and the one before. */
function catchableAt(f, t) {
  const period = Math.floor(t / 1400) * 1400;
  const h = (t % 4200) / 175;
  const inHours = f.start === f.end || (f.start < f.end ? h >= f.start && h < f.end : h >= f.start || h < f.end);
  return inHours && (!f.weather || f.weather.has(weatherAt(f, period))) && (!f.prev || f.prev.has(weatherAt(f, period - 1400)));
}

describe("timer engine", () => {
  it("loads hundreds of timed fish with weather odds", () => {
    expect(fish.length).toBeGreaterThan(400);
    expect(fish.every(f => f.rates.at(-1)[1] === 100)).toBe(true);
    expect(Object.keys(weather).length).toBeGreaterThan(10);
  });

  it("finds the same windows as a brute-force scan", () => {
    const sample = fish.filter((_, i) => i % 9 === 0);
    let checked = 0;
    for (const f of sample) {
      let from = T0;
      for (let k = 0; k < 3; k++) {
        const w = nextWindow(f, from);
        if (!w) break;
        if (w.end - from > 86400 * 3) break; // keep the scan short: only windows within 3 days
        let t = from;
        while (t < w.start - 1 && !catchableAt(f, t)) t += 5; // nothing before the window…
        expect(t, `${f.id} opens early`).toBeGreaterThanOrEqual(w.start - 5);
        for (let x = Math.max(w.start, from); x < w.end; x += 25) expect(catchableAt(f, x), `${f.id} open at ${x}`).toBe(true); // …open all through it…
        expect(catchableAt(f, w.end), `${f.id} closes`).toBe(false); // …and closed right after
        from = w.end + 1;
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("forecasts weather like the game", () => {
    expect(forecastTarget(T0)).toBeGreaterThanOrEqual(0);
    expect(forecastTarget(T0)).toBeLessThan(100);
    expect(forecastTarget(T0)).toBe(forecastTarget(Math.floor(T0 / 1400) * 1400)); // one roll per 8 ET hours
  });

  it("formats times", () => {
    expect(eorzeaTime(T0)).toEqual({ h: 5, m: 42 });
    expect(etHour(16.5)).toBe("16:30");
    expect(duration(3725)).toBe("1h 02m");
    expect(duration(65)).toBe("1m 05s");
    expect(duration(90000)).toBe("1d 1h");
  });
});
