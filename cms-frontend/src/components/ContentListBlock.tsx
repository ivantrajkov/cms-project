import { useEffect, useState } from "react";
import {
  getContentType,
  listContentItems,
  parseFieldValues,
  type ContentItemSummary,
  type ContentType,
  type FieldDefinition,
} from "../lib/api";

interface Props {
  contentType: string;
  columns: number;
  limit: number;
}

interface Loaded {
  /** Which content type this data was fetched for, so a stale result is never shown. */
  for: string;
  type: ContentType | null;
  items: ContentItemSummary[];
  error: string;
}

/**
 * Renders published items of a chosen content type. This is what connects structured
 * content to the visual page builder: without it, content items can be authored and
 * stored but never reach a visitor.
 */
export default function ContentListBlock({ contentType, columns, limit }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!contentType) return;

    (async () => {
      try {
        // Drafts are excluded server-side so unpublished content never reaches the page.
        const [type, items] = await Promise.all([
          getContentType(contentType),
          listContentItems(contentType, {
            includeData: true,
            status: "Published",
            limit,
          }),
        ]);
        if (!cancelled) setLoaded({ for: contentType, type, items, error: "" });
      } catch (err) {
        if (!cancelled) {
          setLoaded({
            for: contentType,
            type: null,
            items: [],
            error: err instanceof Error ? err.message : "Failed to load content",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contentType, limit]);

  if (!contentType) return <Placeholder>Pick a content type in the right-hand panel</Placeholder>;
  if (!loaded || loaded.for !== contentType) return <Placeholder>Loading…</Placeholder>;
  if (loaded.error) return <Placeholder>{loaded.error}</Placeholder>;
  if (!loaded.type) return <Placeholder>No content type “{contentType}”</Placeholder>;

  const { type, items } = loaded;

  if (items.length === 0) {
    return <Placeholder>No published “{type.name}” items yet</Placeholder>;
  }

  // A Layout field is a whole page document — far too much to show inside a card.
  const fields = type.fields.filter((f) => f.type !== "Layout");
  const headingField = fields.find((f) => f.type === "Text");

  return (
    <div style={{ padding: "16px 24px", maxWidth: 960, margin: "0 auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: 16,
          alignItems: "start",
        }}
      >
        {items.map((item) => {
          const values = parseFieldValues(item.dataJson);

          return (
            <article
              key={item.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 16,
                display: "grid",
                gap: 8,
              }}
            >
              {headingField && (
                <h3 style={{ margin: 0, fontSize: "1.1rem" }}>
                  {String(values[headingField.name] ?? item.slug)}
                </h3>
              )}

              {fields
                .filter((field) => field !== headingField)
                .map((field) => (
                  <FieldValue key={field.name} field={field} value={values[field.name]} />
                ))}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "16px 24px", maxWidth: 960, margin: "0 auto" }}>
      <div
        style={{
          padding: 40,
          border: "2px dashed #d1d5db",
          borderRadius: 8,
          color: "#9ca3af",
          textAlign: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** True for a URL that points at an image, so photo fields render as pictures. */
function looksLikeImage(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  return /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(value) || value.includes("/uploads/");
}

function FieldValue({ field, value }: { field: FieldDefinition; value: unknown }) {
  if (value === undefined || value === null || value === "") return null;

  switch (field.type) {
    case "Boolean":
      // A false flag is noise in a card; only surface the ones that are set.
      return value === true ? (
        <span
          style={{
            justifySelf: "start",
            fontSize: 12,
            padding: "2px 8px",
            borderRadius: 999,
            background: "#dbeafe",
            color: "#1e40af",
          }}
        >
          {field.name}
        </span>
      ) : null;

    case "Date": {
      const parsed = new Date(String(value));
      const text = Number.isNaN(parsed.getTime())
        ? String(value)
        : parsed.toLocaleDateString();
      return <small style={{ color: "#6b7280" }}>{text}</small>;
    }

    case "Number":
      return (
        <small style={{ color: "#6b7280" }}>
          {field.name}: {String(value)}
        </small>
      );

    default: {
      const text = String(value);
      if (looksLikeImage(text)) {
        return (
          <img
            src={text}
            alt={field.name}
            style={{ width: "100%", height: "auto", borderRadius: 6 }}
          />
        );
      }
      return <p style={{ margin: 0, lineHeight: 1.5 }}>{text}</p>;
    }
  }
}
