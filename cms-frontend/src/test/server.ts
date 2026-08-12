import { setupServer } from "msw/node";

/**
 * The mock API every test talks to.
 *
 * Requests are intercepted at the network layer rather than by stubbing `fetch`, so the
 * code under test runs its real request-building, status handling and error parsing —
 * the parts most likely to be wrong — instead of a mock standing in for them.
 *
 * No default handlers: each test declares the responses it depends on with `server.use`,
 * and anything unhandled fails the test (see the setup file) rather than silently
 * hitting a real network.
 */
export const server = setupServer();

/** Base URL the frontend is configured to call. Kept in step with `src/lib/api.ts`. */
export const API_BASE = "http://localhost:5051";

/** Builds an absolute URL for a handler path, e.g. `api("/api/users")`. */
export const api = (path: string) => `${API_BASE}${path}`;
