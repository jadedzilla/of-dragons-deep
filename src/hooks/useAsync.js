import { useCallback, useEffect, useState } from "react";

/** Runs `load` once `enabled` is true: { data, error, retry }. `load` should cache its own result. */
export function useAsync(load, enabled = true) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ attempt: -1 });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    load().then(data => live && setResult({ attempt, data }), error => live && setResult({ attempt, error }));
    return () => { live = false; };
  }, [load, enabled, attempt]);
  const retry = useCallback(() => setAttempt(a => a + 1), []);
  const current = result.attempt === attempt ? result : {}; // a retry shows loading again
  return { data: current.data ?? null, error: current.error ?? null, retry };
}
