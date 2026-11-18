import { useSyncExternalStore } from "react";

export function useMediaQuery(query) {
  return useSyncExternalStore(
    fn => { const m = matchMedia(query); m.addEventListener("change", fn); return () => m.removeEventListener("change", fn); },
    () => matchMedia(query).matches,
  );
}
