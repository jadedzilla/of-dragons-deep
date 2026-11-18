import { useCallback, useSyncExternalStore } from "react";

const seconds = () => Math.floor(Date.now() / 1000);

/** The time in Unix seconds, ticking every second while `active` and the tab is visible. */
export function useNow(active = true) {
  const subscribe = useCallback(tick => {
    if (!active) return () => {};
    const id = setInterval(() => { if (!document.hidden) tick(); }, 1000);
    return () => clearInterval(id);
  }, [active]);
  return useSyncExternalStore(subscribe, seconds);
}
