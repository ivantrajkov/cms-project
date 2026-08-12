import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContentTypesPage from "./ContentTypesPage";
import { renderWithRouter } from "../test/render";
import { api, server } from "../test/server";
import { signIn } from "../test/auth";
import type { Role } from "../lib/auth";

const postType = { id: "type-1", name: "Blog post", slug: "post" };
const personType = { id: "type-2", name: "Person", slug: "person" };

/** Lists the types, and answers the per-type item count each card shows. */
function listing(types: object[], counts: Record<string, unknown[]> = {}) {
  return [
    http.get(api("/api/content-types"), () => HttpResponse.json(types)),
    http.get(api("/api/content-types/:slug/items"), ({ params }) =>
      HttpResponse.json(counts[String(params.slug)] ?? [])
    ),
  ];
}

async function renderPage(types: object[] = [postType], counts: Record<string, unknown[]> = {}, role: Role = "Admin") {
  signIn({ role });
  server.use(...listing(types, counts));

  renderWithRouter(<ContentTypesPage />);

  await waitFor(() => expect(screen.queryByText("Loading content types…")).not.toBeInTheDocument());
}

describe("ContentTypesPage", () => {
  beforeEach(() => localStorage.clear());

  it("shows each type with its slug and how many items it holds", async () => {
    await renderPage([postType, personType], { post: [{}, {}], person: [] });

    expect(screen.getByRole("link", { name: "Blog post" })).toHaveAttribute(
      "href",
      "/admin/content-types/post"
    );
    expect(screen.getByText("post")).toBeInTheDocument();
    // The count is what tells an admin whether a type is safe to delete.
    expect(screen.getByText("2 items")).toBeInTheDocument();
    expect(screen.getByText("0 items")).toBeInTheDocument();
  });

  it("uses the singular for a type holding one item", async () => {
    await renderPage([postType], { post: [{}] });

    expect(screen.getByText("1 item")).toBeInTheDocument();
  });

  it("counts a type whose items cannot be listed as zero rather than failing the screen", async () => {
    signIn();
    server.use(
      http.get(api("/api/content-types"), () => HttpResponse.json([postType])),
      http.get(api("/api/content-types/post/items"), () => HttpResponse.text("boom", { status: 500 }))
    );

    renderWithRouter(<ContentTypesPage />);

    expect(await screen.findByText("0 items")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Blog post" })).toBeInTheDocument();
  });

  it("surfaces a failure to load the types themselves", async () => {
    signIn();
    server.use(http.get(api("/api/content-types"), () => HttpResponse.text("Nope.", { status: 500 })));

    renderWithRouter(<ContentTypesPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Nope.");
  });

  it("explains what a content type is when there are none", async () => {
    await renderPage([]);

    expect(screen.getByText("No content types yet")).toBeInTheDocument();
  });

  it("suggests a slug from the name until the slug is edited by hand", async () => {
    await renderPage([]);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Name"), "Blog Post");
    expect(screen.getByLabelText(/Slug/)).toHaveValue("blog-post");

    // Once touched, the slug is the user's: retyping the name must not overwrite it.
    await user.clear(screen.getByLabelText(/Slug/));
    await user.type(screen.getByLabelText(/Slug/), "article");
    await user.type(screen.getByLabelText("Name"), " Updated");

    expect(screen.getByLabelText(/Slug/)).toHaveValue("article");
  });

  it("saves a schema, dropping the rows nobody filled in", async () => {
    await renderPage([]);

    let saved: unknown;
    server.use(
      http.post(api("/api/content-types"), async ({ request }) => {
        saved = await request.json();
        return HttpResponse.json({ ...postType, fields: [] });
      }),
      ...listing([postType])
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "Blog Post");
    await user.type(screen.getByLabelText("Field 1 name"), "title");
    await user.click(screen.getByRole("checkbox"));

    // A second row is added but left blank — UI scaffolding, not a field.
    await user.click(screen.getByRole("button", { name: /Add field/ }));
    await user.click(screen.getByRole("button", { name: "Create content type" }));

    await waitFor(() =>
      expect(saved).toEqual({
        name: "Blog Post",
        slug: "blog-post",
        fields: [{ name: "title", type: "Text", required: true }],
      })
    );
  });

  it("clears the form after a successful save", async () => {
    await renderPage([]);

    server.use(
      http.post(api("/api/content-types"), () => HttpResponse.json({ ...postType, fields: [] })),
      ...listing([postType])
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "Blog Post");
    await user.type(screen.getByLabelText("Field 1 name"), "title");
    await user.click(screen.getByRole("button", { name: "Create content type" }));

    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue(""));
    expect(screen.getByLabelText(/Slug/)).toHaveValue("");
    expect(screen.getByLabelText("Field 1 name")).toHaveValue("");
  });

  it("asks what a Reference field points at, and forgets it when the type changes", async () => {
    await renderPage([postType, personType]);
    const user = userEvent.setup();

    expect(screen.queryByLabelText("Field 1 target type")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Field 1 type"), "Reference");
    const target = screen.getByLabelText("Field 1 target type");
    await user.selectOptions(target, "person");

    let saved: unknown;
    server.use(
      http.post(api("/api/content-types"), async ({ request }) => {
        saved = await request.json();
        return HttpResponse.json({ ...postType, fields: [] });
      }),
      ...listing([postType, personType])
    );

    await user.type(screen.getByLabelText("Name"), "Blog Post");
    await user.type(screen.getByLabelText("Field 1 name"), "author");
    await user.click(screen.getByRole("button", { name: "Create content type" }));

    await waitFor(() =>
      expect(saved).toMatchObject({
        fields: [{ name: "author", type: "Reference", targetType: "person" }],
      })
    );
  });

  it("drops the target when a Reference field becomes something else", async () => {
    await renderPage([postType, personType]);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("Field 1 type"), "Reference");
    await user.selectOptions(screen.getByLabelText("Field 1 target type"), "person");
    await user.selectOptions(screen.getByLabelText("Field 1 type"), "Text");

    let saved: { fields: { targetType?: string | null }[] } | undefined;
    server.use(
      http.post(api("/api/content-types"), async ({ request }) => {
        saved = (await request.json()) as typeof saved;
        return HttpResponse.json({ ...postType, fields: [] });
      }),
      ...listing([postType, personType])
    );

    await user.type(screen.getByLabelText("Name"), "Blog Post");
    await user.type(screen.getByLabelText("Field 1 name"), "title");
    await user.click(screen.getByRole("button", { name: "Create content type" }));

    // Otherwise the stored schema keeps a pointer that means nothing on a Text field.
    await waitFor(() => expect(saved!.fields[0].targetType).toBeNull());
  });

  it("adds and removes field rows, never leaving zero", async () => {
    await renderPage([]);
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: "Remove field 1" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Add field/ }));
    expect(screen.getByLabelText("Field 2 name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove field 1" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Remove field 2" }));
    expect(screen.queryByLabelText("Field 2 name")).not.toBeInTheDocument();
  });

  it("reports why a schema was rejected", async () => {
    await renderPage([]);

    server.use(
      http.post(api("/api/content-types"), () =>
        HttpResponse.text("Duplicate field name 'title'.", { status: 400 })
      )
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "Blog Post");
    await user.click(screen.getByRole("button", { name: "Create content type" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Duplicate field name 'title'.");
  });

  it("deletes a type once the confirmation is accepted", async () => {
    await renderPage([postType]);
    vi.stubGlobal("confirm", vi.fn(() => true));

    server.use(
      http.delete(api("/api/content-types/post"), () => new HttpResponse(null, { status: 204 })),
      ...listing([])
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Delete Blog post" }));

    expect(await screen.findByText("No content types yet")).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("explains why a type still in use cannot be deleted", async () => {
    await renderPage([postType], { post: [{}] });
    vi.stubGlobal("confirm", vi.fn(() => true));

    server.use(
      http.delete(api("/api/content-types/post"), () =>
        HttpResponse.text("Cannot delete a content type that still has items.", { status: 400 })
      )
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Delete Blog post" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("still has items");

    vi.unstubAllGlobals();
  });

  it.each(["Editor", "Viewer"] as const)("tells a %s that schemas are Admin-only", async (role) => {
    await renderPage([postType], {}, role);

    // Schema changes affect every existing item, so the form is not merely disabled —
    // it is not offered, and the reason is stated.
    expect(screen.getByText("Only an Admin can change schemas")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Blog post" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Blog post" })).toBeInTheDocument();
  });
});
