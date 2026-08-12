import type { Role } from "../lib/auth";

const HOUR_IN_SECONDS = 3600;

interface TokenOptions {
  email?: string;
  role?: Role;
  /** Seconds from now until the token expires; negative for an already-expired one. */
  expiresInSeconds?: number;
}

/**
 * A JWT the frontend can decode.
 *
 * The signature is a placeholder on purpose: nothing in the browser verifies it — the
 * API is what enforces trust — so a test token only has to carry a readable payload.
 */
export function makeToken({
  email = "admin@cms.local",
  role = "Admin",
  expiresInSeconds = HOUR_IN_SECONDS,
}: TokenOptions = {}): string {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      sub: "11111111-2222-3333-4444-555555555555",
      email,
      role,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    })
  );

  return `${header}.${payload}.test-signature`;
}

/** Puts a token in storage, so the code under test sees an active session. */
export function signIn(options: TokenOptions = {}): string {
  const token = makeToken(options);
  localStorage.setItem("cms_token", token);
  return token;
}

function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
