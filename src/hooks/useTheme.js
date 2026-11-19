import { useSyncExternalStore } from "react";

const root = document.documentElement;
function subscribe(fn) {
  const observer = new MutationObserver(fn);
  observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/** The current light / dark mode (html[data-theme]), updating when it's switched. */
export const useTheme = () => useSyncExternalStore(subscribe, () => root.dataset.theme);
