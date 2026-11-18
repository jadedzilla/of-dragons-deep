import { useEffect, useState } from "react";

const VIEWS = { "#timers": "timers", "#achievements": "achievements", "#route": "route", "#share": "share" };
const current = () => VIEWS[location.hash] ?? "guide";

/** The page in the address (#timers, #achievements, #route, #share; anything else is the Fish Guide). */
export function useHashRoute() {
  const [view, setView] = useState(current);
  useEffect(() => {
    const onHash = () => setView(current());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  return view;
}
