import { defineConfig } from "@playwright/test";

// End-to-end tests against the production build (npm run test:e2e builds it first), with the network mocked.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:4173/", trace: "off" },
  webServer: { command: "npx vite preview --host 127.0.0.1 --port 4173 --strictPort", url: "http://127.0.0.1:4173/", reuseExistingServer: !process.env.CI },
});
