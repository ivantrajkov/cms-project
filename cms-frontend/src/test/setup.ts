import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

/**
 * Browser APIs jsdom does not implement. Puck's drag-and-drop layer reaches for these at
 * import time, so any screen that renders a page layout fails to load without them. They
 * are stubs rather than working implementations: nothing here asserts on layout geometry.
 */
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

beforeAll(() => {
  // "error" rather than "warn": a request nobody mocked means the test is not asserting
  // what it thinks it is, and a silent 500 from an unhandled call is hard to trace back.
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
  cleanup();
  // The session lives in localStorage, so a leftover token would sign the next test in.
  localStorage.clear();
});

afterAll(() => {
  server.close();
});
