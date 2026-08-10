import { useEffect, useRef, useState } from "react";
import { listMedia, uploadMedia, type MediaAsset } from "../lib/api";
import Icon from "./Icon";

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
  const fileInput = useRef<HTMLInputElement>(null);

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
    <div className="picker">
      <div className="input-row">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
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
          <>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              disabled={uploading}
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              <Icon name="upload" size={15} />
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </>
        )}
      </div>

      {error && (
        <small className="status-note status-note--error">
          <Icon name="alert" size={14} />
          {error}
        </small>
      )}

      {selected && (
        <div className="picker__preview">
          <img src={selected.url} alt={selected.altText || selected.originalFileName} />
        </div>
      )}

      {/* A value with no matching asset means the library changed underneath this item. */}
      {value && !selected && (
        <small className="status-note status-note--error">
          <Icon name="alert" size={14} />
          Selected image no longer exists.
        </small>
      )}
    </div>
  );
}
