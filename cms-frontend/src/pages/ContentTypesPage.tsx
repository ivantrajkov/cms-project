import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  deleteContentType,
  FIELD_TYPES,
  listContentTypes,
  saveContentType,
  type ContentTypeSummary,
  type FieldDefinition,
  type FieldType,
} from "../lib/api";
import { canManageSchema } from "../lib/auth";
import SessionBar from "../components/SessionBar";
import { slugify, ui } from "../lib/ui";

const emptyField: FieldDefinition = { name: "", type: "Text", required: false };

/**
 * Admin screen at /admin/content-types — defines the schemas that content items
 * are validated against, so new kinds of content can be added without a code change.
 */
export default function ContentTypesPage() {
  const [types, setTypes] = useState<ContentTypeSummary[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [fields, setFields] = useState<FieldDefinition[]>([{ ...emptyField }]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Schema changes affect every existing item of a type, so they are Admin-only.
  const mayManage = canManageSchema();

  async function refresh() {
    try {
      setTypes(await listContentTypes());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content types");
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loaded = await listContentTypes();
        if (!cancelled) setTypes(loaded);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load content types");
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

  return (
    <div style={ui.page}>
      <SessionBar />

      <Link to="/" style={{ ...ui.muted, textDecoration: "none" }}>
        ← Dashboard
      </Link>

      <h1>Content types</h1>
      <p style={ui.muted}>
        A content type is a schema: a named set of typed fields. Items of that type are
        validated against it when they are saved.
        {!mayManage && " Only an Admin can create or delete them."}
      </p>

      {error && <p style={ui.error}>{error}</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {types.map((type) => (
          <li
            key={type.id}
            style={{
              ...ui.card,
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Link to={`/admin/content-types/${type.slug}`} style={{ fontWeight: 600 }}>
              {type.name}
            </Link>
            <code style={ui.muted}>{type.slug}</code>
            {mayManage && (
              <button
                onClick={() => handleDelete(type.slug)}
                style={{ ...ui.secondaryButton, marginLeft: "auto" }}
              >
                Delete
              </button>
            )}
          </li>
        ))}
        {types.length === 0 && <li style={ui.muted}>No content types yet.</li>}
      </ul>

      {!mayManage ? null : (
        <>
      <hr style={{ margin: "24px 0" }} />

      <h2>New content type</h2>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 4 }}>
          Name
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugEdited) setSlug(slugify(e.target.value));
            }}
            placeholder="Blog Post"
            style={ui.input}
          />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          Slug
          <input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugEdited(true);
            }}
            placeholder="blog-post"
            style={ui.input}
          />
        </label>

        <fieldset style={{ ...ui.card, display: "grid", gap: 8 }}>
          <legend>Fields</legend>

          {fields.map((field, index) => (
            <div key={index} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={field.name}
                onChange={(e) => updateField(index, { name: e.target.value })}
                placeholder="field name"
                style={{ ...ui.input, flex: 1 }}
              />

              <select
                value={field.type}
                onChange={(e) => {
                  const type = e.target.value as FieldType;
                  // A target only applies to Reference; drop it when switching away so the
                  // schema never carries a stale pointer.
                  updateField(index, {
                    type,
                    targetType: type === "Reference" ? field.targetType ?? "" : null,
                  });
                }}
                style={ui.input}
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
                  onChange={(e) => updateField(index, { targetType: e.target.value })}
                  style={ui.input}
                >
                  <option value="">points at…</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.slug}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}

              <label style={{ display: "flex", gap: 4, alignItems: "center", ...ui.muted }}>
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => updateField(index, { required: e.target.checked })}
                />
                required
              </label>

              <button
                type="button"
                onClick={() => setFields((current) => current.filter((_, i) => i !== index))}
                disabled={fields.length === 1}
                style={ui.secondaryButton}
              >
                ✕
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setFields((current) => [...current, { ...emptyField }])}
            style={{ ...ui.secondaryButton, justifySelf: "start" }}
          >
            + Add field
          </button>
        </fieldset>

        <button type="submit" disabled={saving} style={{ ...ui.primaryButton, justifySelf: "start" }}>
          {saving ? "Saving…" : "Create content type"}
        </button>
      </form>
        </>
      )}
    </div>
  );
}
