import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFieldResolver } from "./useFieldResolver";
import { api, server } from "../test/server";
import type { FieldDefinition } from "./api";

const field = (
  name: string,
  type: FieldDefinition["type"],
  targetType?: string
): FieldDefinition => ({ name, type, required: false, targetType });

const asset = {
  id: "media-1",
  fileName: "hero.png",
  originalFileName: "hero.png",
  url: "http://localhost:5051/uploads/hero.png",
  contentType: "image/png",
  sizeBytes: 10,
  altText: "Hero",
  uploadedAt: "2026-08-10T12:00:00Z",
};

function personType() {
  return {
    id: "type-person",
    name: "Person",
    slug: "person",
    fields: [{ name: "fullName", type: "Text", required: true }],
  };
}

describe("useFieldResolver", () => {
  beforeEach(() => localStorage.clear());

  it("does nothing when no field needs resolving", async () => {
    // Nothing is mocked, so an unnecessary request would fail the test outright.
    const { result } = renderHook(() => useFieldResolver([field("title", "Text")]));

    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.media.size).toBe(0);
    expect(result.current.references.size).toBe(0);
  });

  it("loads the media library when an Image field is present", async () => {
    server.use(http.get(api("/api/media"), () => HttpResponse.json([asset])));

    const { result } = renderHook(() => useFieldResolver([field("hero", "Image")]));

    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.media.get("media-1")?.url).toBe(asset.url);
  });

  it("resolves references to a label, type and slug", async () => {
    server.use(
      http.get(api("/api/content-types/person"), () => HttpResponse.json(personType())),
      http.get(api("/api/content-types/person/items"), () =>
        HttpResponse.json([
          { id: "item-1", slug: "ada", status: "Published", dataJson: '{"fullName":"Ada Lovelace"}', updatedAt: "" },
        ])
      )
    );

    const { result } = renderHook(() => useFieldResolver([field("author", "Reference", "person")]));

    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.references.get("item-1")).toEqual({
      label: "Ada Lovelace",
      typeSlug: "person",
      slug: "ada",
    });
  });

  it("fetches each referenced type once, not once per item", async () => {
    let itemRequests = 0;

    server.use(
      http.get(api("/api/content-types/person"), () => HttpResponse.json(personType())),
      http.get(api("/api/content-types/person/items"), () => {
        itemRequests += 1;
        return HttpResponse.json([
          { id: "item-1", slug: "ada", status: "Published", dataJson: "{}", updatedAt: "" },
          { id: "item-2", slug: "grace", status: "Published", dataJson: "{}", updatedAt: "" },
        ]);
      })
    );

    // Two fields pointing at the same type must not double the round trips.
    const { result } = renderHook(() =>
      useFieldResolver([field("author", "Reference", "person"), field("editor", "Reference", "person")])
    );

    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(itemRequests).toBe(1);
    expect(result.current.references.size).toBe(2);
  });

  it("stays ready when resolution fails", async () => {
    // Best-effort: an unresolved id renders as a fallback rather than taking down the page.
    server.use(http.get(api("/api/media"), () => HttpResponse.text("boom", { status: 500 })));

    const { result } = renderHook(() => useFieldResolver([field("hero", "Image")]));

    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.media.size).toBe(0);
  });

  it("copes with no fields at all", async () => {
    const { result } = renderHook(() => useFieldResolver(undefined));

    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.references.size).toBe(0);
  });

  it("does not refetch when the fields array is rebuilt with the same requirements", async () => {
    const media = vi.fn(() => HttpResponse.json([asset]));
    server.use(http.get(api("/api/media"), media));

    // A new array identity on every render must not restart the requests.
    const { result, rerender } = renderHook(() => useFieldResolver([field("hero", "Image")]));

    await waitFor(() => expect(result.current.ready).toBe(true));
    const callsAfterFirstLoad = media.mock.calls.length;

    rerender();
    rerender();

    expect(media.mock.calls.length).toBe(callsAfterFirstLoad);
  });
});
