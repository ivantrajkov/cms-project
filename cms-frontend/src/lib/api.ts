import type { Data } from "@measured/puck";
import { clearSession, getSession, setToken, type Role } from "./auth";

// The .NET API. Use the HTTP launch profile (dotnet run --launch-profile http)
// so there is no HTTPS-redirect/self-signed-cert friction during local dev.
const API_BASE = "http://localhost:5051";

/** Slug of the built-in content type that the original Page entity was migrated into. */
export const PAGE_TYPE_SLUG = "page";

export type FieldType =
  | "Text"
  | "Number"
  | "Boolean"
  | "Date"
  | "Layout"
  | "Image"
  | "Reference";

export const FIELD_TYPES: FieldType[] = [
  "Text",
  "Number",
  "Boolean",
  "Date",
  "Layout",
  "Image",
  "Reference",
];

export type ContentItemStatus = "Draft" | "Published";

export interface FieldDefinition {
  name: string;
  type: FieldType;
  required: boolean;
  /** For a Reference field, the slug of the content type it points at. */
  targetType?: string | null;
}

export interface MediaAsset {
  id: string;
  fileName: string;
  originalFileName: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  altText: string;
  uploadedAt: string;
}

export interface UploadResult {
  url: string;
  id: string;
  originalFileName: string;
  sizeBytes: number;
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
  /** UTC ISO timestamp of the last save. */
  updatedAt: string;
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
  /** UTC ISO timestamp of the last save. */
  updatedAt: string;
}

export interface SaveContentItemRequest {
  slug: string;
  status: ContentItemStatus;
  dataJson: string;
}

/** A content item's decoded field values, keyed by field name. */
export type FieldValues = Record<string, unknown>;

export interface LoginResponse {
  token: string;
  email: string;
  role: Role;
  expiresAt: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  role: Role;
}

export interface UserSummary {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  role: Role;
}

export interface UpdateUserRequest {
  role: Role;
  /** Blank or omitted leaves the existing password unchanged. */
  password?: string;
}

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

interface FetchOptions {
  /** Set on the login call, where a 401 is an expected answer rather than a dead session. */
  allowUnauthorized?: boolean;
}

/**
 * Single entry point for every API call.
 *
 * The token is taken from `getSession()` rather than raw storage, so an expired token is
 * never sent — otherwise a stale token would turn an anonymous public page view into a
 * 401 and bounce a visitor to the login screen.
 */
async function apiFetch(
  path: string,
  init: RequestInit = {},
  options: FetchOptions = {}
): Promise<Response> {
  const session = getSession();

  const headers = new Headers(init.headers);
  if (session) headers.set("Authorization", `Bearer ${session.token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  // A 401 means the session is gone or was never valid: drop it and send the user to
  // the login screen, remembering where they were.
  if (res.status === 401 && !options.allowUnauthorized) {
    clearSession();
    if (!window.location.pathname.startsWith("/login")) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.assign(`/login?next=${next}`);
    }
  }

  return res;
}

// --- Auth ---------------------------------------------------------------

/** POST /api/auth/login — on success the token is stored for subsequent calls. */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await apiFetch(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
    { allowUnauthorized: true }
  );

  if (!res.ok) throw new Error(await readError(res, `Login failed (${res.status})`));

  const session = (await res.json()) as LoginResponse;
  setToken(session.token);
  return session;
}

/** GET /api/auth/me */
export async function getMe(): Promise<CurrentUser> {
  const res = await apiFetch("/api/auth/me");
  if (!res.ok) throw new Error(await readError(res, `Failed to load account (${res.status})`));
  return res.json();
}

// --- Users (Admin only) -------------------------------------------------

export async function listUsers(): Promise<UserSummary[]> {
  const res = await apiFetch("/api/users");
  if (!res.ok) throw new Error(await readError(res, `Failed to list users (${res.status})`));
  return res.json();
}

export async function createUser(payload: CreateUserRequest): Promise<UserSummary> {
  const res = await apiFetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res, `Failed to create user (${res.status})`));
  return res.json();
}

export async function updateUser(id: string, payload: UpdateUserRequest): Promise<UserSummary> {
  const res = await apiFetch(`/api/users/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res, `Failed to update user (${res.status})`));
  return res.json();
}

export async function deleteUser(id: string): Promise<void> {
  const res = await apiFetch(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res, `Failed to delete user (${res.status})`));
}

// --- Content types ------------------------------------------------------

/** GET /api/content-types */
export async function listContentTypes(): Promise<ContentTypeSummary[]> {
  const res = await apiFetch("/api/content-types");
  if (!res.ok) throw new Error(await readError(res, `Failed to list content types (${res.status})`));
  return res.json();
}

/** GET /api/content-types/{slug} — returns null on 404. */
export async function getContentType(slug: string): Promise<ContentType | null> {
  const res = await apiFetch(`/api/content-types/${encodeURIComponent(slug)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readError(res, `Failed to load content type (${res.status})`));
  return res.json();
}

/** POST /api/content-types — create or update, keyed on slug. Admin only. */
export async function saveContentType(payload: SaveContentTypeRequest): Promise<ContentType> {
  const res = await apiFetch("/api/content-types", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res, `Failed to save content type (${res.status})`));
  return res.json();
}

/** DELETE /api/content-types/{slug} — refused by the API if the type still has items. */
export async function deleteContentType(slug: string): Promise<void> {
  const res = await apiFetch(`/api/content-types/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readError(res, `Failed to delete content type (${res.status})`));
}

// --- Content items ------------------------------------------------------

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
  const res = await apiFetch(
    `/api/content-types/${encodeURIComponent(typeSlug)}/items${suffix}`
  );
  if (!res.ok) throw new Error(await readError(res, `Failed to list items (${res.status})`));
  return res.json();
}

/** GET /api/content-types/{typeSlug}/items/{itemSlug} — returns null on 404. */
export async function getContentItem(
  typeSlug: string,
  itemSlug: string
): Promise<ContentItem | null> {
  const res = await apiFetch(
    `/api/content-types/${encodeURIComponent(typeSlug)}/items/${encodeURIComponent(itemSlug)}`
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
  const res = await apiFetch(`/api/content-types/${encodeURIComponent(typeSlug)}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res, `Failed to save item (${res.status})`));
  return res.json();
}

/** DELETE /api/content-types/{typeSlug}/items/{itemSlug} */
export async function deleteContentItem(typeSlug: string, itemSlug: string): Promise<void> {
  const res = await apiFetch(
    `/api/content-types/${encodeURIComponent(typeSlug)}/items/${encodeURIComponent(itemSlug)}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await readError(res, `Failed to delete item (${res.status})`));
}

// --- Media -------------------------------------------------------------

/** POST /api/upload — uploads a file and returns the created media asset's id and URL. */
export async function uploadMedia(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);

  // No explicit Content-Type: the browser must set the multipart boundary itself.
  const res = await apiFetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error(await readError(res, `Upload failed (${res.status})`));
  return res.json();
}

/** Uploads and returns only the URL — kept for the Puck image field, which stores URLs. */
export async function uploadImage(file: File): Promise<string> {
  const { url } = await uploadMedia(file);
  return url;
}

/** GET /api/media — anonymous, so public pages can resolve an Image field's id. */
export async function listMedia(): Promise<MediaAsset[]> {
  const res = await apiFetch("/api/media");
  if (!res.ok) throw new Error(await readError(res, `Failed to list media (${res.status})`));
  return res.json();
}

/** GET /api/media/{id} — returns null on 404. */
export async function getMedia(id: string): Promise<MediaAsset | null> {
  const res = await apiFetch(`/api/media/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readError(res, `Failed to load media (${res.status})`));
  return res.json();
}

/** POST /api/media/{id} — update alt text. */
export async function updateMedia(id: string, altText: string): Promise<MediaAsset> {
  const res = await apiFetch(`/api/media/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ altText }),
  });
  if (!res.ok) throw new Error(await readError(res, `Failed to update media (${res.status})`));
  return res.json();
}

/** DELETE /api/media/{id} — refused by the API while any content item still uses it. */
export async function deleteMedia(id: string): Promise<void> {
  const res = await apiFetch(`/api/media/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res, `Failed to delete media (${res.status})`));
}

// --- Helpers ------------------------------------------------------------

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
 * A human-readable label for an item: the value of its content type's first Text field,
 * falling back to the slug. Used wherever an item has to be named rather than rendered —
 * reference pickers, reference links, and card headings.
 */
export function itemLabel(
  type: ContentType | null | undefined,
  item: Pick<ContentItemSummary, "slug" | "dataJson">
): string {
  const headingField = type?.fields.find((f) => f.type === "Text");

  if (headingField) {
    const value = parseFieldValues(item.dataJson)[headingField.name];
    if (typeof value === "string" && value.trim() !== "") return value;
  }

  return item.slug;
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
