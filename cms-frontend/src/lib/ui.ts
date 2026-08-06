import type { CSSProperties } from "react";

/**
 * Shared inline styles for the admin screens. The project deliberately has no CSS
 * framework, so these keep the palette and spacing consistent across pages that
 * would otherwise repeat the same style objects.
 */
export const ui = {
  page: {
    maxWidth: 720,
    margin: "40px auto",
    padding: "0 16px",
  } satisfies CSSProperties,

  input: {
    padding: "6px 8px",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
  } satisfies CSSProperties,

  primaryButton: {
    padding: "6px 12px",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  } satisfies CSSProperties,

  secondaryButton: {
    padding: "6px 12px",
    background: "#fff",
    color: "#374151",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    cursor: "pointer",
  } satisfies CSSProperties,

  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: 16,
  } satisfies CSSProperties,

  muted: { color: "#6b7280" } satisfies CSSProperties,

  error: { color: "#dc2626" } satisfies CSSProperties,
} as const;

/** Badge colours for a content item's draft/published state. */
export function statusBadge(status: string): CSSProperties {
  const published = status === "Published";
  return {
    fontSize: 12,
    padding: "2px 8px",
    borderRadius: 999,
    background: published ? "#dcfce7" : "#f3f4f6",
    color: published ? "#166534" : "#6b7280",
  };
}

/** Convert a human-entered name into the slug format the API accepts. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
