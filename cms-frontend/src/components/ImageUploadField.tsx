import { useRef, useState } from "react";
import { uploadImage } from "../lib/api";
import Icon from "./Icon";

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
  const fileInput = useRef<HTMLInputElement>(null);

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
    <div className="picker">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        disabled={readOnly || uploading}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <button
        type="button"
        className="btn btn--secondary btn--sm"
        disabled={readOnly || uploading}
        onClick={() => fileInput.current?.click()}
      >
        <Icon name="upload" size={15} />
        {uploading ? "Uploading…" : "Upload image"}
      </button>

      <input
        type="text"
        placeholder="…or paste an image URL"
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
      />

      {error && (
        <small className="status-note status-note--error">
          <Icon name="alert" size={14} />
          {error}
        </small>
      )}

      {value && !uploading && (
        <div className="picker__preview">
          <img src={value} alt="preview" />
        </div>
      )}
    </div>
  );
}
