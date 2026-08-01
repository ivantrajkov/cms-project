import { useState } from "react";
import { uploadImage } from "../lib/api";

interface Props {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

/**
 * Custom Puck field: uploads an image to the .NET backend and stores the
 * returned URL as the field value. Also allows pasting a URL directly.
 */
export default function ImageUploadField({ value, onChange, readOnly }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadImage(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        type="file"
        accept="image/*"
        disabled={readOnly || uploading}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <input
        type="text"
        placeholder="…or paste an image URL"
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: "6px 8px" }}
      />

      {uploading && <small>Uploading…</small>}
      {error && <small style={{ color: "#dc2626" }}>{error}</small>}

      {value && !uploading && (
        <img
          src={value}
          alt="preview"
          style={{
            maxWidth: "100%",
            maxHeight: 120,
            objectFit: "contain",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
          }}
        />
      )}
    </div>
  );
}
