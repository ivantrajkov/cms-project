import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ContentFieldValue from "./ContentFieldValue";
import { renderWithRouter } from "../test/render";
import type { FieldDefinition, MediaAsset } from "../lib/api";
import type { ResolvedLookups } from "../lib/useFieldResolver";

const asset: MediaAsset = {
  id: "media-1",
  fileName: "hero.png",
  originalFileName: "hero.png",
  url: "http://localhost:5051/uploads/hero.png",
  contentType: "image/png",
  sizeBytes: 1024,
  altText: "A wide landscape",
  uploadedAt: "2026-08-10T12:00:00Z",
};

function lookups(overrides: Partial<ResolvedLookups> = {}): ResolvedLookups {
  return {
    media: new Map([[asset.id, asset]]),
    references: new Map([
      ["item-1", { label: "Ada Lovelace", typeSlug: "person", slug: "ada" }],
    ]),
    ready: true,
    ...overrides,
  };
}

const field = (name: string, type: FieldDefinition["type"]): FieldDefinition => ({
  name,
  type,
  required: false,
});

function renderValue(f: FieldDefinition, value: unknown, detail = false) {
  return renderWithRouter(
    <ContentFieldValue field={f} value={value} lookups={lookups()} detail={detail} />
  );
}

describe("ContentFieldValue", () => {
  it.each([undefined, null, ""])("renders nothing for an empty value (%s)", (value) => {
    const { container } = renderValue(field("title", "Text"), value);

    expect(container).toBeEmptyDOMElement();
  });

  describe("Image", () => {
    it("resolves the id into the asset's URL and alt text", () => {
      renderValue(field("hero", "Image"), asset.id);

      const image = screen.getByRole("img", { name: "A wide landscape" });
      expect(image).toHaveAttribute("src", asset.url);
    });

    it("falls back to the field name when the asset has no alt text", () => {
      renderWithRouter(
        <ContentFieldValue
          field={field("hero", "Image")}
          value={asset.id}
          lookups={lookups({ media: new Map([[asset.id, { ...asset, altText: "" }]]) })}
        />
      );

      expect(screen.getByRole("img", { name: "hero" })).toBeInTheDocument();
    });

    it("renders nothing for an id that resolved to nothing", () => {
      // A broken image icon on a published page is worse than the image simply being absent.
      const { container } = renderValue(field("hero", "Image"), "media-missing");

      expect(container).toBeEmptyDOMElement();
    });

    it("is shown larger on a detail page", () => {
      renderValue(field("hero", "Image"), asset.id, true);

      expect(screen.getByRole("img")).toHaveStyle({ maxWidth: "640px" });
    });
  });

  describe("Reference", () => {
    it("links to the referenced item by its label", () => {
      renderValue(field("author", "Reference"), "item-1");

      const link = screen.getByRole("link", { name: "Ada Lovelace" });
      expect(link).toHaveAttribute("href", "/person/ada");
    });

    it("shows a placeholder when the id could not be resolved", () => {
      renderValue(field("author", "Reference"), "item-missing");

      // Named rather than blank, so it is clear the field exists and its target is gone.
      expect(screen.getByText(/author: —/)).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
  });

  describe("Boolean", () => {
    it("shows a badge only when the flag is set", () => {
      renderValue(field("featured", "Boolean"), true);

      expect(screen.getByText("featured")).toBeInTheDocument();
    });

    it("renders nothing when the flag is off", () => {
      // A list of "featured: no" badges is noise on every card that lacks the flag.
      const { container } = renderValue(field("featured", "Boolean"), false);

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("Date", () => {
    it("formats a parseable date for reading", () => {
      renderValue(field("publishedOn", "Date"), "2026-08-10T12:00:00Z");

      expect(
        screen.getByText(new Date("2026-08-10T12:00:00Z").toLocaleDateString())
      ).toBeInTheDocument();
    });

    it("shows the raw value when it cannot be parsed", () => {
      renderValue(field("publishedOn", "Date"), "sometime in August");

      expect(screen.getByText("sometime in August")).toBeInTheDocument();
    });
  });

  it("labels a number with its field name", () => {
    renderValue(field("views", "Number"), 42);

    expect(screen.getByText(/views: 42/)).toBeInTheDocument();
  });

  describe("Text", () => {
    it("renders plain text as a paragraph", () => {
      renderValue(field("title", "Text"), "Hello world");

      expect(screen.getByText("Hello world")).toBeInTheDocument();
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it.each([
      "http://example.com/a.png",
      "https://example.com/a.JPEG",
      "https://example.com/a.webp?v=2",
      "http://localhost:5051/uploads/abc",
    ])("renders %s as an image, for text fields written before Image existed", (value) => {
      renderValue(field("legacyHero", "Text"), value);

      expect(screen.getByRole("img", { name: "legacyHero" })).toHaveAttribute("src", value);
    });

    it.each([
      "not a url at all",
      "https://example.com/page.html",
      "/uploads/relative.png",
    ])("keeps %s as text", (value) => {
      renderValue(field("title", "Text"), value);

      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      expect(screen.getByText(value)).toBeInTheDocument();
    });
  });
});
