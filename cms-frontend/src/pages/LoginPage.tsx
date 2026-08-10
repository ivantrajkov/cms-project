import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { login } from "../lib/api";
import Alert from "../components/Alert";
import Icon from "../components/Icon";

/** Sign-in screen at /login. Redirects back to wherever the user was heading. */
export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      await login(email, password);
      // replace: the login screen should not sit in the back-button history.
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <span className="brand__mark" aria-hidden="true">
            <Icon name="spark" size={18} />
          </span>
          Content Studio
        </div>

        <h1 className="auth__title">Sign in</h1>
        <p className="auth__desc">Use your CMS account to manage content and pages.</p>

        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            <span className="field__label">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="you@example.com"
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field__label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </label>

          {error && <Alert tone="error">{error}</Alert>}

          <button type="submit" disabled={busy} className="btn btn--primary auth__submit">
            {busy ? (
              <>
                <span className="spinner" style={{ borderColor: "rgb(255 255 255 / 40%)", borderTopColor: "#fff" }} />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
