import { afterEach, describe, expect, it, vi } from "vitest";
import { exactTime, formatBytes, relativeTime, slugify, statusClass } from "./ui";

describe("statusClass", () => {
  it("marks a published item as a success badge", () => {
    expect(statusClass("Published")).toBe("badge badge--success");
  });

  it("leaves anything else as a plain badge", () => {
    expect(statusClass("Draft")).toBe("badge");
    expect(statusClass("")).toBe("badge");
  });
});

describe("slugify", () => {
  it("turns a typed name into the format the API accepts", () => {
    expect(slugify("Blog Post")).toBe("blog-post");
    expect(slugify("About Us!")).toBe("about-us");
  });

  it("collapses runs of punctuation into a single hyphen", () => {
    // The API rejects doubled hyphens, so this cannot leave one behind.
    expect(slugify("Hello --- World")).toBe("hello-world");
    expect(slugify("a  &  b")).toBe("a-b");
  });

  it("trims the hyphens a leading or trailing symbol would produce", () => {
    expect(slugify("  Spaced  ")).toBe("spaced");
    expect(slugify("!Bang!")).toBe("bang");
  });

  it("drops characters that have no slug equivalent", () => {
    expect(slugify("Café")).toBe("caf");
    expect(slugify("!!!")).toBe("");
  });
});

describe("formatBytes", () => {
  it("keeps small files in bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("switches to KB at a kilobyte", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("switches to MB at a megabyte", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");

  function at(iso: string) {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    return relativeTime(iso);
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says 'just now' inside the first minute", () => {
    expect(at("2026-08-10T11:59:30.000Z")).toBe("just now");
  });

  it("counts minutes, then hours, then days", () => {
    expect(at("2026-08-10T11:55:00.000Z")).toBe("5 minutes ago");
    expect(at("2026-08-10T09:00:00.000Z")).toBe("3 hours ago");
    expect(at("2026-08-08T12:00:00.000Z")).toBe("2 days ago");
  });

  it("uses the singular for exactly one unit", () => {
    expect(at("2026-08-10T11:59:00.000Z")).toBe("1 minute ago");
    expect(at("2026-08-10T11:00:00.000Z")).toBe("1 hour ago");
    expect(at("2026-08-09T12:00:00.000Z")).toBe("1 day ago");
  });

  it("falls back to a date once something is a month old", () => {
    const text = at("2026-05-01T12:00:00.000Z");

    expect(text).not.toMatch(/ago/);
    expect(text).toBe(new Date("2026-05-01T12:00:00.000Z").toLocaleDateString());
  });

  it("reads a timestamp slightly in the future as 'just now'", () => {
    // A few seconds of clock skew between the API and the browser should not produce
    // "in -3 seconds" or a negative count.
    expect(at("2026-08-10T12:00:05.000Z")).toBe("just now");
  });

  it("renders nothing for a missing or unparseable timestamp", () => {
    expect(relativeTime(null)).toBe("");
    expect(relativeTime(undefined)).toBe("");
    expect(relativeTime("")).toBe("");
    expect(relativeTime("not a date")).toBe("");
  });
});

describe("exactTime", () => {
  it("gives the full timestamp for a tooltip", () => {
    const iso = "2026-08-10T12:00:00.000Z";

    expect(exactTime(iso)).toBe(new Date(iso).toLocaleString());
  });

  it("is undefined when there is nothing to show", () => {
    // undefined rather than "", so the caller renders no title attribute at all.
    expect(exactTime(null)).toBeUndefined();
    expect(exactTime(undefined)).toBeUndefined();
    expect(exactTime("not a date")).toBeUndefined();
  });
});
