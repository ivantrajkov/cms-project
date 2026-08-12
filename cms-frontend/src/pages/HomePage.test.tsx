import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import HomePage from "./HomePage";
import { renderWithRouter } from "../test/render";
import { api, server } from "../test/server";
import { signIn } from "../test/auth";
import type { Role } from "../lib/auth";

const about = {
  id: "page-1",
  slug: "about",
  status: "Published",
  dataJson: null,
  updatedAt: "2026-08-10T11:59:00Z",
};

const pricing = {
  id: "page-2",
  slug: "pricing",
  status: "Draft",
  dataJson: null,
  updatedAt: "2026-08-09T11:00:00Z",
};

function handlers({ pages = [about, pricing] as object[], types = [{}] as object[], media = [{}] as object[] } = {}) {
  return [
    http.get(api("/api/content-types/page/items"), () => HttpResponse.json(pages)),
    http.get(api("/api/content-types"), () => HttpResponse.json(types)),
    http.get(api("/api/media"), () => HttpResponse.json(media)),
  ];
}

async function renderPage(options: Parameters<typeof handlers>[0] = {}, role: Role = "Admin") {
  signIn({ role });
  server.use(...handlers(options));

  renderWithRouter(<HomePage />);

  await waitFor(() => expect(screen.queryByText("Loading dashboard…")).not.toBeInTheDocument());
}

/**
 * The sidebar repeats several of these words ("Pages", "Media", "Content types") and the
 * new-page hint contains a literal "/about", so both helpers scope their search rather
 * than searching the whole screen.
 */
const rowFor = (slug: string) =>
  screen
    .getAllByRole("listitem")
    .find((item) => within(item).queryByRole("link", { name: `/${slug}` }))!;

const stat = (label: string) =>
  within(document.querySelector(".stat-grid") as HTMLElement)
    .getByText(label)
    .closest(".stat") as HTMLElement;

describe("HomePage", () => {
  beforeEach(() => localStorage.clear());

  it("lists the pages, most recently edited first", async () => {
    await renderPage();

    const titles = screen.getAllByRole("link", { name: /^\/(about|pricing)$/ });

    expect(titles[0]).toHaveTextContent("/about");
    expect(within(rowFor("about")).getByText("Published")).toBeInTheDocument();
    expect(within(rowFor("pricing")).getByText("Draft")).toBeInTheDocument();
  });

  it("summarises what the CMS holds", async () => {
    await renderPage({ pages: [about, pricing], types: [{}, {}, {}], media: [{}, {}] });

    expect(within(stat("Pages")).getByText("2")).toBeInTheDocument();
    expect(within(stat("Published")).getByText("1")).toBeInTheDocument();
    expect(within(stat("Drafts")).getByText("1")).toBeInTheDocument();
    expect(within(stat("Content types")).getByText("3")).toBeInTheDocument();
    expect(within(stat("Media")).getByText("2")).toBeInTheDocument();
  });

  it("links the counts to the screens that own them", async () => {
    await renderPage();

    expect(stat("Content types")).toHaveAttribute("href", "/admin/content-types");
    expect(stat("Media")).toHaveAttribute("href", "/admin/media");
  });

  it("keeps the page list usable when only the secondary counts fail", async () => {
    signIn();
    server.use(
      http.get(api("/api/content-types/page/items"), () => HttpResponse.json([about])),
      http.get(api("/api/content-types"), () => HttpResponse.text("boom", { status: 500 })),
      http.get(api("/api/media"), () => HttpResponse.text("boom", { status: 500 }))
    );

    renderWithRouter(<HomePage />);

    expect(await screen.findByRole("link", { name: "/about" })).toBeInTheDocument();
    // An em dash rather than 0: the count is unknown, which is not the same as none.
    expect(within(stat("Content types")).getByText("—")).toBeInTheDocument();
    expect(within(stat("Media")).getByText("—")).toBeInTheDocument();
  });

  it("reports a failure to load the pages themselves", async () => {
    signIn();
    server.use(
      http.get(api("/api/content-types/page/items"), () => HttpResponse.text("Nope.", { status: 500 })),
      http.get(api("/api/content-types"), () => HttpResponse.json([])),
      http.get(api("/api/media"), () => HttpResponse.json([]))
    );

    renderWithRouter(<HomePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Nope.");
  });

  it("links each page to its editor and to its live URL", async () => {
    await renderPage();

    const row = within(rowFor("about"));

    expect(row.getByRole("link", { name: /Edit/ })).toHaveAttribute(
      "href",
      "/admin/content-types/page/items/about"
    );
    expect(row.getByRole("link", { name: /View/ })).toHaveAttribute("href", "/about");
  });

  it("invites the first page when there are none", async () => {
    await renderPage({ pages: [] });

    expect(screen.getByText("No pages yet")).toBeInTheDocument();
  });

  it("slugifies a typed page name before opening the editor", async () => {
    await renderPage({ pages: [] });

    await userEvent.setup().type(screen.getByLabelText("New page slug"), "About Us");

    expect(screen.getByRole("link", { name: /Open editor/ })).toHaveAttribute(
      "href",
      "/admin/content-types/page/items/about-us"
    );
    expect(screen.getByText("/about-us")).toBeInTheDocument();
  });

  it("offers a Viewer reading but no creating", async () => {
    await renderPage({}, "Viewer");

    expect(screen.queryByLabelText("New page slug")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New page/ })).not.toBeInTheDocument();
    expect(within(rowFor("about")).getByRole("link", { name: /Open/ })).toBeInTheDocument();
  });
});
