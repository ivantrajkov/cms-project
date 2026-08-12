import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import ContentListBlock from "./ContentListBlock";
import { api, server } from "../test/server";

const postType = {
  id: "type-1",
  name: "Blog post",
  slug: "post",
  fields: [
    { name: "title", type: "Text", required: true },
    { name: "views", type: "Number", required: false },
    { name: "layout", type: "Layout", required: false },
  ],
};

const item = (slug: string, title: string) => ({
  id: `item-${slug}`,
  slug,
  status: "Published",
  dataJson: JSON.stringify({ title, views: 7, layout: { content: [], root: {} } }),
  updatedAt: "2026-08-10T11:00:00Z",
});

function renderBlock(props: Partial<Parameters<typeof ContentListBlock>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ContentListBlock contentType="post" columns={2} limit={6} {...props} />
    </MemoryRouter>
  );
}

describe("ContentListBlock", () => {
  beforeEach(() => localStorage.clear());

  it("asks the API for published items only", async () => {
    let query = "";
    server.use(
      http.get(api("/api/content-types/post"), () => HttpResponse.json(postType)),
      http.get(api("/api/content-types/post/items"), ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json([item("hello", "Hello world")]);
      })
    );

    renderBlock();

    expect(await screen.findByRole("link", { name: "Hello world" })).toBeInTheDocument();
    // Filtered server-side, so a draft never reaches a visitor even briefly.
    expect(query).toContain("status=Published");
    expect(query).toContain("limit=6");
    expect(query).toContain("includeData=true");
  });

  it("renders a card per item, linking through to its own page", async () => {
    server.use(
      http.get(api("/api/content-types/post"), () => HttpResponse.json(postType)),
      http.get(api("/api/content-types/post/items"), () =>
        HttpResponse.json([item("hello", "Hello world"), item("second", "Second post")])
      )
    );

    renderBlock();

    expect(await screen.findByRole("link", { name: "Hello world" })).toHaveAttribute(
      "href",
      "/post/hello"
    );
    expect(screen.getByRole("link", { name: "Second post" })).toHaveAttribute(
      "href",
      "/post/second"
    );
  });

  it("shows the other fields but never the layout document", async () => {
    server.use(
      http.get(api("/api/content-types/post"), () => HttpResponse.json(postType)),
      http.get(api("/api/content-types/post/items"), () => HttpResponse.json([item("hello", "Hello world")]))
    );

    renderBlock();

    // The heading field becomes the card's title rather than being repeated below it, and
    // a Layout field is a whole page document — far too much for a card.
    expect(await screen.findByText(/views: 7/)).toBeInTheDocument();
    expect(screen.queryByText(/layout/)).not.toBeInTheDocument();
  });

  it("lays the cards out in the requested number of columns", async () => {
    server.use(
      http.get(api("/api/content-types/post"), () => HttpResponse.json(postType)),
      http.get(api("/api/content-types/post/items"), () => HttpResponse.json([item("hello", "Hello")]))
    );

    const { container } = renderBlock({ columns: 3 });

    await screen.findByRole("link", { name: "Hello" });
    expect(container.querySelector(".content-list")).toHaveStyle({
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    });
  });

  it("asks the author to pick a type before it can render anything", () => {
    renderBlock({ contentType: "" });

    expect(screen.getByText("Pick a content type in the right-hand panel")).toBeInTheDocument();
  });

  it("says so when the chosen type no longer exists", async () => {
    server.use(
      http.get(api("/api/content-types/post"), () => new HttpResponse(null, { status: 404 })),
      http.get(api("/api/content-types/post/items"), () => HttpResponse.json([]))
    );

    renderBlock();

    expect(await screen.findByText(/No content type/)).toBeInTheDocument();
  });

  it("says so when nothing has been published yet", async () => {
    server.use(
      http.get(api("/api/content-types/post"), () => HttpResponse.json(postType)),
      http.get(api("/api/content-types/post/items"), () => HttpResponse.json([]))
    );

    renderBlock();

    expect(await screen.findByText(/No published .*Blog post.* items yet/)).toBeInTheDocument();
  });

  it("shows the error in place of the list rather than taking the page down", async () => {
    server.use(
      http.get(api("/api/content-types/post"), () => HttpResponse.json(postType)),
      http.get(api("/api/content-types/post/items"), () => HttpResponse.text("boom", { status: 500 }))
    );

    renderBlock();

    // This block sits inside a published page; a thrown error would blank the whole page.
    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});
