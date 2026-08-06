import type { Data } from "@measured/puck";

// The .NET API. Use the HTTP launch profile (dotnet run --launch-profile http)
// so there is no HTTPS-redirect/self-signed-cert friction during local dev.
const API_BASE = "http://localhost:5051";

/** Slug of the built-in content type that the original Page entity was migrated into. */
export const PAGE_TYPE_SLUG = "page";

export type FieldType = "Text" | "Number" | "Boolean" | "Date" | "Layout";

export const FIELD_TYPES: FieldType[] = ["Text", "Number", "Boolean", "Date", "Layout"];

export type ContentItemStatus = "Draft" | "Published";

export interface FieldDefinition {
  name: string;
  type: FieldType;
  required: boolean;
}

export interface ContentTypeSummary {
  id: string;
  name: string;
  slug: string;
}

export interface ContentType {
  id: string;
  name: string;
  slug: string;
  fields: FieldDefinition[];
}

export interface SaveContentTypeRequest {
  name: string;
  slug: string;
  fields: FieldDefinition[];
}

export interface ContentItemSummary {
  id: string;
  slug: string;
  status: ContentItemStatus;
  /** Only populated when the item was listed with `includeData`. */
  dataJson: string | null;
}

export interface ListContentItemsOptions {
  /** Include each item's field values, for callers that render the content. */
  includeData?: boolean;
  status?: ContentItemStatus;
  limit?: number;
}

export interface ContentItem {
  id: string;
  slug: string;
  status: ContentItemStatus;
  /** Stringified JSON object whose keys match the content type's field names. */
  dataJson: string;
}

export interface SaveContentItemRequest {
  slug: string;
  status: ContentItemStatus;
  dataJson: string;
}

/** A content item's decoded field values, keyed by field name. */
export type FieldValues = Record<string, unknown>;

/**
 * The API reports failures in three shapes: a plain-text string (`BadRequest("...")`),
 * a JSON array of validation messages (`BadRequest(errors)`), and ASP.NET's
 * ProblemDetails object. Flatten whichever arrived into one readable message.
 */
async function readError(res: Response, fallback: string): Promise<string> {
  const text = await res.text();
  if (!text) return fallback;

  try {
    const parsed: unknown = JSON.parse(text);

    if (Array.isArray(parsed)) return parsed.join(" ");
    if (typeof parsed === "string") return parsed;

    if (parsed && typeof parsed === "object") {
      const problem = parsed as { title?: string; errors?: Record<string, string[]> };
      if (problem.errors) return Object.values(problem.errors).flat().join(" ");
      if (problem.title) return problem.title;
    }
  } catch {
    // Not JSON — the body is already a plain-text message.
  }

  return text;
}

/** GET /api/content-types */
export async function listContentTypes(): Promise<ContentTypeSummary[]> {
  const res = await fetch(`${API_BASE}/api/content-types`);
  if (!res.ok) throw new Error(await readError(res, `Failed to list content types (${res.status})`));
  return res.json();
}

/** GET /api/content-types/{slug} — returns null on 404. */
export async function getContentType(slug: string): Promise<ContentType | null> {
  const res = await fetch(`${API_BASE}/api/content-types/${encodeURIComponent(slug)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readError(res, `Failed to load content type (${res.status})`));
  return res.json();
}

/** POST /api/content-types — create or update, keyed on slug. */
export async function saveContentType(payload: SaveContentTypeRequest): Promise<ContentType> {
  const res = await fetch(`${API_BASE}/api/content-types`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res, `Failed to save content type (${res.status})`));
  return res.json();
}

/** DELETE /api/content-types/{slug} — refused by the API if the type still has items. */
export async function deleteContentType(slug: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/content-types/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readError(res, `Failed to delete content type (${res.status})`));
}

/** GET /api/content-types/{typeSlug}/items */
export async function listContentItems(
  typeSlug: string,
  options: ListContentItemsOptions = {}
): Promise<ContentItemSummary[]> {
  const query = new URLSearchParams();
  if (options.includeData) query.set("includeData", "true");
  if (options.status) query.set("status", options.status);
  if (options.limit && options.limit > 0) query.set("limit", String(options.limit));

  const suffix = query.size > 0 ? `?${query}` : "";
  const res = await fetch(
    `${API_BASE}/api/content-types/${encodeURIComponent(typeSlug)}/items${suffix}`
  );
  if (!res.ok) throw new Error(await readError(res, `Failed to list items (${res.status})`));
  return res.json();
}

/** GET /api/content-types/{typeSlug}/items/{itemSlug} — returns null on 404. */
export async function getContentItem(
  typeSlug: string,
  itemSlug: string
): Promise<ContentItem | null> {
  const res = await fetch(
    `${API_BASE}/api/content-types/${encodeURIComponent(typeSlug)}/items/${encodeURIComponent(itemSlug)}`
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readError(res, `Failed to load item (${res.status})`));
  return res.json();
}

/** POST /api/content-types/{typeSlug}/items — create or update, keyed on slug. */
export async function saveContentItem(
  typeSlug: string,
  payload: SaveContentItemRequest
): Promise<ContentItem> {
  const res = await fetch(`${API_BASE}/api/content-types/${encodeURIComponent(typeSlug)}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res, `Failed to save item (${res.status})`));
  return res.json();
}

/** DELETE /api/content-types/{typeSlug}/items/{itemSlug} */
export async function deleteContentItem(typeSlug: string, itemSlug: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/content-types/${encodeURIComponent(typeSlug)}/items/${encodeURIComponent(itemSlug)}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, `Failed to delete item (${res.status})`));
}

/** POST /api/upload — uploads an image file and returns its absolute URL. */
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await readError(res, `Upload failed (${res.status})`));
  const { url } = (await res.json()) as { url: string };
  return url;
}

/**
 * Parse a content item's stringified DataJson into its field values.
 * Falls back to an empty object so the editor never crashes on bad data.
 */
export function parseFieldValues(dataJson: string | null | undefined): FieldValues {
  if (!dataJson) return {};
  try {
    const parsed: unknown = JSON.parse(dataJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as FieldValues)
      : {};
  } catch {
    return {};
  }
}

/**
 * Coerce a single Layout field value into Puck `Data`.
 * Falls back to an empty document so the editor/renderer never crash.
 */
export function toPuckData(value: unknown): Data {
  const empty = { content: [], root: {} } as Data;
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  return value as Data;
}
