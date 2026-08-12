import { screen } from "@testing-library/react";
import { useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import RequireAuth from "./RequireAuth";
import { renderAtRoute } from "../test/render";
import { signIn } from "../test/auth";

/** Stands in for the login screen and reports where the guard sent the user. */
function LoginStub() {
  const location = useLocation();
  return <div>login screen for {location.search}</div>;
}

const guarded = <RequireAuth>
  <p>Secret dashboard</p>
</RequireAuth>;

describe("RequireAuth", () => {
  beforeEach(() => localStorage.clear());

  it("shows the page to a signed-in user", () => {
    signIn({ role: "Editor" });

    renderAtRoute("/admin/media", guarded);

    expect(screen.getByText("Secret dashboard")).toBeInTheDocument();
  });

  it("sends a signed-out visitor to the login screen, remembering where they were", () => {
    renderAtRoute("/admin/media", guarded, {
      others: [{ path: "/login", element: <LoginStub /> }],
    });

    // The `next` parameter is what returns them to the page they asked for after signing in.
    expect(screen.getByText("login screen for ?next=%2Fadmin%2Fmedia")).toBeInTheDocument();
    expect(screen.queryByText("Secret dashboard")).not.toBeInTheDocument();
  });

  it("keeps the query string of the page they were heading to", () => {
    renderAtRoute("/admin/content-types", guarded, {
      route: "/admin/content-types?filter=draft",
      others: [{ path: "/login", element: <LoginStub /> }],
    });

    expect(
      screen.getByText("login screen for ?next=%2Fadmin%2Fcontent-types%3Ffilter%3Ddraft")
    ).toBeInTheDocument();
  });

  it("treats an expired session as signed out", () => {
    signIn({ expiresInSeconds: -1 });

    renderAtRoute("/admin/media", guarded, {
      others: [{ path: "/login", element: <LoginStub /> }],
    });

    expect(screen.queryByText("Secret dashboard")).not.toBeInTheDocument();
  });

  it("explains itself when the role is wrong instead of pretending the page is missing", () => {
    signIn({ email: "viewer@cms.local", role: "Viewer" });

    renderAtRoute(
      "/admin/users",
      <RequireAuth roles={["Admin"]}>
        <p>User admin</p>
      </RequireAuth>
    );

    expect(screen.queryByText("User admin")).not.toBeInTheDocument();
    expect(screen.getByText("Not authorized")).toBeInTheDocument();
    // Names the role needed and who they are signed in as, so the fix is obvious.
    expect(screen.getByText("This page needs the Admin role")).toBeInTheDocument();
    expect(screen.getByText(/viewer@cms.local \(Viewer\)/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to dashboard/ })).toHaveAttribute("href", "/");
  });

  it("lets a permitted role through", () => {
    signIn({ role: "Admin" });

    renderAtRoute(
      "/admin/users",
      <RequireAuth roles={["Admin"]}>
        <p>User admin</p>
      </RequireAuth>
    );

    expect(screen.getByText("User admin")).toBeInTheDocument();
  });

  it("accepts any of several permitted roles", () => {
    signIn({ role: "Editor" });

    renderAtRoute(
      "/admin/content-types",
      <RequireAuth roles={["Admin", "Editor"]}>
        <p>Schemas</p>
      </RequireAuth>
    );

    expect(screen.getByText("Schemas")).toBeInTheDocument();
  });
});
