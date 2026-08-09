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
import MediaPickerField from "../components/MediaPickerField";
import ReferencePickerField from "../components/ReferencePickerField";
import { ui } from "../lib/ui";

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
  const [saved, setSaved] = useState(false);

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

    setMessage("Saving…");
    setError("");
    setSaved(false);

    try {
      await saveContentItem(typeSlug, {
        slug: itemSlug,
        status: itemStatus,
        dataJson: buildDataJson(type.fields, layout),
      });
      setMessage("Saved ✓");
      setSaved(true);
    } catch (err) {
      setMessage("");
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  // Stale state from a previous item stays hidden until the new one resolves.
  if (loadedFor !== itemKey) return <p style={{ padding: 24 }}>Loading editor…</p>;

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

  const layoutField = type.fields.find((f) => f.type === "Layout");
  const scalarFields = type.fields.filter((f) => f.type !== "Layout");

  const statusPicker = (
    <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={ui.muted}>Status</span>
      <select
        value={itemStatus}
        onChange={(e) => setItemStatus(e.target.value as ContentItemStatus)}
        disabled={!mayEdit}
        style={ui.input}
      >
        <option value="Draft">Draft</option>
        <option value="Published">Published</option>
      </select>
    </label>
  );

  const feedback = (
    <>
      {message && <span style={ui.muted}>{message}</span>}
      {error && <span style={ui.error}>{error}</span>}
    </>
  );

  // Puck renders its own Publish button, so a Viewer cannot simply have it hidden —
  // say plainly that saving will be refused, and let the API's 403 confirm it.
  const readOnlyNotice = !mayEdit && (
    <span style={ui.muted}>Read-only — your role cannot save changes.</span>
  );

  const fieldInputs = scalarFields.map((field) => (
    <label key={field.name} style={{ display: "grid", gap: 4 }}>
      <span>
        {field.name}
        <span style={ui.muted}>
          {" "}
          — {field.type}
          {field.required ? ", required" : ""}
        </span>
      </span>
      <FieldInput
        field={field}
        value={values[field.name]}
        disabled={!mayEdit}
        onChange={(next) => setValues((current) => ({ ...current, [field.name]: next }))}
      />
    </label>
  ));

  // With a Layout field, Puck owns the screen and its Publish button is the save
  // action — the same shape the old page editor had. Without one, this is a plain form.
  if (layoutField && initialLayout) {
    return (
      <div>
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            padding: "8px 16px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <Link
            to={`/admin/content-types/${typeSlug}`}
            style={{ textDecoration: "none", fontWeight: 600 }}
          >
            ← Back to {type.name}
          </Link>
          <span style={{ color: "#d1d5db" }}>|</span>
          <strong>Editing:</strong>
          <code>{itemSlug}</code>

          {scalarFields.map((field) => (
            <label key={field.name} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={ui.muted}>{field.name}</span>
              <FieldInput
                field={field}
                value={values[field.name]}
                disabled={!mayEdit}
                onChange={(next) => setValues((current) => ({ ...current, [field.name]: next }))}
              />
            </label>
          ))}

          {statusPicker}

          <span style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
            {readOnlyNotice}
            {feedback}
            {saved && typeSlug === PAGE_TYPE_SLUG && (
              <Link to={`/${itemSlug}`} style={{ fontWeight: 600 }}>
                View live page →
              </Link>
            )}
          </span>
        </div>

        <Puck config={config} data={initialLayout} onPublish={(published) => save(published)} />
      </div>
    );
  }

  return (
    <div style={ui.page}>
      <Link to={`/admin/content-types/${typeSlug}`} style={{ ...ui.muted, textDecoration: "none" }}>
        ← Back to {type.name}
      </Link>

      <h1>
        {type.name}: <code>{itemSlug}</code>
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(null);
        }}
        style={{ display: "grid", gap: 12 }}
      >
        {fieldInputs}
        {scalarFields.length === 0 && (
          <p style={ui.muted}>This content type has no fields yet.</p>
        )}

        {statusPicker}

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {mayEdit && (
            <button type="submit" style={ui.primaryButton}>
              Save
            </button>
          )}
          {readOnlyNotice}
          {feedback}
        </div>
      </form>
    </div>
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
          style={ui.input}
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
          style={ui.input}
        />
      );

    default:
      return (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={ui.input}
        />
      );
  }
}
