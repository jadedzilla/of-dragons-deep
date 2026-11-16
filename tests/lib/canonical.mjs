/** A URL with its query parameters decoded and sorted, so the browser's and Node's spelling of a request match. */
export function canonical(url) {
  const u = new URL(url);
  const params = [...u.searchParams].sort(([a, x], [b, y]) => a.localeCompare(b) || x.localeCompare(y));
  return `${u.origin}${u.pathname}?${params.map(([k, v]) => `${k}=${v}`).join("&")}`;
}
