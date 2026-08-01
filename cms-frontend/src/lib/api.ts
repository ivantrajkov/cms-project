import type { Data } from "@measured/puck";

// The .NET API. Use the HTTP launch profile (dotnet run --launch-profile http)
// so there is no HTTPS-redirect/self-signed-cert friction during local dev.
const API_BASE = "http://localhost:5051";

export interface PageSummary {
  id: string;
  title: string;
  slug: string;
}

export interface PageDto {
  id: string;
  title: string;
  slug: string;
  /** Stringified Puck JSON. */
  layoutData: string;
}

export interface SavePageRequest {
  title: string;
  slug: string;
  layoutData: string;
}

/** GET /api/pages */
export async function listPages(): Promise<PageSummary[]> {
  const res = await fetch(`${API_BASE}/api/pages`);
  if (!res.ok) throw new Error(`Failed to list pages (${res.status})`);
  return res.json();
}

/** GET /api/pages/{slug} — returns null on 404. */
export async function getPage(slug: string): Promise<PageDto | null> {
  const res = await fetch(`${API_BASE}/api/pages/${encodeURIComponent(slug)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load page (${res.status})`);
  return res.json();
}

/** POST /api/pages — create or update. */
export async function savePage(payload: SavePageRequest): Promise<PageDto> {
  const res = await fetch(`${API_BASE}/api/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `Failed to save page (${res.status})`);
  }
  return res.json();
}

/** POST /api/upload — uploads an image file and returns its absolute URL. */
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `Upload failed (${res.status})`);
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}

/**
 * Parse the stringified LayoutData coming from the API into Puck `Data`.
 * Falls back to an empty document so the editor/renderer never crash.
 */
export function parseLayout(layoutData: string | undefined): Data {
  if (!layoutData) return { content: [], root: {} } as Data;
  try {
    return JSON.parse(layoutData) as Data;
  } catch {
    return { content: [], root: {} } as Data;
  }
}
