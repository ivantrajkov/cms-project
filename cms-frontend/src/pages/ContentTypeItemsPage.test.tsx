import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import ContentTypeItemsPage from "./ContentTypeItemsPage";
import { api, server } from "../test/server";
import { signIn } from "../test/auth";
import type { Role } from "../lib/auth";

const blogType = {
  id: "type-1",
  name: "Blog post",
  slug: "post",
  fields: [
    { name: "title", type: "Text", required: true },
    { name: "views", type: "Number", required: false },
  ],
};

const published = {
  id: "item-1",
  slug: "hello-world",
  status: "Published",
  dataJson: null,
  updatedAt: "2026-08-10T11:59:00Z",
};

const draft = {
  id: "item-2",
  slug: "work-in-progress",
  status: "Draft",
  dataJson: null,
  updatedAt: "2026-08-09T11:00:00Z",
};

function handlers(type: object | null, items: object[]) {
  return [
    http.get(api("/api/content-types/post"), () =>
      type ? HttpResponse.json(type) : new HttpResponse(null, { status: 404 })
    ),
    http.get(api("/api/content-types/post/items"), () => HttpResponse.json(items)),
  ];
}

async function renderPage(
  { type = blogType as object | null, items = [published, draft], role = "Admin" as Role } = {}
) {
  signIn({ role });
  server.use(...handlers(type, items));

  render(
    <MemoryRouter initialEntries={["/admin/content-types/post"]}>
      <Routes>
        <Route path="/admin/content-types/:typeSlug" element={<ContentTypeItemsPage />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
}

const rowFor = (slug: string) => screen.getByText(slug).closest("li")!;

describe("ContentTypeItemsPage", () => {
  beforeEach(() => localStorage.clear());

  it("lists the items of the type, newest change first", async () => {
    await renderPage();

    const titles = screen.getAllByRole("link", { name: /hello-world|work-in-progress/ });

    // Sorted by updatedAt so the thing just edited is at the top, where it is looked for.
    expect(titles[0]).toHaveTextContent("hello-world");
    expect(within(rowFor("hello-world")).getByText("Published")).toBeInTheDocument();
    expect(within(rowFor("work-in-progress")).getByText("Draft")).toBeInTheDocument();
  });

  it("shows the schema the items are validated against", async () => {
    await renderPage();

    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("Number")).toBeInTheDocument();
    // The asterisk is how a required field is marked in the chip row.
    expect(screen.getByTitle("Required")).toBeInTheDocument();
  });

  it("links each item to its editor and to its public page", async () => {
    await renderPage();

    const row = within(rowFor("hello-world"));

    expect(row.getByRole("link", { name: /Edit/ })).toHaveAttribute(
      "href",
      "/admin/content-types/post/items/hello-world"
    );
    expect(row.getByRole("link", { name: /View/ })).toHaveAttribute("href", "/post/hello-world");
  });

  it("says so when the content type is gone", async () => {
    await renderPage({ type: null, items: [] });

    expect(screen.getByText("Content type not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to content types/ })).toHaveAttribute(
      "href",
      "/admin/content-types"
    );
  });

  it("invites the first item when the type is empty", async () => {
    await renderPage({ items: [] });

    expect(screen.getByText("No blog post items yet")).toBeInTheDocument();
  });

  it("turns a typed name into a slug before opening the editor", async () => {
    await renderPage({ items: [] });

    await userEvent.setup().type(screen.getByLabelText("New blog post slug"), "My First Post!");

    // The API only accepts lowercase hyphenated slugs, so the link has to point at the
    // slug that will actually be created — and say so.
    expect(screen.getByRole("link", { name: /Open editor/ })).toHaveAttribute(
      "href",
      "/admin/content-types/post/items/my-first-post"
    );
    expect(screen.getByText("my-first-post")).toBeInTheDocument();
  });

  it("disables the editor link until a slug is typed", async () => {
    await renderPage({ items: [] });

    expect(screen.getByRole("link", { name: /Open editor/ })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });

  it("deletes an item once the confirmation is accepted", async () => {
    await renderPage();
    vi.stubGlobal("confirm", vi.fn(() => true));

    server.use(
      http.delete(api("/api/content-types/post/items/hello-world"), () => new HttpResponse(null, { status: 204 })),
      ...handlers(blogType, [draft])
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Delete hello-world" }));

    await waitFor(() => expect(screen.queryByText("hello-world")).not.toBeInTheDocument());

    vi.unstubAllGlobals();
  });

  it("explains why a referenced item cannot be deleted", async () => {
    await renderPage();
    vi.stubGlobal("confirm", vi.fn(() => true));

    server.use(
      http.delete(api("/api/content-types/post/items/hello-world"), () =>
        HttpResponse.text("Cannot delete: referenced by talk/a-talk.", { status: 400 })
      )
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Delete hello-world" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("referenced by talk/a-talk");
    expect(screen.getByText("hello-world")).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("offers a Viewer reading but no editing", async () => {
    await renderPage({ role: "Viewer" });

    expect(screen.queryByRole("button", { name: "Delete hello-world" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New blog post slug")).not.toBeInTheDocument();
    // Still able to open an item — a Viewer may read everything, including drafts.
    expect(within(rowFor("hello-world")).getByRole("link", { name: /Open/ })).toHaveAttribute(
      "href",
      "/admin/content-types/post/items/hello-world"
    );
  });
});
