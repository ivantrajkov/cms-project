import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import PublicItemPage from "./PublicItemPage";
import { api, server } from "../test/server";

const personType = {
  id: "type-1",
  name: "Person",
  slug: "person",
  fields: [
    { name: "fullName", type: "Text", required: true },
    { name: "bio", type: "Text", required: false },
    { name: "portrait", type: "Image", required: false },
  ],
};

const ada = {
  id: "item-1",
  slug: "ada",
  status: "Published",
  dataJson: JSON.stringify({ fullName: "Ada Lovelace", bio: "Wrote the first algorithm." }),
  updatedAt: "2026-08-10T11:00:00Z",
};

function renderPage(path = "/person/ada") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:typeSlug/:itemSlug" element={<PublicItemPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PublicItemPage", () => {
  beforeEach(() => localStorage.clear());

  it("renders the item's fields under its own heading", async () => {
    server.use(
      http.get(api("/api/content-types/person"), () => HttpResponse.json(personType)),
      http.get(api("/api/content-types/person/items/ada"), () => HttpResponse.json(ada)),
      http.get(api("/api/media"), () => HttpResponse.json([]))
    );

    renderPage();

    // The first Text field names the item; it is the heading rather than another line
    // of body text repeating what the title already says.
    expect(await screen.findByRole("heading", { level: 1, name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.getByText("Person")).toBeInTheDocument();
    expect(screen.getByText("Wrote the first algorithm.")).toBeInTheDocument();
  });

  it("resolves an Image field into the uploaded picture", async () => {
    const asset = {
      id: "media-1",
      fileName: "ada.png",
      originalFileName: "ada.png",
      url: "http://localhost:5051/uploads/ada.png",
      contentType: "image/png",
      sizeBytes: 10,
      altText: "Ada at her desk",
      uploadedAt: "2026-08-10T11:00:00Z",
    };

    server.use(
      http.get(api("/api/content-types/person"), () => HttpResponse.json(personType)),
      http.get(api("/api/content-types/person/items/ada"), () =>
        HttpResponse.json({
          ...ada,
          dataJson: JSON.stringify({ fullName: "Ada Lovelace", portrait: "media-1" }),
        })
      ),
      http.get(api("/api/media"), () => HttpResponse.json([asset]))
    );

    renderPage();

    expect(await screen.findByRole("img", { name: "Ada at her desk" })).toHaveAttribute(
      "src",
      asset.url
    );
  });

  it("reads an unpublished item as simply not found", async () => {
    // The API answers 404 rather than 403 for a draft, so a visitor is never told that
    // something exists at this URL — and this screen needs no draft handling of its own.
    server.use(
      http.get(api("/api/content-types/person"), () => HttpResponse.json(personType)),
      http.get(api("/api/content-types/person/items/ada"), () => new HttpResponse(null, { status: 404 })),
      http.get(api("/api/media"), () => HttpResponse.json([]))
    );

    renderPage();

    expect(await screen.findByText("Nothing published here")).toBeInTheDocument();
    expect(screen.getByText("No published item at /person/ada.")).toBeInTheDocument();
  });

  it("offers a way onward from a dead end", async () => {
    server.use(
      http.get(api("/api/content-types/ghost"), () => new HttpResponse(null, { status: 404 })),
      http.get(api("/api/content-types/ghost/items/nothing"), () => new HttpResponse(null, { status: 404 }))
    );

    renderPage("/ghost/nothing");

    expect(await screen.findByRole("link", { name: /Go to the dashboard/ })).toHaveAttribute(
      "href",
      "/"
    );
  });

  it("shows the not-found screen rather than crashing when the request fails", async () => {
    server.use(
      http.get(api("/api/content-types/person"), () => HttpResponse.text("boom", { status: 500 })),
      http.get(api("/api/content-types/person/items/ada"), () => HttpResponse.json(ada))
    );

    renderPage();

    expect(await screen.findByText("Nothing published here")).toBeInTheDocument();
  });

  it("shows a loading state until both requests answer", () => {
    server.use(
      http.get(api("/api/content-types/person"), () => HttpResponse.json(personType)),
      http.get(api("/api/content-types/person/items/ada"), () => HttpResponse.json(ada)),
      http.get(api("/api/media"), () => HttpResponse.json([]))
    );

    renderPage();

    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
