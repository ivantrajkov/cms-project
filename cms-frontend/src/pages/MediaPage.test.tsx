import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MediaPage from "./MediaPage";
import { renderWithRouter } from "../test/render";
import { api, server } from "../test/server";
import { signIn } from "../test/auth";
import type { Role } from "../lib/auth";

const hero = {
  id: "media-1",
  fileName: "abc.png",
  originalFileName: "hero.png",
  url: "http://localhost:5051/uploads/abc.png",
  contentType: "image/png",
  sizeBytes: 2048,
  altText: "",
  uploadedAt: "2026-08-10T11:00:00Z",
};

const logo = { ...hero, id: "media-2", fileName: "def.png", originalFileName: "logo.svg", sizeBytes: 1024 };

const listing = (assets: object[]) => http.get(api("/api/media"), () => HttpResponse.json(assets));

async function renderPage(assets: object[] = [hero], role: Role = "Admin") {
  signIn({ role });
  server.use(listing(assets));

  renderWithRouter(<MediaPage />);

  await waitFor(() => expect(screen.queryByText("Loading media…")).not.toBeInTheDocument());
}

describe("MediaPage", () => {
  beforeEach(() => localStorage.clear());

  it("shows what has been uploaded, with a readable size and age", async () => {
    await renderPage([hero, logo]);

    expect(screen.getByText("hero.png")).toBeInTheDocument();
    expect(screen.getByText("logo.svg")).toBeInTheDocument();
    // A running total, because raw byte counts say nothing when scanning a library.
    expect(screen.getByText(/2 files · 3\.0 KB/)).toBeInTheDocument();
  });

  it("uses the singular for a library of one", async () => {
    await renderPage([hero]);

    expect(screen.getByText(/1 file · 2\.0 KB/)).toBeInTheDocument();
  });

  it("falls back to the file name when an asset has no alt text", async () => {
    await renderPage([hero]);

    expect(screen.getByRole("img", { name: "hero.png" })).toHaveAttribute("src", hero.url);
  });

  it("invites the first upload when the library is empty", async () => {
    await renderPage([]);

    expect(screen.getByText("No media uploaded yet")).toBeInTheDocument();
  });

  it("surfaces a failure to load", async () => {
    signIn();
    server.use(http.get(api("/api/media"), () => HttpResponse.text("Nope.", { status: 500 })));

    renderWithRouter(<MediaPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Nope.");
  });

  it("uploads a chosen file and shows it in the library", async () => {
    await renderPage([]);

    let uploaded = false;
    server.use(
      http.post(api("/api/upload"), () => {
        uploaded = true;
        return HttpResponse.json({ url: hero.url, id: hero.id, originalFileName: "hero.png", sizeBytes: 2048 });
      }),
      listing([hero])
    );

    const file = new File(["png"], "hero.png", { type: "image/png" });
    // The input is hidden behind the two buttons, so upload it directly.
    await userEvent.setup().upload(document.querySelector("input[type=file]") as HTMLInputElement, file);

    await waitFor(() => expect(uploaded).toBe(true));
    expect(await screen.findByText("Uploaded hero.png.")).toBeInTheDocument();
    expect(screen.getByText("hero.png")).toBeInTheDocument();
  });

  it("reports why an upload was refused", async () => {
    await renderPage([]);

    server.use(
      http.post(api("/api/upload"), () =>
        HttpResponse.text("File exceeds the 5 MB limit.", { status: 400 })
      )
    );

    // The input's accept="image/*" is the first filter; the API's own limits are the second,
    // and this is what happens when a file gets past the first but not the second.
    const file = new File(["png"], "enormous.png", { type: "image/png" });
    await userEvent.setup().upload(document.querySelector("input[type=file]") as HTMLInputElement, file);

    expect(await screen.findByRole("alert")).toHaveTextContent("File exceeds the 5 MB limit.");
  });

  it("saves alt text when the field is left, not on every keystroke", async () => {
    await renderPage([hero]);

    let requests = 0;
    let body: unknown;
    server.use(
      http.post(api(`/api/media/${hero.id}`), async ({ request }) => {
        requests += 1;
        body = await request.json();
        return HttpResponse.json({ ...hero, altText: "A wide landscape" });
      })
    );

    const user = userEvent.setup();
    const field = screen.getByLabelText("Alt text for hero.png");

    await user.type(field, "A wide landscape");
    expect(requests).toBe(0);

    await user.tab();

    await waitFor(() => expect(body).toEqual({ altText: "A wide landscape" }));
    expect(requests).toBe(1);
  });

  it("does not save alt text that was not changed", async () => {
    // No handler is registered, so a request here would fail the test.
    await renderPage([{ ...hero, altText: "Unchanged" }]);

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Alt text for hero.png"));
    await user.tab();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("deletes an asset once the confirmation is accepted", async () => {
    await renderPage([hero]);
    vi.stubGlobal("confirm", vi.fn(() => true));

    server.use(
      http.delete(api(`/api/media/${hero.id}`), () => new HttpResponse(null, { status: 204 })),
      listing([])
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Delete hero.png" }));

    expect(await screen.findByText("No media uploaded yet")).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("keeps the asset when the confirmation is declined", async () => {
    await renderPage([hero]);
    vi.stubGlobal("confirm", vi.fn(() => false));

    await userEvent.setup().click(screen.getByRole("button", { name: "Delete hero.png" }));

    expect(screen.getByText("hero.png")).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("explains why an asset in use cannot be deleted", async () => {
    await renderPage([hero]);
    vi.stubGlobal("confirm", vi.fn(() => true));

    server.use(
      http.delete(api(`/api/media/${hero.id}`), () =>
        HttpResponse.text("Cannot delete: used by post/first-post.", { status: 400 })
      )
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Delete hero.png" }));

    // Names the item using it, so the editor knows what to unpick first.
    expect(await screen.findByRole("alert")).toHaveTextContent("used by post/first-post");
    expect(screen.getByText("hero.png")).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  describe("as a Viewer", () => {
    it("hides every way of changing the library", async () => {
      await renderPage([hero], "Viewer");

      // The API refuses these anyway; hiding them keeps the screen honest about what a
      // Viewer can do rather than offering buttons that always fail.
      expect(screen.queryByRole("button", { name: /Upload image/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Choose an image" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete hero.png" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Alt text for hero.png")).toBeDisabled();
    });

    it("can still open a file", async () => {
      await renderPage([hero], "Viewer");

      expect(within(screen.getByText("hero.png").closest("li")!).getByRole("link", { name: /Open/ }))
        .toHaveAttribute("href", hero.url);
    });
  });
});
