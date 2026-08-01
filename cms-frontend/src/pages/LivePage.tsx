import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Render, type Data } from "@measured/puck";
import "@measured/puck/puck.css";
import { config } from "../puck.config";
import { getPage, parseLayout } from "../lib/api";

type LoadState =
  | { status: "loading" }
  | { status: "notfound" }
  | { status: "ready"; data: Data };

/**
 * Public read-only page at /:slug
 * Fetches the layout JSON and renders it with Puck's <Render />.
 */
export default function LivePage() {
  const { slug = "" } = useParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const page = await getPage(slug);
      if (cancelled) return;

      setState(
        page
          ? { status: "ready", data: parseLayout(page.layoutData) }
          : { status: "notfound" }
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state.status === "loading") return <p style={{ padding: 24 }}>Loading…</p>;

  if (state.status === "notfound") {
    return (
      <div style={{ padding: 24 }}>
        <h1>404 — page not found</h1>
        <p>
          No page exists at <code>/{slug}</code>.{" "}
          <Link to={`/admin/edit/${slug}`}>Create it →</Link>
        </p>
      </div>
    );
  }

  return <Render config={config} data={state.data} />;
}
