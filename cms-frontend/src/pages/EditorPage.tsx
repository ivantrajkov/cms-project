import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Puck, type Data } from "@measured/puck";
import "@measured/puck/puck.css";
import { config } from "../puck.config";
import { getPage, parseLayout, savePage } from "../lib/api";

/**
 * Admin editor at /admin/edit/:slug
 * Loads existing LayoutData into the Puck canvas and POSTs it back on publish.
 */
export default function EditorPage() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<Data | null>(null);
  const [title, setTitle] = useState(slug);
  const [status, setStatus] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const page = await getPage(slug);
      if (cancelled) return;

      if (page) {
        setTitle(page.title);
        setData(parseLayout(page.layoutData));
      } else {
        // New page — start with an empty Puck document.
        setData({ content: [], root: {} } as Data);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function handlePublish(published: Data) {
    setStatus("Saving…");
    setSaved(false);
    try {
      await savePage({
        title: title || slug,
        slug,
        layoutData: JSON.stringify(published),
      });
      setStatus("Published ✓");
      setSaved(true);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save");
    }
  }

  if (!data) return <p style={{ padding: 24 }}>Loading editor…</p>;

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          padding: "8px 16px",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <Link to="/" style={{ textDecoration: "none", fontWeight: 600 }}>
          ← Back to pages
        </Link>
        <span style={{ color: "#d1d5db" }}>|</span>
        <strong>Editing:</strong>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Page title"
          style={{ padding: "6px 8px", flex: "0 0 240px" }}
        />
        <code>/{slug}</code>

        <span style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ color: "#6b7280" }}>{status}</span>
          {saved && (
            <Link to={`/${slug}`} style={{ fontWeight: 600 }}>
              View live page →
            </Link>
          )}
        </span>
      </div>

      <Puck config={config} data={data} onPublish={handlePublish} />
    </div>
  );
}
