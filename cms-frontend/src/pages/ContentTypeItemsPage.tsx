import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  deleteContentItem,
  getContentType,
  listContentItems,
  PAGE_TYPE_SLUG,
  type ContentItemSummary,
  type ContentType,
} from "../lib/api";
import { canEditContent } from "../lib/auth";
import SessionBar from "../components/SessionBar";
import { slugify, statusBadge, ui } from "../lib/ui";

/** Admin screen at /admin/content-types/:typeSlug — lists every item of one content type. */
export default function ContentTypeItemsPage() {
  const { typeSlug = "" } = useParams();
  const [type, setType] = useState<ContentType | null>(null);
  const [items, setItems] = useState<ContentItemSummary[]>([]);
  const [newSlug, setNewSlug] = useState("");
  const [error, setError] = useState("");
  const mayEdit = canEditContent();
  // Which type the loaded data belongs to. Comparing it against the current route
  // param shows the loading state on navigation without resetting state in an effect.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  async function refresh() {
    try {
      const [loadedType, loadedItems] = await Promise.all([
        getContentType(typeSlug),
        listContentItems(typeSlug),
      ]);
      setType(loadedType);
      setItems(loadedItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load items");
    } finally {
      setLoadedFor(typeSlug);
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [loadedType, loadedItems] = await Promise.all([
          getContentType(typeSlug),
          listContentItems(typeSlug),
        ]);
        if (cancelled) return;
        setType(loadedType);
        setItems(loadedItems);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load items");
      } finally {
        if (!cancelled) setLoadedFor(typeSlug);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [typeSlug]);

  const loading = loadedFor !== typeSlug;

  async function handleDelete(itemSlug: string) {
    if (!confirm(`Delete "${itemSlug}"?`)) return;
    setError("");
    try {
      await deleteContentItem(typeSlug, itemSlug);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete item");
    }
  }

  if (loading) return <p style={{ padding: 24 }}>Loading…</p>;

  if (!type) {
    return (
      <div style={ui.page}>
        <h1>Content type not found</h1>
        <p>
          No content type exists at <code>{typeSlug}</code>.{" "}
          <Link to="/admin/content-types">Back to content types →</Link>
        </p>
      </div>
    );
  }

  return (
    <div style={ui.page}>
      <SessionBar />

      <Link to="/admin/content-types" style={{ ...ui.muted, textDecoration: "none" }}>
        ← Content types
      </Link>

      <h1>{type.name}</h1>
      <p style={ui.muted}>
        Fields:{" "}
        {type.fields.length === 0
          ? "none"
          : type.fields
              .map((f) => `${f.name} (${f.type}${f.required ? ", required" : ""})`)
              .join(", ")}
      </p>

      {error && <p style={ui.error}>{error}</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {items.map((item) => (
          <li
            key={item.id}
            style={{
              ...ui.card,
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Link
              to={`/admin/content-types/${typeSlug}/items/${item.slug}`}
              style={{ fontWeight: 600 }}
            >
              {item.slug}
            </Link>

            <span style={statusBadge(item.status)}>{item.status}</span>

            {typeSlug === PAGE_TYPE_SLUG && (
              <Link to={`/${item.slug}`} style={ui.muted}>
                view live
              </Link>
            )}

            {mayEdit && (
              <button
                onClick={() => handleDelete(item.slug)}
                style={{ ...ui.secondaryButton, marginLeft: "auto" }}
              >
                Delete
              </button>
            )}
          </li>
        ))}
        {items.length === 0 && (
          <li style={ui.muted}>No items yet{mayEdit ? " — create one below." : "."}</li>
        )}
      </ul>

      {mayEdit && (
        <>
          <hr style={{ margin: "24px 0" }} />

          <h2>New {type.name.toLowerCase()}</h2>
          <form onSubmit={(e) => e.preventDefault()} style={{ display: "flex", gap: 8 }}>
            <input
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              placeholder="slug (e.g. about)"
              style={{ ...ui.input, flex: 1 }}
            />
            <Link
              to={newSlug ? `/admin/content-types/${typeSlug}/items/${slugify(newSlug)}` : "#"}
              style={{ ...ui.primaryButton, textDecoration: "none" }}
            >
              Create / Edit
            </Link>
          </form>
        </>
      )}
    </div>
  );
}
