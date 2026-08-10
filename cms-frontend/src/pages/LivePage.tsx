import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Render, type Data } from "@measured/puck";
import "@measured/puck/puck.css";
import { config } from "../puck.config";
import {
  getContentItem,
  getContentType,
  PAGE_TYPE_SLUG,
  parseFieldValues,
  toPuckData,
} from "../lib/api";
import Loading from "../components/Loading";
import NotFound from "../components/NotFound";

type LoadState =
  | { status: "loading" }
  | { status: "notfound"; slug: string }
  | { status: "draft"; slug: string }
  | { status: "ready"; slug: string; data: Data };

/**
 * Public read-only page at /:slug
 * Renders the Layout field of a published "page" content item via Puck's <Render />.
 */
export default function LivePage() {
  const { slug = "" } = useParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // The type is fetched alongside the item so the Layout field is located by its
      // schema rather than by assuming it is named "layout".
      const [pageType, item] = await Promise.all([
        getContentType(PAGE_TYPE_SLUG),
        getContentItem(PAGE_TYPE_SLUG, slug),
      ]);
      if (cancelled) return;

      if (!item || !pageType) {
        setState({ status: "notfound", slug });
        return;
      }

      // Draft content is not part of the public site.
      if (item.status !== "Published") {
        setState({ status: "draft", slug });
        return;
      }

      const layoutField = pageType.fields.find((f) => f.type === "Layout");
      const values = parseFieldValues(item.dataJson);

      setState({
        status: "ready",
        slug,
        data: toPuckData(layoutField ? values[layoutField.name] : undefined),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const editLink = `/admin/content-types/${PAGE_TYPE_SLUG}/items/${slug}`;

  // Stale results from a previous slug stay hidden until the new one resolves.
  if (state.status === "loading" || state.slug !== slug) return <Loading />;

  if (state.status === "draft") {
    return (
      <NotFound
        code="404 — page not found"
        title={`/${slug} is still a draft`}
        text="Publish it in the editor to make it part of the public site."
        action={{ to: editLink, label: "Open in the editor" }}
      />
    );
  }

  if (state.status === "notfound") {
    return (
      <NotFound
        code="404 — page not found"
        title={`No page exists at /${slug}`}
        text="Nothing has been published at this address yet."
        action={{ to: editLink, label: "Create this page" }}
      />
    );
  }

  return <Render config={config} data={state.data} />;
}
