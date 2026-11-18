import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./", // relative URLs: works on the custom domain, a sub-path, or from dist/ on disk
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: "node", // component tests opt in to jsdom with a @vitest-environment comment
    include: ["tests/unit/**/*.test.{js,jsx}", "tests/components/**/*.test.{js,jsx}"],
    setupFiles: ["tests/setup.js"],
  },
});
