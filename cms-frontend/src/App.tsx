import { Routes, Route } from "react-router-dom";
import RequireAuth from "./components/RequireAuth";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import UsersPage from "./pages/UsersPage";
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

      {/* Public live page (keep last — it's the catch-all slug route) */}
      <Route path="/:slug" element={<LivePage />} />
    </Routes>
  );
}
