import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import LoginPage from "./LoginPage";
import { renderAtRoute } from "../test/render";
import { api, server } from "../test/server";
import { getToken } from "../lib/auth";
import { makeToken } from "../test/auth";

const dashboard = { path: "/", element: <h1>Dashboard</h1> };
const media = { path: "/admin/media", element: <h1>Media library</h1> };

function respondWith(token: string) {
  server.use(
    http.post(api("/api/auth/login"), () =>
      HttpResponse.json({
        token,
        email: "admin@cms.local",
        role: "Admin",
        expiresAt: "2026-08-10T14:00:00Z",
      })
    )
  );
}

async function signInAs(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginPage", () => {
  beforeEach(() => localStorage.clear());

  it("signs in and lands on the dashboard", async () => {
    const token = makeToken();
    respondWith(token);

    renderAtRoute("/login", <LoginPage />, { others: [dashboard] });

    await signInAs("admin@cms.local", "password");

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(getToken()).toBe(token);
  });

  it("returns the user to the page they were trying to reach", async () => {
    respondWith(makeToken());

    renderAtRoute("/login", <LoginPage />, {
      route: "/login?next=%2Fadmin%2Fmedia",
      others: [dashboard, media],
    });

    await signInAs("admin@cms.local", "password");

    expect(await screen.findByRole("heading", { name: "Media library" })).toBeInTheDocument();
  });

  it("sends what was typed", async () => {
    let body: unknown;
    server.use(
      http.post(api("/api/auth/login"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ token: makeToken(), email: "", role: "Admin", expiresAt: "" });
      })
    );

    renderAtRoute("/login", <LoginPage />, { others: [dashboard] });

    await signInAs("editor@cms.local", "hunter2");

    await waitFor(() => expect(body).toEqual({ email: "editor@cms.local", password: "hunter2" }));
  });

  it("shows the API's rejection and stays put", async () => {
    server.use(
      http.post(api("/api/auth/login"), () =>
        HttpResponse.text("Invalid email or password.", { status: 401 })
      )
    );

    renderAtRoute("/login", <LoginPage />, { others: [dashboard] });

    await signInAs("admin@cms.local", "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
    expect(screen.queryByRole("heading", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(getToken()).toBeNull();
  });

  it("re-enables the button after a failure so the user can try again", async () => {
    server.use(
      http.post(api("/api/auth/login"), () => HttpResponse.text("Nope.", { status: 401 }))
    );

    renderAtRoute("/login", <LoginPage />, { others: [dashboard] });

    await signInAs("admin@cms.local", "wrong");

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("clears a previous error when the form is submitted again", async () => {
    server.use(
      http.post(api("/api/auth/login"), () => HttpResponse.text("Nope.", { status: 401 }))
    );

    renderAtRoute("/login", <LoginPage />, { others: [dashboard] });

    await signInAs("admin@cms.local", "wrong");
    await screen.findByRole("alert");

    respondWith(makeToken());
    await userEvent.setup().click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("asks the browser for the right kind of input", () => {
    renderAtRoute("/login", <LoginPage />);

    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Password");

    // type=email and the autocomplete hints are what let a password manager fill this in.
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(email).toBeRequired();
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(password).toBeRequired();
  });
});
