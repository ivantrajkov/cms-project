import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import ContentItemEditorPage from "./ContentItemEditorPage";
import { api, server } from "../test/server";
import { signIn } from "../test/auth";
import type { Role } from "../lib/auth";

const field = (name: string, type: string, required = false, targetType: string | null = null) => ({
  name,
  type,
  required,
  targetType,
});

const blogType = {
  id: "type-1",
  name: "Blog post",
  slug: "post",
  fields: [
    field("title", "Text", true),
    field("views", "Number"),
    field("featured", "Boolean"),
    field("publishedOn", "Date"),
  ],
};

function handlers({
  type = blogType as object | null,
  item = null as object | null,
  slug = "hello",
}: { type?: object | null; item?: object | null; slug?: string } = {}) {
  return [
    http.get(api("/api/content-types/post"), () =>
      type ? HttpResponse.json(type) : new HttpResponse(null, { status: 404 })
    ),
    http.get(api(`/api/content-types/post/items/${slug}`), () =>
      item ? HttpResponse.json(item) : new HttpResponse(null, { status: 404 })
    ),
  ];
}

async function renderEditor(
  options: Parameters<typeof handlers>[0] = {},
  role: Role = "Admin",
  slug = "hello"
) {
  signIn({ role });
  server.use(...handlers({ ...options, slug }));

  render(
    <MemoryRouter initialEntries={[`/admin/content-types/post/items/${slug}`]}>
      <Routes>
        <Route
          path="/admin/content-types/:typeSlug/items/:itemSlug"
          element={<ContentItemEditorPage />}
        />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.queryByText("Loading editor…")).not.toBeInTheDocument());
}

const existingItem = {
  id: "item-1",
  slug: "hello",
  status: "Published",
  dataJson: JSON.stringify({ title: "Hello world", views: 12, featured: true, publishedOn: "2026-08-01T00:00:00Z" }),
  updatedAt: "2026-08-10T11:00:00Z",
};

describe("ContentItemEditorPage", () => {
  beforeEach(() => localStorage.clear());

  it("builds the form from the schema, one input per declared type", async () => {
    await renderEditor();

    // No hardcoded form: a content type defined at runtime gets a working editor.
    expect(screen.getByLabelText(/title/)).toHaveAttribute("type", "text");
    expect(screen.getByLabelText(/views/)).toHaveAttribute("type", "number");
    expect(screen.getByLabelText(/featured/)).toHaveAttribute("type", "checkbox");
    expect(screen.getByLabelText(/publishedOn/)).toHaveAttribute("type", "date");
  });

  it("fills the form with the item's saved values", async () => {
    await renderEditor({ item: existingItem });

    expect(screen.getByLabelText(/title/)).toHaveValue("Hello world");
    expect(screen.getByLabelText(/views/)).toHaveValue(12);
    expect(screen.getByLabelText(/featured/)).toBeChecked();
    // <input type="date"> only understands YYYY-MM-DD, so the time component is trimmed.
    expect(screen.getByLabelText(/publishedOn/)).toHaveValue("2026-08-01");
  });

  it("says an item that does not exist yet will be created on save", async () => {
    await renderEditor({ item: null });

    expect(
      screen.getByText("This item does not exist yet — it is created the first time you save.")
    ).toBeInTheDocument();
    // Nothing to view publicly until it has been saved once.
    expect(screen.queryByRole("link", { name: /View/ })).not.toBeInTheDocument();
  });

  it("links an existing item to its public page", async () => {
    await renderEditor({ item: existingItem });

    expect(screen.getByRole("link", { name: /View/ })).toHaveAttribute("href", "/post/hello");
  });

  it("saves the typed values, omitting the ones left blank", async () => {
    await renderEditor({ item: null });

    let body: { slug: string; status: string; dataJson: string } | undefined;
    server.use(
      http.post(api("/api/content-types/post/items"), async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ ...existingItem, status: "Draft" });
      })
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/title/), "A new post");
    await user.click(screen.getByRole("button", { name: "Save item" }));

    await waitFor(() => expect(body).toBeDefined());

    expect(body!.slug).toBe("hello");
    expect(body!.status).toBe("Draft");
    // Only what was actually filled in. An untouched field is absent rather than sent as
    // "", which the API would reject as the wrong type for a Number or a Date.
    expect(JSON.parse(body!.dataJson)).toEqual({ title: "A new post" });
  });

  it("keeps a false checkbox and a zero, which are values rather than blanks", async () => {
    await renderEditor({ item: { ...existingItem, dataJson: JSON.stringify({ views: 0, featured: false }) } });

    let body: { dataJson: string } | undefined;
    server.use(
      http.post(api("/api/content-types/post/items"), async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(existingItem);
      })
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Save item" }));

    await waitFor(() => expect(body).toBeDefined());
    expect(JSON.parse(body!.dataJson)).toEqual({ views: 0, featured: false });
  });

  it("saves the chosen status", async () => {
    await renderEditor({ item: existingItem });

    let body: { status: string } | undefined;
    server.use(
      http.post(api("/api/content-types/post/items"), async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(existingItem);
      })
    );

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Status"), "Draft");
    await user.click(screen.getByRole("button", { name: "Save item" }));

    await waitFor(() => expect(body?.status).toBe("Draft"));
  });

  it("confirms a save", async () => {
    await renderEditor({ item: existingItem });

    server.use(
      http.post(api("/api/content-types/post/items"), () => HttpResponse.json(existingItem))
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Save item" }));

    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("shows the validation errors the API sends back", async () => {
    await renderEditor({ item: null });

    server.use(
      http.post(api("/api/content-types/post/items"), () =>
        HttpResponse.json(["'title' is required.", "'views' must be a valid Number."], { status: 400 })
      )
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Save item" }));

    // Flattened into one readable line rather than shown as a raw JSON array.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "'title' is required. 'views' must be a valid Number."
    );
  });

  it("says so when the schema is gone, since there is nothing to validate against", async () => {
    await renderEditor({ type: null });

    expect(screen.getByText("Content type not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to content types/ })).toHaveAttribute(
      "href",
      "/admin/content-types"
    );
  });

  it("says so when the type has no fields yet", async () => {
    await renderEditor({ type: { ...blogType, fields: [] }, item: null });

    expect(
      screen.getByText(/This content type has no fields yet/)
    ).toBeInTheDocument();
  });

  describe("as a Viewer", () => {
    it("disables every input and explains why saving is unavailable", async () => {
      await renderEditor({ item: existingItem }, "Viewer");

      expect(screen.getByLabelText(/title/)).toBeDisabled();
      expect(screen.getByLabelText("Status")).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Save item" })).not.toBeInTheDocument();
      expect(screen.getByText("Read-only — your role cannot save changes")).toBeInTheDocument();
    });
  });

  describe("a type with a Layout field", () => {
    const pageType = {
      id: "type-page",
      name: "Page",
      slug: "post",
      fields: [field("title", "Text"), field("layout", "Layout")],
    };

    it("hands the screen to the visual builder", async () => {
      await renderEditor({
        type: pageType,
        item: { ...existingItem, dataJson: JSON.stringify({ title: "Home", layout: { content: [], root: {} } }) },
      });

      // Puck owns the canvas; the scalar fields move into the toolbar beside it.
      expect(screen.getByLabelText("title")).toHaveValue("Home");
      expect(screen.getByLabelText("Status")).toHaveValue("Published");
      expect(screen.getByText("hello")).toBeInTheDocument();
      expect(document.querySelector(".editor__canvas")).not.toBeNull();
    });

    it("keeps a link back to the type's item list", async () => {
      await renderEditor({
        type: pageType,
        item: { ...existingItem, dataJson: JSON.stringify({ layout: { content: [], root: {} } }) },
      });

      expect(screen.getByRole("link", { name: /Page/ })).toHaveAttribute(
        "href",
        "/admin/content-types/post"
      );
    });
  });
});
