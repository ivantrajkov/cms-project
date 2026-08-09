import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Render, type Data } from "@measured/puck";
import "@measured/puck/puck.css";
import { config } from "../puck.config";
import {
  getContentItem,
  getContentType,
  itemLabel,
  parseFieldValues,
  toPuckData,
  type ContentItem,
  type ContentType,
} from "../lib/api";
import { useFieldResolver } from "../lib/useFieldResolver";
import ContentFieldValue from "../components/ContentFieldValue";
import { ui } from "../lib/ui";

interface Loaded {
  /** "typeSlug/itemSlug" this data belongs to, so a stale render is never shown. */
  for: string;
  type: ContentType | null;
  item: ContentItem | null;
}

/**
 * Public detail page at /:typeSlug/:itemSlug — the counterpart to LivePage, but for any
 * content type rather than just pages. Without it, non-page content could be listed on a
 * page but never opened.
 *
 * Drafts need no special handling here: the API returns 404 for unpublished items to
 * anonymous callers, so an unpublished item simply reads as not found.
 */
export default function PublicItemPage() {
  const { typeSlug = "", itemSlug = "" } = useParams();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const key = `${typeSlug}/${itemSlug}`;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [type, item] = await Promise.all([
          getContentType(typeSlug),
          getContentItem(typeSlug, itemSlug),
        ]);
        if (!cancelled) setLoaded({ for: `${typeSlug}/${itemSlug}`, type, item });
      } catch {
        if (!cancelled) setLoaded({ for: `${typeSlug}/${itemSlug}`, type: null, item: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [typeSlug, itemSlug]);

  const lookups = useFieldResolver(loaded?.type?.fields);

  if (!loaded || loaded.for !== key) return <p style={{ padding: 24 }}>Loading…</p>;

  const { type, item } = loaded;

  if (!type || !item) {
    return (
      <div style={{ padding: 24 }}>
        <h1>404 — not found</h1>
        <p>
          Nothing published at <code>/{typeSlug}/{itemSlug}</code>.
        </p>
      </div>
    );
  }

  const values = parseFieldValues(item.dataJson);
  const layoutField = type.fields.find((f) => f.type === "Layout");

  // A type with a Layout field carries its own page design; render it as authored.
  if (layoutField) {
    return <Render config={config} data={toPuckData(values[layoutField.name]) as Data} />;
  }

  const fields = type.fields.filter((f) => f.type !== "Layout");
  const headingField = fields.find((f) => f.type === "Text");

  return (
    <article style={ui.page}>
      <p style={ui.muted}>{type.name}</p>
      <h1 style={{ marginTop: 0 }}>{itemLabel(type, item)}</h1>

      <div style={{ display: "grid", gap: 12 }}>
        {fields
          .filter((field) => field !== headingField)
          .map((field) => (
            <ContentFieldValue
              key={field.name}
              field={field}
              value={values[field.name]}
              lookups={lookups}
              detail
            />
          ))}
      </div>

      <p style={{ marginTop: 32 }}>
        <Link to="/" style={ui.muted}>
          ← Home
        </Link>
      </p>
    </article>
  );
}
