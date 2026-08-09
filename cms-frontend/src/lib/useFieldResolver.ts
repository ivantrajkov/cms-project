import { useEffect, useState } from "react";
import {
  getContentType,
  itemLabel,
  listContentItems,
  listMedia,
  type FieldDefinition,
  type MediaAsset,
} from "./api";

export interface ResolvedReference {
  label: string;
  typeSlug: string;
  slug: string;
}

export interface ResolvedLookups {
  media: Map<string, MediaAsset>;
  references: Map<string, ResolvedReference>;
  ready: boolean;
}

/**
 * Image and Reference fields store ids, so anything displaying them needs to turn those
 * ids into a URL or a label. This fetches the media library once and the items of each
 * referenced content type once — one request per referenced type, not per item — and
 * returns lookup tables keyed by id.
 *
 * Server-side expansion would avoid these extra round trips and is the obvious next step
 * if the content set grows.
 */
export function useFieldResolver(fields: FieldDefinition[] | undefined): ResolvedLookups {
  const [media, setMedia] = useState<Map<string, MediaAsset>>(new Map());
  const [references, setReferences] = useState<Map<string, ResolvedReference>>(new Map());
  const [ready, setReady] = useState(false);

  const needsMedia = (fields ?? []).some((f) => f.type === "Image");
  const targetTypes = [
    ...new Set(
      (fields ?? [])
        .filter((f) => f.type === "Reference" && f.targetType)
        .map((f) => f.targetType as string)
    ),
  ];

  // A primitive key, so the effect re-runs when the actual requirements change rather than
  // on every render that rebuilds the fields array.
  const requirementKey = `${needsMedia}|${targetTypes.join(",")}`;

  useEffect(() => {
    let cancelled = false;
    const [needsMediaFlag, targets] = requirementKey.split("|");
    const wantMedia = needsMediaFlag === "true";
    const types = targets ? targets.split(",").filter(Boolean) : [];

    (async () => {
      try {
        if (wantMedia) {
          const assets = await listMedia();
          if (cancelled) return;
          setMedia(new Map(assets.map((a) => [a.id, a])));
        }

        if (types.length > 0) {
          const resolved = new Map<string, ResolvedReference>();

          for (const typeSlug of types) {
            const [type, items] = await Promise.all([
              getContentType(typeSlug),
              listContentItems(typeSlug, { includeData: true }),
            ]);
            if (cancelled) return;

            for (const item of items) {
              resolved.set(item.id, {
                label: itemLabel(type, item),
                typeSlug,
                slug: item.slug,
              });
            }
          }

          if (!cancelled) setReferences(resolved);
        }
      } catch {
        // Resolution is best-effort: an unresolved id renders as a fallback rather than
        // taking down the whole page.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requirementKey]);

  return { media, references, ready };
}
