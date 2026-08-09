import { useEffect, useState } from "react";
import { listMedia, uploadMedia, type MediaAsset } from "../lib/api";
import { ui } from "../lib/ui";

interface Props {
  /** The selected MediaAsset id, or "" when nothing is chosen. */
  value: string;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
}

/**
 * Editor for an Image field. The stored value is a MediaAsset id, so this both uploads new
 * files and lets an existing asset be reused — which is the point of having a media library
 * rather than pasting URLs.
 */
export default function MediaPickerField({ value, onChange, disabled }: Props) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loaded = await listMedia();
        if (!cancelled) setAssets(loaded);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load media");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError("");

    try {
      const uploaded = await uploadMedia(file);
      setAssets(await listMedia());
      onChange(uploaded.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const selected = assets.find((a) => a.id === value);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
        style={ui.input}
      >
        <option value="">No image</option>
        {assets.map((asset) => (
          <option key={asset.id} value={asset.id}>
            {asset.originalFileName}
            {asset.altText ? ` — ${asset.altText}` : ""}
          </option>
        ))}
      </select>

      {!disabled && (
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      )}

      {uploading && <small style={ui.muted}>Uploading…</small>}
      {error && <small style={ui.error}>{error}</small>}

      {selected && (
        <img
          src={selected.url}
          alt={selected.altText || selected.originalFileName}
          style={{
            maxWidth: "100%",
            maxHeight: 120,
            objectFit: "contain",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
          }}
        />
      )}

      {/* A value with no matching asset means the library changed underneath this item. */}
      {value && !selected && <small style={ui.error}>Selected image no longer exists.</small>}
    </div>
  );
}
