import { useEffect, useRef, useState } from "react";
import { createUser, deleteUser, listUsers, updateUser, type UserSummary } from "../lib/api";
import { getSession, type Role } from "../lib/auth";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import Alert from "../components/Alert";
import Loading from "../components/Loading";
import Icon from "../components/Icon";
import { exactTime, relativeTime } from "../lib/ui";

const ROLES: Role[] = ["Admin", "Editor", "Viewer"];

const ROLE_HELP: Record<Role, string> = {
  Admin: "Manages schemas, users and content.",
  Editor: "Creates and edits content.",
  Viewer: "Reads everything, including drafts, but changes nothing.",
};

/**
 * Admin-only user administration at /admin/users.
 *
 * The API refuses to delete or demote the last remaining Admin and to delete your own
 * account, so those errors surface here rather than being pre-empted in the UI.
 */
export default function UsersPage() {
  const currentUser = getSession();

  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("Editor");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);

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
        if (!cancelled) {
          setUsers([]);
          setError(err instanceof Error ? err.message : "Failed to load users");
        }
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
      setMessage(`Created ${email}.`);
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

  if (!users) {
    return (
      <AppLayout crumbs={[{ label: "Users" }]}>
        <Loading label="Loading users…" />
      </AppLayout>
    );
  }

  return (
    <AppLayout crumbs={[{ label: "Users" }]}>
      <PageHeader
        title="Users"
        description="Admins manage schemas and users. Editors create and edit content. Viewers can read everything, including drafts, but change nothing."
        actions={
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => emailInput.current?.focus()}
          >
            <Icon name="plus" size={16} />
            New user
          </button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">User</th>
              <th scope="col">Role</th>
              <th scope="col">Created</th>
              <th scope="col">
                <span className="muted">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="avatar" aria-hidden="true">
                      {user.email.slice(0, 1)}
                    </span>
                    <span>
                      <span style={{ fontWeight: 560 }}>{user.email}</span>
                      {user.email === currentUser?.email && (
                        <span className="badge badge--brand" style={{ marginLeft: 8 }}>
                          you
                        </span>
                      )}
                    </span>
                  </span>
                </td>

                <td className="is-tight">
                  <select
                    value={user.role}
                    aria-label={`Role for ${user.email}`}
                    title={ROLE_HELP[user.role]}
                    onChange={(e) => handleRoleChange(user, e.target.value as Role)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>

                <td className="is-tight muted" title={exactTime(user.createdAt)}>
                  {relativeTime(user.createdAt)}
                </td>

                <td className="is-tight">
                  <span className="btn-row">
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => handlePasswordReset(user)}
                    >
                      <Icon name="key" size={15} />
                      Reset password
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--icon"
                      onClick={() => handleDelete(user)}
                    >
                      <Icon name="trash" size={16} label={`Delete ${user.email}`} />
                    </button>
                  </span>
                </td>
              </tr>
            ))}

            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No users loaded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="card section">
        <div className="card__header">
          <span className="card__title">New user</span>
          <span className="card__hint">{ROLE_HELP[role]}</span>
        </div>

        <form onSubmit={handleCreate}>
          <div className="card__body">
            <div className="form-grid">
              <label className="field">
                <span className="field__label">Email</span>
                <input
                  ref={emailInput}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="editor@example.com"
                  autoComplete="off"
                  required
                />
              </label>

              <label className="field">
                <span className="field__label">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
                <span className="field__hint">At least 8 characters.</span>
              </label>

              <label className="field">
                <span className="field__label">Role</span>
                <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="card__footer">
            <button type="submit" disabled={busy} className="btn btn--primary">
              {busy ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      </section>
    </AppLayout>
  );
}
