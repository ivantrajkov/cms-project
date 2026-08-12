import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Test configuration, kept out of vite.config.ts so the production build stays a plain
 * Vite config with nothing test-related in it.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    // The components under test read localStorage and render DOM, so they need a document.
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // One worker per core spawns a dozen forks that each boot jsdom at once. On a spinning
    // or virus-scanned disk that startup contention pushes past the pool's worker handshake
    // timeout and the run dies before a single test executes. Three keeps it parallel and
    // stable; the suite is under a minute either way.
    maxWorkers: 3,
    // Styling is not what these assert on, and skipping it keeps the runs fast.
    css: false,
    restoreMocks: true,
    // The screen tests drive real typing and clicking through user-event, each keystroke
    // costing a React render. Under coverage instrumentation and a loaded machine that
    // comfortably outruns the 5s default, so the headroom is deliberate.
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/test/**", "src/main.tsx", "src/vite-env.d.ts"],
    },
  },
});
