import type { ReactElement, ReactNode } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";

interface Options {
  /** Path the router starts on, so `useSearchParams` and guards see a real location. */
  route?: string;
}

/**
 * Renders a component inside a router.
 *
 * Almost everything here uses `Link`, `useNavigate` or `useLocation`, so a bare `render`
 * would throw before reaching the behaviour under test.
 */
export function renderWithRouter(ui: ReactElement, { route = "/" }: Options = {}): RenderResult {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

interface RoutesOptions extends Options {
  /** Extra destinations, so a redirect can be asserted by what ends up on screen. */
  others?: { path: string; element: ReactNode }[];
}

/**
 * Renders `ui` at `route` alongside stand-in screens for the places it might navigate to.
 * Asserting that the destination rendered tests the redirect the way a user meets it,
 * rather than by spying on the router.
 */
export function renderAtRoute(
  path: string,
  ui: ReactElement,
  { route = path, others = [] }: RoutesOptions = {}
): RenderResult {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={ui} />
        {others.map((other) => (
          <Route key={other.path} path={other.path} element={other.element} />
        ))}
      </Routes>
    </MemoryRouter>
  );
}

/** user-event bound to the document, for tests that type or click. */
export const user = userEvent.setup();
