import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { getSession, type Role } from "../lib/auth";
import { ui } from "../lib/ui";

interface Props {
  children: ReactNode;
  /** When given, the session's role must be one of these. */
  roles?: Role[];
}

/**
 * Route guard for the admin screens. This is a usability measure, not a security
 * boundary — every rule it mirrors is enforced by the API, which is what actually
 * protects the data.
 */
export default function RequireAuth({ children, roles }: Props) {
  const location = useLocation();
  const session = getSession();

  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (roles && !roles.includes(session.role)) {
    return (
      <div style={ui.page}>
        <h1>Not authorized</h1>
        <p style={ui.muted}>
          This page requires the {roles.join(" or ")} role. You are signed in as{" "}
          <strong>{session.email}</strong> ({session.role}).
        </p>
        <Link to="/">← Back to dashboard</Link>
      </div>
    );
  }

  return <>{children}</>;
}
