import { beforeEach, describe, expect, it } from "vitest";
import {
  canEditContent,
  canManageSchema,
  clearSession,
  getSession,
  getToken,
  hasRole,
  isSignedIn,
  setToken,
} from "./auth";
import { makeToken, signIn } from "../test/auth";

describe("token storage", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a token", () => {
    setToken("a.b.c");

    expect(getToken()).toBe("a.b.c");
    expect(localStorage.getItem("cms_token")).toBe("a.b.c");
  });

  it("is empty before anyone signs in", () => {
    expect(getToken()).toBeNull();
  });

  it("clearing removes the token", () => {
    setToken("a.b.c");
    clearSession();

    expect(getToken()).toBeNull();
  });
});

describe("getSession", () => {
  beforeEach(() => localStorage.clear());

  it("reads the identity out of the token", () => {
    signIn({ email: "editor@cms.local", role: "Editor" });

    const session = getSession();

    expect(session).not.toBeNull();
    expect(session!.email).toBe("editor@cms.local");
    expect(session!.role).toBe("Editor");
    expect(session!.expiresAt).toBeGreaterThan(Date.now() / 1000);
  });

  it("is null when nobody is signed in", () => {
    expect(getSession()).toBeNull();
    expect(isSignedIn()).toBe(false);
  });

  it("treats an expired token as no session and clears it", () => {
    signIn({ expiresInSeconds: -60 });

    expect(getSession()).toBeNull();
    // Dropped rather than left behind, so it is never attached to a later request —
    // an expired token would turn an anonymous page view into a 401.
    expect(getToken()).toBeNull();
  });

  it("is null for a token that is not readable", () => {
    localStorage.setItem("cms_token", "not-a-jwt");

    expect(getSession()).toBeNull();
  });

  it("is null for a token whose payload is not JSON", () => {
    localStorage.setItem("cms_token", `${btoa("{}")}.${btoa("not json")}.sig`);

    expect(getSession()).toBeNull();
  });

  it("is null when the payload carries no role", () => {
    // Without a role there is nothing to gate the UI on, so this is not a usable session.
    const payload = btoa(JSON.stringify({ email: "x@y.z", exp: 9999999999 }));
    localStorage.setItem("cms_token", `${btoa("{}")}.${payload}.sig`);

    expect(getSession()).toBeNull();
  });

  it("is null when the payload carries no expiry", () => {
    const payload = btoa(JSON.stringify({ email: "x@y.z", role: "Admin" }));
    localStorage.setItem("cms_token", `${btoa("{}")}.${payload}.sig`);

    expect(getSession()).toBeNull();
  });

  it("decodes a payload that was base64url encoded", () => {
    // "+" and "/" become "-" and "_" in a real token, and the padding is stripped;
    // atob understands none of that without the conversion getSession does.
    const token = makeToken({ email: "someone+tagged@example.com", role: "Viewer" });
    localStorage.setItem("cms_token", token);

    expect(getSession()?.email).toBe("someone+tagged@example.com");
  });

  it("falls back to an empty email rather than failing", () => {
    const payload = btoa(JSON.stringify({ role: "Admin", exp: 9999999999 }));
    localStorage.setItem("cms_token", `${btoa("{}")}.${payload}.sig`);

    expect(getSession()?.email).toBe("");
  });
});

describe("role checks", () => {
  beforeEach(() => localStorage.clear());

  it("matches any of the roles given", () => {
    signIn({ role: "Editor" });

    expect(hasRole("Editor")).toBe(true);
    expect(hasRole("Admin", "Editor")).toBe(true);
    expect(hasRole("Admin")).toBe(false);
  });

  it("is false with no session at all", () => {
    expect(hasRole("Admin", "Editor", "Viewer")).toBe(false);
  });

  it.each([
    ["Admin", true, true],
    ["Editor", true, false],
    ["Viewer", false, false],
  ] as const)("%s can edit content: %s, manage schema: %s", (role, edits, manages) => {
    signIn({ role });

    expect(canEditContent()).toBe(edits);
    expect(canManageSchema()).toBe(manages);
  });

  it("grants nothing once the token has expired", () => {
    signIn({ role: "Admin", expiresInSeconds: -1 });

    expect(canEditContent()).toBe(false);
    expect(canManageSchema()).toBe(false);
  });
});
