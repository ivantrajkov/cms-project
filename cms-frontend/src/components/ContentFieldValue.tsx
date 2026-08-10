import { Link } from "react-router-dom";
import type { FieldDefinition } from "../lib/api";
import type { ResolvedLookups } from "../lib/useFieldResolver";

interface Props {
  field: FieldDefinition;
  value: unknown;
  lookups: ResolvedLookups;
  /** Larger presentation for a detail page; cards use the compact default. */
  detail?: boolean;
}

/** True for a URL that points at an image, so legacy Text fields holding a URL still render. */
function looksLikeImage(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  return /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(value) || value.includes("/uploads/");
}

/**
 * Renders one field's value, shared by the Content List block and the public detail page so
 * the two never drift apart on how a given field type looks.
 */
export default function ContentFieldValue({ field, value, lookups, detail }: Props) {
  if (value === undefined || value === null || value === "") return null;

  switch (field.type) {
    case "Image": {
      const asset = lookups.media.get(String(value));
      if (!asset) return null;
      return (
        <img
          className="content-image"
          src={asset.url}
          alt={asset.altText || field.name}
          style={{ maxWidth: detail ? 640 : undefined }}
        />
      );
    }

    case "Reference": {
      const target = lookups.references.get(String(value));
      if (!target) return <small className="muted">{field.name}: —</small>;
      return (
        <small className="muted">
          {field.name}: <Link to={`/${target.typeSlug}/${target.slug}`}>{target.label}</Link>
        </small>
      );
    }

    case "Boolean":
      // A false flag is noise; only surface the ones that are set.
      return value === true ? (
        <span className="badge badge--brand" style={{ justifySelf: "start" }}>
          {field.name}
        </span>
      ) : null;

    case "Date": {
      const parsed = new Date(String(value));
      const text = Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString();
      return <small className="muted">{text}</small>;
    }

    case "Number":
      return (
        <small className="muted">
          {field.name}: {String(value)}
        </small>
      );

    default: {
      const text = String(value);
      if (looksLikeImage(text)) {
        return (
          <img
            className="content-image"
            src={text}
            alt={field.name}
            style={{ maxWidth: detail ? 640 : undefined }}
          />
        );
      }
      return <p className="content-text">{text}</p>;
    }
  }
}
