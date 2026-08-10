/**
 * Small presentation helpers shared by the screens.
 *
 * Styling itself lives in CSS (src/index.css for tokens and base elements,
 * src/styles/components.css for component classes) rather than in inline style objects,
 * so hover, focus and responsive behaviour are expressible. What remains here is the
 * logic that decides *which* class or string to render.
 */

/** Class for a content item's draft/published badge. */
export function statusClass(status: string): string {
  return status === "Published" ? "badge badge--success" : "badge";
}

/** Convert a human-entered name into the slug format the API accepts. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Human-readable file size, since raw byte counts are useless when scanning a list. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A timestamp as "3 minutes ago". Editors care how recently something changed far more
 * than about its exact clock time, which stays available as the element's tooltip.
 */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";

  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  // Timestamps come from the API in UTC; a clock skew of a few seconds should read as
  // "just now" rather than as a moment in the future.
  const elapsed = Math.max(0, Date.now() - then);

  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return plural(Math.round(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return plural(Math.round(elapsed / HOUR), "hour");
  if (elapsed < 30 * DAY) return plural(Math.round(elapsed / DAY), "day");

  return new Date(iso).toLocaleDateString();
}

/** The full timestamp, for the `title` of whatever `relativeTime` is rendered into. */
export function exactTime(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
}
