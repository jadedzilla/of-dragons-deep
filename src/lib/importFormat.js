// Imports from the Of Dragons Deep plugin. Only its v2 export (Copy JSON) is accepted:
//   {"source":"OfDragonsDeep","version":2,"fish":[item ids],"achievements":[{"id","complete","current","max"}…]}
// ("achievements" is missing if the plugin couldn't load them). Copy tracker link gives ?import=2.<data>, decoded into
// the same JSON (see decodeImportLink).

/** { ids, invalid, achievements } or { error: "empty" | "notExport" | "badJson" | "old" }. */
export function parseImport(text) {
  const t = text.trim();
  if (!t) return { error: "empty" };
  if (!t.startsWith("{")) return { error: "notExport" };
  let data;
  try { data = JSON.parse(t); } catch { return { error: "badJson" }; }
  if (data?.source !== "OfDragonsDeep") return { error: "notExport" };
  if (data.version !== 2 || !Array.isArray(data.fish)) return { error: "old" };
  const ids = [], invalid = [];
  for (const f of data.fish) (Number.isInteger(f) && f > 0 ? ids.push(f) : invalid.push(String(f)));
  const num = v => (v === null || v === undefined || v === "" ? undefined : Number(v));
  const achievements = Array.isArray(data.achievements)
    ? data.achievements.filter(a => a && Number.isInteger(Number(a.id)))
      .map(a => ({ id: Number(a.id), complete: !!a.complete, current: num(a.current), max: num(a.max) }))
    : null;
  return { ids: [...new Set(ids)], invalid, achievements };
}

/**
 * What an import changes, without changing anything: the new caught set, marks and progress, and what to report.
 * replace: fish and achievements become exactly what the export says; otherwise it only adds.
 */
export function planImport(parsed, { fishIds, caught, marks, progress, replace, now = new Date() }) {
  const { ids, invalid, achievements: achIn } = parsed;
  const known = ids.filter(id => fishIds.has(id)), unknown = ids.filter(id => !fishIds.has(id));
  const knownSet = new Set(known);
  const removed = replace ? [...caught].filter(id => !knownSet.has(id)) : [];
  const unmarkAch = replace && achIn ? achIn.filter(a => !a.complete && marks.has(a.id)) : [];
  const fresh = known.filter(id => !caught.has(id));

  const newCaught = new Set(replace ? known : [...caught, ...known]);
  let newMarks = marks, newProgress = progress, achDone = 0, achNew = 0, achProgress = 0;
  if (achIn) {
    newMarks = new Set(marks);
    newProgress = { at: now.toISOString(), items: { ...progress.items } };
    for (const a of achIn) {
      if (a.complete) {
        achDone++;
        if (!newMarks.has(a.id)) achNew++;
        newMarks.add(a.id);
        delete newProgress.items[a.id];
        continue;
      }
      if (replace) newMarks.delete(a.id);
      if (a.current !== undefined && a.max) { newProgress.items[a.id] = [a.current, a.max]; achProgress++; }
      else delete newProgress.items[a.id];
    }
  }
  return { known, unknown, invalid, fresh, removed, unmarkAch, hasAchievements: !!achIn,
    newCaught, newMarks, newProgress, achDone, achNew, achProgress,
    empty: !known.length && !achIn?.length,
    needsConfirm: replace && (removed.length > 0 || unmarkAch.length > 0) };
}

/** Decodes ?import=2.<data>: base64url (no padding) of raw-DEFLATE'd LEB128 varints (see CLAUDE.md). Throws { old } for 1. links. */
export async function decodeImportLink(value) {
  if (/^1\.|^[\d\s,;]+$/.test(value)) throw Object.assign(new Error("old"), { old: true });
  const m = /^2\.([A-Za-z0-9_-]*)$/.exec(value);
  if (!m) throw new Error("Unrecognised import link");
  const bytes = Uint8Array.from(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  const nums = [];
  let cur = 0, shift = 0;
  for (const b of raw) {
    cur += (b & 0x7f) * 2 ** shift;
    if (b & 0x80) { shift += 7; continue; }
    nums.push(cur);
    cur = 0; shift = 0;
  }
  let i = 0;
  const next = () => { if (i >= nums.length) throw new Error("Import link is cut off"); return nums[i++]; };
  const fish = [];
  for (let n = next(), prev = 0; n > 0; n--) fish.push(prev += next());
  const out = { source: "OfDragonsDeep", version: 2, fish };
  if (i < nums.length) {
    out.achievements = [];
    for (let n = next(), prev = 0; n > 0; n--) {
      const id = (prev += next()), status = next();
      if (status === 2) out.achievements.push({ id, complete: false, current: next(), max: next() });
      else out.achievements.push({ id, complete: status === 1 });
    }
  }
  return JSON.stringify(out);
}

/** The inverse of decodeImportLink (used by tests; the plugin makes the real links). */
export async function encodeImportLink({ fish, achievements }) {
  const nums = [];
  const sorted = [...fish].sort((a, b) => a - b);
  nums.push(sorted.length);
  sorted.forEach((id, i) => nums.push(id - (sorted[i - 1] ?? 0)));
  if (achievements) {
    const ach = [...achievements].sort((a, b) => a.id - b.id);
    nums.push(ach.length);
    ach.forEach((a, i) => {
      nums.push(a.id - (ach[i - 1]?.id ?? 0));
      if (a.complete) nums.push(1);
      else if (a.current !== undefined) nums.push(2, a.current, a.max);
      else nums.push(0);
    });
  }
  const bytes = [];
  for (let n of nums) { do { let b = n % 128; n = Math.floor(n / 128); if (n) b |= 0x80; bytes.push(b); } while (n); }
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  return "2." + btoa(String.fromCharCode(...out)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
