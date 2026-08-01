import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listPages, type PageSummary } from "../lib/api";

/**
 * A tiny dashboard at / listing every page with links to view and edit.
 * Not required by the spec, but makes the data flow easy to exercise.
 */
export default function HomePage() {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [newSlug, setNewSlug] = useState("");

  useEffect(() => {
    listPages().then(setPages).catch(() => setPages([]));
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px" }}>
      <h1>Pages</h1>

      <ul>
        {pages.map((p) => (
          <li key={p.id} style={{ marginBottom: 8 }}>
            <Link to={`/${p.slug}`}>{p.title}</Link>{" "}
            <Link to={`/admin/edit/${p.slug}`} style={{ color: "#6b7280" }}>
              (edit)
            </Link>
          </li>
        ))}
        {pages.length === 0 && <li>No pages yet — create one below.</li>}
      </ul>

      <hr style={{ margin: "24px 0" }} />

      <h2>New page</h2>
      <form
        onSubmit={(e) => e.preventDefault()}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          value={newSlug}
          onChange={(e) => setNewSlug(e.target.value)}
          placeholder="slug (e.g. about)"
          style={{ padding: "6px 8px", flex: 1 }}
        />
        <Link
          to={newSlug ? `/admin/edit/${newSlug}` : "#"}
          style={{
            padding: "6px 12px",
            background: "#2563eb",
            color: "#fff",
            borderRadius: 6,
            textDecoration: "none",
          }}
        >
          Create / Edit
        </Link>
      </form>
    </div>
  );
}
