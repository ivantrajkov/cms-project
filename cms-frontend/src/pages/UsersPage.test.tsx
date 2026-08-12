import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UsersPage from "./UsersPage";
import { renderWithRouter } from "../test/render";
import { api, server } from "../test/server";
import { signIn } from "../test/auth";

const admin = {
  id: "user-admin",
  email: "admin@cms.local",
  role: "Admin",
  createdAt: "2026-08-10T11:00:00Z",
};

const editor = {
  id: "user-editor",
  email: "editor@cms.local",
  role: "Editor",
  createdAt: "2026-08-01T11:00:00Z",
};

/** Lists the given users, re-reading the array so a refresh after a change is visible. */
function listing(users: object[]) {
  return http.get(api("/api/users"), () => HttpResponse.json(users));
}

async function renderPage(users: object[] = [admin, editor]) {
  signIn({ email: admin.email, role: "Admin" });
  server.use(listing(users));

  renderWithRouter(<UsersPage />);

  await screen.findByRole("table");
}

function row(email: string) {
  return screen.getByRole("row", { name: new RegExp(email) });
}

describe("UsersPage", () => {
  beforeEach(() => localStorage.clear());

  it("shows a loading state before the first response", async () => {
    signIn({ email: admin.email, role: "Admin" });
    server.use(listing([admin]));

    renderWithRouter(<UsersPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading users…");
    await screen.findByRole("table");
  });

  it("lists every account with its role", async () => {
    await renderPage();

    expect(within(row(admin.email)).getByLabelText(`Role for ${admin.email}`)).toHaveValue("Admin");
    expect(within(row(editor.email)).getByLabelText(`Role for ${editor.email}`)).toHaveValue("Editor");
  });

  it("marks which row is you", async () => {
    await renderPage();

    // Deleting or demoting yourself is refused by the API, so knowing which row is yours
    // saves a pointless round trip.
    expect(within(row(admin.email)).getByText("you")).toBeInTheDocument();
    expect(within(row(editor.email)).queryByText("you")).not.toBeInTheDocument();
  });

  it("surfaces a failure to load", async () => {
    signIn({ email: admin.email, role: "Admin" });
    server.use(http.get(api("/api/users"), () => HttpResponse.text("Nope.", { status: 403 })));

    renderWithRouter(<UsersPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Nope.");
  });

  it("creates a user and clears the form", async () => {
    await renderPage([admin]);

    let created: unknown;
    server.use(
      http.post(api("/api/users"), async ({ request }) => {
        created = await request.json();
        return HttpResponse.json(editor);
      }),
      listing([admin, editor])
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "editor@cms.local");
    await user.type(screen.getByLabelText(/Password/), "ValidPassword1");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    await waitFor(() =>
      expect(created).toEqual({
        email: "editor@cms.local",
        password: "ValidPassword1",
        role: "Editor",
      })
    );

    // The new account appears in the table, and the form is empty and ready for the next.
    expect(await screen.findByText("Created editor@cms.local.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.getByLabelText(/Password/)).toHaveValue("");
  });

  it("reports why a create was refused", async () => {
    await renderPage([admin]);

    server.use(
      http.post(api("/api/users"), () =>
        HttpResponse.text("A user with that email already exists.", { status: 400 })
      )
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "admin@cms.local");
    await user.type(screen.getByLabelText(/Password/), "ValidPassword1");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A user with that email already exists."
    );
  });

  it("changes a role", async () => {
    await renderPage();

    let update: unknown;
    server.use(
      http.post(api(`/api/users/${editor.id}`), async ({ request }) => {
        update = await request.json();
        return HttpResponse.json({ ...editor, role: "Viewer" });
      }),
      listing([admin, { ...editor, role: "Viewer" }])
    );

    await userEvent
      .setup()
      .selectOptions(within(row(editor.email)).getByLabelText(`Role for ${editor.email}`), "Viewer");

    await waitFor(() => expect(update).toEqual({ role: "Viewer" }));
    expect(await screen.findByText("editor@cms.local is now Viewer.")).toBeInTheDocument();
  });

  it("puts a refused role change back the way it was", async () => {
    await renderPage();

    server.use(
      http.post(api(`/api/users/${admin.id}`), () =>
        HttpResponse.text("Cannot change the role of the last remaining Admin.", { status: 400 })
      ),
      listing([admin, editor])
    );

    await userEvent
      .setup()
      .selectOptions(within(row(admin.email)).getByLabelText(`Role for ${admin.email}`), "Editor");

    expect(await screen.findByRole("alert")).toHaveTextContent("last remaining Admin");
    // Re-read from the API rather than left showing a change that did not happen.
    await waitFor(() =>
      expect(within(row(admin.email)).getByLabelText(`Role for ${admin.email}`)).toHaveValue("Admin")
    );
  });

  it("resets a password with the value typed into the prompt", async () => {
    await renderPage();
    vi.stubGlobal("prompt", vi.fn(() => "BrandNewPassword1"));

    let update: unknown;
    server.use(
      http.post(api(`/api/users/${editor.id}`), async ({ request }) => {
        update = await request.json();
        return HttpResponse.json(editor);
      })
    );

    await userEvent
      .setup()
      .click(within(row(editor.email)).getByRole("button", { name: /Reset password/ }));

    // The role goes along unchanged — the endpoint takes both, and omitting it would
    // silently reset the user's role while resetting their password.
    await waitFor(() =>
      expect(update).toEqual({ role: "Editor", password: "BrandNewPassword1" })
    );
    expect(await screen.findByText("Password updated for editor@cms.local.")).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("does nothing when the password prompt is dismissed", async () => {
    await renderPage();
    vi.stubGlobal("prompt", vi.fn(() => null));

    // No handler for the update: a request here would fail the test.
    await userEvent
      .setup()
      .click(within(row(editor.email)).getByRole("button", { name: /Reset password/ }));

    expect(screen.queryByText(/Password updated/)).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("deletes a user once the confirmation is accepted", async () => {
    await renderPage();
    vi.stubGlobal("confirm", vi.fn(() => true));

    let deleted = false;
    server.use(
      http.delete(api(`/api/users/${editor.id}`), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
      listing([admin])
    );

    await userEvent
      .setup()
      .click(within(row(editor.email)).getByRole("button", { name: `Delete ${editor.email}` }));

    await waitFor(() => expect(deleted).toBe(true));
    await waitFor(() => expect(screen.queryByText(editor.email)).not.toBeInTheDocument());

    vi.unstubAllGlobals();
  });

  it("leaves the user alone when the confirmation is declined", async () => {
    await renderPage();
    vi.stubGlobal("confirm", vi.fn(() => false));

    await userEvent
      .setup()
      .click(within(row(editor.email)).getByRole("button", { name: `Delete ${editor.email}` }));

    expect(screen.getByText(editor.email)).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("reports why a delete was refused", async () => {
    await renderPage();
    vi.stubGlobal("confirm", vi.fn(() => true));

    server.use(
      http.delete(api(`/api/users/${admin.id}`), () =>
        HttpResponse.text("You cannot delete your own account.", { status: 400 })
      )
    );

    await userEvent
      .setup()
      .click(within(row(admin.email)).getByRole("button", { name: `Delete ${admin.email}` }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You cannot delete your own account."
    );

    vi.unstubAllGlobals();
  });

  it("says so when there is nothing to show", async () => {
    await renderPage([]);

    expect(screen.getByText("No users loaded.")).toBeInTheDocument();
  });
});
