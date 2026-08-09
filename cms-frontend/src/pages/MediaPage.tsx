import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteMedia, listMedia, updateMedia, uploadMedia, type MediaAsset } from "../lib/api";
import { canEditContent } from "../lib/auth";
import SessionBar from "../components/SessionBar";
import { ui } from "../lib/ui";

/** Human-readable file size, since raw byte counts are useless when scanning a list. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Media library at /admin/media — browse, upload, caption and delete uploads.
 * The API refuses to delete an asset that a content item still uses, so that error is
 * surfaced here rather than predicted.
 */
export default function MediaPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const mayEdit = canEditContent();

  async function refresh() {
    try {
      setAssets(await listMedia());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load media");
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loadedAssets = await listMedia();
        if (!cancelled) setAssets(loadedAssets);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load media");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError("");
    setMessage("");

    try {
      await uploadMedia(file);
      await refresh();
      setMessage("Uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleAltText(asset: MediaAsset, altText: string) {
    setError("");
    try {
      await updateMedia(asset.id, altText);
      setAssets((current) =>
        current.map((a) => (a.id === asset.id ? { ...a, altText } : a))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save alt text");
    }
  }

  async function handleDelete(asset: MediaAsset) {
    if (!confirm(`Delete ${asset.originalFileName}?`)) return;
    setError("");
    setMessage("");

    try {
      await deleteMedia(asset.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  if (!loaded) return <p style={{ padding: 24 }}>Loading…</p>;

  return (
    <div style={ui.page}>
      <SessionBar />

      <Link to="/" style={{ ...ui.muted, textDecoration: "none" }}>
        ← Dashboard
      </Link>

      <h1>Media</h1>
      <p style={ui.muted}>
        Files uploaded to the CMS. An Image field on a content type points at one of these,
        so an asset that is still in use cannot be deleted.
      </p>

      {error && <p style={ui.error}>{error}</p>}
      {message && <p style={ui.muted}>{message}</p>}

      {mayEdit && (
        <p>
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => handleUpload(e.target.files?.[0])}
          />
          {uploading && <span style={ui.muted}> Uploading…</span>}
        </p>
      )}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {assets.map((asset) => (
          <li
            key={asset.id}
            style={{ ...ui.card, marginBottom: 8, display: "flex", gap: 12, alignItems: "center" }}
          >
            <img
              src={asset.url}
              alt={asset.altText || asset.originalFileName}
              style={{
                width: 64,
                height: 64,
                objectFit: "contain",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                flex: "0 0 auto",
              }}
            />

            <div style={{ display: "grid", gap: 4, flex: 1, minWidth: 0 }}>
              <strong style={{ overflowWrap: "anywhere" }}>{asset.originalFileName}</strong>
              <small style={ui.muted}>
                {asset.contentType} · {formatSize(asset.sizeBytes)}
              </small>

              <input
                defaultValue={asset.altText}
                placeholder="Alt text (for accessibility)"
                disabled={!mayEdit}
                // onBlur rather than onChange: one save when the editor moves on,
                // instead of a request per keystroke.
                onBlur={(e) => {
                  if (e.target.value !== asset.altText) handleAltText(asset, e.target.value);
                }}
                style={ui.input}
              />
            </div>

            {mayEdit && (
              <button onClick={() => handleDelete(asset)} style={ui.secondaryButton}>
                Delete
              </button>
            )}
          </li>
        ))}
        {assets.length === 0 && <li style={ui.muted}>No media uploaded yet.</li>}
      </ul>
    </div>
  );
}
