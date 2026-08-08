import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser,
  type UserSummary,
} from "../lib/api";
import { getSession, type Role } from "../lib/auth";
import SessionBar from "../components/SessionBar";
import { ui } from "../lib/ui";

const ROLES: Role[] = ["Admin", "Editor", "Viewer"];

/**
 * Admin-only user administration at /admin/users.
 *
 * The API refuses to delete or demote the last remaining Admin and to delete your own
 * account, so those errors surface here rather than being pre-empted in the UI.
 */
export default function UsersPage() {
  const currentUser = getSession();

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("Editor");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setUsers(await listUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loaded = await listUsers();
        if (!cancelled) setUsers(loaded);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load users");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);

    try {
      await createUser({ email, password, role });
      setEmail("");
      setPassword("");
      setRole("Editor");
      setMessage("User created.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(user: UserSummary, nextRole: Role) {
    setError("");
    setMessage("");
    try {
      await updateUser(user.id, { role: nextRole });
      setMessage(`${user.email} is now ${nextRole}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change role");
      await refresh();
    }
  }

  async function handlePasswordReset(user: UserSummary) {
    const next = prompt(`New password for ${user.email} (at least 8 characters):`);
    if (!next) return;

    setError("");
    setMessage("");
    try {
      await updateUser(user.id, { role: user.role, password: next });
      setMessage(`Password updated for ${user.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    }
  }

  async function handleDelete(user: UserSummary) {
    if (!confirm(`Delete ${user.email}?`)) return;

    setError("");
    setMessage("");
    try {
      await deleteUser(user.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    }
  }

  return (
    <div style={ui.page}>
      <SessionBar />

      <Link to="/" style={{ ...ui.muted, textDecoration: "none" }}>
        ← Dashboard
      </Link>

      <h1>Users</h1>
      <p style={ui.muted}>
        Admins manage schemas and users. Editors create and edit content. Viewers can read
        everything, including drafts, but change nothing.
      </p>

      {error && <p style={ui.error}>{error}</p>}
      {message && <p style={ui.muted}>{message}</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {users.map((user) => (
          <li
            key={user.id}
            style={{
              ...ui.card,
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <strong>{user.email}</strong>
            {user.email === currentUser?.email && <span style={ui.muted}>(you)</span>}

            <select
              value={user.role}
              onChange={(e) => handleRoleChange(user, e.target.value as Role)}
              style={ui.input}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <button onClick={() => handlePasswordReset(user)} style={ui.secondaryButton}>
              Reset password
            </button>

            <button
              onClick={() => handleDelete(user)}
              style={{ ...ui.secondaryButton, marginLeft: "auto" }}
            >
              Delete
            </button>
          </li>
        ))}
        {users.length === 0 && <li style={ui.muted}>No users loaded.</li>}
      </ul>

      <hr style={{ margin: "24px 0" }} />

      <h2>New user</h2>
      <form onSubmit={handleCreate} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 4 }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={ui.input}
          />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            style={ui.input}
          />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            style={ui.input}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" disabled={busy} style={{ ...ui.primaryButton, justifySelf: "start" }}>
          {busy ? "Creating…" : "Create user"}
        </button>
      </form>
    </div>
  );
}
