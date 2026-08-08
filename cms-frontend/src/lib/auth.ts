export type Role = "Admin" | "Editor" | "Viewer";

export interface Session {
  token: string;
  email: string;
  role: Role;
  /** Epoch seconds, taken from the token's own `exp` claim. */
  expiresAt: number;
}

const STORAGE_KEY = "cms_token";

/**
 * The bearer token is kept in localStorage so a refresh keeps you signed in and the API
 * can stay stateless. The trade-off is that a successful XSS could read it; an httpOnly
 * cookie would prevent that at the cost of CSRF handling and browser-only clients.
 */
export function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

interface JwtPayload {
  email?: string;
  role?: string;
  exp?: number;
}

/** Decodes a JWT payload without verifying it — the API is what actually enforces trust. */
function decodePayload(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    // base64url -> base64, then decode.
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * The current session, or null when absent, unreadable or expired. Reading the role from
 * the token is only for deciding what UI to show — every rule is enforced server-side.
 */
export function getSession(): Session | null {
  const token = getToken();
  if (!token) return null;

  const payload = decodePayload(token);
  if (!payload?.exp || !payload.role) return null;

  if (payload.exp * 1000 <= Date.now()) {
    clearSession();
    return null;
  }

  return {
    token,
    email: payload.email ?? "",
    role: payload.role as Role,
    expiresAt: payload.exp,
  };
}

export function isSignedIn(): boolean {
  return getSession() !== null;
}

/** True when the current session holds any of the given roles. */
export function hasRole(...roles: Role[]): boolean {
  const session = getSession();
  return session !== null && roles.includes(session.role);
}

/** Roles permitted to create, edit and delete content items. */
export function canEditContent(): boolean {
  return hasRole("Admin", "Editor");
}

/** Only an Admin may change schemas or manage users. */
export function canManageSchema(): boolean {
  return hasRole("Admin");
}
