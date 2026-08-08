import { Link, useNavigate } from "react-router-dom";
import { clearSession, getSession } from "../lib/auth";
import { statusBadge, ui } from "../lib/ui";

/** Shows who is signed in, with a link to user administration and a logout button. */
export default function SessionBar() {
  const navigate = useNavigate();
  const session = getSession();

  if (!session) return null;

  function handleLogout() {
    clearSession();
    navigate("/login", { replace: true });
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: "1px solid #e5e7eb",
      }}
    >
      <span style={ui.muted}>
        Signed in as <strong>{session.email}</strong>
      </span>

      <span style={statusBadge(session.role === "Admin" ? "Published" : "")}>{session.role}</span>

      {session.role === "Admin" && (
        <Link to="/admin/users" style={ui.muted}>
          Users
        </Link>
      )}

      <button onClick={handleLogout} style={{ ...ui.secondaryButton, marginLeft: "auto" }}>
        Log out
      </button>
    </div>
  );
}
