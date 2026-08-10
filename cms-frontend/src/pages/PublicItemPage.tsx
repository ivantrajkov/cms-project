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
import Loading from "../components/Loading";
import NotFound from "../components/NotFound";
import Icon from "../components/Icon";

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

  if (!loaded || loaded.for !== key) return <Loading />;

  const { type, item } = loaded;

  if (!type || !item) {
    return (
      <NotFound
        code="404 — not found"
        title="Nothing published here"
        text={`No published item at /${typeSlug}/${itemSlug}.`}
        action={{ to: "/", label: "Go to the dashboard" }}
      />
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
    <article className="public">
      <span className="eyebrow">{type.name}</span>
      <h1>{itemLabel(type, item)}</h1>

      <div className="public__body">
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

      <footer className="public__footer">
        <Link to="/" className="btn btn--secondary btn--sm">
          <Icon name="arrowLeft" size={15} />
          Home
        </Link>
      </footer>
    </article>
  );
}
