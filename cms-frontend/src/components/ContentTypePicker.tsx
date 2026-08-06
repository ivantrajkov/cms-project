import { useEffect, useState } from "react";
import { listContentTypes, type ContentTypeSummary } from "../lib/api";

interface Props {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

/**
 * Custom Puck field: picks which content type a Content List block should read.
 * The options come from the API, so a type defined at runtime is immediately
 * selectable without touching the Puck config.
 */
export default function ContentTypePicker({ value, onChange, readOnly }: Props) {
  const [types, setTypes] = useState<ContentTypeSummary[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loaded = await listContentTypes();
        if (!cancelled) setTypes(loaded);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load types");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <select
        value={value}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: "6px 8px" }}
      >
        <option value="">Select a content type…</option>
        {types.map((type) => (
          <option key={type.id} value={type.slug}>
            {type.name}
          </option>
        ))}
      </select>

      {error && <small style={{ color: "#dc2626" }}>{error}</small>}
    </div>
  );
}
