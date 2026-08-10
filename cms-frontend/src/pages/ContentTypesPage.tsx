import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  deleteContentType,
  FIELD_TYPES,
  listContentItems,
  listContentTypes,
  saveContentType,
  type ContentTypeSummary,
  type FieldDefinition,
  type FieldType,
} from "../lib/api";
import { canManageSchema } from "../lib/auth";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import Alert from "../components/Alert";
import Loading from "../components/Loading";
import Icon from "../components/Icon";
import { slugify } from "../lib/ui";

const emptyField: FieldDefinition = { name: "", type: "Text", required: false };

/**
 * The types plus how many items each one holds. The count needs a request per type because
 * the list endpoint does not report it — acceptable for the handful of types a CMS has, and
 * it is the number that tells an admin whether a type is safe to delete. A type whose items
 * cannot be listed counts as 0 rather than failing the whole screen.
 */
async function loadTypesWithCounts(): Promise<{
  types: ContentTypeSummary[];
  counts: Record<string, number>;
}> {
  const types = await listContentTypes();

  const counts = await Promise.all(
    types.map(async (type) => {
      try {
        return [type.slug, (await listContentItems(type.slug)).length] as const;
      } catch {
        return [type.slug, 0] as const;
      }
    })
  );

  return { types, counts: Object.fromEntries(counts) };
}

/**
 * Admin screen at /admin/content-types — defines the schemas that content items
 * are validated against, so new kinds of content can be added without a code change.
 */
export default function ContentTypesPage() {
  const [types, setTypes] = useState<ContentTypeSummary[] | null>(null);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [fields, setFields] = useState<FieldDefinition[]>([{ ...emptyField }]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  // Schema changes affect every existing item of a type, so they are Admin-only.
  const mayManage = canManageSchema();

  async function refresh() {
    const loaded = await loadTypesWithCounts();
    setTypes(loaded.types);
    setItemCounts(loaded.counts);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loaded = await loadTypesWithCounts();
        if (cancelled) return;
        setTypes(loaded.types);
        setItemCounts(loaded.counts);
      } catch (err) {
        if (!cancelled) {
          setTypes([]);
          setError(err instanceof Error ? err.message : "Failed to load content types");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateField(index: number, patch: Partial<FieldDefinition>) {
    setFields((current) =>
      current.map((field, i) => (i === index ? { ...field, ...patch } : field))
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      await saveContentType({
        name,
        slug,
        // Blank rows are just unfilled UI, not fields the user meant to define.
        fields: fields.filter((f) => f.name.trim() !== ""),
      });
      setName("");
      setSlug("");
      setSlugEdited(false);
      setFields([{ ...emptyField }]);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save content type");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(typeSlug: string) {
    if (!confirm(`Delete the "${typeSlug}" content type?`)) return;
    setError("");
    try {
      await deleteContentType(typeSlug);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete content type");
    }
  }

  if (!types) {
    return (
      <AppLayout crumbs={[{ label: "Content types" }]}>
        <Loading label="Loading content types…" />
      </AppLayout>
    );
  }

  return (
    <AppLayout crumbs={[{ label: "Content types" }]}>
      <PageHeader
        title="Content types"
        description="A content type is a schema: a named set of typed fields. Items of that type are validated against it when they are saved."
        actions={
          mayManage ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => nameInput.current?.focus()}
            >
              <Icon name="plus" size={16} />
              New content type
            </button>
          ) : (
            <span className="status-note">
              <Icon name="alert" size={15} />
              Only an Admin can change schemas
            </span>
          )
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      {types.length === 0 ? (
        <EmptyState
          title="No content types yet"
          icon="layers"
          description="Define a schema — for example a Blog Post with a title, body and cover image — and the CMS generates an editor for it."
        />
      ) : (
        <div className="card-grid">
          {types.map((type) => (
            <article className="type-card" key={type.id}>
              <div className="type-card__head">
                <Link to={`/admin/content-types/${type.slug}`} className="type-card__name">
                  {type.name}
                </Link>
                {mayManage && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    style={{ marginLeft: "auto" }}
                    onClick={() => handleDelete(type.slug)}
                  >
                    <Icon name="trash" size={16} label={`Delete ${type.name}`} />
                  </button>
                )}
              </div>

              <span className="chip">
                <code>{type.slug}</code>
              </span>

              <div className="row__meta">
                <span>
                  {itemCounts[type.slug] ?? 0} item
                  {itemCounts[type.slug] === 1 ? "" : "s"}
                </span>
                <Link to={`/admin/content-types/${type.slug}`}>
                  Manage
                  <Icon name="chevronRight" size={13} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {mayManage && (
        <section className="card section">
          <div className="card__header">
            <span className="card__title">New content type</span>
            <span className="card__hint">Saving an existing slug updates that type's schema.</span>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="card__body form">
              <div className="form-grid">
                <label className="field">
                  <span className="field__label">Name</span>
                  <input
                    ref={nameInput}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!slugEdited) setSlug(slugify(e.target.value));
                    }}
                    placeholder="Blog Post"
                  />
                </label>

                <label className="field">
                  <span className="field__label">Slug</span>
                  <input
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setSlugEdited(true);
                    }}
                    placeholder="blog-post"
                  />
                  <span className="field__hint">Used in URLs and in the API path.</span>
                </label>
              </div>

              <fieldset className="field">
                <span className="field__label">Fields</span>

                {fields.map((field, index) => (
                  <div
                    key={index}
                    className={`field-row${field.type === "Reference" ? " field-row--reference" : ""}`}
                  >
                    <input
                      value={field.name}
                      onChange={(e) => updateField(index, { name: e.target.value })}
                      placeholder="field name"
                      aria-label={`Field ${index + 1} name`}
                    />

                    <select
                      value={field.type}
                      aria-label={`Field ${index + 1} type`}
                      onChange={(e) => {
                        const type = e.target.value as FieldType;
                        // A target only applies to Reference; drop it when switching away so
                        // the schema never carries a stale pointer.
                        updateField(index, {
                          type,
                          targetType: type === "Reference" ? field.targetType ?? "" : null,
                        });
                      }}
                    >
                      {FIELD_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>

                    {field.type === "Reference" && (
                      <select
                        value={field.targetType ?? ""}
                        aria-label={`Field ${index + 1} target type`}
                        onChange={(e) => updateField(index, { targetType: e.target.value })}
                      >
                        <option value="">points at…</option>
                        {types.map((t) => (
                          <option key={t.id} value={t.slug}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}

                    <label className="field--check">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateField(index, { required: e.target.checked })}
                      />
                      required
                    </label>

                    <button
                      type="button"
                      className="btn btn--ghost btn--icon"
                      onClick={() =>
                        setFields((current) => current.filter((_, i) => i !== index))
                      }
                      disabled={fields.length === 1}
                    >
                      <Icon name="trash" size={16} label={`Remove field ${index + 1}`} />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  style={{ justifySelf: "start" }}
                  onClick={() => setFields((current) => [...current, { ...emptyField }])}
                >
                  <Icon name="plus" size={15} />
                  Add field
                </button>
              </fieldset>
            </div>

            <div className="card__footer">
              <button type="submit" disabled={saving} className="btn btn--primary">
                {saving ? "Saving…" : "Create content type"}
              </button>
              <span className="card__hint">
                A Layout field turns the item editor into the visual page builder.
              </span>
            </div>
          </form>
        </section>
      )}
    </AppLayout>
  );
}
