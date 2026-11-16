#!/usr/bin/env node
// Test runner: `npm test` runs every suite in tests/suites; `npm test -- timers achievements` runs those whose file
// names contain a given word. One Chromium, suites in parallel, each page in its own browser context (own
// localStorage), all network served from tests/fixtures (see lib/network.mjs). SHOTS=<dir> saves screenshots.
// Exit code 1 if any check fails.
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { mockNetwork } from "./lib/network.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml" };
const CONCURRENCY = 4;

// static server for the dev files (like npm run dev)
const server = createServer(async (req, res) => {
  const file = normalize(join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/$/, "/index.html")));
  try { res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const filters = process.argv.slice(2);
const files = (await readdir(new URL("./suites/", import.meta.url))).filter(f => f.endsWith(".mjs") && (!filters.length || filters.some(w => f.includes(w)))).sort();
if (!files.length) { console.error(`No suites match ${filters.join(", ")}`); process.exit(1); }
if (process.env.SHOTS) await mkdir(process.env.SHOTS, { recursive: true });

const browser = await chromium.launch();
const t0 = Date.now();

function harness(name) {
  const results = [], contexts = [];
  return {
    results, contexts,
    url: origin + "/",
    origin,
    /** A fresh page (own context): { width, height, path, clock (Unix s), storage: { key: value } set before the app starts }. */
    async page({ width = 900, height = 1000, path = "", clock, storage } = {}) {
      const context = await browser.newContext({ viewport: { width, height } });
      contexts.push(context);
      await mockNetwork(context, origin);
      if (storage) await context.addInitScript(s => { if (!sessionStorage.__seeded) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.__seeded = 1; } }, storage);
      const page = await context.newPage();
      page.errors = [];
      page.on("pageerror", e => page.errors.push(e.message));
      if (clock !== undefined) await page.clock.setFixedTime(new Date(clock * 1000));
      if (path !== null) await page.goto(path.startsWith("file:") ? path : origin + "/" + path);
      return page;
    },
    check(label, ok, detail = "") { results.push({ label, ok: !!ok, detail: ok ? "" : typeof detail === "string" ? detail : JSON.stringify(detail) }); },
    noErrors(page, label = "") { this.check(`${label ? label + " " : ""}no page errors`, page.errors.length === 0, page.errors.join(" | ")); },
    async shot(page, file) { if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `${name}-${file}.png`) }); },
  };
}

async function runSuite(file) {
  const name = file.replace(/\.mjs$/, ""), t = harness(name), start = Date.now();
  try {
    await (await import(`./suites/${file}`)).default(t);
  } catch (e) {
    t.results.push({ label: "suite crashed", ok: false, detail: (e.stack ?? String(e)).split("\n").slice(0, 4).join("\n") });
  }
  await Promise.all(t.contexts.map(c => c.close().catch(() => {})));
  return { name, results: t.results, ms: Date.now() - start };
}

const queue = [...files], done = [];
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
  while (queue.length) {
    const r = await runSuite(queue.shift());
    done.push(r);
    const failed = r.results.filter(x => !x.ok);
    console.log(`${failed.length ? "✗" : "✓"} ${r.name.padEnd(13)} ${String(r.results.length).padStart(3)} checks  ${(r.ms / 1000).toFixed(1)}s`);
    for (const f of failed) console.log(`    FAIL ${f.label}${f.detail ? `\n         ${f.detail.slice(0, 600)}` : ""}`);
  }
}));
await browser.close();
server.close();

const all = done.flatMap(r => r.results), failed = all.filter(x => !x.ok);
console.log(`\n${failed.length ? `${failed.length} of ${all.length} checks failed` : `All ${all.length} checks passed`} (${done.length} suites, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
process.exit(failed.length ? 1 : 0);
