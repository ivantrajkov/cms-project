import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import LivePage from "./LivePage";
import { api, server } from "../test/server";

const pageType = {
  id: "type-page",
  name: "Page",
  slug: "page",
  fields: [{ name: "layout", type: "Layout", required: false }],
};

const layout = {
  content: [
    {
      type: "HeroBanner",
      props: { id: "hero-1", title: "Welcome aboard", subtitle: "Built with the page builder." },
    },
  ],
  root: {},
};

function item(status: string, data: unknown = { layout }) {
  return {
    id: "item-1",
    slug: "about",
    status,
    dataJson: JSON.stringify(data),
    updatedAt: "2026-08-10T11:00:00Z",
  };
}

function renderPage(path = "/about") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:slug" element={<LivePage />} />
      </Routes>
    </MemoryRouter>
  );
}

const waitForLoadingToFinish = () =>
  waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());

describe("LivePage", () => {
  beforeEach(() => localStorage.clear());

  it("renders the authored layout of a published page", async () => {
    server.use(
      http.get(api("/api/content-types/page"), () => HttpResponse.json(pageType)),
      http.get(api("/api/content-types/page/items/about"), () => HttpResponse.json(item("Published")))
    );

    renderPage();

    expect(await screen.findByText("Welcome aboard")).toBeInTheDocument();
  });

  it("keeps a draft off the public site and points the editor at it", async () => {
    server.use(
      http.get(api("/api/content-types/page"), () => HttpResponse.json(pageType)),
      http.get(api("/api/content-types/page/items/about"), () => HttpResponse.json(item("Draft")))
    );

    renderPage();

    // Only a signed-in caller gets a draft back at all; when one does, it still must not
    // render as though it were live.
    expect(await screen.findByText("/about is still a draft")).toBeInTheDocument();
    expect(screen.queryByText("Welcome aboard")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open in the editor/ })).toHaveAttribute(
      "href",
      "/admin/content-types/page/items/about"
    );
  });

  it("offers to create a page that does not exist", async () => {
    server.use(
      http.get(api("/api/content-types/page"), () => HttpResponse.json(pageType)),
      http.get(api("/api/content-types/page/items/about"), () => new HttpResponse(null, { status: 404 }))
    );

    renderPage();

    expect(await screen.findByText("No page exists at /about")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create this page/ })).toHaveAttribute(
      "href",
      "/admin/content-types/page/items/about"
    );
  });

  it("renders an empty document rather than failing when the layout is unusable", async () => {
    server.use(
      http.get(api("/api/content-types/page"), () => HttpResponse.json(pageType)),
      http.get(api("/api/content-types/page/items/about"), () =>
        HttpResponse.json(item("Published", { layout: "not a layout" }))
      )
    );

    renderPage();

    // The page renders empty rather than throwing: data written by an older schema must
    // not take the public site down.
    await waitForLoadingToFinish();
    expect(screen.queryByText("Welcome aboard")).not.toBeInTheDocument();
    expect(screen.queryByText(/still a draft|No page exists/)).not.toBeInTheDocument();
  });

  it("shows a loading state until the page resolves", () => {
    server.use(
      http.get(api("/api/content-types/page"), () => HttpResponse.json(pageType)),
      http.get(api("/api/content-types/page/items/about"), () => HttpResponse.json(item("Published")))
    );

    renderPage();

    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
