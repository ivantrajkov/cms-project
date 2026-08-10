import { useEffect, useRef, useState } from "react";
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
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import Alert from "../components/Alert";
import Loading from "../components/Loading";
import Icon from "../components/Icon";
import NotFound from "../components/NotFound";
import { exactTime, relativeTime, slugify, statusClass } from "../lib/ui";

/** Admin screen at /admin/content-types/:typeSlug — lists every item of one content type. */
export default function ContentTypeItemsPage() {
  const { typeSlug = "" } = useParams();
  const [type, setType] = useState<ContentType | null>(null);
  const [items, setItems] = useState<ContentItemSummary[]>([]);
  const [newSlug, setNewSlug] = useState("");
  const [error, setError] = useState("");
  const slugInput = useRef<HTMLInputElement>(null);
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

  if (loading) {
    return (
      <AppLayout crumbs={[{ label: "Content types", to: "/admin/content-types" }]}>
        <Loading />
      </AppLayout>
    );
  }

  if (!type) {
    return (
      <NotFound
        code="Content type not found"
        title={`No content type at /${typeSlug}`}
        text="It may have been renamed or deleted."
        action={{ to: "/admin/content-types", label: "Back to content types" }}
      />
    );
  }

  const targetSlug = slugify(newSlug);
  const recent = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const singular = type.name.toLowerCase();

  return (
    <AppLayout
      crumbs={[{ label: "Content types", to: "/admin/content-types" }, { label: type.name }]}
    >
      <PageHeader
        eyebrow="Content type"
        title={type.name}
        description={
          type.fields.length === 0
            ? "This type has no fields yet — add some on the content types screen."
            : "Items of this type are validated against the fields below."
        }
        actions={
          mayEdit ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => slugInput.current?.focus()}
            >
              <Icon name="plus" size={16} />
              New {singular}
            </button>
          ) : null
        }
      />

      {type.fields.length > 0 && (
        <div className="btn-row" style={{ marginBottom: 22 }}>
          {type.fields.map((field) => (
            <span className="chip" key={field.name}>
              {field.name}
              <span className="field__type">{field.type}</span>
              {field.required && (
                <span className="required-dot" title="Required">
                  *
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {recent.length === 0 ? (
        <EmptyState
          title={`No ${singular} items yet`}
          icon="layers"
          description={
            mayEdit
              ? `Pick a slug below to open the editor — the ${singular} is saved the first time you press save.`
              : "Nothing has been created yet. An Editor or Admin can add the first item."
          }
        />
      ) : (
        <ul className="rows">
          {recent.map((item) => (
            <li key={item.id}>
              <div className="row">
                <div className="row__main">
                  <Link
                    to={`/admin/content-types/${typeSlug}/items/${item.slug}`}
                    className="row__title"
                  >
                    {item.slug}
                  </Link>
                  <span className="row__meta">
                    <span className={statusClass(item.status)}>{item.status}</span>
                    <span title={exactTime(item.updatedAt)}>
                      Updated {relativeTime(item.updatedAt)}
                    </span>
                  </span>
                </div>

                <div className="row__actions">
                  <Link
                    to={
                      typeSlug === PAGE_TYPE_SLUG
                        ? `/${item.slug}`
                        : `/${typeSlug}/${item.slug}`
                    }
                    className="btn btn--ghost btn--sm"
                    title="Open the public page"
                  >
                    <Icon name="external" size={15} />
                    View
                  </Link>

                  <Link
                    to={`/admin/content-types/${typeSlug}/items/${item.slug}`}
                    className="btn btn--secondary btn--sm"
                  >
                    <Icon name={mayEdit ? "pencil" : "file"} size={15} />
                    {mayEdit ? "Edit" : "Open"}
                  </Link>

                  {mayEdit && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--icon"
                      onClick={() => handleDelete(item.slug)}
                    >
                      <Icon name="trash" size={16} label={`Delete ${item.slug}`} />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {mayEdit && (
        <section className="card section">
          <div className="card__header">
            <span className="card__title">New {singular}</span>
            <span className="card__hint">
              The slug identifies the item within this type and forms its public URL.
            </span>
          </div>
          <div className="card__body">
            <form onSubmit={(e) => e.preventDefault()} className="input-row">
              <input
                ref={slugInput}
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="my-first-item"
                aria-label={`New ${singular} slug`}
              />
              <Link
                to={
                  targetSlug
                    ? `/admin/content-types/${typeSlug}/items/${targetSlug}`
                    : "#"
                }
                className="btn btn--primary"
                aria-disabled={targetSlug === ""}
              >
                Open editor
                <Icon name="chevronRight" size={15} />
              </Link>
            </form>
            {targetSlug && targetSlug !== newSlug && (
              <p className="field__hint" style={{ marginTop: 8 }}>
                Will be created as <code>{targetSlug}</code>
              </p>
            )}
          </div>
        </section>
      )}
    </AppLayout>
  );
}
