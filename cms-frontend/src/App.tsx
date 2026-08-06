import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import ContentTypesPage from "./pages/ContentTypesPage";
import ContentTypeItemsPage from "./pages/ContentTypeItemsPage";
import ContentItemEditorPage from "./pages/ContentItemEditorPage";
import LivePage from "./pages/LivePage";

export default function App() {
  return (
    <Routes>
      {/* Dashboard */}
      <Route path="/" element={<HomePage />} />

      {/* Admin — content type schemas and their items */}
      <Route path="/admin/content-types" element={<ContentTypesPage />} />
      <Route path="/admin/content-types/:typeSlug" element={<ContentTypeItemsPage />} />
      <Route
        path="/admin/content-types/:typeSlug/items/:itemSlug"
        element={<ContentItemEditorPage />}
      />

      {/* Public live page (keep last — it's the catch-all slug route) */}
      <Route path="/:slug" element={<LivePage />} />
    </Routes>
  );
}
