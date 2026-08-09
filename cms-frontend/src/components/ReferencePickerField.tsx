import { useEffect, useState } from "react";
import {
  getContentType,
  itemLabel,
  listContentItems,
  type ContentItemSummary,
  type ContentType,
} from "../lib/api";
import { ui } from "../lib/ui";

interface Props {
  /** Slug of the content type this field points at. */
  targetType: string | null | undefined;
  /** The selected item's id, or "" when nothing is chosen. */
  value: string;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
}

/**
 * Editor for a Reference field: a list of the target type's items, storing the chosen
 * item's id. Items are labelled by their first Text field so the dropdown shows "Ana
 * Petrova" rather than a Guid.
 */
export default function ReferencePickerField({ targetType, value, onChange, disabled }: Props) {
  const [type, setType] = useState<ContentType | null>(null);
  const [items, setItems] = useState<ContentItemSummary[]>([]);
  const [error, setError] = useState("");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!targetType) return;

    (async () => {
      try {
        // includeData so each item can be labelled without a request per row.
        const [loadedType, loadedItems] = await Promise.all([
          getContentType(targetType),
          listContentItems(targetType, { includeData: true }),
        ]);
        if (cancelled) return;
        setType(loadedType);
        setItems(loadedItems);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load options");
      } finally {
        if (!cancelled) setLoadedFor(targetType);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [targetType]);

  if (!targetType) return <small style={ui.error}>This field has no target content type.</small>;
  if (loadedFor !== targetType) return <small style={ui.muted}>Loading…</small>;

  const selectedMissing = value !== "" && !items.some((i) => i.id === value);

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
        style={ui.input}
      >
        <option value="">Nothing selected</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {itemLabel(type, item)}
            {item.status === "Draft" ? " (draft)" : ""}
          </option>
        ))}
      </select>

      {error && <small style={ui.error}>{error}</small>}
      {selectedMissing && <small style={ui.error}>Referenced item no longer exists.</small>}
    </div>
  );
}
