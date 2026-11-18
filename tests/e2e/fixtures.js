// Every page gets the recorded network (nothing reaches the internet) and, optionally, saved progress and a fixed clock.
import { test as base, expect } from "@playwright/test";
import { PNG_1PX, recorded } from "../fixtures/network.js";

export { expect };
export const T0 = 1794850000; // ET 05:42
export const CAUGHT = [4776, 4869, 4870, 7678, 12713, 20144, 28937];

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => {
      const url = route.request().url(), { hostname, pathname } = new URL(url);
      const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
      if (hostname === "v2.xivapi.com" && pathname === "/api/asset") return route.fulfill({ contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: PNG_1PX });
      if (hostname === "v2.xivapi.com" || hostname === "raw.githubusercontent.com") {
        const body = recorded(url);
        return body ? json(body) : json({ message: "not recorded" }, 404);
      }
      return route.abort("blockedbyclient"); // fonts
    });
    await use(context);
  },
});

/**
 * Opens the app. storage: localStorage to start with (set once, so reloads keep what the page saved);
 * clock: a fixed time (Unix seconds) or { install: seconds } for a clock the test moves itself.
 */
export async function openApp(page, { path = "", storage = {}, clock } = {}) {
  await page.addInitScript(s => {
    if (sessionStorage.getItem("seeded")) return;
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
    sessionStorage.setItem("seeded", "1");
  }, storage);
  if (typeof clock === "number") await page.clock.setFixedTime(new Date(clock * 1000));
  else if (clock?.install) await page.clock.install({ time: new Date(clock.install * 1000) });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(path);
  return errors;
}

export const exportJson = (fish, achievements) => JSON.stringify({ source: "OfDragonsDeep", version: 2, fish, ...(achievements && { achievements }) });
export const gridReady = page => expect(page.locator(".tile[data-id]").first()).toBeVisible();
