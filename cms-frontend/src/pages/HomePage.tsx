import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  listContentItems,
  listContentTypes,
  listMedia,
  PAGE_TYPE_SLUG,
  type ContentItemSummary,
} from "../lib/api";
import { canEditContent } from "../lib/auth";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import Alert from "../components/Alert";
import Loading from "../components/Loading";
import Icon from "../components/Icon";
import { exactTime, relativeTime, slugify, statusClass } from "../lib/ui";

/**
 * Dashboard at / — the pages of the site, most recently edited first, above a summary of
 * what the CMS currently holds. Pages are items of the built-in "page" content type; other
 * types are managed from the content types screen.
 */
export default function HomePage() {
  const [pages, setPages] = useState<ContentItemSummary[] | null>(null);
  const [typeCount, setTypeCount] = useState<number | null>(null);
  const [mediaCount, setMediaCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const slugInput = useRef<HTMLInputElement>(null);
  const mayEdit = canEditContent();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // allSettled: the counts are secondary, so a failing media or types request should
      // still leave a usable page list rather than blanking the whole dashboard.
      const [pageResult, typeResult, mediaResult] = await Promise.allSettled([
        listContentItems(PAGE_TYPE_SLUG),
        listContentTypes(),
        listMedia(),
      ]);
      if (cancelled) return;

      if (pageResult.status === "fulfilled") {
        setPages(pageResult.value);
      } else {
        setPages([]);
        setError(
          pageResult.reason instanceof Error ? pageResult.reason.message : "Failed to load pages"
        );
      }

      if (typeResult.status === "fulfilled") setTypeCount(typeResult.value.length);
      if (mediaResult.status === "fulfilled") setMediaCount(mediaResult.value.length);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!pages) {
    return (
      <AppLayout crumbs={[{ label: "Pages" }]}>
        <Loading label="Loading dashboard…" />
      </AppLayout>
    );
  }

  const published = pages.filter((page) => page.status === "Published").length;
  const recent = [...pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const targetSlug = slugify(newSlug);

  return (
    <AppLayout crumbs={[{ label: "Pages" }]}>
      <PageHeader
        title="Pages"
        description="Every page of the public site. Open one to edit its layout in the visual builder, or publish it to make it live."
        actions={
          mayEdit ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => slugInput.current?.focus()}
            >
              <Icon name="plus" size={16} />
              New page
            </button>
          ) : null
        }
      />

      <div className="stat-grid">
        <Stat label="Pages" icon="file" value={pages.length} />
        <Stat label="Published" icon="check" value={published} />
        <Stat label="Drafts" icon="pencil" value={pages.length - published} />
        <Stat label="Content types" icon="layers" value={typeCount} to="/admin/content-types" />
        <Stat label="Media" icon="image" value={mediaCount} to="/admin/media" />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {recent.length === 0 ? (
        <EmptyState
          title="No pages yet"
          icon="file"
          description={
            mayEdit
              ? "Create your first page below — pick a slug, then build its layout with drag-and-drop blocks."
              : "Nothing has been created yet. An Editor or Admin can add the first page."
          }
        />
      ) : (
        <ul className="rows">
          {recent.map((page) => (
            <li key={page.id}>
              <div className="row">
                <div className="row__main">
                  <Link
                    to={`/admin/content-types/${PAGE_TYPE_SLUG}/items/${page.slug}`}
                    className="row__title"
                  >
                    /{page.slug}
                  </Link>
                  <span className="row__meta">
                    <span className={statusClass(page.status)}>{page.status}</span>
                    <span title={exactTime(page.updatedAt)}>
                      Updated {relativeTime(page.updatedAt)}
                    </span>
                  </span>
                </div>

                <div className="row__actions">
                  <Link
                    to={`/${page.slug}`}
                    className="btn btn--ghost btn--sm"
                    title="Open the live page"
                  >
                    <Icon name="external" size={15} />
                    View
                  </Link>
                  <Link
                    to={`/admin/content-types/${PAGE_TYPE_SLUG}/items/${page.slug}`}
                    className="btn btn--secondary btn--sm"
                  >
                    <Icon name={mayEdit ? "pencil" : "file"} size={15} />
                    {mayEdit ? "Edit" : "Open"}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {mayEdit && (
        <section className="card section">
          <div className="card__header">
            <span className="card__title">New page</span>
            <span className="card__hint">
              The slug is the page's public URL, e.g. <code>/about</code>.
            </span>
          </div>
          <div className="card__body">
            {/* Creating a page is opening its editor: the item is written on first save,
                so there is no separate "create" request to make here. */}
            <form onSubmit={(e) => e.preventDefault()} className="input-row">
              <input
                ref={slugInput}
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="about"
                aria-label="New page slug"
              />
              <Link
                to={
                  targetSlug
                    ? `/admin/content-types/${PAGE_TYPE_SLUG}/items/${targetSlug}`
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
                Will be created as <code>/{targetSlug}</code>
              </p>
            )}
          </div>
        </section>
      )}
    </AppLayout>
  );
}

interface StatProps {
  label: string;
  value: number | null;
  icon: Parameters<typeof Icon>[0]["name"];
  /** When given, the whole tile links to the screen that owns the number. */
  to?: string;
}

function Stat({ label, value, icon, to }: StatProps) {
  const body = (
    <>
      <span className="stat__label">
        <Icon name={icon} size={14} />
        {label}
      </span>
      {/* An em dash rather than 0: the count is unknown until its request resolves. */}
      <span className="stat__value">{value ?? "—"}</span>
    </>
  );

  return to ? (
    <Link to={to} className="stat" style={{ color: "inherit" }}>
      {body}
    </Link>
  ) : (
    <div className="stat">{body}</div>
  );
}
