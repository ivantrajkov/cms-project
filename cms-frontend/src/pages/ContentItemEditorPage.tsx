import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Puck, type Data } from "@measured/puck";
import "@measured/puck/puck.css";
import { config } from "../puck.config";
import {
  getContentItem,
  getContentType,
  PAGE_TYPE_SLUG,
  parseFieldValues,
  saveContentItem,
  toPuckData,
  type ContentItemStatus,
  type ContentType,
  type FieldDefinition,
  type FieldValues,
} from "../lib/api";
import { canEditContent } from "../lib/auth";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import Alert from "../components/Alert";
import Loading from "../components/Loading";
import Icon from "../components/Icon";
import NotFound from "../components/NotFound";
import MediaPickerField from "../components/MediaPickerField";
import ReferencePickerField from "../components/ReferencePickerField";
import { statusClass } from "../lib/ui";

/**
 * Admin editor at /admin/content-types/:typeSlug/items/:itemSlug
 *
 * The form is generated from the content type's field schema rather than hardcoded,
 * so a type defined at runtime gets a working editor with no code change. A field of
 * type Layout is edited with the Puck visual builder; everything else renders as a
 * plain input matching its declared type.
 */
export default function ContentItemEditorPage() {
  const { typeSlug = "", itemSlug = "" } = useParams();

  const [type, setType] = useState<ContentType | null>(null);
  const [values, setValues] = useState<FieldValues>({});
  const [itemStatus, setItemStatus] = useState<ContentItemStatus>("Draft");
  const [initialLayout, setInitialLayout] = useState<Data | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isNew, setIsNew] = useState(false);

  // Which item the loaded state belongs to. Comparing it against the current route
  // params shows the loading state on navigation without resetting state in an effect.
  const itemKey = `${typeSlug}/${itemSlug}`;
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const mayEdit = canEditContent();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loadedType = await getContentType(typeSlug);
        if (cancelled) return;

        if (!loadedType) {
          setType(null);
          return;
        }

        const item = await getContentItem(typeSlug, itemSlug);
        if (cancelled) return;

        const loadedValues = item ? parseFieldValues(item.dataJson) : {};
        const layoutField = loadedType.fields.find((f) => f.type === "Layout");

        setType(loadedType);
        setValues(loadedValues);
        setItemStatus(item?.status ?? "Draft");
        setIsNew(item === null);
        // Captured once: Puck treats `data` as the initial document, so handing it a
        // fresh object on later renders would discard the user's in-progress edits.
        setInitialLayout(layoutField ? toPuckData(loadedValues[layoutField.name]) : null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoadedFor(`${typeSlug}/${itemSlug}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [typeSlug, itemSlug]);

  /**
   * Assemble the payload the API validates. Empty optional values are omitted rather
   * than sent as "" so the server sees them as absent; false and 0 are kept.
   */
  function buildDataJson(fields: FieldDefinition[], layout: Data | null): string {
    const payload: FieldValues = {};

    for (const field of fields) {
      if (field.type === "Layout") {
        if (layout) payload[field.name] = layout;
        continue;
      }

      const value = values[field.name];
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      if (field.type === "Number" && typeof value === "number" && Number.isNaN(value)) continue;

      payload[field.name] = value;
    }

    return JSON.stringify(payload);
  }

  async function save(layout: Data | null) {
    if (!type) return;

    setSaving(true);
    setMessage("Saving…");
    setError("");
    setSaved(false);

    try {
      await saveContentItem(typeSlug, {
        slug: itemSlug,
        status: itemStatus,
        dataJson: buildDataJson(type.fields, layout),
      });
      setMessage("Saved");
      setSaved(true);
      setIsNew(false);
    } catch (err) {
      setMessage("");
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // Stale state from a previous item stays hidden until the new one resolves.
  if (loadedFor !== itemKey) {
    return (
      <AppLayout crumbs={[{ label: "Content types", to: "/admin/content-types" }]}>
        <Loading label="Loading editor…" />
      </AppLayout>
    );
  }

  if (!type) {
    return (
      <NotFound
        code="Content type not found"
        title={`No content type at /${typeSlug}`}
        text="The item cannot be edited without a schema to validate it against."
        action={{ to: "/admin/content-types", label: "Back to content types" }}
      />
    );
  }

  const layoutField = type.fields.find((f) => f.type === "Layout");
  const scalarFields = type.fields.filter((f) => f.type !== "Layout");
  const publicHref = typeSlug === PAGE_TYPE_SLUG ? `/${itemSlug}` : `/${typeSlug}/${itemSlug}`;

  const statusPicker = (
    <label className="field field--inline">
      <span className="field__label">Status</span>
      <select
        value={itemStatus}
        onChange={(e) => setItemStatus(e.target.value as ContentItemStatus)}
        disabled={!mayEdit}
      >
        <option value="Draft">Draft</option>
        <option value="Published">Published</option>
      </select>
    </label>
  );

  const feedback = (
    <>
      {message && (
        <span className={`status-note${saved ? " status-note--ok" : ""}`}>
          {saving ? (
            <span className="spinner" style={{ width: 14, height: 14 }} aria-hidden="true" />
          ) : (
            <Icon name="check" size={15} />
          )}
          {message}
        </span>
      )}
      {error && (
        <span className="status-note status-note--error">
          <Icon name="alert" size={15} />
          {error}
        </span>
      )}
    </>
  );

  // Puck renders its own Publish button, so a Viewer cannot simply have it hidden —
  // say plainly that saving will be refused, and let the API's 403 confirm it.
  const readOnlyNotice = !mayEdit && (
    <span className="status-note">
      <Icon name="alert" size={15} />
      Read-only — your role cannot save changes
    </span>
  );

  const fieldEditor = (field: FieldDefinition) => (
    <FieldInput
      field={field}
      value={values[field.name]}
      disabled={!mayEdit}
      onChange={(next) => setValues((current) => ({ ...current, [field.name]: next }))}
    />
  );

  // With a Layout field, Puck owns the screen and its Publish button is the save
  // action — the same shape the old page editor had. Without one, this is a plain form.
  if (layoutField && initialLayout) {
    return (
      <div className="editor">
        <div className="editor__bar">
          <Link to={`/admin/content-types/${typeSlug}`} className="btn btn--secondary btn--sm">
            <Icon name="arrowLeft" size={15} />
            {type.name}
          </Link>

          <span className="editor__divider" aria-hidden="true" />

          <span className="chip">
            <code>{itemSlug}</code>
          </span>
          <span className={statusClass(itemStatus)}>{itemStatus}</span>

          <span className="editor__divider" aria-hidden="true" />

          <div className="editor__bar-group">
            {scalarFields.map((field) => (
              <label key={field.name} className="field field--inline">
                <span className="field__label">{field.name}</span>
                {fieldEditor(field)}
              </label>
            ))}
            {statusPicker}
          </div>

          <span className="topbar__spacer" />

          <div className="editor__bar-group">
            {readOnlyNotice}
            {feedback}
            {saved && (
              <Link to={publicHref} className="btn btn--ghost btn--sm">
                <Icon name="external" size={15} />
                View live
              </Link>
            )}
          </div>
        </div>

        <div className="editor__canvas">
          <Puck config={config} data={initialLayout} onPublish={(published) => save(published)} />
        </div>
      </div>
    );
  }

  return (
    <AppLayout
      crumbs={[
        { label: "Content types", to: "/admin/content-types" },
        { label: type.name, to: `/admin/content-types/${typeSlug}` },
        { label: itemSlug },
      ]}
    >
      <PageHeader
        eyebrow={type.name}
        title={itemSlug}
        description={
          isNew
            ? "This item does not exist yet — it is created the first time you save."
            : undefined
        }
        actions={
          <>
            <span className={statusClass(itemStatus)}>{itemStatus}</span>
            {!isNew && (
              <Link to={publicHref} className="btn btn--secondary">
                <Icon name="external" size={15} />
                View
              </Link>
            )}
          </>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(null);
        }}
      >
        <section className="card">
          <div className="card__header">
            <span className="card__title">Fields</span>
            <span className="card__hint">
              Defined by the <code>{type.slug}</code> schema.
            </span>
          </div>

          <div className="card__body form">
            {scalarFields.map((field) => (
              <label key={field.name} className="field">
                <span className="field__label">
                  {field.name}
                  <span className="field__type">{field.type}</span>
                  {field.required && (
                    <span className="required-dot" title="Required">
                      *
                    </span>
                  )}
                </span>
                {fieldEditor(field)}
              </label>
            ))}

            {scalarFields.length === 0 && (
              <p className="muted">
                This content type has no fields yet. Add some on the content types screen.
              </p>
            )}
          </div>
        </section>

        <div className="sticky-actions">
          {mayEdit ? (
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? "Saving…" : "Save item"}
            </button>
          ) : null}
          {statusPicker}
          <span className="topbar__spacer" />
          {readOnlyNotice}
          {feedback}
        </div>
      </form>
    </AppLayout>
  );
}

interface FieldInputProps {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

/** Renders the input appropriate to a field's declared type. */
function FieldInput({ field, value, onChange, disabled }: FieldInputProps) {
  switch (field.type) {
    case "Image":
      return (
        <MediaPickerField
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={onChange}
        />
      );

    case "Reference":
      return (
        <ReferencePickerField
          targetType={field.targetType}
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={onChange}
        />
      );

    case "Number":
      return (
        <input
          type="number"
          value={typeof value === "number" ? value : ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)}
        />
      );

    case "Boolean":
      return (
        <input
          type="checkbox"
          checked={value === true}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      );

    case "Date":
      return (
        <input
          type="date"
          // <input type="date"> only accepts YYYY-MM-DD; trim any time component.
          value={typeof value === "string" ? value.slice(0, 10) : ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
        />
      );

    default:
      return (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
