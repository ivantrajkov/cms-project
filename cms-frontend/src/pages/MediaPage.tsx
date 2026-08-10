import { useEffect, useRef, useState } from "react";
import { deleteMedia, listMedia, updateMedia, uploadMedia, type MediaAsset } from "../lib/api";
import { canEditContent } from "../lib/auth";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import Alert from "../components/Alert";
import Loading from "../components/Loading";
import Icon from "../components/Icon";
import { exactTime, formatBytes, relativeTime } from "../lib/ui";

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
  const [dragging, setDragging] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
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
      setMessage(`Uploaded ${file.name}.`);
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
      setAssets((current) => current.map((a) => (a.id === asset.id ? { ...a, altText } : a)));
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

  if (!loaded) {
    return (
      <AppLayout crumbs={[{ label: "Media" }]}>
        <Loading label="Loading media…" />
      </AppLayout>
    );
  }

  const totalBytes = assets.reduce((sum, asset) => sum + asset.sizeBytes, 0);

  return (
    <AppLayout crumbs={[{ label: "Media" }]}>
      <PageHeader
        title="Media"
        description="Files uploaded to the CMS. An Image field on a content type points at one of these, so an asset that is still in use cannot be deleted."
        actions={
          mayEdit ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              <Icon name="upload" size={16} />
              {uploading ? "Uploading…" : "Upload image"}
            </button>
          ) : null
        }
      />

      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      {mayEdit && (
        <div
          className="uploader"
          data-active={dragging}
          style={{ marginBottom: 24 }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleUpload(e.dataTransfer.files?.[0]);
          }}
        >
          {/* The real input stays hidden: the drop zone and the header button are the two
              ways in, and a bare file input beside them would be a third, uglier one. */}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            disabled={uploading}
            onChange={(e) => {
              handleUpload(e.target.files?.[0]);
              // Allow the same file to be picked twice in a row.
              e.target.value = "";
            }}
          />

          <span className="empty__icon" aria-hidden="true">
            <Icon name="upload" size={18} />
          </span>
          <p>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              Choose an image
            </button>
          </p>
          <p className="uploader__hint">or drop a file here — PNG, JPG, GIF, WebP or SVG</p>
        </div>
      )}

      {assets.length === 0 ? (
        <EmptyState
          title="No media uploaded yet"
          icon="image"
          description={
            mayEdit
              ? "Upload an image and it becomes selectable in every Image field and in the page builder."
              : "Nothing has been uploaded yet."
          }
        />
      ) : (
        <>
          <p className="muted" style={{ marginBottom: 12, fontSize: "0.85rem" }}>
            {assets.length} file{assets.length === 1 ? "" : "s"} · {formatBytes(totalBytes)}
          </p>

          <ul className="media-grid">
            {assets.map((asset) => (
              <li className="media-card" key={asset.id}>
                <div className="media-card__preview">
                  <img src={asset.url} alt={asset.altText || asset.originalFileName} />
                </div>

                <div className="media-card__body">
                  <span className="media-card__name" title={asset.originalFileName}>
                    {asset.originalFileName}
                  </span>

                  <span className="media-card__meta">
                    <span>{formatBytes(asset.sizeBytes)}</span>
                    <span aria-hidden="true">·</span>
                    <span title={exactTime(asset.uploadedAt)}>
                      {relativeTime(asset.uploadedAt)}
                    </span>
                  </span>

                  <input
                    defaultValue={asset.altText}
                    placeholder="Alt text"
                    aria-label={`Alt text for ${asset.originalFileName}`}
                    disabled={!mayEdit}
                    // onBlur rather than onChange: one save when the editor moves on,
                    // instead of a request per keystroke.
                    onBlur={(e) => {
                      if (e.target.value !== asset.altText) handleAltText(asset, e.target.value);
                    }}
                  />

                  <div className="btn-row">
                    <a
                      href={asset.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn--ghost btn--sm"
                    >
                      <Icon name="external" size={15} />
                      Open
                    </a>
                    {mayEdit && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--icon"
                        style={{ marginLeft: "auto" }}
                        onClick={() => handleDelete(asset)}
                      >
                        <Icon name="trash" size={16} label={`Delete ${asset.originalFileName}`} />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </AppLayout>
  );
}
