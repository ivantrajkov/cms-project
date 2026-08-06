import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listContentItems, PAGE_TYPE_SLUG, type ContentItemSummary } from "../lib/api";
import { slugify, statusBadge, ui } from "../lib/ui";

/**
 * A tiny dashboard at / listing every page with links to view and edit.
 * Pages are items of the built-in "page" content type; other types are managed
 * from the content types screen.
 */
export default function HomePage() {
  const [pages, setPages] = useState<ContentItemSummary[]>([]);
  const [newSlug, setNewSlug] = useState("");

  useEffect(() => {
    listContentItems(PAGE_TYPE_SLUG)
      .then(setPages)
      .catch(() => setPages([]));
  }, []);

  return (
    <div style={ui.page}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1>Pages</h1>
        <Link to="/admin/content-types" style={{ marginLeft: "auto" }}>
          Manage content types →
        </Link>
      </div>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {pages.map((page) => (
          <li key={page.id} style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
            <Link to={`/${page.slug}`}>{page.slug}</Link>
            <span style={statusBadge(page.status)}>{page.status}</span>
            <Link
              to={`/admin/content-types/${PAGE_TYPE_SLUG}/items/${page.slug}`}
              style={ui.muted}
            >
              (edit)
            </Link>
          </li>
        ))}
        {pages.length === 0 && <li>No pages yet — create one below.</li>}
      </ul>

      <hr style={{ margin: "24px 0" }} />

      <h2>New page</h2>
      <form onSubmit={(e) => e.preventDefault()} style={{ display: "flex", gap: 8 }}>
        <input
          value={newSlug}
          onChange={(e) => setNewSlug(e.target.value)}
          placeholder="slug (e.g. about)"
          style={{ ...ui.input, flex: 1 }}
        />
        <Link
          to={
            newSlug
              ? `/admin/content-types/${PAGE_TYPE_SLUG}/items/${slugify(newSlug)}`
              : "#"
          }
          style={{ ...ui.primaryButton, textDecoration: "none" }}
        >
          Create / Edit
        </Link>
      </form>
    </div>
  );
}
