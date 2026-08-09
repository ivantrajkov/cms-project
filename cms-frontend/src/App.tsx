import { Routes, Route } from "react-router-dom";
import RequireAuth from "./components/RequireAuth";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import UsersPage from "./pages/UsersPage";
import MediaPage from "./pages/MediaPage";
import PublicItemPage from "./pages/PublicItemPage";
import ContentTypesPage from "./pages/ContentTypesPage";
import ContentTypeItemsPage from "./pages/ContentTypeItemsPage";
import ContentItemEditorPage from "./pages/ContentItemEditorPage";
import LivePage from "./pages/LivePage";

export default function App() {
  return (
    <Routes>
      {/* Public sign-in */}
      <Route path="/login" element={<LoginPage />} />

      {/* Dashboard — lists content and links to editors, so it requires a session */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />

      {/* Admin — user administration */}
      <Route
        path="/admin/users"
        element={
          <RequireAuth roles={["Admin"]}>
            <UsersPage />
          </RequireAuth>
        }
      />

      {/* Admin — media library */}
      <Route
        path="/admin/media"
        element={
          <RequireAuth>
            <MediaPage />
          </RequireAuth>
        }
      />

      {/* Admin — content type schemas and their items */}
      <Route
        path="/admin/content-types"
        element={
          <RequireAuth>
            <ContentTypesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/content-types/:typeSlug"
        element={
          <RequireAuth>
            <ContentTypeItemsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/content-types/:typeSlug/items/:itemSlug"
        element={
          <RequireAuth>
            <ContentItemEditorPage />
          </RequireAuth>
        }
      />

      {/* Public detail page for any content type. Two segments, so it cannot collide with
          the one-segment page route below; React Router ranks the static /admin/* routes
          above this dynamic pair. */}
      <Route path="/:typeSlug/:itemSlug" element={<PublicItemPage />} />

      {/* Public live page (keep last — it's the catch-all slug route) */}
      <Route path="/:slug" element={<LivePage />} />
    </Routes>
  );
}
