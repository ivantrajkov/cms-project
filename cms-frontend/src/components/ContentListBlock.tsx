import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getContentType,
  itemLabel,
  listContentItems,
  parseFieldValues,
  type ContentItemSummary,
  type ContentType,
} from "../lib/api";
import { useFieldResolver } from "../lib/useFieldResolver";
import ContentFieldValue from "./ContentFieldValue";

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

  const lookups = useFieldResolver(loaded?.type?.fields);

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
    <div className="block">
      <div
        className="content-list"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const values = parseFieldValues(item.dataJson);

          return (
            <article className="content-card" key={item.id}>
              {/* The heading links through to the item's own page, so a card is a way in
                  rather than a dead end. */}
              <h3>
                <Link to={`/${type.slug}/${item.slug}`}>{itemLabel(type, item)}</Link>
              </h3>

              {fields
                .filter((field) => field !== headingField)
                .map((field) => (
                  <ContentFieldValue
                    key={field.name}
                    field={field}
                    value={values[field.name]}
                    lookups={lookups}
                  />
                ))}
            </article>
          );
        })}
      </div>
    </div>
  );
}

/** Stand-in shown in place of the list while it cannot be rendered. */
function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="block">
      <div className="block-placeholder">{children}</div>
    </div>
  );
}
