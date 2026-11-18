import { useCallback, useState } from "react";
import { readJson, writeJson } from "../lib/storage.js";

/** useState saved to localStorage as JSON under `key`. */
export function useStored(key, fallback) {
  const [value, setValue] = useState(() => readJson(key, fallback));
  const set = useCallback(next => setValue(prev => {
    const v = typeof next === "function" ? next(prev) : next;
    writeJson(key, v);
    return v;
  }), [key]);
  return [value, set];
}
