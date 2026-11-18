// Page numbers: ‹ first … current±1 … last ›, always the same number of slots between the arrows (7 desktop, 5 phones,
// 3 very narrow) so the arrows never move. null = a gap ("…").
export function pageSlots(page, count, slots) {
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const last = count - 1;
  if (count <= slots) return range(0, last);
  if (slots === 3) return page === 0 || page === last ? [0, null, last] : [null, page, null];
  const edge = slots - 2; // pages shown together at either end
  if (page < edge - 1) return [...range(0, edge - 1), null, last];
  if (page > last - edge + 1) return [0, null, ...range(last - edge + 1, last)];
  return [0, null, ...(slots === 7 ? [page - 1, page, page + 1] : [page]), null, last];
}
