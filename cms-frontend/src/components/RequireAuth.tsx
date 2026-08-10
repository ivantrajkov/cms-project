import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getSession, type Role } from "../lib/auth";
import NotFound from "./NotFound";

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
      <NotFound
        code="Not authorized"
        title={`This page needs the ${roles.join(" or ")} role`}
        text={`You are signed in as ${session.email} (${session.role}).`}
        action={{ to: "/", label: "Back to dashboard" }}
      />
    );
  }

  return <>{children}</>;
}
