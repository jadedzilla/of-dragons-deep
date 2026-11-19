import { useEffect, useState } from "react";

// The browser remembers a data file that failed to load (offline), so trying again means loading the page again.
const reload = () => location.reload();

/** Runs `load` once `enabled` is true: { data, error, retry }. `load` should cache its own result. */
export function useAsync(load, enabled = true) {
  const [result, setResult] = useState({});
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    load().then(data => live && setResult({ data }), error => live && setResult({ error }));
    return () => { live = false; };
  }, [load, enabled]);
  return { data: result.data ?? null, error: result.error ?? null, retry: reload };
}
